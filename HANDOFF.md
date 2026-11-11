# Handoff: Tampere apartment finder

_Last updated 2026-11-11. Read this first, then `PLAN.md` (the approved spec). Where they differ, this file wins on the **current state** and `PLAN.md` wins on the **target design**. The formal spec is `docs/01–03`; `docs/03-design.md` wins over `PLAN.md` where they differ (its §13 lists why)._

## 0. Start here: release 1.0.0 (web UI done)
**Status 2026-11-12:** the user reviewed the dark Nordic-pagan redesign ("Now it is way better") and asked for a commit tagged as the 1.0.0 release. Committed and tagged `v1.0.0` on `main` (version 1.0.0 in `package.json`). `npm test`: **85 passing**. Next steps are the user's call; open items are listed at the end of this section.

**Redesign (2026-11-11, second night; the user's brief, nearly verbatim: "it looks so boring… cheap… does not evoke any feelings"; take inspiration from Heilung and Wardruna; forest green and ice blue instead of pure white; "metal, but also professional"; the right-hand list "must be tighter… not very useful unless I see multiple apartments"; "find another map service"; "really put weight on the UI and UX"):**
- **New look**, all in tokens: night-forest surfaces with film grain, bone text, glacial ice for interaction, brushed bronze for metal accents; Cinzel carved capitals, Barlow / Barlow Condensed, Elder Futhark runes (Noto Sans Runic) as ornament; engraved slider tracks with bronze diamond handles; glass map controls; double rules in the drawer. Details: `docs/03-design.md` §8.3.
- **Tight list:** compact rows (about 77 px; 9 homes fully visible at 1440 × 900) by default, with a Rows / Cards toggle; each row's left edge has its marker's build-year colour.
- **Maps:** Night (Esri dark canvas tinted forest green, frost labels; default), Forest (darkened satellite imagery with labels) and Terrain (OpenTopoMap, darkened), plus a vignette. All keyless and checked in the pane. MML's background map needs a key, CARTO too.
- **Markers:** deep teal (old) to glowing frost (new), each with a thin bone rim so every era shows on the green land; place pins are runes in bronze diamonds (ᛟ Keskustori, ᚱ station), which the list reuses for distances (and ᛞ for the move-in date).
- **Checked:** desktop 1440 × 900 and phone 375 px screenshots in the pane (Night, Forest, Terrain, drawer, filters panel); no horizontal scroll on the phone; WCAG AA for every text colour on every surface; no raw colours outside `tokens.css`; 84 tests pass. The agent preview now runs on **port 3005** because the user had their own `npm run ui` on 3000 (left running).
- **Second pass the same night:** a photo **gallery** in the drawer (hero photo fading into the panel, ‹ ›, counter, thumbnails; ←/→ inside it change photos); a **rune-circle loader** (the Elder Futhark turning around ᛟ while the API answers); **aurora** veils drifting behind the header; the **build-year track coloured by era** (marker colours, unselected eras dimmed, notches at 1960/1990/2010/2020); photo **cards with text over the photo**; a metric scale bar. All motion stops under reduced motion. Checked with a synthetic DB whose "photos" are generated SVG landscapes (no Oikotie requests), and the loader through a throwaway proxy that delays `/api`.
- **Third pass:** hillshade relief blended into the Night map, a compact legend with a "More" toggle, and a one-time staggered entrance of the first list rows.
- **Fourth pass (while waiting for the user's review):** €/m² in every row and a "Rent per m², lowest first" sort (`sort=perm2`); ↑/↓/Home/End keyboard browsing of the list; the header's "New" counter toggles "only new" when there are new homes. 85 tests pass. Data note: the cheapest listing by €/m² is 3.5 €/m², probably a wrong size or an unusual listing; worth a look.
- **Reviewed 2026-11-12:** the user approved the redesign. Still open (minor): whether the runes-as-icons in the rows read well, whether the satellite map should be the default, real Oikotie photos in the new layouts (only the user's browser loads them), and the 3.5 €/m² listing.

**Overnight work, first night (the user said "build the app the best you can" and went to sleep; tell them in the morning, they haven't seen these yet):**
- **Shared points spread out:** 158 of 381 listings share a coordinate with others (48 buildings, up to 10 homes), so only the top marker could be hovered. Groups now sit on a small ring around the true point with a faint dashed circle (`web/src/lib/spread.js`).
- **Drawer prev/next:** ‹ › buttons and ←/→ keys step through the current list ("3 / 42"); the list follows.
- **Fit to N homes** button on the map.
- **Shortlist** (new feature, not in the plan): a star on cards and in the drawer, a "★ Shortlist" chip and an "Only my shortlist" filter (`saved=1`), and a dark outline on the map. Stored in the browser's localStorage only (`tcb.shortlist.v1`); the server and DB stay read-only. Easy to remove if unwanted.
- **Fixes:** the Esri light-grey map went blank past zoom 16 (now upscaled); the quiet text colour was darkened slightly to pass WCAG AA on tinted backgrounds. A code review found 8 issues, all fixed: a photo that failed once stayed a placeholder when the drawer moved to the next listing; one Esc closed the filters panel and the drawer together (and an Esc inside a range field closed them too); a selected marker could hide under the drawer; a screen-reader live region spammed while dragging; a bad `--port` gave an obscure error; plus two small cleanups.
- **Later the same night:** a clear message (and exit code 1) when port 3000 is already in use; a crash screen with Reload instead of a blank page (`ErrorBoundary`); at phone width, the drawer is anchored to both edges, and the list bar wraps (it was 416 px wide, which made phones zoom out); a short `README.md` with the everyday commands.
- **Not verifiable in the agent's pane:** the pane runs no animation frames while hidden, so the animated "pan marker clear of the drawer" couldn't be watched; the logic uses Leaflet's documented `panInside` padding options.

**What exists now:** `server/{app,start,index,dev}.mjs`, `web/` (Vite + React app; `web/public/postal-areas.geojson` fetched once, 17 of 17 zips, 18 KB, CC BY 4.0), `test/api.test.mjs`, `test/filters.test.mjs`, `test/ui-lib.test.mjs`, the npm scripts `ui`, `ui:build` and `ui:dev`, UI dependencies pinned in `package.json`, and `.claude/launch.json` with `ui-no-photos` (`npm run ui -- --no-photos`, port 3000) and `ui-test-db` (attaches to port 3100). `docs/03-design.md` §2/§8/§9/§11 describe it as built.

**Checked in the pane** (real DB with `--no-photos`, and a temporary synthetic DB with a seeded second run): 380 markers = 380 cards = `v_window` by default (381 active; the one hidden is available 2027-03-26, after the default cutoff), 17 hollow approximate markers; build year 2010.. → 97, 2010..2015 → 25 (both ends honoured), list and markers shrink together and the URL updates; card↔marker hover sync both ways; sort by build year newest first with unknown years last; the drawer shows the lease text, the raw JSON and the right Oikotie link, and opens from a `?listing=` URL; empty state and Reset; postal chips; no-date toggle; three base maps load; postal overlay with credit; 375 px has no horizontal scroll; New tag, halo, "Only new" and "show removed" on the test DB; **no requests to Oikotie** from the pane; no raw colours outside `tokens.css`.

**Changed from the spec while building (tell the user):**
- **CARTO base maps now need an API key** (tiles are an "API KEY REQUIRED" placeholder, checked 2026-11-11). The base maps are now OpenStreetMap (default), Light grey (Esri) and Streets (Esri). Open question for the user: get a free CARTO key, use another provider, or keep these.
- Fonts: now Cinzel + Barlow + Barlow Condensed + Noto Sans Runic (was Inter + Instrument Serif). The slider is hand-built (no library).
- The rest of the filters sit in a panel under the header; only build year is in the header itself.

**Not verified:** real photos (by design, only the user's browser loads them). `npm run ui:dev` was started once: Vite answers on 5173 and the `/api` proxy reaches the real DB (381 active); hot reload wasn't exercised.

**Next:** the user reviews the UI in their own browser (`npm run ui`, then http://localhost:3000). Commit only when asked (branch → commit → fast-forward `main` → push, §2).

---
_The rest of §0 is the original brief for this step, kept for reference._

**Before writing any code:** explain the user-facing flow to the user and get an explicit go-ahead. Cover what they'll run, what they'll see, how the filters behave, and the dependencies you'll add. This is their standing rule (§7); don't treat an ambiguous "ok" as approval.

**Where the spec lives (read in this order):**
1. `docs/03-design.md` §8 (server routes, components, layout, map, list, hover sync, filter table with defaults, detail drawer, states, visual design), §2 (file layout and npm scripts) and §11 (privacy).
2. `docs/01-requirements.md` FR-26…FR-33 (acceptance criteria, Given/When/Then) and NFR-03, -05, -12, -13.
3. `PLAN.md` §5 (design direction in the user's own framing: a premium Nordic property site, white and icy blues, photo-led, price de-emphasised, build year first) and the "UI in the browser pane" checks under Verification.

**Already decided (don't re-ask):**
- **Stack:** Fastify + @fastify/static, React + Vite (+ @vitejs/plugin-react), leaflet + react-leaflet, two `@fontsource` families, and optionally a small accessible range-slider library (or hand-built; implementer's call).
- **Dependencies only for the UI** (NFR-05): capture, import, DB and CLI stay Node built-ins only.
- **Server:** `server/index.mjs` binds `127.0.0.1:3000`, opens the database read-only (`openDb(DB_PATH, { readOnly: true })` from `src/db.mjs`, `DB_PATH` from `src/config.mjs`, which honours `TCB_DB`), and has no write routes. Routes: `GET /api/listings`, `GET /api/listings/:id`, `GET /api/meta`; everything else serves `web/dist`.
- **Scripts:** `ui` builds `web/` and starts the server; `ui:dev` runs Vite with hot reload and proxies `/api` to Fastify. Update the npm-scripts table in `docs/03-design.md` §2 (it says "not added yet").
- **Lease type is not a filter.** Show `lease_text` in full in the detail drawer (FR-32).
- **Approximate locations:** rows with `location_approx = 1` (17 listings) get a distinct hollow or dashed marker, an "approximate location" note, and "≈" on their distances.
- **"New"** = listed in `v_new`. After the current two runs it's empty (run 1 was initial, run 2 found nothing new), so test the New tag, halo and "Only new" toggle against a **temp test DB** with a seeded later run (use `TCB_DB`), never by editing `data/listings.db`.
- **Postal polygons:** fetch the 17 polygons **once** from the Statistics Finland Paavo WFS (URL in §4, CC BY 4.0, attribution required), filter to the 17 zips in `config.json`, and save them as `web/public/postal-areas.geojson`. That file is public data and may be committed.
- **Preview:** add a `.claude/launch.json` entry for `npm run ui` (port 3000) and check the UI in the built-in browser pane against FR-26…33 and the PLAN Verification list. It doesn't exist yet; `.claude/` only holds `settings.local.json`.

**Ask the user before you do these:**
- **Listing photos come from Oikotie's CDN** (`cdn.asunnot.oikotie.fi`). Previewing the real UI in the agent's built-in browser would make that browser load up to ~380 thumbnails from Oikotie, and Oikotie's robots.txt opts out of Anthropic agents (§3). Suggest an env flag (e.g. `TCB_NO_PHOTOS=1`) that swaps photos for placeholders during agent previews, or previewing only with the synthetic test DB, and let the user choose. The user's own browser loading photos is fine.
- **Font choice and the slider library**, if you want the user's taste on them. Otherwise pick and mention it in the flow explanation.
- **Commits:** none unless asked. When asked, branch off `main` first, then fast-forward `main` and push (see §2, Git row).

**Data facts for the UI** (real DB, 2026-11-11, 381 listings):

| Thing | Fact |
|---|---|
| Columns | `card_id, url, status, first_seen_at, first_seen_run_id, last_seen_at, removed_at, published_at, published_sort_at, price_changed_at, address, district, zip, lat, lon, rent_eur, size_m2, rooms, room_config, build_year, building_type, floor, floor_count, available_date, availability_text, lease_text, deposit_eur, water_fee, electric_fee, pets_allowed, furnished, company_name, search_json, search_hash, search_fetched_at, detail_json, detail_hash, detail_fetched_at, dist_centre_km, dist_station_km, location_approx`. The `dist_*` columns are added from `config.places` by `openDb` (non-read-only) via `distanceColumn(place)` in `src/normalize.mjs`. |
| Build year | 1905–2026; **40 listings have none**. While the build-year range is untouched they stay included (03-design §8.2). |
| Rent / size / rooms | 480–1400 € / 40–136 m² / 1–5 rooms (none missing) |
| Available date | **136 have none** (date only in `availability_text`, e.g. "heti"); dates range 2025-08-31…2027-03-26. Show `availability_text` when there's no date. |
| Lease text | present on 186 listings |
| Pets / furnished | stored as text `'1'`, `'0'` or NULL (show unknown as "—"). Synthetic test fixtures use `'true'`/`'false'`, so handle both. |
| Building type | codes 1 (359), 256 (19), 2 (3); the mapping is unverified (1 is probably kerrostalo). Show the code or "unknown" rather than guess. |
| Distances | 0–5.58 km to Keskustori. `water_fee` is free text (a number or text such as "Vesimaksu: 30.00 €/kk/hlö"). |
| Thumbnail | `search_json` → `medias[0].imageSmallJPEG` (330×206); also `imageLargeJPEG` and WebP variants |
| Detail photos | `detail_json` → `media[]` (sorted by `ordernr`), each with `url_full`, `url_large`, `url_thumb` |
| Timestamps | stored as UTC ISO; display with Europe/Helsinki (`src/time.mjs` has `helsinkiDate`/`helsinkiDateTime` for the server side) |
| Runs | 2 runs, both complete. `GET /api/meta` should report the latest run time and `is_initial`. |

**Privacy:** listing data stays local (NFR-03). Don't put listing data in hosted artifacts or commits; `data/`, `reports/`, `dist/` and `web/dist/` are git-ignored. The GitHub repo is private, but `HANDOFF.md` already names 3 listing ids and 7 street addresses (§6, §9), so remove them if the repo is ever made public.

**Done when:** `npm run ui` serves the UI on `http://localhost:3000`; FR-26…33 hold in the browser pane; `npm test` still passes (add tests for the API's row shaping, e.g. `is_new`, `thumb_url`, no raw JSON in the list route, using a temp DB); and `docs/03-design.md` §2/§8 plus this file reflect what was built.

## 1. What this project is
The user moves to Tampere by the end of January 2027 and needs a rental. This tool collects Oikotie rental listings into a **local SQLite DB** and offers a **local map and list web UI** for browsing. The current phase is **data retrieval plus browsing**; scheduling is explicitly out of scope ("I will define it later").

**User's requirements**
- **Content filters:** size ≥ 40 m² and rent ≤ 1400 €/month. These are the **only** filters applied when fetching.
- **Area:** 17 Tampere postal codes within about 5 km of Keskustori (table in §4).
- **Everything else is filtered locally** by the user (move-in date, lease type, housing form…). Store **all** data (full JSON) so no re-fetch is ever needed to try a new filter.
- **Default convenience view:** `v_window` = `available_date IS NULL OR available_date < '2027-02-01'`.
- **Commute helpers:** `dist_centre_km` (Keskustori 61.4978 N, 23.7610 E) and `dist_station_km` (railway station 61.4983 N, 23.7737 E).
- **"New" means new since the last crawl;** the initial crawl flags nothing as new.
- **UI:** map plus side list with hover sync both ways, min–max range filters (build year is the most important to the user; they like new buildings). The look was first a white "premium Nordic" design (`PLAN.md` §5); on 2026-11-11 the user rejected it as boring and cheap and asked for a dark **Nordic pagan / dark-folk** look (Heilung, Wardruna): forest green and ice blue, "metal, but also professional", plus a much tighter list. Current spec: `docs/03-design.md` §8.2–8.3.

## 2. Current state (done)
| Item | State |
|---|---|
| Node | **v26.13.0** (npm 11.20.0) from the **official nodejs.org MSI** (checksum and OpenJS signature verified), installed system-wide in `C:\Program Files\nodejs` on 2026-11-11. No version manager. `.nvmrc` still records the version. **nvm-windows was uninstalled 2026-11-11 at the user's request ("legacy"); don't reinstall it or use winget.** An empty `C:\nvm4w` folder is left over (the agent's shell couldn't delete it; harmless) |
| Git | `main` = `a9325e0` (plan, handoff, repo setup) + `42a0a3e` (spec docs, all code and tests). Pushed 2026-11-11 to the private repo `https://github.com/jouni-huttunen/tampere-city-boy` (`origin`, `main` tracks `origin/main`). `git config user.name` is "Anonymous" (the user has been told). Workflow the user approved: short-lived branch → commit → fast-forward `main` → push. The local branch `capture-import-tooling` is a leftover at the same commit and can be deleted |
| Files | `PLAN.md`, `HANDOFF.md`, `.gitignore` (ignores `data/`, `reports/`, `dist/`, `web/dist/`, `*.db`, `oikotie-*.json`), `.nvmrc`. A `.claude/` folder exists (app-created) |
| Spec | **Written 2026-11-10:** `docs/01-requirements.md`, `docs/02-data-source.md`, `docs/03-design.md`. `docs/03-design.md` §13 lists 9 small refinements over this file and `PLAN.md` (e.g. `is_initial` and `v_new` definitions, `runs` column names); **the docs win** where they differ. Awaiting the user's review |
| Code | **Built 2026-11-10/11, committed in `42a0a3e`:** `package.json`, `config.json`, `src/shared/*`, `src/{config,time,db,normalize,import,rebuild,report,cli}.mjs`, `src/capture/{browser.js,build.mjs}`, `test/*`. `npm test`: **63 passing**. Used for real: two captures in the user's browser, imported into `data/listings.db` (381 listings, all with details). Docs are synced with the code. **Web UI built 2026-11-11, uncommitted** (§0): `server/`, `web/`, two more test files (78 passing) |

**PATH gotcha:** shells started from a process that predates a PATH change (e.g. the Claude desktop app's terminal tabs until the app is fully restarted) still have the old PATH, so `node` may be missing there. Permanent fix: fully quit and restart the app (or sign out and in). Per-shell fix:
```powershell
$env:Path = "C:\Program Files\nodejs;$env:APPDATA\npm;$env:Path"
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
- **Base maps:** OSM (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`), Esri `World_Light_Gray_Base` and `World_Street_Map` (`https://server.arcgisonline.com/ArcGIS/rest/services/<name>/MapServer/tile/{z}/{y}/{x}`). Attribution is required. **CARTO Voyager/Positron now need an API key** (2026-11-11: every tile is an "API KEY REQUIRED" image, even though HTTP is 200). `tile.openstreetmap.fr` (HOT) is blocked in the agent's browser pane, so it couldn't be verified there.
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
1. ✅ **Done 2026-11-10:** `docs/01-requirements.md`, `docs/02-data-source.md` and `docs/03-design.md` (formal spec: use cases, FR/NFR with Given/When/Then, Finnish glossary, API reference, field map, design). Steps 2–5 are built too. **Step 6 trial done 2026-11-10:** run 1 = full sweep, 381 of 381 found, 5 details, 9 requests 3–4.7 s apart, no errors, status partial, initial. Real data revealed a placeholder point (64.5498, 29.5323) on 17 listings, now filtered in `normalize.mjs`; `npm run rebuild` was run on the real DB (backup in the session scratchpad). **Full capture done 2026-11-10/11:** run 2 = incremental (published=1, 25 found), 376 details, 377 requests, all 200, no errors, status ok, 25 min (one 7-min gap, likely a background tab). DB now: 381 active, all with details, 380 in `v_window`, 0 new, 0 removed. Step-6 checks: active = found (381) ✅, `v_window` sensible ✅, user spot-check of 3 listings pending (24760731, 24705365, 24716849). Data findings are in `docs/02-data-source.md` §9 (move-in dates often only in text, lease type only in text, placeholder coordinates). **Next (decided 2026-11-11):** step 7, the web UI; see §0. The move-in classifier waits until the user asks (§9).
2. Add `package.json`:
   - `"type": "module"` and `"engines": {"node": ">=26"}`.
   - Scripts: `capture`, `import`, `rebuild`, `list`, `report`, `test` (`node --test`), `ui` and `ui:dev`.
   - Use `node --disable-warning=ExperimentalWarning` if `node:sqlite` warns.
3. Add `config.json` (areas, filters, places, window cutoff, pacing, refresh ages).
4. Write `src/shared/*` and its tests, then `src/db.mjs` (`node:sqlite` `DatabaseSync`, schema per `PLAN.md`), `normalize.mjs`, `import.mjs`, `rebuild.mjs`, `report.mjs` and `cli.mjs`, with tests on **synthetic** fixtures (don't commit real Oikotie JSON).
5. Write `src/capture/browser.js` and `build.mjs`. Test the built script under Node with a fake `document` and `fetch`.
6. **Hand over to the user** for the first real capture and import. Then verify: active rows = `found`, spot-check 3 listings, `v_window` count.
7. ✅ **Built 2026-11-11, released as v1.0.0 on 2026-11-12:** the web UI per `PLAN.md` §5 (Fastify + React + Vite + react-leaflet; design tokens in `web/src/styles/tokens.css`; fonts via `@fontsource`), the 17 polygons in `web/public/postal-areas.geojson`, `.claude/launch.json`, previewed. See §0. Waiting for the user's own review in their browser.

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
