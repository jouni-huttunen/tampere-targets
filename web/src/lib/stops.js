// Stepped ("non-linear") range sliders: the handles snap to fixed stops (build year: decades
// from 1960) and every step gets the same width on the track, so a long, thinly populated past
// does not squeeze the recent decades into a sliver.
//
// The upper handle at stop s means "up to s - 1" (the '90 → '10 span is 1990–2009, matching the
// legend eras); either handle at its data bound means "no limit". Positions are measured in steps:
// 0 at the lower bound, n at the upper bound, fractional for a typed value between stops.

/** The build-year stops: one per decade from 1960 (everything older is one step). */
export const YEAR_DECADES = [1960, 1970, 1980, 1990, 2000, 2010, 2020];

/** [lo, ...the stops strictly inside the bounds, hi]. */
export function stopsWithin(stops, [lo, hi]) {
  return [lo, ...stops.filter((s) => s > lo && s < hi), hi];
}

/** Position of value v in steps (0 … stops.length - 1), linear inside a step. */
export function stopPos(v, stops) {
  const last = stops.length - 1;
  if (v <= stops[0]) return 0;
  if (v >= stops[last]) return last;
  let k = 0;
  while (k < last - 1 && v >= stops[k + 1]) k++;
  return k + (v - stops[k]) / (stops[k + 1] - stops[k] || 1);
}

/** Track position (steps) of each end of a [min, max] value range; max shows as max + 1. */
export function rangePos([a, b], stops) {
  const hi = stops[stops.length - 1];
  return [stopPos(a, stops), b >= hi ? stops.length - 1 : stopPos(b + 1, stops)];
}

/**
 * The value range after the lower (end 0) or upper (end 1) handle is moved to step `to`
 * (rounded to a stop). The handles keep at least one step between them.
 */
export function moveEnd([a, b], end, to, stops) {
  const last = stops.length - 1;
  const [pa, pb] = rangePos([a, b], stops);
  if (end === 0) {
    const i = Math.max(0, Math.min(Math.round(to), Math.ceil(pb - 1e-9) - 1));
    return [stops[i], b];
  }
  const j = Math.min(last, Math.max(Math.round(to), Math.floor(pa + 1e-9) + 1));
  return [a, j === last ? stops[last] : stops[j] - 1];
}

/** The next stop up (dir 1) or down (dir -1) from a position, for the arrow keys. */
export function nextStop(pos, dir, last) {
  const to = dir > 0 ? Math.floor(pos + 1e-9) + 1 : Math.ceil(pos - 1e-9) - 1;
  return Math.max(0, Math.min(last, to));
}
