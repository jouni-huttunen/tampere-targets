// Ground intel for the NV map (FR-43): opening hours, the GTFS stop reader, the store filter and
// the data file. Synthetic fixtures only.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { parseOpeningHours, openState, statusText, weekRows, helsinkiClock, fmtMinute } from '../web/src/lib/hours.js';
import { parseCsv, parseCsvLine, stopsFromGtfsZip, stopsInBox } from '../src/infra/gtfs.mjs';
import { zipEntries, entryText } from '../src/infra/zip.mjs';
import { chainOf, overpassQuery, storeName, storesFromOsm } from '../src/infra/stores.mjs';
import { renderInfra, searchBox, summarise } from '../src/infra.mjs';

const H = (h, m = 0) => h * 60 + m;

test('opening hours: day ranges, day lists, both rule separators, 24/7, no day selector', () => {
  const w = parseOpeningHours('Mo-Fr 07:00-23:00, Sa 08:00-23:00; Su 09:00-22:00');
  assert.deepEqual(w[0], [[H(7), H(23)]]);
  assert.deepEqual(w[4], [[H(7), H(23)]]);
  assert.deepEqual(w[5], [[H(8), H(23)]]);
  assert.deepEqual(w[6], [[H(9), H(22)]]);
  const weekend = parseOpeningHours('Mo-Fr 08:00-23:00; Sa,Su 09:00-23:00');
  assert.deepEqual(weekend[5], [[H(9), H(23)]]);
  assert.deepEqual(weekend[6], [[H(9), H(23)]]);
  assert.deepEqual(parseOpeningHours('Mo-Fr 07:00-22:00, Sa-Su 09:00-22:00')[6], [[H(9), H(22)]]);
  assert.deepEqual(parseOpeningHours('24/7'), Array.from({ length: 7 }, () => [[0, 1440]]));
  assert.deepEqual(parseOpeningHours('06:00-24:00')[3], [[H(6), 1440]]);
  assert.deepEqual(parseOpeningHours('Mo-Su 06:00-24:00')[6], [[H(6), 1440]]);
});

test('opening hours: later rules replace days, off, split times, overnight spans, PH skipped, wrap-round ranges', () => {
  const w = parseOpeningHours('Mo-Su 08:00-20:00; Su off');
  assert.deepEqual(w[5], [[H(8), H(20)]]);
  assert.deepEqual(w[6], []);
  assert.deepEqual(parseOpeningHours('Mo 08:00-12:00,13:00-17:00')[0], [[H(8), H(12)], [H(13), H(17)]]);
  const night = parseOpeningHours('Fr 18:00-02:00');
  assert.deepEqual(night[4], [[H(18), 1440]]);
  assert.deepEqual(night[5], [[0, H(2)]]);
  assert.deepEqual(parseOpeningHours('Mo-Fr 07:00-21:00; PH off')[0], [[H(7), H(21)]]);
  assert.deepEqual(parseOpeningHours('Sa-Mo 10:00-14:00').map((d) => d.length), [1, 0, 0, 0, 0, 1, 1]);
});

test('opening hours: missing or unknown syntax gives null (the raw text is shown instead)', () => {
  for (const bad of [null, '', '   ', 'by appointment', 'Mo-Fr 7-22', 'Dec 24 off', 'Mo-Fr 25:00-26:00', 'sunrise-sunset']) {
    assert.equal(parseOpeningHours(bad), null, String(bad));
  }
});

test('open now: closes today, closes after midnight, opens later today or another day, 24/7, never', () => {
  const w = parseOpeningHours('Mo-Fr 07:00-22:00; Sa 08:00-22:00; Su off');
  assert.deepEqual(openState(w, { day: 0, min: H(12) }), { open: true, until: { day: 0, min: H(22) } });
  assert.equal(statusText(w, { day: 0, min: H(12) }), 'Open · closes 22:00');
  assert.equal(statusText(w, { day: 0, min: H(6, 30) }), 'Closed · opens 07:00');
  assert.equal(statusText(w, { day: 0, min: H(22) }), 'Closed · opens Tu 07:00'); // closing time is closed
  assert.equal(statusText(w, { day: 5, min: H(23) }), 'Closed · opens Mo 07:00'); // over a closed Sunday
  const late = parseOpeningHours('Mo-Sa 06:00-24:00; Su 00:00-02:00, 08:00-23:00');
  assert.equal(statusText(late, { day: 5, min: H(23) }), 'Open · closes Su 02:00');
  assert.equal(statusText(parseOpeningHours('24/7'), { day: 2, min: H(3) }), 'Open 24/7');
  assert.equal(statusText(parseOpeningHours('Mo-Su off'), { day: 2, min: H(3) }), 'Closed');
});

