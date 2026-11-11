// npm run rebuild: recompute every extracted column from the stored JSON. No network.
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DB_PATH, loadConfig } from './config.mjs';
import { counts, openDb, transaction, updateRow } from './db.mjs';
import { normalize } from './normalize.mjs';

/** Returns the number of listings rewritten. Raw JSON and history are never touched. */
export function rebuild(db, config) {
  const rows = db.prepare('SELECT card_id, search_json, detail_json FROM listings').all();
  transaction(db, () => {
    for (const row of rows) {
      const card = row.search_json ? JSON.parse(row.search_json) : null;
      const detail = row.detail_json ? JSON.parse(row.detail_json) : null;
      updateRow(db, 'listings', 'card_id', row.card_id, normalize(card, detail, config));
    }
  });
  return rows.length;
}

function main() {
  if (!existsSync(DB_PATH)) {
    console.error('No database yet. Run "npm run capture" and "npm run import" first.');
    process.exitCode = 1;
    return;
  }
  const config = loadConfig();
  const db = openDb(DB_PATH, { config });
  try {
    const n = rebuild(db, config);
    const c = counts(db);
    console.log(`Rebuilt ${n} listings from stored JSON. Active ${c.active}, in window ${c.window}, removed ${c.removed}.`);
  } finally {
    db.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
