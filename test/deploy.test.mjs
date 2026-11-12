// npm run deploy helpers: settings, Blob REST calls (against a fake fetch, no network), the
// static data export (SYNTHETIC database) and the static-data URL mapping in the web client.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  blobClient,
  blobUrl,
  cacheControl,
  contentType,
  eachLimited,
  parseBlobList,
  readSettings,
} from '../deploy/blob.mjs';
import { exportData, listFiles, staleBlobs, uploadOrder } from '../deploy/site.mjs';
import { importCapture } from '../src/import.mjs';
import { staticPath } from '../web/src/lib/api.js';
import { makeCapture, makeCard, makeDetail, memoryDb, testConfig } from './helpers.mjs';

const SAS = 'sv=2024-11-04&ss=b&srt=co&sp=racwdl&se=2099-01-01T00:00:00Z&spr=https&sig=SECRETSIG%3D';
const SETTINGS = { account: 'tamperetest', container: '$web', sas: SAS };

test('readSettings: placeholders and bad values give a clear message; dry run needs no Azure values', () => {
  const placeholders = {
    AZURE_STORAGE_ACCOUNT: '<storage-account-name>',
    AZURE_STORAGE_CONTAINER: '$web',
    AZURE_STORAGE_SAS: '<sas-token>',
    SITE_URL: 'https://<storage-account-name>.<zone>.web.core.windows.net',
  };
  assert.throws(() => readSettings(placeholders), /Fill in AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_SAS/);
  assert.deepEqual(readSettings(placeholders, { dryRun: true }), { account: null, container: '$web', sas: null, siteUrl: null });

  const good = readSettings({ AZURE_STORAGE_ACCOUNT: 'tamperetest', AZURE_STORAGE_SAS: `?${SAS}`, SITE_URL: 'https://x.z1.web.core.windows.net' });
  assert.equal(good.sas, SAS, 'a leading ? is dropped');
  assert.equal(good.container, '$web', 'the container defaults to $web');

  assert.throws(() => readSettings({ AZURE_STORAGE_ACCOUNT: 'https://x.blob.core.windows.net', AZURE_STORAGE_SAS: SAS }), /account name only/);
  assert.throws(() => readSettings({ AZURE_STORAGE_ACCOUNT: 'tamperetest', AZURE_STORAGE_SAS: 'sv=1&sp=r' }), /no sig=/);
  assert.throws(
    () => readSettings({ AZURE_STORAGE_ACCOUNT: 'tamperetest', AZURE_STORAGE_SAS: 'sp=racwdl&se=2020-01-01T00:00:00Z&sig=x' }),
    /expired on 2020-01-01/,
  );
});

test('blob URLs, content types and caching', () => {
  assert.equal(
    blobUrl(SETTINGS, 'api/listings/12.json'),
    `https://tamperetest.blob.core.windows.net/$web/api/listings/12.json?${SAS}`,
  );
  assert.equal(blobUrl(SETTINGS, 'a b/ä.txt').split('?')[0], 'https://tamperetest.blob.core.windows.net/$web/a%20b/%C3%A4.txt');
  assert.equal(blobUrl(SETTINGS, '', 'restype=container&comp=list'), `https://tamperetest.blob.core.windows.net/$web?restype=container&comp=list&${SAS}`);
  assert.equal(contentType('index.html'), 'text/html; charset=utf-8');
  assert.equal(contentType('assets/index-x.JS'), 'text/javascript; charset=utf-8');
  assert.equal(contentType('postal-areas.geojson'), 'application/geo+json');
  assert.equal(contentType('assets/f.woff2'), 'font/woff2');
  assert.equal(contentType('weird.bin'), 'application/octet-stream');
  assert.equal(cacheControl('assets/index-x.js'), 'public, max-age=31536000, immutable');
  assert.equal(cacheControl('api/listings.json'), 'no-cache');
  assert.equal(cacheControl('index.html'), 'no-cache');
});

