// node src/cli.mjs list window|new|removed|all · show <id> · sql "<query>" · export <dir>
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DB_PATH } from './config.mjs';
import { listingColumns, openDb } from './db.mjs';
import { helsinkiDateTime } from './time.mjs';

const USAGE = `Usage:
  node src/cli.mjs list window|new|removed|all   list homes (default: window)
  node src/cli.mjs show <id>                     everything about one home
  node src/cli.mjs sql "<query>"                 run a read-only SQL query
  node src/cli.mjs export <dir>                  write the stored JSON to files`;

function text(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ');
}

export function formatTable(rows, columns) {
  if (rows.length === 0) return '(no rows)';
  const cols = columns ?? Object.keys(rows[0]);
  const clip = (s) => (s.length > 60 ? s.slice(0, 59) + '…' : s);
  const cells = rows.map((r) => cols.map((c) => clip(text(r[c]))));
  const widths = cols.map((c, i) => Math.max(c.length, ...cells.map((r) => r[i].length)));
  const line = (values) => values.map((v, i) => v.padEnd(widths[i])).join('  ').trimEnd();
  return [line(cols), line(widths.map((w) => '-'.repeat(w))), ...cells.map(line)].join('\n');
}

const LIST_SOURCES = {
  window: 'v_window',
  new: 'v_new',
  all: 'v_active',
  removed: '(SELECT * FROM listings WHERE removed_at IS NOT NULL)',
};

function list(db, which = 'window') {
  const source = LIST_SOURCES[which];
  if (!source) throw new Error(`Unknown list "${which}". Use window, new, removed or all.`);
  const distance = listingColumns(db).includes('dist_centre_km') ? ', dist_centre_km AS km_centre' : '';
  const rows = db
    .prepare(
      `SELECT card_id AS id, district, address, size_m2 AS m2, rooms, rent_eur AS rent, build_year AS built,
              COALESCE(available_date, 'no date') AS available${distance}
       FROM ${source} ORDER BY build_year DESC, rent_eur`,
    )
    .all();
  console.log(formatTable(rows));
  console.log(`\n${rows.length} homes (${which})`);
}

function show(db, idText) {
  const id = Number(idText);
  if (!Number.isInteger(id)) throw new Error('show needs a numeric listing id');
  const row = db.prepare('SELECT * FROM listings WHERE card_id = ?').get(id);
  if (!row) throw new Error(`No listing ${id}`);
  const skip = new Set(['search_json', 'detail_json']);
  const lines = [];
  for (const [key, value] of Object.entries(row)) {
    if (skip.has(key)) continue;
    const shown = /_at$/.test(key) && value && key !== 'price_changed_at' ? `${value}  (${helsinkiDateTime(value)} Helsinki)` : text(value);
    lines.push(`${key.padEnd(20)} ${shown}`);
  }
  if (row.detail_json) {
    const ad = JSON.parse(row.detail_json).adData ?? {};
    lines.push('', 'Lease fields from the raw detail:');
    for (const key of ['fixedTerm', 'fixedTermEnd', 'fixedTermMonths', 'fixedTermContinuesAsIndefinite', 'minRentTimeMonths', 'habitationRentType', 'securityDepositInfo', 'waterFeeInfo']) {
      lines.push(`${key.padEnd(32)} ${text(typeof ad[key] === 'object' && ad[key] !== null ? JSON.stringify(ad[key]) : ad[key])}`);
    }
  } else {
    lines.push('', '(no detail fetched yet)');
  }
  console.log(lines.join('\n'));
}

function sql(db, query) {
  if (!query) throw new Error('sql needs a query in quotes');
  const rows = db.prepare(query).all();
  console.log(formatTable(rows));
  console.log(`\n${rows.length} rows`);
}

function exportJson(db, dir) {
  if (!dir) throw new Error('export needs a target folder');
  const target = path.resolve(dir);
  mkdirSync(target, { recursive: true });
  const rows = db.prepare('SELECT card_id, search_json, detail_json FROM listings').all();
  let files = 0;
  for (const row of rows) {
    for (const [kind, json] of [['search', row.search_json], ['detail', row.detail_json]]) {
      if (!json) continue;
      writeFileSync(path.join(target, `${row.card_id}.${kind}.json`), JSON.stringify(JSON.parse(json), null, 2), 'utf8');
      files++;
    }
  }
  console.log(`Wrote ${files} files for ${rows.length} listings to ${target}`);
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === 'help' || command === '--help') {
    console.log(USAGE);
    return;
  }
  if (!existsSync(DB_PATH)) {
    console.error('No database yet. Run "npm run capture" and "npm run import" first.');
    process.exitCode = 1;
    return;
  }
  // Read-only: the CLI can never change the database, whatever SQL is passed.
  const db = openDb(DB_PATH, { readOnly: true });
  try {
    if (command === 'list') list(db, args[0]);
    else if (command === 'show') show(db, args[0]);
    else if (command === 'sql') sql(db, args.join(' '));
    else if (command === 'export') exportJson(db, args[0]);
    else {
      console.error(`Unknown command "${command}".\n${USAGE}`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
