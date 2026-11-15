# 03 · Design

_Implements [01-requirements.md](01-requirements.md) against the source described in [02-data-source.md](02-data-source.md). This folder is the single source of truth._

## 1. Architecture
```
            USER'S PC                                   USER'S BROWSER (Chrome / Edge)
 ┌──────────────────────────────┐   clipboard    ┌──────────────────────────────────────┐
 │ npm run capture              │ ─────────────▶ │ DevTools console on asunnot.oikotie.fi│
 │  build.mjs: config + DB state│                │  capture script: search → details     │
 │  → dist/capture.js           │                │  one request / ~0.9 s, progress panel │
 └──────────────────────────────┘                └───────────────────┬──────────────────┘
                                                                     │ file download
 ┌──────────────────────────────┐   Downloads\oikotie-<UTC>.json     │
 │ npm run import               │ ◀──────────────────────────────────┘
 │  normalize → SQLite          │
 │  data/listings.db + report   │
 └──────────────┬───────────────┘
                │ read-only
 ┌──────────────▼───────────────┐
 │ CLI · npm run rebuild        │
 │ npm run ui → localhost:3000  │  Fastify JSON API + React map/list UI
 └──────────────────────────────┘
```
Three facts shape this:
1. Oikotie answers only a real browser, so the fetching runs **in the user's browser tab**.
2. Oikotie's CSP blocks the page from reaching `localhost`, so data crosses to Node as a **downloaded file**.
3. The browser script can't read the database, so the **database state it needs is built into the script** each time.

## 2. File layout
```
.nvmrc                   26.13.0
package.json             type: module · engines: node >= 26 · scripts below
config.json              areas, filters, places, window cutoff, pacing, refresh ages
README.md                commands for everyday use
CLAUDE.md                rules and read order for AI agents
HANDOFF.md               current state, open items, what is next
CHANGELOG.md             what each release contains
docs/                    this spec
src/shared/*.mjs         pure functions for BOTH Node and the browser script:
                         hash.mjs (FNV-1a, cardHash), plan.mjs (planRun, detailsDue),
                         search.mjs (searchUrl, detailUrl, fileStamp)
src/capture/browser.js   in-page logic: tokens, paging, details, pacing, panel, stop, download
src/capture/build.mjs    npm run capture: inline shared + config + DB state → dist/capture.js, clipboard
src/config.mjs           load and validate config.json; paths (DB_PATH, REPORTS_DIR)
src/time.mjs             UTC / Europe/Helsinki conversion (Node side only)
src/db.mjs               open DB, schema + migrations, views, upserts, versions, change log
src/normalize.mjs        API JSON → listing row (typed columns, UTC timestamps, distances)
src/import.mjs           npm run import: capture file → DB, then report
src/rebuild.mjs          npm run rebuild: recompute columns from stored JSON, offline
src/report.mjs           reports/YYYY-MM-DD.md
src/cli.mjs              list window|new|removed · show <id> · sql "<query>" · export <dir>
src/infra.mjs            npm run infra: stops (GTFS) + stores (Overpass) → web/public/infra.json
src/infra/zip.mjs        minimal ZIP reader (central directory, inflate; no ZIP64)
src/infra/gtfs.mjs       CSV parsing, tram/bus per stop from route types, stops in the box
src/infra/stores.mjs     chosen chains (brand or name) and Alko, store names, Overpass query
test/*.test.mjs          node:test, synthetic fixtures in test/fixtures/
server/app.mjs           Fastify app: read-only JSON API (row shaping) + serves web/dist
server/start.mjs         shared start-up: open DB read-only, listen on 127.0.0.1, --no-photos / --port
server/index.mjs         npm run ui entry (port 3000)
server/dev.mjs           npm run ui:dev entry (API on 3001 + Vite on 5173)
deploy/index.mjs         npm run deploy: build + export to dist/site, upload to Azure Storage ($web)
deploy/site.mjs          static export of the API answers (Fastify inject), static-data Vite build
deploy/blob.mjs          Blob REST over fetch with a SAS token: settings, PUT/DELETE/list, retries
.env                     git-ignored: Azure account, container, SAS token, site URL (placeholders)
web/                     React + Vite SPA: vite.config.mjs, index.html,
                         src/{App,main}.jsx, src/components/*,
                         src/lib/{filters,format,api,spread,shortlist,hours,…}.js,
                         src/styles/{tokens,app}.css, public/postal-areas.geojson,
                         public/infra.json (committed: stops and stores, public open data)
data/ reports/ dist/ web/dist/ .env      git-ignored
```

**npm scripts**

| Script | Does |
|---|---|
| `capture` | `node src/capture/build.mjs`. Options after `--`: `--full` (force a full sweep), `--max-details N` (cap details for this run, e.g. a 5-detail trial), `--no-clipboard` |
| `import` | `node src/import.mjs [file]` |
| `rebuild` | `node src/rebuild.mjs` |
| `list` | `node src/cli.mjs list window` |
| `report` | `node src/report.mjs` (re-writes the latest run's report) |
| `infra` | `node src/infra.mjs`: refreshes `web/public/infra.json` (FR-45). Options after `--`: `--dry-run`, `--gtfs <zip>`, `--osm <json>`, `--out <file>` |
| `test` | `node --test "test/*.test.mjs"` |
| `ui` | `vite build --config web/vite.config.mjs && node server/index.mjs`: builds `web/` and serves it plus the API on `http://localhost:3000`. Options after `--`: `--no-photos` (placeholders instead of Oikotie photos; used for agent previews), `--port N` |
| `ui:build` | Only the Vite build (into `web/dist`) |
| `ui:dev` | `node server/dev.mjs`: API on 127.0.0.1:3001 plus Vite with hot reload on `http://localhost:5173`, `/api` proxied to the API |
| `deploy` | `node deploy/index.mjs`: builds the hosted copy into `dist/site` and uploads it to Azure Storage (§8.4). `-- --dry-run` builds only. Named `deploy`, not `publish`, so it is never confused with `npm publish` |

`node:sqlite` in Node 26.13.0 prints no experimental warning, so no flag is needed.

**Environment overrides** (used by the dry runs; normally unset): `TCB_DB` (database file, default `data/listings.db`), `TCB_REPORTS` (report folder, default `reports/`), and for the UI server `TCB_NO_PHOTOS=1` (same as `--no-photos`) and `TCB_PORT`.

`config.json` is validated on load; among other checks, `capture.delayMs` below 500 is refused, so the polite-pacing rule can't be loosened by accident.

## 3. Configuration (`config.json`)
```json
{
  "areas": [ { "zip": "33100", "id": 154182, "lat": 61.491623, "lon": 23.783517 }, "… 17 in total" ],
  "filters": { "cardType": 101, "sizeMin": 20, "priceMax": 1400 },
  "places": [
    { "key": "centre",  "name": "Keskustori",              "lat": 61.4978, "lon": 23.7610 },
    { "key": "station", "name": "Tampere railway station", "lat": 61.4983, "lon": 23.7737 }
  ],
  "windowCutoff": "2027-02-01",
  "capture": { "delayMs": 500, "jitterMs": 800, "pageSize": 100, "maxDetails": 600 },
  "refresh": { "fullSweepEveryDays": 1, "maxGapDays": 7, "windowDays": 2, "otherDays": 14 }
}
```
- An area's optional `lat`/`lon` is its postal-code centre (Oikotie's own point). Listings without a real location are placed there, with `location_approx = 1`.
- Each place produces a column `dist_<key>_km`. Adding a place and running `npm run rebuild` fills it offline.
- An area without an `id` is resolved at build time from stored listings (`address.zipCode.cardId`); if none is found the build stops with a message.
- Area names (for the UI) come from the Paavo polygons' `nimi` property, not from this file.

## 4. Database schema
SQLite at `data/listings.db`, opened with `node:sqlite` (`DatabaseSync`). Schema version is tracked in `PRAGMA user_version`. All timestamps are UTC ISO 8601 text; dates are `YYYY-MM-DD` text.

```sql
CREATE TABLE runs (
  run_id           INTEGER PRIMARY KEY,
  capture_id       TEXT NOT NULL UNIQUE,     -- from the capture file; makes import idempotent
  started_at       TEXT NOT NULL,            -- capture start
  finished_at      TEXT,
  imported_at      TEXT NOT NULL,
  mode             TEXT NOT NULL,            -- 'full' | 'incremental'
  age_filter       INTEGER,                  -- 1 | 2 | 4 | NULL
  sweep_complete   INTEGER NOT NULL,         -- 1 = every planned search page fetched and count = found
  is_initial       INTEGER NOT NULL,         -- 1 = no complete full sweep existed before this run
  found            INTEGER,
  search_requests  INTEGER, detail_requests INTEGER,
  new_count        INTEGER, changed_count INTEGER, removed_count INTEGER, error_count INTEGER,
  status           TEXT NOT NULL,            -- 'ok' | 'partial' | 'incomplete'
  stopped_reason   TEXT                      -- NULL | 'user' | 'http-403' | 'http-429' | 'auth' | 'error'
);

CREATE TABLE listings (
  card_id            INTEGER PRIMARY KEY,
  url                TEXT,
  status             INTEGER,
  first_seen_at      TEXT NOT NULL,
  first_seen_run_id  INTEGER NOT NULL REFERENCES runs(run_id),
  last_seen_at       TEXT NOT NULL,
  removed_at         TEXT,
  published_at       TEXT, published_sort_at TEXT, price_changed_at TEXT,
  address TEXT, district TEXT, zip TEXT, lat REAL, lon REAL,
  dist_centre_km REAL, dist_station_km REAL,            -- one per config place
  rent_eur REAL, size_m2 REAL, rooms INTEGER, room_config TEXT,
  build_year INTEGER, building_type INTEGER, floor INTEGER, floor_count INTEGER,
  available_date TEXT, availability_text TEXT, lease_text TEXT,
  deposit_eur REAL, water_fee TEXT, electric_fee TEXT,
  pets_allowed TEXT, furnished TEXT, company_name TEXT,
  search_json TEXT, search_hash TEXT, search_fetched_at TEXT,
  detail_json TEXT, detail_hash TEXT, detail_fetched_at TEXT
);
-- migration 2: location_approx INTEGER NOT NULL DEFAULT 0   -- 1 = lat/lon is the postal-code centre
CREATE INDEX listings_zip ON listings(zip);
CREATE INDEX listings_removed ON listings(removed_at);

CREATE TABLE listing_versions (             -- one row per distinct detail content
  card_id INTEGER NOT NULL, fetched_at TEXT NOT NULL, run_id INTEGER NOT NULL,
  detail_hash TEXT NOT NULL, detail_json TEXT NOT NULL,
  PRIMARY KEY (card_id, fetched_at)
);

CREATE TABLE listing_changes (
  change_id INTEGER PRIMARY KEY,
  card_id INTEGER NOT NULL, run_id INTEGER NOT NULL, changed_at TEXT NOT NULL,
  field TEXT NOT NULL,                      -- rent_eur | available_date | lease_text | status | removed
  old TEXT, new TEXT
);

CREATE VIEW v_active AS SELECT * FROM listings WHERE removed_at IS NULL;

CREATE VIEW v_window AS                     -- cutoff comes from config.windowCutoff
  SELECT * FROM v_active WHERE available_date IS NULL OR available_date < '2027-02-01';

```
Views are dropped and recreated whenever the database is opened for writing, so a changed `windowCutoff` takes effect on the next import or rebuild.

