from pathlib import Path
import re
import sys


START_MARKER = "    # BEGIN REALMINDX MANAGED SEO ROUTES"
END_MARKER = "    # END REALMINDX MANAGED SEO ROUTES"
ROUTE_BLOCK = f"""{START_MARKER}
    location = /sitemap.xml {{
        proxy_pass         http://127.0.0.1:5002/sitemap.xml;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }}

    location = /robots.txt {{
        proxy_pass         http://127.0.0.1:5002/robots.txt;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }}

    location ~ ^/news/[^/]+/?$ {{
        proxy_pass         http://127.0.0.1:5002;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60;
    }}
{END_MARKER}
"""


def server_blocks(text):
    for match in re.finditer(r"(?m)^\s*server\s*\{", text):
        depth = 0
        for index in range(match.start(), len(text)):
            if text[index] == "{":
                depth += 1
            elif text[index] == "}":
                depth -= 1
                if depth == 0:
                    yield match.start(), index + 1, text[match.start():index + 1]
                    break


def install_route(text):
    marker_pattern = re.compile(
        rf"\n[ \t]*# BEGIN REALMINDX MANAGED SEO ROUTES\n"
        rf".*?"
        rf"[ \t]*# END REALMINDX MANAGED SEO ROUTES\n+",
        re.DOTALL,
    )
    text = marker_pattern.sub("\n", text)
    for start, end, block in server_blocks(text):
        if not re.search(r"(?m)^\s*server_name\s+realmindxgh\.com\s*;", block):
            continue
        if not re.search(r"(?m)^\s*listen\s+443\b", block):
            continue
        anchor = re.search(r"(?m)^\s*location\s+/api/\s*\{", block)
        if not anchor:
            anchor = re.search(r"(?m)^\s*root\s+", block)
        if not anchor:
            raise RuntimeError("Could not find an insertion point in the main HTTPS server block.")
        insert_at = start + anchor.start()
        return text[:insert_at] + ROUTE_BLOCK + "\n" + text[insert_at:]
    raise RuntimeError("Could not find the main realmindxgh.com HTTPS server block.")


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: install_nginx_seo_routes.py /path/to/nginx/site.conf")
    path = Path(sys.argv[1])
    original = path.read_text(encoding="utf-8-sig")
    updated = install_route(original)
    if updated != original:
        path.write_text(updated, encoding="utf-8")
        print(f"Installed managed SEO routes in {path}.")
    else:
        print(f"Managed SEO routes already current in {path}.")


if __name__ == "__main__":
    main()
