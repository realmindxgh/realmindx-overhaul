from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal
import hashlib
import ipaddress
import os
import re
from urllib.parse import urlparse

from flask import current_app, request
from flask_login import current_user
from sqlalchemy.orm import selectinload

try:
    import maxminddb
except ImportError:  # Optional during local development before dependencies are installed.
    maxminddb = None

from .extensions import db
from .models import AnalyticsEvent, AuditLog, ContactMessage, JobApplication, News, NewsletterSubscriber, Order, Product
from .order_status import normalize_order_status


SEARCH_HOSTS = {
    "google": "Google",
    "bing": "Bing",
    "duckduckgo": "DuckDuckGo",
    "yahoo": "Yahoo",
    "yandex": "Yandex",
}

SOCIAL_HOSTS = {
    "facebook": "Facebook",
    "instagram": "Instagram",
    "x.com": "X",
    "twitter": "X",
    "t.co": "X",
    "linkedin": "LinkedIn",
    "youtube": "YouTube",
    "whatsapp": "WhatsApp",
}

UNKNOWN_LABEL = "Unknown"
_geoip_reader = None
_geoip_reader_path = None


def parse_analytics_range(args):
    preset = str(args.get("preset") or args.get("range") or "30d").strip().lower()
    now = datetime.now(timezone.utc)
    today = now.date()

    if preset in {"today", "day"}:
        start_date = today
        end_date = today
        label = "Today"
    elif preset in {"7d", "last7", "last-7-days", "last_7_days"}:
        start_date = today - timedelta(days=6)
        end_date = today
        label = "Last 7 days"
        preset = "7d"
    elif preset in {"month", "this-month", "this_month"}:
        start_date = today.replace(day=1)
        end_date = today
        label = "This month"
        preset = "month"
    elif preset in {"custom", "range"}:
        try:
            start_date = datetime.fromisoformat(str(args.get("start"))).date()
            end_date = datetime.fromisoformat(str(args.get("end"))).date()
        except Exception:
            start_date = today - timedelta(days=29)
            end_date = today
            preset = "30d"
            label = "Last 30 days"
        else:
            if end_date < start_date:
                start_date, end_date = end_date, start_date
            label = f"{start_date.isoformat()} to {end_date.isoformat()}"
    else:
        start_date = today - timedelta(days=29)
        end_date = today
        label = "Last 30 days"
        preset = "30d"

    start = datetime.combine(start_date, time.min, tzinfo=timezone.utc)
    end = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=timezone.utc)
    span_days = max(1, (end - start).days)
    compare_end = start
    compare_start = start - timedelta(days=span_days)
    return {
        "preset": preset,
        "label": label,
        "start": start,
        "end": end,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "compare_start": compare_start,
        "compare_end": compare_end,
        "compare_start_date": compare_start.date().isoformat(),
        "compare_end_date": (compare_end - timedelta(days=1)).date().isoformat(),
    }


def _parse_user_agent():
    raw = (request.headers.get("User-Agent") or "").lower()
    if not raw:
        return UNKNOWN_LABEL, UNKNOWN_LABEL, UNKNOWN_LABEL

    if "ipad" in raw or ("tablet" in raw and "mobile" not in raw):
        device = "Tablet"
    elif "mobile" in raw or "iphone" in raw or "android" in raw:
        device = "Mobile"
    else:
        device = "Desktop"

    if "edg/" in raw:
        browser = "Edge"
    elif "opr/" in raw or "opera" in raw:
        browser = "Opera"
    elif "firefox/" in raw:
        browser = "Firefox"
    elif "safari/" in raw and "chrome/" not in raw:
        browser = "Safari"
    elif "chrome/" in raw or "crios/" in raw:
        browser = "Chrome"
    else:
        browser = "Other"

    if "windows" in raw:
        os_name = "Windows"
    elif "iphone" in raw or "ipad" in raw or "ios" in raw:
        os_name = "iOS"
    elif "android" in raw:
        os_name = "Android"
    elif "mac os" in raw or "macintosh" in raw:
        os_name = "macOS"
    elif "linux" in raw:
        os_name = "Linux"
    else:
        os_name = UNKNOWN_LABEL
    return device, browser, os_name


def _clean_host(value):
    host = str(value or "").strip().lower()
    if not host:
        return ""
    return host.split(":", 1)[0]


def _request_host():
    return _clean_host(request.headers.get("X-Forwarded-Host") or request.host)


def _normalize_path(value):
    text = str(value or "").strip()
    if not text:
        return "/"
    if text.startswith("http://") or text.startswith("https://"):
        try:
            parsed = urlparse(text)
            return parsed.path or "/"
        except Exception:
            return "/"
    return text if text.startswith("/") else f"/{text}"


def _derive_page_type(path):
    path = _normalize_path(path)
    if path.startswith("/bookshop/products/"):
        return "product"
    if path.startswith("/bookshop"):
        return "bookshop"
    if path.startswith("/services/"):
        return "service_detail"
    if path == "/services":
        return "services"
    if path.startswith("/news/"):
        return "news_article"
    if path == "/news":
        return "news"
    if path == "/contact":
        return "contact"
    if path == "/jobs":
        return "jobs"
    if path == "/about":
        return "about"
    if path == "/donate":
        return "donate"
    if path.startswith("/admin") or path.startswith("/portal"):
        return "dashboard"
    return "website"


def _source_from_referrer(referrer, explicit_source=None, explicit_medium=None):
    if explicit_source:
        return explicit_source, explicit_medium or "campaign"
    if not referrer:
        return "Direct", "direct"
    try:
        host = _clean_host(urlparse(referrer).netloc)
    except Exception:
        return "Referral", "referral"
    if not host or host == _request_host():
        return "Direct", "direct"
    for token, label in SEARCH_HOSTS.items():
        if token in host:
            return label, "search"
    for token, label in SOCIAL_HOSTS.items():
        if token in host:
            return label, "social"
    return host, "referral"


def _remote_ip():
    forwarded = (
        request.headers.get("X-Real-IP")
        or request.remote_addr
        or request.headers.get("CF-Connecting-IP")
        or request.headers.get("X-Forwarded-For")
        or ""
    )
    return str(forwarded).split(",", 1)[0].strip()


def _anonymize_ip(raw_ip):
    if not raw_ip:
        return None, None
    try:
        parsed = ipaddress.ip_address(raw_ip)
    except ValueError:
        return None, None
    digest = hashlib.sha256(raw_ip.encode("utf-8")).hexdigest()
    if parsed.version == 4:
        bits = str(parsed).split(".")
        prefix = ".".join(bits[:3] + ["0"])
    else:
        exploded = parsed.exploded.split(":")
        prefix = ":".join(exploded[:4]) + "::"
    return digest, prefix


