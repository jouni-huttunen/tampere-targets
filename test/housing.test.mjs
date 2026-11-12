// Housing form (FR-49): financing and housing-type chips, the filter and its URL keys. Synthetic rows only.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { housingTypes } from '../server/app.mjs';
import { activeFilterCount, applyFilters, defaultFilters, fromQuery, toQuery } from '../web/src/lib/filters.js';
import { FREE, SUBSIDISED, financing, hasAnyType, housingCounts } from '../web/src/lib/housing.js';

const row = (id, housing_types, extra) => ({
  card_id: id,
  build_year: 2015,
  rent_eur: 900,
  size_m2: 50,
  rooms: 2,
  move_in: '2026-12',
  zip: '33100',
  is_new: false,
  removed: false,
  dist: {},
  housing_types,
  ...extra,
});
const rows = [
  row(1, [9]),
  row(2, []), // no guess: free-market
  row(3, undefined), // field missing altogether: free-market
  row(4, [3]), // Arava
  row(5, [4, 9]), // free-market shared flat
  row(6, [3, 5]), // Arava senior
  row(7, [8, 9]), // free-market student flat
  row(8, [3], { removed: true }),
];
const ids = (list) => list.map((l) => l.card_id);

test('financing: Arava (3) is subsidised, everything else free-market; never both', () => {
  assert.deepEqual(rows.map(financing), [FREE, FREE, FREE, SUBSIDISED, FREE, SUBSIDISED, FREE, SUBSIDISED]);
  assert.equal(financing(row(9, [5])), FREE); // senior only, not Arava
  assert.equal(financing(row(9, [3, 9])), SUBSIDISED);
  assert.equal(financing(row(9, null)), FREE);
});

test('hasAnyType: any overlap counts, an empty selection never matches', () => {
  assert.equal(hasAnyType(rows[4], [4]), true);
  assert.equal(hasAnyType(rows[4], [8, 2]), false);
  assert.equal(hasAnyType(rows[1], [4]), false);
  assert.equal(hasAnyType(rows[4], []), false);
});

test('counts skip removed listings; the two financing counts add up to the listings shown', () => {
  const c = housingCounts(rows);
  assert.deepEqual(c.financing, { [FREE]: 5, [SUBSIDISED]: 2 });
  assert.deepEqual(c.types, { 2: 0, 4: 1, 5: 1, 6: 0, 7: 0, 8: 1 }); // no Arava chip
});

test('defaults: only free-market shows and no type is hidden', () => {
  const d = defaultFilters();
  assert.deepEqual(d.financeOff, [SUBSIDISED]);
  assert.deepEqual(d.types, []);
  assert.deepEqual(ids(applyFilters(rows, d)), [1, 2, 3, 5, 7]);
});

test('financing chips switch independently; selected types keep only listings that have one of them', () => {
  const d = defaultFilters();
  assert.deepEqual(ids(applyFilters(rows, { ...d, financeOff: [] })), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(ids(applyFilters(rows, { ...d, financeOff: [FREE] })), [4, 6]);
  assert.deepEqual(ids(applyFilters(rows, { ...d, financeOff: [FREE, SUBSIDISED] })), []);
  assert.deepEqual(ids(applyFilters(rows, { ...d, types: [4, 8] })), [5, 7]);
  assert.deepEqual(ids(applyFilters(rows, { ...d, types: [5] })), []); // the senior flat is Arava
  assert.deepEqual(ids(applyFilters(rows, { ...d, financeOff: [], types: [5] })), [6]);
});

test('URL keys: financeoff and type round trip, count as filters, bad values are dropped', () => {
  const d = defaultFilters();
  const f = { ...d, financeOff: [], types: [4, 8] };
  const q = toQuery(f, d);
  assert.equal(q, 'financeoff=&type=4%2C8');
  assert.deepEqual(fromQuery(q, d), f);
  assert.equal(activeFilterCount(f, d), 2);
  assert.equal(activeFilterCount(d, d), 0);
  const bad = fromQuery('financeoff=free,cheap&type=3,9,4,x,4,1', d);
  assert.deepEqual(bad.financeOff, [FREE]);
  assert.deepEqual(bad.types, [4]);
});

test('housingTypes reads aiHabitationRentTypes from the detail JSON', () => {
  const detail = (types) => JSON.stringify({ adData: { habitationRentType: 1, aiHabitationRentTypes: types } });
  assert.deepEqual(housingTypes(detail([9, 4, 4])), [4, 9]);
  assert.deepEqual(housingTypes(detail([])), []);
  assert.deepEqual(housingTypes(JSON.stringify({ adData: {} })), []);
  assert.deepEqual(housingTypes(null), []);
  assert.deepEqual(housingTypes('{not json'), []);
});
