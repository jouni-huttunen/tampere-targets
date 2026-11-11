import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readState } from '../src/capture/build.mjs';
import { counts, getListing } from '../src/db.mjs';
import { importCapture } from '../src/import.mjs';
import { rebuild } from '../src/rebuild.mjs';
import { renderReport } from '../src/report.mjs';
import { makeCapture, makeCard, makeDetail, memoryDb, testConfig } from './helpers.mjs';

const config = testConfig();
const ids = (db, sql) => db.prepare(sql).all().map((r) => r.card_id);
const T1 = '2026-11-11T08:00:00.000Z';
const T2 = '2026-11-12T09:00:00.000Z';
const T3 = '2026-11-13T09:00:00.000Z';

/** Database with an initial full crawl of listings 1..3, all with details. */
function seeded() {
  const db = memoryDb(config);
  const cards = [makeCard(1), makeCard(2), makeCard(3)];
  const details = { 1: makeDetail(1), 2: makeDetail(2), 3: makeDetail(3) };
  const summary = importCapture(db, makeCapture({ startedAt: T1, cards, details }), config);
  return { db, cards, details, summary };
}

test('initial crawl stores everything and flags nothing as new', () => {
  const { db, summary } = seeded();
  assert.equal(summary.isInitial, true);
  assert.equal(summary.status, 'ok');
  assert.equal(summary.new, 3);
  const c = counts(db);
  assert.deepEqual([c.total, c.active, c.window, c.isNew, c.removed, c.withDetail], [3, 3, 3, 0, 0, 3]);
  const row = getListing(db, 2);
  assert.equal(row.rent_eur, 1170);
  assert.equal(row.available_date, '2026-12-01');
  assert.equal(row.first_seen_at, T1);
  assert.deepEqual(JSON.parse(row.search_json), makeCard(2));
  assert.deepEqual(JSON.parse(row.detail_json), makeDetail(2));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM listing_versions').get().n, 3);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM listing_changes').get().n, 0);
});

test('a later crawl flags exactly its additions as new', () => {
  const { db, cards } = seeded();
  const summary = importCapture(
    db,
    makeCapture({ startedAt: T2, cards: [...cards, makeCard(4), makeCard(5)], details: { 4: makeDetail(4), 5: makeDetail(5) } }),
    config,
  );
  assert.equal(summary.isInitial, false);
  assert.equal(summary.new, 2);
  assert.deepEqual(ids(db, 'SELECT card_id FROM v_new ORDER BY card_id'), [4, 5]);
  // The next crawl adds nothing: nothing is new any more.
  importCapture(db, makeCapture({ startedAt: T3, cards: [...cards, makeCard(4), makeCard(5)] }), config);
  assert.deepEqual(ids(db, 'SELECT card_id FROM v_new'), []);
});

test('importing the same capture twice changes nothing', () => {
  const { db, cards } = seeded();
  const capture = makeCapture({ startedAt: T2, cards: [...cards, makeCard(4)] });
  importCapture(db, capture, config);
  const before = JSON.stringify(db.prepare('SELECT * FROM listings ORDER BY card_id').all());
  const again = importCapture(db, capture, config);
  assert.equal(again.skipped, true);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM runs').get().n, 2);
  assert.equal(JSON.stringify(db.prepare('SELECT * FROM listings ORDER BY card_id').all()), before);
});

test('a complete full sweep marks missing listings removed', () => {
  const { db, cards } = seeded();
  const summary = importCapture(db, makeCapture({ startedAt: T2, cards: [cards[0], cards[1]] }), config);
  assert.equal(summary.removed, 1);
  assert.equal(getListing(db, 3).removed_at, T2);
  assert.deepEqual(ids(db, 'SELECT card_id FROM v_active ORDER BY card_id'), [1, 2]);
  const change = db.prepare("SELECT * FROM listing_changes WHERE field = 'removed'").get();
  assert.deepEqual([change.card_id, change.old, change.new], [3, null, T2]);
});

test('an incomplete sweep removes nothing', () => {
  const { db, cards } = seeded();
  const summary = importCapture(
    db,
    makeCapture({ startedAt: T2, cards: [cards[0]], sweepComplete: false, found: 3, stoppedReason: 'user' }),
    config,
  );
  assert.equal(summary.status, 'incomplete');
  assert.equal(summary.removed, 0);
  assert.equal(counts(db).active, 3);
});