def _localized_geoip_name(value):
    if not isinstance(value, dict):
        return None
    names = value.get("names")
    if isinstance(names, dict):
        return names.get("en") or next((name for name in names.values() if name), None)
    return value.get("name")


def _geoip_location(raw_ip):
    global _geoip_reader, _geoip_reader_path
    if not raw_ip or maxminddb is None:
        return None, None, None
    try:
        parsed = ipaddress.ip_address(raw_ip)
    except ValueError:
        return None, None, None
    if not parsed.is_global:
        return None, None, None

    database_path = str(current_app.config.get("GEOIP_DATABASE_PATH") or "").strip()
    if not database_path:
        return None, None, None
    resolved_path = os.path.realpath(database_path)
    if not os.path.isfile(resolved_path):
        return None, None, None

    try:
        if _geoip_reader is None or _geoip_reader_path != resolved_path:
            if _geoip_reader is not None:
                _geoip_reader.close()
            _geoip_reader = maxminddb.open_database(resolved_path)
            _geoip_reader_path = resolved_path
        record = _geoip_reader.get(str(parsed)) or {}
    except Exception:
        current_app.logger.exception("Could not resolve analytics GeoIP location.")
        return None, None, None

    country_data = record.get("country") or record.get("registered_country") or {}
    country = country_data.get("iso_code") if isinstance(country_data, dict) else None
    subdivisions = record.get("subdivisions") or []
    region_data = subdivisions[-1] if isinstance(subdivisions, list) and subdivisions else {}
    region = _localized_geoip_name(region_data)
    city = _localized_geoip_name(record.get("city") or {})
    return country, region, city


def _location_from_headers():
    headers = request.headers
    header_country = (
        headers.get("CF-IPCountry")
        or headers.get("CF-Country")
        or headers.get("X-Country-Code")
        or headers.get("X-Geo-Country")
        or headers.get("X-Vercel-IP-Country")
        or headers.get("CloudFront-Viewer-Country")
        or None
    )
    header_region = (
        headers.get("CF-Region")
        or headers.get("CF-IPCountry-Region")
        or headers.get("CF-Region-Code")
        or headers.get("X-Geo-Region")
        or headers.get("X-Vercel-IP-Country-Region")
        or headers.get("CloudFront-Viewer-Country-Region")
        or None
    )
    header_city = (
        headers.get("CF-IPCity")
        or headers.get("CF-City")
        or headers.get("X-Geo-City")
        or headers.get("X-Vercel-IP-City")
        or headers.get("CloudFront-Viewer-City")
        or None
    )
    if header_country in {"XX", "ZZ"}:
        header_country = None
    geo_country, geo_region, geo_city = _geoip_location(_remote_ip())
    country = geo_country or header_country
    region = geo_region or header_region
    city = geo_city or header_city
    return country, region, city


def _event_details(raw):
    details = raw.get("details")
    if isinstance(details, dict):
        return details
    metadata = raw.get("metadata")
    return metadata if isinstance(metadata, dict) else {}


def _resolve_product_id(value):
    try:
        return int(value) if value not in (None, "", False) else None
    except (TypeError, ValueError):
        return None


def _resolve_news_id(value):
    try:
        return int(value) if value not in (None, "", False) else None
    except (TypeError, ValueError):
        return None


def _resolve_int(value):
    try:
        return int(value) if value not in (None, "", False) else None
    except (TypeError, ValueError):
        return None


def _resolve_decimal(value):
    if value in (None, "", False):
        return None
    try:
        return Decimal(str(value))
    except Exception:
        return None


def _normalize_term(term):
    cleaned = " ".join(str(term or "").strip().split())
    return cleaned


def _slug_key(value):
    text = re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower())
    return text.strip("-")


def _display_label(value, fallback=UNKNOWN_LABEL):
    raw = str(value or "").strip()
    if not raw:
        return fallback
    if any(char in raw for char in " -_/"):
        words = re.split(r"[\s\-_\/]+", raw)
        return " ".join(word.capitalize() for word in words if word)
    return raw


def _metric_bucket(metric_map, labels_map, raw_key, fallback_label):
    key = _slug_key(raw_key) or _slug_key(fallback_label) or "unknown"
    metric = metric_map[key]
    metric["id"] = key
    labels_map[key] = labels_map.get(key) or _display_label(raw_key, fallback_label)
    metric["label"] = labels_map[key]
    return metric


def _mask_security_ip(value):
    raw = str(value or "").strip()
    if not raw:
        return "Unknown"
    if ":" in raw:
        parts = raw.split(":")
        return ":".join(parts[:4]) + "::"
    parts = raw.split(".")
    if len(parts) == 4:
        return ".".join(parts[:3] + ["0"])
    return raw


def queue_analytics_events(payload, *, commit=False):
    events = payload.get("events") if isinstance(payload, dict) and isinstance(payload.get("events"), list) else [payload]
    if len(events) > 50:
        events = events[:50]

    device_type, browser, operating_system = _parse_user_agent()
    raw_ip = _remote_ip()
    ip_hash, ip_prefix = _anonymize_ip(raw_ip)
    country, region, city = _location_from_headers()
    host = _request_host()
    actor_id = current_user.id if getattr(current_user, "is_authenticated", False) else None

    rows = []
    for raw in events:
        if not isinstance(raw, dict):
            continue
        event_type = str(raw.get("event_type") or raw.get("type") or "").strip().lower()
        if not event_type:
            continue
        path = _normalize_path(raw.get("path") or raw.get("pathname") or request.path)
        full_path = str(raw.get("full_path") or raw.get("url") or path)
        referrer = str(raw.get("referrer") or request.referrer or "").strip() or None
        referrer_host = _clean_host(urlparse(referrer).netloc) if referrer else None
        traffic_source, traffic_medium = _source_from_referrer(
            referrer,
            explicit_source=str(raw.get("traffic_source") or "").strip() or None,
            explicit_medium=str(raw.get("traffic_medium") or "").strip() or None,
        )
        row = AnalyticsEvent(
            event_type=event_type,
            session_key=str(raw.get("session_key") or request.cookies.get("rmx_analytics_session") or "").strip() or None,
            visitor_key=str(raw.get("visitor_key") or request.cookies.get("rmx_analytics_visitor") or "").strip() or None,
            user_id=actor_id,
            host=host,
            path=path,
            full_path=full_path[:500],
            page_title=str(raw.get("page_title") or raw.get("title") or "").strip() or None,
            page_type=str(raw.get("page_type") or _derive_page_type(path)).strip() or None,
            referrer=referrer,
            referrer_host=referrer_host or None,
            traffic_source=traffic_source,
            traffic_medium=traffic_medium,
            campaign=str(raw.get("campaign") or "").strip() or None,
            product_id=_resolve_product_id(raw.get("product_id")),
            news_id=_resolve_news_id(raw.get("news_id")),
            service_id=str(raw.get("service_id") or "").strip() or None,
            search_term=_normalize_term(raw.get("search_term")) or None,
            search_scope=str(raw.get("search_scope") or "").strip() or None,
            results_count=_resolve_int(raw.get("results_count")),
            had_results=raw.get("had_results"),
            device_type=device_type,
            browser=browser,
            operating_system=operating_system,
            country=country,
            region=region,
            city=city,
            ip_hash=ip_hash,
            ip_prefix=ip_prefix,
            quantity=_resolve_int(raw.get("quantity")),
            value_amount=_resolve_decimal(raw.get("value_amount")),
            details=_event_details(raw),
        )
        if row.results_count is not None and row.had_results is None:
            row.had_results = row.results_count > 0
        db.session.add(row)
        rows.append(row)

    if commit and rows:
        db.session.commit()
    return rows


