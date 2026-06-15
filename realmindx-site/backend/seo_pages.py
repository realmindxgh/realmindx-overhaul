from html import escape
import json
from pathlib import Path
import re

from flask import Response, current_app, redirect, request

from .api.public import MAIN_SITE_BASE_URL, enrich_news_sections, upload_public_url
from .models import News


def _replace_title(document, title):
    return re.sub(
        r"<title>.*?</title>",
        f"<title>{escape(title)}</title>",
        document,
        count=1,
        flags=re.IGNORECASE | re.DOTALL,
    )


def _set_meta(document, key, content, attribute="name"):
    tag = f'<meta {attribute}="{escape(key, quote=True)}" content="{escape(content, quote=True)}" />'
    pattern = rf'<meta\b(?=[^>]*\b{attribute}=["\']{re.escape(key)}["\'])[^>]*>'
    if re.search(pattern, document, flags=re.IGNORECASE):
        return re.sub(pattern, tag, document, count=1, flags=re.IGNORECASE)
    return document.replace("</head>", f"    {tag}\n  </head>", 1)


def _set_canonical(document, url):
    tag = f'<link rel="canonical" href="{escape(url, quote=True)}" />'
    pattern = r'<link\b(?=[^>]*\brel=["\']canonical["\'])[^>]*>'
    if re.search(pattern, document, flags=re.IGNORECASE):
        return re.sub(pattern, tag, document, count=1, flags=re.IGNORECASE)
    return document.replace("</head>", f"    {tag}\n  </head>", 1)


def _paragraphs(value):
    return [
        paragraph.strip()
        for paragraph in re.split(r"\n\s*\n", str(value or ""))
        if paragraph.strip()
    ]


def _absolute_url(value):
    if not value:
        return None
    text = str(value)
    if text.startswith(("https://", "http://")):
        return text
    return f"{MAIN_SITE_BASE_URL}/{text.lstrip('/')}"


def _article_markup(row, sections, image_url):
    pieces = [
        '<main class="route-page" data-seo-prerendered="news-article">',
        '<article class="news-article-page">',
        '<div class="container" style="max-width:860px">',
        '<div class="news-article-metahead"><a href="/news">Newsroom</a><span>/</span>',
        f"<span>{escape(row.category or 'Update')}</span></div>",
    ]
    if image_url:
        pieces.append(
            f'<img class="news-article-hero-img" src="{escape(image_url, quote=True)}" '
            f'alt="{escape(row.title, quote=True)}" />'
        )
    display_date = row.display_date.isoformat() if row.display_date else ""
    category_line = escape(row.category or "Update")
    if display_date:
        category_line += f" &middot; {escape(display_date)}"
    pieces.extend([
        f'<p class="overline" style="margin-top:28px">{category_line}</p>',
        f'<h1 class="news-article-title">{escape(row.title)}</h1>',
    ])
    if row.summary:
        pieces.append(f'<p class="news-article-lead">{escape(row.summary)}</p>')
    for paragraph in _paragraphs(row.body):
        pieces.append(f"<p>{escape(paragraph)}</p>")
    for section in sections:
        heading = section.get("heading")
        section_image = _absolute_url(section.get("image_url"))
        if heading:
            pieces.append(f"<h2>{escape(heading)}</h2>")
        if section_image:
            pieces.append(
                f'<figure><img src="{escape(section_image, quote=True)}" '
                f'alt="{escape(section.get("caption") or heading or row.title, quote=True)}" />'
            )
            if section.get("caption"):
                pieces.append(f"<figcaption>{escape(section['caption'])}</figcaption>")
            pieces.append("</figure>")
        for paragraph in _paragraphs(section.get("body")):
            pieces.append(f"<p>{escape(paragraph)}</p>")
    pieces.extend(["</div>", "</article>", "</main>"])
    return "".join(pieces)


def _not_found_markup():
    return (
        '<main class="route-page" data-seo-prerendered="news-not-found">'
        '<section class="page-hero route-page-hero"><div class="container">'
        '<p class="overline">RealMindX News</p><h1>Article Not Found</h1>'
        '<p>That news link does not match a currently published RealMindX article.</p>'
        '<p><a href="/news">Browse News</a></p>'
        "</div></section></main>"
    )


def _frontend_document():
    path = Path(current_app.config["FRONTEND_DIST_DIR"]) / "index.html"
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        current_app.logger.exception("Could not read the frontend HTML shell from %s.", path)
        return None


def _render_document(document, *, title, description, canonical, robots, image, markup, schema=None):
    document = _replace_title(document, title)
    document = _set_meta(document, "description", description)
    document = _set_meta(document, "robots", robots)
    document = _set_meta(document, "og:type", "article" if schema else "website", "property")
    document = _set_meta(document, "og:title", title, "property")
    document = _set_meta(document, "og:description", description, "property")
    document = _set_meta(document, "og:url", canonical, "property")
    document = _set_meta(document, "og:image", image, "property")
    document = _set_meta(document, "twitter:card", "summary_large_image")
    document = _set_meta(document, "twitter:title", title)
    document = _set_meta(document, "twitter:description", description)
    document = _set_meta(document, "twitter:image", image)
    document = _set_canonical(document, canonical)
    if schema:
        payload = json.dumps(schema, ensure_ascii=False).replace("</", "<\\/")
        document = document.replace(
            "</head>",
            f'    <script type="application/ld+json" data-seo-id="route-seo">{payload}</script>\n  </head>',
            1,
        )
    document = document.replace('<div id="root"></div>', f'<div id="root">{markup}</div>', 1)
    return document


def news_article_page(slug):
    canonical = f"{MAIN_SITE_BASE_URL}/news/{slug}"
    if request.path.endswith("/"):
        return redirect(canonical, code=301)

    document = _frontend_document()
    if document is None:
        return Response("The news page is temporarily unavailable.", status=503, mimetype="text/plain")

    row = News.query.filter_by(slug=slug, status="published").first()
    if row is None:
        title = "Article Not Found | RealMindX News"
        description = "That RealMindX news link does not match a currently published article."
        rendered = _render_document(
            document,
            title=title,
            description=description,
            canonical=canonical,
            robots="noindex,follow",
            image=f"{MAIN_SITE_BASE_URL}/og-image.png",
            markup=_not_found_markup(),
        )
        response = Response(rendered, status=404, mimetype="text/html")
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        return response

    sections = enrich_news_sections(row.sections or [])
    image_url = _absolute_url(upload_public_url(row.image_file)) or f"{MAIN_SITE_BASE_URL}/og-image.png"
    description = row.summary or next(iter(_paragraphs(row.body)), "Latest RealMindX news and updates from Ghana.")
    title = f"{row.title} | RealMindX News"
    schema = {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        "headline": row.title,
        "description": description,
        "image": image_url,
        "datePublished": (row.published_at or row.created_at).isoformat(),
        "dateModified": (row.updated_at or row.published_at or row.created_at).isoformat(),
        "author": {
            "@type": "Organization",
            "name": "RealMindX Education Limited",
            "url": MAIN_SITE_BASE_URL,
        },
        "publisher": {
            "@type": "Organization",
            "name": "RealMindX Education Limited",
            "logo": {
                "@type": "ImageObject",
                "url": f"{MAIN_SITE_BASE_URL}/logo-white.png",
            },
        },
        "mainEntityOfPage": canonical,
    }
    rendered = _render_document(
        document,
        title=title,
        description=description,
        canonical=canonical,
        robots="index,follow",
        image=image_url,
        markup=_article_markup(row, sections, image_url),
        schema=schema,
    )
    response = Response(rendered, status=200, mimetype="text/html")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response
