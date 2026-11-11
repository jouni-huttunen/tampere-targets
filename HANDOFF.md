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
| Git | On `main` with one commit (`a9325e0`: plan, handoff, repo setup). `git config user.name` is "Anonymous" (the user has been told). The `docs/` folder is **not committed yet** |
| Files | `PLAN.md`, `HANDOFF.md`, `.gitignore` (ignores `data/`, `reports/`, `dist/`, `web/dist/`, `*.db`, `oikotie-*.json`), `.nvmrc`. A `.claude/` folder exists (app-created) |
| Spec | **Written 2026-11-10:** `docs/01-requirements.md`, `docs/02-data-source.md`, `docs/03-design.md`. `docs/03-design.md` §13 lists 9 small refinements over this file and `PLAN.md` (e.g. `is_initial` and `v_new` definitions, `runs` column names); **the docs win** where they differ. Awaiting the user's review |
| Code | **Built 2026-11-10 (uncommitted):** `package.json`, `config.json`, `src/shared/*`, `src/{config,time,db,normalize,import,rebuild,report,cli}.mjs`, `src/capture/{browser.js,build.mjs}`, `test/*`. `npm test`: 58 passing. Dry run with fake data in a temp DB (env vars `TCB_DB`, `TCB_REPORTS`) covered capture build, import, re-import, a second run, every CLI command, rebuild and report. Docs are synced with the code (03-design §13 items 10–11). **Never run in a real browser yet.** No `ui` scripts or `server/`/`web/` yet |

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
1. ✅ **Done 2026-11-10:** `docs/01-requirements.md`, `docs/02-data-source.md` and `docs/03-design.md` (formal spec: use cases, FR/NFR with Given/When/Then, Finnish glossary, API reference, field map, design). Steps 2–5 are built too. **Step 6 trial done 2026-11-10:** run 1 = full sweep, 381 of 381 found, 5 details, 9 requests 3–4.7 s apart, no errors, status partial, initial. Real data revealed a placeholder point (64.5498, 29.5323) on 17 listings, now filtered in `normalize.mjs`; `npm run rebuild` was run on the real DB (backup in the session scratchpad). **Full capture done 2026-11-10/11:** run 2 = incremental (published=1, 25 found), 376 details, 377 requests, all 200, no errors, status ok, 25 min (one 7-min gap, likely a background tab). DB now: 381 active, all with details, 380 in `v_window`, 0 new, 0 removed. Step-6 checks: active = found (381) ✅, `v_window` sensible ✅, user spot-check of 3 listings pending (24760731, 24705365, 24716849). Data findings are in `docs/02-data-source.md` §9 (move-in dates often only in text, lease type only in text, placeholder coordinates). **Next:** either parse `availabilityInfo` into a derived move-in date, or step 7 (web UI); explain the flow to the user first.
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

## 9. Decisions and findings after the full capture (2026-11-11)
- **Lease type is NOT a filter** (user decision). The lease text (`lease_text` = `adData.rentTermInfo`) is only shown in the listing detail so the user can read and verify it.
- **17 listings without a location** (Oikotie placeholder point) sit in 7 buildings: Lapintie 10 A (33100), Winterinraitti 4-6 ×5 (33270), Halkoniemenkatu 5 A/C (33410), Pohjolankatu 22-28 C and Sarvijaakonkatu 15-17 A/B ×3 (33540), Hissikatu 1 A/B ×5 (33900). Full street addresses are present. **Resolved (user chose postal-code centre):** `config.areas` now carries each code's centre (Oikotie's own `address.zipCode.coordinates`); `normalize.mjs` falls back to it and sets the new column `location_approx = 1` (migration 2). The real DB was rebuilt: 0 listings without a location, 17 approximate. The UI must mark them as approximate (03-design §8.2). External geocoding was not used.
- **Move-in buckets, "think later"** (user's words): a scratch classifier (date field first, else `availabilityInfo` text: heti / ISO date / d.m.yyyy / d.m. / Finnish month names / sopimuksen mukaan) put 375 of 381 into Now (<1.12.2026) 201, December 144, January 28, Later 2; Unknown 6 (3 by agreement, 1 no text, 2 unrelated text). Not in the project yet; rebuild the classifier from this description when the user asks.

## 8. Open questions and unknowns
- How long the tokens last, and whether the page's tokens rotate during a 13-minute capture. If you see 401s mid-run, re-read the meta tags (they don't change without a reload) or ask the user to reload the page and re-run; the state makes the re-run cheap.
- Chrome or Edge may show a "multiple downloads" or "allow downloads" prompt for the Blob download, possibly only once.
- **Background-tab throttling:** Chrome limits chained timers to about one per minute in tabs hidden for more than 5 minutes, so the user must keep the tab in the foreground. Show this in the panel.
- The `buildingOverrideBuildingType` code mapping is unverified.
- Firefox hasn't been tested (Chrome and Edge are the targets).
- Move-in dates: many details have `availabilityDate` null and the date only in `availabilityInfo` text ("heti", "Vapautuu: 30.11.2026"). Consider parsing it after the full capture (see `docs/02-data-source.md` §9).