def queue_analytics_event(event_type, *, commit=False, **kwargs):
    payload = {"event_type": event_type, **kwargs}
    return queue_analytics_events(payload, commit=commit)


def _human_status(product):
    stock = str(product.stock_status or "").lower()
    if not product.is_active:
        return "Draft"
    if stock == "out_of_stock":
        return "Out of stock"
    return "Active"


def _blank_product_metrics(product):
    return {
        "id": product.id,
        "name": product.name,
        "category": product.category.name if product.category else "General",
        "category_id": product.category_id,
        "status": _human_status(product),
        "stock_status": product.stock_status,
        "stock_quantity": int(product.quantity_available) if product.quantity_available is not None else None,
        "price": float(product.price or 0),
        "views": 0,
        "unique_viewers": set(),
        "add_to_cart": 0,
        "remove_from_cart": 0,
        "add_sessions": set(),
        "remove_sessions": set(),
        "purchases": 0,
        "purchase_sessions": set(),
        "quantity_sold": 0,
        "revenue": Decimal("0"),
        "wishlist_count": 0,
        "wishlist_visitors": set(),
        "cart_abandonment_count": 0,
        "search_impressions": 0,
        "search_clicks": 0,
        "unavailable_searches": 0,
        "search_terms": Counter(),
        "search_impression_terms": Counter(),
        "traffic_sources": Counter(),
        "devices": Counter(),
        "countries": Counter(),
        "regions": Counter(),
        "cities": Counter(),
        "daily_views": Counter(),
        "daily_adds": Counter(),
        "daily_sales": Counter(),
        "daily_revenue": Counter(),
        "daily_search": Counter(),
        "last_sale_at": None,
        "last_view_at": None,
        "last_add_to_cart_at": None,
        "previous_views": 0,
        "interest_delta": 0,
        "interest_delta_pct": 0.0,
        "performance_status": "No activity yet",
    }


def _counter_rows(counter, *, limit=8, key_name="label", include_unknown=False, precision=None):
    rows = []
    for label, value in counter.most_common():
        if not include_unknown and (not label or label == UNKNOWN_LABEL):
            continue
        item = {
            key_name: label or UNKNOWN_LABEL,
            "count": float(value) if precision is not None else int(value),
        }
        if precision is not None:
            item["count"] = round(float(value), precision)
        rows.append(item)
        if len(rows) >= limit:
            break
    return rows


def _series_rows(counter, start, end, *, precision=None):
    rows = []
    cursor = start.date()
    end_date = (end - timedelta(days=1)).date()
    while cursor <= end_date:
        value = counter.get(cursor, 0)
        rows.append({
            "date": cursor.isoformat(),
            "value": round(float(value), precision) if precision is not None else int(value),
        })
        cursor += timedelta(days=1)
    return rows


def _series_rows_from_sets(grouped_sets, start, end):
    return _series_rows(
        Counter({day: len(values) for day, values in grouped_sets.items()}),
        start,
        end,
    )


def _top_location(counter, fallback="Unknown"):
    for label, count in counter.most_common():
        if label and label != UNKNOWN_LABEL:
            return {"label": label, "count": count}
    return {"label": fallback, "count": 0}


def _label_product_performance(metric, thresholds):
    if metric["status"] == "Out of stock" and metric["search_impressions"] > 0:
        return "Needs restock"
    if (
        metric["views"] == 0
        and metric["quantity_sold"] == 0
        and metric["search_impressions"] == 0
        and metric["add_to_cart"] == 0
    ):
        return "No activity yet"
    if metric["views"] > thresholds["views_high"] and metric["quantity_sold"] == 0:
        return "Good views, poor sales"
    if metric["search_impressions"] > thresholds["search_high"] and metric["views"] <= thresholds["views_low"]:
        return "Frequently searched"
    if metric["cart_abandonment_count"] > thresholds["abandonment_high"]:
        return "Cart abandonment issue"
    if metric["interest_delta"] > max(2, thresholds["views_low"]):
        return "High demand"
    if metric["quantity_sold"] > thresholds["sales_high"] or metric["revenue"] > thresholds["revenue_high"]:
        return "Strong seller"
    if metric["views"] > thresholds["views_low"] and metric["search_clicks"] == 0:
        return "Low visibility"
    return "Low visibility" if metric["views"] < thresholds["views_low"] else "Steady interest"


def _analytics_orders(start, end):
    return (
        Order.query
        .options(selectinload(Order.items), selectinload(Order.delivery_zone))
        .filter(Order.created_at >= start, Order.created_at < end)
        .all()
    )


def _analytics_events(start, end, *, event_types=None, product_id=None):
    query = AnalyticsEvent.query.filter(
        AnalyticsEvent.created_at >= start,
        AnalyticsEvent.created_at < end,
    )
    if event_types:
        query = query.filter(AnalyticsEvent.event_type.in_(event_types))
    if product_id is not None:
        query = query.filter(AnalyticsEvent.product_id == product_id)
    return query.order_by(AnalyticsEvent.created_at.asc()).all()


def _valid_orders(orders):
    return [
        order for order in orders
        if (order.status or "").lower() not in {"cancelled", "canceled", "deleted"}
        and (order.payment_status or "").lower() != "failed"
        and not (
            (order.payment_method or "").lower() == "online"
            and (order.payment_status or "").lower() != "paid"
        )
    ]


