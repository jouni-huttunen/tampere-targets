// Shared start-up for server/index.mjs (npm run ui) and server/dev.mjs (npm run ui:dev).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { DB_PATH, ROOT, loadConfig } from '../src/config.mjs';
import { openDb } from '../src/db.mjs';
import { buildApp } from './app.mjs';

export const STATIC_DIR = path.join(ROOT, 'web', 'dist');

/** --no-photos (or TCB_NO_PHOTOS=1) hides Oikotie photos, for agent previews. --port N (or TCB_PORT). */
export function serverOptions(argv = process.argv.slice(2), env = process.env) {
  const i = argv.indexOf('--port');
  const raw = i >= 0 ? argv[i + 1] : env.TCB_PORT || '3000';
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Bad port "${raw ?? ''}": use --port <1-65535> (or TCB_PORT).`);
  }
  return { noPhotos: argv.includes('--no-photos') || env.TCB_NO_PHOTOS === '1', port };
}

/** Opens the database read-only (if it exists) and listens on 127.0.0.1 only. */
export async function startServer({ port, noPhotos = false, staticDir = STATIC_DIR }) {
  const config = loadConfig();
  const db = existsSync(DB_PATH) ? openDb(DB_PATH, { readOnly: true }) : null;
  const app = buildApp({ db, config, noPhotos, staticDir });
  try {
    await app.listen({ host: '127.0.0.1', port });
  } catch (err) {
    db?.close();
    if (err.code === 'EADDRINUSE') {
      throw new Error(
        `Port ${port} is already in use: the UI is probably already running (open http://localhost:${port}), ` +
          'or stop the other program. To use another port: npm run ui -- --port 3001',
      );
    }
    throw err;
  }
  console.log(db ? `Database: ${DB_PATH} (read-only)` : `No database at ${DB_PATH}. Run "npm run import" first.`);
  if (noPhotos) console.log('Photos are hidden (--no-photos).');
  return app;
}