test('week rows group equal days; Helsinki clock follows summer and winter time', () => {
  const rows = weekRows(parseOpeningHours('Mo-Fr 07:00-22:00; Sa 08:00-22:00; Su off'));
  assert.deepEqual(
    rows.map((r) => [r.days, r.hours]),
    [['Mo–Fr', '07:00–22:00'], ['Sa', '08:00–22:00'], ['Su', 'closed']],
  );
  assert.deepEqual(weekRows(parseOpeningHours('24/7')).map((r) => [r.days, r.hours]), [['Mo–Su', '24 h']]);
  assert.equal(fmtMinute(1440), '24:00');
  // 2026-11-12 is a Thursday; Helsinki is UTC+2 in winter, UTC+3 in summer.
  assert.deepEqual(helsinkiClock(new Date('2026-11-12T21:30:00Z')), { day: 3, min: H(23, 30) });
  assert.deepEqual(helsinkiClock(new Date('2026-07-05T21:30:00Z')), { day: 0, min: H(0, 30) }); // Sun 21:30Z = Mon 00:30
});

test('GTFS CSV: quoted fields, doubled quotes, commas inside quotes, empty fields', () => {
  assert.deepEqual(parseCsvLine('"a","b, c","say ""hi""",""'), ['a', 'b, c', 'say "hi"', '']);
  assert.deepEqual(parseCsvLine('x,,"y"'), ['x', '', 'y']);
  assert.deepEqual(parseCsv('﻿id,name\r\n"1","One"\r\n"2","Two"\r\n'), [
    { id: '1', name: 'One' },
    { id: '2', name: 'Two' },
  ]);
});

