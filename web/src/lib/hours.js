// Store opening hours (FR-43): the subset of OpenStreetMap's opening_hours syntax that the
// Tampere grocery stores use ("Mo-Fr 07:00-22:00; Sa,Su 09:00-22:00", "24/7", "06:00-24:00"),
// parsed into a week, and "open now" in Helsinki time. Used by the browser and by
// `npm run infra` (which reports the stores whose hours it cannot read).
//
// A week is 7 arrays (Monday first) of [startMinute, endMinute] spans, end at most 1440.

export const DAY_CODES = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const DAY_RE = '(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)';
// Rules are separated by ";" or by a comma after a time ("…23:00, Sa 08:00-…"); a comma
// between days ("Sa,Su") is part of the day list.
const RULE_SPLIT = new RegExp(`\\s*;\\s*|(?<=\\d)\\s*,\\s*(?=${DAY_RE}\\b)`);
const RULE_RE = new RegExp(`^(${DAY_RE}(?:-${DAY_RE})?(?:,${DAY_RE}(?:-${DAY_RE})?)*)?\\s*(.*)$`);
const SPAN_RE = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/;

const minutes = (h, m) => (Number(h) > 24 || Number(m) > 59 ? NaN : Number(h) * 60 + Number(m));

/** The days a selector names ("Mo-Fr", "Sa,Su", "Fr-Mo"); public holidays (PH) are left out. */
function selectorDays(selector) {
  if (!selector) return DAY_CODES.map((_, i) => i);
  const days = [];
  for (const part of selector.split(',')) {
    const [a, b] = part.split('-');
    if (a === 'PH') continue;
    const from = DAY_CODES.indexOf(a);
    const to = b ? DAY_CODES.indexOf(b) : from;
    for (let d = from; ; d = (d + 1) % 7) {
      days.push(d);
      if (d === to) break;
    }
  }
  return days;
}

/**
 * Parse an opening_hours value into a week, or null when it is missing or uses syntax this
 * parser does not know (the UI then shows the raw text). Later rules replace earlier ones for
 * the days they name, as in OSM. Rules only for public holidays ("PH off") are skipped.
 */
export function parseOpeningHours(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const text = raw.trim();
  if (text === '24/7') return DAY_CODES.map(() => [[0, 1440]]);
  const week = DAY_CODES.map(() => []);
  const spill = DAY_CODES.map(() => []); // the after-midnight part of overnight spans
  for (const rule of text.split(RULE_SPLIT).filter(Boolean)) {
    const m = rule.match(RULE_RE);
    if (!m) return null;
    const [, selector, times] = m;
    if (selector && selector.split(',').every((p) => p === 'PH')) continue;
    const days = selectorDays(selector);
    const spans = [];
    if (!/^(off|closed)$/.test(times.trim())) {
      for (const t of times.split(/\s*,\s*/)) {
        const s = t.trim().match(SPAN_RE);
        if (!s) return null;
        const start = minutes(s[1], s[2]);
        const end = minutes(s[3], s[4]);
        if (!(start < 1440) || !(end <= 1440)) return null;
        spans.push([start, end]);
      }
    }
    for (const d of days) {
      week[d] = [];
      spill[(d + 1) % 7] = spill[(d + 1) % 7].filter((x) => x.from !== d);
      for (const [start, end] of spans) {
        if (end > start) week[d].push([start, end]);
        else {
          week[d].push([start, 1440]);
          if (end > 0) spill[(d + 1) % 7].push({ from: d, span: [0, end] });
        }
      }
    }
  }
  return week.map((spans, d) => [...spill[d].map((x) => x.span), ...spans].sort((a, b) => a[0] - b[0]));
}

const CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Helsinki',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** { day: 0 (Monday) … 6, min: minutes since midnight } in Helsinki time. */
export function helsinkiClock(date = new Date()) {
  const parts = Object.fromEntries(CLOCK.formatToParts(date).map((p) => [p.type, p.value]));
  return { day: WEEKDAYS.indexOf(parts.weekday), min: Number(parts.hour) * 60 + Number(parts.minute) };
}

/**
 * Open or closed at `clock` ({ day, min }):
 * { open: true, until: { day, min } } (until null when it never closes),
 * { open: false, opens: { day, min } } (opens null when it never opens).
 */
export function openState(week, clock) {
  const span = week[clock.day].find(([s, e]) => s <= clock.min && clock.min < e);
  if (span) {
    // Follow spans that run on past midnight (…-24:00 then 00:00-…), at most a week.
    let day = clock.day;
    let end = span[1];
    for (let i = 0; i < 7 && end === 1440; i++) {
      const next = week[(day + 1) % 7].find(([s]) => s === 0);
      if (!next) break;
      day = (day + 1) % 7;
      end = next[1];
    }
    return { open: true, until: end === 1440 ? null : { day, min: end } };
  }
  for (let i = 0; i < 8; i++) {
    const day = (clock.day + i) % 7;
    const next = week[day].find(([s]) => i > 0 || s > clock.min);
    if (next) return { open: false, opens: { day, min: next[0] } };
  }
  return { open: false, opens: null };
}

const pad = (n) => String(n).padStart(2, '0');
export const fmtMinute = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const fmtSpans = (spans) =>
  spans.length === 0 ? 'closed' : spans.map(([s, e]) => (s === 0 && e === 1440 ? '24 h' : `${fmtMinute(s)}–${fmtMinute(e)}`)).join(', ');

/** One short status line: "Open · closes 22:00", "Closed · opens Sa 08:00", "Open 24/7". */
export function statusText(week, clock) {
  const st = openState(week, clock);
  if (st.open) {
    if (!st.until) return 'Open 24/7';
    return `Open · closes ${st.until.day === clock.day ? '' : `${DAY_CODES[st.until.day]} `}${fmtMinute(st.until.min)}`;
  }
  if (!st.opens) return 'Closed';
  return `Closed · opens ${st.opens.day === clock.day ? '' : `${DAY_CODES[st.opens.day]} `}${fmtMinute(st.opens.min)}`;
}

/** The week as rows of days with the same hours: [{ days: 'Mo–Fr', hours: '07:00–22:00', from, to }]. */
export function weekRows(week) {
  const rows = [];
  week.forEach((spans, d) => {
    const hours = fmtSpans(spans);
    const last = rows[rows.length - 1];
    if (last && last.hours === hours) last.to = d;
    else rows.push({ from: d, to: d, hours });
  });
  return rows.map((r) => ({ ...r, days: r.from === r.to ? DAY_CODES[r.from] : `${DAY_CODES[r.from]}–${DAY_CODES[r.to]}` }));
}
