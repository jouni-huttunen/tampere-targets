export class ApiError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // 'unreachable' | 'no-database' | 'not-found' | 'http'
  }
}

export async function getJson(url, { signal } = {}) {
  let res;
  try {
    res = await fetch(url, { headers: { accept: 'application/json' }, signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('unreachable', 'The local server is not answering.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(body?.error ?? 'http', body?.message ?? `The server answered ${res.status}.`);
  return body;
}
