// npm run import [file]: capture file -> SQLite. See docs/03-design.md, section 7.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DB_PATH, loadConfig } from './config.mjs';
import { counts, getListing, insertRow, openDb, transaction, updateRow } from './db.mjs';
import { normalize } from './normalize.mjs';
import { writeReport } from './report.mjs';
import { cardHash } from './shared/hash.mjs';

export const CAPTURE_FORMAT = 'tampere-city-boy/oikotie-capture@1';

/** Fields whose changes are written to listing_changes. */
const TRACKED_CARD = ['rent_eur'];
const TRACKED_DETAIL = ['rent_eur', 'available_date', 'lease_text', 'status'];

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function sameValue(a, b) {
  return (a ?? null) === (b ?? null);
}

function textOrNull(v) {
  return v === null || v === undefined ? null : String(v);
}

export function validateCapture(capture) {
  const fail = (msg) => {
    throw new Error('Not a valid capture file: ' + msg);
  };
  if (!capture || typeof capture !== 'object') fail('not a JSON object');
  if (capture.format !== CAPTURE_FORMAT) fail(`format is "${capture.format}", expected "${CAPTURE_FORMAT}"`);
  if (typeof capture.captureId !== 'string' || !capture.captureId) fail('captureId is missing');
  if (!Number.isFinite(Date.parse(capture.startedAt))) fail('startedAt is missing');
  if (capture.mode !== 'full' && capture.mode !== 'incremental') fail('mode must be full or incremental');
  if (!Array.isArray(capture.searchCards)) fail('searchCards is missing');
  if (!capture.details || typeof capture.details !== 'object') fail('details is missing');
}

/**
 * Import one capture into the database, in a single transaction.
 * Returns a summary; { skipped: true } when this capture was imported before.
 */
export function importCapture(db, capture, config, { importedAt = new Date().toISOString() } = {}) {
  validateCapture(capture);
  const duplicate = db.prepare('SELECT run_id FROM runs WHERE capture_id = ?').get(capture.captureId);
  if (duplicate) return { skipped: true, runId: duplicate.run_id };
  return transaction(db, () => runImport(db, capture, config, importedAt));
}

