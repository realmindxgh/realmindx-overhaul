from pathlib import Path
import re
import sys


START_MARKER = "    # BEGIN REALMINDX MANAGED SEO ROUTES"
END_MARKER = "    # END REALMINDX MANAGED SEO ROUTES"
BOOKSHOP_START_MARKER = "    # BEGIN REALMINDX MANAGED BOOKSHOP SEO ROUTES"
BOOKSHOP_END_MARKER = "    # END REALMINDX MANAGED BOOKSHOP SEO ROUTES"
UPLOAD_LIMIT = "100M"
ROUTE_BLOCK = f"""{START_MARKER}
    location ~ ^/delivery-company(?<delivery_company_tail>/.*)?$ {{
        return 301 https://delivery.realmindxgh.com/manager$delivery_company_tail$is_args$args;
    }}

    location ~ ^/delivery(?<delivery_rider_tail>/.*)?$ {{
        return 301 https://delivery.realmindxgh.com/rider$delivery_rider_tail$is_args$args;
    }}

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

    location ~ ^/(about|services|jobs|contact|news|gallery|resources|donate|privacy|terms)/?$ {{
        proxy_pass         http://127.0.0.1:5002;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60;
    }}

    location ~ ^/news/[^/]+/?$ {{
        proxy_pass         http://127.0.0.1:5002;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60;
    }}

    location ~ ^/services/[^/]+/?$ {{
        proxy_pass         http://127.0.0.1:5002;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60;
    }}

    location ~ ^/(admin|staff|delivery-company|delivery|manager|rider)(/[^?#]*)?/?$ {{
        proxy_pass         http://127.0.0.1:5002;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60;
    }}

    location ~ ^/(admin|staff|bookshop|delivery-company|delivery)\.webmanifest$ {{
        types {{ application/manifest+json webmanifest; }}
        try_files $uri =404;
        add_header Cache-Control "no-cache, must-revalidate";
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

    location ~ ^/(products|subjects|levels|curriculum|curricula|categories|publishers|about|contact|privacy|terms|track|invoice|invoices|documents|education-documents)(/[^?#]*)?/?$ {{
        proxy_pass         http://127.0.0.1:5002;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60;
    }}

    location ~ ^/(admin|staff|bookshop|delivery-company|delivery)\.webmanifest$ {{
        types {{ application/manifest+json webmanifest; }}
        try_files $uri =404;
        add_header Cache-Control "no-cache, must-revalidate";
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


def server_names(block):
    for match in re.finditer(r"(?m)^\s*server_name\s+([^;]+);", block):
        for name in match.group(1).split():
            yield name.strip()


def block_has_server_name(block, hostname):
    return any(name == hostname for name in server_names(block))


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


def remove_managed_block(text, start_marker, end_marker):
    marker_pattern = re.compile(
        rf"\n[ \t]*{re.escape(start_marker.strip())}\n"
        rf".*?"
        rf"[ \t]*{re.escape(end_marker.strip())}\n+",
        re.DOTALL,
    )
    return marker_pattern.sub("\n", text)


def remove_location_blocks(block, predicates):
    ranges = []
    for match in re.finditer(r"(?m)^\s*location\s+[^\{]+\{", block):
        header = match.group(0)
        if not any(predicate(header) for predicate in predicates):
            continue
        depth = 0
        for index in range(match.start(), len(block)):
            if block[index] == "{":
                depth += 1
            elif block[index] == "}":
                depth -= 1
                if depth == 0:
                    ranges.append((match.start(), index + 1))
                    break
    if not ranges:
        return block
    cleaned = []
    cursor = 0
    for start, end in ranges:
        cleaned.append(block[cursor:start])
        cursor = end
    cleaned.append(block[cursor:])
    return "".join(cleaned)


def remove_legacy_main_routes(block):
    return remove_location_blocks(block, [
        lambda header: re.search(r"location\s*=\s*/sitemap\.xml\s*\{", header) is not None,
        lambda header: re.search(r"location\s*=\s*/robots\.txt\s*\{", header) is not None,
        lambda header: re.search(r"location\s*=\s*/\s*\{", header) is not None,
        lambda header: "about|services|jobs|contact|news|gallery|resources|donate|privacy|terms" in header,
        lambda header: "/news/" in header,
        lambda header: "/services/" in header,
        lambda header: "admin|staff|delivery-company|delivery" in header or "manager|rider" in header,
        lambda header: "delivery_company_tail" in header or "delivery_rider_tail" in header,
    ])


def remove_legacy_bookshop_routes(block):
    return remove_location_blocks(block, [
        lambda header: re.search(r"location\s*=\s*/sitemap\.xml\s*\{", header) is not None,
        lambda header: re.search(r"location\s*=\s*/robots\.txt\s*\{", header) is not None,
        lambda header: re.search(r"location\s*=\s*/\s*\{", header) is not None,
        lambda header: "products|subjects|levels|curriculum|curricula|categories|publishers|about|contact|privacy|terms" in header,
    ])


def install_route(text):
    text = remove_managed_block(text, START_MARKER, END_MARKER)
    for start, end, block in server_blocks(text):
        if not block_has_server_name(block, "realmindxgh.com"):
            continue
        if not re.search(r"(?m)^\s*listen\s+443\b", block):
            continue
        block = remove_legacy_main_routes(block)
        text = text[:start] + block + text[end:]
        anchor = insertion_anchor(block)
        if not anchor:
            continue
        insert_at = start + anchor.start()
        return text[:insert_at] + ROUTE_BLOCK + "\n" + text[insert_at:]
    raise RuntimeError("Could not find the main realmindxgh.com HTTPS server block.")


def install_bookshop_route(text):
    text = remove_managed_block(text, BOOKSHOP_START_MARKER, BOOKSHOP_END_MARKER)
    if not has_https_server_name(text, "realmindxgh.com"):
        text = remove_managed_block(text, START_MARKER, END_MARKER)
    for start, end, block in server_blocks(text):
        if not block_has_server_name(block, "bookshop.realmindxgh.com"):
            continue
        if not re.search(r"(?m)^\s*listen\s+443\b", block):
            continue
        block = remove_legacy_bookshop_routes(block)
        text = text[:start] + block + text[end:]
        anchor = insertion_anchor(block)
        if not anchor:
            continue
        insert_at = start + anchor.start()
        return text[:insert_at] + BOOKSHOP_ROUTE_BLOCK + "\n" + text[insert_at:]
    raise RuntimeError("Could not find the bookshop.realmindxgh.com HTTPS server block.")


def has_https_server_name(text, hostname):
    return any(
        block_has_server_name(block, hostname) and re.search(r"(?m)^\s*listen\s+443\b", block)
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
