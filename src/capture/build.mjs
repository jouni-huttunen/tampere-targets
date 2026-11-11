// npm run capture [-- --full] [-- --max-details N] [-- --no-clipboard]
// Builds dist/capture.js (shared logic + config + current DB state in one IIFE)
// and copies it to the clipboard for pasting into the browser's DevTools console.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DB_PATH, DIST_DIR, captureConfig, loadConfig } from '../config.mjs';
import { openDb } from '../db.mjs';
import { detailsDue, planRun } from '../shared/plan.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHARED = ['hash.mjs', 'search.mjs', 'plan.mjs'];

/** Turn an ES module into plain script text (single-line imports only). */
function stripModuleSyntax(source) {
  return source.replace(/^import\s.*$/gm, '').replace(/^export\s+/gm, '');
}

/** JSON with every non-ASCII character escaped, so the clipboard copy is safe. */
function asciiJson(value) {
  return JSON.stringify(value).replace(/[\u007f-￿]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
}

/** The state the browser script needs from the database. */
export function readState(db, { forceFull = false, now = new Date() } = {}) {
  const state = { generatedAt: now.toISOString(), lastRunStartedAt: null, lastFullSweepAt: null, forceFull, known: {} };
  if (!db) return state;
  state.lastRunStartedAt =
    db.prepare('SELECT MAX(started_at) AS t FROM runs WHERE sweep_complete = 1').get().t ?? null;
  state.lastFullSweepAt =
    db.prepare("SELECT MAX(started_at) AS t FROM runs WHERE sweep_complete = 1 AND mode = 'full'").get().t ?? null;
  const rows = db
    .prepare(
      `SELECT l.card_id, l.search_hash, l.detail_fetched_at,
              EXISTS (SELECT 1 FROM v_window w WHERE w.card_id = l.card_id) AS in_window
       FROM listings l WHERE l.removed_at IS NULL`,
    )
    .all();
  for (const r of rows) state.known[r.card_id] = [r.search_hash, r.detail_fetched_at ?? null, r.in_window ? 1 : 0];
  return state;
}

/** Fill in missing Oikotie location ids from stored listings, where possible. */
export function resolveAreaIds(config, db) {
  for (const area of config.areas) {
    if (area.id != null || !db) continue;
    const row = db
      .prepare(
        `SELECT json_extract(detail_json, '$.address.zipCode.cardId') AS id FROM listings
         WHERE zip = ? AND json_extract(detail_json, '$.address.zipCode.cardId') IS NOT NULL LIMIT 1`,
      )
      .get(String(area.zip));
    if (row && Number.isInteger(row.id)) area.id = row.id;
  }
  return config;
}

export function buildCaptureScript({ state, config }) {
  const shared = SHARED.map((name) => stripModuleSyntax(readFileSync(path.join(HERE, '..', 'shared', name), 'utf8')));
  const browser = readFileSync(path.join(HERE, 'browser.js'), 'utf8');
  const script = [
    `/* tampere-city-boy capture script, built ${state.generatedAt}. Paste into the DevTools console on asunnot.oikotie.fi. */`,
    '(function () {',
    "'use strict';",
    `const STATE = ${asciiJson(state)};`,
    `const CONFIG = ${asciiJson(config)};`,
    ...shared,
    browser,
    'tcbStart();',
    '})();',
    '',
  ].join('\n');
  const bad = /[^\x09\x0a\x0d\x20-\x7e]/.exec(script);
  if (bad) throw new Error(`Capture script contains a non-ASCII character at offset ${bad.index}`);
  return script;
}

function copyToClipboard(file, text) {
  const quoted = file.replace(/'/g, "''");
  const ps = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', `Set-Clipboard -Value (Get-Content -Raw -Encoding UTF8 -LiteralPath '${quoted}')`],
    { stdio: 'ignore' },
  );
  if (ps.status === 0) return true;
  const clip = spawnSync('clip', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
  return clip.status === 0;
}

function describePlan(state, config, now) {
  const plan = planRun(state, config, now.getTime());
  const knownCount = Object.keys(state.known).length;
  const perRequestS = (config.delayMs + config.jitterMs / 2 + 300) / 1000;
  const lines = [];
  if (plan.mode === 'full') {
    lines.push(`Plan: full sweep (${plan.reason}).`);
  } else {
    lines.push(`Plan: incremental search, listings published in the last ${plan.ageFilter} day(s).`);
  }
  if (knownCount === 0) {
    lines.push('      Then details for every listing found (one request each).');
    lines.push(`      Roughly ${Math.round(perRequestS * 10) / 10} s per request; about 380 listings would take about 13 minutes.`);
  } else {
    const due = detailsDue([], state, config, now.getTime()).length;
    lines.push(`      Then details for ${due} known listing(s) that are missing or stale, plus any new or changed ones.`);
    lines.push(`      About ${Math.max(1, Math.round((due * perRequestS) / 60))} minute(s) if nothing else is new.`);
  }
  if (config.maxDetails < 600) lines.push(`      Details are capped at ${config.maxDetails} for this run (--max-details).`);
  return lines.join('\n');
}

function parseArgs(argv) {
  const args = { full: false, clipboard: true, maxDetails: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--full') args.full = true;
    else if (a === '--no-clipboard') args.clipboard = false;
    else if (a === '--max-details') args.maxDetails = Number(argv[++i]);
    else if (a.startsWith('--max-details=')) args.maxDetails = Number(a.split('=')[1]);
    else throw new Error(`Unknown option "${a}". Options: --full, --max-details N, --no-clipboard`);
  }
  if (args.maxDetails !== null && (!Number.isInteger(args.maxDetails) || args.maxDetails < 0)) {
    throw new Error('--max-details needs a whole number, e.g. --max-details 5');
  }
  return args;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }
  const config = loadConfig();
  const db = existsSync(DB_PATH) ? openDb(DB_PATH, { config }) : null;
  const now = new Date();
  let state;
  let flat;
  try {
    resolveAreaIds(config, db);
    flat = captureConfig(config, args.maxDetails === null ? {} : { maxDetails: args.maxDetails });
    state = readState(db, { forceFull: args.full, now });
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  } finally {
    if (db) db.close();
  }

  const script = buildCaptureScript({ state, config: flat });
  mkdirSync(DIST_DIR, { recursive: true });
  const file = path.join(DIST_DIR, 'capture.js');
  writeFileSync(file, script, 'utf8');
  const copied = args.clipboard && copyToClipboard(file, script);

  console.log(`Built ${file} (${Math.round(script.length / 1024)} kB, ${Object.keys(state.known).length} known listings).`);
  console.log(describePlan(state, flat, now));
  console.log('');
  console.log(copied ? 'The script is on your clipboard. Now:' : 'Open dist/capture.js, copy all of it, then:');
  console.log('  1. Open https://asunnot.oikotie.fi in Chrome or Edge.');
  console.log('  2. Press F12 and choose the Console tab.');
  console.log('  3. Paste and press Enter. (First time in Chrome: type "allow pasting" and press Enter, then paste.)');
  console.log('  4. Keep the tab in front until the panel says Done. A file oikotie-<time>.json is downloaded.');
  console.log('  5. Run: npm run import');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
