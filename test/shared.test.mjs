import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardHash, fnv1a32 } from '../src/shared/hash.mjs';
import { detailsDue, planRun } from '../src/shared/plan.mjs';
import { detailUrl, fileStamp, searchUrl } from '../src/shared/search.mjs';
import { flatConfig, makeCard } from './helpers.mjs';

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-11-11T08:00:00Z');
const ago = (ms) => new Date(NOW - ms).toISOString();

test('fnv1a32 matches the published test vectors', () => {
  assert.equal(fnv1a32(''), '811c9dc5');
  assert.equal(fnv1a32('a'), 'e40c292c');
  assert.equal(fnv1a32('foobar'), 'bf9cf968');
});

test('cardHash ignores visit counters', () => {
  const a = makeCard(1);
  const b = makeCard(1, { data: { visits: 999, visitsWeekly: 77 } });
  assert.equal(cardHash(a), cardHash(b));
});

test('cardHash changes with price, bump time, first image and photo count', () => {
  const base = cardHash(makeCard(1));
  assert.notEqual(cardHash(makeCard(1, { data: { price: '1 200 € / kk' } })), base);
  assert.notEqual(cardHash(makeCard(1, { meta: { publishedSort: '2026-11-09T10:00:00Z' } })), base);
  assert.notEqual(cardHash(makeCard(1, { medias: [{ imageLargeJPEG: 'https://img.example/other.jpg' }] })), base);
  assert.notEqual(cardHash(makeCard(1, { medias: [] })), base);
  assert.notEqual(cardHash(makeCard(1, { status: 2 })), base);
});

test('cardHash copes with missing parts', () => {
  assert.match(cardHash({}), /^[0-9a-f]{8}$/);
  assert.match(cardHash(null), /^[0-9a-f]{8}$/);
});

test('planRun: first run, forced run and missing full sweep are full', () => {
  const cfg = flatConfig();
  assert.equal(planRun({ lastRunStartedAt: null, lastFullSweepAt: null }, cfg, NOW).mode, 'full');
  assert.equal(planRun(null, cfg, NOW).mode, 'full');
  assert.equal(planRun({ forceFull: true, lastRunStartedAt: ago(HOUR), lastFullSweepAt: ago(HOUR) }, cfg, NOW).mode, 'full');
  assert.equal(planRun({ lastRunStartedAt: ago(HOUR), lastFullSweepAt: null }, cfg, NOW).mode, 'full');
});

test('planRun: age filter follows the gap plus a 2 h margin', () => {
  const cfg = flatConfig({ fullSweepEveryDays: 30 });
  const plan = (gap) => planRun({ lastRunStartedAt: ago(gap), lastFullSweepAt: ago(gap) }, cfg, NOW);
  assert.deepEqual([plan(20 * HOUR).mode, plan(20 * HOUR).ageFilter], ['incremental', 1]);
  assert.equal(plan(22 * HOUR).ageFilter, 1);
  assert.equal(plan(23 * HOUR).ageFilter, 2);
  assert.equal(plan(30 * HOUR).ageFilter, 2);
  assert.equal(plan(47 * HOUR).ageFilter, 4);
  assert.equal(plan(3 * DAY).ageFilter, 4);
  assert.equal(plan(8 * DAY).mode, 'full');
});

test('planRun: a stale full sweep forces a full run', () => {
  const cfg = flatConfig();
  const fresh = planRun({ lastRunStartedAt: ago(2 * HOUR), lastFullSweepAt: ago(20 * HOUR) }, cfg, NOW);
  assert.deepEqual([fresh.mode, fresh.ageFilter], ['incremental', 1]);
  const stale = planRun({ lastRunStartedAt: ago(2 * HOUR), lastFullSweepAt: ago(25 * HOUR) }, cfg, NOW);
  assert.equal(stale.mode, 'full');
});

test('detailsDue: new, changed, missing and stale listings, in that order', () => {
  const cfg = flatConfig();
  const fresh = ago(HOUR);
  const cards = [makeCard(1), makeCard(2), makeCard(3), makeCard(4), makeCard(5), makeCard(6), makeCard(7)];
  const state = {
    known: {
      // 1 is new (absent)
      2: ['00000000', fresh, 1], // changed card
      3: [cardHash(cards[2]), null, 1], // no detail yet
      4: [cardHash(cards[3]), ago(3 * DAY), 1], // in window, stale after 2 days
      5: [cardHash(cards[4]), ago(15 * DAY), 0], // not in window, stale after 14 days
      6: [cardHash(cards[5]), ago(3 * DAY), 0], // not in window, 3 days is fine
      7: [cardHash(cards[6]), fresh, 1], // fresh
    },
  };
  assert.deepEqual(detailsDue(cards, state, cfg, NOW), [1, 2, 3, 4, 5]);
});

test('detailsDue: known listings are refreshed even when the search did not return them', () => {
  const cfg = flatConfig();
  const state = { known: { 10: ['abc', null, 1], 11: ['abc', ago(20 * DAY), 0], 12: ['abc', ago(HOUR), 1] } };
  assert.deepEqual(detailsDue([], state, cfg, NOW), [10, 11]);
  assert.deepEqual(detailsDue([], state, cfg, NOW, { onlySeen: true }), []);
});

test('detailsDue: no duplicates', () => {
  const cfg = flatConfig();
  const state = { known: { 2: ['00000000', null, 1] } };
  assert.deepEqual(detailsDue([makeCard(2), makeCard(2)], state, cfg, NOW), [2]);
});

test('searchUrl sends only the agreed filters', () => {
  const cfg = flatConfig();
  const url = new URL(searchUrl(cfg, 200, null), 'https://asunnot.oikotie.fi');
  assert.equal(url.pathname, '/api/search');
  assert.deepEqual([...url.searchParams.keys()].sort(), ['cardType', 'limit', 'locations', 'offset', 'price[max]', 'size[min]', 'sortBy']);
  assert.equal(url.searchParams.get('cardType'), '101');
  assert.equal(url.searchParams.get('size[min]'), '40');
  assert.equal(url.searchParams.get('price[max]'), '1400');
  assert.equal(url.searchParams.get('offset'), '200');
  assert.deepEqual(JSON.parse(url.searchParams.get('locations')), [[154182, 5, '33100'], [154198, 5, '33200']]);
  const aged = new URL(searchUrl(cfg, 0, 2), 'https://asunnot.oikotie.fi');
  assert.equal(aged.searchParams.get('published'), '2');
});

test('detailUrl and fileStamp', () => {
  assert.equal(detailUrl(123), '/api/card/123');
  assert.equal(fileStamp(new Date('2026-11-11T08:15:30.123Z')), '20261111T081530Z');
});
