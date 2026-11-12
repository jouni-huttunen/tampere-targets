// Tram and bus stops from the Nysse GTFS feed (FR-43): stop number, name, position and whether
// trams or buses call there. The lines themselves are not kept (the user's choice).
import { createInterface } from 'node:readline';
import { entryStream, entryText, zipEntries } from './zip.mjs';

/** One CSV line into fields (GTFS quotes every field; quotes inside are doubled). */
export function parseCsvLine(line) {
  const out = [];
  let i = 0;
  while (i <= line.length) {
    if (line[i] === '"') {
      let v = '';
      i++;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          v += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++;
          break;
        } else v += line[i++];
      }
      out.push(v);
      i++; // the comma
    } else {
      const end = line.indexOf(',', i);
      const stop = end < 0 ? line.length : end;
      out.push(line.slice(i, stop));
      i = stop + 1;
    }
  }
  return out;
}

/** A small CSV table as objects keyed by the header (BOM and CRLF tolerated). */
export function parseCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.length);
  const head = parseCsvLine(lines[0]);
  return lines.slice(1).map((l) => {
    const f = parseCsvLine(l);
    return Object.fromEntries(head.map((h, i) => [h, f[i] ?? '']));
  });
}

// GTFS route_type: 0 = tram (900–906 in the extended types); everything else Nysse runs is a bus.
const isTram = (type) => type === '0' || (Number(type) >= 900 && Number(type) <= 906);

/**
 * The served stops inside the box, as { code, name, lat, lon, mode: 'tram' | 'bus' }.
 * `modesByStop` maps stop_id → Set of route types calling there; stops no trip calls at in the
 * current timetable are left out. A stop served by both counts as a tram stop.
 */
export function stopsInBox(stops, modesByStop, [west, south, east, north]) {
  const out = [];
  for (const s of stops) {
    const lat = Number(s.stop_lat);
    const lon = Number(s.stop_lon);
    if (!(lon >= west && lon <= east && lat >= south && lat <= north)) continue;
    const types = modesByStop.get(s.stop_id);
    if (!types?.size) continue;
    out.push({
      code: s.stop_code || s.stop_id,
      name: s.stop_name,
      lat: Math.round(lat * 1e5) / 1e5,
      lon: Math.round(lon * 1e5) / 1e5,
      mode: [...types].some(isTram) ? 'tram' : 'bus',
    });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

/** stop_id → Set of route types, from stop_times lines (an async iterable of text lines). */
export async function modesByStop(lines, tripType) {
  const out = new Map();
  let head = null;
  for await (const line of lines) {
    if (!line) continue;
    const f = parseCsvLine(line.replace(/^﻿/, ''));
    if (!head) {
      head = { trip: f.indexOf('trip_id'), stop: f.indexOf('stop_id') };
      continue;
    }
    const type = tripType.get(f[head.trip]);
    if (type == null) continue;
    const stop = f[head.stop];
    if (!out.has(stop)) out.set(stop, new Set());
    out.get(stop).add(type);
  }
  return out;
}

/** The stops inside the box from a GTFS archive (a Buffer). */
export async function stopsFromGtfsZip(buf, box) {
  const entries = new Map(zipEntries(buf).map((e) => [e.name.replace(/^.*\//, ''), e]));
  for (const f of ['stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt']) {
    if (!entries.has(f)) throw new Error(`The GTFS archive has no ${f}`);
  }
  const routeType = new Map(parseCsv(entryText(buf, entries.get('routes.txt'))).map((r) => [r.route_id, r.route_type]));
  const tripType = new Map(parseCsv(entryText(buf, entries.get('trips.txt'))).map((t) => [t.trip_id, routeType.get(t.route_id)]));
  const lines = createInterface({ input: entryStream(buf, entries.get('stop_times.txt')), crlfDelay: Infinity });
  const modes = await modesByStop(lines, tripType);
  return stopsInBox(parseCsv(entryText(buf, entries.get('stops.txt'))), modes, box);
}
