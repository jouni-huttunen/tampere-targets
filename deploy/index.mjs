// npm run deploy [-- --dry-run]
// Publishes a copy of the UI with the current local data to Azure Storage static website
// hosting ($web). The local database stays the master: nothing is read back from Azure.
// Settings come from .env (git-ignored). --dry-run builds and exports into dist/site and stops.
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { DB_PATH, ROOT, loadConfig } from '../src/config.mjs';
import { openDb } from '../src/db.mjs';
import { blobClient, compressible, eachLimited, readSettings } from './blob.mjs';
import { buildWeb, exportData, listFiles, staleBlobs, uploadOrder } from './site.mjs';

export const SITE_DIR = path.join(ROOT, 'dist', 'site');
const PARALLEL = 8;

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function main(argv = process.argv.slice(2)) {
  const dryRun = argv.includes('--dry-run');
  const envFile = path.join(ROOT, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const settings = readSettings(process.env, { dryRun });

  if (!existsSync(DB_PATH)) throw new Error(`No database at ${DB_PATH}. Run "npm run import" first.`);
  const config = loadConfig();
  const db = openDb(DB_PATH, { readOnly: true });

  console.log('Building the web app (static data mode)…');
  rmSync(SITE_DIR, { recursive: true, force: true });
  await buildWeb({ root: ROOT, outDir: SITE_DIR });
  console.log('Exporting the data from the local database…');
  let exported;
  try {
    exported = await exportData({ db, config, outDir: SITE_DIR });
  } finally {
    db.close();
  }
  const files = listFiles(SITE_DIR);
  const total = files.reduce((n, f) => n + f.size, 0);
  console.log(`Site ready in ${SITE_DIR}: ${files.length} files, ${mb(total)}, ${exported.listings} listings.`);

  if (dryRun) {
    console.log('Dry run: nothing was uploaded.');
    return;
  }

  const client = blobClient(settings);
  console.log(`Uploading to ${settings.account} / ${settings.container}…`);
  let existing = null;
  try {
    existing = await client.list();
  } catch (err) {
    console.warn(`Could not list the container, so old files will not be cleaned up: ${err.message}`);
  }
  let done = 0;
  let raw = 0;
  let sent = 0;
  const names = uploadOrder(files.map((f) => f.name));
  const index = names.filter((n) => n === 'index.html');
  const rest = names.filter((n) => n !== 'index.html');
  const upload = async (name) => {
    const data = readFileSync(path.join(SITE_DIR, name));
    const gzip = compressible(name);
    const body = gzip ? gzipSync(data, { level: 9 }) : data;
    raw += data.length;
    sent += body.length;
    await client.put(name, body, { encoding: gzip ? 'gzip' : null });
    done++;
    if (done % 100 === 0) console.log(`  ${done} / ${names.length}`);
  };
  await eachLimited(rest, PARALLEL, upload);
  for (const name of index) await upload(name); // last: the new page only once its files are there
  console.log(`Uploaded ${done} files: ${mb(sent)} (${mb(raw)} before gzip).`);

  if (existing) {
    const stale = staleBlobs(existing, names);
    await eachLimited(stale, PARALLEL, (name) => client.remove(name));
    if (stale.length) console.log(`Removed ${stale.length} old files.`);
  }
  console.log(settings.siteUrl ? `Done: ${settings.siteUrl}` : 'Done. Set SITE_URL in .env to see the address here.');
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
