// The target list shows the targets on the visible map first, then a separator and the rest (FR-41).

/**
 * Split a sorted list by what the map shows. `inView` is a Set of card ids whose marker is on the
 * visible map, or null while the map has not reported yet. Returns `{ ordered, inViewCount }`:
 * the in-view targets first, then the rest, each part keeping the given order. `inViewCount` is
 * null when there is nothing to split (no report yet, or every target is in view), so the list
 * shows no separator.
 */
export function splitByView(listings, inView) {
  if (!inView) return { ordered: listings, inViewCount: null };
  const inside = [];
  const outside = [];
  for (const l of listings) (inView.has(l.card_id) ? inside : outside).push(l);
  if (outside.length === 0) return { ordered: listings, inViewCount: null };
  return { ordered: inside.concat(outside), inViewCount: inside.length };
}

/** True when two id sets hold the same ids (the map reports only real changes). */
export function sameIds(a, b) {
  if (a === b) return true;
  if (!a || !b || a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

/**
 * The index ‹ › lead to from `position` in a list of `count` targets: it wraps round, so the last
 * target's › goes to the first and the first one's ‹ to the last (the user can browse in one
 * direction only). -1 when there is nothing to step to (no position, or a single target).
 */
export function stepIndex(position, delta, count) {
  if (position < 0 || count < 2) return -1;
  return (((position + delta) % count) + count) % count;
}
