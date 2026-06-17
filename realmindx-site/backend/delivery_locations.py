import re


def normalize_location_key(value):
    text = str(value or "").strip().lower()
    text = re.sub(r"[\u2010-\u2015/]+", " ", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def split_location_aliases(value):
    if isinstance(value, (list, tuple, set)):
        raw_values = value
    else:
        raw_values = re.split(r"[\n,;]+", str(value or ""))
    aliases = []
    seen = set()
    for raw in raw_values:
        alias = str(raw or "").strip()
        key = normalize_location_key(alias)
        if not alias or not key or key in seen:
            continue
        seen.add(key)
        aliases.append(alias)
    return aliases


def format_location_aliases(value, display_name=None):
    display_key = normalize_location_key(display_name)
    aliases = []
    seen = set()
    for alias in split_location_aliases(value):
        key = normalize_location_key(alias)
        if not key or key == display_key or key in seen:
            continue
        seen.add(key)
        aliases.append(alias)
    return "\n".join(aliases) or None


def delivery_zone_aliases(zone):
    return split_location_aliases(getattr(zone, "aliases", None))


def delivery_zone_matches(zone, value):
    key = normalize_location_key(value)
    if not key:
        return False
    candidates = [getattr(zone, "name", None), *delivery_zone_aliases(zone)]
    return key in {normalize_location_key(candidate) for candidate in candidates}
