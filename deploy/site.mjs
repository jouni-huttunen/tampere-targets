// Builds the hosted copy: the web app in static-data mode plus the API answers as JSON files.
// The JSON comes from the local server's own routes (Fastify inject), so the hosted copy shows
// exactly what "npm run ui" shows.
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildApp } from '../server/app.mjs';

const ROBOTS = 'User-agent: *\nDisallow: /\n';

async function getOk(app, url) {
  const res = await app.inject({ method: 'GET', url });
  if (res.statusCode !== 200) throw new Error(`Export of ${url} failed: ${res.statusCode} ${res.body.slice(0, 200)}`);
  return res.body;
}

/**
 * Writes api/meta.json, api/listings.json and api/listings/<id>.json (every listing, removed
 * ones too, as the list route returns them) plus robots.txt into outDir. Returns the counts.
 */
export async function exportData({ db, config, outDir }) {
  const app = buildApp({ db, config, noPhotos: false });
  try {
    const api = path.join(outDir, 'api');
    mkdirSync(path.join(api, 'listings'), { recursive: true });
    writeFileSync(path.join(api, 'meta.json'), await getOk(app, '/api/meta'));
    const listBody = await getOk(app, '/api/listings');
    writeFileSync(path.join(api, 'listings.json'), listBody);
    const ids = JSON.parse(listBody).map((l) => l.card_id);
    for (const id of ids) {
      writeFileSync(path.join(api, 'listings', `${id}.json`), await getOk(app, `/api/listings/${id}`));
    }
    writeFileSync(path.join(outDir, 'robots.txt'), ROBOTS);
    return { listings: ids.length };
  } finally {
    await app.close();
  }
}

/** Builds web/ with VITE_STATIC_DATA=1 into outDir (emptied first). */
export async function buildWeb({ root, outDir }) {
  const { build } = await import('vite');
  await build({
    configFile: path.join(root, 'web', 'vite.config.mjs'),
    logLevel: 'warn',
    define: { 'import.meta.env.VITE_STATIC_DATA': JSON.stringify('1') },
    build: { outDir, emptyOutDir: true },
  });
}

/** Every file under dir as a blob name ("assets/index-abc.js") with its size. */
export function listFiles(dir, prefix = '') {
  const out = [];
  for (const entry of readdirSync(path.join(dir, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(dir, rel));
    else out.push({ name: rel, size: statSync(path.join(dir, rel)).size });
  }
  return out;
}

/**
 * Upload order, so a visitor never gets a page that points at files not there yet: hashed assets
 * first, then the data and other files, index.html last.
 */
export function uploadOrder(names) {
  const rank = (n) => (n.startsWith('assets/') ? 0 : n === 'index.html' ? 2 : 1);
  return names.slice().sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Blobs in the container that the new build no longer has (old assets, withdrawn exports). */
export function staleBlobs(existing, current) {
  const keep = new Set(current);
  return existing.filter((n) => !keep.has(n)).sort();
}
