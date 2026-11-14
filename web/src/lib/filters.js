// Pure filter, sort and URL logic for the UI (no React, no DOM), so node:test can cover it.
// A range is [min, max]; either end may be null, meaning "no limit on that side".
import { FINANCING, SUBSIDISED, TYPE_CODES, financing, hasAnyType } from './housing.js';

export const RANGE_KEYS = ['year', 'rent', 'size', 'rooms'];

export const FIELD = {
  year: 'build_year',
  rent: 'rent_eur',
  size: 'size_m2',
  rooms: 'rooms',
};

export const SORTS = [
  { key: 'year', label: 'Build year, newest first' },
  { key: 'size', label: 'Size, largest first' },
  { key: 'rent', label: 'Rent, lowest first' },
  { key: 'perm2', label: 'Rent per m², lowest first' },
  { key: 'available', label: 'Available, earliest first' },
  { key: 'centre', label: 'Closest to Keskustori' },
  { key: 'station', label: 'Closest to the station' },
  { key: 'newest', label: 'Newest listing' },
];

const OPEN = [null, null];

// Move-in chips that are off: month keys ("2026-12"), "later" or "unknown" (lib/movein.js).
// Stored as the chips switched off, so months that appear with new data start switched on.
export const DEFAULT_MOVE_OFF = ['later'];
const MOVE_KEY = /^(\d{4}-\d{2}|later|unknown)$/;

// Financing chips that are off (FR-49, lib/housing.js): only free-market shows by default.
export const DEFAULT_FINANCE_OFF = [SUBSIDISED];
const FINANCE_KEYS = FINANCING.map((f) => f.key);

export function defaultFilters() {
  return {
    year: OPEN,
    rent: OPEN,
    size: OPEN,
    rooms: OPEN,
    moveOff: DEFAULT_MOVE_OFF,
    financeOff: DEFAULT_FINANCE_OFF,
    // Housing types to show only (codes 2, 4–8); none selected means no type filter.
    types: [],
    zips: [],
    onlyNew: false,
    onlySaved: false,
    topFloor: false,
    sort: 'year',
  };
}

/** Min and max of each filterable field over all listings (nulls ignored). */
export function dataBounds(listings) {
  const span = (values) => {
    const v = values.filter((x) => x !== null && x !== undefined);
    return v.length ? [v.reduce((a, b) => (b < a ? b : a)), v.reduce((a, b) => (b > a ? b : a))] : null;
  };
  const rent = span(listings.map((l) => l.rent_eur));
  const size = span(listings.map((l) => l.size_m2));
  return {
    year: span(listings.map((l) => l.build_year)),
    rent: rent && [Math.floor(rent[0] / 10) * 10, Math.ceil(rent[1] / 10) * 10],
    size: size && [Math.floor(size[0]), Math.ceil(size[1])],
    rooms: span(listings.map((l) => l.rooms)),
  };
}

/** On the building's top floor: nobody lives above (needs both the floor and the floor count). */
export function isTopFloor(l) {
  return l.floor != null && l.floor_count != null && l.floor >= l.floor_count;
}

export function isOpen(range) {
  return !range || (range[0] == null && range[1] == null);
}

export function inRange(value, [min, max]) {
  return (min == null || value >= min) && (max == null || value <= max);
}

/**
 * Snap a range to the data bounds: an end at or beyond its bound becomes null (no limit),
 * and the ends are put in order.
 */
export function normalizeRange(range, bounds) {
  if (!range) return OPEN;
  let [a, b] = range;
  if (a != null && b != null && a > b) [a, b] = [b, a];
  if (bounds) {
    if (a != null && a <= bounds[0]) a = null;
    if (b != null && b >= bounds[1]) b = null;
  }
  return [a, b];
}

/**
 * saved: the shortlist (a Set of card ids), used by "only shortlist". Withdrawn (removed) listings
 * never match: they leave the view without notice (the user's choice).
 */
export function matches(l, f, saved = null) {
  if (l.removed) return false;
  for (const key of RANGE_KEYS) {
    const range = f[key];
    if (isOpen(range)) continue; // untouched: listings without a value stay in
    const v = l[FIELD[key]];
    if (v === null || v === undefined || !inRange(v, range)) return false;
  }
  if (f.moveOff.includes(l.move_in ?? 'unknown')) return false;
  if (f.financeOff.includes(financing(l))) return false;
  if (f.types.length && !hasAnyType(l, f.types)) return false;
  if (f.zips.length && !f.zips.includes(l.zip)) return false;
  if (f.onlyNew && !l.is_new) return false;
  if (f.onlySaved && !saved?.has(l.card_id)) return false;
  if (f.topFloor && !isTopFloor(l)) return false;
  return true;
}

export function applyFilters(listings, f, saved = null) {
  return listings.filter((l) => matches(l, f, saved));
}

