// UI helpers that need no browser: marker spreading and the shortlist store.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyFilters, defaultFilters, fromQuery, rentPerM2, sortListings, toQuery } from '../web/src/lib/filters.js';
import { fmtPerM2 } from '../web/src/lib/format.js';
import { SHORTLIST_KEY, liveShortlist, loadShortlist, parseShortlist, saveShortlist, toggled } from '../web/src/lib/shortlist.js';
import { cleanUrl, purgeStorage } from '../web/src/lib/purge.js';
import { groupByPosition, ringOffsets, ringRadius } from '../web/src/lib/spread.js';
import { sameIds, splitByView, stepIndex } from '../web/src/lib/inview.js';

test('stepIndex wraps round in both directions; nothing to step to with one target or no position', () => {
  assert.equal(stepIndex(0, 1, 3), 1);
  assert.equal(stepIndex(2, 1, 3), 0); // › on the last goes to the first
  assert.equal(stepIndex(0, -1, 3), 2); // ‹ on the first goes to the last
  assert.equal(stepIndex(1, -1, 3), 0);
  assert.equal(stepIndex(0, 1, 2), 1);
  assert.equal(stepIndex(1, 1, 2), 0);
  assert.equal(stepIndex(0, 1, 1), -1);
  assert.equal(stepIndex(-1, 1, 5), -1);
  assert.equal(stepIndex(0, 1, 0), -1);
});

test('splitByView: in-view targets first, both parts keep their order; no split without a report or when all are in view', () => {
  const rows = [1, 2, 3, 4, 5].map((card_id) => ({ card_id }));
  const ids = (r) => r.ordered.map((l) => l.card_id);
  const split = splitByView(rows, new Set([4, 2]));
  assert.deepEqual(ids(split), [2, 4, 1, 3, 5]);
  assert.equal(split.inViewCount, 2);
  const none = splitByView(rows, new Set());
  assert.deepEqual(ids(none), [1, 2, 3, 4, 5]);
  assert.equal(none.inViewCount, 0);
  assert.deepEqual(splitByView(rows, null), { ordered: rows, inViewCount: null });
  assert.deepEqual(splitByView(rows, new Set([1, 2, 3, 4, 5, 9])), { ordered: rows, inViewCount: null });
  assert.deepEqual(splitByView([], new Set([1])), { ordered: [], inViewCount: null });
});

test('sameIds compares id sets', () => {
  assert.ok(sameIds(new Set([1, 2]), new Set([2, 1])));
  assert.ok(!sameIds(new Set([1, 2]), new Set([1, 3])));
  assert.ok(!sameIds(new Set([1]), new Set([1, 2])));
  assert.ok(!sameIds(null, new Set()));
  assert.ok(sameIds(null, null));
});

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

test('live shortlist: stars on listings gone from the data or withdrawn are ignored, not lost', () => {
  const stored = new Set([1, 2, 99]); // 99: not in the data any more
  const active = new Set([1, 3]); // 2: withdrawn (in the data, but not active)
  assert.deepEqual([...liveShortlist(stored, active)], [1]);
  assert.deepEqual([...stored], [1, 2, 99], 'the stored set is left as it was');
  assert.equal(liveShortlist(new Set([1]), active).size, 1);
  const allLive = new Set([1, 3]);
  assert.equal(liveShortlist(allLive, active), allLive, 'nothing dropped: the same set back');
  assert.equal(liveShortlist(stored, null).size, 0, 'no data yet: nothing counts');
});

test('scorched earth: only the app keys go, in both stores; blocked storage never throws', () => {
  const local = keyedStorage({ 'tcb.shortlist.v1': '[1]', 'tcb.theme.v1': 'nv', 'other.app': 'keep' });
  const session = keyedStorage({ 'tcb.boot.v1': '1' });
  assert.equal(purgeStorage([local, session]), 3);
  assert.deepEqual(Object.keys(local.data), ['other.app']);
  assert.deepEqual(Object.keys(session.data), []);
  const blocked = { get length() { throw new Error('blocked'); } };
  assert.equal(purgeStorage([blocked, keyedStorage({ 'tcb.x': '1' })]), 1);
  assert.equal(cleanUrl({ pathname: '/', search: '?listing=5&sort=rent', hash: '#x' }), '/');
  assert.equal(cleanUrl({ pathname: '' }), '/');
});

