// Azure Blob Storage over plain REST (fetch), for "npm run deploy". No Azure SDK.
// Auth is a container SAS token from .env. The token is never printed: errors name the
// operation, the blob and Azure's error code only.

export const API_VERSION = '2023-11-03';

/**
 * Settings from the environment (.env). Throws a message that says which value to fill in.
 * dryRun: only the local export and build happen, so Azure settings may still be placeholders.
 */
export function readSettings(env = process.env, { dryRun = false } = {}) {
  const value = (key) => {
    const v = (env[key] ?? '').trim();
    return v === '' || /^<.*>$/.test(v) || v.includes('<') ? null : v;
  };
  const account = value('AZURE_STORAGE_ACCOUNT');
  const container = value('AZURE_STORAGE_CONTAINER') ?? '$web';
  const sas = value('AZURE_STORAGE_SAS')?.replace(/^\?/, '') ?? null;
  const siteUrl = value('SITE_URL');
  if (!dryRun) {
    const missing = [];
    if (!account) missing.push('AZURE_STORAGE_ACCOUNT');
    if (!sas) missing.push('AZURE_STORAGE_SAS');
    if (missing.length) throw new Error(`Fill in ${missing.join(' and ')} in .env (see the comments there).`);
    if (!/^[a-z0-9]{3,24}$/.test(account)) {
      throw new Error('AZURE_STORAGE_ACCOUNT should be the account name only: 3–24 lowercase letters and digits, not a URL.');
    }
    if (!/(^|&)sig=/.test(sas)) throw new Error('AZURE_STORAGE_SAS does not look like a SAS token (it has no sig=).');
    const expiry = /(?:^|&)se=([^&]+)/.exec(sas)?.[1];
    if (expiry && Date.parse(decodeURIComponent(expiry)) < Date.now()) {
      throw new Error(`The SAS token expired on ${decodeURIComponent(expiry)}. Create a new one and put it in .env.`);
    }
  }
  return { account, container, sas, siteUrl };
}

/** https://<account>.blob.core.windows.net/<container>/<name>?<sas>, each path segment encoded. */
export function blobUrl({ account, container, sas }, name = '', query = '') {
  const path = name ? `/${name.split('/').map(encodeURIComponent).join('/')}` : '';
  const params = [query, sas].filter(Boolean).join('&');
  return `https://${account}.blob.core.windows.net/${container}${path}${params ? `?${params}` : ''}`;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export function contentType(name) {
  const ext = /\.[^./]+$/.exec(name)?.[0]?.toLowerCase() ?? '';
  return TYPES[ext] ?? 'application/octet-stream';
}

/** Vite's hashed files never change; everything else (index.html, data) must be revalidated. */
export function cacheControl(name) {
  return name.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
}

const decodeXml = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Blob names and the continuation marker from a List Blobs response. */
export function parseBlobList(xml) {
  const names = [...xml.matchAll(/<Blob>[\s\S]*?<Name>([\s\S]*?)<\/Name>/g)].map((m) => decodeXml(m[1]));
  const marker = /<NextMarker>([\s\S]*?)<\/NextMarker>/.exec(xml)?.[1];
  return { names, next: marker ? decodeXml(marker) : null };
}

/** A small client for one container. fetchImpl is injectable for tests. */
export function blobClient(settings, { fetchImpl = globalThis.fetch, retries = 3, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  async function call(method, name, url, headers = {}, body = undefined) {
    for (let attempt = 1; ; attempt++) {
      let res;
      try {
        res = await fetchImpl(url, { method, headers: { 'x-ms-version': API_VERSION, ...headers }, body });
      } catch (err) {
        if (attempt >= retries) throw new Error(`${method} ${name || settings.container}: network error (${err.message}).`);
        await wait(500 * attempt);
        continue;
      }
      if (res.ok || (method === 'DELETE' && res.status === 404)) return res;
      if (res.status >= 500 && attempt < retries) {
        await wait(500 * attempt);
        continue;
      }
      const code = res.headers.get('x-ms-error-code') ?? '';
      const hint =
        res.status === 403
          ? ' Check that the SAS token is for this container, has not expired and allows Read, Add, Create, Write, Delete and List.'
          : res.status === 404 && !name
            ? ` Is static website hosting enabled (it creates the ${settings.container} container)?`
            : '';
      throw new Error(`${method} ${name || settings.container}: ${res.status} ${code}.${hint}`);
    }
  }

  return {
    async list() {
      const names = [];
      let marker = null;
      do {
        const query = `restype=container&comp=list&maxresults=5000${marker ? `&marker=${encodeURIComponent(marker)}` : ''}`;
        const res = await call('GET', '', blobUrl(settings, '', query));
        const page = parseBlobList(await res.text());
        names.push(...page.names);
        marker = page.next;
      } while (marker);
      return names;
    },
    async put(name, data) {
      const type = contentType(name);
      await call(
        'PUT',
        name,
        blobUrl(settings, name),
        {
          'x-ms-blob-type': 'BlockBlob',
          'Content-Type': type,
          'x-ms-blob-content-type': type,
          'x-ms-blob-cache-control': cacheControl(name),
        },
        data,
      );
    },
    async remove(name) {
      await call('DELETE', name, blobUrl(settings, name));
    },
  };
}

/** Run fn over items with at most `limit` in flight. */
export async function eachLimited(items, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}
