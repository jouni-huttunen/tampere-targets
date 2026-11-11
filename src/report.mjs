// Markdown report for one run: reports/<date>-run-<id>.md
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DB_PATH, REPORTS_DIR, loadConfig } from './config.mjs';
import { counts, latestRun, openDb } from './db.mjs';
import { helsinkiDate, helsinkiDateTime } from './time.mjs';

function cell(value) {
  if (value === null || value === undefined || value === '') return '–';
  return String(value).replace(/\|/g, '\\|').replace(/\s+/g, ' ');
}

function listingLine(l) {
  const where = [l.district, l.address].filter(Boolean).join(', ') || `listing ${l.card_id}`;
  const link = l.url ? `[${cell(where)}](${l.url})` : cell(where);
  return `| ${link} | ${cell(l.size_m2)} | ${cell(l.rooms)} | ${cell(l.rent_eur)} | ${cell(l.build_year)} | ${cell(l.available_date ?? 'no date')} | ${cell(l.dist_centre_km)} |`;
}

const LISTING_HEAD = '| Home | m² | Rooms | Rent € | Built | Available | km to centre |\n|---|---|---|---|---|---|---|';

export function renderReport(db, runId) {
  const run = db.prepare('SELECT * FROM runs WHERE run_id = ?').get(runId);
  if (!run) throw new Error(`No run ${runId}`);
  const c = counts(db);
  const out = [];
  const mode = run.mode === 'full' ? 'full sweep' : `incremental (published=${run.age_filter})`;

  out.push(`# Run ${run.run_id} · ${helsinkiDateTime(run.started_at)}`);
  out.push('');
  out.push(`- **Mode:** ${mode}${run.is_initial ? ' · initial crawl (nothing is flagged as new)' : ''}`);
  out.push(`- **Status:** ${run.status}${run.stopped_reason ? ` (stopped: ${run.stopped_reason})` : ''}`);
  out.push(`- **Requests:** ${run.search_requests} search, ${run.detail_requests} detail, ${run.error_count} errors`);
  out.push(`- **Found on Oikotie:** ${run.found ?? '–'}`);
  out.push(`- **This run:** ${run.new_count} new, ${run.changed_count} changed, ${run.removed_count} removed`);
  out.push(`- **Database now:** ${c.active} active, ${c.window} in the window, ${c.removed} removed`);
  out.push('');

  if (!run.is_initial) {
    const fresh = db
      .prepare('SELECT * FROM v_window WHERE first_seen_run_id = ? ORDER BY build_year DESC, rent_eur')
      .all(runId);
    out.push(`## New in your window (${fresh.length})`);
    out.push('');
    if (fresh.length) out.push(LISTING_HEAD, ...fresh.map(listingLine));
    else out.push('None.');
    out.push('');
  }

  const changes = db
    .prepare(
      `SELECT ch.field, ch.old, ch.new, l.card_id, l.url, l.district, l.address
       FROM listing_changes ch JOIN listings l ON l.card_id = ch.card_id
       WHERE ch.run_id = ? AND ch.field <> 'removed' ORDER BY l.district, l.address`,
    )
    .all(runId);
  out.push(`## Changes (${changes.length})`);
  out.push('');
  if (changes.length) {
    out.push('| Home | Field | Before | After |', '|---|---|---|---|');
    for (const ch of changes) {
      const where = [ch.district, ch.address].filter(Boolean).join(', ') || `listing ${ch.card_id}`;
      out.push(`| ${ch.url ? `[${cell(where)}](${ch.url})` : cell(where)} | ${ch.field} | ${cell(ch.old)} | ${cell(ch.new)} |`);
    }
  } else out.push('None.');
  out.push('');

  const gone = db
    .prepare(
      `SELECT l.* FROM listing_changes ch JOIN listings l ON l.card_id = ch.card_id
       WHERE ch.run_id = ? AND ch.field = 'removed' AND ch.new IS NOT NULL ORDER BY l.district, l.address`,
    )
    .all(runId);
  const back = db
    .prepare(
      `SELECT l.* FROM listing_changes ch JOIN listings l ON l.card_id = ch.card_id
       WHERE ch.run_id = ? AND ch.field = 'removed' AND ch.new IS NULL ORDER BY l.district, l.address`,
    )
    .all(runId);
  out.push(`## Removed (${gone.length})`);
  out.push('');
  if (gone.length) out.push(LISTING_HEAD, ...gone.map(listingLine));
  else out.push('None.');
  out.push('');
  if (back.length) {
    out.push(`## Back again (${back.length})`, '', LISTING_HEAD, ...back.map(listingLine), '');
  }
  return out.join('\n');
}

/** Write the report file for a run and return its path. */
export function writeReport(db, runId, dir = REPORTS_DIR) {
  const run = db.prepare('SELECT started_at FROM runs WHERE run_id = ?').get(runId);
  const file = path.join(dir, `${helsinkiDate(run.started_at)}-run-${runId}.md`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, renderReport(db, runId), 'utf8');
  return file;
}

function main() {
  if (!existsSync(DB_PATH)) {
    console.error('No database yet. Run "npm run capture" and "npm run import" first.');
    process.exitCode = 1;
    return;
  }
  const db = openDb(DB_PATH, { config: loadConfig() });
  try {
    const run = latestRun(db);
    if (!run) {
      console.error('No runs imported yet.');
      process.exitCode = 1;
      return;
    }
    console.log(`Report: ${writeReport(db, run.run_id)}`);
  } finally {
    db.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
