from html import escape
import json
from pathlib import Path
import re

from flask import Response, current_app, redirect, request

from .default_content import DEFAULT_SERVICES
from .api.public import (
    BOOKSHOP_SITE_BASE_URL,
    MAIN_SITE_BASE_URL,
    enrich_news_sections,
    enrich_service_media,
    news_public_json,
    public_rows,
    public_resource_query,
    resource_path,
    setting_collection,
    slugify,
    upload_public_url,
)
from .extensions import db
from .models import DeliveryZone, Job, News, Product, ProductCategory, ProductReview, Resource
from .og_images import book_og_public_url


SITE_DEFAULT_IMAGE = f"{MAIN_SITE_BASE_URL}/static/assets/social/realmindx-education-og-1200x630.png?v=20260622"
BOOKSHOP_DEFAULT_IMAGE = f"{BOOKSHOP_SITE_BASE_URL}/static/assets/social/realmindx-bookshop-og-1200x630.png?v=20260622"
EDUCATION_FAVICON = f"{MAIN_SITE_BASE_URL}/favicon.png"
EDUCATION_APPLE_TOUCH_ICON = f"{MAIN_SITE_BASE_URL}/apple-touch-icon.png"
BOOKSHOP_FAVICON = f"{BOOKSHOP_SITE_BASE_URL}/static/assets/favicons/bookshop-favicon.ico"
BOOKSHOP_APPLE_TOUCH_ICON = f"{BOOKSHOP_SITE_BASE_URL}/static/assets/favicons/bookshop-apple-touch-icon.png"
BOOKSHOP_SHIPPING_RATE_FALLBACK_MAX = 200.0
BOOKSHOP_DELIVERY_TIME = {
    "@type": "ShippingDeliveryTime",
    "handlingTime": {
        "@type": "QuantitativeValue",
        "minValue": 0,
        "maxValue": 1,
        "unitCode": "DAY",
    },
    "transitTime": {
        "@type": "QuantitativeValue",
        "minValue": 1,
        "maxValue": 2,
        "unitCode": "DAY",
    },
}
BOOKSHOP_RETURN_POLICY = {
    "@type": "MerchantReturnPolicy",
    "applicableCountry": "GH",
    "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow",
    "merchantReturnDays": 7,
    "returnMethod": "https://schema.org/ReturnByMail",
    "returnFees": "https://schema.org/ReturnFeesCustomerResponsibility",
}


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


def _remove_meta(document, key, attribute="name"):
    pattern = rf'\s*<meta\b(?=[^>]*\b{attribute}=["\']{re.escape(key)}["\'])[^>]*>\s*'
    return re.sub(pattern, "\n", document, flags=re.IGNORECASE)


def _set_canonical(document, url):
    tag = f'<link rel="canonical" href="{escape(url, quote=True)}" />'
    pattern = r'<link\b(?=[^>]*\brel=["\']canonical["\'])[^>]*>'
    if re.search(pattern, document, flags=re.IGNORECASE):
        return re.sub(pattern, tag, document, count=1, flags=re.IGNORECASE)
    return document.replace("</head>", f"    {tag}\n  </head>", 1)


def _set_link(document, rel, href, **attributes):
    extras = "".join(
        f' {escape(key.replace("_", "-"), quote=True)}="{escape(str(value), quote=True)}"'
        for key, value in attributes.items()
        if value
    )
    tag = f'<link rel="{escape(rel, quote=True)}" href="{escape(href, quote=True)}"{extras} />'
    pattern = rf'<link\b(?=[^>]*\brel=["\']{re.escape(rel)}["\'])[^>]*>'
    if re.search(pattern, document, flags=re.IGNORECASE):
        return re.sub(pattern, tag, document, flags=re.IGNORECASE)
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


SERVICE_IMAGE_PATHS = {
    "recruitment": "/uploads/Redesign/hero/Teacher Recruitment (Services).webp",
    "development": "/uploads/Redesign/hero/Teacher Recruitment (Services).webp",
    "school": "/uploads/Redesign/hero/School Restructuring-3.webp",
    "bookshop": "/uploads/Redesign/hero/Books and Stationery (Hero).webp",
    "tutoring": "/uploads/Redesign/hero/Home Teaching-1.webp",
    "research": "/uploads/Redesign/hero/School Restructuring-3.webp",
    "secretarial": "/uploads/Redesign/hero/School Restructuring-3.webp",
    "special": "/uploads/Redesign/hero/Special Needs-4.webp",
    "consulting": "/uploads/Redesign/hero/School Restructuring-3.webp",
    "extracurricular": "/uploads/Redesign/hero/Home Teaching-1.webp",
    "homeschool": "/uploads/Redesign/hero/Home Teaching-1.webp",
    "schoolms": "/uploads/Redesign/hero/School Restructuring-3.webp",
}


def _service_image(item):
    value = (
        item.get("detail_image_url")
        or item.get("detail_image")
        or item.get("image_url")
        or item.get("image")
        or SERVICE_IMAGE_PATHS.get(item.get("detail_image_key"))
        or SERVICE_IMAGE_PATHS.get(item.get("image_key"))
    )
    return _absolute_url(value) or SITE_DEFAULT_IMAGE