test('an incremental run removes nothing for being absent', () => {
  const { db } = seeded();
  const summary = importCapture(
    db,
    makeCapture({ startedAt: T2, mode: 'incremental', ageFilter: 1, cards: [makeCard(4)], details: { 4: makeDetail(4) } }),
    config,
  );
  assert.equal(summary.removed, 0);
  assert.equal(counts(db).active, 4);
  assert.deepEqual(ids(db, 'SELECT card_id FROM v_new'), [4]);
});

test('a removed listing that comes back is active again', () => {
  const { db, cards } = seeded();
  importCapture(db, makeCapture({ startedAt: T2, cards: [cards[0], cards[1]] }), config);
  const summary = importCapture(db, makeCapture({ startedAt: T3, cards }), config);
  assert.equal(summary.reappeared, 1);
  assert.equal(getListing(db, 3).removed_at, null);
  assert.equal(getListing(db, 3).first_seen_at, T1);
  assert.deepEqual(ids(db, 'SELECT card_id FROM v_new'), [], 'a returning listing is not new');
});

test('a detail 404 marks the listing removed, even in an incremental run', () => {
  const { db } = seeded();
  const summary = importCapture(
    db,
    makeCapture({ startedAt: T2, mode: 'incremental', ageFilter: 1, cards: [], details: { 2: 404 } }),
    config,
  );
  assert.equal(summary.removed, 1);
  assert.equal(getListing(db, 2).removed_at, T2);
});

test('a detail with a non-active status marks the listing removed', () => {
  const { db } = seeded();
  importCapture(
    db,
    makeCapture({ startedAt: T2, mode: 'incremental', ageFilter: 1, cards: [], details: { 2: makeDetail(2, { status: 3 }) } }),
    config,
  );
  const row = getListing(db, 2);
  assert.equal(row.removed_at, T2);
  assert.equal(row.status, 3);
  const fields = db.prepare('SELECT field FROM listing_changes WHERE card_id = 2 ORDER BY field').all().map((r) => r.field);
  assert.deepEqual(fields, ['removed', 'status']);
});

test('safety net: if most details look "inactive", the status field is not trusted', () => {
  const db = memoryDb(config);
  const cards = [1, 2, 3, 4, 5].map((id) => makeCard(id));
  const details = Object.fromEntries(cards.map((c) => [c.cardId, makeDetail(c.cardId, { status: 2 })]));
  const summary = importCapture(db, makeCapture({ startedAt: T1, cards, details }), config);
  assert.equal(summary.removed, 0);
  assert.equal(summary.warnings.length, 1);
  assert.equal(counts(db).active, 5);
});

