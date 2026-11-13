// The shortlist lives only in this browser's localStorage (the server and DB stay read-only).
// Stored as a JSON array of card ids under one key. Every access is guarded: storage can be
// missing or blocked, and the app must work without it.

export const SHORTLIST_KEY = 'tcb.shortlist.v1';

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function parseShortlist(text) {
  try {
    const ids = JSON.parse(text ?? '[]');
    return new Set(Array.isArray(ids) ? ids.filter((id) => Number.isInteger(id) && id > 0) : []);
  } catch {
    return new Set();
  }
}

export function loadShortlist(storage = defaultStorage()) {
  try {
    return parseShortlist(storage?.getItem(SHORTLIST_KEY));
  } catch {
    return new Set();
  }
}

export function saveShortlist(set, storage = defaultStorage()) {
  try {
    storage?.setItem(SHORTLIST_KEY, JSON.stringify([...set].sort((a, b) => a - b)));
    return true;
  } catch {
    return false;
  }
}

/**
 * The stars that point at a listing still on Oikotie (activeIds: a Set of active card ids, or
 * null while the data loads). Stars for listings no longer in the data, or withdrawn, are ignored
 * without a word (the user's choice) but stay stored: a withdrawn listing can reappear. Returns
 * the same Set when nothing is dropped.
 */
export function liveShortlist(saved, activeIds) {
  if (!activeIds) return new Set();
  for (const id of saved) {
    if (!activeIds.has(id)) return new Set([...saved].filter((s) => activeIds.has(s)));
  }
  return saved;
}

/** A new Set with id added or removed. */
export function toggled(set, id) {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