test('parseBlobList reads names (XML entities decoded) and the continuation marker', () => {
  const xml = `<?xml version="1.0"?><EnumerationResults><Blobs>
    <Blob><Name>index.html</Name><Properties/></Blob>
    <Blob><Name>a&amp;b.json</Name></Blob>
  </Blobs><NextMarker>2!abc</NextMarker></EnumerationResults>`;
  assert.deepEqual(parseBlobList(xml), { names: ['index.html', 'a&b.json'], next: '2!abc' });
  assert.deepEqual(parseBlobList('<EnumerationResults><Blobs/><NextMarker/></EnumerationResults>'), { names: [], next: null });
});

function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, ...init });
    const r = handler(url, init, calls.length) ?? {};
    return new Response(r.body ?? '', { status: r.status ?? 201, headers: r.headers ?? {} });
  };
  return { fn, calls };
}

test('blob client: PUT headers, paged list, DELETE 404 is fine, retries 5xx, never shows the SAS', async () => {
  const { fn, calls } = fakeFetch((url, init) => {
    if (init.method === 'GET') {
      return url.includes('marker=')
        ? { status: 200, body: '<EnumerationResults><Blobs><Blob><Name>b</Name></Blob></Blobs><NextMarker/></EnumerationResults>' }
        : { status: 200, body: '<EnumerationResults><Blobs><Blob><Name>a</Name></Blob></Blobs><NextMarker>m1</NextMarker></EnumerationResults>' };
    }
    if (init.method === 'DELETE') return { status: 404 };
    return { status: 201 };
  });
  const client = blobClient(SETTINGS, { fetchImpl: fn, wait: async () => {} });

  await client.put('assets/app.js', Buffer.from('x'));
  const put = calls[0];
  assert.equal(put.method, 'PUT');
  assert.equal(put.headers['x-ms-blob-type'], 'BlockBlob');
  assert.equal(put.headers['x-ms-blob-content-type'], 'text/javascript; charset=utf-8');
  assert.equal(put.headers['x-ms-blob-cache-control'], 'public, max-age=31536000, immutable');
  assert.ok(put.headers['x-ms-version']);

  assert.deepEqual(await client.list(), ['a', 'b']);
  assert.match(calls[2].url, /marker=m1/);
  await client.remove('gone.json'); // 404: already gone, no error

  let n = 0;
  const flaky = fakeFetch(() => (++n < 3 ? { status: 503 } : { status: 201 }));
  await blobClient(SETTINGS, { fetchImpl: flaky.fn, wait: async () => {} }).put('x.json', 'x');
  assert.equal(flaky.calls.length, 3, 'two retries after 503');

  const denied = fakeFetch(() => ({ status: 403, headers: { 'x-ms-error-code': 'AuthorizationPermissionMismatch' } }));
  await assert.rejects(
    blobClient(SETTINGS, { fetchImpl: denied.fn, wait: async () => {} }).put('x.json', 'x'),
    (err) => {
      assert.match(err.message, /PUT x\.json: 403 AuthorizationPermissionMismatch/);
      assert.match(err.message, /SAS token/);
      assert.doesNotMatch(err.message, /SECRETSIG|sig=/, 'the token never appears in errors');
      return true;
    },
  );
});

test('eachLimited runs everything with bounded parallelism', async () => {
  let running = 0;
  let peak = 0;
  const seen = [];
  await eachLimited([1, 2, 3, 4, 5, 6, 7], 3, async (i) => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 2));
    seen.push(i);
    running--;
  });
  assert.equal(seen.length, 7);
  assert.ok(peak <= 3);
});

test('upload order puts hashed assets first and index.html last; stale blobs are the leftovers', () => {
  assert.deepEqual(uploadOrder(['index.html', 'api/meta.json', 'assets/b.js', 'robots.txt', 'assets/a.css']), [
    'assets/a.css',
    'assets/b.js',
    'api/meta.json',
    'robots.txt',
    'index.html',
  ]);
  assert.deepEqual(staleBlobs(['index.html', 'assets/old.js', 'api/listings/9.json'], ['index.html', 'assets/new.js']), [
    'api/listings/9.json',
    'assets/old.js',
  ]);
});

