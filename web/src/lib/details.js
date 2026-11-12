import { getJson } from './api.js';

// Successful details live for this page session only; reloading picks up a new snapshot.
// Bound memory on long browsing sessions. Failed and aborted requests are never cached.
const details = new Map();
const LIMIT = 100;

export const cachedDetail = (id) => details.get(id) ?? null;

export async function loadDetail(id, { signal } = {}) {
  if (details.has(id)) return details.get(id);
  const detail = await getJson(`/api/listings/${id}`, { signal });
  signal?.throwIfAborted();
  if (detail) {
    details.set(id, detail);
    if (details.size > LIMIT) details.delete(details.keys().next().value);
  }
  return detail;
}
