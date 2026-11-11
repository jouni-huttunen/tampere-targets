// Browser history for target profiles (FR-40). Opening a profile and each ‹ › step push one
// history entry, so Back walks back through the targets viewed and finally to the main view;
// × and Esc jump straight back to the main view (history.go(-depth)). Filter changes never add
// entries: they only rewrite the current entry's address. Pure helpers, unit-tested under Node.

export const PROFILE = 'tcb-profile';

/** "?year=2010..&listing=123" → 123; missing or malformed → null. */
export function listingFromSearch(search) {
  const id = new URLSearchParams(search).get('listing');
  return id && /^\d{1,12}$/.test(id) ? Number(id) : null;
}

/** The same query with listing set to id (or removed for null), as "?…" or "". */
export function searchWithListing(search, id) {
  const q = new URLSearchParams(search);
  if (id == null) q.delete('listing');
  else q.set('listing', String(id));
  const text = q.toString();
  return text ? `?${text}` : '';
}

/** History state for a newly opened profile: one deeper than the current profile entry, if any. */
export function profileState(current, id) {
  return { tcb: PROFILE, id, depth: current?.tcb === PROFILE && current.depth > 0 ? current.depth + 1 : 1 };
}

/** How many entries to go back to reach the main view (0: not a profile entry of ours). */
export function stepsToMain(state) {
  return state?.tcb === PROFILE && Number.isInteger(state.depth) && state.depth > 0 ? state.depth : 0;
}