def _service_markup(item, image_url):
    label = item.get("label") or item.get("title") or "RealMindX Service"
    title = item.get("detail_title") or item.get("title") or label
    summary = item.get("detail_summary") or item.get("summary") or ""
    pieces = [
        '<main class="route-page" data-seo-prerendered="service">',
        '<section class="services-policy-hero"><div class="container">',
        '<p class="overline">RealMindX Education Service</p>',
        f"<h1>{escape(title)}</h1>",
    ]
    if summary:
        pieces.append(f"<p>{escape(summary)}</p>")
    pieces.append("</div></section>")
    pieces.append('<section class="site-info-section"><div class="container">')
    if image_url:
        pieces.append(
            f'<img src="{escape(image_url, quote=True)}" alt="{escape(label, quote=True)} service" '
            'style="width:100%;max-width:900px;height:auto" />'
        )
    for paragraph in _paragraphs(item.get("detail_body") or item.get("body")):
        pieces.append(f"<p>{escape(paragraph)}</p>")
    pieces.extend(["</div></section>", "</main>"])
    return "".join(pieces)


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
    schema_id="route-seo",
    route_data=None,
    og_type=None,
    site_name=None,
    image_alt=None,
    image_dimensions=None,
    favicon=None,
    apple_touch_icon=None,
    theme_color=None,
):
    document = _replace_title(document, title)
    document = _set_meta(document, "description", description)
    document = _set_meta(document, "robots", robots)
    google_verification = current_app.config.get("GOOGLE_SITE_VERIFICATION")
    bing_verification = current_app.config.get("BING_SITE_VERIFICATION")
    if google_verification:
        document = _set_meta(document, "google-site-verification", google_verification)
    if bing_verification:
        document = _set_meta(document, "msvalidate.01", bing_verification)
    document = _set_meta(document, "og:type", og_type or ("article" if schema else "website"), "property")
    if site_name:
        document = _set_meta(document, "og:site_name", site_name, "property")
    document = _set_meta(document, "og:title", title, "property")
    document = _set_meta(document, "og:description", description, "property")
    document = _set_meta(document, "og:url", canonical, "property")
    document = _set_meta(document, "og:image", image, "property")
    if image_alt:
        document = _set_meta(document, "og:image:alt", image_alt, "property")
    if image_dimensions:
        document = _set_meta(document, "og:image:width", str(image_dimensions[0]), "property")
        document = _set_meta(document, "og:image:height", str(image_dimensions[1]), "property")
    else:
        document = _remove_meta(document, "og:image:width", "property")
        document = _remove_meta(document, "og:image:height", "property")
    document = _set_meta(document, "twitter:card", "summary_large_image")
    document = _set_meta(document, "twitter:title", title)
    document = _set_meta(document, "twitter:description", description)
    document = _set_meta(document, "twitter:image", image)
    document = _set_canonical(document, canonical)
    if favicon:
        document = _set_link(document, "icon", favicon, type="image/x-icon")
        document = _set_link(document, "shortcut icon", favicon, type="image/x-icon")
    if apple_touch_icon:
        document = _set_link(document, "apple-touch-icon", apple_touch_icon, sizes="180x180")
    if theme_color:
        document = _set_meta(document, "theme-color", theme_color)
    if schema:
        payload = json.dumps(schema, ensure_ascii=False).replace("</", "<\\/")
        safe_schema_id = escape(schema_id, quote=True)
        document = document.replace(
            "</head>",
            f'    <script type="application/ld+json" data-seo-id="{safe_schema_id}">{payload}</script>\n  </head>',
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
    "about": {
        "title": "About the Bookshop | RealMindX",
        "description": "Learn about RealMindX Bookshop, Ghana's educational books, stationery, and learning materials shop.",
        "intro": "RealMindX Bookshop helps learners, parents, teachers, and schools access trusted educational books and learning materials.",
    },
    "contact": {
        "title": "Contact the Bookshop | RealMindX",
        "description": "Contact RealMindX Bookshop in Accra for educational books, delivery support, school orders, and general enquiries.",
        "intro": "Contact the RealMindX Bookshop team for product help, school orders, delivery support, and general enquiries.",
    },
    "privacy": {
        "title": "Privacy Policy | RealMindX Bookshop",
        "description": "How RealMindX Bookshop collects, uses, and protects customer and account information.",
        "intro": "Read how RealMindX Bookshop handles customer, account, order, and delivery information.",
    },
    "terms": {
        "title": "Terms and Conditions | RealMindX Bookshop",
        "description": "Terms governing use of the RealMindX Bookshop and purchases made through the platform.",
        "intro": "Read the terms that apply when using the RealMindX Bookshop or placing an order.",
    },
    "track": {
        "title": "Track Your Order | RealMindX Bookshop",
        "description": "Track a RealMindX Bookshop order by order reference or checkout email address.",
        "intro": "Track the status of a RealMindX Bookshop order using the order reference or checkout email address.",
    },
    "invoice": {
        "title": "Receipt/Invoice Verification | RealMindX Bookshop",
        "description": "Verify a RealMindX Bookshop receipt or invoice by exact ID and view the branded PDF online.",
        "intro": "Verify a RealMindX Bookshop receipt or invoice by exact ID, view the PDF online, and download a copy.",
    },
    "documents": {
        "title": "Education Documents | RealMindX Bookshop",
        "description": "Browse useful education documents, guides, templates and learning resources from RealMindX Bookshop.",
        "intro": "Browse practical education documents, school templates, teacher guides and learning resources from RealMindX Bookshop.",
    },
    "exam-picks": {
        "title": "BECE and WASSCE Textbooks in Ghana | RealMindX Bookshop",
        "description": "Browse textbooks and learning materials selected for BECE and WASSCE learners following Ghana's GES and NaCCA curriculum.",
        "intro": "Explore textbooks and learning materials for Junior High BECE and Senior High WASSCE preparation.",
    },
}


