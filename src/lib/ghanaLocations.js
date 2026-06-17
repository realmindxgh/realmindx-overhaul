export const GHANA_REGIONS = [
  'Ahafo',
  'Ashanti',
  'Bono',
  'Bono East',
  'Central',
  'Eastern',
  'Greater Accra',
  'North East',
  'Northern',
  'Oti',
  'Savannah',
  'Upper East',
  'Upper West',
  'Volta',
  'Western',
  'Western North',
];

export const normaliseLocationSearch = value => String(value || '')
  .toLowerCase()
  .replace(/[\u2010-\u2015/]+/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const deliveryLocationAliases = zone => {
  if (Array.isArray(zone?.aliases)) {
    return zone.aliases.map(alias => String(alias || '').trim()).filter(Boolean);
  }
  return String(zone?.aliases_text || zone?.aliases || '')
    .split(/[\n,;]+/)
    .map(alias => alias.trim())
    .filter(Boolean);
};

export const deliveryLocationSearchText = zone => normaliseLocationSearch([
  zone?.name,
  ...deliveryLocationAliases(zone),
  zone?.region,
  zone?.district_or_municipality,
  zone?.nearby_major_town,
  zone?.delivery_zone_label,
  zone?.description,
].filter(Boolean).join(' '));

export const teachingLocationsFromZones = zones => {
  return (zones || [])
    .filter(zone =>
      zone?.is_active !== false
      && zone?.is_delivery_area !== false
      && zone?.is_search_alias_only !== true
      && !/pickup/i.test(zone?.name || ''),
    )
    .map(zone => ({
      id: Number(zone.id),
      name: String(zone.name || '').trim(),
      aliases: deliveryLocationAliases(zone),
      searchText: deliveryLocationSearchText(zone),
      region: zone.region || '',
      nearbyMajorTown: zone.nearby_major_town || '',
      deliveryZone: zone.delivery_zone_label || '',
    }))
    .filter(zone => Number.isInteger(zone.id) && zone.id > 0 && zone.name);
};

export const splitLocationIds = raw => String(raw || '')
  .split(',')
  .map(value => Number.parseInt(value.trim(), 10))
  .filter(value => Number.isInteger(value) && value > 0);
