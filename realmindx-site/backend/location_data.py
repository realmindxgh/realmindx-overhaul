GHANA_REGIONS = (
    "Ahafo",
    "Ashanti",
    "Bono",
    "Bono East",
    "Central",
    "Eastern",
    "Greater Accra",
    "North East",
    "Northern",
    "Oti",
    "Savannah",
    "Upper East",
    "Upper West",
    "Volta",
    "Western",
    "Western North",
)


def parse_location_ids(value):
    if isinstance(value, (list, tuple, set)):
        raw_values = value
    else:
        raw_values = str(value or "").split(",")
    result = []
    seen = set()
    for raw in raw_values:
        try:
            location_id = int(raw)
        except (TypeError, ValueError):
            continue
        if location_id > 0 and location_id not in seen:
            seen.add(location_id)
            result.append(location_id)
    return result


def canonical_delivery_locations(value):
    from .models import DeliveryZone

    requested_ids = parse_location_ids(value)
    if not requested_ids:
        return [], []
    zones = (
        DeliveryZone.query
        .filter(
            DeliveryZone.id.in_(requested_ids),
            DeliveryZone.is_active.is_(True),
            DeliveryZone.is_delivery_area.is_(True),
            DeliveryZone.is_search_alias_only.is_(False),
        )
        .all()
    )
    zones_by_id = {
        zone.id: zone
        for zone in zones
        if "pickup" not in (zone.name or "").lower()
    }
    ordered = [zones_by_id[location_id] for location_id in requested_ids if location_id in zones_by_id]
    if len(ordered) != len(requested_ids):
        raise ValueError("Choose locations from the current delivery-area list.")
    return ordered, requested_ids


def joined_location_ids(ids):
    return ", ".join(str(location_id) for location_id in ids) or None


def joined_location_names(zones):
    return ", ".join(zone.name for zone in zones) or None