MAIN_PAGE_PROFILES = {
    "": {
        "title": "RealMindX Education | Ghana's Educational Services Provider",
        "description": "Ghana's comprehensive educational services provider for teacher recruitment, CPD, school transformation, tutoring, books, and more.",
        "heading": "RealMindX Education",
    },
    "about": {
        "title": "About RealMindX Education | Ghana",
        "description": "Learn about RealMindX Education Limited, our mission, leadership, and commitment to improving education across Ghana.",
        "heading": "About RealMindX Education",
    },
    "services": {
        "title": "Educational Services | RealMindX Education Ghana",
        "description": "Explore RealMindX education services, including teacher recruitment, teacher development, school structuring, tutoring, and special education.",
        "heading": "RealMindX Educational Services",
    },
    "jobs": {
        "title": "Teaching Jobs in Ghana | RealMindX Jobs Board",
        "description": "Browse teaching vacancies across Ghana and apply for opportunities through the RealMindX Jobs Board.",
        "heading": "Teaching Jobs in Ghana",
    },
    "contact": {
        "title": "Contact RealMindX Education | Accra, Ghana",
        "description": "Contact RealMindX Education Limited for educational services, school support, teacher recruitment, and general enquiries.",
        "heading": "Contact RealMindX Education",
    },
    "news": {
        "title": "News and Updates | RealMindX Education",
        "description": "Read the latest news, announcements, and education updates from RealMindX Education Limited in Ghana.",
        "heading": "RealMindX News and Updates",
    },
    "gallery": {
        "title": "Gallery | RealMindX Education Ghana",
        "description": "View photos from RealMindX programmes, school visits, teacher training, and education events across Ghana.",
        "heading": "RealMindX Gallery",
    },
    "resources": {
        "title": "Education Resources | RealMindX Education",
        "description": "Access helpful guides, tools, and learning resources from RealMindX Education.",
        "heading": "Education Resources",
    },
    "donate": {
        "title": "Donate | Support Education in Ghana | RealMindX",
        "description": "Support quality education in Ghana through RealMindX learning materials, teacher development, and learner support programmes.",
        "heading": "Support Education in Ghana",
    },
    "privacy": {
        "title": "Privacy Policy | RealMindX Education",
        "description": "How RealMindX Education Limited collects, uses, and protects personal information.",
        "heading": "Privacy Policy",
    },
    "terms": {
        "title": "Terms of Service | RealMindX Education",
        "description": "Terms governing use of the RealMindX Education platform, job portal, services, and related features.",
        "heading": "Terms of Service",
    },
}


def _link_list(items, css_class="seo-link-list"):
    links = "".join(
        f'<li><a href="{escape(href, quote=True)}">{escape(label)}</a></li>'
        for href, label in items
    )
    return f'<ul class="{escape(css_class, quote=True)}">{links}</ul>' if links else ""


def _product_url(product):
    return f"/products/{product.slug}"


def _bookshop_product_links(products):
    return [(_product_url(product), product.name) for product in products]


def _active_products(limit=24):
    return (
        Product.query.filter(Product.is_active.is_(True))
        .order_by(Product.updated_at.desc(), Product.id.desc())
        .limit(limit)
        .all()
    )


def _taxonomy_products(taxonomy, label, limit=24):
    query = Product.query.filter(Product.is_active.is_(True))
    if taxonomy == "category":
        category = ProductCategory.query.filter_by(slug=slugify(label), is_active=True).first()
        if category is None:
            return []
        query = query.filter(Product.category_id == category.id)
    else:
        column = {
            "subject": Product.subject,
            "level": Product.level,
            "curriculum": Product.curriculum,
            "publisher": Product.publisher,
        }.get(taxonomy)
        if column is None:
            return []
        query = query.filter(column == label)
    return query.order_by(Product.updated_at.desc(), Product.id.desc()).limit(limit).all()


def _taxonomy_links(taxonomy):
    route = {
        "subject": "subjects",
        "level": "levels",
        "curriculum": "curriculum",
        "category": "categories",
        "publisher": "publishers",
    }[taxonomy]
    if taxonomy == "category":
        rows = (
            ProductCategory.query.join(Product, Product.category_id == ProductCategory.id)
            .filter(ProductCategory.is_active.is_(True), Product.is_active.is_(True))
            .distinct()
            .order_by(ProductCategory.name.asc())
            .all()
        )
        return [(f"/{route}/{row.slug}", row.name) for row in rows]
    column = {
        "subject": Product.subject,
        "level": Product.level,
        "curriculum": Product.curriculum,
        "publisher": Product.publisher,
    }[taxonomy]
    values = sorted({
        str(row[0]).strip()
        for row in db.session.query(column)
        .filter(Product.is_active.is_(True), column.isnot(None), column != "")
        .all()
        if row[0] and str(row[0]).strip()
    })
    return [(f"/{route}/{slugify(value)}", value) for value in values]


def _bookshop_markup(title, intro, links=None, link_heading="Browse educational products"):
    navigation = _link_list([
        ("/products", "All products"),
        ("/subjects", "Subjects"),
        ("/levels", "School levels"),
        ("/curriculum", "Curricula"),
        ("/categories", "Categories"),
        ("/publishers", "Publishers"),
        ("/documents", "Education documents"),
    ], "seo-primary-links")
    related = ""
    if links:
        related = f"<h2>{escape(link_heading)}</h2>{_link_list(links)}"
    return (
        '<main class="bs bs-fade-page" data-seo-prerendered="bookshop">'
        '<section class="bs-container" style="padding:64px 20px">'
        '<p class="bs-eyebrow">RealMindX Bookshop</p>'
        f"<h1 class=\"bs-h1\">{escape(title)}</h1>"
        f"<p class=\"bs-muted\" style=\"max-width:760px\">{escape(intro)}</p>"
        f'<nav aria-label="Bookshop sections">{navigation}</nav>{related}'
        '<p>RealMindX supplies curriculum-aligned textbooks, revision books, workbooks and classroom resources to learners, parents, teachers and schools across Ghana.</p>'
        "</section></main>"
    )