/** A Web Storage stand-in with key(i) and length, for code that walks the keys. */
function keyedStorage(init) {
  const data = { ...init };
  return {
    data,
    get length() {
      return Object.keys(data).length;
    },
    key: (i) => Object.keys(data)[i] ?? null,
    removeItem: (k) => delete data[k],
  };
}

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

test('history: listing in the address, profile entries count their depth, × goes back to the main view', async () => {
  const { PROFILE, listingFromSearch, profileState, searchWithListing, stepsToMain } = await import('../web/src/lib/history.js');
  assert.equal(listingFromSearch('?year=2010..&listing=24760731'), 24760731);
  for (const bad of ['', '?listing=', '?listing=abc', '?listing=12x', '?listing=1234567890123']) assert.equal(listingFromSearch(bad), null, bad);

  assert.equal(searchWithListing('?year=2010..', 5), '?year=2010..&listing=5');
  assert.equal(searchWithListing('?year=2010..&listing=5', 7), '?year=2010..&listing=7');
  assert.equal(searchWithListing('?year=2010..&listing=5', null), '?year=2010..');
  assert.equal(searchWithListing('?listing=5', null), '');

  const first = profileState(null, 1);
  assert.deepEqual(first, { tcb: PROFILE, id: 1, depth: 1 });
  const second = profileState(first, 2); // ‹ › or another target: one entry deeper
  assert.equal(second.depth, 2);
  assert.equal(profileState({ tcb: 'main' }, 3).depth, 1);
  assert.equal(profileState({ some: 'other app state' }, 3).depth, 1);

  assert.equal(stepsToMain(second), 2);
  assert.equal(stepsToMain(first), 1);
  for (const st of [null, undefined, { tcb: 'main' }, { tcb: PROFILE, depth: 0 }, { tcb: PROFILE, depth: 'x' }]) assert.equal(stepsToMain(st), 0);
});

test('the app version shown on the boot screen comes from package.json, not a literal', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const config = readFileSync('web/vite.config.mjs', 'utf8');
  assert.match(config, /__APP_VERSION__:\s*JSON\.stringify\(version\)/);
  assert.match(config, /package\.json/);
  const boot = readFileSync('web/src/components/BootSequence.jsx', 'utf8');
  assert.match(boot, /v\$\{__APP_VERSION__\}/);
  // The header shows it too, small, next to the title.
  assert.match(readFileSync('web/src/components/Header.jsx', 'utf8'), /v\{__APP_VERSION__\}/);
  // No version literal ("v1.2.3") anywhere in the UI source: it would go stale at the next release.
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
  for (const file of walk('web/src').filter((f) => /\.(jsx?|css)$/.test(f))) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /\bv\d+\.\d+\.\d+\b/, `${file} has a hard-coded version`);
  }
});

test('stepped build-year slider: decade stops, equal steps, upper stop means the year before', async () => {
  const { YEAR_DECADES, moveEnd, nextStop, rangePos, stopPos, stopsWithin } = await import('../web/src/lib/stops.js');
  const steps = stopsWithin(YEAR_DECADES, [1905, 2026]);
  assert.deepEqual(steps, [1905, 1960, 1970, 1980, 1990, 2000, 2010, 2020, 2026]);
  assert.deepEqual(stopsWithin(YEAR_DECADES, [1960, 2020]), [1960, 1970, 1980, 1990, 2000, 2010, 2020]);
  // Every step has the same width, whatever its length in years; a typed year sits inside its step.
  assert.equal(stopPos(1905, steps), 0);
  assert.equal(stopPos(1960, steps), 1);
  assert.equal(stopPos(1995, steps), 4.5);
  assert.equal(stopPos(2026, steps), 8);
  assert.equal(stopPos(1800, steps), 0);
  // The upper handle shows max + 1: 1990–2009 runs from the '90 notch to the '10 notch.
  assert.deepEqual(rangePos([1990, 2009], steps), [4, 6]);
  assert.deepEqual(rangePos([1905, 2026], steps), [0, 8]);
  // Dragging snaps to a stop; the upper end becomes the year before its stop, the ends the bounds.
  assert.deepEqual(moveEnd([1905, 2026], 0, 4.4, steps), [1990, 2026]);
  assert.deepEqual(moveEnd([1990, 2026], 1, 6.2, steps), [1990, 2009]);
  assert.deepEqual(moveEnd([1990, 2009], 1, 8, steps), [1990, 2026]);
  assert.deepEqual(moveEnd([1990, 2009], 0, 0, steps), [1905, 2009]);
  // The handles keep one step apart.
  assert.deepEqual(moveEnd([1990, 2009], 0, 7, steps), [2000, 2009]);
  assert.deepEqual(moveEnd([1990, 2009], 1, 2, steps), [1990, 1999]);
  // Arrow keys go stop to stop, also from a typed year between stops.
  assert.equal(nextStop(4, 1, 8), 5);
  assert.equal(nextStop(4.5, 1, 8), 5);
  assert.equal(nextStop(4.5, -1, 8), 4);
  assert.equal(nextStop(0, -1, 8), 0);
  assert.equal(nextStop(8, 1, 8), 8);
});