Field sources are in [02-data-source.md §6](02-data-source.md#6-field-reference).

## 5. Shared logic (`src/shared`)
Pure functions with no I/O, imported by Node and inlined into the browser script, so both sides compute the same results.

### 5.1 Card hash
`cardHash(card)` = FNV-1a 32-bit, as 8 hex digits, over
```js
JSON.stringify([ data.price, data.size, data.sizeMin, data.rooms, data.description, data.buildYear,
                 location.address, location.zipCode, meta.published, meta.publishedSort,
                 meta.priceChanged, status, medias[0]?.imageLargeJPEG ?? null, medias.length ])
```
`visits` and `visitsWeekly` are never included. Missing values hash as `null`.

### 5.2 Run planning
`planRun(state, config, now, { forceFull })` returns `{ mode, ageFilter }`:

| Condition (first match wins) | Result |
|---|---|
| `forceFull`, or no `lastRunStartedAt` | full |
| no `lastFullSweepAt`, or it is older than `fullSweepEveryDays` | full |
| gap since `lastRunStartedAt` > `maxGapDays` (7) | full |
| gap + 2 h ≤ 24 h | incremental, `published=1` |
| gap + 2 h ≤ 48 h | incremental, `published=2` |
| otherwise | incremental, `published=4` |

With `fullSweepEveryDays = 1`, incremental runs happen only when the user captures more than once a day.

### 5.3 Details due
`detailsDue(cards, state, config, now, { onlySeen })` returns an ordered list of card ids (the capture script then cuts it at `maxDetails` and records both numbers in the file):
1. cards not in `state.known` (new);
2. cards whose hash differs from the stored one (changed);
3. known listings with no detail yet;
4. known listings in the window whose detail is older than `windowDays` (2);
5. other known listings whose detail is older than `otherDays` (14).

Groups 3–5 are taken from `state.known`, so they are refreshed even when an incremental search didn't return them. With `onlySeen` (set after a complete full sweep), known listings the sweep did not return are skipped: the importer is about to mark them removed, so fetching them would waste requests.

## 6. Capture script
### 6.1 Build (`npm run capture`)
`build.mjs` opens the database read-only (or treats a missing one as empty), then writes `dist/capture.js`: one IIFE containing the shared functions, `browser.js`, and two constants.

**State**
```json
{ "generatedAt": "ISO", "lastRunStartedAt": "ISO|null", "lastFullSweepAt": "ISO|null", "forceFull": false,
  "known": { "<cardId>": ["<searchHash>", "<detailFetchedAtISO|null>", 1] } }
```
- `known` holds active listings only; the third element is 1 when the listing is in `v_window`.
- `lastRunStartedAt` is the latest run with `sweep_complete = 1`; `lastFullSweepAt` the latest such run with `mode = 'full'`.

**Config:** areas as `[[id,5,"zip"]]`, `sizeMin`, `priceMax`, and the `capture` and `refresh` blocks.

The file is copied to the clipboard with `Set-Clipboard` (falling back to `clip`). The command prints what the run will do ("full sweep, about 381 details, about 13 min") and the paste instructions.

### 6.2 In the page
1. **Checks:** hostname is `asunnot.oikotie.fi`; no other capture is running (`window.__tcbCapture`); the three meta tags exist. Otherwise: a message, and no request.
2. **Plan** with `planRun`, using the browser's clock.
3. **Search:** fetch pages at `offset = 0, 100, …` until `cards.length ≥ found` or a page comes back empty. Cards are de-duplicated by `cardId`.
4. **Details:** `detailsDue`, then `GET /api/card/{id}` for each.
5. **Finish:** build the capture object, download it as a Blob through a temporary `<a download>`, show a summary in the panel.

Requests are same-origin `fetch` calls with the three `OTA-*` headers, strictly sequential, each followed by a wait of `delayMs + random(0…jitterMs)`.

**Panel:** a small fixed card (top right) with mode, "pages 2/4", "details 37/381", elapsed and estimated remaining time, error count, a "keep this tab in front" note and a **Stop** button. `captureStop()` in the console does the same as the button.

### 6.3 Error handling in the capture
| Event | Reaction |
|---|---|
| HTTP 403 or 429 | Stop at once, download what was collected, `stoppedReason: "http-403"` / `"http-429"` |
| HTTP 401 | Re-read the meta tags, retry once; if it fails again, stop with `"auth"` |
| HTTP 404 on a detail | Record it (`status: 404`, `json: null`) and continue; the importer marks the listing removed |
| HTTP 5xx or network error | Retry up to 3 times, waiting 5 s, 15 s, 45 s. Then: on a detail, log the error and continue; on a search page, stop with `"error"` |
| 5 failed details in a row | Stop with `"error"` |
| Invalid JSON | Treated as a network error |
| User stop | Let the request in flight finish, then download, `stoppedReason: "user"` |
| Tab closed or reloaded | The run is lost; nothing is imported. Re-run. |

### 6.4 Capture file
`oikotie-<UTC timestamp>.json`, e.g. `oikotie-20261111T081530Z.json`, about 8 MB for a full run:
```json
{ "format": "tampere-city-boy/oikotie-capture@1", "captureId": "<uuid>",
  "startedAt": "ISO", "finishedAt": "ISO", "mode": "full|incremental", "ageFilter": null,
  "planReason": "first run", "sweepComplete": true, "found": 381,
  "detailsDue": 381, "detailsPlanned": 381, "stoppedReason": null,
  "config": { "areas": [], "sizeMin": 20, "priceMax": 1400 },
  "searchCards": [ { "fetchedAt": "ISO", "card": { } } ],
  "details": { "<cardId>": { "fetchedAt": "ISO", "status": 200, "json": { } } },
  "requests": [ { "at": "ISO", "url": "/api/…", "status": 200, "ms": 312 } ],
  "errors": [ { "at": "ISO", "url": "/api/…", "status": 500, "message": "…" } ] }
```
- `sweepComplete` is true only if every page of the planned search was fetched **and** the number of distinct cards equals `found`. It applies to both modes.
- `detailsDue` is how many details were due; `detailsPlanned` is how many this run tried after the `maxDetails` cap. The importer uses `detailsDue` to tell `ok` from `partial`.
- If the download doesn't appear, `captureDownload()` in the console downloads the same file again.

## 7. Import (`npm run import [file]`)
Everything below runs in **one transaction**; any failure rolls back and leaves the database as it was.

1. **Pick the file:** the argument, or the newest `oikotie-*.json` in `%USERPROFILE%\Downloads`. Print its name.
2. **Validate:** `format` must be `…oikotie-capture@1`; required keys present. Otherwise stop.
3. **Idempotency:** if `captureId` is already in `runs`, print "already imported" and exit successfully.
4. **Run row:** insert with `is_initial = 1` when no earlier run has `mode = 'full' AND sweep_complete = 1` (so a first capture stopped during the search does not make the next run flag most listings as new).
5. **Search cards**, each one:
   - new `card_id` → insert, `first_seen_at` = the card's `fetchedAt`, `first_seen_run_id` = this run;
   - existing → update card-derived columns, `search_json`, `search_hash`, `search_fetched_at`;
   - always set `last_seen_at`; if `removed_at` was set, clear it and log `removed: <time> → NULL`.
6. **Details**, each one:
   - `status 200` and JSON `status = 1` → compute `detail_hash` (SHA-256 of `JSON.stringify` of the detail JSON). If it differs from the stored hash: add a `listing_versions` row and update the detail-derived columns. Always set `detail_fetched_at`.
   - `status 404`, or JSON `status ≠ 1` → set `removed_at` = the detail's `fetchedAt`, log the removal.
   - **Safety net:** "status ≠ 1 means removed" rests on a small sample of real data. If more than half of a capture's details (and more than 3) have a status other than 1, the importer distrusts the rule, removes nothing because of it, and prints a warning.
   - A detail for a listing with no row yet (e.g. the database was recreated after the script was built) is kept as a new listing rather than dropped.
7. **Sweep removals:** only if `mode = 'full'` and `sweepComplete`: every active listing absent from `searchCards` gets `removed_at` = the run's `startedAt`, with a change-log row.
8. **Change log:** wherever step 5 or 6 changed `rent_eur`, `available_date`, `lease_text` or `status`, add a `listing_changes` row (old → new).
9. **Finish the run row:** counts, and `status` = `ok` (search complete, all due details fetched), `partial` (search complete, details cut short) or `incomplete` (search not complete).
10. **Commit, then write the report** and print a summary (new / changed / removed / window count).

**Normalising** (`normalize.mjs`) is a pure function `(searchCard, detail, config) → row`, used by both import and rebuild. It parses "1 170 € / kk" and "42 m²" style strings, converts timestamps to UTC ([02 §5](02-data-source.md#5-timestamps)), and computes haversine distances to each place.

**Rebuild** (`npm run rebuild`) runs migrations, then re-runs `normalize` over every stored `search_json` + `detail_json` and rewrites the extracted columns. It never touches the raw JSON, run history, versions or change log, and needs no network.

**Report** (`reports/YYYY-MM-DD-run-<id>.md`, one file per run, dated in Helsinki time): run summary (with the run log's new / changed / removed counts); rent, availability, lease and status changes; removals; listings that came back.

**CLI** (`node src/cli.mjs …`)

| Command | Output |
|---|---|
| `list window` / `list removed` / `list all` | A table: id, district, address, m², rooms, rent, build year, available, km to centre |
| `show <id>` | Every extracted column (timestamps also in Helsinki time) plus lease-related `adData` fields |
| `sql "<query>"` | Runs a query and prints the rows. The CLI opens the database read-only, so a write fails |
| `export <dir>` | Writes `<id>.search.json` and `<id>.detail.json` for every listing |

## 8. Web UI
### 8.1 Server (`server/app.mjs`, started by `server/index.mjs`)
Fastify, listening on `127.0.0.1:3000` only, database opened read-only (`openDb(DB_PATH, { readOnly: true })`), no write routes. `buildApp({ db, config, noPhotos, staticDir })` is pure enough to test with `inject` (no port).

| Route | Returns |
|---|---|
| `GET /api/listings` | All listings (removed ones too, flagged), ordered by id: every extracted column except `*_json` and `*_hash`, plus `removed`, `dist: {centre, station}`, `location_approx`, `housing_types` (FR-49: the distinct integer codes of `detail_json` `adData.aiHabitationRentTypes`, sorted; `[]` when there are none), `photo_count` (the detail's photos, as in the detail route, so the profile can reserve its thumbnail strip before the details load) and `pets_allowed`/`furnished` as `true`/`false`/`null` (both `'1'/'0'` and `'true'/'false'` are read), `thumb_url` (`search_json` `medias[0].imageSmallJPEG`) and `thumb_large_url` (`imageLargeJPEG`). |
| `GET /api/listings/:id` | The same row plus `title`, `description`, `photos` (`detail_json` `media[]` sorted by `ordernr`: `thumb`, `large`, `full`), `photo_count`. No raw JSON (it was about three quarters of the bytes: 11.8 → 3.0 KB gzipped on average for 381 listings). 400 for a non-numeric id, 404 when unknown. |
| `GET /api/raw/:id` | `{ card_id, search, detail }`: the stored `search_json` and `detail_json`, for the profile's "Raw intel", fetched only when that section is opened. 400 / 404 as above. |
| `GET /api/meta` | `lastRun` (`startedAt`, `finishedAt`, `isInitial`, mode, status), `counts` (from `counts()`), `places`, `zips`, `windowCutoff`, `noPhotos` |
| other `/api/*` | 404 JSON |
| everything else | Static files from `web/dist`; unknown paths get `index.html`. Without a build, `/` answers with a hint to run `npm run ui`. |

Without a database file the API answers **503** `{ error: "no-database" }` and the UI shows the commands to run. With `--no-photos`, every photo URL is left out (`thumb_*` null, `photos` empty) and the UI shows placeholders, so an agent's browser never loads Oikotie's CDN; the raw JSON still contains the URLs as text. Response headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (map tile servers expect a Referer). Oikotie photos and links set `no-referrer` themselves.

### 8.2 Client (`web/`)
React + Vite. Components: `App`, `BootSequence`, `Header`, `Filters` (the mission-parameters panel), `RangeFilter`, `MapView`, `InfraLayer` (NV ground intel), `Legend`, `Radar`, `PanelRail` (a hidden side panel), `ListPanel`, `ListingCard`, `Photo`, `StarButton`, `DetailDrawer` (the target profile), `Icons`. All listings are loaded once; filtering and sorting are client-side. The pure filter, sort, median and URL logic is in `web/src/lib/filters.js`, the move-in month in `lib/movein.js`, the theme store in `lib/theme.js` (both unit-tested under Node); display formatting in `lib/format.js` (dates as 1.12.2026, times in Europe/Helsinki).

**Naming ("Tampere Targets"):** the UI speaks tactical. The user is the operator, listings are **targets**, the detail drawer is the **TARGET PROFILE**, the filters are **MISSION PARAMETERS**, the shortlist is **PRIORITY** targets, postal areas are **sectors**, Keskustori is **HQ** and the station **RAIL** (on the map and the rows; the profile spells them out: "Range to Keskustori", "Range to railway station", the user's wording), the last crawl is the **last recon**. Plain words stay where they are clearer (rent is "cost", size "area", the sort is "order"). Kept as they are on purpose: the capture format `tampere-city-boy/oikotie-capture@1` and the `tcb.*` storage keys (renaming them would break existing capture files and the saved shortlist).

**Layout (wide, ≥ 1360 px; the user runs it full screen):** a 64 px command bar, then three framed panels with 6 px gutters, left to right: **01 Mission parameters** (320 px, open unless hidden), **02 Tactical map** (flexible, in the centre of the screen) and **03 Target list** (420 px). The user chose this layout: the map gets the centre of the screen, where the eye rests and the lock and strike happen; the list stays next to the map for hover sync; the parameters sit at the left edge, read first and then left alone. The DOM order matches, so Tab moves left to right. The command bar holds the TAMPERE TARGETS wordmark (a reticle mark, a small quiet "vX.Y.Z" after the title, on its baseline for debugging, from `__APP_VERSION__` like the boot screen, and the tag "Tactical rental recon · Tampere AO") and readout boxes: Targets N / M, Priority (a button toggling "only shortlist" when > 0; hidden in the stacked layout), Median cost of the shown targets, Last recon and a live Helsinki clock; then the **NV** switch and, after it, a keyboard button for the field manual (FR-50; hidden on touch screens). M counts removed listings only while they are shown. Below 1360 px the parameters become a panel that slides out from the left edge, opened by a **Params** button in the bar (with an active-count badge and Clear), and the median and last-recon readouts are hidden; below 1100 px the tag and the clock go too; below 900 px the list stacks under the map and the parameters and the profile go full screen.

**Breakpoints (tuned for the user's Galaxy S24+, which Chrome reports as 384 × about 740 CSS px upright and 832 × about 330 sideways):** the JavaScript queries live in `lib/layout.js` (`WIDE_QUERY`, `PHONE_QUERY`, `STACKED_QUERY`, `LANDSCAPE_PHONE_QUERY`); app.css ("Narrower windows") and tokens.css repeat the values. Tiers: **≥ 1360** three columns; **< 1360** two columns with slide-out parameters; **≤ 1100** no tag or clock, compact Fit; **phone** = ≤ 900 px wide *or* held sideways (landscape and ≤ 500 px tall, whatever the width; some phones are 915–932 px wide sideways): full-screen profile, swipe between targets, legend starts folded; **stacked** = ≤ 900 px and not held sideways: the list under the map, the page scrolls, the map 52 `svh` (the height with the address bar showing, so the map and the top of the list share the first screen); **sideways phone**: a 56 px one-row header, map and list side by side at full height (list `min(420px, 46vw)`), each scrolling on its own, the profile photo letterboxed to 72 `svh` so it fits the screen; **≤ 430 px** (narrow upright phones, 360–430: S24+ 384, iPhones 390–430, Pixels 412): a two-row header (the brand alone with the version under the name; then the Targets readout, 44 px tall and only as wide as its numbers, at the left, and at the right Params (icon and name: the three-line icon alone is ambiguous; the user's choice to show the name) and NV (a 44 px icon button), right above the map; the Params badge on the button's corner, no header Clear since the panel has "Clear params"; no Priority readout in the stacked layout, the list's ★ Priority chip does the same), tighter panel heads, the order select on its own row, 68 × 48 row photos. The compact brand and the icon buttons also apply sideways. At 384 px wide the header is 108 px tall; held sideways (832 × 330) the map is 266 px tall.

**Hideable side panels (FR-46):** a 26 px « / » button (`panel-hide`, `PanelChevron`) in the title bar of 01 (wide windows only) and 03 (above 900 px, and on a phone held sideways) hides the panel; it is replaced by a `PanelRail` (`--rail-w` 34 px, framed, the whole rail a button: chevron, panel number, upright label "Params" / "Targets" (`writing-mode: vertical-rl`), and the active-filter count or the in-view count). App keeps `{ params, list }` in `lib/panels.js` (`tcb.panels.v1`, both shown by default and on bad or blocked storage) and sets `params-folded` / `list-folded` on `.app`, which switch the column variables `--params-col` / `--list-col` between the panel width and the rail; `.main`'s grid and the profile's `right` and `width` use those variables, and the grid columns transition (`--dur`, so off under reduced motion). The hidden panel is unmounted (no hidden work). A click on « or the rail moves focus to its counterpart; the keys (`KeyR` / `KeyT` by `e.code`, `KEY_ACTIONS` in lib/keys.js) do not move focus. In a window narrower than 1360 px R opens or closes the slide-out parameters; in the stacked layout the list always shows and T does nothing.

**Desktop keys (FR-47):** one `keydown` handler in App (ignored while typing, with Ctrl / Alt / Cmd and during the boot) handles Q / N (night vision), A / D and ← / → (not from a focused photo gallery, `.gallery`, which keeps them for its photos), R / T (panels), W / S and ↑ / ↓ (the arrows not from a focused list row, `.card-item`, which keeps them for moving between rows), E / M (base map), F (focus), C (fit) and H, through `keyAction` in `lib/keys.js` (key position → action; the field manual reads the same table and draws `MANUAL_ARROWS` as an arrow cluster (↑ above ← ↓ →) right of `MANUAL_ROWS`, in an 830 px dialog; Leaflet's own keyboard handler is off, `keyboard={false}`, so the arrows never pan the map). **Done fits (FR-33):** App notes the filters (without `sort`, as JSON) when the slide-out parameters open; Done (`onDone`, not Esc / outside, which call `onClose`) sets a pending fit when they differ, and once the panel is closed and the deferred filters have caught up (`deferredFilters === filters`) it bumps `fitKey`; MapView runs `fit()` on a new `fitKey`, in the render whose `located` is the new list. MapView hands App `{ fit, focus, zoom, nextBaseMap }` through the `commandsRef` prop: F calls `focus`: with a target open (and the map not hidden under a full-screen profile) it `flyTo`s the centre that puts the target's marker in the middle of `visibleArea` at `FOCUS_ZOOM` (= `BUS_MIN_ZOOM` + 2 = 17, past the dark base map's native 16, so it is upscaled; `BUS_MIN_ZOOM` 15 from InfraLayer is where night vision starts showing bus stops; 0.6 s; no animation under reduced motion; `zoomaim` for the strike), else it calls the same `fit` as the Fit button; C always calls `fit`; W / ↑ and S / ↓ call `zoom(±1)`, which snaps the new level to `zoomSnap` (so 11.2 + 1 → 12); with a target open (and the map not hidden under a full-screen profile) it calls `setView` with the centre that puts the target's marker (its true point plus its place on the building's ring, `ringOffsetOf` in `lib/spread.js`, fixed in pixels) in the middle of `visibleArea` at the new level, else `setZoomAround` on that middle; it fires `zoomaim` with that middle so the zoom strike lands there; R clicks the next radio button in the Leaflet layers control's base-map list (wrapping), so the control, the map and `baselayerchange` stay in step. Esc is each panel's own (App's handler ignores it), in their order: the field manual, an intel card (InfraLayer, capture phase), the slide-out parameters, then the profile (its Esc calls App's `onClose`, the same as ×: back in history, so the lock marker goes and Back does not reopen it). C no longer closes (2026-11-15).

**Boot sequence** (`BootSequence.jsx`, FR-36): a full-screen terminal log typed line by line (one line every 0.23 s, each typed in 0.16 s) while `/api/meta` and `/api/listings` load: the title ("Tampere Targets · tactical console vX.Y.Z": the version is `version` in package.json, injected as `__APP_VERSION__` by `web/vite.config.mjs` into the dev server, the build and the deploy, so a release only bumps package.json; a test fails on any hard-coded version in `web/src`), "Initializing tactical uplink", "Establishing secure channel · 127.0.0.1", "Encrypting session", "Acquiring GPS coordinates · 61.4978° N 23.7610° E" (the configured centre), "Decrypting target database · N targets" (waits for the data; FAIL and "Uplink lost" on an API error), "Loading sector grid · 17 sectors", "Last recon · …", "Priority targets · S", "Field manual · press H" (READY; only with a mouse or trackpad, FR-50) and "All systems armed". A radar sweep and the wordmark sit above the log, a progress bar under it. Then the screen collapses like a CRT switching off and the console **deploys**: the bar drops in, the map is revealed top-down behind a scan line, the parameters slide in from the left and the list from the right, the corner brackets settle, and the first rows come in one after another. The boot plays once per tab (`sessionStorage` key `tcb.boot.v1`); a reload only deploys. Any key or click skips it. Under `prefers-reduced-motion` neither plays.

**Map** (`react-leaflet`, centred on Keskustori, zoom 13; when the targets first arrive, MapView runs the Fit button's `fit` without animation, once per page load (the `framed` ref). It runs straight in the effect, not in `requestAnimationFrame`, which a tab in the background never runs)
- One circle marker per listing, shaded by build year in five bins (before 1960, 1960–1989, 1990–2009, 2010–2019, 2020+; deep to white-hot in the theme colour) plus a neutral shade for unknown years, with a legend. Markers are managed directly in Leaflet; colours come from CSS classes (`mk-y0…5`), so hover only toggles classes and radii. A marker's tooltip reads rent, build year, size and address ("850 €/mo · 1965 · 56 m² · Hallituskatu 25 B"), plus "(approximate location)" when the position is approximate.
- Priority targets get a thick light-amber outline (`is-saved`).
- Listings with `location_approx = 1` get a hollow, dashed marker, an "approx. position" note on the row and in the profile, and "≈" on their distances.
- Reference points for each `config.places` entry: hollow amber diamonds labelled "HQ · Keskustori" and "RAIL · Station".
- Optional overlay (off by default): **Sectors**, the 17 postal areas from `web/public/postal-areas.geojson` (Statistics Finland Paavo `pno_2026`, CC BY 4.0, credited in the attribution), in a pane below the markers, with a zip-and-name tooltip.
- **Ground intel** (FR-43, NV only; `InfraLayer.jsx`): App fetches `/infra.json` the first time NV is on and passes it to the map only while NV is on, so switching NV off removes every point, card and the attribution. Managed directly in Leaflet in its own pane `infra` (z-index 390: above the sectors and labels, under the halos (395) and the target markers (400), so a target is never covered and wins a tap where they overlap). **Stores**: a `divIcon` hexagon (hollow: dark fill `--poi-fill`, bright stroke `--poi-store`) with the group letter K, S or L in bold mono; 18 / 22 / 26 px by store size (tier 1 K-Market, Sale, Alepa; tier 2 K-Supermarket, S-market, Lidl, Alko; tier 3 K-Citymarket, Prisma). **Alko** (1.14.0): the same hexagon with an A, class `poi-alko`, in `--poi-alko` (`--hot-strong`: pale lime in NV) with `--poi-alko-glow`, so it stands apart from the mint groceries; its card badge is `intel-badge-alko`. A kicker whose group and chain are the same reads once ("Alko", "Lidl"), and a tooltip for a store named only by its chain adds the street ("Alko · Tammelankatu 25 · Closed · opens Mo 10:00"). **Tram stops**: a 16 px square with a T. **Bus stops**: an SVG `circleMarker` (radius 4, 6 on touch screens) in the pane's own renderer, so Leaflet skips those off screen. Stores and trams from zoom 13, buses from zoom 15 (`INFRA_MIN_ZOOM`, `BUS_MIN_ZOOM`, re-checked on `zoomend`). On `(hover: hover) and (pointer: fine)` each point has a `map-tip` tooltip ("K-Market Kissanmaa · Open · closes 23:00", "Tram 0805 · Keskustori A"), closed while its card is open; touch screens get no tooltips, a tap opens the card, and a transparent `::before` widens the tap area by 8 px. The **intel card** is a Leaflet popup (`intel-pop`, built with DOM nodes, never HTML strings): glass with corner brackets; stop: kicker "Tram stop" / "Bus stop", name, "Stop 0805"; store: badge and "Kesko · K-Market", name, address, status line (green dot "Open · closes 22:00", red "Closed · opens Sa 08:00", "Open 24/7", "Hours unknown"), the week grouped by equal days ("Mo–Fr 07:00–22:00") with today's row marked, and "Hours: OpenStreetMap, checked 19.8.2026". Status and today are computed when the card or tooltip opens (`lib/hours.js`: `parseOpeningHours` for the OSM subset the stores use, `helsinkiClock` via `Intl` in Europe/Helsinki, `openState`, `statusText`, `weekRows`). The card pans the map to fit (padding 72 px at the top for the map controls, 40 px at the bottom for the attribution); `ListingMarkers` treats Leaflet's `autopanstart` as the map's own move (`selfMove`), so it never releases the lock. Esc closes an open card in the capture phase and marks the key handled, so the profile's Esc handler leaves it alone. Attribution while shown: "Stops Nysse CC BY 4.0 · Stores © OSM ODbL". Legend "More" in NV adds a "Ground intel · NV" block (grocery letters, Alko, tram, bus). Gotcha: Leaflet's `.leaflet-map-pane svg { z-index: 200 }` covers the hexagon's letter; `.poi .poi-hex` resets it.
- Layer control (all keyless, each with attribution, each tinted by a CSS filter token `--tiles-*` that changes with the theme): **Night ops** (default: Esri `Canvas/World_Dark_Gray_Base` with `World_Dark_Gray_Reference` labels in their own pane and Esri `Elevation/World_Hillshade_Dark` blended in at 50 %), **Recon sat** (Esri `World_Imagery` with `Reference/World_Boundaries_and_Places` labels) and **Terrain** (OpenTopoMap). A fine grid and a vignette lie over the tiles; a metric scale bar sits bottom-right. CARTO and the MML background map need API keys. The base layers use `maxNativeZoom`, so a tile set with fewer zoom levels is upscaled instead of going blank.
- A panel tag "02 Tactical map · Tampere AO" at the top, and a live **cursor readout** at the bottom (pointer latitude/longitude and zoom, written straight to the DOM on `mousemove`).
- **Zoom strike** (FR-38): on every zoom a crosshair hits the point zoomed at, taken from the wheel or double-click event in the capture phase (before Leaflet acts), the middle of the visible map for the zoom keys (`zoomaim`), or the centre for buttons and "Fit". Zooming in closes brackets onto the point; zooming out blows a ring outwards; a "Z 14.0" readout fades with it. 0.42 s, at most one per 200 ms (a wheel burst gives one strike), plain DOM in an overlay inside the Leaflet container that ignores the pointer. Off under reduced motion.
- **Target lock** (FR-38): selecting a listing puts a Leaflet `divIcon` marker on it: four brackets snap in from 2.6× with a 45° twist, a dashed ring scales in and keeps turning slowly, range ticks fade in, and a "TARGET LOCKED" label types in beside it: the title, the marker tooltip's facts on their own row (`tipParts`: rent in bold, then build year, size and address, escaped into the icon's HTML; at most 300 px, a long address ends in "…") and the true coordinates. A new selection draws a fresh lock (so the animation plays again); a relayout or a filter change only moves it. The lock follows the spread-out position and is removed when the target is filtered out or the profile closes. It is not drawn while the profile covers the whole map (phones; `visibleArea().hidden`), where nobody sees it and its animation would compete with the profile's slide-in; a map `resize` (a phone turned, the window widened) draws or drops it to match.
- A `ResizeObserver` calls `invalidateSize()` whenever the map's container changes size.
- **Shared points are spread out** (`web/src/lib/spread.js`): listings in one building share one coordinate (158 of 381 in 48 groups, up to 10 per point). Each group is laid out on a ring of pixels around the true point, marked by a faint dashed circle, and re-laid out on every zoom.
- **Fit N targets** fits the map to the current list at the exact zoom that fits it (`fit` sets `zoomSnap` to 0 while `fitBounds` picks the zoom, then restores 0.5, so buttons, wheel and pinch stay on half steps and the next zoom snaps back to them), inside the visible map, counting each shared point as drawn: its ring of homes (`ringRadius(n)`, fixed in pixels) plus a marker's halo (`R.halo`, 12 px). Leaflet's `fitBounds` fits bare points, so a big ring at the edge hung off the map; `lib/fit.js` `fitZoom` instead bisects the zoom (to 0.001) at which the points projected at zoom 0 (× 2^z) plus their pixel radii fit the room, and the map is centred on those extents with `setView`. Room: the visible map less 72 px at the top (the zoom, Fit and layers buttons), 56 px at the bottom (the legend, scale and attribution) and 32 px at the sides (12 px on a map under 600 px wide, a phone), and, with a target profile open, up to the profile's left edge (the same area that counts as in view, FR-41, so after a fit every target is in view). It is a Leaflet control in the top-left corner, right of the zoom buttons and level with "+" (`FitControl`, React rendered into the control with a portal), so it never covers the map itself; up to 1100 px it shows only the icon and the count ("⛶ 42"; the accessible name stays "Fit 42 targets"). **Legend** (bottom left): "More" adds the other marker styles and the reference points; "Hide" folds it into a chip with the six colour dots and "Legend", which opens it again. Phones (≤ 900 px, or held sideways; `PHONE_QUERY`) start with the chip; the choice is not remembered. A radar sweep ("Acquiring targets") covers the map while data loads after a reload.

**Target list:** a panel head ("03 Target list", "N targets"), then one bar with the **★ Priority** chip, the **Order** select and the Rows / Cards switch (remembered, key `tcb.listView.v1`). **Rows** (default; the user wants many targets on screen): about 76 px each; a small photo, the build year in bold condensed capitals, district and street, size · rooms · layout on one line (long layouts end in "…"), then one monospace line `IN 1.12.2026  HQ 1.8 km  RAIL 2.1 km` (the move-in text is cut first), rent at the right with €/m² under it, and the star. The selected row is outlined in amber with a **LOCKED** tag. Keyboard: with a row focused, ↑/↓ move to the next or previous target (focus also highlights its marker), Home/End jump to the ends, Enter opens it. **Cards**: the large-photo layout. In both, the left edge of each target is coloured like its marker. Sort: build year (newest first, default), size, rent, rent per m², available date, distance to centre, distance to station, newest listing.

**In map view first (FR-41; a separator, the user's choice):** the list shows the targets on the visible map first, then a separator row `// OUTSIDE MAP VIEW - - - N` (sunk background, steel hairlines, the count in condensed cyan) and the rest, both parts in the chosen order (`splitByView` in `lib/inview.js`). The head then reads "N in view · M targets". Rows under the separator have a sunk background and a faded photo or placeholder mark (`--outside-photo-opacity`); their text keeps full contrast, and hover, focus and the lock bring the photo back. With no target in view, "No targets in map view" sits above the separator; with all in view there is no separator. In view means the marker, at its spread position, is on the map and not under an open target profile (the user's rule: hidden by the profile is outside the view); when the profile leaves under 120 px of map (full screen on phones) it is ignored. Opening or closing a profile reports the view again (unless the selection pans the map; its `moveend` reports then). **Lock released by a move:** when the operator's own move (drag, wheel, zoom buttons, Fit; not the map's pans to a selection, flagged `selfMove` for at most 1.5 s or until the target is in view) leaves the locked target outside the visible map or under the profile, `ListingMarkers` calls `onLockLost` (App's `onClose`, so it goes back in history like ×), once per target. Only a move that started (`movestart`) after the target was locked counts: a zoom still finishing when a target is picked can swallow the pan to it, so when such a move ends with the target off view, the map pans to the target instead. The list, reordered by the same move, jumps to its top and does not scroll to the released row. `ListingMarkers` computes the set on `moveend` (after `zoomend`, so rings are laid out; a container resize ends in `moveend` too) and after each new list, and reports only changes (`onViewChange`). The split follows the map also while a profile is open (the user's choice: a live list, not one locked while the profile is open): a selection that pans the map reorders the list, so ‹ › then continue from the target's new place. To keep that rare, selecting a target pans the map only near its edge (see Hover sync). When the order changes (map moved, filter, sort; not a star or a hover) the list jumps to its top, instantly, and with a profile open its row is then scrolled into view; not in the stacked layout, where the page scrolls instead of the list. ↑/↓/Home/End follow the list as shown and skip the separator. ‹ › and "i / n" in the profile cover only the targets in view and wrap round (`stepIndex`: › on the last goes to the first, ‹ on the first to the last, so the user can browse in one direction; the buttons are disabled only with a single target) (the user's choice; all targets when there is no separator); a target opened from under the separator has no ‹ › until the map has centred it (the next `moveend`). Under the full-screen profile on phones the map, though hidden, still centres an off-map target (instantly, `animate: false`: nobody sees it, and an animated pan would compete with the slide-in), so that target gets ‹ › and the swipe too; a target already on the hidden map does not move it. The header's Targets readout and the map are unchanged.

**Hover sync:** row hover (or keyboard focus) → its marker grows, highlights, comes to the front and shows its tooltip. Marker hover → its row highlights and scrolls into view (instant, so it keeps up with the pointer). Click on either → target profile and lock. The map moves only if the target's marker is within 48 px of an edge of the part of the map the profile leaves visible, or under the profile (`EDGE_MARGIN` in MapView, room for the 96 px reticle), and then only far enough to bring it 48 px inside; a target further in does not move the map at all (the user's choice, because every pan reorders the list). A target off the map altogether (outside its bounds: picked under the separator, or opened from a link) is centred in the part the profile leaves visible (`panBy`). Near the right edge the lock label can therefore run under the profile. No pan when less than 120 px of map is visible. This also happens when the target comes from the URL, once the markers exist.

**Phone layout (stacked, ≤ 900 px and not held sideways; `STACKED_QUERY` in lib/layout.js; a phone held sideways gets the two-column layout, see Breakpoints):** the list sits under the map, so tapping a marker does **not** scroll the list to its row (neither the tap's hover nor the selection), because that would drag the whole page away from the map. The tap opens the full-screen target profile; closing it (× or Esc) scrolls the map back to the top of the screen and drops the marker tooltip a tap leaves behind. A target opened from a list row keeps the list where it was; when the profile closes (×, Esc or Back), the last target viewed is scrolled into view if it is off screen (its row may have moved: a target from outside the map view is centred on the map, which reorders the list), in the next frame, after the browser has restored the page's scroll position. While the full-screen profile is open (phones, upright or sideways) the page behind it does not scroll: DetailDrawer sets `profile-open` on `<html>` and, in the phone media query only, that gives `overflow: hidden` and `overscroll-behavior: none`, and the profile's scroller has `overscroll-behavior: contain`, so a gesture past its ends or on its top bar never runs on into the page. The page's grid columns are `minmax(0, 1fr)` (`.app`, the stacked `.main`, the `.cards` list), so no content (a card's one-line facts) can make the page wider than the screen. App tracks where the selection came from (`selectSource`: map, list or URL; ‹ › keep it).

**Swipe between targets (FR-42, phones only, upright or sideways (`PHONE_QUERY`); `useSwipeStep` in DetailDrawer.jsx):** passive pointer events on the profile, with `touch-action: pan-y pinch-zoom` on the top bar and on `.drawer-body`, one block holding everything from the address to "Open on Oikotie". On phones it reaches over the profile's side padding and the gaps above and below it (negative margins with equal padding, so nothing moves), because a swipe that starts on an unprotected strip is claimed by the browser and cancelled (in 1.9.1–1.10.0 the rule was on each section, which left the 16 px edges and 24 px gaps, about 16 % of the area, dead). The gallery and the raw JSON stay outside it, free to scroll sideways; the strip round the raw JSON is the only one left. A touch that starts in the gallery (photo track, thumbnails), the raw JSON or a field is ignored, so photos stay photos. Movement below 8 px is ignored; then a gesture more sideways than vertical is a swipe and anything else a scroll, the same rule the browser applies under `pan-y`, so no gesture falls between the two (a stricter 1.5 : 1 rule left 34–45° swipes dead). No handler cancels native scrolling; browser pointer cancellation and multi-touch cancel the swipe. The scrolling content follows the finger and fades (a quarter of the way at most to 40 %); with a single target it gives a quarter and springs back. Release past a quarter of the width, or a flick (over 40 px at 0.4 px/ms), slides it out (200 ms) and calls the same step as ‹ › (history entry, wrap, targets in view); the new target slides in from the other side, and the next swipe is accepted once it has slid in (200 ms; a 600 ms safety net covers a step that renders nothing). Anything less springs back. Under reduced motion the content does not move and the step is immediate. The header (TARGET PROFILE, ‹ i / n ›, ×) stays put.

**Mission parameters** (`Filters.jsx`; all ranges are dual-handle sliders plus typed inputs, bounds from the data). Groups, each under a `// TITLE`: **Structure** (build year, its track coloured by era; stepped: the handles snap to decades from 1960, ticks ’60 … ’20, every step the same width, so 1905–1959 is one step and the recent decades get room; the upper handle at a decade means the year before; a typed year puts its handle inside its step; the inputs run over step positions with `step="any"`, a drag rounds to a stop and the arrow keys go stop to stop; logic in `lib/stops.js`, `stops` prop of `RangeFilter`), **Logistics** (cost per month, area, rooms), **Move-in** (FR-48: chips for each month from the earliest one up to the month before `windowCutoff`, then Later and Unknown, each with its count, in the same two-column grid as the sectors; a chip on means its listings show), **Financing** and **Housing type** (FR-49, `lib/housing.js`: the same chips; Financing is Free-market and Subsidised (code 3, Arava), a chip on means its listings show; Housing type is six chips (codes 2 and 4–8) under the note "Select to show only those types": none selected means no type filter, selected ones keep only listings with at least one of them; the counts come from `housingCounts`), **Sectors** (postal codes as a two-column grid of chips with names and counts, plus "All sectors"), **Flags** (priority targets only, top floor only with its count: `isTopFloor` in `lib/filters.js`, floor ≥ floor count, both known). Withdrawn listings are always left out (`matches` in `lib/filters.js`), with no switch, tag or count (the user's choice); an old `removed=…` in the address is ignored. A footer **Clear params** button resets them (the sort is kept). A range is `[min, max]` with `null` meaning "no limit"; dragging an end back to its data bound clears it. Numbers commit on Enter or leaving the field. URL keys: `year=2010..2026` (either side may be empty), `rent`, `size`, `rooms`, `moveoff=2026-11,later` (the move-in chips switched off; `moveoff=` with nothing means all on), `financeoff=subsidised` (the financing chips switched off; `financeoff=` means both on), `type=4,8` (only these housing-type codes; 3 and 9 are ignored), `zip=33100,33200`, `saved=1`, `top=1`, `sort=…`, and `listing=<id>` for an open profile; only values that differ from the defaults are written, and bad values are ignored.

| Filter | Default |
|---|---|
| Build year min–max (first, most prominent) | full range; listings without a year are included while the range is untouched |
| Cost (rent) min–max | full range |
| Area (size) min–max | from 40 m² (`DEFAULT_SIZE`; the crawl reaches down to 20 m², so the small flats are captured but hidden until the slider is pulled down; a listing without a size is hidden too) |
| Rooms min–max | full range |
| Move-in chips (months, Later, Unknown) | all on except Later |
| Financing chips (Free-market, Subsidised) | Free-market only |
| Housing-type chips (show only the selected) | none selected (no type filter) |
| Sectors (postal codes, multi-select) | all |
| Priority targets only (also the "★ Priority" chip and the Priority readout) | off |
| Top floor only | off |

Rent and rooms also start untouched; a listing with no value for a touched range is excluded.

**Priority targets (the shortlist):** a star on every row and in the profile. The shortlist is a list of card ids in the browser's `localStorage` (key `tcb.shortlist.v1`, `web/src/lib/shortlist.js`), so the server and the database stay read-only. It is per browser, follows other tabs (`storage` event), and the app works if storage is blocked. App derives `liveSaved` (`liveShortlist`: the stored ids that are active card ids in the loaded data; empty until the data is in) and hands that to the header, parameters, map, list, boot log and the "only shortlist" filter, so stars for listings gone from the data or withdrawn count nowhere and show nowhere, without a word (FR-34). The stored set keeps them (a withdrawn listing can reappear); toggling and the profile's own star use the stored set. Cost: one Set of active ids per data load and one lookup per star.

**Target profile** (`DetailDrawer.jsx`; non-modal; Esc or × closes, focus moves to × and back; an open slide-out parameters panel takes Esc first, and Esc in a typed range field only cancels that edit). It docks over the right side of the map against the list (520 px, never covering the list or the parameters) and opens with a wipe (`profile-in`: clip-path, fade and an 18 px slide); on phones (≤ 900 px or held sideways, full screen) it only slides 32 px and fades (`profile-in-phone`), because animating clip-path repaints the whole screen-sized panel every frame and stutters there. It has amber corner brackets, a blinking "TARGET PROFILE" kicker and "TGT <id>" (the id is hidden on phones). ‹ › and ←/→ step through the targets on the visible map, in list order (all of them when every target is in view; "3 / 42"; the keys come from App's handler, FR-44, ignored while typing or in the gallery), and the list scrolls along. Then: a **gallery** (one `minmax(0, 1fr)` grid column, so the thumbnail strip, which can be far wider than the profile and scrolls, never widens the photo; while the details load, a placeholder with the photo's 16:10 box and the row under it (`.gallery-under`, always the thumbnail row's 54 px, also when that row holds only the "visuals hidden" note or nothing; with photos on and two or more photos it holds one placeholder thumbnail per photo (the list row's `photo_count`, each with the compact photo loader) in the same scrolling row, so a strip that overflows (on desktop from 7 photos) shows its scrollbar already and the profile does not jitter when the real thumbnails arrive), so the profile never jumps when the details arrive, which on the hosted copy over a phone connection is often mid slide-in; a photo loader (`PhotoLoader` in `Photo.jsx`, `.photo-loader`: the grid, a cyan scan band sweeping down by `transform`, a pulsing reticle and "Acquiring visual") fills the hero box while the details load, under the visible loading photo (distant unloaded slides use static grid placeholders), and under every listing photo from the CDN (`Photo` wraps each image in `.photo-frame`: hero photos, gallery thumbnails, list rows and cards; the user's choice) until it has loaded, when the photo fades in over it; the loader is the photo's own box, so nothing moves; it is a size container, and below 200 px wide (thumbnails, rows) it shows only a 20 px reticle, no label; under reduced motion the band is hidden and the photo appears without a fade; a hero photo fading into the panel, ‹ ›, "i / n", thumbnails; ←/→ inside it change the photo; the hero links to the full-size image; the hero is a horizontal scroll-snap track with one photo per stop, so a finger or a trackpad swipes between photos natively, and ‹ ›, thumbnails and keys jump the track; it loops: a copy of the last photo sits before the first and a copy of the first after the last, and when a swipe rests on a copy (`scrollend`, or 150 ms without scrolling) the track jumps invisibly to the real photo; only the shown photo, its neighbours round the loop and photos already seen load; on touch phones the ‹ › over the photo are hidden; natural colours even in NV; with `--no-photos` a placeholder and "N visuals hidden"); district and postal area; address and ad title; the priority star with the move-in beside it (`.drawer-movein`, `moveInBrief` in lib/format.js: "IN" in the list rows' style, then the date, or the listing's text tidied and cut at a word to `MOVE_IN_MAX` = 40 characters with "…", the full value in its tooltip; nothing when there is neither; it fills the rest of the star row and ends in a CSS ellipsis, keeping at least 11 ch, so the tags after it take the next line); Withdrawn / Approx. position tags; cost per month, area and built year in three readout boxes (cost first and a little wider, so "1 299 €" fits at 384 px; the user's choice: the price at a glance on the phone; the rooms are in Layout); then layout, floor ("3 / 5", or "3" when the floor count is unknown, `fmtFloor` in `lib/format.js`; a top-floor home adds an amber TOP tag: "5 / 5 TOP"), move-in date and note, water and deposit (each only when set; a 0 € deposit shows), "Furnished: Yes" (only when `furnished` is true; no row for false or null), range to HQ and to rail, landlord or agent, listed (electricity, pets, building type, first seen and details fetched are left out, the user's choice); **Lease terms** in full (or a note that there is none); **Briefing** (the description); both go through `RichText` (`lib/richtext.js`): plain text and the HTML some landlords send (`<p>`, `<b>`, `<br>`) become the same paragraphs (12 px apart), line breaks and semi-bold runs, built as React elements and never as raw HTML, so an ad cannot inject scripts, links or styles; other tags are dropped with their words kept, list items become "• " lines, entities are decoded; while the details load, both show pulsing skeleton bars (`ProseSkeleton`, `.sk-prose`: one bar per `.prose` line box, so N bars are exactly N lines tall; off under reduced motion): one line for Lease terms and `BRIEFING_SKELETON_LINES` = 9 for Briefing, just under the 5th percentile of the descriptions as `RichText` renders them at the desktop text width (455 px; 380 descriptions on 2026-11-12: shortest 96 px, 5th percentile 201 px = 9.6 lines, median 612 px), so the profile nearly always grows rather than shrinks when the text arrives; "Open on Oikotie"; **Raw intel (JSON)** (collapsed; `RawIntel`, keyed by target: opening it fetches `/api/raw/<id>` and formats it then, showing "Loading…" meanwhile and an error with "close and open to try again" on failure; a new target starts closed, so another target's data never shows).

**States:** designed empty ("No targets in sector", with Clear params; "No priority targets" when the shortlist filter is on and the shortlist is empty), loading (skeleton rows, radar on the map) and error ("Uplink lost" → `npm run ui`; "No intel yet" → `npm run capture` and `npm run import`; "System fault" for anything else, and for a rendering crash, with Reload).

**Browser history** (`lib/history.js`, FR-40): opening a target (row, marker or ‹ ›) calls `history.pushState` with `{ tcb: 'tcb-profile', id, depth }`, depth counting the profile entries above the main view; `popstate` sets the open target from the address (`listing=`), or closes it. × and Esc call `history.go(-depth)`, so they land on the main view however many targets were stepped through; without a profile entry of ours (rare) they just drop `listing` from the address. On load with `listing=` and no state of ours, the entry is rewritten to the main view and the profile pushed on top, so Back closes it. The address sync for filters uses `replaceState` and keeps the entry's state, so filters never add entries. The phone-layout return to the map runs on any close (×, Esc or Back).

**Performance** (the sliders must keep up on Android Chrome):
- The list and the map follow `useDeferredValue(filters)`: the slider (and the parameters panel) re-render at once, the filter, sort, rows and markers catch up in a background render that React interrupts when the next value arrives. `ListPanel` and `MapView` are memoised and get stable props (callbacks, `NO_PLACES`), so the urgent render skips them. The address sync also follows the deferred value (fewer `replaceState` calls while dragging).
- Rows: `ListingCard` gets its index only during the entrance animation, so filtering does not re-render every row whose position changed; `.card-item` has `content-visibility: auto` (76 px intrinsic height; 320 px for cards), so off-screen rows skip layout and paint.
- Markers: created once and cached; a filter only removes or re-adds layers, moves a marker only if its position changed, redraws shared-point rings only if their group changed, and sets a radius only if it differs.
- Measured on the dev PC at 1920 × 1080 with all 381 listings: one build-year step takes 12 ms (median; slowest 69 ms); 20 quick steps settle in about 0.5 s.
- **Map panning:** marker hovers are ignored while the map is dragged (the pointer sweeps over dozens of markers; each hover would re-render the list and open a tooltip) and tooltips are hidden then (`.map.is-dragging`); hover resumes on `dragend` or `moveend`. The base maps, place pins and legend are memoised, and so are the header and the parameters panel, so a hover re-renders only the list and the markers (measured: one marker hover takes 22 ms on the dev PC, most of it the list scrolling to the row, which is the hover-sync feature). Tile layers use `updateWhenIdle: false` (phones load tiles during a drag instead of after it) and `keepBuffer: 4` (more loaded tiles kept, so panning back is instant). The cursor readout writes at most once per frame.
- **No main-thread loops:** turning a part *inside* an SVG repaints it every frame, so the turning rings are their own `<svg>` elements turned as a whole (GPU): the logo ring (`Reticle`: a ring layer over a static layer) and the lock ring (`.lock-ring-svg`). New-contact halos live in their own Leaflet pane and SVG renderer (`halos`, z-index 395, under the markers) and the pane pulses by opacity (`halo-pulse`), instead of animating stroke opacity inside the marker SVG, which would repaint every marker each frame.
- **Touch screens** (`(pointer: coarse)`): slider thumbs get a 28 × 36 px grab area around the same slim bar (rail inset to match), `touch-action: pan-y` on the slider so a sideways drag moves it; no terrain-shading tile layer (`LIGHT_GRAPHICS` in MapView: one tile layer fewer per view, no full-map blend), no glow filter on markers, no backdrop blur (solid glass instead). Desktop keeps all of it.

**Keyboard:** Q or N toggles night vision (not while typing or during the boot); R and T show or hide the parameters and the list (FR-46); F zooms to the open target (else fits the map), C fits the map to all targets, E or M switches the base map and Esc closes (FR-47); H opens the field manual (FR-50: `FieldManual.jsx`, a native modal `<dialog>` in the top layer with a capture-phase key handler that takes every key while it is open, so the keys light their caps instead of acting and Esc never reaches the profile); D or → next target, A or ← previous (FR-44; by `e.code`, so the A / D positions on any layout; same as › ‹ with a profile open, the first or last target in the list without one; App's global handler, same guards as V); ↑/↓/Home/End/Enter in the list; Esc in the profile (Esc closes an open intel card first); any key skips the boot.

**Scorched earth** (FR-51): `ScorchedEarth.jsx`, in two places: the field manual's last section (full form: the brief always shown) and the last item of `.params-scroll` in `Filters.jsx` (`compact`: one slim hazard bar, a warning glyph, "Last resort · scorched earth" and "Lift the safety cover" as one 52 px button; lifting it unfolds a two-column pair of controls: on phones (`phone` from App) the manual's brief with Stand down / Burn it all, 44 px high; elsewhere `terse`: title, one line, the warning and Disarm / Burn, sized to stay on one line each in the 320 px column). Both are behind a safety cover (arm, then fire; "Stand down" takes the cover's place and "Burn it all" ignores presses for 0.5 s after arming, so a double-click never fires). Firing closes the manual and App shows `Purge.jsx` over everything (`--z-purge`): five burn lines (0.28 s each), a red bar, then `location.replace(pathname)`. `lib/purge.js` removes every key starting with `tcb.` from `localStorage` and `sessionStorage` when the screen opens and again just before the reload, so nothing still in memory can write a setting back; app keys rest while it runs. The boot flag goes too, so the boot sequence is the loader after the reload. Its red comes from `--danger` and the `--danger-*`, `--hazard-stripes` and `--purge-bg` tokens, the only red in the console; animations stop under reduced motion.

### 8.3 Visual design
_The user's brief: "Tampere Targets", a TACTICAL / SPEC OPS console, "like in movies selecting targets", professional but with an attitude. The user's references: sci-fi HUD dashboards (framed panels, corner brackets, radial gadgets, readout boxes) and a classic tactical game's loadout screen._

- **Feel:** a calm, dense targeting console. Framed glass panels on a faint grid, corner brackets, monospace readouts, reticles and sweeps. Effects are fast (0.2–0.9 s) and only mark real events (boot, deploy, zoom, lock, NV); the only loops are a slowly turning ring on the lock and the logo. Every number on screen is real data; there is no fake telemetry.
- **Themes** (FR-37): **RECON** (default): deep navy surfaces (`--c-navy-*`), steel hairlines, cyan for interaction and data (`--c-cyan-*`), amber for alerts, priority and the lock (`--c-amber-*`), red only for errors. **NV** (`html[data-theme='nv']`): the same token names re-valued to phosphor green, with lime for alerts and the lock; a fixed overlay adds scanlines and a round goggle vignette, list photos turn monochrome green (the profile gallery keeps natural colours), and the map tints shift to green; NV also shows the ground intel (stops and stores, FR-43; tokens `--poi-*`). The theme is stored in `localStorage` (`tcb.theme.v1`, `lib/theme.js`) and applied by an inline script in `index.html` before the first paint.
- **NV switch effect** (0.72 s): switching on, a green bloom grows from the centre, a bright scan line runs down the screen and the console flickers (brightness 1 → 2.2 → 0.5 → 1.5 → 1); switching off, the image collapses to a bright horizontal line and fades. The colours swap at 0.19 s, while the effect is brightest, so the swap itself is never seen. Off under reduced motion (the theme just changes).
- **Materials:** a 24 px grid (`--texture-grid`) on the app, the parameters, the map and placeholders; faint scanlines (`--texture-scan`) on bars and the profile; 2 px corner brackets on every panel (`.frame`, cyan; amber on the profile); readout boxes with one corner cut off; thin slider rails with a cyan glow and slim bar-shaped thumbs; square switches; blurred glass map controls, legend and profile.
- **Tokens:** every colour, type size, space, radius, shadow, gradient, texture, tile tint and motion value is a CSS custom property in `web/src/styles/tokens.css`; components use tokens only (no hex or rgb values in `app.css`, checked by grep).
- **Type:** self-hosted `@fontsource`: **Rajdhani** (condensed, squared capitals) for the wordmark, panel titles, buttons, labels, build years and key figures; **JetBrains Mono** for readouts, data lines, tags, coordinates and the boot log; **Barlow** for running text (addresses, descriptions, lease text). Tabular figures for numbers.
- **Detail:** 1–4 px radii; steel hairlines; glows instead of heavy shadows; visible keyboard focus (cyan outline); WCAG AA contrast, checked with a script over the tokens: the lowest text-on-surface pair is 5.65:1 in RECON and 6.43:1 in NV, and button and badge text is 9.9:1 or more in both. `prefers-reduced-motion` turns off the boot, deploy, strike, lock animation, NV effect, halo pulse and list entrance.

**UI dependencies** (pinned exact): `dependencies` fastify 5.12.8 and @fastify/static 10.1.10 (the server); `devDependencies` react and react-dom 19.3.1, leaflet 1.9.4, react-leaflet 5.0.0, vite 8.3.7, @vitejs/plugin-react 6.3.0, @fontsource/barlow, @fontsource/rajdhani and @fontsource/jetbrains-mono 5.3.0 (the build). The range slider is hand-built from two native range inputs, so there is no slider library.

### 8.4 Hosted copy (`npm run deploy`)
_The local database stays the master; the hosted copy is a read-only snapshot that changes only when the user runs the deploy by hand. Personal use only (NFR-03, `docs/02-data-source.md` §10)._

- **Where:** Azure Storage **static website hosting** (the `$web` container) in the user's own storage account. It has **no sign-in**: anyone with the URL can open it (the user's decision: they are the only user and the URL is not shared). The page carries `<meta name="robots" content="noindex, nofollow">` and the deploy uploads a `robots.txt` that disallows everything. Oikotie photos and links keep `referrerPolicy="no-referrer"`; tile servers get only the origin (the browser default).
- **No server in the cloud:** `deploy/site.mjs` asks the local Fastify app (`buildApp`, via `inject`, no port) for `/api/meta`, `/api/listings`, `/api/listings/<id>` and `/api/raw/<id>` for every listing (removed ones too) and writes the answers to `api/meta.json`, `api/listings.json`, `api/listings/<id>.json` and `api/raw/<id>.json`, so the hosted copy shows exactly what `npm run ui` shows (with photos, `noPhotos: false`). The web app is built by Vite with `import.meta.env.VITE_STATIC_DATA = "1"`, which makes `lib/api.js` fetch `<path>.json` instead of the API (`staticPath`). Output: `dist/site/` (git-ignored; about 830 files, about 24 MB for 381 listings, most of it the raw JSON, which a visitor loads only by opening "Raw intel").
- **Upload** (`deploy/blob.mjs`): the Blob REST API over plain `fetch` (no Azure SDK), authenticated by a container **SAS token** from `.env` (git-ignored; placeholders for `AZURE_STORAGE_ACCOUNT`, `AZURE_STORAGE_CONTAINER` (default `$web`), `AZURE_STORAGE_SAS` and `SITE_URL`; read with Node's `process.loadEnvFile`). Settings are checked first (placeholders, account-name format, `sig=` present, `se=` expiry not passed). Text files (HTML, JS, CSS, JSON, GeoJSON, plain text, SVG) are gzipped (level 9) and stored with `Content-Encoding: gzip`, because Blob storage never compresses on its own and every browser accepts gzip; fonts and images go up as they are. The first load drops from about 1.1 MB to 0.24 MB (data 554 → 69 KB, code 442 → 132 KB, styles 113 → 40 KB). Files go up 8 at a time as `PUT Blob` (`BlockBlob`, `x-ms-version` 2023-11-03) with their content type and `Cache-Control` (`assets/*` immutable for a year, everything else `no-cache`): hashed assets first, then data, `index.html` last, so a visitor never gets a page whose files are missing. Then blobs the new build no longer has (old assets, exports of listings that are gone) are deleted, if the container could be listed. 5xx and network errors are retried twice; errors name the operation, the blob and Azure's error code, never the token, and a 403 explains which SAS permissions are needed (Read, Add, Create, Write, Delete, List).
- **`--dry-run`** builds and exports into `dist/site` and uploads nothing (works with placeholder settings).
- **One-time setup by the user** (Azure Portal): a storage account; *Static website* enabled with index document `index.html`; a SAS token for the `$web` container with the permissions above, HTTPS only, with an expiry date; the values in `.env`.
- **The boot log** names the real host (`window.location.hostname`) on the "secure channel" line, so it stays true on the hosted copy.

## 9. Testing
`npm test` (`node:test`, no network, synthetic fixtures only):

| Area | Checks |
|---|---|
| Hash | Stable for equal cards; ignores visits; changes with price, image, `publishedSort`. Same result from the built browser script as from Node. |
| `planRun` | 20 h → `published=1`; 30 h → `2`; 3 days → `4`; 8 days → full; stale full sweep → full; `forceFull` → full; no state → full |
| `detailsDue` | New, changed, no-detail, stale-window and stale-other cases; ordering; `maxDetails` cap |
| Normalise | Price and size parsing; both timestamp styles to UTC, in winter and summer time; missing `availabilityDate`; distances |
| Import | Initial run flags nothing new; second run flags only its additions; same file twice is a no-op; incomplete sweep removes nothing; complete sweep removes the missing; reappearance clears `removed_at`; detail 404 removes; versions and change-log rows on change; bad file rolls back |
| Capture script | The built `dist/capture.js` is loaded with a fake `document` and `fetch`: correct URLs and headers, sequential pacing (with a fake clock), stop on 429, valid capture file |
| Rebuild | Columns identical after rebuild; works with `fetch` disabled |
| API (`test/api.test.mjs`) | Through Fastify `inject` on an in-memory DB with two synthetic runs: no `is_new` or `isNew`, `removed` flag, thumbnails, distances, flags as booleans, no `*_json`/`*_hash` in the list route; detail photos sorted by `ordernr`, no raw JSON in the detail, 404/400; the raw route (search and detail JSON, 404/400); `noPhotos` hides every photo URL; meta counts and cutoff; 503 without a database |
| UI helpers (`test/ui-lib.test.mjs`) | Shared-point grouping and ring layout (no overlaps up to 20 markers); shortlist store round trip, bad data, blocked storage; "only shortlist" filter and `saved=1`; history helpers (`listing` in the address, profile depth, steps back to the main view); theme store (only "nv" switches NV on, blocked storage falls back to RECON, `data-theme` set and cleared); panel store (both shown by default, hidden ones remembered, bad or blocked storage means shown); median; the in-view split (order kept in both parts, no split without a report or with all in view), id-set comparison and the wrap-around ‹ › index |
| Deploy (`test/deploy.test.mjs`) | which files are gzipped and the `Content-Encoding` header; `.env` settings (placeholders, account format, missing `sig=`, expired token, dry run); blob URLs, content types, caching; List Blobs parsing with paging; the client against a fake `fetch`: PUT headers, DELETE 404 accepted, 5xx retried, 403 explained without the token; bounded parallelism; upload order and stale blobs; `staticPath`; the static export from a synthetic DB (removed and new listings, the raw JSON in its own files and not in the details, robots.txt) |
| Ground intel (`test/infra.test.mjs`) | Opening hours: day ranges and lists, both rule separators, 24/7, no day selector, later rules replacing days, `off`, split times, overnight spans, PH skipped, wrap-round ranges, unknown syntax → null; open now and the status line (closing time is closed, over a closed day, past midnight, 24/7, never); week rows; the Helsinki clock in winter and summer time. GTFS CSV quoting; the ZIP reader on a generated archive; stops from a synthetic GTFS zip (tram/bus from route types, a stop served by both counts as tram, unserved and out-of-box stops dropped); chain filter by brand or name (R-kioski, Tokmanni, K-Rauta out); Alko only as `shop=alcohol` and no other alcohol shop; store names with the branch; Overpass nodes and ways; the search box margin, one-record-per-line file, summary |
| UI logic (`test/filters.test.mjs`) | `web/src/lib/filters.js` and `format.js`: defaults (Later off, area from 40 m², unknown years, removed), both ends of every range, move-in chips, postal codes, an old `new=1` ignored, top floor only, floor text, sorting with unknowns last, URL round trip and bad URL values, bounds snapping, formatting |
| Housing form (`test/housing.test.mjs`) | `web/src/lib/housing.js` and `housingTypes` in `server/app.mjs`: financing (Arava 3 is subsidised, anything else free-market), type overlap, counts without removed listings, defaults (only free-market, no type filter), both chip rows in the filter, the `financeoff` / `type` URL keys with bad values, reading `aiHabitationRentTypes` from the detail JSON |
| Listing text (`test/richtext.test.mjs`) | `web/src/lib/richtext.js`: plain paragraphs and line breaks, empty input, HTML paragraphs, breaks and bold, HTML mixed with newlines (no double gaps), other tags dropped with their words, lists, unbalanced bold, script and links only as text, entities |
| Move-in month (`test/movein.test.mjs`) | `web/src/lib/movein.js`: the date field first, past dates to the fetch month, "heti" spellings, ISO and Finnish dates, dates without a year, Finnish month names, the first date in a range, unusable texts, the Helsinki month of the fetch time; buckets and chips (months without gaps, Later, Unknown, counts without removed listings) |

The UI is checked in the browser against FR-26…48. Media-query changes after an emulated resize only reach the app when the pane draws a frame; reload after resizing a hidden pane. Animations can only be checked with the browser pane visible: in a hidden pane `requestAnimationFrame` does not run, so Leaflet zooms never finish. Agent previews use `npm run ui -- --no-photos --port 3005` (`.claude/launch.json` entry `ui-no-photos`; port 3005 so it never collides with the user's own `npm run ui` on 3000). The static build is checked the same way, never with the real export (it would load Oikotie photos): `TCB_DB=<synthetic file> node deploy/index.mjs --dry-run`, then serve `dist/site` with launch entry `site-static` (Vite preview, port 3006). The New tag, halo and "Only new" are checked against a temporary synthetic DB with a seeded second run (`TCB_DB=<temp file> node server/index.mjs --port 3100`, launch entry `ui-test-db`), never by editing `data/listings.db`.

## 10. Security and privacy notes
- The server binds to `127.0.0.1`, serves read-only data and has no write routes.
- The capture script sends requests only to its own origin (Oikotie) and writes only one local download. It contains no data other than listing ids, hashes and timestamps from the local database.
- Raw API JSON includes landlord or agent contact details (`contact`, `company`). They stay in the local database and the user's own hosted copy (`api/raw/<id>.json`), and appear only in the profile's "Raw intel" view.
- Listing photos are loaded from Oikotie's CDN when the UI is open; this is the only network traffic the UI causes besides map tiles (OpenStreetMap, Esri). `--no-photos` turns the photos off. The postal-area polygons and fonts are served locally.

## 11. Open questions
See [02-data-source.md §9](02-data-source.md#9-unknowns) for unknowns about the source. Design questions left for later:
- **Extra typed columns.** Candidates: `fixed_term`, `fixed_term_end`, `housing_form`. They need no re-fetch (rebuild fills them).
- **Volatile detail fields.** If the detail JSON contains counters that change on every fetch (like `visits` on cards), they must be left out of `detail_hash`, or every refresh would store a new version.
- **Scheduling.** Explicitly deferred by the user.
- **Maanmittauslaitos base map.** Optional; needs a free API key.

### Mobile profile responsiveness (1.9.1, 2026-11-13)

- Target swipes use passive pointer listeners. On non-gallery profile content, `touch-action: pan-y pinch-zoom` lets the browser scroll vertically and zoom without waiting for JavaScript. Movement below 8 px is ignored; a swipe must be clearly horizontal (horizontal movement > 1.5 times vertical). Browser cancellation and multi-touch cancel the target swipe. The gallery and raw JSON keep native horizontal scrolling.
- Successful detail responses are cached by listing ID for the page session (maximum 100 entries, oldest insertion evicted). Reopening or stepping back to a cached listing renders immediately without another fetch or loading skeleton. Refresh clears the cache. Failed/aborted responses are not cached, and render state is keyed by ID so the previous target cannot flash during navigation.
- Distant unloaded gallery slides use static placeholders; the photo loading treatment remains on photos being fetched.