def _bookshop_product_markup(product, description, image_url):
    details = []
    for label, value in (
        ("Author", product.author),
        ("Publisher", product.publisher),
        ("Subject", product.subject),
        ("Level", product.level),
        ("Curriculum", product.curriculum),
    ):
        if value:
            details.append(f"<dt>{escape(label)}</dt><dd>{escape(str(value))}</dd>")
    image = (
        f'<img src="{escape(image_url, quote=True)}" alt="{escape(product.name, quote=True)}" '
        'style="max-width:360px;width:100%;height:auto" />'
        if image_url else ""
    )
    stock = "In stock" if product.stock_status == "in_stock" else "Currently out of stock"
    return (
        '<main class="bs bs-fade-page" data-seo-prerendered="bookshop-product">'
        '<article class="bs-container" style="padding:48px 20px">'
        '<nav aria-label="Breadcrumb"><a href="/">Bookshop</a> / <a href="/products">Products</a></nav>'
        f"<h1 class=\"bs-h1\">{escape(product.name)}</h1>{image}"
        f'<p><strong>GH&#8373; {escape(str(product.price))}</strong> &middot; {escape(stock)}</p>'
        f"<p>{escape(description)}</p>"
        f"<dl>{''.join(details)}</dl>"
        '<p><a href="/products">Browse all educational books and learning materials</a></p>'
        "</article></main>"
    )