def _successful_orders(orders):
    return [
        order for order in _valid_orders(orders)
        if (order.payment_status or "").lower() == "paid"
        or normalize_order_status(order.status) == "complete"
    ]


def build_analytics_dashboard(range_info):
    start = range_info["start"]
    end = range_info["end"]
    compare_start = range_info["compare_start"]
    compare_end = range_info["compare_end"]

    products = (
        Product.query
        .options(selectinload(Product.category))
        .order_by(Product.name.asc())
        .all()
    )
    product_map = {product.id: product for product in products}
    product_metrics = {product.id: _blank_product_metrics(product) for product in products}

    current_events = _analytics_events(
        start,
        end,
        event_types=[
            "page_view",
            "product_view",
            "search",
            "search_impression",
            "search_click",
            "cart_add",
            "cart_remove",
            "wishlist_add",
            "wishlist_remove",
            "service_enquiry_click",
            "news_service_click",
            "contact_form_submit",
            "newsletter_signup",
        ],
    )
    previous_view_events = _analytics_events(compare_start, compare_end, event_types=["product_view"])
    current_orders = _valid_orders(_analytics_orders(start, end))
    completed_sales = _successful_orders(current_orders)

    page_events = [event for event in current_events if event.event_type == "page_view"]
    search_events = [event for event in current_events if event.event_type == "search"]
    page_views_by_day = Counter()
    visits_by_day = defaultdict(set)
    visitors_by_day = defaultdict(set)
    top_pages = defaultdict(lambda: {"views": 0, "visitors": set(), "title": ""})
    sessions_first = {}
    searches_by_day = Counter()
    searches_with_results_by_day = Counter()
    searches_without_results_by_day = Counter()
    search_clicks_by_day = Counter()

    term_stats = defaultdict(lambda: {
        "term": "",
        "searches": 0,
        "with_results": 0,
        "no_results": 0,
        "product_views": 0,
        "purchase_orders": set(),
    })
    search_click_lookup = defaultdict(set)
    search_product_counter = Counter()
    all_cart_sessions = set()
    purchasing_sessions = set()
    service_labels = {}
    service_metrics = defaultdict(lambda: {
        "id": "",
        "label": "",
        "views": 0,
        "unique_visitors": set(),
        "enquiry_clicks": 0,
        "contact_submissions": 0,
        "daily_views": Counter(),
        "daily_enquiries": Counter(),
        "last_activity_at": None,
    })
    news_metrics = defaultdict(lambda: {
        "id": None,
        "title": "",
        "views": 0,
        "unique_visitors": set(),
        "service_clicks": 0,
        "daily_views": Counter(),
        "daily_service_clicks": Counter(),
        "service_targets": Counter(),
        "last_view_at": None,
    })
    lead_interest_labels = {}
    lead_interest_counts = Counter()
    lead_contact_by_day = Counter()
    newsletter_sources = Counter()
    newsletter_signups_by_day = Counter()

    for event in page_events:
        day = event.created_at.date()
        page_views_by_day[day] += 1
        if event.session_key:
            visits_by_day[day].add(event.session_key)
        if event.visitor_key:
            visitors_by_day[day].add(event.visitor_key)
        stat = top_pages[event.path or "/"]
        stat["views"] += 1
        if event.visitor_key:
            stat["visitors"].add(event.visitor_key)
        if event.page_title and not stat["title"]:
            stat["title"] = event.page_title
        if event.session_key and event.session_key not in sessions_first:
            sessions_first[event.session_key] = event

    for event in previous_view_events:
        if event.product_id in product_metrics:
            product_metrics[event.product_id]["previous_views"] += 1

    for event in current_events:
        product_id = event.product_id
        if product_id in product_metrics:
            metric = product_metrics[product_id]
            day = event.created_at.date()
            if event.event_type == "product_view":
                metric["views"] += 1
                if event.visitor_key:
                    metric["unique_viewers"].add(event.visitor_key)
                elif event.session_key:
                    metric["unique_viewers"].add(f"session:{event.session_key}")
                metric["daily_views"][day] += 1
                if event.traffic_source:
                    metric["traffic_sources"][event.traffic_source] += 1
                metric["devices"][event.device_type or UNKNOWN_LABEL] += 1
                metric["countries"][event.country or UNKNOWN_LABEL] += 1
                metric["regions"][event.region or UNKNOWN_LABEL] += 1
                metric["cities"][event.city or UNKNOWN_LABEL] += 1
                if not metric["last_view_at"] or event.created_at > metric["last_view_at"]:
                    metric["last_view_at"] = event.created_at
            elif event.event_type == "cart_add":
                quantity = max(1, int(event.quantity or 1))
                metric["add_to_cart"] += quantity
                metric["daily_adds"][day] += quantity
                if event.session_key:
                    metric["add_sessions"].add(event.session_key)
                    all_cart_sessions.add(event.session_key)
                if not metric["last_add_to_cart_at"] or event.created_at > metric["last_add_to_cart_at"]:
                    metric["last_add_to_cart_at"] = event.created_at
            elif event.event_type == "cart_remove":
                quantity = max(1, int(event.quantity or 1))
                metric["remove_from_cart"] += quantity
                if event.session_key:
                    metric["remove_sessions"].add(event.session_key)
            elif event.event_type == "wishlist_add":
                metric["wishlist_count"] += 1
                if event.visitor_key:
                    metric["wishlist_visitors"].add(event.visitor_key)
            elif event.event_type == "search_impression":
                metric["search_impressions"] += 1
                metric["daily_search"][day] += 1
                term = _normalize_term(event.search_term)
                if term:
                    metric["search_impression_terms"][term] += 1
                if event.details.get("product_available") is False:
                    metric["unavailable_searches"] += 1
            elif event.event_type == "search_click":
                metric["search_clicks"] += 1
                term = _normalize_term(event.search_term)
                if term:
                    metric["search_terms"][term] += 1

        if event.event_type == "search":
            day = event.created_at.date()
            searches_by_day[day] += 1
            if event.had_results:
                searches_with_results_by_day[day] += 1
            else:
                searches_without_results_by_day[day] += 1
            term = _normalize_term(event.search_term)
            if not term:
                continue
            item = term_stats[term]
            item["term"] = term
            item["searches"] += 1
            if event.had_results:
                item["with_results"] += 1
            else:
                item["no_results"] += 1
        elif event.event_type == "search_click":
            day = event.created_at.date()
            search_clicks_by_day[day] += 1
            term = _normalize_term(event.search_term)
            if not term:
                continue
            item = term_stats[term]
            item["term"] = term
            item["product_views"] += 1
            if event.session_key and event.product_id:
                search_click_lookup[(event.session_key, event.product_id)].add(term)
            if event.product_id in product_map:
                search_product_counter[product_map[event.product_id].name] += 1
        elif event.event_type == "page_view":
            day = event.created_at.date()
            page_type = (event.page_type or "").strip().lower()
            if page_type == "service" or (event.path or "").startswith("/services/"):
                service_metric = _metric_bucket(
                    service_metrics,
                    service_labels,
                    event.service_id or (event.path or "").split("/services/")[1].split("/", 1)[0],
                    "Service",
                )
                service_metric["views"] += 1
                service_metric["daily_views"][day] += 1
                visitor_marker = event.visitor_key or (f"session:{event.session_key}" if event.session_key else None)
                if visitor_marker:
                    service_metric["unique_visitors"].add(visitor_marker)
                if not service_metric["last_activity_at"] or event.created_at > service_metric["last_activity_at"]:
                    service_metric["last_activity_at"] = event.created_at
            if page_type == "news_article" and (event.news_id or (event.path or "").startswith("/news/")):
                news_key = event.news_id or event.path or UNKNOWN_LABEL
                news_metric = news_metrics[news_key]
                news_metric["id"] = event.news_id
                news_metric["views"] += 1
                news_metric["daily_views"][day] += 1
                visitor_marker = event.visitor_key or (f"session:{event.session_key}" if event.session_key else None)
                if visitor_marker:
                    news_metric["unique_visitors"].add(visitor_marker)
                if not news_metric["last_view_at"] or event.created_at > news_metric["last_view_at"]:
                    news_metric["last_view_at"] = event.created_at
                if event.page_title and not news_metric["title"]:
                    news_metric["title"] = event.page_title
        elif event.event_type == "service_enquiry_click":
            service_metric = _metric_bucket(
                service_metrics,
                service_labels,
                event.service_id or event.details.get("service") or event.path,
                "Service",
            )
            day = event.created_at.date()
            service_metric["enquiry_clicks"] += 1
            service_metric["daily_enquiries"][day] += 1
            if not service_metric["last_activity_at"] or event.created_at > service_metric["last_activity_at"]:
                service_metric["last_activity_at"] = event.created_at
        elif event.event_type == "contact_form_submit":
            day = event.created_at.date()
            label = event.details.get("service_interest") or event.service_id or "General enquiry"
            key = _slug_key(label) or "general-enquiry"
            lead_interest_labels[key] = lead_interest_labels.get(key) or str(label)
            lead_interest_counts[key] += 1
            lead_contact_by_day[day] += 1
        elif event.event_type == "newsletter_signup":
            day = event.created_at.date()
            newsletter_signups_by_day[day] += 1
            newsletter_sources[event.details.get("source") or "site"] += 1
        elif event.event_type == "news_service_click":
            day = event.created_at.date()
            news_key = event.news_id or event.path or UNKNOWN_LABEL
            news_metric = news_metrics[news_key]
            news_metric["id"] = event.news_id
            news_metric["service_clicks"] += 1
            news_metric["daily_service_clicks"][day] += 1
            target_label = _display_label(event.service_id or event.details.get("service") or "Service")
            news_metric["service_targets"][target_label] += 1

    for order in current_orders:
        if order.analytics_session_key:
            purchasing_sessions.add(order.analytics_session_key)

    for order in completed_sales:
        order_day = order.created_at.date()
        for item in order.items:
            if item.product_id not in product_metrics:
                continue
            metric = product_metrics[item.product_id]
            metric["purchases"] += 1
            metric["quantity_sold"] += int(item.quantity or 0)
            line_total = Decimal(item.unit_price or 0) * int(item.quantity or 0)
            metric["revenue"] += line_total
            metric["daily_sales"][order_day] += int(item.quantity or 0)
            metric["daily_revenue"][order_day] += float(line_total)
            if order.analytics_session_key:
                metric["purchase_sessions"].add(order.analytics_session_key)
                for term in search_click_lookup.get((order.analytics_session_key, item.product_id), set()):
                    term_stats[term]["purchase_orders"].add(order.id)
            if not metric["last_sale_at"] or order.created_at > metric["last_sale_at"]:
                metric["last_sale_at"] = order.created_at

    views_values = [metric["views"] for metric in product_metrics.values()] or [0]
    sales_values = [metric["quantity_sold"] for metric in product_metrics.values()] or [0]
    search_values = [metric["search_impressions"] for metric in product_metrics.values()] or [0]
    abandonment_values = [
        max(0, len(metric["add_sessions"] - metric["purchase_sessions"]))
        for metric in product_metrics.values()
    ] or [0]
    revenue_values = [float(metric["revenue"]) for metric in product_metrics.values()] or [0.0]
    thresholds = {
        "views_high": max(5, sorted(views_values)[int(len(views_values) * 0.75)] if views_values else 5),
        "views_low": max(1, sorted(views_values)[int(len(views_values) * 0.25)] if views_values else 1),
        "sales_high": max(1, sorted(sales_values)[int(len(sales_values) * 0.75)] if sales_values else 1),
        "search_high": max(1, sorted(search_values)[int(len(search_values) * 0.75)] if search_values else 1),
        "abandonment_high": max(1, sorted(abandonment_values)[int(len(abandonment_values) * 0.75)] if abandonment_values else 1),
        "revenue_high": max(50.0, sorted(revenue_values)[int(len(revenue_values) * 0.75)] if revenue_values else 50.0),
    }

    product_items = []
    for product_id, metric in product_metrics.items():
        views = metric["views"]
        purchases = metric["purchases"]
        add_sessions = len(metric["add_sessions"])
        purchase_sessions = len(metric["purchase_sessions"])
        abandoned = max(0, len(metric["add_sessions"] - metric["purchase_sessions"]))
        previous_views = metric["previous_views"]
        metric["cart_abandonment_count"] = abandoned
        metric["interest_delta"] = views - previous_views
        metric["interest_delta_pct"] = round(((views - previous_views) / previous_views) * 100, 1) if previous_views else (100.0 if views else 0.0)
        metric["performance_status"] = _label_product_performance(metric, thresholds)
        product_items.append({
            "id": metric["id"],
            "name": metric["name"],
            "category": metric["category"],
            "status": metric["status"],
            "stock_status": metric["stock_status"],
            "stock_quantity": metric["stock_quantity"],
            "price": metric["price"],
            "views": views,
            "unique_visitors": len(metric["unique_viewers"]),
            "add_to_cart": metric["add_to_cart"],
            "remove_from_cart": metric["remove_from_cart"],
            "purchases": purchases,
            "quantity_sold": metric["quantity_sold"],
            "revenue": round(float(metric["revenue"]), 2),
            "conversion_rate": round((purchases / views) * 100, 1) if views else 0.0,
            "add_to_cart_rate": round((add_sessions / views) * 100, 1) if views else 0.0,
            "cart_abandonment_count": abandoned,
            "wishlist_count": metric["wishlist_count"],
            "search_impressions": metric["search_impressions"],
            "search_clicks": metric["search_clicks"],
            "unavailable_searches": metric["unavailable_searches"],
            "last_sale_at": metric["last_sale_at"].isoformat() if metric["last_sale_at"] else None,
            "last_view_at": metric["last_view_at"].isoformat() if metric["last_view_at"] else None,
            "last_add_to_cart_at": metric["last_add_to_cart_at"].isoformat() if metric["last_add_to_cart_at"] else None,
            "top_traffic_source": _counter_rows(metric["traffic_sources"], limit=1)[0]["label"] if metric["traffic_sources"] else UNKNOWN_LABEL,
            "top_device": _counter_rows(metric["devices"], limit=1)[0]["label"] if metric["devices"] else UNKNOWN_LABEL,
            "top_location": _top_location(metric["countries"])["label"],
            "interest_delta": metric["interest_delta"],
            "interest_delta_pct": metric["interest_delta_pct"],
            "performance_status": metric["performance_status"],
        })

    product_items.sort(key=lambda item: (item["views"], item["revenue"], item["purchases"]), reverse=True)

    total_visits = len(sessions_first)
    unique_visitors = len({event.visitor_key for event in page_events if event.visitor_key})
    total_page_views = len(page_events)
    order_count = len(current_orders)
    completed_order_count = len(completed_sales)
    total_revenue = round(sum(float(order.total_amount or 0) for order in completed_sales), 2)
    average_order_value = round(total_revenue / completed_order_count, 2) if completed_order_count else 0.0
    conversion_rate = round((order_count / total_visits) * 100, 1) if total_visits else 0.0
    abandoned_sessions = len(all_cart_sessions - purchasing_sessions)

    session_sources = Counter((event.traffic_source or "Direct") for event in sessions_first.values())
    session_devices = Counter((event.device_type or UNKNOWN_LABEL) for event in sessions_first.values())
    session_browsers = Counter((event.browser or UNKNOWN_LABEL) for event in sessions_first.values())
    session_countries = Counter((event.country or UNKNOWN_LABEL) for event in sessions_first.values())
    session_regions = Counter((event.region or UNKNOWN_LABEL) for event in sessions_first.values())
    session_cities = Counter((event.city or UNKNOWN_LABEL) for event in sessions_first.values())

    overview_rows = []
    for path, stat in top_pages.items():
        overview_rows.append({
            "path": path,
            "title": stat["title"] or path,
            "views": stat["views"],
            "unique_visitors": len(stat["visitors"]),
        })
    overview_rows.sort(key=lambda row: row["views"], reverse=True)

    search_terms = []
    for _, stat in sorted(term_stats.items(), key=lambda item: item[1]["searches"], reverse=True):
        search_terms.append({
            "term": stat["term"],
            "searches": stat["searches"],
            "with_results": stat["with_results"],
            "no_results": stat["no_results"],
            "product_views": stat["product_views"],
            "purchases": len(stat["purchase_orders"]),
        })

    category_interest = Counter()
    for item in product_items:
        category_interest[item["category"]] += item["views"] + item["quantity_sold"] + item["search_impressions"]

    news_ids = [metric["id"] for metric in news_metrics.values() if metric["id"]]
    news_lookup = {}
    if news_ids:
        news_lookup = {row.id: row for row in News.query.filter(News.id.in_(news_ids)).all()}

    service_rows = []
    service_views_by_day = Counter()
    service_enquiries_by_day = Counter()
    for metric in service_metrics.values():
        service_views_by_day.update(metric["daily_views"])
        service_enquiries_by_day.update(metric["daily_enquiries"])
        service_rows.append({
            "id": metric["id"],
            "label": metric["label"],
            "views": metric["views"],
            "unique_visitors": len(metric["unique_visitors"]),
            "enquiry_clicks": metric["enquiry_clicks"],
            "contact_submissions": metric["contact_submissions"],
            "engagement_rate": round((metric["enquiry_clicks"] / metric["views"]) * 100, 1) if metric["views"] else 0.0,
            "last_activity_at": metric["last_activity_at"].isoformat() if metric["last_activity_at"] else None,
        })
    service_rows.sort(key=lambda row: (row["views"], row["enquiry_clicks"]), reverse=True)

    news_rows = []
    news_views_by_day = Counter()
    news_service_clicks_by_day = Counter()
    news_service_targets = Counter()
    for key, metric in news_metrics.items():
        news_views_by_day.update(metric["daily_views"])
        news_service_clicks_by_day.update(metric["daily_service_clicks"])
        news_service_targets.update(metric["service_targets"])
        row = news_lookup.get(metric["id"])
        title = (
            row.title if row
            else metric["title"]
            or f"Article {metric['id']}" if metric["id"]
            else str(key)
        )
        news_rows.append({
            "id": metric["id"] or key,
            "title": title,
            "views": metric["views"],
            "unique_visitors": len(metric["unique_visitors"]),
            "service_clicks": metric["service_clicks"],
            "last_view_at": metric["last_view_at"].isoformat() if metric["last_view_at"] else None,
        })
    news_rows.sort(key=lambda row: (row["views"], row["service_clicks"]), reverse=True)

    job_applications = (
        JobApplication.query
        .filter(JobApplication.created_at >= start, JobApplication.created_at < end)
        .all()
    )
    job_applications_by_day = Counter()
    for application in job_applications:
        job_applications_by_day[application.created_at.date()] += 1

    lead_interest_rows = [
        {"label": lead_interest_labels[key], "count": count}
        for key, count in lead_interest_counts.most_common(10)
    ]

    audit_rows = (
        AuditLog.query
        .filter(AuditLog.created_at >= start, AuditLog.created_at < end)
        .order_by(AuditLog.created_at.desc())
        .limit(400)
        .all()
    )
    security_action_counts = Counter()
    admin_action_counts = Counter()
    recent_security_rows = []
    login_attempts = 0
    failed_logins = 0
    locked_logins = 0
    password_changes = 0
    security_actions = {
        "user_login",
        "user_login_failed",
        "user_login_locked",
        "user_login_lockout_attempt",
        "user_login_inactive",
        "password_changed",
        "password_reset_confirmed",
    }
    admin_action_exclusions = security_actions | {"user_logout", "user_signup", "newsletter_subscription"}
    for row in audit_rows:
        action = row.action or UNKNOWN_LABEL
        security_action_counts[action] += 1
        if action in {"user_login", "user_login_failed", "user_login_locked", "user_login_lockout_attempt", "user_login_inactive"}:
            login_attempts += 1
        if action in {"user_login_failed", "user_login_locked", "user_login_lockout_attempt", "user_login_inactive"}:
            failed_logins += 1
        if action in {"user_login_locked", "user_login_lockout_attempt"}:
            locked_logins += 1
        if action in {"password_changed", "password_reset_confirmed"}:
            password_changes += 1
        if action not in admin_action_exclusions:
            admin_action_counts[action] += 1
        if action in security_actions and len(recent_security_rows) < 12:
            actor = row.details.get("actor_email") if isinstance(row.details, dict) else None
            recent_security_rows.append({
                "action": action.replace("_", " "),
                "at": row.created_at.isoformat() if row.created_at else None,
                "actor": actor or f"User {row.actor_id}" if row.actor_id else "Unknown",
                "entity_type": row.entity_type or UNKNOWN_LABEL,
                "ip": _mask_security_ip(row.ip_address),
            })

    return {
        "range": {
            "preset": range_info["preset"],
            "label": range_info["label"],
            "start_date": range_info["start_date"],
            "end_date": range_info["end_date"],
            "compare_start_date": range_info["compare_start_date"],
            "compare_end_date": range_info["compare_end_date"],
        },
        "privacy": {
            "notice": "Analytics are collected to improve services, security, and user experience. Visitor analytics use anonymous session and visitor IDs. Normal reports show only summarised location data and never expose full IP addresses.",
        },
        "overview": {
            "summary": {
                "total_visits": total_visits,
                "unique_visitors": unique_visitors,
                "page_views": total_page_views,
            },
            "timeline": {
                "page_views": _series_rows(page_views_by_day, start, end),
                "visits": _series_rows_from_sets(visits_by_day, start, end),
                "unique_visitors": _series_rows_from_sets(visitors_by_day, start, end),
            },
            "top_pages": overview_rows[:12],
            "traffic_sources": _counter_rows(session_sources, limit=8),
            "device_breakdown": _counter_rows(session_devices, limit=6),
            "browser_breakdown": _counter_rows(session_browsers, limit=8),
            "locations": {
                "countries": _counter_rows(session_countries, limit=8),
                "regions": _counter_rows(session_regions, limit=8),
                "cities": _counter_rows(session_cities, limit=8),
            },
        },
        "bookshop": {
            "summary": {
                "total_orders": order_count,
                "total_revenue": total_revenue,
                "average_order_value": average_order_value,
                "conversion_rate": conversion_rate,
                "abandoned_carts": abandoned_sessions,
                "searches_no_results": sum(item["no_results"] for item in search_terms),
            },
            "top_products": {
                "viewed": sorted(product_items, key=lambda item: item["views"], reverse=True)[:8],
                "searched": sorted(product_items, key=lambda item: item["search_impressions"], reverse=True)[:8],
                "added_to_cart": sorted(product_items, key=lambda item: item["add_to_cart"], reverse=True)[:8],
                "purchased": sorted(product_items, key=lambda item: item["quantity_sold"], reverse=True)[:8],
                "abandoned": sorted(product_items, key=lambda item: item["cart_abandonment_count"], reverse=True)[:8],
                "revenue": sorted(product_items, key=lambda item: item["revenue"], reverse=True)[:8],
            },
            "top_categories": _counter_rows(category_interest, limit=8),
        },
        "search": {
            "summary": {
                "total_searches": len(search_events),
                "unique_terms": len(search_terms),
                "searches_with_results": sum(item["with_results"] for item in search_terms),
                "searches_without_results": sum(item["no_results"] for item in search_terms),
            },
            "timeline": {
                "searches": _series_rows(searches_by_day, start, end),
                "with_results": _series_rows(searches_with_results_by_day, start, end),
                "no_results": _series_rows(searches_without_results_by_day, start, end),
                "clicks": _series_rows(search_clicks_by_day, start, end),
            },
            "terms": search_terms[:20],
            "top_products": [{"product": name, "count": count} for name, count in search_product_counter.most_common(12)],
        },
        "products": {
            "items": product_items,
            "count": len(product_items),
        },
        "engagement": {
            "services": {
                "summary": {
                    "page_views": sum(row["views"] for row in service_rows),
                    "enquiry_clicks": sum(row["enquiry_clicks"] for row in service_rows),
                },
                "timeline": {
                    "views": _series_rows(service_views_by_day, start, end),
                    "enquiries": _series_rows(service_enquiries_by_day, start, end),
                },
                "items": service_rows[:12],
            },
            "news": {
                "summary": {
                    "article_views": sum(row["views"] for row in news_rows),
                    "service_clicks": sum(row["service_clicks"] for row in news_rows),
                },
                "timeline": {
                    "views": _series_rows(news_views_by_day, start, end),
                    "service_clicks": _series_rows(news_service_clicks_by_day, start, end),
                },
                "articles": news_rows[:12],
                "service_targets": _counter_rows(news_service_targets, limit=8),
            },
            "leads": {
                "summary": {
                    "contact_submissions": int(sum(lead_contact_by_day.values())),
                    "newsletter_signups": int(sum(newsletter_signups_by_day.values())),
                    "job_applications": len(job_applications),
                },
                "timeline": {
                    "contact_submissions": _series_rows(lead_contact_by_day, start, end),
                    "newsletter_signups": _series_rows(newsletter_signups_by_day, start, end),
                    "job_applications": _series_rows(job_applications_by_day, start, end),
                },
                "service_interest": lead_interest_rows,
                "newsletter_sources": _counter_rows(newsletter_sources, limit=6),
            },
            "security": {
                "summary": {
                    "login_attempts": login_attempts,
                    "failed_logins": failed_logins,
                    "locked_logins": locked_logins,
                    "password_changes": password_changes,
                    "admin_actions": sum(admin_action_counts.values()),
                },
                "action_breakdown": _counter_rows(security_action_counts, limit=10),
                "admin_actions": _counter_rows(admin_action_counts, limit=10),
                "recent": recent_security_rows,
            },
        },
    }


