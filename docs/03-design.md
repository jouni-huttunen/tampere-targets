# 03 · Design

_Version 1, 2026-11-10. Implements [01-requirements.md](01-requirements.md) against the source described in [02-data-source.md](02-data-source.md). Points where this document refines the original plan ([archive/PLAN.md](archive/PLAN.md)) or the first handoff are listed in [§13](#13-refinements-over-planmd-and-handoffmd). Since 1.0.0 this folder is the single source of truth; §8.2–8.3 describe the 1.0.0 UI and its look, which is due to change in 1.1.0._

## 1. Architecture
```
            USER'S PC                                   USER'S BROWSER (Chrome / Edge)
 ┌──────────────────────────────┐   clipboard    ┌──────────────────────────────────────┐
 │ npm run capture              │ ─────────────▶ │ DevTools console on asunnot.oikotie.fi│
 │  build.mjs: config + DB state│                │  capture script: search → details     │
 │  → dist/capture.js           │                │  one request / ~2 s, progress panel   │
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
docs/                    this spec (docs/archive/ holds the original plan, historical)
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
test/*.test.mjs          node:test, synthetic fixtures in test/fixtures/
server/app.mjs           Fastify app: read-only JSON API (row shaping) + serves web/dist
server/start.mjs         shared start-up: open DB read-only, listen on 127.0.0.1, --no-photos / --port
server/index.mjs         npm run ui entry (port 3000)
server/dev.mjs           npm run ui:dev entry (API on 3001 + Vite on 5173)
web/                     React + Vite SPA: vite.config.mjs, index.html,
                         src/{App,main}.jsx, src/components/*,
                         src/lib/{filters,format,api,spread,shortlist}.js,
                         src/styles/{tokens,app}.css, public/postal-areas.geojson
data/ reports/ dist/ web/dist/      git-ignored
```

**npm scripts**

| Script | Does |
|---|---|
| `capture` | `node src/capture/build.mjs`. Options after `--`: `--full` (force a full sweep), `--max-details N` (cap details for this run, e.g. a 5-detail trial), `--no-clipboard` |
| `import` | `node src/import.mjs [file]` |
| `rebuild` | `node src/rebuild.mjs` |
| `list` | `node src/cli.mjs list window` |
| `report` | `node src/report.mjs` (re-writes the latest run's report) |
| `test` | `node --test "test/*.test.mjs"` |
| `ui` | `vite build --config web/vite.config.mjs && node server/index.mjs`: builds `web/` and serves it plus the API on `http://localhost:3000`. Options after `--`: `--no-photos` (placeholders instead of Oikotie photos; used for agent previews), `--port N` |
| `ui:build` | Only the Vite build (into `web/dist`) |
| `ui:dev` | `node server/dev.mjs`: API on 127.0.0.1:3001 plus Vite with hot reload on `http://localhost:5173`, `/api` proxied to the API |

`node:sqlite` in Node 26.13.0 prints no experimental warning, so no flag is needed.

**Environment overrides** (used by the dry runs; normally unset): `TCB_DB` (database file, default `data/listings.db`), `TCB_REPORTS` (report folder, default `reports/`), and for the UI server `TCB_NO_PHOTOS=1` (same as `--no-photos`) and `TCB_PORT`.

`config.json` is validated on load; among other checks, `capture.delayMs` below 2000 is refused, so the polite-pacing rule can't be loosened by accident.

## 3. Configuration (`config.json`)
```json
{
  "areas": [ { "zip": "33100", "id": 154182, "lat": 61.491623, "lon": 23.783517 }, "… 17 in total" ],
  "filters": { "cardType": 101, "sizeMin": 40, "priceMax": 1400 },
  "places": [
    { "key": "centre",  "name": "Keskustori",              "lat": 61.4978, "lon": 23.7610 },
    { "key": "station", "name": "Tampere railway station", "lat": 61.4983, "lon": 23.7737 }
  ],
  "windowCutoff": "2027-02-01",
  "capture": { "delayMs": 2000, "jitterMs": 800, "pageSize": 100, "maxDetails": 600 },
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

CREATE VIEW v_new AS
  SELECT l.* FROM v_active l JOIN runs r ON r.run_id = l.first_seen_run_id
  WHERE r.is_initial = 0
    AND l.first_seen_run_id >= (SELECT MAX(run_id) FROM runs WHERE sweep_complete = 1);
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
  "config": { "areas": [], "sizeMin": 40, "priceMax": 1400 },
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
4. **Run row:** insert with `is_initial = 1` when no earlier run has `mode = 'full' AND sweep_complete = 1`.
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

**Report** (`reports/YYYY-MM-DD-run-<id>.md`, one file per run, dated in Helsinki time): run summary; new listings in the window (address, size, rent, build year, available date, link; skipped for the initial crawl); rent, availability, lease and status changes; removals; listings that came back.

**CLI** (`node src/cli.mjs …`)

| Command | Output |
|---|---|
| `list window` / `list new` / `list removed` / `list all` | A table: id, district, address, m², rooms, rent, build year, available, km to centre |
| `show <id>` | Every extracted column (timestamps also in Helsinki time) plus lease-related `adData` fields |
| `sql "<query>"` | Runs a query and prints the rows. The CLI opens the database read-only, so a write fails |
| `export <dir>` | Writes `<id>.search.json` and `<id>.detail.json` for every listing |

## 8. Web UI
### 8.1 Server (`server/app.mjs`, started by `server/index.mjs`)
Fastify, listening on `127.0.0.1:3000` only, database opened read-only (`openDb(DB_PATH, { readOnly: true })`), no write routes. `buildApp({ db, config, noPhotos, staticDir })` is pure enough to test with `inject` (no port).

| Route | Returns |
|---|---|
| `GET /api/listings` | All listings (removed ones too, flagged), ordered by id: every extracted column except `*_json` and `*_hash`, plus `is_new` (in `v_new`), `removed`, `dist: {centre, station}`, `location_approx` and `pets_allowed`/`furnished` as `true`/`false`/`null` (both `'1'/'0'` and `'true'/'false'` are read), `thumb_url` (`search_json` `medias[0].imageSmallJPEG`) and `thumb_large_url` (`imageLargeJPEG`). |
| `GET /api/listings/:id` | The same row plus `title`, `description`, `photos` (`detail_json` `media[]` sorted by `ordernr`: `thumb`, `large`, `full`), `photo_count` and `raw: { search, detail }`. 400 for a non-numeric id, 404 when unknown. |
| `GET /api/meta` | `lastRun` (`startedAt`, `finishedAt`, `isInitial`, mode, status), `counts` (from `counts()`), `places`, `zips`, `windowCutoff`, `noPhotos` |
| other `/api/*` | 404 JSON |
| everything else | Static files from `web/dist`; unknown paths get `index.html`. Without a build, `/` answers with a hint to run `npm run ui`. |

Without a database file the API answers **503** `{ error: "no-database" }` and the UI shows the commands to run. With `--no-photos`, every photo URL is left out (`thumb_*` null, `photos` empty) and the UI shows placeholders, so an agent's browser never loads Oikotie's CDN; the raw JSON still contains the URLs as text. Response headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (map tile servers expect a Referer). Oikotie photos and links set `no-referrer` themselves.

### 8.2 Client (`web/`)
React + Vite. Components: `App`, `Header`, `Filters`, `RangeFilter`, `MapView`, `Legend`, `ListPanel`, `ListingCard`, `Photo`, `DetailDrawer`. All listings are loaded once; filtering and sorting are client-side. The pure filter, sort and URL logic is in `web/src/lib/filters.js` (unit-tested under Node); display formatting in `lib/format.js` (dates as 1.12.2026, times in Europe/Helsinki).

**Layout:** a header (the TAMPERE HOMES wordmark with a rune mark and the name in Elder Futhark; engraved counters "Shown N / M", "New K" (a button that toggles "only new" when K > 0), "Crawled <time>"; the build-year range inline; a **Filters** button with an active-count badge; and Reset), a full-height map, and a list panel 460 px wide on the right. The other filters open in a panel under the header (full screen on phones). Below 900 px the list stacks under the map. M counts removed listings only while they are shown.

**Map** (`react-leaflet`, centred on Keskustori, zoom 13)
- One circle marker per listing, shaded by build year in five bins (before 1960, 1960–1989, 1990–2009, 2010–2019, 2020+; ice → fjord blue) plus a neutral shade for unknown years, with a legend. Markers are managed directly in Leaflet; colours come from CSS classes (`mk-y0…5`), so hover only toggles classes and radii.
- New listings get a halo ring (`mk-halo`).
- Listings with `location_approx = 1` get a hollow, dashed marker, an "approximate location" note on the card and in the detail, and "≈" on their distances.
- Pins for each `config.places` entry (navy diamonds with labels).
- Optional overlay (off by default): the 17 postal areas from `web/public/postal-areas.geojson` (Statistics Finland Paavo `pno_2026`, CC BY 4.0, credited in the attribution), in a pane below the markers, with a zip-and-name tooltip.
- Layer control (all keyless, each with attribution, each tinted by a CSS filter token `--tiles-*` to the night-forest palette): **Night** (default: Esri `Canvas/World_Dark_Gray_Base`, tinted forest green, with `World_Dark_Gray_Reference` labels in their own pane tinted frost), **Forest (satellite)** (Esri `World_Imagery`, darkened, with `Reference/World_Boundaries_and_Places` labels) and **Terrain** (OpenTopoMap, darkened). On Night, Esri `Elevation/World_Hillshade_Dark` is blended in (overlay, 55 %) so Pyynikki ridge and the Pispala slopes read as real terrain. A soft vignette darkens the map edges; a metric scale bar sits bottom-right. The legend shows the build-year colours and expands ("More") to the other marker styles and the runes. CARTO Voyager/Positron were the original choice, but since November 2026 their tiles return an "API key required" placeholder; the National Land Survey (MML) background map also needs a key (both checked 2026-11-11).
- A `ResizeObserver` calls `invalidateSize()` whenever the map's container changes size.
- **Shared points are spread out** (`web/src/lib/spread.js`): homes in one building share one coordinate (2026-11-11: 158 of 381 listings in 48 groups, up to 10 per point). Each group is laid out on a ring of pixels around the true point (radius grows with the group so markers never overlap), marked by a faint dashed circle, and re-laid out on every zoom. Spreading is by pixels, so the true point is always the ring's centre.
- **Fit to N homes** button (under the zoom buttons) fits the map to the current list.
- Shortlisted homes get a thick dark outline (`is-saved`); the legend explains every marker style.
- The base layers use `maxNativeZoom` so a tile set with fewer zoom levels (Esri light grey: 16) is upscaled instead of going blank at zoom 17–19.

**List panel:** two layouts, switched with a Rows / Cards toggle (remembered in the browser, key `tcb.listView.v1`). **Rows** (default, the user wants many homes on screen): about 77 px per home, so 9 are fully visible at 1440 × 900; a small photo, the build year in carved capitals, district and street, size · rooms · layout on one line (long layouts end in "…"), then ᛞ available, ᛟ km to Keskustori, ᚱ km to the station (the same runes mark those places on the map), the rent quietly at the right with €/m² under it, the star and New / Removed tags. Keyboard: with a row focused, ↑/↓ move to the next or previous home (focus also highlights its marker), Home/End jump to the ends, Enter opens it. **Cards**: the large-photo layout, with the build year and address set over the darkened foot of the photo. In both, the left edge of each home is coloured like its marker (build year), tying list and map together. Sort: build year (newest first, default), size, rent, available date, distance to centre, distance to station, newest listing.

**Hover sync:** card hover (or keyboard focus) → its marker grows, highlights, comes to the front and shows its tooltip. Marker hover → its card highlights and scrolls into view (instant, not smooth, so it keeps up with the pointer). Click on either → detail drawer; the selected marker stays highlighted and is panned into view.

**Filters** (all ranges are dual-handle sliders plus typed inputs, bounds from the data). A range is `[min, max]` with `null` meaning "no limit"; dragging an end back to its data bound clears it. Numbers commit on Enter or leaving the field; dates when complete. URL keys: `year=2010..2026` (either side may be empty), `rent`, `size`, `rooms`, `avail=2026-12-01..2027-01-15`, `nodate=0|1`, `zip=33100,33200`, `new=1`, `saved=1`, `removed=show`, `sort=…`, and `listing=<id>` for an open drawer; only values that differ from the defaults are written, and bad values are ignored.

| Filter | Default |
|---|---|
| Build year min–max (first, most prominent) | full range; listings without a year are included while the range is untouched |
| Rent min–max | full range |
| Size min–max | full range |
| Rooms min–max | full range |
| Available from–to, plus "include no date" | to 2027-01-31; no-date included |
| Postal codes (multi-select) | all |
| Only new | off |
| Only my shortlist (also the "★ Shortlist" chip above the list) | off |
| Hide removed | on |

"Reset" restores the defaults (the sort is kept). Rent, size and rooms also start untouched; a listing with no value for a touched range is excluded.

**Shortlist** (added 2026-11-11, not in the original plan): a star on every card and in the drawer. The shortlist is a list of card ids in the browser's `localStorage` (key `tcb.shortlist.v1`, `web/src/lib/shortlist.js`), so the server and the database stay read-only. It is per browser, follows other tabs (`storage` event), and the app works if storage is blocked (the list just isn't kept).

**Detail drawer** (non-modal, slides in on the right, Esc or × closes, focus moves to × and back; an open filters panel takes Esc first, and Esc in a typed range field only cancels that edit): ‹ › buttons and ←/→ keys step through the current filtered and sorted list ("3 / 42"; keys are ignored while typing, in the photo strip or on the map), and the list scrolls along; when the drawer opens, the map pans the marker clear of the drawer's overlap; a **gallery** at the top (a full-bleed hero photo that fades into the panel, ‹ › over it, an "i / n" counter, a row of thumbnails; ←/→ inside the gallery change the photo, the hero links to the full-size image; with `--no-photos` a placeholder and "N photos hidden"); district and postal area; address and ad title; shortlist star; New / Removed / Approximate tags; build year, size and rooms large; then layout, floor, available date and text, rent, water, electricity, deposit, pets, furnished, building type (shown as "code N (mapping unverified)"), distances, landlord or agent, listed, first seen, details fetched; the **lease text in full** (or a note that there is none); description; "Open on Oikotie" link; raw JSON (collapsed).

**States:** designed empty ("No homes match", with Reset), loading (skeleton cards) and error (API unreachable → `npm run ui`; no database → `npm run capture` and `npm run import`).

### 8.3 Visual design
_Redesigned 2026-11-11 (night) at the user's request: the first, white "Nordic property" look felt boring and cheap to them. They asked for something "based and styled" in the spirit of Nordic pagan / dark-folk artists (Heilung, Wardruna): forest green and ice blue instead of white, "metal, but also professional", evoking feeling, with a tighter list and a more atmospheric map._

- **Feel:** night in a northern forest. Dark, calm and weighty; carved stone and cold metal; runes as quiet ornament, never as a gimmick. Still a professional tool: real contrast, a clear hierarchy, dense data where it helps.
- **Palette:** night-forest greens for surfaces (`--c-night-*`, `--c-moss-*`), bone white for text (`--c-bone-*`), glacial ice for interaction and the newest buildings (`--c-ice-*`), brushed bronze for metal accents, the shortlist star and the place pins (`--c-bronze-*`), and a muted rust only for "removed". Build years run from deep forest teal (old) to glowing frost (new); every marker has a thin bone rim so all eras show on the green land and dark water.
- **Moments:** while the homes load, the 24 runes of the Elder Futhark turn slowly in a ring around ᛟ over the map ("Gathering the homes"); two faint aurora veils drift behind the header (38 s cycle); the build-year slider's track is coloured by era in the marker colours, with the unselected eras dimmed and notches at 1960 / 1990 / 2010 / 2020; on first load the first rows of the list rise in one after another (only once, so filtering stays instant). All motion stops under `prefers-reduced-motion`.
- **Materials:** a fine film grain (an inline SVG noise token) on the header, panels and list; engraved slider tracks with an ice-fill glow; bronze diamond slider handles; glass (blurred, translucent) map controls and legend; a frost line under the header; double rules around the drawer's key figures.
- **Tokens:** every colour, type size, space, radius, shadow, gradient, texture, tile tint and motion value is a CSS custom property in `web/src/styles/tokens.css`. Components use tokens only (no hex or rgb values in component styles; checked by grep).
- **Type:** self-hosted `@fontsource`: **Cinzel** (carved Roman capitals) for the wordmark, build years, key figures and section titles; **Barlow** for text; **Barlow Condensed** for labels, data and buttons (uppercase, tracked); **Noto Sans Runic** for Elder Futhark ornaments (the name "ᛏᚨᛗᛈᛖᚱᛖ · ᚺᛟᛗᛖᛋ", ᛟ for the centre, ᚱ for the station, ᛞ for the move-in date, ᛝ before section titles). Tabular figures for numbers.
- **Detail:** sharp corners (2–6 px radii), hairlines in moss green, subtle glows instead of heavy shadows; `prefers-reduced-motion` respected; visible keyboard focus (ice outline); WCAG AA contrast (checked 2026-11-11: every text colour is ≥ 4.5:1 on every dark surface, quiet text 6.3–8.4:1, rust 5.5:1, button and badge text 6.6–11:1).

**UI dependencies** (pinned exact): `dependencies` fastify 5.12.8 and @fastify/static 10.1.10 (the server); `devDependencies` react and react-dom 19.3.1, leaflet 1.9.4, react-leaflet 5.0.0, vite 8.3.7, @vitejs/plugin-react 6.3.0, @fontsource/cinzel, @fontsource/barlow, @fontsource/barlow-condensed and @fontsource/noto-sans-runic 5.3.0 (the build). The range slider is hand-built from two native range inputs, so there is no slider library.

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
| API (`test/api.test.mjs`) | Through Fastify `inject` on an in-memory DB with two synthetic runs: `is_new` only for the second run's additions, `removed` flag, thumbnails, distances, flags as booleans, no `*_json`/`*_hash` in the list route; detail photos sorted by `ordernr`, raw JSON, 404/400; `noPhotos` hides every photo URL; meta counts and cutoff; 503 without a database |
| UI helpers (`test/ui-lib.test.mjs`) | Shared-point grouping and ring layout (no overlaps up to 20 markers); shortlist store round trip, bad data, blocked storage; "only shortlist" filter and `saved=1` |
| UI logic (`test/filters.test.mjs`) | `web/src/lib/filters.js` and `format.js`: defaults (cutoff, no-date, unknown years, removed), both ends of every range, postal codes, only new, sorting with unknowns last, URL round trip and bad URL values, bounds snapping, formatting |

After the first real capture (user step), verify by hand:
- active rows = `found` in the run row;
- 3 listings spot-checked against Oikotie (rent, size, available date, lease text);
- `v_window` is a sensible subset.

The UI is checked in the browser against FR-26…33. Agent previews use `npm run ui -- --no-photos --port 3005` (`.claude/launch.json` entry `ui-no-photos`; port 3005 so it never collides with the user's own `npm run ui` on 3000). The New tag, halo and "Only new" are checked against a temporary synthetic DB with a seeded second run (`TCB_DB=<temp file> node server/index.mjs --port 3100`, launch entry `ui-test-db`), never by editing `data/listings.db`.

## 10. Build order
1. `package.json`, `config.json`.
2. `src/shared` + tests.
3. `db`, `normalize`, `import`, `rebuild`, `report`, `cli` + tests.
4. `capture/browser.js`, `capture/build.mjs` + tests.
5. **User:** first capture and import; verification.
6. Tighten columns with unverified formats; `npm run rebuild`.
7. Server and web UI; fetch the postal polygons; preview.

## 11. Security and privacy notes
- The server binds to `127.0.0.1`, serves read-only data and has no write routes.
- The capture script sends requests only to its own origin (Oikotie) and writes only one local download. It contains no data other than listing ids, hashes and timestamps from the local database.
- Raw API JSON includes landlord or agent contact details (`contact`, `company`). They stay in the local database and appear only in the local UI's raw-JSON view.
- Listing photos are loaded from Oikotie's CDN when the UI is open; this is the only network traffic the UI causes besides map tiles (OpenStreetMap, Esri). `--no-photos` turns the photos off. The postal-area polygons and fonts are served locally.

## 12. Open questions
See [02-data-source.md §9](02-data-source.md#9-unknowns) for unknowns about the source. Design questions left for later:
- **Extra typed columns.** Likely useful after the first capture: `fixed_term`, `fixed_term_end`, `housing_form`. They need no re-fetch (rebuild fills them).
- **Volatile detail fields.** If the detail JSON turns out to contain counters that change on every fetch (like `visits` on cards), they must be left out of `detail_hash`, or every refresh would store a new version. Check on the second capture.
- **Scheduling.** Explicitly deferred by the user.
- **Maanmittauslaitos base map.** Optional; needs a free API key.

## 13. Refinements over PLAN.md and HANDOFF.md
Small decisions made while writing this spec. None changes the agreed flow or guardrails.

| # | Refinement | Why |
|---|---|---|
| 1 | `runs` count columns are named `new_count`, `changed_count`, `removed_count`, `error_count` (plan: `new`, `changed`, `removed`, `errors`); `stopped_reason` added. | Avoids SQL keyword clashes; records why a run ended. |
| 2 | `is_initial` = "no complete full sweep existed before this run" (handoff: "no previous run"). | If the very first capture is stopped during the search, the second one would otherwise flag most listings as new. |
| 3 | `v_new` = first seen in the latest complete run **or any later incomplete run**, initial runs excluded. | New listings from a stopped run still show as new. |
| 4 | `sweepComplete` is evaluated for incremental searches too; "last run" for planning means the last run with a complete search. | A run stopped mid-search shouldn't shorten the next run's look-back. |
| 5 | Extra columns: `status`, `price_changed_at`, `floor_count`; `listing_versions` gains `run_id` and `detail_hash`. | Needed by the change log and the UI ("3/5" floors). |
| 6 | `detail_hash` is SHA-256 (import side only); the search-card hash stays FNV-1a 32-bit as agreed. | Only the card hash must also run in the browser. |
| 7 | Typed columns prefer the search card where both sources have the value. | The card is refreshed on every sweep; details can be up to 14 days old. |
| 8 | Concrete retry rules for 401, 5xx and network errors (§6.3). | The plan said "backoff" without numbers. |
| 9 | UC-5 (browse on the map) added to the plan's four use cases. | The UI is part of the agreed scope. |
| 10 | `npm run capture -- --max-details N` (added during implementation). | A cheap first trial (4 searches + 5 details) instead of a smoke test through an agent's browser. |
| 11 | Importer safety net for the status field (§7). | The "status ≠ 1 = removed" rule is unverified at scale. |
