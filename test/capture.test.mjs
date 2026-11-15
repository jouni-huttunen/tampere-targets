// Runs the BUILT capture script (dist text) against a fake page and a fake Oikotie.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCaptureScript, readState } from '../src/capture/build.mjs';
import { counts } from '../src/db.mjs';
import { CAPTURE_FORMAT, importCapture, validateCapture } from '../src/import.mjs';
import { cardHash } from '../src/shared/hash.mjs';
import { emptyState, fakeOikotie, flatConfig, makeCard, makeDetail, memoryDb, runCaptureScript, testConfig } from './helpers.mjs';

function world(n) {
  const cards = [];
  const details = {};
  for (let id = 1; id <= n; id++) {
    cards.push(makeCard(id));
    details[id] = makeDetail(id);
  }
  return { cards, details, freshIds: new Set() };
}

const isPacingTimer = (ms, cfg) => ms >= cfg.delayMs && ms <= cfg.delayMs + cfg.jitterMs;

test('the built script is plain ASCII and one self-contained expression', () => {
  const script = buildCaptureScript({ state: emptyState(), config: flatConfig() });
  assert.doesNotMatch(script, /[^\x09\x0a\x0d\x20-\x7e]/);
  assert.doesNotMatch(script, /^\s*(import|export)\s/m);
  assert.match(script, /^\/\*.*\*\/\n\(function \(\) \{/);
});

test('first run: full sweep, every detail, a valid capture file', async () => {
  const config = flatConfig();
  const w = world(250);
  const api = fakeOikotie(w);
  const { file, downloads, timers } = await runCaptureScript({ state: emptyState(), config, fetch: api.fetch });

  assert.equal(downloads.length, 1);
  assert.match(downloads[0].name, /^oikotie-\d{8}T\d{6}Z\.json$/);
  validateCapture(file);
  assert.equal(file.format, CAPTURE_FORMAT);
  assert.equal(file.mode, 'full');
  assert.equal(file.ageFilter, null);
  assert.equal(file.found, 250);
  assert.equal(file.sweepComplete, true);
  assert.equal(file.stoppedReason, null);
  assert.equal(file.searchCards.length, 250);
  assert.equal(Object.keys(file.details).length, 250);
  assert.deepEqual(file.details[17].json, makeDetail(17));
  assert.deepEqual(file.searchCards[16].card, makeCard(17));

  // 3 search pages (0, 100, 200), then 250 details: 253 requests, all logged.
  assert.equal(api.log.urls.length, 253);
  assert.equal(file.requests.length, 253);
  assert.deepEqual(
    api.log.urls.slice(0, 3).map((u) => new URL(u, 'https://x').searchParams.get('offset')),
    ['0', '100', '200'],
  );
  assert.ok(api.log.urls.slice(3).every((u) => /^\/api\/card\/\d+$/.test(u)));
  assert.ok(file.requests.every((r) => r.status === 200));

  // Auth headers come from the page's meta tags.
  assert.deepEqual({ ...api.log.headers[0] }, { 'OTA-token': 'tok-1', 'OTA-cuid': 'cuid-1', 'OTA-loaded': '1700000000' });

  // Pacing: strictly one at a time, and a full delay before every request but the first.
  assert.equal(api.log.maxInFlight, 1);
  assert.equal(timers.filter((ms) => isPacingTimer(ms, config)).length, 252);
});

test('pacing: there is a delay of at least delayMs between any two requests', async () => {
  const config = flatConfig();
  const api = fakeOikotie(world(5));
  const { events } = await runCaptureScript({ state: emptyState(), config, fetch: api.fetch });
  let waited = Infinity;
  let fetches = 0;
  for (const event of events) {
    if (event === 'fetch') {
      if (fetches > 0) assert.ok(waited >= config.delayMs, `only ${waited} ms before request ${fetches + 1}`);
      fetches++;
      waited = 0;
    } else {
      waited += Number(event.split(':')[1]);
    }
  }
  assert.equal(fetches, 6);
});

test('only the agreed filters are sent', async () => {
  const api = fakeOikotie(world(3));
  await runCaptureScript({ state: emptyState(), config: flatConfig(), fetch: api.fetch });
  const url = new URL(api.log.urls[0], 'https://asunnot.oikotie.fi');
  assert.deepEqual([...url.searchParams.keys()].sort(), ['cardType', 'limit', 'locations', 'offset', 'price[max]', 'size[min]', 'sortBy']);
});

test('it refuses to run on another site', async () => {
  const api = fakeOikotie(world(3));
  const { file, panelText } = await runCaptureScript({ state: emptyState(), config: flatConfig(), fetch: api.fetch, hostname: 'example.com' });
  assert.equal(file, null);
  assert.equal(api.log.urls.length, 0);
  assert.match(panelText, /only runs on asunnot\.oikotie\.fi/);
});

test('it refuses to run without page tokens', async () => {
  const api = fakeOikotie(world(3));
  const { file } = await runCaptureScript({ state: emptyState(), config: flatConfig(), fetch: api.fetch, metas: {} });
  assert.equal(file, null);
  assert.equal(api.log.urls.length, 0);
});

test('HTTP 429 stops the run at once and still saves the file', async () => {
  const api = fakeOikotie(world(20), (url, n) => (n === 8 ? 429 : null));
  const { file } = await runCaptureScript({ state: emptyState(), config: flatConfig(), fetch: api.fetch });
  assert.equal(api.log.urls.length, 8, 'no request after the 429');
  assert.equal(file.stoppedReason, 'http-429');
  assert.equal(file.sweepComplete, true);
  assert.equal(Object.keys(file.details).length, 6);
  assert.equal(file.requests.at(-1).status, 429);
});

test('HTTP 403 on the first request stops before anything else', async () => {
  const api = fakeOikotie(world(20), () => 403);
  const { file } = await runCaptureScript({ state: emptyState(), config: flatConfig(), fetch: api.fetch });
  assert.equal(api.log.urls.length, 1);
  assert.equal(file.stoppedReason, 'http-403');
  assert.equal(file.sweepComplete, false);
  assert.equal(file.searchCards.length, 0);
});

test('captureStop() ends the run and saves a partial file', async () => {
  const api = fakeOikotie(world(20));
  const { file } = await runCaptureScript({
    state: emptyState(),
    config: flatConfig(),
    fetch: api.fetch,
    onTimer: (ms, sandbox, count) => {
      if (count === 6) sandbox.captureStop();
    },
  });
  assert.equal(file.stoppedReason, 'user');
  assert.equal(api.log.urls.length, 6);
  assert.equal(Object.keys(file.details).length, 5);
});

test('a 401 makes it re-read the page tokens and retry once', async () => {
  const metas = { 'api-token': 'tok-1', cuid: 'cuid-1', loaded: '1700000000' };
  const api = fakeOikotie(world(3), (url, n) => {
    if (n === 2) {
      metas['api-token'] = 'tok-2';
      return 401;
    }
    return null;
  });
  const { file } = await runCaptureScript({ state: emptyState(), config: flatConfig(), fetch: api.fetch, metas });
  assert.equal(file.stoppedReason, null);
  assert.equal(Object.keys(file.details).length, 3);
  assert.equal(api.log.headers[2]['OTA-token'], 'tok-2');
});

test('repeated 401s stop the run', async () => {
  const api = fakeOikotie(world(3), (url, n) => (n >= 2 ? 401 : null));
  const { file } = await runCaptureScript({ state: emptyState(), config: flatConfig(), fetch: api.fetch });
  assert.equal(file.stoppedReason, 'auth');
  assert.equal(api.log.urls.length, 3);
});

test('server errors are retried with backoff, then skipped', async () => {
  const w = world(3);
  const api = fakeOikotie(w, (url) => (url === '/api/card/2' ? 500 : null));
  const { file, timers } = await runCaptureScript({ state: emptyState(), config: flatConfig(), fetch: api.fetch });
  assert.equal(file.stoppedReason, null);
  assert.deepEqual(Object.keys(file.details).sort(), ['1', '3']);
  assert.equal(api.log.urls.filter((u) => u === '/api/card/2').length, 4);
  assert.deepEqual(timers.filter((ms) => [5000, 15000, 45000].includes(ms)), [5000, 15000, 45000]);
  assert.equal(file.errors.length, 1);
  assert.equal(file.detailsDue, 3);
});

test('a detail 404 is recorded, not retried', async () => {
  const w = world(3);
  delete w.details[2];
  const api = fakeOikotie(w);
  const { file } = await runCaptureScript({ state: emptyState(), config: flatConfig(), fetch: api.fetch });
  assert.deepEqual(file.details[2], { fetchedAt: file.details[2].fetchedAt, status: 404, json: null });
  assert.equal(api.log.urls.filter((u) => u === '/api/card/2').length, 1);
});

test('--max-details caps the detail requests', async () => {
  const api = fakeOikotie(world(30));
  const { file } = await runCaptureScript({ state: emptyState(), config: flatConfig({ maxDetails: 5 }), fetch: api.fetch });
  assert.equal(Object.keys(file.details).length, 5);
  assert.equal(file.detailsDue, 30);
  assert.equal(file.detailsPlanned, 5);
  assert.equal(file.sweepComplete, true);
  assert.equal(file.stoppedReason, null);
});

test('the browser build computes the same card hash as Node', async () => {
  // Every listing is "known" with the hash Node computes and a fresh detail.
  // If the browser build hashed differently, it would re-fetch all the details.
  const w = world(12);
  const now = new Date().toISOString();
  const known = Object.fromEntries(w.cards.map((c) => [c.cardId, [cardHash(c), now, 1]]));
  w.cards[4] = makeCard(5, { data: { price: '999 € / kk' } }); // one real change
  const api = fakeOikotie(w);
  const { file } = await runCaptureScript({
    state: emptyState({ lastRunStartedAt: null, known }),
    config: flatConfig(),
    fetch: api.fetch,
  });
  assert.deepEqual(Object.keys(file.details), ['5']);
});

test('end to end: trial run, full run, then a cheap update run', async () => {
  const config = testConfig();
  const db = memoryDb(config);
  const w = world(120);

  // 1. Trial: full sweep, 5 details.
  let api = fakeOikotie(w);
  let run = await runCaptureScript({ state: readState(db), config: flatConfig({ maxDetails: 5 }), fetch: api.fetch });
  let summary = importCapture(db, run.file, config);
  assert.deepEqual([summary.status, summary.isInitial, summary.new], ['partial', true, 120]);
  assert.deepEqual([counts(db).active, counts(db).withDetail], [120, 5]);

  // 2. Right after: incremental search, and the 115 missing details.
  w.freshIds = new Set([1, 2]);
  api = fakeOikotie(w);
  run = await runCaptureScript({ state: readState(db), config: flatConfig(), fetch: api.fetch });
  assert.deepEqual([run.file.mode, run.file.ageFilter], ['incremental', 1]);
  assert.equal(api.log.urls.filter((u) => u.startsWith('/api/search')).length, 1);
  assert.equal(Object.keys(run.file.details).length, 115);
  summary = importCapture(db, run.file, config);
  assert.deepEqual([summary.status, summary.new, summary.changed, summary.removed], ['ok', 0, 0, 0]);
  assert.deepEqual([counts(db).active, counts(db).withDetail], [120, 120]);

  // 3. Again right away: one search request, no details, no changes.
  api = fakeOikotie(w);
  run = await runCaptureScript({ state: readState(db), config: flatConfig(), fetch: api.fetch });
  assert.equal(api.log.urls.length, 1);
  summary = importCapture(db, run.file, config);
  assert.deepEqual([summary.new, summary.changed, summary.removed], [0, 0, 0]);

  // 4. Forced full sweep after the site changed: one new, one gone, one cheaper.
  w.cards = w.cards.filter((c) => c.cardId !== 7);
  w.cards[0] = makeCard(1, { data: { price: '990 € / kk' } });
  w.cards.unshift(makeCard(500));
  w.details[500] = makeDetail(500);
  api = fakeOikotie(w);
  run = await runCaptureScript({ state: readState(db, { forceFull: true }), config: flatConfig(), fetch: api.fetch });
  assert.equal(run.file.mode, 'full');
  assert.deepEqual(Object.keys(run.file.details).sort(), ['1', '500']);
  summary = importCapture(db, run.file, config);
  assert.deepEqual([summary.new, summary.changed, summary.removed], [1, 1, 1]);
  assert.equal(db.prepare('SELECT rent_eur FROM listings WHERE card_id = 1').get().rent_eur, 990);
  assert.ok(db.prepare('SELECT removed_at FROM listings WHERE card_id = 7').get().removed_at);
});
