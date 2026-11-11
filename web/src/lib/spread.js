// Listings in the same building share one coordinate. To keep every marker hoverable, each
// group is laid out on a small ring (in screen pixels) around the true point.

/** Group listings by identical lat/lon. Returns Map key → ids (sorted by card id, stable). */
export function groupByPosition(listings) {
  const groups = new Map();
  for (const l of listings) {
    if (l.lat == null || l.lon == null) continue;
    const key = `${l.lat},${l.lon}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l.card_id);
  }
  for (const ids of groups.values()) ids.sort((a, b) => a - b);
  return groups;
}

/**
 * Ring radius in pixels for n markers of the given radius, so neighbours don't overlap
 * (circumference ≥ n × (diameter + gap)). One marker needs no ring.
 */
export function ringRadius(n, markerRadius = 6.5, gap = 2) {
  if (n <= 1) return 0;
  return Math.max(markerRadius * 2, (n * (markerRadius * 2 + gap)) / (2 * Math.PI));
}

/** Pixel offsets [dx, dy] for n markers, starting at 12 o'clock, clockwise. */
export function ringOffsets(n, radius = ringRadius(n)) {
  if (n <= 1) return [[0, 0]];
  return Array.from({ length: n }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return [Math.round(radius * Math.cos(angle) * 100) / 100, Math.round(radius * Math.sin(angle) * 100) / 100];
  });
}
