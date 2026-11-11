// Fastify app for the local UI: a read-only JSON API plus the built web app.
// See docs/03-design.md §8.1. Nothing here writes to the database.
import { existsSync } from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { counts, latestRun } from '../src/db.mjs';
import { distanceColumn } from '../src/normalize.mjs';

// Columns never sent by the list route (raw JSON is large and only the detail route needs it).
const HEAVY_COLUMNS = new Set(['search_json', 'detail_json', 'search_hash', 'detail_hash']);

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** '1' / 'true' / 1 → true, '0' / 'false' / 0 → false, anything else → null (unknown). */
export function flag(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().toLowerCase();
  if (s === '1' || s === 'true') return true;
  if (s === '0' || s === 'false') return false;
  return null;
}

/** First search-card photo, small and large JPEG. */
export function thumbUrls(searchJson) {
  const media = parseJson(searchJson)?.medias?.[0];
  return {
    thumb_url: media?.imageSmallJPEG ?? null,
    thumb_large_url: media?.imageLargeJPEG ?? null,
  };
}

/** Detail photos sorted by ordernr. */
export function detailPhotos(detail) {
  const media = Array.isArray(detail?.media) ? detail.media : [];
  return media
    .slice()
    .sort((a, b) => (a?.ordernr ?? 0) - (b?.ordernr ?? 0))
    .map((m) => ({ thumb: m?.url_thumb ?? null, large: m?.url_large ?? null, full: m?.url_full ?? null }))
    .filter((p) => p.thumb || p.large || p.full);
}

/** One row for GET /api/listings: extracted columns only, plus is_new, distances and thumbnails. */
export function listRow(row, { newIds, places, noPhotos = false }) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (!HEAVY_COLUMNS.has(key)) out[key] = value;
  }
  out.location_approx = row.location_approx === 1;
  out.pets_allowed = flag(row.pets_allowed);
  out.furnished = flag(row.furnished);
  out.is_new = newIds.has(row.card_id);
  out.removed = row.removed_at != null;
  out.dist = {};
  for (const place of places) out.dist[place.key] = row[distanceColumn(place)] ?? null;
  const thumbs = noPhotos ? { thumb_url: null, thumb_large_url: null } : thumbUrls(row.search_json);
  Object.assign(out, thumbs);
  return out;
}

/** GET /api/listings/:id: the list row plus title, description, photos and the raw JSON. */
export function detailRow(row, opts) {
  const search = parseJson(row.search_json);
  const detail = parseJson(row.detail_json);
  const ad = detail?.adData ?? {};
  const photos = detailPhotos(detail);
  return {
    ...listRow(row, opts),
    title: ad.title ?? null,
    description: ad.description ?? search?.data?.description ?? null,
    photo_count: photos.length,
    photos: opts.noPhotos ? [] : photos,
    raw: { search, detail },
  };
}

function newIdSet(db) {
  return new Set(db.prepare('SELECT card_id FROM v_new').all().map((r) => r.card_id));
}

export function metaPayload(db, config, { noPhotos = false } = {}) {
  const run = latestRun(db);
  return {
    lastRun: run
      ? {
          runId: run.run_id,
          startedAt: run.started_at,
          finishedAt: run.finished_at,
          importedAt: run.imported_at,
          mode: run.mode,
          status: run.status,
          isInitial: run.is_initial === 1,
        }
      : null,
    counts: counts(db),
    places: config.places.map(({ key, name, lat, lon }) => ({ key, name, lat, lon })),
    zips: config.areas.map((a) => String(a.zip)),
    windowCutoff: config.windowCutoff,
    noPhotos,
  };
}

/**
 * db:        an open database (read-only in production) or null when there is none yet
 * staticDir: web/dist; when missing, non-API requests get a hint instead of the app
 */
export function buildApp({ db, config, noPhotos = false, staticDir = null, logger = false }) {
  const app = Fastify({ logger });
  const opts = () => ({ newIds: newIdSet(db), places: config.places, noPhotos });

  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    // Map tile servers (OSM policy) expect a Referer; the origin is enough. Oikotie photos and
    // links set no-referrer on the element itself.
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    return payload;
  });

  const needDb = async (req, reply) => {
    if (!db) {
      return reply.code(503).send({
        error: 'no-database',
        message: 'No database yet. Run "npm run capture", capture in your browser, then "npm run import".',
      });
    }
  };

  app.get('/api/meta', { preHandler: needDb }, async () => metaPayload(db, config, { noPhotos }));

  app.get('/api/listings', { preHandler: needDb }, async () => {
    const o = opts();
    return db.prepare('SELECT * FROM listings ORDER BY card_id').all().map((r) => listRow(r, o));
  });

  app.get('/api/listings/:id', { preHandler: needDb }, async (req, reply) => {
    if (!/^\d{1,12}$/.test(req.params.id)) return reply.code(400).send({ error: 'bad-id' });
    const row = db.prepare('SELECT * FROM listings WHERE card_id = ?').get(Number(req.params.id));
    if (!row) return reply.code(404).send({ error: 'not-found' });
    return detailRow(row, opts());
  });

  app.all('/api/*', async (req, reply) => reply.code(404).send({ error: 'not-found' }));

  const hasDist = staticDir && existsSync(path.join(staticDir, 'index.html'));
  if (hasDist) {
    app.register(fastifyStatic, { root: staticDir, index: 'index.html' });
    // Single-page app: unknown non-API GETs get index.html.
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'not-found' });
    });
  } else {
    app.get('/', async (req, reply) =>
      reply.type('text/plain').send('The web app is not built yet. Run "npm run ui" (it builds web/ first).'),
    );
  }

  return app;
}
