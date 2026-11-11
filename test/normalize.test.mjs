import assert from 'node:assert/strict';
import { test } from 'node:test';
import { haversineKm, normalize, parseNumberFi } from '../src/normalize.mjs';
import { helsinkiDate, helsinkiDateTime, toUtcIso } from '../src/time.mjs';
import { makeCard, makeDetail, testConfig } from './helpers.mjs';

const config = testConfig();

test('parseNumberFi reads Finnish prices and sizes', () => {
  assert.equal(parseNumberFi('1 170 € / kk'), 1170);
  assert.equal(parseNumberFi('1 170 € / kk'), 1170);
  assert.equal(parseNumberFi('1 170,50 €'), 1170.5);
  assert.equal(parseNumberFi('42 m²'), 42);
  assert.equal(parseNumberFi('42,5 m²'), 42.5);
  assert.equal(parseNumberFi('42.5'), 42.5);
  assert.equal(parseNumberFi(980), 980);
  assert.equal(parseNumberFi('sopimuksen mukaan'), null);
  assert.equal(parseNumberFi(null), null);
});

test('timestamps: search cards are UTC', () => {
  assert.equal(toUtcIso('2026-11-01T10:00:00Z', 'utc'), '2026-11-01T10:00:00.000Z');
  assert.equal(toUtcIso('2026-11-01 10:00:00', 'utc'), '2026-11-01T10:00:00.000Z');
  assert.equal(toUtcIso('2026-11-01T12:00:00+02:00', 'utc'), '2026-11-01T10:00:00.000Z');
  assert.equal(toUtcIso(1793527200, 'utc'), '2026-11-01T10:00:00.000Z');
  assert.equal(toUtcIso(1793527200000, 'utc'), '2026-11-01T10:00:00.000Z');
});

test('timestamps: detail times are Helsinki local, in winter and in summer', () => {
  assert.equal(toUtcIso('2026-11-01 12:00:00', 'helsinki'), '2026-11-01T10:00:00.000Z'); // UTC+2
  assert.equal(toUtcIso('2026-07-01 12:00:00', 'helsinki'), '2026-07-01T09:00:00.000Z'); // UTC+3
  assert.equal(toUtcIso('2026-07-01T12:00:00', 'helsinki'), '2026-07-01T09:00:00.000Z');
  // Around the autumn change (25 Oct 2026, 04:00 summer time -> 03:00 winter time)
  assert.equal(toUtcIso('2026-10-25 02:30:00', 'helsinki'), '2026-10-24T23:30:00.000Z');
  assert.equal(toUtcIso('2026-10-25 05:00:00', 'helsinki'), '2026-10-25T03:00:00.000Z');
});

test('timestamps: unknown formats give null instead of a guess', () => {
  assert.equal(toUtcIso('eilen', 'utc'), null);
  assert.equal(toUtcIso('1.12.2026', 'helsinki'), null);
  assert.equal(toUtcIso('', 'utc'), null);
  assert.equal(toUtcIso(null, 'utc'), null);
  assert.equal(toUtcIso({}, 'utc'), null);
});

test('Helsinki display helpers', () => {
  assert.equal(helsinkiDate('2026-11-10T22:30:00.000Z'), '2026-11-11');
  assert.equal(helsinkiDateTime('2026-11-11T08:15:00.000Z'), '2026-11-11 10:15');
});

test('normalize picks the documented fields', () => {
  const row = normalize(makeCard(7), makeDetail(7), config);
  assert.equal(row.url, 'https://asunnot.oikotie.fi/vuokra-asunnot/tampere/7');
  assert.equal(row.rent_eur, 1170);
  assert.equal(row.size_m2, 42);
  assert.equal(row.rooms, 2);
  assert.equal(row.room_config, '2h+kk');
  assert.equal(row.build_year, 2015);
  assert.equal(row.address, 'Testikatu 7');
  assert.equal(row.district, 'Kaleva');
  assert.equal(row.zip, '33100');
  assert.equal(row.published_at, '2026-11-01T10:00:00.000Z');
  assert.equal(row.published_sort_at, '2026-11-05T10:00:00.000Z');
  assert.equal(row.available_date, '2026-12-01');
  assert.equal(row.availability_text, 'Vapautuu 1.12.2026');
  assert.equal(row.lease_text, 'Toistaiseksi voimassa oleva');
  assert.equal(row.deposit_eur, 2340);
  assert.equal(row.water_fee, '20 €/hlö/kk');
  assert.equal(row.electric_fee, null);
  assert.equal(row.pets_allowed, 'true');
  assert.equal(row.furnished, 'false');
  assert.equal(row.floor, 3);
  assert.equal(row.floor_count, 5);
  assert.equal(row.building_type, 1);
  assert.equal(row.status, 1);
  assert.equal(row.company_name, 'Synthetic Oy');
});