def _main_page_markup(profile, links=None, link_heading="Explore RealMindX"):
    navigation = _link_list([
        ("/about", "About"),
        ("/services", "Educational services"),
        ("/jobs", "Teaching jobs"),
        ("/news", "News"),
        ("/resources", "Resources"),
        ("/contact", "Contact"),
    ], "seo-primary-links")
    related = f"<h2>{escape(link_heading)}</h2>{_link_list(links)}" if links else ""
    return (
        '<main class="route-page" data-seo-prerendered="main-page">'
        '<section class="page-hero route-page-hero"><div class="container">'
        '<p class="overline">RealMindX Education</p>'
        f"<h1>{escape(profile['heading'])}</h1>"
        f"<p>{escape(profile['description'])}</p>"
        f'<nav aria-label="Main sections">{navigation}</nav>{related}'
        '<p>RealMindX Education supports learners, teachers, schools and families across Ghana through recruitment, professional development, tutoring, school improvement and educational resources.</p>'
        "</div></section></main>"
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
        category = (
            ProductCategory.query.join(Product, Product.category_id == ProductCategory.id)
            .filter(
                ProductCategory.slug == slug,
                ProductCategory.is_active.is_(True),
                Product.is_active.is_(True),
            )
            .first()
        )
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


def _approved_product_reviews(product):
    return (
        ProductReview.query.filter(
            ProductReview.product_id == product.id,
            ProductReview.status.in_(["approved", "published"]),
            ProductReview.rating >= 1,
            ProductReview.rating <= 5,
        )
        .order_by(ProductReview.created_at.desc(), ProductReview.id.desc())
    )


def _bookshop_product_rating_summary(product):
    ratings = [
        int(row[0] or 0)
        for row in db.session.query(ProductReview.rating)
        .filter(
            ProductReview.product_id == product.id,
            ProductReview.status.in_(["approved", "published"]),
            ProductReview.rating >= 1,
            ProductReview.rating <= 5,
        )
        .all()
    ]
    if not ratings:
        return 0, 0
    return round(sum(ratings) / len(ratings), 1), len(ratings)


def _bookshop_product_reviews(product, limit=3):
    reviews = _approved_product_reviews(product).limit(limit).all()
    payload = []
    for review in reviews:
        body = (review.title or review.comment or "").strip()
        if review.title and review.comment:
            body = f"{review.title} - {review.comment}".strip()
        if not body:
            body = f"{int(review.rating or 0)}-star review from a verified buyer."
        item = {
            "@type": "Review",
            "author": {
                "@type": "Person",
                "name": review.customer_name or "Verified Buyer",
            },
            "reviewBody": body,
            "reviewRating": {
                "@type": "Rating",
                "ratingValue": int(review.rating or 0),
                "bestRating": 5,
                "worstRating": 1,
            },
        }
        if review.created_at:
            item["datePublished"] = review.created_at.date().isoformat()
        payload.append(item)
    return payload


def _bookshop_shipping_rate_max():
    fees = [
        float(row[0] or 0)
        for row in db.session.query(DeliveryZone.fee)
        .filter(
            DeliveryZone.is_active.is_(True),
            DeliveryZone.is_delivery_area.is_(True),
            DeliveryZone.is_search_alias_only.is_(False),
        )
        .all()
    ]
    return max(fees or [BOOKSHOP_SHIPPING_RATE_FALLBACK_MAX])


def _bookshop_shipping_details():
    return {
        "@type": "OfferShippingDetails",
        "shippingDestination": {
            "@type": "DefinedRegion",
            "addressCountry": "GH",
        },
        "shippingRate": {
            "@type": "MonetaryAmount",
            "currency": "GHS",
            "maxValue": f"{_bookshop_shipping_rate_max():.2f}",
        },
        "deliveryTime": BOOKSHOP_DELIVERY_TIME,
    }


def job_path(job):
    return f"/jobs/{job.id}-{slugify(job.title)}"


def _job_markup(job):
    pieces = [
        '<main class="route-page" data-seo-prerendered="job">',
        '<article class="container" style="max-width:900px;padding:48px 20px">',
        '<nav aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/jobs">Teaching jobs</a></nav>',
        f"<h1>{escape(job.title)}</h1>",
        f"<p><strong>{escape(job.organisation or 'RealMindX partner school')}</strong></p>",
        f"<p>{escape(job.location)}",
    ]
    for value in (job.employment_type, job.subject, job.level, job.curriculum):
        if value:
            pieces.append(f" &middot; {escape(value)}")
    pieces.append("</p>")
    if job.deadline:
        pieces.append(f"<p><strong>Application deadline:</strong> {escape(job.deadline.isoformat())}</p>")
    for heading, value in (
        ("About the role", job.description),
        ("Responsibilities", job.responsibilities),
        ("Requirements", job.requirements),
    ):
        paragraphs = _paragraphs(value)
        if paragraphs:
            pieces.append(f"<h2>{escape(heading)}</h2>")
            pieces.extend(f"<p>{escape(paragraph)}</p>" for paragraph in paragraphs)
    pieces.extend([
        '<p><a href="/login">Sign in to apply</a> or <a href="/register">create a teacher account</a>.</p>',
        '<p><a href="/jobs">Browse all teaching jobs in Ghana</a></p>',
        "</article></main>",
    ])
    return "".join(pieces)


def job_public_page(segment):
    if request.host.split(":", 1)[0].lower().startswith("bookshop."):
        return public_not_found_page(request.path)
    document = _frontend_document()
    if document is None:
        return Response("The jobs page is temporarily unavailable.", status=503, mimetype="text/plain")
    match = re.match(r"^(\d+)(?:-|$)", str(segment or ""))
    job = Job.query.filter_by(id=int(match.group(1)), status="published").first() if match else None
    requested = f"/jobs/{str(segment or '').strip('/')}"
    if job is None:
        rendered = _render_document(
            document,
            title="Job Not Found | RealMindX Education",
            description="That job link does not match a currently published RealMindX teaching vacancy.",
            canonical=f"{MAIN_SITE_BASE_URL}{requested}",
            robots="noindex,follow",
            image=SITE_DEFAULT_IMAGE,
            markup=(
                '<main class="route-page"><section class="page-hero route-page-hero"><div class="container">'
                '<h1>Job Not Found</h1><p>This vacancy is not currently available.</p>'
                '<p><a href="/jobs">Browse current teaching jobs</a></p></div></section></main>'
            ),
            favicon=EDUCATION_FAVICON,
            apple_touch_icon=EDUCATION_APPLE_TOUCH_ICON,
            theme_color="#143670",
        )
        response = Response(rendered, status=404, mimetype="text/html")
        response.headers["X-Robots-Tag"] = "noindex, follow"
        return response
    canonical_path = job_path(job)
    canonical = f"{MAIN_SITE_BASE_URL}{canonical_path}"
    if requested != canonical_path or request.path.endswith("/"):
        return redirect(canonical, code=301)
    description = job.description.strip() or f"Apply for {job.title} in {job.location} through RealMindX Education."
    schema = {
        "@context": "https://schema.org",
        "@type": "JobPosting",
        "title": job.title,
        "description": description,
        "datePosted": job.created_at.date().isoformat() if job.created_at else None,
        "validThrough": f"{job.deadline.isoformat()}T23:59:59+00:00" if job.deadline else None,
        "employmentType": job.employment_type,
        "hiringOrganization": {
            "@type": "Organization",
            "name": job.organisation or "RealMindX Education partner school",
        },
        "jobLocation": {
            "@type": "Place",
            "address": {"@type": "PostalAddress", "addressLocality": job.location, "addressCountry": "GH"},
        },
        "url": canonical,
    }
    if job.salary_min is not None or job.salary_max is not None:
        minimum = float(job.salary_min) if job.salary_min is not None else float(job.salary_max)
        maximum = float(job.salary_max) if job.salary_max is not None else float(job.salary_min)
        schema["baseSalary"] = {
            "@type": "MonetaryAmount",
            "currency": job.salary_currency or "GHS",
            "value": {"@type": "QuantitativeValue", "minValue": minimum, "maxValue": maximum, "unitText": "MONTH"},
        }
    schema = {key: value for key, value in schema.items() if value is not None}
    rendered = _render_document(
        document,
        title=f"{job.title} in {job.location} | RealMindX Jobs",
        description=description,
        canonical=canonical,
        robots="index,follow",
        image=SITE_DEFAULT_IMAGE,
        markup=_job_markup(job),
        schema=schema,
        og_type="website",
        site_name="RealMindX Education",
        image_alt=job.title,
        image_dimensions=(1200, 630),
        favicon=EDUCATION_FAVICON,
        apple_touch_icon=EDUCATION_APPLE_TOUCH_ICON,
        theme_color="#143670",
    )
    response = Response(rendered, status=200, mimetype="text/html")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response


def bookshop_public_page(path=""):
    if not request.host.split(":", 1)[0].lower().startswith("bookshop."):
        clean_redirect_path = str(path or "").strip("/")
        target = BOOKSHOP_SITE_BASE_URL if not clean_redirect_path else f"{BOOKSHOP_SITE_BASE_URL}/{clean_redirect_path}"
        return redirect(target, code=301)
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
    markup = None
    related_products = []
    related_links = []
    related_heading = "Available products"

    if not clean_path:
        route_key = "home"
        profile = BOOKSHOP_LANDING_PROFILES[route_key]
        related_products = _active_products(limit=12)
    elif clean_path == "products":
        profile = BOOKSHOP_LANDING_PROFILES["products"]
        related_products = _active_products()
    elif clean_path in {"about", "contact", "privacy", "terms", "track", "invoice", "documents"}:
        profile = BOOKSHOP_LANDING_PROFILES[clean_path]
    elif clean_path in {"collections/exam-picks", "collections/bece-picks", "collections/wassce-picks"}:
        if clean_path != "collections/exam-picks":
            return redirect(f"{BOOKSHOP_SITE_BASE_URL}/collections/exam-picks", code=301)
        profile = BOOKSHOP_LANDING_PROFILES["exam-picks"]
    elif clean_path.startswith("products/"):
        slug = clean_path.split("/", 1)[1]
        product = Product.query.filter_by(slug=slug, is_active=True).first()
        if not product and re.search(r"-\d+$", slug):
            try:
                product_id = int(slug.rsplit("-", 1)[1])
            except (TypeError, ValueError):
                product_id = None
            if product_id is not None:
                product = Product.query.filter_by(id=product_id, is_active=True).first()
        if product:
            expected_path = _product_url(product)
            if canonical_path != expected_path:
                return redirect(f"{BOOKSHOP_SITE_BASE_URL}{expected_path}", code=301)
            canonical = f"{BOOKSHOP_SITE_BASE_URL}{expected_path}"
            title = f"{product.name} | RealMindX Bookshop"
            description = product.short_description or product.full_description or "Educational books and learning materials available from RealMindX Bookshop."
            product_display_file = product.image_medium_file or product.image_file
            product_image = _absolute_url(upload_public_url(product_display_file), BOOKSHOP_SITE_BASE_URL)
            image = book_og_public_url(product, BOOKSHOP_SITE_BASE_URL)
            profile = {"title": title, "description": description, "intro": description}
            og_type = "product"
            approved_reviews = _bookshop_product_reviews(product, limit=3)
            rating_average, rating_count = _bookshop_product_rating_summary(product)
            schema = {
                "@context": "https://schema.org",
                "@type": "Product",
                "name": product.name,
                "description": description,
                "image": product_image or image,
                "sku": str(product.id),
                "category": product.category.name if product.category else "Educational books",
                "brand": {
                    "@type": "Brand",
                    "name": product.publisher or "RealMindX Bookshop",
                },
                "offers": {
                    "@type": "Offer",
                    "priceCurrency": "GHS",
                    "price": str(product.price),
                    "availability": "https://schema.org/InStock" if product.stock_status == "in_stock" else "https://schema.org/OutOfStock",
                    "url": canonical,
                    "shippingDetails": _bookshop_shipping_details(),
                    "hasMerchantReturnPolicy": BOOKSHOP_RETURN_POLICY,
                },
            }
            if rating_count:
                schema["aggregateRating"] = {
                    "@type": "AggregateRating",
                    "ratingValue": rating_average,
                    "reviewCount": rating_count,
                    "bestRating": 5,
                    "worstRating": 1,
                }
            if approved_reviews:
                schema["review"] = approved_reviews
            breadcrumb = {
                "@context": "https://schema.org",
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "Bookshop", "item": BOOKSHOP_SITE_BASE_URL},
                    {"@type": "ListItem", "position": 2, "name": "Products", "item": f"{BOOKSHOP_SITE_BASE_URL}/products"},
                    {"@type": "ListItem", "position": 3, "name": product.name, "item": canonical},
                ],
            }
            schema = [schema, breadcrumb]
            markup = _bookshop_product_markup(product, description, product_image)
        else:
            status = 404
            robots = "noindex, follow"
            profile = {
                "title": "Product Not Found | RealMindX Bookshop",
                "description": "That product link does not match a currently published RealMindX Bookshop item.",
                "intro": "That product link does not match a currently published RealMindX Bookshop item.",
            }
    elif clean_path.startswith("documents/"):
        segment = clean_path.split("/", 1)[1]
        match = re.match(r"^(\d+)(?:-|$)", segment)
        resource = public_resource_query().filter(Resource.id == int(match.group(1))).first() if match else None
        if resource:
            expected_path = resource_path(resource)
            if canonical_path != expected_path:
                return redirect(f"{BOOKSHOP_SITE_BASE_URL}{expected_path}", code=301)
            description = resource.description or f"View {resource.title} in the RealMindX Ghana Education Resource Library."
            profile = {
                "title": f"{resource.title} | RealMindX Education Resource Library",
                "description": description,
                "intro": description,
            }
            schema = {
                "@context": "https://schema.org",
                "@type": "DigitalDocument",
                "name": resource.title,
                "description": description,
                "url": canonical,
                "dateModified": (resource.updated_at or resource.created_at).date().isoformat(),
                "publisher": {
                    "@type": "Organization",
                    "name": resource.source or "RealMindX Education Limited",
                },
            }
            if resource.document_type:
                schema["genre"] = resource.document_type
            if resource.subject:
                schema["about"] = resource.subject
            if resource.audience:
                schema["audience"] = {"@type": "Audience", "audienceType": resource.audience}
        else:
            status = 404
            robots = "noindex, follow"
            profile = {
                "title": "Resource Not Found | RealMindX Bookshop",
                "description": "That resource is not currently published in the RealMindX Education Resource Library.",
                "intro": "That resource is not currently published in the RealMindX Education Resource Library.",
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
            related_links = _taxonomy_links(taxonomy)
            related_heading = f"Browse by {taxonomy}"
        elif taxonomy and len(parts) == 2:
            slug = slugify(parts[1])
            label = _find_taxonomy_label(taxonomy, slug)
            if label is None:
                status = 404
                robots = "noindex, follow"
                profile = {
                    "title": "Catalogue Page Not Found | RealMindX Bookshop",
                    "description": "That catalogue link does not match a current RealMindX Bookshop subject, level, curriculum, category or publisher.",
                    "intro": "That catalogue page is not currently available.",
                }
            else:
                profile = _bookshop_profile(taxonomy, label)
                canonical_route = "curriculum" if route_key == "curricula" else route_key
                canonical = f"{BOOKSHOP_SITE_BASE_URL}/{canonical_route}/{slug}"
                if request.path.rstrip("/") != f"/{canonical_route}/{slug}":
                    return redirect(canonical, code=301)
                related_products = _taxonomy_products(taxonomy, label)
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
        markup=markup or _bookshop_markup(
            profile["title"].split("|", 1)[0].strip(),
            profile["intro"],
            related_links or _bookshop_product_links(related_products),
            related_heading,
        ),
        schema=schema,
        schema_id="bookshop-route-seo",
        og_type=og_type,
        site_name="RealMindX Bookshop",
        image_alt=f"{profile['title'].split('|', 1)[0].strip()} social preview",
        image_dimensions=(1200, 630),
        favicon=BOOKSHOP_FAVICON,
        apple_touch_icon=BOOKSHOP_APPLE_TOUCH_ICON,
        theme_color="#062B69",
    )
    response = Response(rendered, status=status, mimetype="text/html")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    if status >= 400:
        response.headers["X-Robots-Tag"] = "noindex, follow"
    return response