def build_product_detail(product_id, range_info):
    product = (
        Product.query
        .options(selectinload(Product.category))
        .filter(Product.id == product_id)
        .first()
    )
    if not product:
        return None

    current_events = _analytics_events(
        range_info["start"],
        range_info["end"],
        event_types=[
            "product_view",
            "cart_add",
            "cart_remove",
            "wishlist_add",
            "wishlist_remove",
            "search_impression",
            "search_click",
        ],
        product_id=product_id,
    )
    orders = [
        order for order in _successful_orders(_analytics_orders(range_info["start"], range_info["end"]))
        if any(item.product_id == product_id for item in order.items)
    ]

    metric = _blank_product_metrics(product)
    search_click_lookup = defaultdict(set)
    for event in current_events:
        day = event.created_at.date()
        if event.event_type == "product_view":
            metric["views"] += 1
            if event.visitor_key:
                metric["unique_viewers"].add(event.visitor_key)
            elif event.session_key:
                metric["unique_viewers"].add(f"session:{event.session_key}")
            metric["daily_views"][day] += 1
            metric["traffic_sources"][event.traffic_source or "Direct"] += 1
            metric["devices"][event.device_type or UNKNOWN_LABEL] += 1
            metric["countries"][event.country or UNKNOWN_LABEL] += 1
            metric["regions"][event.region or UNKNOWN_LABEL] += 1
            metric["cities"][event.city or UNKNOWN_LABEL] += 1
            metric["last_view_at"] = max(metric["last_view_at"], event.created_at) if metric["last_view_at"] else event.created_at
        elif event.event_type == "cart_add":
            quantity = max(1, int(event.quantity or 1))
            metric["add_to_cart"] += quantity
            metric["daily_adds"][day] += quantity
            if event.session_key:
                metric["add_sessions"].add(event.session_key)
            metric["last_add_to_cart_at"] = max(metric["last_add_to_cart_at"], event.created_at) if metric["last_add_to_cart_at"] else event.created_at
        elif event.event_type == "cart_remove":
            metric["remove_from_cart"] += max(1, int(event.quantity or 1))
        elif event.event_type == "wishlist_add":
            metric["wishlist_count"] += 1
        elif event.event_type == "search_impression":
            metric["search_impressions"] += 1
            metric["daily_search"][day] += 1
            term = _normalize_term(event.search_term)
            if term:
                metric["search_impression_terms"][term] += 1
            if event.details.get("product_available") is False:
                metric["unavailable_searches"] += 1
        elif event.event_type == "search_click":
            metric["search_clicks"] += 1
            term = _normalize_term(event.search_term)
            if term:
                metric["search_terms"][term] += 1
            if event.session_key and term:
                search_click_lookup[event.session_key].add(term)

    search_purchase_terms = Counter()
    for order in orders:
        day = order.created_at.date()
        for item in order.items:
            if item.product_id != product_id:
                continue
            metric["purchases"] += 1
            metric["quantity_sold"] += int(item.quantity or 0)
            line_total = Decimal(item.unit_price or 0) * int(item.quantity or 0)
            metric["revenue"] += line_total
            metric["daily_sales"][day] += int(item.quantity or 0)
            metric["daily_revenue"][day] += float(line_total)
            if order.analytics_session_key:
                metric["purchase_sessions"].add(order.analytics_session_key)
                for term in search_click_lookup.get(order.analytics_session_key, set()):
                    search_purchase_terms[term] += 1
            metric["last_sale_at"] = max(metric["last_sale_at"], order.created_at) if metric["last_sale_at"] else order.created_at

    metric["cart_abandonment_count"] = max(0, len(metric["add_sessions"] - metric["purchase_sessions"]))
    views = metric["views"]
    add_sessions = len(metric["add_sessions"])
    conversion_rate = round((metric["purchases"] / views) * 100, 1) if views else 0.0
    add_to_cart_rate = round((add_sessions / views) * 100, 1) if views else 0.0

    return {
        "range": {
            "preset": range_info["preset"],
            "label": range_info["label"],
            "start_date": range_info["start_date"],
            "end_date": range_info["end_date"],
        },
        "product": {
            "id": product.id,
            "name": product.name,
            "category": product.category.name if product.category else "General",
            "status": _human_status(product),
            "stock_quantity": int(product.quantity_available) if product.quantity_available is not None else None,
            "price": float(product.price or 0),
            "stock_status": product.stock_status,
        },
        "metrics": {
            "views": views,
            "unique_visitors": len(metric["unique_viewers"]),
            "add_to_cart": metric["add_to_cart"],
            "remove_from_cart": metric["remove_from_cart"],
            "purchases": metric["purchases"],
            "quantity_sold": metric["quantity_sold"],
            "revenue": round(float(metric["revenue"]), 2),
            "conversion_rate": conversion_rate,
            "add_to_cart_rate": add_to_cart_rate,
            "cart_abandonment_count": metric["cart_abandonment_count"],
            "wishlist_count": metric["wishlist_count"],
            "search_impressions": metric["search_impressions"],
            "search_clicks": metric["search_clicks"],
            "unavailable_searches": metric["unavailable_searches"],
            "last_sale_at": metric["last_sale_at"].isoformat() if metric["last_sale_at"] else None,
            "last_view_at": metric["last_view_at"].isoformat() if metric["last_view_at"] else None,
            "last_add_to_cart_at": metric["last_add_to_cart_at"].isoformat() if metric["last_add_to_cart_at"] else None,
        },
        "breakdowns": {
            "traffic_sources": _counter_rows(metric["traffic_sources"], limit=8),
            "devices": _counter_rows(metric["devices"], limit=6),
            "locations": {
                "countries": _counter_rows(metric["countries"], limit=8),
                "regions": _counter_rows(metric["regions"], limit=8),
                "cities": _counter_rows(metric["cities"], limit=8),
            },
            "search_terms": [
                {"term": term, "clicks": clicks, "purchases": search_purchase_terms.get(term, 0)}
                for term, clicks in metric["search_terms"].most_common(12)
            ],
            "search_impressions": [
                {"term": term, "appearances": appearances}
                for term, appearances in metric["search_impression_terms"].most_common(12)
            ],
        },
        "charts": {
            "views": _series_rows(metric["daily_views"], range_info["start"], range_info["end"]),
            "add_to_cart": _series_rows(metric["daily_adds"], range_info["start"], range_info["end"]),
            "sales": _series_rows(metric["daily_sales"], range_info["start"], range_info["end"]),
            "revenue": _series_rows(metric["daily_revenue"], range_info["start"], range_info["end"], precision=2),
            "search_interest": _series_rows(metric["daily_search"], range_info["start"], range_info["end"]),
        },
    }
