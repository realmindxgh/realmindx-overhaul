import json
import re
from functools import lru_cache
from pathlib import Path

from sqlalchemy import String, and_, cast, or_

from .models import Product, ProductCategory


GENERIC_SEARCH_TOKENS = {"book", "books", "textbook", "textbooks", "ghana", "school", "schools"}


def normalize_search_text(value):
    text = str(value or "").strip().lower()
    text = text.replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _slug(value):
    return re.sub(r"[^a-z0-9]+", "-", normalize_search_text(value)).strip("-")


@lru_cache(maxsize=1)
def _alias_groups():
    root = Path(__file__).resolve().parents[2]
    path = root / "src" / "lib" / "bookshopSearchAliases.json"
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    return data if isinstance(data, dict) else {}


def _unique(values):
    result = []
    seen = set()
    for value in values:
        text = str(value or "").strip()
        key = normalize_search_text(text)
        if not text or not key or key in seen:
            continue
        seen.add(key)
        result.append(text)
    return result


def _entry_values(entry):
    values = [
        entry.get("id"),
        entry.get("canonical"),
        entry.get("displayName"),
        *(entry.get("aliases") or []),
        *(entry.get("popularSearches") or []),
    ]
    return _unique(values)


def _find_alias_group(taxonomy, value):
    query_key = normalize_search_text(value)
    query_slug = _slug(value)
    if not query_key:
        return None
    for entry in _alias_groups().get(taxonomy, []):
        for candidate in _entry_values(entry):
            if query_key == normalize_search_text(candidate) or query_slug == _slug(candidate):
                return entry
    return None


def taxonomy_filter_terms(taxonomy, value):
    entry = _find_alias_group(taxonomy, value)
    if not entry:
        return _unique([value])
    return _unique([
        value,
        entry.get("canonical"),
        entry.get("displayName"),
        *(entry.get("aliases") or []),
    ])


def expand_product_search_terms(value):
    raw = str(value or "").strip()
    query_key = normalize_search_text(raw)
    if not query_key:
        return []
    terms = [raw]
    query_tokens = set(query_key.split())
    meaningful_tokens = query_tokens - GENERIC_SEARCH_TOKENS

    for entries in _alias_groups().values():
        for entry in entries:
            values = _entry_values(entry)
            normalized_values = [normalize_search_text(item) for item in values]
            matched = any(
                query_key == item
                or item in query_key
                or (len(meaningful_tokens) > 1 and meaningful_tokens.issubset(set(item.split())))
                for item in normalized_values
                if item
            )
            if matched:
                terms.extend([entry.get("canonical"), entry.get("displayName")])
                terms.extend(entry.get("aliases") or [])
                terms.extend(entry.get("popularSearches") or [])

    return _unique(terms)


def product_search_filter(value):
    fields = [
        Product.name,
        Product.short_description,
        Product.full_description,
        Product.subject,
        Product.level,
        Product.curriculum,
        Product.author,
        Product.publisher,
        Product.product_type,
        Product.delivery_note,
        ProductCategory.name,
        ProductCategory.slug,
        cast(Product.tags, String),
    ]

    def clause_for_terms(terms):
        clauses = []
        for term in terms:
            like = f"%{term}%"
            clauses.extend(field.ilike(like) for field in fields)
        return or_(*clauses) if clauses else None

    normalized = normalize_search_text(value)
    meaningful_tokens = [
        token
        for token in normalized.split()
        if token not in GENERIC_SEARCH_TOKENS and len(token) > 1
    ]
    if len(meaningful_tokens) > 1:
        token_clauses = [
            clause_for_terms(expand_product_search_terms(token))
            for token in meaningful_tokens
        ]
        token_clauses = [clause for clause in token_clauses if clause is not None]
        return and_(*token_clauses) if token_clauses else None

    return clause_for_terms(expand_product_search_terms(value))