function runImport(db, capture, config, importedAt) {
  const warnings = [];
  const detailEntries = Object.entries(capture.details);
  const requests = Array.isArray(capture.requests) ? capture.requests : [];
  const errors = Array.isArray(capture.errors) ? capture.errors : [];
  const sweepComplete = capture.sweepComplete ? 1 : 0;
  const hadFullSweep = db.prepare("SELECT 1 AS x FROM runs WHERE mode = 'full' AND sweep_complete = 1 LIMIT 1").get();
  const isInitial = hadFullSweep ? 0 : 1;
  const detailsDue = Number.isFinite(capture.detailsDue) ? capture.detailsDue : detailEntries.length;
  const status = !sweepComplete
    ? 'incomplete'
    : capture.stoppedReason || detailsDue > detailEntries.length
      ? 'partial'
      : 'ok';

  const runId = Number(
    insertRow(db, 'runs', {
      capture_id: capture.captureId,
      started_at: capture.startedAt,
      finished_at: capture.finishedAt ?? null,
      imported_at: importedAt,
      mode: capture.mode,
      age_filter: capture.ageFilter ?? null,
      sweep_complete: sweepComplete,
      is_initial: isInitial,
      found: capture.found ?? null,
      search_requests: requests.filter((r) => String(r.url).startsWith('/api/search')).length,
      detail_requests: requests.filter((r) => String(r.url).startsWith('/api/card/')).length,
      error_count: errors.length,
      status,
      stopped_reason: capture.stoppedReason ?? null,
    }).lastInsertRowid,
  );

  const newIds = new Set();
  const changedIds = new Set();
  const removedIds = new Set();
  const reappearedIds = new Set();
  const seen = new Set();

  const logChange = (cardId, field, oldValue, newValue, at) =>
    insertRow(db, 'listing_changes', {
      card_id: cardId,
      run_id: runId,
      changed_at: at,
      field,
      old: textOrNull(oldValue),
      new: textOrNull(newValue),
    });

  const markRemoved = (cardId, at) => {
    updateRow(db, 'listings', 'card_id', cardId, { removed_at: at });
    logChange(cardId, 'removed', null, at, at);
    removedIds.add(cardId);
  };

  // 1. Search cards
  for (const entry of capture.searchCards) {
    const card = entry && entry.card;
    const id = Number(card && card.cardId);
    if (!Number.isInteger(id)) {
      warnings.push('Skipped a search card without a numeric cardId.');
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    const at = entry.fetchedAt || capture.startedAt;
    const old = getListing(db, id);
    const hash = cardHash(card);
    const detail = old && old.detail_json ? JSON.parse(old.detail_json) : null;
    const columns = normalize(card, detail, config);
    const patch = {
      ...columns,
      search_json: JSON.stringify(card),
      search_hash: hash,
      search_fetched_at: at,
      last_seen_at: at,
    };
    if (!old) {
      insertRow(db, 'listings', { card_id: id, first_seen_at: at, first_seen_run_id: runId, ...patch });
      newIds.add(id);
      continue;
    }
    if (old.removed_at) {
      patch.removed_at = null;
      logChange(id, 'removed', old.removed_at, null, at);
      reappearedIds.add(id);
    }
    if (old.search_hash !== hash) changedIds.add(id);
    for (const field of TRACKED_CARD) {
      if (!sameValue(old[field], columns[field])) logChange(id, field, old[field], columns[field], at);
    }
    updateRow(db, 'listings', 'card_id', id, patch);
  }

  // 2. Details
  const okDetails = detailEntries.filter(([, d]) => d && d.status === 200 && d.json);
  const isInactive = (json) => json.status !== null && json.status !== undefined && json.status !== 1;
  const inactiveCount = okDetails.filter(([, d]) => isInactive(d.json)).length;
  // Safety net: "status other than 1 means removed" comes from a small sample of
  // real data. If it would remove a large share of a capture, distrust it.
  const distrustStatus = inactiveCount > Math.max(3, okDetails.length / 2);
  if (distrustStatus) {
    warnings.push(
      `${inactiveCount} of ${okDetails.length} details have a status other than 1. ` +
        'That looks like a wrong assumption about the status field, so no listing was marked removed because of it.',
    );
  }

  for (const [key, d] of detailEntries) {
    const id = Number(key);
    if (!Number.isInteger(id) || !d) continue;
    const at = d.fetchedAt || capture.startedAt;
    const old = getListing(db, id);

    if (d.status === 404) {
      if (old && !old.removed_at) markRemoved(id, at);
      continue;
    }
    if (d.status !== 200 || !d.json) continue;

    const detailJson = JSON.stringify(d.json);
    const hash = sha256(detailJson);
    const inactive = isInactive(d.json) && !distrustStatus;
    const patch = { detail_fetched_at: at };
    if (!inactive) patch.last_seen_at = at;

    if (!old || old.detail_hash !== hash) {
      db.prepare(
        'INSERT OR REPLACE INTO listing_versions (card_id, fetched_at, run_id, detail_hash, detail_json) VALUES (?, ?, ?, ?, ?)',
      ).run(id, at, runId, hash, detailJson);
      const card = old && old.search_json ? JSON.parse(old.search_json) : null;
      const columns = normalize(card, d.json, config);
      Object.assign(patch, columns, { detail_json: detailJson, detail_hash: hash });
      if (old && old.detail_hash) {
        changedIds.add(id);
        for (const field of TRACKED_DETAIL) {
          if (!sameValue(old[field], columns[field])) logChange(id, field, old[field], columns[field], at);
        }
      }
    }

    if (!old) {
      // A detail for a listing we have no row for (e.g. the database was recreated
      // after the script was built). Keep it rather than lose it.
      insertRow(db, 'listings', {
        card_id: id,
        first_seen_at: at,
        first_seen_run_id: runId,
        last_seen_at: at,
        ...patch,
      });
      newIds.add(id);
    } else {
      updateRow(db, 'listings', 'card_id', id, patch);
    }
    if (inactive && !(old && old.removed_at)) markRemoved(id, at);
  }

  // 3. Removals by absence: only after a complete full sweep
  if (capture.mode === 'full' && sweepComplete) {
    const active = db.prepare('SELECT card_id FROM listings WHERE removed_at IS NULL').all();
    for (const { card_id: id } of active) {
      if (!seen.has(id)) markRemoved(id, capture.startedAt);
    }
  }

  for (const id of newIds) changedIds.delete(id);
  updateRow(db, 'runs', 'run_id', runId, {
    new_count: newIds.size,
    changed_count: changedIds.size,
    removed_count: removedIds.size,
  });

  return {
    skipped: false,
    runId,
    mode: capture.mode,
    ageFilter: capture.ageFilter ?? null,
    status,
    stoppedReason: capture.stoppedReason ?? null,
    isInitial: isInitial === 1,
    sweepComplete: sweepComplete === 1,
    found: capture.found ?? null,
    searchCards: seen.size,
    detailsFetched: okDetails.length,
    detailsDue,
    new: newIds.size,
    changed: changedIds.size,
    removed: removedIds.size,
    reappeared: reappearedIds.size,
    errors: errors.length,
    warnings,
  };
}

/** Newest oikotie-*.json in the user's Downloads folder, or null. */
export function newestCaptureFile(dir = path.join(os.homedir(), 'Downloads')) {
  let best = null;
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    return null;
  }
  for (const name of names) {
    if (!/^oikotie-.*\.json$/i.test(name)) continue;
    const file = path.join(dir, name);
    const mtime = statSync(file).mtimeMs;
    if (!best || mtime > best.mtime) best = { file, mtime };
  }
  return best ? best.file : null;
}

