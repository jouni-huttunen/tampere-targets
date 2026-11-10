# Handoff: Tampere apartment finder

_Last updated 2026-11-10. Read this first, then `PLAN.md` (the approved spec). Where they differ, this file wins on the **current state** and `PLAN.md` wins on the **target design**._

## 1. What this project is
The user moves to Tampere by the end of January 2027 and needs a rental. This tool collects Oikotie rental listings into a **local SQLite DB** and offers a **local map and list web UI** for browsing. The current phase is **data retrieval plus browsing**; scheduling is explicitly out of scope ("I will define it later").

**User's requirements**
- **Content filters:** size ≥ 40 m² and rent ≤ 1400 €/month. These are the **only** filters applied when fetching.
- **Area:** 17 Tampere postal codes within about 5 km of Keskustori (table in §4).
- **Everything else is filtered locally** by the user (move-in date, lease type, housing form…). Store **all** data (full JSON) so no re-fetch is ever needed to try a new filter.
- **Default convenience view:** `v_window` = `available_date IS NULL OR available_date < '2027-02-01'`.
- **Commute helpers:** `dist_centre_km` (Keskustori 61.4978 N, 23.7610 E) and `dist_station_km` (railway station 61.4983 N, 23.7737 E).
- **"New" means new since the last crawl;** the initial crawl flags nothing as new.
- **UI:** map plus side list with hover sync both ways, min–max range filters (build year is the most important to the user; they like new buildings), and a premium Nordic look (white and icy blues). Full spec in `PLAN.md` §5.

## 2. Current state (done)
| Item | State |
|---|---|
| nvm for Windows | 1.2.2 installed via winget. `NVM_HOME=C:\Users\JouniHuttunen\AppData\Local\nvm`, `NVM_SYMLINK=C:\nvm4w\nodejs` |
| Node | **v26.13.0** (npm 11.20.0), active through `nvm use 26.13.0`, pinned in `.nvmrc` |
| Git | `git init -b main` done. **Nothing committed.** `git config user.name` is "Anonymous", so mention it to the user before the first commit |
| Files | `PLAN.md`, `HANDOFF.md`, `.gitignore` (ignores `data/`, `reports/`, `dist/`, `web/dist/`, `*.db`, `oikotie-*.json`), `.nvmrc`. A `.claude/` folder exists (app-created) |
| Code | **None yet.** No `package.json`, no `config.json`, no `docs/` |

**PATH gotcha:** shells opened before the nvm install don't have node on PATH. In such a shell, prefix:
```powershell
$env:Path = "C:\Users\JouniHuttunen\AppData\Local\nvm;C:\nvm4w\nodejs;$env:Path"
```

## 3. The key decision: how data is retrieved
- **Oikotie returns 403 to every non-browser client** (Node or PowerShell fetch), even with valid `OTA-*` tokens and cookies. This was verified on 2026-11-10; on 2026-11-08 it still answered 401 only when tokens were missing. Inside a real browser the API works.
- **Oikotie's CSP** is `default-src 'self' https: wss: 'unsafe-inline' 'unsafe-eval'`. Inline scripts run, but **the page cannot connect to `http://localhost`**, so data must leave the browser as a **downloaded file**.
- **Chosen flow: a DevTools console script** (the user explicitly prefers this over a bookmarklet):
  1. `npm run capture` generates `dist/capture.js`, with config and current DB state inlined, and copies it to the clipboard (`Set-Clipboard` or `clip`).
  2. The user opens asunnot.oikotie.fi in their own Chrome or Edge, presses F12, opens Console and pastes. Chrome requires typing `allow pasting` once per profile.
  3. The script shows a progress panel, fetches as planned, and downloads `oikotie-<UTC timestamp>.json` to Downloads. `captureStop()` or the Stop button saves a partial file. A 403 or 429 stops the run and saves what it has.
  4. `npm run import [file]` defaults to the newest `oikotie-*.json` in `%USERPROFILE%\Downloads` and loads it into `data/listings.db`.