def main_public_page(path=""):
    clean_path = str(path or "").strip("/")
    profile = MAIN_PAGE_PROFILES.get(clean_path)
    if profile is None:
        return Response("Page not found.", status=404, mimetype="text/plain")

    canonical = MAIN_SITE_BASE_URL if not clean_path else f"{MAIN_SITE_BASE_URL}/{clean_path}"
    if request.path.endswith("/") and clean_path:
        return redirect(canonical, code=301)
    document = _frontend_document()
    if document is None:
        return Response("The page is temporarily unavailable.", status=503, mimetype="text/plain")

    links = None
    link_heading = "Explore RealMindX"
    if clean_path == "jobs":
        jobs = Job.query.filter_by(status="published").order_by(Job.created_at.desc()).limit(30).all()
        links = [(job_path(job), f"{job.title} — {job.location}") for job in jobs]
        link_heading = "Current teaching vacancies"
    elif clean_path == "services":
        services = public_rows(setting_collection("services", DEFAULT_SERVICES))
        links = [
            (f"/services/{slugify(item.get('id') or item.get('slug') or item.get('label') or item.get('title'))}", item.get("label") or item.get("title") or "Education service")
            for item in services
        ]
        link_heading = "Our educational services"
    elif clean_path == "news":
        rows = News.query.filter_by(status="published").order_by(News.published_at.desc().nullslast(), News.created_at.desc()).limit(30).all()
        links = [(f"/news/{row.slug}", row.title) for row in rows]
        link_heading = "Latest education news"
    elif clean_path == "resources":
        rows = public_resource_query().order_by(Resource.updated_at.desc(), Resource.id.desc()).limit(30).all()
        links = [(f"{BOOKSHOP_SITE_BASE_URL}{resource_path(row)}", row.title) for row in rows]
        link_heading = "Published education resources"
    rendered = _render_document(
        document,
        title=profile["title"],
        description=profile["description"],
        canonical=canonical,
        robots="index,follow",
        image=SITE_DEFAULT_IMAGE,
        markup=_main_page_markup(profile, links, link_heading),
        site_name="RealMindX Education",
        image_alt=profile["heading"],
        image_dimensions=(1200, 630),
        favicon=EDUCATION_FAVICON,
        apple_touch_icon=EDUCATION_APPLE_TOUCH_ICON,
        theme_color="#143670",
    )
    response = Response(rendered, status=200, mimetype="text/html")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response