test('staticPath maps API routes to the exported JSON files', () => {
  assert.equal(staticPath('/api/meta'), '/api/meta.json');
  assert.equal(staticPath('/api/listings'), '/api/listings.json');
  assert.equal(staticPath('/api/listings/24760731'), '/api/listings/24760731.json');
  assert.equal(staticPath('/api/listings/'), '/api/listings.json');
  assert.equal(staticPath('/api/raw/24760731'), '/api/raw/24760731.json');
});

test('exportData writes meta, the list, one file per listing (removed ones too) and robots.txt', async () => {
  const config = testConfig();
  const db = memoryDb(config);
  importCapture(
    db,
    makeCapture({ startedAt: '2026-11-10T08:00:00.000Z', cards: [makeCard(1), makeCard(2)], details: { 1: makeDetail(1), 2: makeDetail(2) } }),
    config,
  );
  importCapture(
    db,
    makeCapture({ startedAt: '2026-11-11T08:00:00.000Z', cards: [makeCard(1), makeCard(3)], details: { 3: makeDetail(3) } }),
    config,
  );
  const out = mkdtempSync(path.join(os.tmpdir(), 'tcb-site-'));
  try {
    const result = await exportData({ db, config, outDir: out });
    assert.equal(result.listings, 3);
    const list = JSON.parse(readFileSync(path.join(out, 'api', 'listings.json'), 'utf8'));
    assert.deepEqual(list.map((l) => l.card_id), [1, 2, 3]);
    assert.equal(list.find((l) => l.card_id === 2).removed, true);
    assert.equal(list.find((l) => l.card_id === 3).is_new, true);
    const detail = JSON.parse(readFileSync(path.join(out, 'api', 'listings', '1.json'), 'utf8'));
    assert.equal(detail.card_id, 1);
    assert.ok(!('raw' in detail), 'the detail has no raw JSON, as the local server sends it');
    const raw = JSON.parse(readFileSync(path.join(out, 'api', 'raw', '1.json'), 'utf8'));
    assert.equal(raw.detail.cardId, 1, 'the raw JSON is a file of its own, loaded on request');
    const meta = JSON.parse(readFileSync(path.join(out, 'api', 'meta.json'), 'utf8'));
    assert.equal(meta.noPhotos, false);
    assert.equal(readFileSync(path.join(out, 'robots.txt'), 'utf8'), 'User-agent: *\nDisallow: /\n');
    assert.deepEqual(
      listFiles(out).map((f) => f.name).sort(),
      [
        'api/listings.json', 'api/listings/1.json', 'api/listings/2.json', 'api/listings/3.json', 'api/meta.json',
        'api/raw/1.json', 'api/raw/2.json', 'api/raw/3.json', 'robots.txt',
      ],
    );
    assert.ok(existsSync(path.join(out, 'api', 'listings', '3.json')));
  } finally {
    rmSync(out, { recursive: true, force: true });
    db.close();
  }
});

test('gzip: text files are stored gzipped with Content-Encoding, fonts and images as they are', async () => {
  const { compressible } = await import('../deploy/blob.mjs');
  for (const n of ['index.html', 'assets/a.js', 'assets/a.css', 'api/listings.json', 'postal-areas.geojson', 'robots.txt', 'x.svg']) {
    assert.equal(compressible(n), true, n);
  }
  for (const n of ['assets/f.woff2', 'assets/f.woff', 'a.png', 'a.jpg', 'blob.bin']) assert.equal(compressible(n), false, n);

  const { fn, calls } = fakeFetch(() => ({ status: 201 }));
  const client = blobClient(SETTINGS, { fetchImpl: fn, wait: async () => {} });
  await client.put('api/meta.json', Buffer.from('x'), { encoding: 'gzip' });
  await client.put('assets/f.woff2', Buffer.from('x'));
  assert.equal(calls[0].headers['x-ms-blob-content-encoding'], 'gzip');
  assert.equal('x-ms-blob-content-encoding' in calls[1].headers, false);
});
