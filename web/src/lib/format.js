// Display formatting. Dates are shown Finnish-style (1.12.2026), times in Europe/Helsinki.

const nf0 = new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const helsinki = new Intl.DateTimeFormat('fi-FI', {
  timeZone: 'Europe/Helsinki',
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const helsinkiDay = new Intl.DateTimeFormat('fi-FI', {
  timeZone: 'Europe/Helsinki',
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
});

/** "2026-12-01" → "1.12.2026" */
export function fmtDate(date) {
  if (!date) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  return m ? `${Number(m[3])}.${Number(m[2])}.${m[1]}` : String(date);
}

/** UTC ISO → "11.11.2026 klo 14.05" style, in Helsinki time. */
export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : helsinki.format(d).replace(' klo', '');
}

/** UTC ISO → Helsinki calendar day "11.11.2026". */
export function fmtDay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : helsinkiDay.format(d);
}

export function fmtEur(n) {
  return n == null ? '—' : `${nf0.format(n)} €`;
}

/** "18.2 €/m²" */
export function fmtPerM2(n) {
  return n == null ? '—' : `${nf1.format(n)} €/m²`;
}

export function fmtM2(n) {
  return n == null ? '—' : `${nf0.format(n)} m²`;
}

export function fmtKm(n, approx = false) {
  if (n == null) return '—';
  return `${approx ? '≈ ' : ''}${nf1.format(n)} km`;
}

export function roomsText(l) {
  if (l.rooms == null) return '';
  return `${l.rooms} ${l.rooms === 1 ? 'room' : 'rooms'}`;
}

/** "3 / 5" (floor of floors), or "3" when the building's floor count is unknown; null without a floor. */
export function fmtFloor(l) {
  if (l.floor == null) return null;
  return l.floor_count != null ? `${l.floor} / ${l.floor_count}` : String(l.floor);
}

/** Available date, or the listing's own text ("heti", "sopimuksen mukaan"), or "no date". */
export function availabilityText(l) {
  if (l.available_date) return fmtDate(l.available_date);
  if (l.availability_text) return l.availability_text;
  return 'no date';
}

/** The profile's move-in field (star row) cuts free text here, as a failsafe behind its CSS ellipsis. */
export const MOVE_IN_MAX = 40;

/**
 * The move-in shown up front in the target profile: the date when there is one, otherwise the
 * listing's own text, tidied (spaces collapsed, a trailing full stop dropped) and cut at a word
 * boundary to at most `max` characters with "…"; '' when the listing says nothing. `full` is the
 * untruncated value, for the tooltip.
 */
export function moveInBrief(l, max = MOVE_IN_MAX) {
  if (l?.available_date) {
    const date = fmtDate(l.available_date);
    return { text: date, full: date };
  }
  const full = String(l?.availability_text ?? '').replace(/\s+/g, ' ').trim().replace(/\.$/, '');
  if (!full) return { text: '', full: '' };
  if (full.length <= max) return { text: full, full };
  const cut = full.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  // Prefer a word boundary, unless it would throw away more than a third of the room.
  const head = (space > (max * 2) / 3 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, '');
  return { text: `${head}…`, full };
}

// Build-year shade bins, deep (old) → white-hot (new) in the theme colour. 0 = unknown year.
export const YEAR_BINS = [
  { bin: 1, label: 'before 1960', test: (y) => y < 1960 },
  { bin: 2, label: '1960–1989', test: (y) => y < 1990 },
  { bin: 3, label: '1990–2009', test: (y) => y < 2010 },
  { bin: 4, label: '2010–2019', test: (y) => y < 2020 },
  { bin: 5, label: '2020 or newer', test: () => true },
];

export function yearBin(year) {
  if (year == null) return 0;
  return YEAR_BINS.find((b) => b.test(year)).bin;
}
