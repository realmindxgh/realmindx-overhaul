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

export const teachingLocationsFromZones = zones => {
  return (zones || [])
    .filter(zone => zone?.is_active !== false && !/pickup/i.test(zone?.name || ''))
    .map(zone => ({
      id: Number(zone.id),
      name: String(zone.name || '').trim(),
    }))
    .filter(zone => Number.isInteger(zone.id) && zone.id > 0 && zone.name);
};

export const splitLocationIds = raw => String(raw || '')
  .split(',')
  .map(value => Number.parseInt(value.trim(), 10))
  .filter(value => Number.isInteger(value) && value > 0);