- **Hard guardrails (agreed with the user; don't change them without asking):**
  - Never build a crawler that disguises itself as a browser: no spoofed User-Agent, no Playwright or Puppeteer stealth, no headless workaround.
  - **Don't run the bulk capture yourself** through the built-in browser pane. Oikotie's robots.txt opts out of Anthropic agents (`ClaudeBot`, `anthropic-ai` → `Disallow: /`) and has `Disallow: /api*` for all bots. A tiny smoke test (at most 2 detail requests) is OK **only with the user's OK**.
  - One request at a time, about 2 s apart plus jitter. Stop on 403 or 429.
  - Data stays local and is never shared or published, so **don't put listing data in hosted artifacts**. Aggregates were OK.
  - The user accepted the ToS risk (Oikotie terms §6 forbid storing content without consent) for **personal use**.

## 4. Verified Oikotie facts (2026-11-08…10)
**Auth:** headers `OTA-token`, `OTA-cuid` and `OTA-loaded`, read from `<meta name="api-token">`, `<meta name="cuid">` and `<meta name="loaded">` on any Oikotie HTML page (`loaded` is a unix timestamp; the token lifetime is unknown).

**Search:**
```
GET /api/search?cardType=101&locations=<json>&size[min]=40&price[max]=1400
               &limit=100&offset=N&sortBy=published_sort_desc[&published=1|2|4]
→ { found, start, cards: [ { cardId, cardType, url, status,
      data: { description, rooms, roomConfiguration, price:"1 170 € / kk", size:"42 m²", sizeMin, sizeMax,
              buildYear, visits, visitsWeekly, … },
      location: { address, district, city, zipCode, latitude, longitude },
      meta: { published, publishedSort, priceChanged, contractType, listingType, vendorAdId, … },
      medias: [ { imageSmallJPEG, imageLargeJPEG, imageDesktopWebP, … } ], company: { companyName, … } } ] }
```
- `cardType=101` means rentals. `limit=100` works, so 381 listings take 4 pages.
- **Locations by postal code:** `[[<zipId>,5,"<zip>"]]`. Several codes can go in one array. The city is `[[837,6,"Tampere"]]`.
- **Age filter:** `published=1` is under 1 day, `2` under 2 days, `4` under a week (2026-11-10: 25 / 28 / 97 of 381). It keys on the **original** `meta.published`, so bumped or re-listed ads (with a new `publishedSort`), price edits and removals **don't** show up. That's why a full sweep is still needed.
- `visits` and `visitsWeekly` change constantly, so **exclude them from the card hash**.
- Search can't filter by move-in date or lease type.

**Detail:** `GET /api/card/{cardId}` returns top-level `cardId, status, published (Helsinki local!), meta{created,lastModified}, building{…}, adData{~379 keys}, address{city{cardId:386},zipCode{cardId,name},districts[],street…}, coordinates{latitude,longitude}, company, priceData{price}, media, contact`.
- **Useful `adData` keys:**
  - availability and lease: `availabilityDate` (YYYY-MM-DD or null), `availabilityInfo`, `rentTermInfo` (free text, often null), `fixedTerm`, `fixedTermEnd`, `fixedTermMonths`, `fixedTermContinuesAsIndefinite`, `minRentTimeMonths`
  - size and layout: `size`, `rooms`, `roomConfiguration`
  - costs: `securityDeposit`, `securityDepositInfo`, `waterFee`, `waterFeeInfo`, `electricFee`
  - other terms: `petsAllowed`, `rentFurnished`
  - building: `buildingOverrideBuildYear`, `buildingOverrideBuildingType` (code; only 1 = kerrostalo is likely, so treat the mapping as unverified), `floor`, `floorCount`, `apartmentCondition`
  - text: `title`, `description`
  - housing form: `habitationRentType`, `aiHabitationRentTypes`
- **Housing-form codes** (stored only, not filtered): 2 sublet, 3 Arava/interest-subsidised, 4 shared room (solu), 5 senior, 6 service housing, 7 employer housing, 8 student, 9 privately financed; code 1 also appears in data.
- **Timestamps:** search `meta.published` is **UTC**, while detail `published` and `meta.*` are **Europe/Helsinki local** (+2 h in winter, +3 h in summer). Convert with `Intl` (Europe/Helsinki), not a fixed +2.

**The 17 postal codes and their Oikotie location ids:**

| zip | id | zip | id | zip | id |
|---|---|---|---|---|---|
| 33100 | 154182 | 33240 | 161014 | 33530 | 147887 |
| 33180 | 158927 | 33250 | 155343 | 33540 | 156702 |
| 33200 | 154198 | 33270 | 160050 | 33700 | 148730 |
| 33210 | 154077 | 33410 | 163703 | 33800 | 157825 |
| 33230 | 154580 | 33500 | 156055 | 33820 | 152760 |
| | | 33520 | 159635 | 33900 | 157531 |

(Other Tampere ids, if the user widens the area: 33300=156680, 33310=161531, 33330=162355, 33340=161657, 33400=163722, 33420=160313, 33560=147928, 33580=149469, 33610=149876, 33680=166477, 33710=149053, 33720=152984, 33840=165389, 33850=166388, 33870=5080637, 34240=153960. Some listings have `address.zipCode.cardId = null`, but zip-filtered search still returns them.)

**Other sources that were checked and work:**
- **Base maps:** CARTO Voyager (`https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png`), CARTO Positron (`…/light_all/…`) and OSM (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`). Attribution is required.
- **Postal-area polygons:** Statistics Finland Paavo WFS, CC BY 4.0. Property `posti_alue`, name `nimi`; filter by municipality with the URL-encoded CQL filter `kunta='837'`.
  ```
  https://geo.stat.fi/geoserver/postialue/wfs?service=WFS&version=2.0.0&request=GetFeature
    &typeNames=postialue:pno_2026&outputFormat=application/json&srsName=EPSG:4326&CQL_FILTER=<url-encoded>
  ```

## 5. Contract between the capture script and the importer (design it this way)
Keep the planning logic in **pure functions in `src/shared/`**, used by both Node (tests, import) and the browser script; `build.mjs` inlines them into an IIFE. That keeps the card hash and the planning identical on both sides.

**State inlined into `dist/capture.js`** (built from the DB by `npm run capture`):
```json
{ "generatedAt": "ISO", "lastRunStartedAt": "ISO|null", "lastFullSweepAt": "ISO|null",
  "known": { "<cardId>": ["<searchHash>", "<detailFetchedAtISO|null>", 1 /* in v_window */] } }
```
**Config inlined:** the area list (`[[id,5,zip]]`), `sizeMin` 40, `priceMax` 1400, `delayMs` 2000, `jitterMs` 800, `fullSweepEveryDays` 1, `refreshWindowDays` 2, `refreshOtherDays` 14, `maxDetails` (e.g. 600).

**Run planning (`planRun`):**
- No state means full mode and the initial run.
- If the last full sweep is older than `fullSweepEveryDays`, or the gap since the last run is over 7 days, run a full sweep.
- Otherwise run incremental, with `published` chosen by gap + 2 h: up to 24 h → 1, up to 48 h → 2, up to 7 days → 4.

**Details due (`detailsDue`):**
- listings not in `known`
- listings whose card hash differs from the stored one
- listings with no detail yet
- listings in the window whose detail is older than 2 days, and other listings older than 14 days

**Card hash:** FNV-1a 32-bit (hex) over `JSON.stringify([price, size, sizeMin, rooms, description, buildYear, address, zipCode, published, publishedSort, priceChanged, status, firstImageUrl, mediaCount])`. Never include visits.

**Capture file `oikotie-<UTC>.json`:**
```json
{ "format": "tampere-city-boy/oikotie-capture@1", "captureId": "<uuid>",
  "startedAt": "ISO", "finishedAt": "ISO", "mode": "full|incremental", "ageFilter": null,
  "sweepComplete": true, "found": 381, "stoppedReason": null,
  "config": { "areas": [], "sizeMin": 40, "priceMax": 1400 },
  "searchCards": [ { "fetchedAt": "ISO", "card": { } } ],
  "details": { "<cardId>": { "fetchedAt": "ISO", "status": 200, "json": { } } },
  "requests": [ { "at": "ISO", "url": "/api/…", "status": 200, "ms": 312 } ],
  "errors": [] }
```
- `sweepComplete` is true only if every page was fetched **and** the number of cards equals `found`. **The importer marks listings removed only when `mode=full` and `sweepComplete`**; a listing that reappears gets `removed_at` cleared.
- A detail with HTTP 404, or a JSON `status` other than 1, marks the listing removed.
- `runs.capture_id` is UNIQUE, so re-importing the same file is a no-op. `is_initial` is set when the DB has no previous run, and `v_new` excludes the initial run.
- File size is about 8 MB for a full run.

## 6. Next steps (in order)
1. Write `docs/01-requirements.md`, `docs/02-data-source.md` and `docs/03-design.md` (formal spec: use cases, FR/NFR with Given/When/Then, Finnish glossary, API reference, field map, design). The content is mostly in `PLAN.md` and this file.
2. Add `package.json`:
   - `"type": "module"` and `"engines": {"node": ">=26"}`.
   - Scripts: `capture`, `import`, `rebuild`, `list`, `report`, `test` (`node --test`), `ui` and `ui:dev`.
   - Use `node --disable-warning=ExperimentalWarning` if `node:sqlite` warns.
3. Add `config.json` (areas, filters, places, window cutoff, pacing, refresh ages).
4. Write `src/shared/*` and its tests, then `src/db.mjs` (`node:sqlite` `DatabaseSync`, schema per `PLAN.md`), `normalize.mjs`, `import.mjs`, `rebuild.mjs`, `report.mjs` and `cli.mjs`, with tests on **synthetic** fixtures (don't commit real Oikotie JSON).
5. Write `src/capture/browser.js` and `build.mjs`. Test the built script under Node with a fake `document` and `fetch`.
6. **Hand over to the user** for the first real capture and import. Then verify: active rows = `found`, spot-check 3 listings, `v_window` count.
7. Build the web UI per `PLAN.md` §5 (Fastify + React + Vite + react-leaflet; design tokens in `web/src/styles/tokens.css`; fonts via `@fontsource`). Fetch the 17 polygons once into `web/public/postal-areas.geojson`, add a `.claude/launch.json` entry and preview it.

## 7. User preferences learned
- The user wants to be **told how something will work before implementation starts**. They stopped me once to ask for exactly that.
- They make decisions quickly and change scope in short messages, so read every answer literally. Examples: "drop all mentions of schedule", "only size and rent filter the crawl", "store ALL data".
- They prefer simple mechanisms and local filtering over clever rules.
- **No commits unless asked.**

## 8. Open questions and unknowns
- How long the tokens last, and whether the page's tokens rotate during a 13-minute capture. If you see 401s mid-run, re-read the meta tags (they don't change without a reload) or ask the user to reload the page and re-run; the state makes the re-run cheap.
- Chrome or Edge may show a "multiple downloads" or "allow downloads" prompt for the Blob download, possibly only once.
- **Background-tab throttling:** Chrome limits chained timers to about one per minute in tabs hidden for more than 5 minutes, so the user must keep the tab in the foreground. Show this in the panel.
- The `buildingOverrideBuildingType` code mapping is unverified.
- Firefox hasn't been tested (Chrome and Edge are the targets).
