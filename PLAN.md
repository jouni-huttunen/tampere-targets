# Tampere apartment finder — spec + data retrieval into a local DB

## Context
You move to Tampere by the end of January 2027 and need a rental of **≥ 40 m²** and **≤ 1400 €/month**, ideally with a lease starting 1.1.–25.1.2027 that runs indefinitely. Oikotie is the main source. This phase is about **data retrieval only**. Every listing in your chosen area that passes size and rent is fetched once, with all its JSON, into a local SQLite DB. All other filtering (dates, lease terms, housing form, …) you'll do locally with queries. Scheduling is out of scope for now.

Status 2026-11-10: Node 26.13.0 is installed through nvm-windows and the folder is a git repo (`main`, nothing committed). See `HANDOFF.md` for the current state and next steps.

### ✅ Decision: data is captured with a DevTools console script (decided 2026-11-10)
On 2026-11-10, Oikotie's API answered **403 to every non-browser client** (Node or PowerShell `fetch`), even with valid page tokens and cookies. The same calls work inside a real browser. **So there's no Node crawler**, and nothing may disguise itself as a browser (no spoofed User-Agent, no stealth headless browser). Oikotie's CSP also blocks pages from connecting to `http://localhost` (`default-src 'self' https: wss: 'unsafe-inline' 'unsafe-eval'`). Data therefore leaves the browser as a **downloaded file**.

