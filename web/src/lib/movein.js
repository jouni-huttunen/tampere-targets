// Move-in month (FR-30): the month a listing can be moved into, inferred from its date field and
// its free text, and the chips the parameters panel shows (the months up to the window cutoff,
// "Later" and "Unknown"). Pure functions, covered by node:test.
//
// Rules, in order:
//   1. the date field (available_date), when set;
//   2. "heti" (immediately) in the text: the month the listing was fetched;
//   3. the first explicit date in the text: 2026-12-01, 1.12.2026, 9.11. (no year), or a Finnish
//      month name ("joulukuussa", "tammikuun alussa");
//   4. otherwise unknown.
// A month before the fetch month (a date already past) counts as the fetch month. Months are
// read in Helsinki time.

const FI_MONTHS = ['tammi', 'helmi', 'maalis', 'huhti', 'touko', 'kesä', 'heinä', 'elo', 'syys', 'loka', 'marras', 'joulu'];
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const LATER = 'later';
export const UNKNOWN = 'unknown';

/** Month index (year * 12 + month - 1), so months compare and add as plain numbers. */
const index = (year, month) => year * 12 + (month - 1);
const keyOf = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
const indexOf = (key) => index(Number(key.slice(0, 4)), Number(key.slice(5, 7)));

const helsinkiMonth = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki', year: 'numeric', month: '2-digit' });

/** The Helsinki month of an ISO timestamp as a month index, or null. */
function fetchMonth(iso) {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return null;
  const parts = Object.fromEntries(helsinkiMonth.formatToParts(new Date(t)).map((p) => [p.type, p.value]));
  return index(Number(parts.year), Number(parts.month));
}

/**
 * A month without a year: the nearest one from the fetch month, where up to two months back
 * counts as past (a stale "9.11." read in December) and anything else as coming.
 */
function yearless(month, fetched) {
  const ahead = (month - ((fetched % 12) + 1) + 12) % 12;
  return ahead >= 10 ? fetched - (12 - ahead) : fetched + ahead;
}

/** The month of the first explicit date in a text, or null. */
export function textMonth(text, fetched) {
  if (!text) return null;
  const found = [];
  const add = (re, read) => {
    for (const m of text.matchAll(re)) {
      const i = read(m);
      if (i != null) found.push({ at: m.index, i });
    }
  };
  const month = (n) => (n >= 1 && n <= 12 ? n : null);
  add(/(\d{4})-(\d{1,2})-(\d{1,2})/g, (m) => (month(+m[2]) ? index(+m[1], +m[2]) : null));
  add(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g, (m) => (month(+m[2]) ? index(+m[3], +m[2]) : null));
  add(/\b(\d{1,2})\.(\d{1,2})\.(?!\d)/g, (m) => (month(+m[2]) && fetched != null ? yearless(+m[2], fetched) : null));
  add(new RegExp(`(${FI_MONTHS.join('|')})kuu`, 'giu'), (m) =>
    fetched != null ? yearless(FI_MONTHS.indexOf(m[1].toLowerCase()) + 1, fetched) : null,
  );
  if (!found.length) return null;
  found.sort((a, b) => a.at - b.at);
  return found[0].i;
}

/**
 * The inferred move-in month of a listing as "YYYY-MM", or null when nothing says it.
 * Uses available_date, availability_text and the fetch time (detail, else search).
 */
export function moveInMonth(l) {
  const fetched = fetchMonth(l.detail_fetched_at ?? l.search_fetched_at);
  let i = null;
  if (l.available_date) {
    i = index(Number(l.available_date.slice(0, 4)), Number(l.available_date.slice(5, 7)));
  } else if (/\bheti\b/iu.test(l.availability_text ?? '')) {
    i = fetched;
  } else {
    i = textMonth(l.availability_text, fetched);
  }
  if (i == null) return null;
  if (fetched != null && i < fetched) i = fetched; // already past: available now
  return keyOf(i);
}

/** The chip a listing belongs to: "YYYY-MM" before the cutoff month, LATER from it, or UNKNOWN. */
export function moveInBucket(l, windowCutoff) {
  const key = moveInMonth(l);
  if (!key) return UNKNOWN;
  return windowCutoff && key >= windowCutoff.slice(0, 7) ? LATER : key;
}

/** "2026-11" → "November" (the year goes in the title). */
export function monthLabel(key) {
  if (key === LATER) return 'Later';
  if (key === UNKNOWN) return 'Unknown';
  return EN_MONTHS[Number(key.slice(5, 7)) - 1] ?? key;
}

/**
 * The chips, in order: every month from the earliest one any listing has up to the month before
 * the cutoff (months with no listing included, so the row never has gaps), then Later and
 * Unknown. Each with its count of listings (removed ones are not counted). Listings must carry
 * `move_in` (moveInBucket).
 */
export function moveInChips(listings, windowCutoff) {
  const count = new Map();
  let first = null;
  for (const l of listings) {
    if (l.removed) continue;
    count.set(l.move_in, (count.get(l.move_in) ?? 0) + 1);
    if (l.move_in !== LATER && l.move_in !== UNKNOWN && (first == null || l.move_in < first)) first = l.move_in;
  }
  const chips = [];
  if (first != null) {
    const last = windowCutoff ? indexOf(windowCutoff.slice(0, 7)) - 1 : Math.max(...[...count.keys()].filter((k) => /^\d{4}-\d{2}$/.test(k)).map(indexOf));
    for (let i = indexOf(first); i <= last; i++) chips.push(keyOf(i));
  }
  if (windowCutoff) chips.push(LATER);
  chips.push(UNKNOWN);
  return chips.map((key) => ({ key, label: monthLabel(key), year: /^\d{4}/.test(key) ? key.slice(0, 4) : null, count: count.get(key) ?? 0 }));
}
