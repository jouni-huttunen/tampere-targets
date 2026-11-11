export class ApiError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // 'unreachable' | 'no-database' | 'not-found' | 'http'
  }
}

// The hosted copy (npm run deploy) has no server: the API answers are exported as static JSON
// files, and the build sets VITE_STATIC_DATA so the client asks for those instead.
const STATIC_DATA = import.meta.env?.VITE_STATIC_DATA === '1';

/** "/api/meta" → "/api/meta.json", "/api/listings/24760731" → "/api/listings/24760731.json". */
export function staticPath(url) {
  const [pathname, query] = url.split('?');
  return `${pathname.replace(/\/+$/, '')}.json${query ? `?${query}` : ''}`;
}

export async function getJson(url, { signal } = {}) {
  let res;
  try {
    res = await fetch(STATIC_DATA ? staticPath(url) : url, { headers: { accept: 'application/json' }, signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('unreachable', STATIC_DATA ? 'The site is not answering.' : 'The local server is not answering.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(body?.error ?? 'http', body?.message ?? `The server answered ${res.status}.`);
  return body;
}