test('rent and availability changes are versioned and logged', () => {
  const { db, cards } = seeded();
  const changedCard = makeCard(2, { data: { price: '1 100 € / kk' } });
  const changedDetail = makeDetail(2, { adData: { availabilityDate: '2027-01-15', rentTermInfo: 'Määräaikainen 12 kk' }, priceData: { price: 1100 } });
  const summary = importCapture(
    db,
    makeCapture({ startedAt: T2, cards: [cards[0], changedCard, cards[2]], details: { 2: changedDetail } }),
    config,
  );
  assert.equal(summary.changed, 1);
  assert.equal(summary.new, 0);
  const row = getListing(db, 2);
  assert.deepEqual([row.rent_eur, row.available_date, row.lease_text], [1100, '2027-01-15', 'Määräaikainen 12 kk']);
  const changes = db.prepare('SELECT field, old, new FROM listing_changes WHERE card_id = 2 ORDER BY field').all();
  assert.deepEqual(
    changes.map((c) => [c.field, c.old, c.new]),
    [
      ['available_date', '2026-12-01', '2027-01-15'],
      ['lease_text', 'Toistaiseksi voimassa oleva', 'Määräaikainen 12 kk'],
      ['rent_eur', '1170', '1100'],
    ],
  );
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM listing_versions WHERE card_id = 2').get().n, 2);
  const report = renderReport(db, summary.runId);
  assert.match(report, /## Changes \(3\)/);
  assert.match(report, /rent_eur \| 1170 \| 1100/);
});

test('an unchanged detail only updates its fetch time', () => {
  const { db, cards, details } = seeded();
  const summary = importCapture(db, makeCapture({ startedAt: T2, cards, details: { 1: details[1] } }), config);
  assert.equal(summary.changed, 0);
  assert.equal(getListing(db, 1).detail_fetched_at, T2);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM listing_versions WHERE card_id = 1').get().n, 1);
});

test('visit counters alone do not count as a change', () => {
  const { db } = seeded();
  const cards = [1, 2, 3].map((id) => makeCard(id, { data: { visits: 5000 } }));
  const summary = importCapture(db, makeCapture({ startedAt: T2, cards }), config);
  assert.equal(summary.changed, 0);
});

test('window view: no date is in, a late date is out', () => {
  const db = memoryDb(config);
  const cards = [1, 2, 3, 4].map((id) => makeCard(id));
  const details = {
    1: makeDetail(1, { adData: { availabilityDate: '2027-01-31' } }),
    2: makeDetail(2, { adData: { availabilityDate: '2027-02-01' } }),
    3: makeDetail(3, { adData: { availabilityDate: null } }),
    // 4 has no detail yet
  };
  const summary = importCapture(db, makeCapture({ startedAt: T1, cards, details, detailsDue: 4 }), config);
  assert.equal(summary.status, 'partial');
  assert.deepEqual(ids(db, 'SELECT card_id FROM v_window ORDER BY card_id'), [1, 3, 4]);
});

test('a first crawl stopped during the search does not make the rest "new" next time', () => {
  const db = memoryDb(config);
  const all = [1, 2, 3, 4].map((id) => makeCard(id));
  const first = importCapture(
    db,
    makeCapture({ startedAt: T1, cards: all.slice(0, 2), sweepComplete: false, found: 4, stoppedReason: 'user' }),
    config,
  );
  assert.equal(first.isInitial, true);
  const second = importCapture(db, makeCapture({ startedAt: T2, cards: all }), config);
  assert.equal(second.isInitial, true);
  assert.deepEqual(ids(db, 'SELECT card_id FROM v_new'), []);
  const third = importCapture(db, makeCapture({ startedAt: T3, cards: [...all, makeCard(5)] }), config);
  assert.equal(third.isInitial, false);
  assert.deepEqual(ids(db, 'SELECT card_id FROM v_new'), [5]);
});

test('a bad file leaves the database untouched', () => {
  const { db, cards } = seeded();
  const before = JSON.stringify(db.prepare('SELECT * FROM listings ORDER BY card_id').all());
  assert.throws(() => importCapture(db, { format: 'something-else' }, config), /Not a valid capture file/);
  // A capture that breaks half-way (after listing 9 was inserted, the detail cannot be
  // serialised) must roll back fully.
  const broken = makeCapture({ startedAt: T2, cards: [makeCard(9), ...cards] });
  broken.details = { 1: { fetchedAt: T2, status: 200, json: { status: 1, adData: 'x', address: 5, cardId: 1n } } };
  assert.throws(() => importCapture(db, broken, config));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM runs').get().n, 1);
  assert.equal(JSON.stringify(db.prepare('SELECT * FROM listings ORDER BY card_id').all()), before);
});

test('readState gives the capture script what it needs', () => {
  const { db, cards } = seeded();
  importCapture(
    db,
    makeCapture({ startedAt: T2, mode: 'incremental', ageFilter: 1, cards: [makeCard(4)], details: {}, detailsDue: 1 }),
    config,
  );
  importCapture(db, makeCapture({ startedAt: T3, cards: [cards[0]], sweepComplete: false, found: 9, stoppedReason: 'http-429' }), config);
  const state = readState(db, { now: new Date(T3) });
  assert.equal(state.lastRunStartedAt, T2, 'the incomplete run does not count');
  assert.equal(state.lastFullSweepAt, T1);
  assert.deepEqual(Object.keys(state.known).sort(), ['1', '2', '3', '4']);
  assert.deepEqual(state.known[4].slice(1), [null, 1]);
  assert.match(state.known[1][0], /^[0-9a-f]{8}$/);
  assert.equal(state.known[1][1], T1);
});

test('rebuild recomputes columns from stored JSON and adds new places offline', () => {
  const { db } = seeded();
  db.prepare('UPDATE listings SET rent_eur = NULL, available_date = NULL, dist_centre_km = 99').run();
  assert.equal(rebuild(db, config), 3);
  const row = getListing(db, 1);
  assert.deepEqual([row.rent_eur, row.available_date, row.dist_centre_km], [1170, '2026-12-01', 0]);
  assert.equal(counts(db).active, 3);
});