def private_app_page(path=""):
    clean_path = str(path or "").strip("/")
    bookshop = request.host.split(":", 1)[0].lower().startswith("bookshop.")
    base_url = BOOKSHOP_SITE_BASE_URL if bookshop else MAIN_SITE_BASE_URL
    canonical = base_url if not clean_path else f"{base_url}/{clean_path}"
    document = _frontend_document()
    if document is None:
        return Response("The portal is temporarily unavailable.", status=503, mimetype="text/plain")

    rendered = _render_document(
        document,
        title="RealMindX Bookshop Secure Page" if bookshop else "RealMindX Secure Portal",
        description="Secure access for authorised RealMindX users.",
        canonical=canonical,
        robots="noindex, nofollow",
        image=BOOKSHOP_DEFAULT_IMAGE if bookshop else SITE_DEFAULT_IMAGE,
        markup="",
        site_name="RealMindX Bookshop" if bookshop else "RealMindX Education",
        image_alt="RealMindX Bookshop" if bookshop else "RealMindX Education",
        image_dimensions=(1200, 630),
        favicon=BOOKSHOP_FAVICON if bookshop else EDUCATION_FAVICON,
        apple_touch_icon=BOOKSHOP_APPLE_TOUCH_ICON if bookshop else EDUCATION_APPLE_TOUCH_ICON,
        theme_color="#062B69" if bookshop else "#143670",
    )
    response = Response(rendered, status=200, mimetype="text/html")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    return response


