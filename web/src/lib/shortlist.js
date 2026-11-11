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

/** A new Set with id added or removed. */
export function toggled(set, id) {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
