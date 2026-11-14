// API JSON -> typed listing columns. Pure: used by both import and rebuild.
// Field sources are documented in docs/02-data-source.md, section 6.
// The search card wins where both sources carry a value (it is refreshed on every sweep).
import { toUtcIso } from './time.mjs';

/** Parse Finnish-formatted numbers such as "1 170 € / kk", "42,5 m²" or 1170. */
export function parseNumberFi(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const m = /-?\d[\d\s  .]*(?:,\d+)?/.exec(value);
  if (!m) return null;
  let text = m[0].replace(/[\s  ]/g, '');
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function toInt(value) {
  const n = parseNumberFi(value);
  return n === null ? null : Math.trunc(n);
}

/** Keep a value "as received" in a TEXT column. */
function asText(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** A name that may arrive as a plain string or as an object with a name. */
function nameOf(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return asText(value);
  if (typeof value === 'object') return asText(value.name ?? value.title ?? null);
  return asText(value);
}

function isoDate(value) {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return m ? m[1] : null;
}

function first(...values) {
  for (const v of values) if (v !== null && v !== undefined && v !== '') return v;
  return null;
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(a));
}

/**
 * Oikotie gives ungeocoded addresses a fixed placeholder point near Kuhmo
 * (seen on 17 of 381 Tampere listings on 2026-11-10). Any point this far from the
 * first configured place can't be a home in the crawl area either.
 */
const PLACEHOLDER_POINTS = [[64.5498, 29.5323]];
const MAX_KM_FROM_FIRST_PLACE = 50;

function plausiblePoint(lat, lon, config) {
  if (lat === null || lon === null) return false;
  if (PLACEHOLDER_POINTS.some(([a, b]) => Math.abs(lat - a) < 1e-4 && Math.abs(lon - b) < 1e-4)) return false;
  const ref = config.places[0];
  return !ref || haversineKm(lat, lon, ref.lat, ref.lon) <= MAX_KM_FROM_FIRST_PLACE;
}

/** First plausible [lat, lon] from the candidates, or [null, null]. */
function pickPoint(candidates, config) {
  for (const [rawLat, rawLon] of candidates) {
    const lat = parseNumberFi(rawLat);
    const lon = parseNumberFi(rawLon);
    if (plausiblePoint(lat, lon, config)) return [lat, lon];
  }
  return [null, null];
}

export function distanceColumn(place) {
  return `dist_${place.key}_km`;
}

/** Names of all extracted columns for a config (used by rebuild and the schema). */
export function extractedColumns(config) {
  return [...BASE_COLUMNS, ...config.places.map(distanceColumn)];
}

const BASE_COLUMNS = [
  'url', 'status', 'published_at', 'published_sort_at', 'price_changed_at',
  'address', 'district', 'zip', 'lat', 'lon', 'location_approx',
  'rent_eur', 'size_m2', 'rooms', 'room_config',
  'build_year', 'building_type', 'floor', 'floor_count',
  'available_date', 'availability_text', 'lease_text',
  'deposit_eur', 'water_fee', 'electric_fee', 'pets_allowed', 'furnished', 'company_name',
];

/**
 * card:   search card JSON or null
 * detail: detail JSON or null
 * Returns an object with every extracted column (null where unknown).
 */
export function normalize(card, detail, config) {
  const c = card || {};
  const data = c.data || {};
  const loc = c.location || {};
  const meta = c.meta || {};
  const d = detail || {};
  const ad = d.adData || {};
  const addr = d.address || {};
  const coords = d.coordinates || {};
  const building = d.building || {};

  let [lat, lon] = pickPoint(
    [
      [loc.latitude, loc.longitude],
      [coords.latitude, coords.longitude],
    ],
    config,
  );
  // No real point: fall back to the postal-code centre and flag it as approximate.
  let locationApprox = 0;
  if (lat === null) {
    const zip = first(asText(loc.zipCode), nameOf(addr.zipCode));
    const area = config.areas.find((a) => String(a.zip) === zip && a.lat != null);
    const zipPoint = addr.zipCode && typeof addr.zipCode === 'object' ? addr.zipCode.coordinates || {} : {};
    [lat, lon] = pickPoint([area ? [area.lat, area.lon] : [null, null], [zipPoint.latitude, zipPoint.longitude]], config);
    if (lat !== null) locationApprox = 1;
  }
  const districts = Array.isArray(addr.districts) ? addr.districts : [];

  const row = {
    url: asText(first(c.url, d.url)),
    status: toInt(first(d.status, c.status)),
    published_at: first(toUtcIso(meta.published, 'utc'), toUtcIso(d.published, 'helsinki')),
    published_sort_at: toUtcIso(meta.publishedSort, 'utc'),
    price_changed_at: asText(meta.priceChanged),
    address: first(asText(loc.address), nameOf(addr.street), asText(ad.streetAddress)),
    district: first(nameOf(loc.district), nameOf(districts[0])),
    zip: first(asText(loc.zipCode), nameOf(addr.zipCode)),
    lat,
    lon,
    location_approx: locationApprox,
    rent_eur: first(parseNumberFi(data.price), parseNumberFi(d.priceData && d.priceData.price)),
    size_m2: first(parseNumberFi(data.sizeMin), parseNumberFi(data.size), parseNumberFi(ad.size)),
    rooms: first(toInt(data.rooms), toInt(ad.rooms)),
    room_config: first(asText(data.roomConfiguration), asText(ad.roomConfiguration)),
    build_year: first(toInt(data.buildYear), toInt(ad.buildingOverrideBuildYear), toInt(building.buildYear)),
    building_type: toInt(ad.buildingOverrideBuildingType),
    floor: first(toInt(ad.floor), toInt(data.floor)),
    // The detail's floorCount is often empty while the building's count is still given elsewhere.
    floor_count: first(toInt(ad.floorCount), toInt(data.buildingFloorCount), toInt(ad.buildingOverrideFloors)),
    available_date: isoDate(ad.availabilityDate),
    availability_text: asText(ad.availabilityInfo),
    lease_text: asText(ad.rentTermInfo),
    deposit_eur: parseNumberFi(ad.securityDeposit),
    water_fee: first(asText(ad.waterFee), asText(ad.waterFeeInfo)),
    electric_fee: asText(ad.electricFee),
    pets_allowed: asText(ad.petsAllowed),
    furnished: asText(ad.rentFurnished),
    company_name: first(
      asText(c.company && c.company.companyName),
      asText(d.company && (d.company.companyName ?? d.company.name)),
    ),
  };

  for (const place of config.places) {
    row[distanceColumn(place)] =
      lat === null || lon === null ? null : Math.round(haversineKm(lat, lon, place.lat, place.lon) * 1000) / 1000;
  }
  return row;
}
