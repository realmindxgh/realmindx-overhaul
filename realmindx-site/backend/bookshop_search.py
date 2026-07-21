import json
import re
from functools import lru_cache
from pathlib import Path

from sqlalchemy import String, and_, cast, or_

from .models import Product, ProductCategory


GENERIC_SEARCH_TOKENS = {"book", "books", "textbook", "textbooks", "ghana", "school", "schools"}
LEVEL_SPECIFIC_SEARCH_TERM = re.compile(
    r"\b(?:jhs|shs|jss|sss|junior high|senior high|lower secondary|upper secondary|"
    r"basic\s*[1-9]|primary\s*[1-6]|p[1-6]|kg\s*[12]?|kindergarten|bece|wassce)\b"
)
CURRICULUM_SPECIFIC_SEARCH_TERM = re.compile(
    r"\b(?:ges|nacca|waec|cambridge|igcse|british curriculum|english national curriculum|"
    r"uk curriculum|tvet|ctvet|ghana curriculum|basic school|ghana education service|"
    r"standards based curriculum|common core programme|ccp)\b"
)
PUNCTUATED_ACRONYMS = {"kg", "rme", "shs", "jhs", "ict"}


def normalize_search_text(value):
    text = str(value or "").strip().lower()
    text = re.sub(
        r"\b(?:[a-z]\.){2,}[a-z]?\.?",
        lambda match: match.group(0).replace(".", ""),
        text,
    )
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


def _search_term_variants(value):
    text = str(value or "").strip()
    normalized = normalize_search_text(text)
    variants = [text]
    if normalized in PUNCTUATED_ACRONYMS:
        dotted = ".".join(normalized.upper())
        variants.extend([dotted, f"{dotted}."])
    return list(dict.fromkeys(item for item in variants if item))


def _exact_alias_matches(value):
    query_key = normalize_search_text(value)
    matches = []
    if not query_key:
        return matches
    for taxonomy, entries in _alias_groups().items():
        for entry in entries:
            candidate = next(
                (item for item in _entry_values(entry) if normalize_search_text(item) == query_key),
                None,
            )
            if not candidate:
                continue
            canonical = normalize_search_text(entry.get("canonical"))
            category_past_term = (
                taxonomy == "category"
                and "past" in canonical.split()
                and re.search(r"\b(bece|wassce)\b", query_key)
            )
            if taxonomy != "level" and LEVEL_SPECIFIC_SEARCH_TERM.search(query_key) and not category_past_term:
                continue
            if taxonomy != "curriculum" and CURRICULUM_SPECIFIC_SEARCH_TERM.search(query_key):
                continue
            if re.search(r"\b(bece|wassce)\b", query_key) and taxonomy != "level" and not category_past_term:
                continue
            matches.append((taxonomy, entry))
    return matches


def exam_picks_filter():
    """Return a SQLAlchemy filter clause for the combined BECE + WASSCE exam picks.

    Rule: (curriculum matches GES/NaCCA AND level matches Junior High/Lower Secondary)
          OR (curriculum matches GES/NaCCA AND level matches Senior High/Upper Secondary)
    Uses taxonomy_filter_terms for robust term matching against known aliases.
    """
    curriculum_terms = taxonomy_filter_terms("curriculum", "ges-nacca-curriculum")
    jhs_terms = taxonomy_filter_terms("level", "junior-high-lower-secondary")
    shs_terms = taxonomy_filter_terms("level", "senior-high-upper-secondary")

    # Taxonomy aliases are terms, rather than always complete stored values.
    # Use partial matching so valid local legacy data such as "GES Standard"
    # is included alongside the canonical production values. This mirrors the
    # documented ILIKE '%term%' taxonomy behaviour.
    curriculum_clause = or_(*(Product.curriculum.ilike(f"%{t}%") for t in curriculum_terms))
    jhs_clause = and_(curriculum_clause, or_(*(Product.level.ilike(f"%{t}%") for t in jhs_terms)))
    shs_clause = and_(curriculum_clause, or_(*(Product.level.ilike(f"%{t}%") for t in shs_terms)))
    return or_(jhs_clause, shs_clause)


def taxonomy_filter_terms(taxonomy, value):
    entry = _find_alias_group(taxonomy, value)
    if not entry:
        return _unique([value])
    return _unique([
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
            for variant in _search_term_variants(term):
                like = f"%{variant}%"
                clauses.extend(field.ilike(like) for field in fields)
        return or_(*clauses) if clauses else None

    def exact_alias_clause(matches):
        clauses = []
        field_map = {
            "subject": [Product.subject],
            "level": [Product.level],
            "curriculum": [Product.curriculum],
            "publisher": [Product.publisher],
            "category": [ProductCategory.name, ProductCategory.slug],
        }
        for taxonomy, entry in matches:
            taxonomy_fields = field_map.get(taxonomy, [])
            terms = _entry_values(entry)
            for term in terms:
                for variant in _search_term_variants(term):
                    like = f"%{variant}%"
                    clauses.extend(field.ilike(like) for field in taxonomy_fields)
        return or_(*clauses) if clauses else None

    normalized = normalize_search_text(value)
    grade_match = re.search(r"\b(?:basic|grade)\s*([1-9])\b", normalized)
    if not grade_match:
        grade_match = re.search(r"\bprimary\s*([1-6])\b", normalized)
    if not grade_match:
        grade_match = re.search(r"\bp\s*([1-6])\b", normalized)
    grade_term = f"basic {grade_match.group(1)}" if grade_match else ""
    jhs_match = re.search(r"\bjhs\s*([1-3])\b", normalized)
    if jhs_match:
        grade_term = f"basic {int(jhs_match.group(1)) + 6}"
    shs_match = re.search(r"\bshs\s*([1-3])\b", normalized)
    if shs_match:
        grade_term = f"shs {shs_match.group(1)}"
    kg_match = re.search(r"\bkg\s*([12])\b", normalized)
    if kg_match:
        grade_term = f"kg {kg_match.group(1)}"
    if grade_term:
        grade_terms = [grade_term]
        if grade_term.startswith("kg "):
            number = grade_term.split()[-1]
            grade_terms.extend([f"k.g. {number}", f"k.g {number}"])
        clauses = []
        for term in grade_terms:
            like = f"%{term}%"
            clauses.extend([
                Product.name.ilike(like),
                cast(Product.tags, String).ilike(like),
            ])
        return or_(*clauses)

    alias_clause = exact_alias_clause(_exact_alias_matches(value))
    if alias_clause is not None:
        return alias_clause

    meaningful_tokens = [
        token
        for token in normalized.split()
        if token not in GENERIC_SEARCH_TOKENS and (len(token) > 1 or token.isdigit())
    ]
    if len(meaningful_tokens) > 1:
        token_clauses = [
            clause_for_terms(expand_product_search_terms(token))
            for token in meaningful_tokens
        ]
        token_clauses = [clause for clause in token_clauses if clause is not None]
        return and_(*token_clauses) if token_clauses else None

    return clause_for_terms(expand_product_search_terms(value))
