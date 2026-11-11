// Timestamp helpers (Node side). Oikotie search cards carry UTC times, detail
// responses carry Europe/Helsinki local times. Everything is stored as UTC ISO.

const helsinkiFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Helsinki',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Offset of Europe/Helsinki from UTC, in ms, at the given UTC instant. */
export function helsinkiOffsetMs(utcMs) {
  const p = {};
  for (const part of helsinkiFormat.formatToParts(new Date(utcMs))) p[part.type] = Number(part.value);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

function helsinkiLocalToUtcMs(localAsUtcMs) {
  let utc = localAsUtcMs - helsinkiOffsetMs(localAsUtcMs);
  utc = localAsUtcMs - helsinkiOffsetMs(utc);
  return utc;
}

const STAMP = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,3})\d*)?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/**
 * Convert an Oikotie timestamp to a UTC ISO string.
 * zone: 'utc' or 'helsinki', used only when the value carries no offset.
 * Accepts unix seconds or milliseconds, and "YYYY-MM-DD[ T]HH:mm[:ss[.sss]][Z|+hh:mm]".
 * Returns null for anything it does not recognise (never guesses).
 */
export function toUtcIso(value, zone = 'utc') {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' && /^\d{9,13}$/.test(value.trim())) value = Number(value.trim());
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    return new Date(value < 1e11 ? value * 1000 : value).toISOString();
  }
  if (typeof value !== 'string') return null;
  const m = STAMP.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', s = '0', frac = '0', offset] = m;
  const asUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, Number(frac.padEnd(3, '0')));
  if (!Number.isFinite(asUtc)) return null;
  let ms;
  if (offset) {
    if (offset.toUpperCase() === 'Z') ms = asUtc;
    else {
      const sign = offset[0] === '-' ? -1 : 1;
      const digits = offset.slice(1).replace(':', '');
      const minutes = Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4) || 0);
      ms = asUtc - sign * minutes * 60000;
    }
  } else if (zone === 'helsinki') {
    ms = helsinkiLocalToUtcMs(asUtc);
  } else {
    ms = asUtc;
  }
  return new Date(ms).toISOString();
}

/** Calendar date (YYYY-MM-DD) in Helsinki for a UTC ISO timestamp. */
export function helsinkiDate(iso) {
  const ms = Date.parse(iso);
  return new Date(ms + helsinkiOffsetMs(ms)).toISOString().slice(0, 10);
}

/** "2026-11-11 10:15" in Helsinki time, for reports and the CLI. */
export function helsinkiDateTime(iso) {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return String(iso);
  return new Date(ms + helsinkiOffsetMs(ms)).toISOString().slice(0, 16).replace('T', ' ');
}
