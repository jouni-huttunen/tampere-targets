// The UI's pure filter, sort and URL logic (web/src/lib). Synthetic rows only.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  activeFilterCount,
  applyFilters,
  dataBounds,
  defaultFilters,
  fromQuery,
  normalizeRange,
  sortListings,
  toQuery,
} from '../web/src/lib/filters.js';
import { availabilityText, fmtDate, fmtKm, yearBin } from '../web/src/lib/format.js';

const meta = { windowCutoff: '2027-02-01' };
const row = (id, extra) => ({
  card_id: id,
  build_year: 2015,
  rent_eur: 1000,
  size_m2: 50,
  rooms: 2,
  available_date: '2026-12-01',
  move_in: '2026-12',
  zip: '33100',
  is_new: false,
  removed: false,
  dist: { centre: 1, station: 1 },
  ...extra,
});
const rows = [
  row(1, { build_year: 1960, rent_eur: 700 }),
  row(2, { build_year: 2024, size_m2: 80, dist: { centre: 0.4, station: 2 } }),
  row(3, { build_year: null, available_date: null, move_in: 'unknown' }),
  row(4, { available_date: '2027-03-01', move_in: 'later', is_new: true }),
  row(5, { removed: true }),
  row(6, { zip: '33200', rooms: 4 }),
];
const ids = (list) => list.map((l) => l.card_id);

test('defaults: Later is off, unknown move-in and unknown years stay in, removed hidden', () => {
  const d = defaultFilters(meta);
  assert.deepEqual(d.moveOff, ['later']);
  assert.deepEqual(ids(applyFilters(rows, d)), [1, 2, 3, 6]);
});

test('build year: an untouched range keeps unknown years; any limit drops them and honours both ends', () => {
  const d = defaultFilters(meta);
  assert.deepEqual(ids(applyFilters(rows, { ...d, year: [2010, 2026] })), [2, 6]);
  assert.deepEqual(ids(applyFilters(rows, { ...d, year: [null, 2000] })), [1]);
  assert.deepEqual(ids(applyFilters(rows, { ...d, year: [2016, null] })), [2]);
});

test('every range filter honours both min and max', () => {
  const d = defaultFilters(meta);
  assert.deepEqual(ids(applyFilters(rows, { ...d, rent: [800, 1000] })), [2, 3, 6]);
  assert.deepEqual(ids(applyFilters(rows, { ...d, size: [60, 90] })), [2]);
  assert.deepEqual(ids(applyFilters(rows, { ...d, rooms: [3, 5] })), [6]);
});

test('move-in chips: any combination of months, Later and Unknown can be switched off', () => {
  const d = defaultFilters(meta);
  assert.deepEqual(ids(applyFilters(rows, { ...d, moveOff: ['unknown'] })), [1, 2, 4, 6]);
  assert.deepEqual(ids(applyFilters(rows, { ...d, moveOff: ['2026-12', 'later'] })), [3]);
  assert.deepEqual(ids(applyFilters(rows, { ...d, moveOff: [] })), [1, 2, 3, 4, 6]);
});

test('postal codes, only new and hide removed', () => {
  const d = defaultFilters(meta);
  assert.deepEqual(ids(applyFilters(rows, { ...d, zips: ['33200'] })), [6]);
  assert.deepEqual(ids(applyFilters(rows, { ...d, moveOff: [], onlyNew: true })), [4]);
  assert.deepEqual(ids(applyFilters(rows, { ...d, hideRemoved: false })), [1, 2, 3, 5, 6]);
});

test('sorting: newest build year first with unknown years last; distances nearest first', () => {
  assert.deepEqual(ids(sortListings(rows, 'year')), [2, 4, 5, 6, 1, 3]);
  assert.deepEqual(ids(sortListings(rows, 'centre')).slice(0, 1), [2]);
  assert.deepEqual(ids(sortListings(rows, 'rent')).slice(0, 1), [1]);
});

test('URL round trip writes only what differs from the defaults', () => {
  const d = defaultFilters(meta);
  assert.equal(toQuery(d, d), '');
  const f = { ...d, year: [2010, null], moveOff: ['2026-11', 'unknown'], zips: ['33100', '33200'], onlyNew: true, sort: 'size' };
  const q = toQuery(f, d);
  assert.equal(q, 'year=2010..&moveoff=2026-11%2Cunknown&zip=33100%2C33200&new=1&sort=size');
  assert.deepEqual(fromQuery(q, d), f);
  assert.equal(activeFilterCount(f, d), 4);
  const allOn = { ...d, moveOff: [] };
  assert.equal(toQuery(allOn, d), 'moveoff=');
  assert.deepEqual(fromQuery('moveoff=', d).moveOff, []);
});

test('bad URL values are ignored instead of breaking the page', () => {
  const d = defaultFilters(meta);
  const f = fromQuery('year=abc..2020&moveoff=2026-13x,later,soon&zip=99999,33100&sort=nope', d, ['33100']);
  assert.deepEqual(f.year, d.year);
  assert.deepEqual(f.moveOff, ['later']);
  assert.deepEqual(f.zips, ['33100']);
  assert.equal(f.sort, 'year');
});

test('normalizeRange snaps ends at the data bounds to "no limit" and orders the ends', () => {
  assert.deepEqual(normalizeRange([1905, 2026], [1905, 2026]), [null, null]);
  assert.deepEqual(normalizeRange([2020, 2010], [1905, 2026]), [2010, 2020]);
  assert.deepEqual(dataBounds(rows).year, [1960, 2024]);
});

test('formatting helpers', () => {
  assert.equal(fmtDate('2026-12-01'), '1.12.2026');
  assert.equal(fmtKm(1.234, true), '≈ 1.2 km');
  assert.equal(availabilityText({ available_date: null, availability_text: 'heti' }), 'heti');
  assert.equal(availabilityText({ available_date: null, availability_text: null }), 'no date');
  assert.equal(yearBin(null), 0);
  assert.equal(yearBin(1905), 1);
  assert.equal(yearBin(2026), 5);
});
