// npm run infra: refresh the NV map's ground intel (FR-43), tram and bus stops (Nysse GTFS,
// CC BY 4.0) and Kesko / S-ryhmä / Lidl grocery stores (OpenStreetMap, ODbL), into
// web/public/infra.json. Two plain, identified requests (no Oikotie traffic). Run it now and
// then; the file is committed (public open data, nothing personal).
//
//   npm run infra                         download both and write the file
//   npm run infra -- --dry-run            download and summarise, write nothing
//   npm run infra -- --gtfs <zip> --osm <json>   use files already on disk
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { ROOT } from './config.mjs';
import { stopsFromGtfsZip } from './infra/gtfs.mjs';
import { GROUPS, overpassQuery, storesFromOsm } from './infra/stores.mjs';
import { parseOpeningHours } from '../web/src/lib/hours.js';

export const FORMAT = 'tampere-targets/infra@1';
export const GTFS_URL = 'https://data.itsfactory.fi/journeys/files/gtfs/latest/gtfs_tampere.zip';
export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const USER_AGENT = 'tampere-targets-infra/1 (personal map; one request per source per run)';
const OUT = path.join(ROOT, 'web', 'public', 'infra.json');
const AREAS = path.join(ROOT, 'web', 'public', 'postal-areas.geojson');
const MARGIN_KM = 1;

/** The postal areas' bounding box, widened by MARGIN_KM: [west, south, east, north]. */
export function searchBox(areas, marginKm = MARGIN_KM) {
  let [w, s, e, n] = [180, 90, -180, -90];
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      w = Math.min(w, c[0]);
      e = Math.max(e, c[0]);
      s = Math.min(s, c[1]);
      n = Math.max(n, c[1]);
    } else c.forEach(walk);
  };
  for (const f of areas.features) walk(f.geometry.coordinates);
  const dLat = marginKm / 111.32;
  const dLon = marginKm / (111.32 * Math.cos((((s + n) / 2) * Math.PI) / 180));
  const r = (v) => Math.round(v * 1e5) / 1e5;
  return [r(w - dLon), r(s - dLat), r(e + dLon), r(n + dLat)];
}

/** The file, one stop or store per line so a refresh gives a readable diff. */
export function renderInfra(doc) {
  const list = (items) => (items.length ? `[\n${items.map((x) => `    ${JSON.stringify(x)}`).join(',\n')}\n  ]` : '[]');
  const head = Object.entries(doc)
    .filter(([k]) => k !== 'stops' && k !== 'stores')
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  return `{\n${[...head, `  "stops": ${list(doc.stops)}`, `  "stores": ${list(doc.stores)}`].join(',\n')}\n}\n`;
}

export function summarise(doc) {
  const lines = [];
  const tram = doc.stops.filter((s) => s.mode === 'tram').length;
  lines.push(`Stops: ${doc.stops.length} (${tram} tram, ${doc.stops.length - tram} bus)`);
  lines.push(`Stores: ${doc.stores.length}`);
  for (const [group, label] of Object.entries(GROUPS)) {
    const mine = doc.stores.filter((s) => s.group === group);
    const chains = {};
    for (const s of mine) chains[s.chain] = (chains[s.chain] ?? 0) + 1;
    lines.push(`  ${label}: ${mine.length} (${Object.entries(chains).map(([c, n]) => `${c} ${n}`).join(', ')})`);
  }
  const noHours = doc.stores.filter((s) => !s.hours);
  const unread = doc.stores.filter((s) => s.hours && !parseOpeningHours(s.hours));
  lines.push(`  opening hours: ${doc.stores.length - noHours.length} given, ${noHours.length} missing`);
  for (const s of unread) lines.push(`  ! hours not understood (shown as text): ${s.name}: ${s.hours}`);
  return lines.join('\n');
}

// Overpass answers 429 or 504 when it is busy: try again twice, 15 s apart, then give up.
const BUSY = new Set([429, 502, 503, 504]);
const RETRY_MS = 15000;

async function download(url, init = {}) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...init.headers } });
    if (res.ok) return res;
    if (!BUSY.has(res.status) || attempt === 3) throw new Error(`${url}: HTTP ${res.status}`);
    console.log(`  busy (HTTP ${res.status}), trying again in ${RETRY_MS / 1000} s`);
    await new Promise((r) => setTimeout(r, RETRY_MS));
  }
}

async function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: { gtfs: { type: 'string' }, osm: { type: 'string' }, 'dry-run': { type: 'boolean' }, out: { type: 'string' } },
  });
  const box = searchBox(JSON.parse(readFileSync(AREAS, 'utf8')));
  console.log(`Area: the postal areas + ${MARGIN_KM} km, box ${box.join(', ')}`);

  console.log(values.gtfs ? `Stops: reading ${values.gtfs}` : `Stops: downloading ${GTFS_URL}`);
  const zip = values.gtfs ? readFileSync(values.gtfs) : Buffer.from(await (await download(GTFS_URL)).arrayBuffer());
  const stops = await stopsFromGtfsZip(zip, box);

  console.log(values.osm ? `Stores: reading ${values.osm}` : `Stores: asking ${OVERPASS_URL}`);
  const osm = values.osm
    ? JSON.parse(readFileSync(values.osm, 'utf8'))
    : await (
        await download(OVERPASS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: new URLSearchParams({ data: overpassQuery(box) }),
        })
      ).json();
  const stores = storesFromOsm(osm.elements ?? [], box);

  const now = new Date().toISOString();
  const doc = {
    format: FORMAT,
    generated: now,
    box,
    sources: {
      stops: { name: 'Tampere public transport (Nysse) GTFS', url: GTFS_URL, licence: 'CC BY 4.0' },
      stores: { name: 'OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright', licence: 'ODbL 1.0', osmBase: osm.osm3s?.timestamp_osm_base ?? null },
    },
    stops,
    stores,
  };
  console.log(summarise(doc));
  if (values['dry-run']) {
    console.log('Dry run: nothing written.');
    return;
  }
  const out = values.out ?? OUT;
  writeFileSync(out, renderInfra(doc), 'utf8');
  console.log(`Wrote ${path.relative(ROOT, out)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(`infra: ${err.message}`);
    process.exitCode = 1;
  });
}
