// API row shaping for the local UI (server/app.mjs), against an in-memory database
// filled with SYNTHETIC captures. Uses Fastify's inject: no network, no port.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildApp, detailPhotos, flag } from '../server/app.mjs';
import { serverOptions } from '../server/start.mjs';
import { importCapture } from '../src/import.mjs';
import { makeCapture, makeCard, makeDetail, memoryDb, testConfig } from './helpers.mjs';

const T1 = '2026-11-10T08:00:00.000Z';
const T2 = '2026-11-11T08:00:00.000Z';

function seeded() {
  const config = testConfig();
  const db = memoryDb(config);
  const first = [makeCard(1), makeCard(2), makeCard(3, { data: { buildYear: null } })];
  const details = {
    1: makeDetail(1, {
      adData: { petsAllowed: false, aiHabitationRentTypes: [9, 4] },
      media: [
        { ordernr: 2, url_thumb: 't2', url_large: 'l2', url_full: 'f2' },
        { ordernr: 1, url_thumb: 't1', url_large: 'l1', url_full: 'f1' },
      ],
    }),
    2: makeDetail(2),
    3: makeDetail(3),
  };
  importCapture(db, makeCapture({ startedAt: T1, cards: first, details }), config);
  // Second full sweep: 4 is new, 3 is gone (removed).
  importCapture(
    db,
    makeCapture({ startedAt: T2, cards: [makeCard(1), makeCard(2), makeCard(4)], details: { 4: makeDetail(4) } }),
    config,
  );
  return { db, config };
}

async function get(app, url) {
  const res = await app.inject({ method: 'GET', url });
  return { status: res.statusCode, body: res.json() };
}

test('list route: is_new, removed, thumbnails, distances and no raw JSON', async () => {
  const { db, config } = seeded();
  const app = buildApp({ db, config });
  const { status, body } = await get(app, '/api/listings');
  assert.equal(status, 200);
  assert.deepEqual(body.map((r) => r.card_id), [1, 2, 3, 4]);
  assert.deepEqual(body.filter((r) => r.is_new).map((r) => r.card_id), [4]);
  assert.deepEqual(body.filter((r) => r.removed).map((r) => r.card_id), [3]);
  const one = body[0];
  assert.equal(one.thumb_url, 'https://img.example/1-s.jpg');
  assert.equal(one.thumb_large_url, 'https://img.example/1-l.jpg');
  assert.equal(typeof one.dist.centre, 'number');
  assert.equal(typeof one.dist.station, 'number');
  assert.equal(one.location_approx, false);
  assert.equal(one.pets_allowed, false);
  assert.equal(body[1].pets_allowed, true);
  assert.deepEqual(one.housing_types, [4, 9]);
  assert.deepEqual(body[1].housing_types, []);
  assert.equal(one.photo_count, 2); // known before the details load: the profile reserves its strip
  assert.equal(body[1].photo_count, 0);
  for (const row of body) {
    for (const key of ['search_json', 'detail_json', 'search_hash', 'detail_hash', 'raw']) {
      assert.ok(!(key in row), `list row must not carry ${key}`);
    }
  }
  await app.close();
});

test('detail route: photos sorted by ordernr, no raw JSON, 404 and 400', async () => {
  const { db, config } = seeded();
  const app = buildApp({ db, config });
  const { status, body } = await get(app, '/api/listings/1');
  assert.equal(status, 200);
  assert.deepEqual(body.photos.map((p) => p.large), ['l1', 'l2']);
  assert.equal(body.photo_count, 2);
  for (const key of ['raw', 'search_json', 'detail_json']) assert.ok(!(key in body), `detail has no ${key}`);
  assert.equal(body.lease_text, 'Toistaiseksi voimassa oleva');
  assert.equal(body.description, 'Valoisa kaksio.');
  assert.equal((await get(app, '/api/listings/999')).status, 404);
  assert.equal((await get(app, '/api/listings/abc')).status, 400);
  assert.equal((await get(app, '/api/nope')).status, 404);
  await app.close();
});