**Flow (chosen by the user over a bookmarklet):**
1. `npm run capture` generates `dist/capture.js` with the config (17 zips + ids, size, rent, pacing) and the **current DB state built in** (last run time, last full sweep time, and per listing: search-card hash, detail fetched time, and whether it's in `v_window`). It also copies the script to the clipboard.
2. The user opens asunnot.oikotie.fi in their own Chrome or Edge, presses F12, opens Console and pastes. Chrome asks for `allow pasting` once per profile.
3. The script reads the `OTA-*` tokens from the page's meta tags and shows a progress panel. It runs a full sweep or an incremental search by the same rules as the update run below, fetches the due details one request at a time about 2 s apart, and downloads `oikotie-<UTC timestamp>.json`. `captureStop()` or the Stop button downloads a partial file. A 403 or 429 stops the run and saves what it has.
4. `npm run import [file]` (default: the newest `oikotie-*.json` in `%USERPROFILE%\Downloads`) loads the file into SQLite, writes the run row and the report. Importing the same capture twice is skipped (`runs.capture_id` is unique).

**Not chosen:** a bookmarklet (the user prefers DevTools), other sources, the official alerts-only route, or Claude driving the built-in browser (robots.txt opts out of Anthropic agents, it would need a live session for every update, and the JSON has no path into the DB).

Everything from normalize onward (DB, rebuild, views, new-since-last-crawl, web UI) is as specified below. Where the text below says "update run", read it as "capture script + import".

### What the scan found (verified 2026-11-08/09, re-checked 2026-11-10)
- **Re-check on 2026-11-10:**
  - 381 listings in the 17 codes. `published=1/2/4` returns 25, 28 and 97.
  - Detail JSON still has 379 `adData` keys, and search cards carry `data.buildYear`.
  - robots.txt is unchanged.
  - Node v26.13.0 is still the latest LTS, and nvm-windows is 1.2.2.
  - CARTO Voyager, CARTO Positron and OSM tiles load, and the Statistics Finland postal-area service (Paavo WFS) responds.
- **Search API:** `GET https://asunnot.oikotie.fi/api/search?cardType=101&locations=…&size[min]=40&price[max]=1400&limit=100&offset=N&sortBy=published_sort_desc` returns `{found, cards[]}`. `cardType=101` means rentals, and `limit=100` works. Search can't filter by move-in date or lease type.
- **Postal codes as locations:** `locations=[[<zipId>,5,"<zip>"]]`, with several zips allowed in one request (counts match the city-wide totals per code). For comparison, a whole city is `[[837,6,"Tampere"]]` (`386` also works).
- **Listing-age filter:** `published=1` means under 1 day, `2` under 2 days, `4` under a week. For your 17 codes that gave 4, 6 and 99 results against 379 in total. It filters on the **original** `meta.published`, so re-listed or bumped ads (an old `published` with a new `publishedSort`), price edits and removals never appear in it.
- **Detail API:** `GET /api/card/{cardId}` returns full JSON (about 380 `adData` keys plus `building`, `address`, `coordinates`, `company`, `priceData`, `media`, `meta.lastModified`, `status`). The fields you'll most likely query: `availabilityDate` (ISO), `availabilityInfo`, `rentTermInfo`, `fixedTerm*`, `size`, `rooms`, `securityDeposit`, `waterFee`, `electricFee`, `petsAllowed`, `rentFurnished`.
- **Timestamps:** search cards are UTC and detail JSON is Finnish local time (+2 h). Both are stored as UTC.
- **Auth:** each API request needs the headers `OTA-token`, `OTA-cuid` and `OTA-loaded`. Their values come from the `<meta name="api-token|cuid|loaded">` tags of any HTML page. **As of 2026-11-10, non-browser clients get 403 even with these headers** (see the open decision above).
- **Compliance:** robots.txt has `Disallow: /api*` and section 6 of the terms forbids storing content without consent. **You chose to run a personal scraper at your own risk.** Guardrails: the capture runs only in the user's own browser when they start it, one request at a time with about a 2 s delay and jitter. There are no attempts to get around blocking: no spoofed User-Agent, no headless or stealth browser, and no Claude-driven bulk capture. If blocked (403 or 429), the script stops and saves what it has. The data stays local and is never shared.

## Deliverables

### 1. Spec documents (written first)
- `docs/01-requirements.md`: purpose, actors, use cases (UC-1 Initial download, UC-2 Update run, UC-3 Query locally, UC-4 Track changes/removals), numbered FR/NFR with Given/When/Then acceptance criteria, and a Finnish glossary (*vapautuu, heti vapaa, sopimuksen mukaan, toistaiseksi voimassa oleva, määräaikainen, vakuus*).
- `docs/02-data-source.md`: the API findings above, request parameters, a field-reference table (API field → DB column / `json_extract` path), what is still unknown (how long tokens last), and the compliance notes with the guardrails.
- `docs/03-design.md`: architecture, database schema, update algorithm, refresh policy, error handling, web UI (layout, filters, API, base maps), file layout.

### 2. What gets crawled and what's filtered locally
- **Crawl scope:** your 17 postal codes within about 5 km of Keskustori (about 379 listings today). **Size ≥ 40 m² and rent ≤ 1400 € are the only content filters**, applied as Oikotie search params. Everything else is stored as is.

  | zip | Oikotie id | zip | Oikotie id | zip | Oikotie id |
  |---|---|---|---|---|---|
  | 33100 | 154182 | 33240 | 161014 | 33530 | 147887 |
  | 33180 | 158927 | 33250 | 155343 | 33540 | 156702 |
  | 33200 | 154198 | 33270 | 160050 | 33700 | 148730 |
  | 33210 | 154077 | 33410 | 163703 | 33800 | 157825 |
  | 33230 | 154580 | 33500 | 156055 | 33820 | 152760 |
  | | | 33520 | 159635 | 33900 | 157531 |

  The zips, ids, size and rent live in `config.json` (`areas: [{zip, id, name}]`). If a code has no known id, the tool finds it from any listing's `address.zipCode.cardId`.
- **Default view (local only, nothing is dropped):** `v_window` = active listings where `available_date IS NULL OR available_date < '2027-02-01'`. You do the finer filtering yourself on top of this or directly on `listings`.
- **Commute helper:** each listing gets two straight-line (haversine) distances:
  - `dist_centre_km` from Keskustori (61.4978 N, 23.7610 E)
  - `dist_station_km` from Tampere central railway station (61.4983 N, 23.7737 E)

  Both points live in `config.json` (`places: [{key, name, lat, lon}]`), so another place (e.g. a workplace) is one more entry, and `npm run rebuild` fills in its column offline.

### 3. Store everything once, no re-fetch
- Every listing in scope is stored with its full search-card JSON (`search_json`) and full detail JSON (`detail_json`). Storage is SQLite only (`data/listings.db`). Any raw field can be queried with `json_extract(detail_json,'$.adData.<field>')`. `node src/cli.mjs export <dir>` can dump the JSON files if you ever want them.
- `npm run rebuild` recomputes every extracted column from the stored JSON **without network access**, so adding a column never triggers a re-fetch.
- Images aren't downloaded; their URLs are kept in the JSON.

### 4. The tool (Node 26 LTS via nvm, plain JavaScript ESM, built-in `fetch`, `node:sqlite`, `node:test`)
- **Node version:** managed with **nvm for Windows** (`CoreyButler.NVMforWindows` 1.2.2 via winget). It's pinned to `26.13.0` in `.nvmrc` and `package.json` `engines`.
- **Crawler:** no runtime dependencies. better-sqlite3 is the fallback if `node:sqlite` falls short.

```
.nvmrc              26.13.0
package.json        scripts: capture, import, rebuild, list, report, test, ui, ui:dev   (engines: node >= 26)
config.json         areas (17 zips + Oikotie ids), size[min]=40, price[max]=1400, places (Keskustori, railway station),
                    window cutoff (2027-02-01), request delay, refresh ages, fullSweepEveryDays
src/shared/*.mjs         pure functions used by BOTH Node and the browser script: cardHash, planRun
                         (full vs published=1/2/4), detailsDue, time helpers. Unit-tested.
src/capture/browser.js   the in-page capture logic (tokens from meta tags, search paging, details, pacing,
                         backoff, progress panel, captureStop(), Blob download)
src/capture/build.mjs    `npm run capture`: inline src/shared + config + DB state into dist/capture.js (an IIFE),
                         copy it to the clipboard
src/import.mjs           `npm run import [file]`: capture file → DB (run row, upserts, versions, changes,
                         removals only after a complete sweep), then report
src/normalize.mjs        API JSON → listing row (extracted columns + raw JSON, UTC timestamps)
src/db.mjs               schema + migrations, upserts, versions, change log, views
src/rebuild.mjs          offline: recompute extracted columns from stored JSON
src/report.mjs           reports/YYYY-MM-DD.md (new listings in v_window, changes, removals, links)
src/cli.mjs              list window|new|removed, show <id>, sql "<query>", export <dir>
test/*.test.mjs          synthetic fixtures: normalize, date/UTC parsing, age-filter choice, removal logic
server/index.mjs         Fastify: JSON API over data/listings.db (read-only) + serves web/dist
web/                     React + Vite SPA (src/App.jsx, components/MapView.jsx, ListPanel.jsx,
                         Filters.jsx, DetailDrawer.jsx), public/postal-areas.geojson
data/listings.db, reports/, web/dist/   (gitignored)
```

**Database schema (SQLite):**
- `listings`: `card_id` PK, `url`, `first_seen_at`, `first_seen_run_id`, `last_seen_at`, `removed_at`, `published_at`, `published_sort_at`, address, district, zip, lat/lon, `dist_centre_km`, `dist_station_km`, `rent_eur`, `size_m2`, `rooms`, `room_config`, `build_year`, `building_type`, `floor`, `available_date`, `availability_text`, `lease_text`, `deposit_eur`, `water_fee`, `electric_fee`, `pets_allowed`, `furnished`, `company_name`, `search_json`, `search_hash`, `search_fetched_at`, `detail_json`, `detail_hash`, `detail_fetched_at`.
- `listing_versions` (`card_id`, `fetched_at`, `detail_json`): a snapshot every time the detail hash changes.
- `listing_changes` (`card_id`, `run_id`, `field`, `old`, `new`, `changed_at`): changes to rent, available date, lease text, status and removal.
- `runs` (`run_id`, `capture_id` UNIQUE, `started_at`, `finished_at`, `imported_at`, `mode` incremental or full, `sweep_complete`, `is_initial`, `age_filter`, `found`, `search_requests`, `detail_requests`, `new`, `changed`, `removed`, `errors`, `status`).
- Views: `v_active`, `v_window`, and `v_new`: active listings whose `first_seen_run_id` is the **latest successful run**, provided that run isn't the initial crawl. The first crawl (`is_initial = 1`) therefore flags nothing as new.

**Update run** (steps 1–4 run in the browser capture script, steps 5–6 in `npm run import`). Every request is logged in the capture file with its timestamp.
1. Get tokens from the page's meta tags.
2. **Incremental search:** the time since the last successful run's `started_at` (+ 2 h margin) picks the age filter: up to 24 h → `published=1`, up to 48 h → `published=2`, up to 7 days → `published=4`, longer or first run → full sweep. Usually that's 1 request. Listings not yet in the DB are new.
3. **Full sweep** of all search pages (4 requests for 379 listings) runs on the first run, with `--full`, after a gap of over 7 days, or when the last full sweep is older than `fullSweepEveryDays` (default 1). It catches re-listed or bumped ads, card-level price changes and removals. Only a complete sweep may mark listings missing as removed (`removed_at`); a listing that comes back has it cleared.
4. **Detail fetches** only for new listings, listings whose search card changed, `v_window` listings with details older than 2 days, and anything else older than 14 days (configurable). A detail that returns a non-active `status` or 404 also marks the listing removed.
5. Normalize, store a version if the hash changed, and log field changes.
6. Write the report and the run row.

The first full download is about 380 detail requests at roughly 2 s each, about 13 minutes, and it can resume where it stopped. After that an update run is 1–5 search requests plus details for new or changed listings.

### 5. Local web UI for browsing (Fastify + React + Vite + Leaflet)
**Design direction (the implementer owns the details).**
- **Feel:** a premium Nordic property site for high-income buyers who choose on vibe, not price: calm, airy and editorial, with Scandinavian restraint.
- **Palette:** pure white surfaces, icy blue tints, glacier and fjord blues for accents, and deep navy ink for text. No warm or loud colours, no gradients-for-decoration, and no clutter.
- **Design system:** I'll build one on CSS custom properties (colour, type scale, spacing, radius, elevation, motion) in `web/src/styles/tokens.css`, and every component uses only these tokens.
- **Typography:** self-hosted fonts via `@fontsource`, so there are no external font calls: a refined geometric or grotesk sans for UI and an elegant display face for headings. Tabular figures for numbers.
- **Photo-led:** large imagery, generous whitespace, soft hairlines instead of boxes, gentle motion (fades and eases, with `prefers-reduced-motion` respected).
- **Price de-emphasised:** neighbourhood, light, newness (build year) and photos lead; rent is shown quietly. Polished empty, loading and error states. Keyboard focus is visible and contrast meets WCAG AA.
- **Map styled to match:** a light base map with a subtle cool-blue tint, minimal custom markers (soft circles in shades of ice-to-glacier by build year) and a refined legend and layer switcher.

**Structure and behaviour.**
- **Layout:** a full-height map with a list panel on the side (about 420 px; it stacks under the map on narrow windows) and a slim header with filters and "N of M homes · K new since <last crawl time>".
- **Map:** Leaflet via `react-leaflet`, centred on Tampere, with one marker per listing (lat/lon from the search card). Marker shade follows **build year** (newer is deeper blue, with a legend). Pins for Keskustori and the railway station, plus an optional overlay of your 17 postal areas (Statistics Finland Paavo polygons, CC BY 4.0, saved once to `web/public/postal-areas.geojson`) help with orientation.
- **Base maps** (free, no exact geodata needed), switchable with a layer control:
  - **CARTO Voyager (default):** clean, readable street names, no key. Free for non-commercial use with attribution.
  - **CARTO Positron:** very light grey, so markers stand out most.
  - **OpenStreetMap standard:** most detail (stops, shops). Fine for light personal use under the OSM tile policy, with attribution.
  - **Optional later:** Maanmittauslaitos *taustakartta* (Finnish national map, best local detail; free CC BY 4.0, needs a free API key).
- **List panel:** photo-led cards. Each shows a large thumbnail (Oikotie CDN URL from the JSON), district and street, **build year**, m², rooms, available date (or "no date"), km to centre and to the station, and rent in a quiet secondary style. Sort by build year (newest first, the default), size, rent, available date, distance to centre, distance to station, or newest listing.
- **New since the last crawl:** listings in `v_new` get an elegant "New" tag on the card and a distinct marker (an icy halo ring). A "Only new" toggle filters to them, and the header shows the count. After the initial crawl nothing is flagged.
- **Hover sync:** hovering a list card enlarges and highlights its marker and brings it to the front. Hovering a marker highlights its card and scrolls it into view. Clicking either opens the detail.
- **Detail drawer:** a photo strip, key fields (rent, fees, deposit, size, rooms, floor, build year, building type, available date + text, lease text, pets, furnished, company), the description, a link to the Oikotie listing, and the raw JSON (collapsed).
- **Filters (all client-side; about 380 rows is instant). Every numeric or date filter is a min–max range,** using a dual-handle slider plus number inputs, with bounds taken from the data:
  - **build year min–max** (first and most prominent)
  - rent min–max
  - size min–max (m²)
  - rooms min–max
  - available date from–to (default to 31.1.2027), with an "include no date" toggle (default on)
  - postal codes (multi-select)
  - only new (toggle)
  - hide removed (default on)

  A "Reset" control clears everything. Filters are kept in the URL query, so a view can be bookmarked.
- **API (read-only, localhost only):**
  - `GET /api/listings` returns the extracted columns plus `is_new` for all listings (no raw JSON).
  - `GET /api/listings/:id` returns the columns plus `detail_json`.
  - `GET /api/meta` returns the last run time, whether it was the initial crawl, and counts.
- **Commands:** `npm run ui` builds `web/` and serves it plus the API on `http://localhost:3000`. `npm run ui:dev` starts Vite with hot reload and proxies `/api` to Fastify.
- **UI dependencies:** fastify, @fastify/static, react, react-dom, leaflet, react-leaflet, vite, @vitejs/plugin-react, and two @fontsource fonts. The range slider is either a small accessible library (e.g. `rc-slider`) or hand-built, the implementer's call. The capture, import and DB code stays dependency-free.

## Execution order
**Done (2026-11-10):** the plan was saved here, nvm-windows 1.2.2 and Node 26.13.0 are installed (`nvm use` worked without an admin prompt), and `git init -b main` was run with `.gitignore` and `.nvmrc`. The retrieval decision is the DevTools capture script.

**Next:**
1. ✅ Done 2026-11-10: `docs/01–03` (the spec), reflecting the DevTools capture flow. `docs/03-design.md` §13 lists small refinements over this plan.
2–6. ✅ Done 2026-11-10/11 (committed as `42a0a3e`): steps 2–5 built and tested, two real captures imported (381 listings), checks passed except the user's own 3-listing spot-check. Details in `HANDOFF.md` §2 and §6.
2. Add `package.json` (type module, engines, scripts) and `config.json`. No commits unless the user asks.
3. Write `src/shared` (pure, unit-tested), `src/db.mjs`, `src/normalize.mjs`, `src/import.mjs`, `src/rebuild.mjs`, `src/report.mjs` and `src/cli.mjs`, with tests on synthetic fixtures.
4. Write `src/capture/browser.js` and `src/capture/build.mjs`. Unit-test the run planning with a fake `fetch`.
5. **User step:** the user runs `npm run capture`, pastes it into DevTools on Oikotie in their own browser, then runs `npm run import`. **Claude must not run the capture itself through the built-in browser** beyond a tiny smoke test (at most 2 detail requests) agreed with the user.
6. Check the import: row counts match `found`, spot-check 3 listings, `v_window` is a sensible subset.
7. **Next (handoff in `HANDOFF.md` §0):** build the web UI (server + React app). Fetch the 17 postal-area polygons once into `web/public/postal-areas.geojson`, add a `.claude/launch.json` entry for `npm run ui`, and open it in the browser pane.

## Verification
- `npm test`: normalize picks the right fields from fixture JSON, converts both timestamp styles to UTC, and handles a missing `availabilityDate`. Age-filter choice: last run 20 h ago → `published=1`, 3 days → `4`, 8 days → full. Removal: a listing missing from an incomplete sweep is not marked removed, but one missing from a complete sweep is. The card hash is identical in Node and in the built browser script.
- `node dist/capture.js` can't run outside a browser, but a test loads it with a fake `document` and `fetch` and checks it plans the right requests and produces a valid capture file.
- After the first full run: `SELECT COUNT(*) FROM listings WHERE removed_at IS NULL` = `found` in the run row. Spot-check 3 listings in the browser against `node src/cli.mjs show <id>` (rent, size, available date, lease text). `SELECT COUNT(*) FROM v_window` returns a sensible subset.
- Importing the same capture file twice changes nothing. A second capture right after picks `published=1` (unless the daily full sweep is due), makes 1 search request, fetches almost no details and creates no false removals. `v_new` is empty after the initial crawl and lists only listings first seen in the latest non-initial run.
- With no network at all, `npm run rebuild` still recomputes every row from stored JSON and the counts are unchanged.
- **UI in the browser pane** (`npm run ui`):
  - Markers appear over Tampere and the count matches `v_active`.
  - Setting build year to 2010–2026 shrinks the list and the markers together, and the URL updates. Every range filter honours both its min and max.
  - After the initial crawl, nothing shows "New". After a second crawl that adds listings (or a test DB with a seeded second run), exactly those show the tag and halo, and "Only new" filters to them.
  - The UI uses only the design tokens (no stray hex colours in components), and a quick visual review of the screenshot shows the clean white and icy-blue look.
  - Hovering a card highlights its marker, and hovering a marker highlights its card and scrolls to it.
  - Sorting by build year puts the newest first.
  - Switching between the three base maps works.
  - Opening a detail shows photos and the raw JSON, and the Oikotie link is correct.
  - The phone-width layout stacks without horizontal scroll.
