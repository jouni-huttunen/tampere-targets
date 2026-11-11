// UI helpers that need no browser: marker spreading and the shortlist store.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyFilters, defaultFilters, fromQuery, rentPerM2, sortListings, toQuery } from '../web/src/lib/filters.js';
import { fmtPerM2 } from '../web/src/lib/format.js';
import { SHORTLIST_KEY, loadShortlist, parseShortlist, saveShortlist, toggled } from '../web/src/lib/shortlist.js';
import { groupByPosition, ringOffsets, ringRadius } from '../web/src/lib/spread.js';

test('groupByPosition groups identical points, sorted by id, and skips rows without a point', () => {
  const groups = groupByPosition([
    { card_id: 3, lat: 61.5, lon: 23.7 },
    { card_id: 1, lat: 61.5, lon: 23.7 },
    { card_id: 2, lat: 61.4, lon: 23.8 },
    { card_id: 4, lat: null, lon: null },
  ]);
  assert.deepEqual([...groups.values()], [[1, 3], [2]]);
});

test('ring layout: no ring for one marker; neighbours on the ring never overlap', () => {
  assert.equal(ringRadius(1), 0);
  assert.deepEqual(ringOffsets(1), [[0, 0]]);
  for (const n of [2, 3, 6, 10, 20]) {
    const pts = ringOffsets(n);
    assert.equal(pts.length, n);
    const minGap = Math.min(...pts.map((p, i) => Math.hypot(p[0] - pts[(i + 1) % n][0], p[1] - pts[(i + 1) % n][1])));
    assert.ok(minGap >= 13, `n=${n}: neighbours ${minGap.toFixed(1)} px apart`);
  }
  assert.deepEqual(ringOffsets(2)[0], [0, -13]); // first one at 12 o'clock
});

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
  };
}

test('shortlist store: round trip, bad data ignored, broken storage tolerated', () => {
  const storage = memoryStorage();
  assert.equal(loadShortlist(storage).size, 0);
  assert.ok(saveShortlist(new Set([5, 2]), storage));
  assert.equal(storage.data[SHORTLIST_KEY], '[2,5]');
  assert.deepEqual([...loadShortlist(storage)], [2, 5]);
  assert.deepEqual([...parseShortlist('not json')], []);
  assert.deepEqual([...parseShortlist('[1,"x",-3,2.5,7]')], [1, 7]);
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(loadShortlist(broken).size, 0);
  assert.equal(saveShortlist(new Set([1]), broken), false);
  assert.equal(loadShortlist(null).size, 0);
  assert.deepEqual([...toggled(new Set([1]), 2)], [1, 2]);
  assert.deepEqual([...toggled(new Set([1, 2]), 1)], [2]);
});

test('rent per m²: value, missing data, sort cheapest first with unknowns last, formatting', () => {
  assert.equal(rentPerM2({ rent_eur: 1000, size_m2: 50 }), 20);
  assert.equal(rentPerM2({ rent_eur: 1000, size_m2: null }), null);
  assert.equal(rentPerM2({ rent_eur: 0, size_m2: 40 }), null);
  const rows = [
    { card_id: 1, rent_eur: 1000, size_m2: 40 }, // 25
    { card_id: 2, rent_eur: 900, size_m2: 60 }, // 15
    { card_id: 3, rent_eur: 800, size_m2: null }, // unknown
    { card_id: 4, rent_eur: 1100, size_m2: 55 }, // 20
  ];
  assert.deepEqual(sortListings(rows, 'perm2').map((r) => r.card_id), [2, 4, 1, 3]);
  assert.equal(fmtPerM2(18.25), '18.3 €/m²');
  assert.equal(fmtPerM2(null), '—');
});

test('"only shortlist" filter and its URL key', () => {
  const d = defaultFilters({ windowCutoff: '2027-02-01' });
  const rows = [1, 2, 3].map((id) => ({ card_id: id, available_date: null, zip: '33100', removed: false }));
  const f = { ...d, onlySaved: true };
  assert.deepEqual(applyFilters(rows, f, new Set([2])).map((r) => r.card_id), [2]);
  assert.deepEqual(applyFilters(rows, f, null), []);
  assert.equal(toQuery(f, d), 'saved=1');
  assert.equal(fromQuery('saved=1', d).onlySaved, true);
});

test('theme: only "nv" switches night vision on; storage failures fall back to RECON', async () => {
  const { THEME_KEY, applyTheme, loadTheme, parseTheme, saveTheme } = await import('../web/src/lib/theme.js');
  assert.equal(parseTheme('nv'), 'nv');
  for (const v of [null, undefined, '', 'NV', 'recon', 'green']) assert.equal(parseTheme(v), 'recon');

  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  assert.equal(loadTheme(storage), 'recon');
  saveTheme('nv', storage);
  assert.equal(data.get(THEME_KEY), 'nv');
  assert.equal(loadTheme(storage), 'nv');
  saveTheme('bogus', storage);
  assert.equal(loadTheme(storage), 'recon');

  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(loadTheme(broken), 'recon');
  assert.doesNotThrow(() => saveTheme('nv', broken));

  const root = { dataset: {} };
  applyTheme('nv', root);
  assert.equal(root.dataset.theme, 'nv');
  applyTheme('recon', root);
  assert.equal('theme' in root.dataset, false);
});

test('median ignores missing values and averages the middle pair', async () => {
  const { median } = await import('../web/src/lib/filters.js');
  assert.equal(median([]), null);
  assert.equal(median([null, undefined]), null);
  assert.equal(median([900, null, 700, 800]), 800);
  assert.equal(median([600, 1000, 700, 800]), 750);
});