test('panels: both shown by default; hidden ones remembered; bad or blocked storage means shown', async () => {
  const { PANELS_KEY, loadPanels, parsePanels, savePanels } = await import('../web/src/lib/panels.js');
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
  assert.deepEqual(loadPanels(storage), { params: true, list: true });
  savePanels({ params: false, list: true }, storage);
  assert.equal(data.get(PANELS_KEY), '{"params":false,"list":true}');
  assert.deepEqual(loadPanels(storage), { params: false, list: true });
  savePanels({ params: true, list: false }, storage);
  assert.deepEqual(loadPanels(storage), { params: true, list: false });
  for (const bad of ['not json', 'null', '42', '{"params":"no"}']) assert.deepEqual(parsePanels(bad), { params: true, list: true }, bad);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadPanels(blocked), { params: true, list: true });
  assert.doesNotThrow(() => savePanels({ params: false, list: false }, blocked));
});

test('keys (FR-47, FR-50): F fits, C closes, V or N night vision, R or M base map, H the manual; modifiers do nothing', async () => {
  const { ACTION_TEXT, KEY_ACTIONS, MANUAL_ROWS, capOf, keyAction, manualAction } = await import('../web/src/lib/keys.js');
  const press = (code, key = code.replace(/^Key/, '').toLowerCase(), mods = {}) => keyAction({ code, key, ...mods });
  assert.equal(press('KeyF'), 'fit');
  assert.equal(press('KeyC'), 'close');
  for (const c of ['KeyV', 'KeyN']) assert.equal(press(c), 'nv', c);
  for (const c of ['KeyR', 'KeyM']) assert.equal(press(c), 'basemap', c);
  assert.equal(press('KeyH'), 'manual');
  assert.equal(press('KeyQ'), 'params');
  assert.equal(press('KeyE'), 'list');
  for (const c of ['KeyD', 'KeyS']) assert.equal(press(c), 'next');
  for (const c of ['KeyA', 'KeyW']) assert.equal(press(c), 'prev');
  for (const c of ['KeyX', 'KeyZ', 'Escape']) assert.equal(press(c), null, c); // X is no longer close; Esc is each panel's own
  assert.equal(press('Slash', '?', { shiftKey: true }), null); // ? no longer opens the manual
  // Esc is drawn in the manual, as Esc.
  assert.equal(manualAction('Escape'), 'esc');
  assert.equal(capOf('Escape'), 'Esc');
  for (const mod of ['ctrlKey', 'altKey', 'metaKey']) assert.equal(press('KeyC', 'c', { [mod]: true }), null, mod); // Ctrl+C copies
  // By position: a layout that types another letter there still gets the action.
  assert.equal(press('KeyF', 'u'), 'fit');
  // The manual draws every key that has an action, and each action has its text.
  const drawn = new Set(MANUAL_ROWS.flatMap((r) => r.keys));
  for (const [code, action] of Object.entries(KEY_ACTIONS)) {
    assert.ok(drawn.has(code), `${code} is in the manual`);
    assert.equal(ACTION_TEXT[action]?.length, 2, action);
  }
});
