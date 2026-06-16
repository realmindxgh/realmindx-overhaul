from html import escape
import json
from pathlib import Path
import re

from flask import Response, current_app, redirect, request

from .api.public import (
    BOOKSHOP_SITE_BASE_URL,
    MAIN_SITE_BASE_URL,
    enrich_news_sections,
    news_public_json,
    slugify,
    upload_public_url,
)
from .extensions import db
from .models import News, Product, ProductCategory


BOOKSHOP_DEFAULT_IMAGE = f"{BOOKSHOP_SITE_BASE_URL}/og-image-bookshop.png"


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


def _absolute_url(value, base_url=MAIN_SITE_BASE_URL):
    if not value:
        return None
    text = str(value)
    if text.startswith(("https://", "http://")):
        return text
    return f"{base_url}/{text.lstrip('/')}"


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
    for section_index, section in enumerate(sections):
        heading = section.get("heading")
        section_image = _absolute_url(section.get("image_url"))
        image_position = section.get("image_position") or "auto"
        if image_position == "auto":
            image_position = "right" if section_index % 2 == 0 else "left"
        image_size = section.get("image_size") or "medium"
        if heading:
            pieces.append(f"<h2>{escape(heading)}</h2>")
        if section_image:
            pieces.append(
                f'<figure class="news-section-image position-{escape(image_position, quote=True)} '
                f'size-{escape(image_size, quote=True)}"><img src="{escape(section_image, quote=True)}" '
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


def _render_document(
    document,
    *,
    title,
    description,
    canonical,
    robots,
    image,
    markup,
    schema=None,
    route_data=None,
    og_type=None,
    site_name=None,
):
    document = _replace_title(document, title)
    document = _set_meta(document, "description", description)
    document = _set_meta(document, "robots", robots)
    document = _set_meta(document, "og:type", og_type or ("article" if schema else "website"), "property")
    if site_name:
        document = _set_meta(document, "og:site_name", site_name, "property")
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
    if route_data is not None:
        payload = json.dumps(route_data, ensure_ascii=False).replace("</", "<\\/")
        document = document.replace(
            "</head>",
            f'    <script type="application/json" id="realmindx-route-data">{payload}</script>\n  </head>',
            1,
        )
    document = document.replace('<div id="root"></div>', f'<div id="root">{markup}</div>', 1)
    return document


BOOKSHOP_PROFILE_OVERRIDES = {
    ("subject", "mathematics"): {
        "title": "Mathematics Books in Ghana | Maths Textbooks, BECE & WASSCE | RealMindX Bookshop",
        "description": "Shop Mathematics books in Ghana, including maths textbooks, Cambridge maths books, GES/NaCCA Mathematics, BECE and WASSCE revision books, workbooks and classroom materials.",
        "intro": "Find Mathematics books for learners, parents, teachers and schools, including textbooks, revision books, workbooks, practice books and classroom materials.",
    },
    ("subject", "english-language"): {
        "title": "English Language Books in Ghana | Grammar, Reading, BECE & WASSCE | RealMindX Bookshop",
        "description": "Shop English Language books in Ghana, including English textbooks, grammar books, reading books, composition books, BECE English and WASSCE English materials.",
        "intro": "Browse English Language books for reading, grammar, comprehension, composition and exam preparation.",
    },
    ("subject", "computing"): {
        "title": "Computing and ICT Books in Ghana | Computer Studies Textbooks | RealMindX Bookshop",
        "description": "Shop Computing and ICT books in Ghana, including computer studies textbooks, JHS ICT books, coding books for students and classroom technology materials.",
        "intro": "Find Computing and ICT books for learners and schools, including computer studies textbooks, JHS ICT books and practical classroom materials.",
    },
    ("curriculum", "ges-nacca-curriculum"): {
        "title": "GES/NaCCA Curriculum Books in Ghana | Textbooks and Revision Books | RealMindX Bookshop",
        "description": "Shop GES and NaCCA curriculum books in Ghana, including textbooks, BECE books, WASSCE materials, workbooks and classroom resources.",
        "intro": "Browse books aligned with the GES/NaCCA curriculum for Ghanaian learners, teachers and schools.",
    },
    ("curriculum", "cambridge-international-curriculum"): {
        "title": "Cambridge Books in Ghana | Cambridge Curriculum Textbooks | RealMindX Bookshop",
        "description": "Shop Cambridge International curriculum books in Ghana, including Cambridge textbooks, workbooks and classroom materials for schools and learners.",
        "intro": "Find Cambridge International curriculum books, textbooks and workbooks for learners, parents, teachers and schools in Ghana.",
    },
    ("category", "text-books"): {
        "title": "Textbooks in Ghana | School Books, BECE & WASSCE Materials | RealMindX Bookshop",
        "description": "Shop textbooks in Ghana for primary, JHS and SHS learners, including GES/NaCCA books, Cambridge books, BECE and WASSCE revision materials.",
        "intro": "Browse school textbooks for learners, parents, teachers and schools, including GES/NaCCA books, Cambridge titles, BECE materials and WASSCE resources.",
    },
}


BOOKSHOP_LANDING_PROFILES = {
    "home": {
        "title": "RealMindX Bookshop | Textbooks, Stationery and Learning Materials in Ghana",
        "description": "Shop textbooks, workbooks, stationery, revision books and classroom materials from RealMindX Bookshop. Built for Ghanaian learners, parents, teachers and schools.",
        "intro": "RealMindX Bookshop is a dedicated educational bookshop for textbooks, stationery, revision books and classroom materials in Ghana.",
    },
    "products": {
        "title": "Educational Books and Textbooks in Ghana | RealMindX Bookshop",
        "description": "Browse educational books, textbooks, workbooks, revision books, stationery and classroom materials available from RealMindX Bookshop.",
        "intro": "Browse the latest educational books, textbooks, workbooks, revision books and learning materials available in the RealMindX Bookshop.",
    },
    "subject": {
        "title": "Shop Books by Subject in Ghana | RealMindX Bookshop",
        "description": "Search and shop books by subject, including Mathematics, English Language, Science, Computing, BECE books, WASSCE books, textbooks and classroom materials.",
        "intro": "Search and shop books by subject for learners, parents, teachers and schools.",
    },
    "level": {
        "title": "School Books by Level in Ghana | Primary, JHS and SHS | RealMindX Bookshop",
        "description": "Shop school books by level in Ghana, including primary textbooks, JHS books, SHS textbooks, BECE books and WASSCE materials.",
        "intro": "Choose the learner stage and find matching school books, revision books and classroom materials.",
    },
    "curriculum": {
        "title": "Curriculum Textbooks in Ghana | GES/NaCCA, Cambridge & More | RealMindX Bookshop",
        "description": "Shop books by curriculum in Ghana, including GES/NaCCA curriculum books, Cambridge textbooks, British curriculum books and classroom materials.",
        "intro": "Choose the curriculum your school follows and find relevant textbooks, workbooks and learning materials.",
    },
    "category": {
        "title": "Educational Books and Learning Materials in Ghana | RealMindX Bookshop",
        "description": "Shop textbooks, readers, stationery, workbooks and learning materials for learners, parents, teachers and schools in Ghana.",
        "intro": "Choose the kind of learning material you need and browse matching school books and supplies.",
    },
    "publisher": {
        "title": "Educational Book Publishers in Ghana | RealMindX Bookshop",
        "description": "Browse educational titles by publisher and compare textbooks, workbooks, readers and classroom materials available in Ghana.",
        "intro": "Compare available titles by publisher, then browse by curriculum, subject, level or item type.",
    },
}


def _bookshop_markup(title, intro):
    return (
        '<main class="bs bs-fade-page" data-seo-prerendered="bookshop">'
        '<section class="bs-container" style="padding:64px 20px">'
        '<p class="bs-eyebrow">RealMindX Bookshop</p>'
        f"<h1 class=\"bs-h1\">{escape(title)}</h1>"
        f"<p class=\"bs-muted\" style=\"max-width:720px\">{escape(intro)}</p>"
        "</section></main>"
    )


def _bookshop_profile(taxonomy, label="", route_key=None):
    slug = slugify(label)
    if route_key:
        return BOOKSHOP_LANDING_PROFILES[route_key]
    if (taxonomy, slug) in BOOKSHOP_PROFILE_OVERRIDES:
        return BOOKSHOP_PROFILE_OVERRIDES[(taxonomy, slug)]
    if taxonomy == "subject":
        return {
            "title": f"{label} Books in Ghana | Textbooks and Learning Materials | RealMindX Bookshop",
            "description": f"Shop {label} books in Ghana, including textbooks, workbooks, revision books, practice books and classroom materials.",
            "intro": f"Find {label} books for learners, parents, teachers and schools, including textbooks, workbooks and practice materials.",
        }
    if taxonomy == "level":
        return {
            "title": f"{label} Books in Ghana | Textbooks and Revision Books | RealMindX Bookshop",
            "description": f"Shop {label} books in Ghana, including textbooks, workbooks, revision books and classroom materials.",
            "intro": f"Find books and learning materials matched to {label}, including textbooks, workbooks and revision guides.",
        }
    if taxonomy == "curriculum":
        return {
            "title": f"{label} Books in Ghana | Curriculum Textbooks | RealMindX Bookshop",
            "description": f"Shop {label} books in Ghana, including curriculum textbooks, workbooks and classroom materials.",
            "intro": f"Browse titles that fit the {label} pathway, including textbooks, workbooks and classroom materials.",
        }
    if taxonomy == "publisher":
        return {
            "title": f"{label} Books in Ghana | RealMindX Bookshop",
            "description": f"Shop available books from {label}, including textbooks, workbooks and classroom materials for learners and schools.",
            "intro": f"Browse books currently available from {label}.",
        }
    return {
        "title": f"{label} in Ghana | RealMindX Bookshop",
        "description": f"Shop {label.lower()} in Ghana at RealMindX Bookshop for learners, parents, teachers and schools.",
        "intro": f"Browse {label.lower()} in the RealMindX Bookshop.",
    }


def _find_taxonomy_label(taxonomy, slug):
    if taxonomy == "category":
        category = ProductCategory.query.filter_by(slug=slug).first()
        return category.name if category else None
    column = {
        "subject": Product.subject,
        "level": Product.level,
        "curriculum": Product.curriculum,
        "publisher": Product.publisher,
    }.get(taxonomy)
    if column is None:
        return None
    rows = (
        db_value[0]
        for db_value in db.session.query(column)
        .filter(Product.is_active.is_(True), column.isnot(None), column != "")
        .distinct()
        .all()
    )
    return next((value.strip() for value in rows if value and slugify(value) == slug), None)


def bookshop_public_page(path=""):
    document = _frontend_document()
    if document is None:
        return Response("The bookshop page is temporarily unavailable.", status=503, mimetype="text/plain")

    clean_path = str(path or "").strip("/")
    if request.path.endswith("/") and clean_path:
        return redirect(f"{BOOKSHOP_SITE_BASE_URL}/{clean_path}", code=301)

    canonical_path = f"/{clean_path}" if clean_path else "/"
    canonical = f"{BOOKSHOP_SITE_BASE_URL}{canonical_path}"
    profile = BOOKSHOP_LANDING_PROFILES["home" if not clean_path else "products"]
    status = 200
    robots = "index, follow"
    image = BOOKSHOP_DEFAULT_IMAGE
    schema = None
    og_type = "website"

    if not clean_path:
        route_key = "home"
        profile = BOOKSHOP_LANDING_PROFILES[route_key]
    elif clean_path == "products":
        profile = BOOKSHOP_LANDING_PROFILES["products"]
    elif clean_path.startswith("products/"):
        slug = clean_path.split("/", 1)[1]
        product = Product.query.filter_by(slug=slug, is_active=True).first()
        if not product and re.search(r"-\d+$", slug):
            product = Product.query.filter_by(id=slug.rsplit("-", 1)[1], is_active=True).first()
        if product:
            title = f"{product.name} | RealMindX Bookshop"
            description = product.short_description or product.full_description or "Educational books and learning materials available from RealMindX Bookshop."
            image = _absolute_url(upload_public_url(product.image_file), BOOKSHOP_SITE_BASE_URL) or BOOKSHOP_DEFAULT_IMAGE
            profile = {"title": title, "description": description, "intro": description}
            og_type = "product"
            schema = {
                "@context": "https://schema.org",
                "@type": "Product",
                "name": product.name,
                "description": description,
                "image": image,
                "sku": str(product.id),
                "offers": {
                    "@type": "Offer",
                    "priceCurrency": "GHS",
                    "price": str(product.price),
                    "availability": "https://schema.org/InStock" if product.stock_status == "in_stock" else "https://schema.org/OutOfStock",
                    "url": canonical,
                },
            }
        else:
            status = 404
            robots = "noindex, follow"
            profile = {
                "title": "Product Not Found | RealMindX Bookshop",
                "description": "That product link does not match a currently published RealMindX Bookshop item.",
                "intro": "That product link does not match a currently published RealMindX Bookshop item.",
            }
    else:
        route_map = {
            "subjects": "subject",
            "levels": "level",
            "curriculum": "curriculum",
            "curricula": "curriculum",
            "categories": "category",
            "publishers": "publisher",
        }
        parts = clean_path.split("/", 1)
        route_key = parts[0]
        taxonomy = route_map.get(route_key)
        if taxonomy and len(parts) == 1:
            profile = _bookshop_profile(taxonomy, route_key=taxonomy)
            canonical = f"{BOOKSHOP_SITE_BASE_URL}/{route_key if route_key != 'curricula' else 'curriculum'}"
        elif taxonomy and len(parts) == 2:
            slug = slugify(parts[1])
            label = _find_taxonomy_label(taxonomy, slug) or parts[1].replace("-", " ").title()
            profile = _bookshop_profile(taxonomy, label)
            canonical_route = "curriculum" if route_key == "curricula" else route_key
            canonical = f"{BOOKSHOP_SITE_BASE_URL}/{canonical_route}/{slug}"
        else:
            status = 404
            robots = "noindex, follow"
            profile = {
                "title": "Bookshop Page Not Found | RealMindX Bookshop",
                "description": "That bookshop link does not match a public catalogue page.",
                "intro": "That bookshop link does not match a public catalogue page.",
            }

    rendered = _render_document(
        document,
        title=profile["title"],
        description=profile["description"],
        canonical=canonical,
        robots=robots,
        image=image,
        markup=_bookshop_markup(profile["title"].split("|", 1)[0].strip(), profile["intro"]),
        schema=schema,
        og_type=og_type,
        site_name="RealMindX Bookshop",
    )
    response = Response(rendered, status=status, mimetype="text/html")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response


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
            route_data={"news": []},
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
        route_data={"news": [news_public_json(row)]},
    )
    response = Response(rendered, status=200, mimetype="text/html")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response