def public_not_found_page(path=""):
    clean_path = str(path or "").strip("/")
    bookshop = request.host.split(":", 1)[0].lower().startswith("bookshop.")
    base_url = BOOKSHOP_SITE_BASE_URL if bookshop else MAIN_SITE_BASE_URL
    document = _frontend_document()
    if document is None:
        return Response("Page not found.", status=404, mimetype="text/plain")
    title = "Page Not Found | RealMindX Bookshop" if bookshop else "Page Not Found | RealMindX Education"
    home_label = "Return to the Bookshop" if bookshop else "Return to RealMindX Education"
    rendered = _render_document(
        document,
        title=title,
        description="That address does not match a currently available RealMindX page.",
        canonical=f"{base_url}/{clean_path}" if clean_path else base_url,
        robots="noindex,follow",
        image=BOOKSHOP_DEFAULT_IMAGE if bookshop else SITE_DEFAULT_IMAGE,
        markup=(
            '<main class="route-page"><section class="page-hero route-page-hero"><div class="container">'
            f'<h1>Page Not Found</h1><p>We could not find that page.</p><p><a href="/">{escape(home_label)}</a></p>'
            "</div></section></main>"
        ),
        site_name="RealMindX Bookshop" if bookshop else "RealMindX Education",
        favicon=BOOKSHOP_FAVICON if bookshop else EDUCATION_FAVICON,
        apple_touch_icon=BOOKSHOP_APPLE_TOUCH_ICON if bookshop else EDUCATION_APPLE_TOUCH_ICON,
        theme_color="#062B69" if bookshop else "#143670",
    )
    response = Response(rendered, status=404, mimetype="text/html")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["X-Robots-Tag"] = "noindex, follow"
    return response


def news_article_page(slug):
    if request.host.split(":", 1)[0].lower().startswith("bookshop."):
        return public_not_found_page(request.path)
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
            image=SITE_DEFAULT_IMAGE,
            markup=_not_found_markup(),
            route_data={"news": []},
            image_alt="RealMindX Education",
            image_dimensions=(1200, 630),
            favicon=EDUCATION_FAVICON,
            apple_touch_icon=EDUCATION_APPLE_TOUCH_ICON,
            theme_color="#143670",
        )
        response = Response(rendered, status=404, mimetype="text/html")
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        return response

    sections = enrich_news_sections(row.sections or [])
    image_url = _absolute_url(upload_public_url(row.image_file)) or SITE_DEFAULT_IMAGE
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
        image_alt=row.title,
        favicon=EDUCATION_FAVICON,
        apple_touch_icon=EDUCATION_APPLE_TOUCH_ICON,
        theme_color="#143670",
    )
    response = Response(rendered, status=200, mimetype="text/html")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response


def service_public_page(slug):
    if request.host.split(":", 1)[0].lower().startswith("bookshop."):
        return public_not_found_page(request.path)
    canonical_slug = slugify(slug)
    canonical = f"{MAIN_SITE_BASE_URL}/services/{canonical_slug}"
    if request.path.endswith("/"):
        return redirect(canonical, code=301)

    document = _frontend_document()
    if document is None:
        return Response("The service page is temporarily unavailable.", status=503, mimetype="text/plain")

    services = enrich_service_media(public_rows(setting_collection("services", DEFAULT_SERVICES)))
    service = next(
        (
            item for item in services
            if slugify(item.get("id") or item.get("slug") or item.get("label") or item.get("title")) == canonical_slug
        ),
        None,
    )
    if service is None:
        title = "Service Not Found | RealMindX Education"
        description = "That service link does not match a currently published RealMindX service."
        rendered = _render_document(
            document,
            title=title,
            description=description,
            canonical=canonical,
            robots="noindex,follow",
            image=SITE_DEFAULT_IMAGE,
            markup=_not_found_markup(),
            image_alt="RealMindX Education",
            image_dimensions=(1200, 630),
            favicon=EDUCATION_FAVICON,
            apple_touch_icon=EDUCATION_APPLE_TOUCH_ICON,
            theme_color="#143670",
        )
        response = Response(rendered, status=404, mimetype="text/html")
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        return response

    label = service.get("label") or service.get("title") or "RealMindX Service"
    description = (
        service.get("detail_summary")
        or service.get("summary")
        or next(iter(_paragraphs(service.get("detail_body") or service.get("body"))), "")
        or f"Learn how RealMindX delivers {label.lower()} services across Ghana."
    )
    image_url = _service_image(service)
    title = f"{label} | RealMindX Education Ghana"
    schema = {
        "@context": "https://schema.org",
        "@type": "Service",
        "name": label,
        "description": description,
        "image": image_url,
        "provider": {
            "@type": "EducationalOrganization",
            "name": "RealMindX Education Limited",
            "url": MAIN_SITE_BASE_URL,
        },
        "areaServed": {
            "@type": "Country",
            "name": "Ghana",
        },
        "url": canonical,
    }
    rendered = _render_document(
        document,
        title=title,
        description=description,
        canonical=canonical,
        robots="index,follow",
        image=image_url,
        markup=_service_markup(service, image_url),
        schema=schema,
        image_alt=f"{label} from RealMindX Education",
        favicon=EDUCATION_FAVICON,
        apple_touch_icon=EDUCATION_APPLE_TOUCH_ICON,
        theme_color="#143670",
    )
    response = Response(rendered, status=200, mimetype="text/html")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response
