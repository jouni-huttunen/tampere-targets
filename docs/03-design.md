# 03 · Design

_Version 1, 2026-11-10. Implements [01-requirements.md](01-requirements.md) against the source described in [02-data-source.md](02-data-source.md). Points where this document refines `PLAN.md` or `HANDOFF.md` are listed in [§13](#13-refinements-over-planmd-and-handoffmd)._

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
test/*.test.mjs          node:test, synthetic fixtures in test/fixtures/
server/index.mjs         Fastify: read-only JSON API + serves web/dist
web/                     React + Vite SPA
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
| `ui` | _(not added yet)_ build `web/`, start `server/index.mjs` on port 3000 |
| `ui:dev` | _(not added yet)_ Vite dev server with hot reload, `/api` proxied to Fastify |

`node:sqlite` in Node 26.13.0 prints no experimental warning, so no flag is needed.

**Environment overrides** (used by the dry runs; normally unset): `TCB_DB` (database file, default `data/listings.db`) and `TCB_REPORTS` (report folder, default `reports/`).

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
### 8.1 Server (`server/index.mjs`)
Fastify, listening on `127.0.0.1:3000` only, database opened read-only.

| Route | Returns |
|---|---|
| `GET /api/listings` | All listings: extracted columns, `is_new`, `thumb_url` (from `search_json` `medias[0].imageSmallJPEG`). No raw JSON. |
| `GET /api/listings/:id` | The columns plus `detail_json` and image URLs |
| `GET /api/meta` | Last run time, whether it was the initial crawl, counts (active, window, new, removed), config places and cutoff |
| everything else | Static files from `web/dist` |

### 8.2 Client (`web/`)
React + Vite. Components: `App`, `Header`, `Filters`, `RangeFilter`, `MapView`, `ListPanel`, `ListingCard`, `DetailDrawer`, `Legend`. All listings are loaded once; filtering and sorting are client-side. Filter state is serialised to the URL query.

**Layout:** a slim header (title, filters, "N of M homes · K new since <last crawl>"), a full-height map, and a list panel about 420 px wide on the right. Below about 900 px the list stacks under the map.

**Map** (`react-leaflet`, centred on Tampere)
- One circle marker per listing, shaded ice → glacier → fjord blue by build year, with a legend. Listings without a build year get a neutral shade.
- New listings get a soft halo ring.
- Listings with `location_approx = 1` get a distinct "approximate" marker (e.g. hollow or dashed) and an "approximate location" note on the card and in the detail; their distances are shown with "≈".
- Pins for each `config.places` entry.
- Optional overlay: the 17 postal areas from `web/public/postal-areas.geojson`.
- Layer control: CARTO Voyager (default), CARTO Positron, OpenStreetMap, each with attribution.

**List panel:** photo-led cards (large thumbnail; district and street; build year; m² and rooms; available date or "no date"; km to centre and station; rent in a quiet secondary style; "New" tag). Sort: build year (newest first, default), size, rent, available date, distance to centre, distance to station, newest listing.

**Hover sync:** card hover → its marker grows, highlights and comes to the front. Marker hover → its card highlights and scrolls into view. Click on either → detail drawer.

**Filters** (all ranges are dual-handle sliders plus number inputs, bounds from the data):

| Filter | Default |
|---|---|
| Build year min–max (first, most prominent) | full range; listings without a year are included while the range is untouched |
| Rent min–max | full range |
| Size min–max | full range |
| Rooms min–max | full range |
| Available from–to, plus "include no date" | to 2027-01-31; no-date included |
| Postal codes (multi-select) | all |
| Only new | off |
| Hide removed | on |

"Reset" restores the defaults.

**Detail drawer:** photo strip; rent, fees, deposit; size, rooms, floor; build year, building type; available date and text; lease text; pets, furnished; company; description; "Open on Oikotie" link; raw JSON (collapsed).

**States:** designed empty ("no homes match", with Reset), loading (skeleton cards) and error (API unreachable, no database yet with the command to run).

### 8.3 Visual design
- **Feel:** a premium Nordic property site: calm, airy, editorial. Photos, neighbourhood and build year lead; price is deliberately quiet.
- **Palette:** pure white surfaces, icy blue tints, glacier and fjord blues for accents, deep navy for text. No warm or loud colours, no decorative gradients.
- **Tokens:** every colour, type size, space, radius, shadow and motion value is a CSS custom property in `web/src/styles/tokens.css`. Components use tokens only (no hex values in component styles).
- **Type:** two self-hosted `@fontsource` families: a refined grotesk sans for UI and a display face for headings. Tabular figures for numbers.
- **Detail:** hairlines instead of boxes, generous whitespace, gentle fades; `prefers-reduced-motion` respected; visible keyboard focus; WCAG AA contrast.

**UI dependencies:** fastify, @fastify/static, react, react-dom, leaflet, react-leaflet, vite, @vitejs/plugin-react, two @fontsource fonts, and possibly a small accessible range-slider library (or a hand-built one).

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

After the first real capture (user step), verify by hand:
- active rows = `found` in the run row;
- 3 listings spot-checked against Oikotie (rent, size, available date, lease text);
- `v_window` is a sensible subset.

The UI is checked in the browser against FR-26…33.

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
- Listing photos are loaded from Oikotie's CDN when the UI is open; this is the only network traffic the UI causes besides map tiles.

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