test('raw route: the stored search card and detail JSON on request, 404 and 400', async () => {
  const { db, config } = seeded();
  const app = buildApp({ db, config });
  const { status, body } = await get(app, '/api/raw/1');
  assert.equal(status, 200);
  assert.equal(body.card_id, 1);
  assert.equal(body.search.cardId, 1);
  assert.equal(body.detail.cardId, 1);
  assert.equal((await get(app, '/api/raw/999')).status, 404);
  assert.equal((await get(app, '/api/raw/abc')).status, 400);
  await app.close();
});

test('noPhotos hides every photo URL from the list and the detail photo strip', async () => {
  const { db, config } = seeded();
  const app = buildApp({ db, config, noPhotos: true });
  const list = (await get(app, '/api/listings')).body;
  assert.ok(list.every((r) => r.thumb_url === null && r.thumb_large_url === null));
  const detail = (await get(app, '/api/listings/1')).body;
  assert.deepEqual(detail.photos, []);
  assert.equal(detail.photo_count, 2);
  assert.equal((await get(app, '/api/meta')).body.noPhotos, true);
  await app.close();
});

test('meta route: last run, counts, places and cutoff', async () => {
  const { db, config } = seeded();
  const app = buildApp({ db, config });
  const { body } = await get(app, '/api/meta');
  assert.equal(body.lastRun.startedAt, T2);
  assert.equal(body.lastRun.isInitial, false);
  assert.equal(body.counts.active, 3);
  assert.equal(body.counts.isNew, 1);
  assert.equal(body.counts.removed, 1);
  assert.deepEqual(body.places.map((p) => p.key), ['centre', 'station']);
  assert.deepEqual(body.zips, ['33100', '33200']);
  assert.equal(body.windowCutoff, '2027-02-01');
  await app.close();
});

test('without a database the API answers 503 with a hint', async () => {
  const app = buildApp({ db: null, config: testConfig() });
  for (const url of ['/api/meta', '/api/listings', '/api/listings/1']) {
    const { status, body } = await get(app, url);
    assert.equal(status, 503);
    assert.equal(body.error, 'no-database');
  }
  await app.close();
});

test('static files: the built app, single-page fallback, and a hint when not built', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'tcb-web-'));
  try {
    writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Tampere Targets</title>');
    const { db, config } = seeded();
    const app = buildApp({ db, config, staticDir: dir });
    const home = await app.inject({ method: 'GET', url: '/' });
    assert.equal(home.statusCode, 200);
    assert.match(home.body, /Tampere Targets/);
    assert.equal(home.headers['x-content-type-options'], 'nosniff');
    const deep = await app.inject({ method: 'GET', url: '/some/view?year=2010..' });
    assert.equal(deep.statusCode, 200);
    assert.match(deep.body, /Tampere Targets/);
    assert.equal((await app.inject({ method: 'GET', url: '/api/unknown' })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: '/api/listings' })).statusCode, 404, 'no write routes');
    await app.close();
    const bare = buildApp({ db, config, staticDir: path.join(dir, 'missing') });
    const hint = await bare.inject({ method: 'GET', url: '/' });
    assert.match(hint.body, /npm run ui/);
    await bare.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('server options: --no-photos, --port and clear errors for a bad port', () => {
  assert.deepEqual(serverOptions([], {}), { noPhotos: false, port: 3000 });
  assert.deepEqual(serverOptions(['--no-photos', '--port', '3100'], {}), { noPhotos: true, port: 3100 });
  assert.deepEqual(serverOptions([], { TCB_NO_PHOTOS: '1', TCB_PORT: '4000' }), { noPhotos: true, port: 4000 });
  assert.throws(() => serverOptions(['--port'], {}), /Bad port/);
  assert.throws(() => serverOptions(['--port', 'abc'], {}), /Bad port/);
});

test('flag() reads both stored styles and treats anything else as unknown', () => {
  assert.equal(flag('1'), true);
  assert.equal(flag('true'), true);
  assert.equal(flag('0'), false);
  assert.equal(flag('false'), false);
  assert.equal(flag(null), null);
  assert.equal(flag('maybe'), null);
  assert.deepEqual(detailPhotos(null), []);
});