/** A ZIP archive (deflated) from { name: text }, for the reader tests. */
function makeZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(text, 'utf8'));
    const nameBuf = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(Buffer.byteLength(text), 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(Buffer.byteLength(text), 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const BOX = [23.7, 61.4, 23.9, 61.6];
const GTFS = {
  'routes.txt': 'route_id,route_short_name,route_type\n"T1","1","0"\n"B10","10","3"\n',
  'trips.txt': 'route_id,service_id,trip_id\n"T1","s","t1"\n"B10","s","b1"\n"B10","s","b2"\n',
  'stop_times.txt':
    'trip_id,arrival_time,departure_time,stop_id,stop_sequence\n' +
    '"t1","07:00:00","07:00:00","S1","1"\n"t1","07:02:00","07:02:00","S2","2"\n' +
    '"b1","07:00:00","07:00:00","S2","1"\n"b2","07:00:00","07:00:00","S3","1"\n"b2","07:05:00","07:05:00","FAR","2"\n',
  'stops.txt':
    'stop_id,stop_code,stop_name,stop_lat,stop_lon\n' +
    '"S1","0801","Tram Stop A","61.5","23.8"\n"S2","0802","Shared, B","61.51","23.81"\n' +
    '"S3","1234","Bus Stop","61.52","23.82123456"\n"IDLE","9999","Unserved","61.5","23.8"\n"FAR","5555","Far away","60.1","24.9"\n',
};

test('ZIP reader lists entries and inflates them', () => {
  const zip = makeZip({ 'a.txt': 'hello', 'dir/b.txt': 'äö — ok' });
  const entries = zipEntries(zip);
  assert.deepEqual(entries.map((e) => e.name), ['a.txt', 'dir/b.txt']);
  assert.equal(entryText(zip, entries[1]), 'äö — ok');
  assert.throws(() => zipEntries(Buffer.from('not a zip at all, clearly')), /Not a ZIP/);
});

test('stops from a GTFS archive: tram or bus from the routes, unserved and far stops left out', async () => {
  const stops = await stopsFromGtfsZip(makeZip(GTFS), BOX);
  assert.deepEqual(stops, [
    { code: '0801', name: 'Tram Stop A', lat: 61.5, lon: 23.8, mode: 'tram' },
    { code: '0802', name: 'Shared, B', lat: 61.51, lon: 23.81, mode: 'tram' }, // trams and buses: tram
    { code: '1234', name: 'Bus Stop', lat: 61.52, lon: 23.82123, mode: 'bus' },
  ]);
  await assert.rejects(stopsFromGtfsZip(makeZip({ 'stops.txt': GTFS['stops.txt'] }), BOX), /no routes\.txt/);
  assert.deepEqual(stopsInBox([{ stop_id: 'X', stop_code: '', stop_name: 'No code', stop_lat: '61.5', stop_lon: '23.8' }], new Map([['X', new Set(['3'])]]), BOX)[0].code, 'X');
});

test('stores: only the chosen chains, by brand or by name; names with the branch', () => {
  assert.equal(chainOf({ brand: 'K-Market' }).group, 'kesko');
  assert.equal(chainOf({ brand: 'Prisma' }).tier, 3);
  assert.equal(chainOf({ brand: 'Lidl' }).group, 'lidl');
  assert.equal(chainOf({ name: 'Sale Hervantajärvi' }).chain, 'Sale');
  assert.equal(chainOf({ name: 'K-KoskiHerkku' }).chain, 'K-store');
  for (const other of [{ brand: 'R-kioski' }, { brand: 'Tokmanni' }, { name: 'Asia Market' }, { name: 'K-Rauta Lielahti' }, {}]) {
    assert.equal(chainOf(other), null, JSON.stringify(other));
  }
  assert.equal(storeName({ name: 'K-Market', branch: 'Kissanmaa' }, 'K-Market'), 'K-Market Kissanmaa');
  assert.equal(storeName({ name: 'Prisma', branch: 'Tampere  Lielahti' }, 'Prisma'), 'Prisma Lielahti');
  assert.equal(storeName({ name: 'S-market', branch: 'Hervanta Tampere' }, 'S-market'), 'S-market Hervanta');
  assert.equal(storeName({ name: 'Sale Hervantajärvi' }, 'Sale'), 'Sale Hervantajärvi');
  assert.equal(storeName({ name: 'Lidl' }, 'Lidl'), 'Lidl');
});

test('stores: Alko only as an alcohol shop, and no other alcohol shop', () => {
  assert.deepEqual(chainOf({ shop: 'alcohol', brand: 'Alko', name: 'Alko' }), { chain: 'Alko', group: 'alko', tier: 2 });
  assert.equal(chainOf({ shop: 'alcohol', name: 'Alko Testilä' }).group, 'alko');
  for (const other of [{ shop: 'alcohol', name: 'Viinikellari' }, { shop: 'alcohol', brand: 'K-Market' }, { shop: 'convenience', brand: 'Alko' }, { shop: 'alcohol' }]) {
    assert.equal(chainOf(other), null, JSON.stringify(other));
  }
  assert.equal(storeName({ name: 'Alko', branch: 'Tampere Ratina' }, 'Alko'), 'Alko Ratina');
  assert.equal(storeName({ name: 'Alko', branch: 'Sokos Tampere' }, 'Alko'), 'Alko Sokos');
  assert.match(overpassQuery(BOX), /supermarket\|convenience\|alcohol/);
});

test('stores from Overpass: nodes and ways (centre), outside the box and other shops dropped, sorted', () => {
  const elements = [
    { type: 'node', id: 3, lat: 61.5, lon: 23.8, tags: { shop: 'supermarket', brand: 'Lidl', opening_hours: 'Mo-Sa 08:00-22:00', 'addr:street': 'Testikatu', 'addr:housenumber': '1' } },
    { type: 'way', id: 7, center: { lat: 61.51, lon: 23.81 }, tags: { shop: 'supermarket', brand: 'K-Citymarket', branch: 'Testilä', check_date: '2026-08-01' } },
    { type: 'node', id: 9, lat: 61.5, lon: 23.8, tags: { shop: 'convenience', brand: 'R-kioski' } },
    { type: 'node', id: 11, lat: 60.0, lon: 23.8, tags: { shop: 'convenience', brand: 'Sale' } },
  ];
  assert.deepEqual(storesFromOsm(elements, BOX), [
    { id: 'w7', group: 'kesko', chain: 'K-Citymarket', tier: 3, name: 'K-Citymarket Testilä', addr: null, lat: 61.51, lon: 23.81, hours: null, checked: '2026-08-01' },
    { id: 'n3', group: 'lidl', chain: 'Lidl', tier: 2, name: 'Lidl', addr: 'Testikatu 1', lat: 61.5, lon: 23.8, hours: 'Mo-Sa 08:00-22:00', checked: null },
  ]);
  assert.match(overpassQuery(BOX), /\(61\.40000,23\.70000,61\.60000,23\.90000\)/);
});

test('data file: the search box with its margin, one record per line, summary', () => {
  const areas = { features: [{ geometry: { type: 'Polygon', coordinates: [[[23.7, 61.5], [23.8, 61.5], [23.8, 61.6], [23.7, 61.5]]] } }] };
  const [w, s, e, n] = searchBox(areas, 1);
  assert.ok(Math.abs(s - (61.5 - 1 / 111.32)) < 1e-4 && Math.abs(n - (61.6 + 1 / 111.32)) < 1e-4);
  assert.ok(w < 23.7 - 0.018 && w > 23.7 - 0.02 && e > 23.8 + 0.018);
  const doc = {
    format: 'tampere-targets/infra@1',
    stops: [{ code: '1', name: 'A', lat: 1, lon: 2, mode: 'tram' }, { code: '2', name: 'B', lat: 1, lon: 2, mode: 'bus' }],
    stores: [{ name: 'Lidl', group: 'lidl', chain: 'Lidl', hours: 'whenever' }],
  };
  const text = renderInfra(doc);
  assert.deepEqual(JSON.parse(text), doc);
  assert.equal(text.split('\n').filter((l) => l.includes('"code"')).length, 2);
  const summary = summarise(doc);
  assert.match(summary, /Stops: 2 \(1 tram, 1 bus\)/);
  assert.match(summary, /hours not understood.*Lidl: whenever/);
});
