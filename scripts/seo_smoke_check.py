"""Small dependency-free SEO smoke test for local, CI, and post-deploy checks."""

from __future__ import annotations

import argparse
from html.parser import HTMLParser
import json
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen
from xml.etree import ElementTree


class HeadInspector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.canonical = None
        self.robots = None
        self.description = None
        self.h1 = 0
        self.links = 0
        self.schemas = 0

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "link" and values.get("rel") == "canonical":
            self.canonical = values.get("href")
        elif tag == "meta" and values.get("name") == "robots":
            self.robots = values.get("content")
        elif tag == "meta" and values.get("name") == "description":
            self.description = values.get("content")
        elif tag == "h1":
            self.h1 += 1
        elif tag == "a" and values.get("href"):
            self.links += 1
        elif tag == "script" and values.get("type") == "application/ld+json":
            self.schemas += 1


def fetch(url, *, user_agent="RealMindX-SEO-Smoke/1.0", attempts=3):
    last_error = None
    for attempt in range(attempts):
        try:
            request = Request(url, headers={"User-Agent": user_agent, "Accept": "text/html,application/xml,text/plain"})
            with urlopen(request, timeout=20) as response:
                return response.status, response.geturl(), dict(response.headers), response.read().decode("utf-8", "replace")
        except HTTPError as error:
            if error.code in {429, 502, 503, 504} and attempt + 1 < attempts:
                last_error = error
                time.sleep(2 ** attempt)
                continue
            return error.code, error.geturl(), dict(error.headers), error.read().decode("utf-8", "replace")
        except (URLError, TimeoutError) as error:
            last_error = error
            if attempt + 1 < attempts:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"Could not fetch {url}: {last_error}")


def inspect_html(body):
    parser = HeadInspector()
    parser.feed(body)
    return parser


def sitemap_urls(base_url):
    status, _, _, body = fetch(urljoin(base_url, "/sitemap.xml"))
    if status != 200:
        raise AssertionError(f"sitemap returned {status}")
    root = ElementTree.fromstring(body)
    return [node.text for node in root.findall("{http://www.sitemaps.org/schemas/sitemap/0.9}url/{http://www.sitemaps.org/schemas/sitemap/0.9}loc") if node.text]


def check_indexable(base_url, path, failures, *, require_links=True):
    expected = urljoin(base_url.rstrip("/") + "/", path.lstrip("/")) if path != "/" else base_url.rstrip("/") + "/"
    status, final_url, _, body = fetch(expected)
    page = inspect_html(body)
    if status != 200:
        failures.append(f"{expected}: expected 200, got {status}")
    if not page.canonical:
        failures.append(f"{expected}: missing canonical")
    if "noindex" in str(page.robots or "").lower():
        failures.append(f"{expected}: unexpectedly noindex")
    if not page.description:
        failures.append(f"{expected}: missing description")
    if page.h1 < 1:
        failures.append(f"{expected}: missing server-rendered h1")
    if require_links and page.links < 2:
        failures.append(f"{expected}: insufficient server-rendered links ({page.links})")
    return {"url": expected, "status": status, "final_url": final_url, "links": page.links, "schemas": page.schemas}


def check_noindex(base_url, path, failures, expected_status):
    url = urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))
    status, _, headers, body = fetch(url)
    page = inspect_html(body)
    if status != expected_status:
        failures.append(f"{url}: expected {expected_status}, got {status}")
    combined = f"{page.robots or ''} {headers.get('X-Robots-Tag', '')}".lower()
    if "noindex" not in combined:
        failures.append(f"{url}: missing noindex directive")
    return {"url": url, "status": status, "robots": combined.strip()}


def run(main_url, bookshop_url, sample_size, *, skip_sitemap_fetches=False):
    failures = []
    results = {"main": [], "bookshop": [], "sitemaps": {}}
    for path in ["/", "/services", "/jobs", "/news"]:
        results["main"].append(check_indexable(main_url, path, failures))
    for path in ["/", "/products", "/subjects", "/documents"]:
        results["bookshop"].append(check_indexable(bookshop_url, path, failures))
    results["main"].append(check_noindex(main_url, "/login", failures, 200))
    results["main"].append(check_noindex(main_url, "/seo-smoke-page-that-does-not-exist", failures, 404))
    results["bookshop"].append(check_noindex(bookshop_url, "/cart", failures, 200))
    results["bookshop"].append(check_noindex(bookshop_url, "/subjects/seo-smoke-invalid", failures, 404))

    for label, base_url in (("main", main_url), ("bookshop", bookshop_url)):
        urls = sitemap_urls(base_url)
        sampled = 0 if skip_sitemap_fetches else min(len(urls), sample_size)
        results["sitemaps"][label] = {"count": len(urls), "sampled": sampled}
        if skip_sitemap_fetches:
            continue
        seen = set()
        for url in urls[:sample_size]:
            if url in seen:
                failures.append(f"{base_url}/sitemap.xml: duplicate URL {url}")
                continue
            seen.add(url)
            if urlparse(url).netloc != urlparse(base_url).netloc:
                failures.append(f"{base_url}/sitemap.xml: cross-host URL {url}")
                continue
            status, final_url, _, _ = fetch(url)
            if status != 200 or final_url.rstrip("/") != url.rstrip("/"):
                failures.append(f"sitemap URL {url}: status={status}, final={final_url}")

    ai_status, _, _, ai_body = fetch(urljoin(main_url, "/services"), user_agent="OAI-SearchBot/1.0")
    if ai_status != 200 or inspect_html(ai_body).h1 < 1:
        failures.append(f"AI crawler check failed for {main_url}/services: status={ai_status}")
    results["failures"] = failures
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--main-url", default="https://realmindxgh.com")
    parser.add_argument("--bookshop-url", default="https://bookshop.realmindxgh.com")
    parser.add_argument("--sample-size", type=int, default=20)
    parser.add_argument(
        "--skip-sitemap-fetches",
        action="store_true",
        help="Parse sitemap indexes without fetching their canonical URLs (useful for local host aliases).",
    )
    args = parser.parse_args()
    results = run(
        args.main_url.rstrip("/"),
        args.bookshop_url.rstrip("/"),
        max(1, args.sample_size),
        skip_sitemap_fetches=args.skip_sitemap_fetches,
    )
    print(json.dumps(results, indent=2))
    return 1 if results["failures"] else 0


if __name__ == "__main__":
    sys.exit(main())