test('normalize: a card without a detail leaves detail fields empty', () => {
  const row = normalize(makeCard(7), null, config);
  assert.equal(row.rent_eur, 1170);
  assert.equal(row.available_date, null);
  assert.equal(row.lease_text, null);
  assert.equal(row.status, 1);
});

test('normalize: missing availabilityDate stays NULL', () => {
  const row = normalize(makeCard(7), makeDetail(7, { adData: { availabilityDate: null } }), config);
  assert.equal(row.available_date, null);
});

test('normalize: the card wins over the detail, the detail fills gaps', () => {
  const card = makeCard(7, { data: { price: '1 250 € / kk', buildYear: null }, location: { latitude: null, longitude: null } });
  const detail = makeDetail(7, { priceData: { price: 1170 }, adData: { buildingOverrideBuildYear: 1999 } });
  const row = normalize(card, detail, config);
  assert.equal(row.rent_eur, 1250);
  assert.equal(row.build_year, 1999);
  assert.equal(row.lat, 61.4978);
});

test('normalize: a detail alone still gives a usable row', () => {
  const row = normalize(null, makeDetail(7), config);
  assert.equal(row.rent_eur, 1170);
  assert.equal(row.zip, '33100');
  assert.equal(row.district, 'Kaleva');
  assert.equal(row.published_at, '2026-11-01T10:00:00.000Z');
});

test('distances: zero at Keskustori, about 0.67 km to the station', () => {
  const row = normalize(makeCard(7), null, config);
  assert.equal(row.dist_centre_km, 0);
  assert.ok(Math.abs(row.dist_station_km - 0.676) < 0.01, `got ${row.dist_station_km}`);
  assert.ok(Math.abs(haversineKm(60.1699, 24.9384, 61.4978, 23.761) - 160.5) < 1.5); // Helsinki -> Tampere
});

test('coordinates: the Kuhmo placeholder is dropped, the detail point is used instead', () => {
  const card = makeCard(7, { location: { latitude: 64.5498, longitude: 29.5323 } });
  assert.deepEqual([normalize(card, null, config).lat, normalize(card, null, config).dist_centre_km], [null, null]);
  const detail = makeDetail(7, { coordinates: { latitude: 61.4848689, longitude: 23.7582098 } });
  const row = normalize(card, detail, config);
  assert.deepEqual([row.lat, row.lon], [61.4848689, 23.7582098]);
  assert.ok(row.dist_centre_km < 2);
});

test('coordinates: no real point falls back to the postal-code centre, flagged approximate', () => {
  const placeholder = { location: { latitude: 64.5498, longitude: 29.5323 } };
  const withCentres = testConfig({
    areas: [
      { zip: '33100', id: 154182, lat: 61.491623, lon: 23.783517 },
      { zip: '33200', id: 154198 },
    ],
  });
  const fromConfig = normalize(makeCard(7, placeholder), null, withCentres);
  assert.deepEqual([fromConfig.lat, fromConfig.lon, fromConfig.location_approx], [61.491623, 23.783517, 1]);
  assert.ok(fromConfig.dist_centre_km > 1 && fromConfig.dist_centre_km < 2);

  // No centre in the config: the detail's postal-code point is used.
  const detail = makeDetail(7, {
    coordinates: { latitude: 64.5498, longitude: 29.5323 },
    address: { zipCode: { coordinates: { latitude: 61.4917, longitude: 23.7835 } } },
  });
  const fromDetail = normalize(makeCard(7, placeholder), detail, config);
  assert.deepEqual([fromDetail.lat, fromDetail.location_approx], [61.4917, 1]);

  // A real point is never approximate.
  assert.equal(normalize(makeCard(7), null, withCentres).location_approx, 0);
});

test('config: an area needs both lat and lon, or neither', () => {
  assert.throws(() => testConfig({ areas: [{ zip: '33100', id: 1, lat: 61.5 }] }), /both "lat" and "lon"/);
});

test('coordinates: any point over 50 km from the first place is dropped', () => {
  const card = makeCard(7, { location: { latitude: 60.1699, longitude: 24.9384 } }); // Helsinki
  assert.equal(normalize(card, null, config).lat, null);
});

test('water fee falls back to its text', () => {
  const detail = makeDetail(7, { adData: { waterFee: null, waterFeeInfo: 'Vesimaksu: 30.00 €/kk/hlö' } });
  assert.equal(normalize(makeCard(7), detail, config).water_fee, 'Vesimaksu: 30.00 €/kk/hlö');
  assert.equal(normalize(makeCard(7), makeDetail(7, { adData: { waterFee: 18 } }), config).water_fee, '18');
});

test('distances: no coordinates means no distance', () => {
  const card = makeCard(7, { location: { latitude: null, longitude: null } });
  const row = normalize(card, null, config);
  assert.equal(row.dist_centre_km, null);
});