function printSummary(summary, totals, reportFile) {
  const lines = [];
  const mode = summary.mode === 'full' ? 'full sweep' : `incremental (published=${summary.ageFilter})`;
  lines.push(`Run ${summary.runId}: ${mode}, status ${summary.status}` + (summary.isInitial ? ' (initial crawl)' : ''));
  lines.push(`  search:   ${summary.searchCards} cards` + (summary.found === null ? '' : ` of ${summary.found} found`));
  lines.push(`  details:  ${summary.detailsFetched} fetched of ${summary.detailsDue} due`);
  lines.push(`  new ${summary.new} · changed ${summary.changed} · removed ${summary.removed} · reappeared ${summary.reappeared} · errors ${summary.errors}`);
  if (summary.stoppedReason) lines.push(`  stopped early: ${summary.stoppedReason}`);
  lines.push('');
  lines.push(`Database now: ${totals.active} active (${totals.withDetail} with details), ${totals.window} in your window, ${totals.isNew} new, ${totals.removed} removed`);
  if (totals.withDetail < totals.active) {
    lines.push(`  ${totals.active - totals.withDetail} active listings still lack details: run "npm run capture" again to fetch them.`);
  }
  for (const w of summary.warnings) lines.push('WARNING: ' + w);
  if (reportFile) lines.push(`Report: ${reportFile}`);
  console.log(lines.join('\n'));
}

function main() {
  const arg = process.argv[2];
  const file = arg ? path.resolve(arg) : newestCaptureFile();
  if (!file) {
    console.error('No oikotie-*.json found in your Downloads folder. Pass the file path: npm run import -- <file>');
    process.exitCode = 1;
    return;
  }
  console.log(`Importing ${file}`);
  let capture;
  try {
    capture = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`Could not read the file as JSON (${err.message}). The database was not changed.`);
    process.exitCode = 1;
    return;
  }
  const config = loadConfig();
  const db = openDb(DB_PATH, { config });
  try {
    const summary = importCapture(db, capture, config);
    if (summary.skipped) {
      console.log(`Already imported (run ${summary.runId}). Nothing changed.`);
      return;
    }
    const reportFile = writeReport(db, summary.runId);
    printSummary(summary, counts(db), reportFile);
  } catch (err) {
    console.error(`Import failed: ${err.message}\nThe database was not changed.`);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
