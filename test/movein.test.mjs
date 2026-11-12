// Move-in month inference and the move-in chips (web/src/lib/movein.js). Synthetic texts only.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LATER, UNKNOWN, monthLabel, moveInBucket, moveInChips, moveInMonth } from '../web/src/lib/movein.js';

const NOV = '2026-11-10T12:00:00Z'; // fetched in November (Helsinki)
const DEC = '2026-12-05T12:00:00Z';
const month = (text, extra = {}) => moveInMonth({ available_date: null, availability_text: text, detail_fetched_at: NOV, ...extra });

test('the date field wins; a date already past means the fetch month', () => {
  assert.equal(month('heti', { available_date: '2026-12-15' }), '2026-12');
  assert.equal(month(null, { available_date: '2027-01-04' }), '2027-01');
  assert.equal(month(null, { available_date: '2025-08-31' }), '2026-11');
  assert.equal(month(null, { available_date: '2026-10-01' }), '2026-11');
});

test('"heti" in any spelling is the month the listing was fetched', () => {
  for (const t of ['heti vapaa', 'Heti vapaa.', 'HETI', 'Heti.', 'Vapaana heti - 31.7.2026 asti']) assert.equal(month(t), '2026-11', t);
  assert.equal(month('Heti', { detail_fetched_at: DEC }), '2026-12');
  // The search fetch time stands in when there is no detail fetch time.
  assert.equal(month('heti', { detail_fetched_at: null, search_fetched_at: DEC }), '2026-12');
});

test('explicit dates in the text: ISO, Finnish d.m.yyyy, without a year, month names', () => {
  assert.equal(month('2026-12-01'), '2026-12');
  assert.equal(month('Vapaa 01.01.2027'), '2027-01');
  assert.equal(month('1.12.2026.'), '2026-12');
  assert.equal(month('Vapautuu: 30.11.2026'), '2026-11');
  assert.equal(month('01.12.2026 mennessä'), '2026-12');
  assert.equal(month('2026-11-02 tai mahdollisesti aiemmin'), '2026-11');
  assert.equal(month('Vapaana 2.11.2026-31.12.2026'), '2026-11'); // the first date counts
  assert.equal(month('9.11. mennessä'), '2026-11');
  assert.equal(month('Joulukuussa'), '2026-12');
  assert.equal(month('tammikuun alussa'), '2027-01');
  // A month without a year: up to two months back is past (the fetch month), the rest is ahead.
  assert.equal(month('15.1.', { detail_fetched_at: DEC }), '2027-01');
  assert.equal(month('9.11.', { detail_fetched_at: DEC }), '2026-12');
  assert.equal(month('lokakuussa', { detail_fetched_at: DEC }), '2026-12');
});

test('nothing usable means no month', () => {
  for (const t of [null, '', 'Sopimuksen mukaan', 'Ilmoitettu vuokra on alkaen-hinta.', '31.13.2026']) assert.equal(month(t), null, String(t));
});

test('the Helsinki month of the fetch time, not the UTC one', () => {
  // 30.11. 23:30 UTC is already 1.12. in Helsinki.
  assert.equal(month('heti', { detail_fetched_at: '2026-11-30T23:30:00Z' }), '2026-12');
});

test('buckets and chips: months up to the cutoff, then Later and Unknown, with counts', () => {
  const cutoff = '2027-02-01';
  const rows = [
    { availability_text: 'heti' },
    { availability_text: 'heti', removed: true },
    { available_date: '2027-01-04' },
    { available_date: '2027-03-26' },
    { available_date: '2027-02-01' },
    { availability_text: 'sopimuksen mukaan' },
  ].map((l) => ({ available_date: null, detail_fetched_at: NOV, ...l }));
  for (const l of rows) l.move_in = moveInBucket(l, cutoff);
  assert.deepEqual(rows.map((l) => l.move_in), ['2026-11', '2026-11', '2027-01', LATER, LATER, UNKNOWN]);
  const chips = moveInChips(rows, cutoff);
  // December has no listing but keeps its chip, so the row of months has no gaps.
  assert.deepEqual(chips.map((c) => [c.label, c.count]), [['November', 1], ['December', 0], ['January', 1], ['Later', 2], ['Unknown', 1]]);
  assert.equal(chips[2].year, '2027');
  assert.equal(monthLabel('2026-12'), 'December');
});