/** Rent per square metre, or null when either is missing. */
export function rentPerM2(l) {
  return l.rent_eur > 0 && l.size_m2 > 0 ? l.rent_eur / l.size_m2 : null;
}

// Sort helpers: nulls always last, ties broken by card id for a stable order.
const asc = (get) => (a, b) => cmp(get(a), get(b), 1) || a.card_id - b.card_id;
const desc = (get) => (a, b) => cmp(get(a), get(b), -1) || a.card_id - b.card_id;
function cmp(x, y, dir) {
  const xn = x === null || x === undefined;
  const yn = y === null || y === undefined;
  if (xn || yn) return xn === yn ? 0 : xn ? 1 : -1;
  return x < y ? -dir : x > y ? dir : 0;
}

const SORTERS = {
  year: desc((l) => l.build_year),
  size: desc((l) => l.size_m2),
  rent: asc((l) => l.rent_eur),
  perm2: asc((l) => rentPerM2(l)),
  available: asc((l) => l.available_date),
  centre: asc((l) => l.dist?.centre),
  station: asc((l) => l.dist?.station),
  newest: desc((l) => l.published_sort_at ?? l.published_at),
};

export function sortListings(listings, sort) {
  return listings.slice().sort(SORTERS[sort] ?? SORTERS.year);
}

// ---- URL query ----------------------------------------------------------------------
// year=2010..2026, year=2010.. , rent=..900, moveoff=2026-11,later (the move-in chips switched
// off; empty = all on), financeoff=subsidised (the financing chips switched off; empty = both on),
// type=4,8 (only these housing types), zip=33100,33200, new=1, top=1 (top floor only), sort=size (an old removed=… is ignored). Only
// values that differ from the defaults are written.

const rangeText = ([a, b]) => `${a ?? ''}..${b ?? ''}`;
function parseRange(text) {
  if (typeof text !== 'string' || !text.includes('..')) return null;
  const [a, b] = text.split('..');
  const read = (s) => {
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  };
  const range = [read(a), read(b)];
  return range.includes(undefined) ? null : range;
}

const sameRange = (x, y) => x[0] === y[0] && x[1] === y[1];
const sameSet = (x, y) => x.length === y.length && x.every((k) => y.includes(k));

export function toQuery(f, defaults) {
  const q = new URLSearchParams();
  for (const key of RANGE_KEYS) if (!sameRange(f[key], defaults[key])) q.set(key, rangeText(f[key]));
  if (!sameSet(f.moveOff, defaults.moveOff)) q.set('moveoff', f.moveOff.join(','));
  if (!sameSet(f.financeOff, defaults.financeOff)) q.set('financeoff', f.financeOff.join(','));
  if (f.types.length) q.set('type', f.types.join(','));
  if (f.zips.length) q.set('zip', f.zips.join(','));
  if (f.onlyNew) q.set('new', '1');
  if (f.onlySaved) q.set('saved', '1');
  if (f.topFloor) q.set('top', '1');
  if (f.sort !== defaults.sort) q.set('sort', f.sort);
  return q.toString();
}

export function fromQuery(search, defaults, validZips = null) {
  const q = new URLSearchParams(search);
  const f = structuredClone(defaults);
  for (const key of RANGE_KEYS) {
    const r = q.has(key) ? parseRange(q.get(key)) : null;
    if (r) f[key] = r;
  }
  if (q.has('moveoff')) f.moveOff = [...new Set(q.get('moveoff').split(',').filter((k) => MOVE_KEY.test(k)))];
  if (q.has('financeoff')) f.financeOff = [...new Set(q.get('financeoff').split(',').filter((k) => FINANCE_KEYS.includes(k)))];
  if (q.get('type')) {
    f.types = [...new Set(q.get('type').split(',').map(Number).filter((c) => TYPE_CODES.includes(c)))];
  }
  if (q.get('zip')) {
    f.zips = q
      .get('zip')
      .split(',')
      .filter((z) => /^\d{5}$/.test(z) && (!validZips || validZips.includes(z)));
  }
  if (q.get('new') === '1') f.onlyNew = true;
  if (q.get('saved') === '1') f.onlySaved = true;
  if (q.get('top') === '1') f.topFloor = true;
  if (SORTS.some((s) => s.key === q.get('sort'))) f.sort = q.get('sort');
  return f;
}

/** How many filters differ from their defaults (sort is not a filter). */
export function activeFilterCount(f, defaults) {
  let n = 0;
  for (const key of RANGE_KEYS) if (!sameRange(f[key], defaults[key])) n++;
  if (!sameSet(f.moveOff, defaults.moveOff)) n++;
  if (!sameSet(f.financeOff, defaults.financeOff)) n++;
  if (f.types.length) n++;
  if (f.zips.length) n++;
  if (f.onlyNew) n++;
  if (f.onlySaved) n++;
  if (f.topFloor) n++;
  return n;
}

/** Median of the non-null numbers, or null when there are none. */
export function median(values) {
  const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}
