from pathlib import Path
import re
import sys


START_MARKER = "    # BEGIN REALMINDX MANAGED SEO ROUTES"
END_MARKER = "    # END REALMINDX MANAGED SEO ROUTES"
BOOKSHOP_START_MARKER = "    # BEGIN REALMINDX MANAGED BOOKSHOP SEO ROUTES"
BOOKSHOP_END_MARKER = "    # END REALMINDX MANAGED BOOKSHOP SEO ROUTES"
UPLOAD_LIMIT = "100M"
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

BOOKSHOP_ROUTE_BLOCK = f"""{BOOKSHOP_START_MARKER}
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

    location = / {{
        proxy_pass         http://127.0.0.1:5002/;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60;
    }}

    location ~ ^/(products|subjects|levels|curriculum|curricula|categories|publishers)(/[^?#]*)?/?$ {{
        proxy_pass         http://127.0.0.1:5002;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60;
    }}
{BOOKSHOP_END_MARKER}
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


def insertion_anchor(block):
    comment_anchor = re.search(
        r"(?m)^\s*# .*(?:Flask API|API).*\n(?=\s*location\s+/api/\s*\{)",
        block,
    )
    if comment_anchor:
        return comment_anchor
    anchor = re.search(r"(?m)^\s*location\s+/api/\s*\{", block)
    if anchor:
        return anchor
    return re.search(r"(?m)^\s*root\s+", block)


def install_route(text):
    marker_pattern = re.compile(
        rf"\n[ \t]*# BEGIN REALMINDX MANAGED SEO ROUTES\n"
        rf".*?"
        rf"[ \t]*# END REALMINDX MANAGED SEO ROUTES\n+",
        re.DOTALL,
    )
    text = marker_pattern.sub("\n", text)
    for start, end, block in server_blocks(text):
        if not re.search(r"(?m)^\s*server_name\s+[^;]*\brealmindxgh\.com\b[^;]*;", block):
            continue
        if not re.search(r"(?m)^\s*listen\s+443\b", block):
            continue
        anchor = insertion_anchor(block)
        if not anchor:
            continue
        insert_at = start + anchor.start()
        return text[:insert_at] + ROUTE_BLOCK + "\n" + text[insert_at:]
    raise RuntimeError("Could not find the main realmindxgh.com HTTPS server block.")


def install_bookshop_route(text):
    marker_pattern = re.compile(
        rf"\n[ \t]*# BEGIN REALMINDX MANAGED BOOKSHOP SEO ROUTES\n"
        rf".*?"
        rf"[ \t]*# END REALMINDX MANAGED BOOKSHOP SEO ROUTES\n+",
        re.DOTALL,
    )
    text = marker_pattern.sub("\n", text)
    for start, end, block in server_blocks(text):
        if not re.search(r"(?m)^\s*server_name\s+[^;]*\bbookshop\.realmindxgh\.com\b[^;]*;", block):
            continue
        if not re.search(r"(?m)^\s*listen\s+443\b", block):
            continue
        anchor = insertion_anchor(block)
        if not anchor:
            continue
        insert_at = start + anchor.start()
        return text[:insert_at] + BOOKSHOP_ROUTE_BLOCK + "\n" + text[insert_at:]
    raise RuntimeError("Could not find the bookshop.realmindxgh.com HTTPS server block.")


def has_https_server_name(text, hostname):
    pattern = re.compile(rf"(?m)^\s*server_name\s+[^;]*\b{re.escape(hostname)}\b[^;]*;")
    return any(
        pattern.search(block) and re.search(r"(?m)^\s*listen\s+443\b", block)
        for _, _, block in server_blocks(text)
    )


def install_upload_limit(text):
    return re.sub(
        r"(?m)^(\s*client_max_body_size\s+)\S+(;\s*)$",
        rf"\g<1>{UPLOAD_LIMIT}\g<2>",
        text,
    )


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: install_nginx_seo_routes.py /path/to/nginx/site.conf")
    path = Path(sys.argv[1])
    original = path.read_text(encoding="utf-8-sig")
    updated = original
    installed = False
    if has_https_server_name(updated, "realmindxgh.com"):
        updated = install_route(updated)
        installed = True
    if has_https_server_name(updated, "bookshop.realmindxgh.com"):
        updated = install_bookshop_route(updated)
        installed = True
    if not installed:
        raise RuntimeError(f"No managed RealMindX HTTPS server block found in {path}.")
    updated = install_upload_limit(updated)
    if updated != original:
        path.write_text(updated, encoding="utf-8")
        print(f"Installed managed SEO routes in {path}.")
    else:
        print(f"Managed SEO routes already current in {path}.")


if __name__ == "__main__":
    main()
