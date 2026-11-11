# 01 · Requirements

_Version 1, 2026-11-10. Companion documents: [02-data-source.md](02-data-source.md) (the Oikotie API and compliance) and [03-design.md](03-design.md) (how the tool is built)._

## 1. Purpose
The user moves to Tampere by the end of January 2027 and needs a rental home. This tool collects Oikotie rental listings for a chosen area into a **local SQLite database** and offers a **local map and list web UI** for browsing them.

The guiding idea: **fetch broadly once, filter locally forever.** Only size and rent limit what is fetched. Every other choice (move-in date, lease type, housing form, build year…) is made locally, on stored data, without another request to Oikotie.

## 2. Scope
**In scope**
- Capturing listings from Oikotie with a script the user runs in their own browser.
- Importing capture files into a local database, with history (versions, changes, removals).
- Local querying through SQL views and a small CLI.
- A local web UI with a map, a list and filters.

**Out of scope**
- Scheduling or any automatic runs ("I will define it later").
- Other listing sources (Vuokraovi, Tori, landlords' own sites).
- Downloading images (only their URLs are stored).
- Notifications, e-mail, sharing, hosting or publishing any listing data.
- Contacting landlords or applying for homes.

## 3. Actors
| Actor | Role |
|---|---|
| **User** | Runs every command, pastes the capture script into their own browser, browses the results. The only human actor. |
| **Oikotie** (asunnot.oikotie.fi) | External system. Serves the search and detail APIs to the user's logged-out browser session. |
| **Capture script** | Runs inside the user's browser tab on Oikotie. Fetches and downloads a capture file. |
| **Local tool** | Node programs on the user's PC: build, import, rebuild, report, CLI, web server. |

## 4. Fixed parameters
| Parameter | Value |
|---|---|
| Listing type | Rentals (`cardType=101`) |
| Size | ≥ 40 m² |
| Rent | ≤ 1400 €/month |
| Area | 17 Tampere postal codes within about 5 km of Keskustori (list in [02-data-source.md §7](02-data-source.md#7-postal-codes-and-location-ids)) |
| Default window | Available date is unknown or before 2027-02-01 |
| Reference points | Keskustori (61.4978 N, 23.7610 E), Tampere railway station (61.4983 N, 23.7737 E) |

All of these live in `config.json`, not in code.

## 5. Use cases

### UC-1 Initial download
1. The user runs `npm run capture`. The script is built and copied to the clipboard.
2. The user opens asunnot.oikotie.fi in Chrome or Edge, opens DevTools → Console and pastes the script.
3. The script sweeps every search page, then fetches the detail of every listing (about 380 requests, about 13 minutes), showing progress.
4. The browser downloads `oikotie-<UTC timestamp>.json`.
5. The user runs `npm run import`. The database is created and filled; a report is written.

**Result:** every listing in scope is stored with its full JSON. Nothing is flagged as new.

**Variations:** the user stops early, or Oikotie blocks the run (403/429). A partial file is downloaded and can be imported; the next capture fetches only what is missing.

### UC-2 Update run
1. Same steps as UC-1. The built script carries the current database state, so it decides by itself what to fetch.
2. Usually: one full sweep of the search (4 requests) or one age-filtered search (1 request), then details only for new, changed or stale listings.
3. After import, listings first seen in this run are flagged **new**.

**Result:** the database reflects Oikotie as of the run; new, changed and removed listings are recorded.

### UC-3 Query locally
The user explores the data without any network access: through the views (`v_window`, `v_new`), the CLI (`list`, `show`, `sql`), or any SQLite client, including `json_extract` on the stored raw JSON.

### UC-4 Track changes and removals
After each import the user can see what changed since the previous run: new listings, rent or availability changes, and listings that disappeared (and any that came back).

### UC-5 Browse on the map
The user runs `npm run ui` and opens `http://localhost:3000`. They narrow the listings with range filters (build year first), compare them on the map and in the list, and open a listing's detail or its Oikotie page.

## 6. Functional requirements
Each requirement has at least one acceptance criterion in Given / When / Then form.

### 6.1 Capture (in the browser)

**FR-01 Build the capture script.** `npm run capture` writes `dist/capture.js`, with the configuration and the current database state built in, and copies it to the clipboard. `npm run capture -- --full` forces a full sweep; `npm run capture -- --max-details N` caps the details for one run (e.g. a 5-detail trial).
- *Given* an empty or missing database, *when* the user runs `npm run capture`, *then* `dist/capture.js` exists, plans an initial full run, and the clipboard holds the same text.
- *Given* a database with earlier runs, *when* the script is built, *then* it contains each active listing's id, search hash, detail fetch time and window flag.

**FR-02 Run only on Oikotie.** The script reads the `OTA-*` tokens from the page's meta tags and refuses to start anywhere else or twice.
- *Given* the script is pasted on a page that is not `asunnot.oikotie.fi`, *when* it starts, *then* it makes no request and shows a clear message.
- *Given* a capture is already running in the tab, *when* the script is pasted again, *then* the second copy does nothing.

**FR-03 Crawl scope.** Searches use only the 17 postal codes, `size[min]=40` and `price[max]=1400`. No other content filter is ever sent.
- *Given* any run, *when* its request log is inspected, *then* every search URL carries exactly these filters (plus paging, sorting and, in incremental mode, `published`).

**FR-04 Run planning.** The script chooses between a full sweep and an incremental search:
- first run, forced, last full sweep older than `fullSweepEveryDays` (1), or more than 7 days since the last run → **full**;
- otherwise **incremental**, with the age filter chosen from the time since the last run plus a 2 h margin: ≤ 24 h → `published=1`, ≤ 48 h → `published=2`, ≤ 7 days → `published=4`.
- *Given* the last run started 20 h ago and the last full sweep 20 h ago, *when* a run is planned, *then* it is incremental with `published=1`.
- *Given* the last run started 3 days ago and `fullSweepEveryDays` is set to 30, *when* a run is planned, *then* it is incremental with `published=4`.
- *Given* the last run started 8 days ago, *when* a run is planned, *then* it is a full sweep.

**FR-05 Search paging.** The script fetches every page (`limit=100`) of the planned search. The sweep counts as complete only if every page was fetched and the number of cards equals `found`.
- *Given* `found` = 381, *when* a full sweep finishes, *then* 4 search requests were made and `sweepComplete` is true only if 381 distinct cards were collected.

**FR-06 Details due.** A listing's detail is fetched only when it is new, its search card changed, it has no stored detail, or its stored detail is stale (older than 2 days for listings in the window, 14 days for the rest).
- *Given* a second capture started right after a complete import, *when* it runs, *then* it fetches at most a handful of details (only genuinely new or changed listings).

**FR-07 Pacing.** One request at a time, about 2 s apart with random jitter.
- *Given* any run, *when* its request log is inspected, *then* no two requests overlap and consecutive requests start at least 2 s apart.

**FR-08 Stop when blocked.** An HTTP 403 or 429 ends the run at once; what was collected is still downloaded.
- *Given* Oikotie answers 429 during details, *when* the script sees it, *then* no further request is made, the file is downloaded and `stoppedReason` says `http-429`.

**FR-09 User stop.** The panel's Stop button and `captureStop()` in the console end the run and download a partial file.
- *Given* a running capture, *when* the user presses Stop, *then* the request in flight finishes, no new one starts, and a file with `stoppedReason: "user"` is downloaded.

**FR-10 Progress panel.** While running, the script shows the mode, pages and details done out of planned, an estimate of time left, errors, and a reminder to keep the tab in the foreground.

**FR-11 Capture file.** The run ends by downloading one JSON file, `oikotie-<UTC timestamp>.json`, in the format `tampere-city-boy/oikotie-capture@1`. It holds every search card and detail unmodified, plus a log of every request (time, URL, status, duration).

### 6.2 Import and storage

**FR-12 Import.** `npm run import [file]` loads a capture file. Without an argument it takes the newest `oikotie-*.json` in `%USERPROFILE%\Downloads`.
- *Given* two capture files in Downloads, *when* the user runs `npm run import`, *then* the newer one is imported and its name is printed.

**FR-13 Idempotent import.** Importing the same capture twice changes nothing.
- *Given* a capture already imported, *when* it is imported again, *then* the tool reports "already imported" and no row changes.

**FR-14 Store everything.** Each listing keeps its full search-card JSON and full detail JSON exactly as received.
- *Given* any field in Oikotie's JSON, *when* the user queries `json_extract(detail_json, '$.adData.<field>')`, *then* the value is available without a new fetch.

**FR-15 Extracted columns.** Common fields are also stored as typed columns (rent, size, rooms, build year, available date, lease text, fees, coordinates…; full list in [03-design.md §4](03-design.md#4-database-schema)). All timestamps are stored in UTC.
- *Given* a card priced "1 170 € / kk" and sized "42 m²", *when* it is imported, *then* `rent_eur` = 1170 and `size_m2` = 42.
- *Given* a detail timestamp in Finnish local time, *when* it is imported, *then* the stored value is the correct UTC instant in both winter and summer time.
- *Given* a detail whose `availabilityDate` is null, *when* it is imported, *then* `available_date` is NULL and the listing is still in `v_window`.

**FR-16 Distances.** Each listing gets straight-line distances to every place in `config.json` (initially `dist_centre_km` and `dist_station_km`).
- *Given* a new place is added to `config.json`, *when* the user runs `npm run rebuild`, *then* a new distance column is filled for every listing, offline.

**FR-17 New since the last crawl.** A listing is new if it was first seen in the latest crawl. The initial crawl flags nothing.
- *Given* only the initial crawl has been imported, *when* the user queries `v_new`, *then* it is empty.
- *Given* a later crawl that added 3 listings, *when* the user queries `v_new`, *then* it returns exactly those 3.

**FR-18 Versions.** Whenever a listing's detail content changes, the previous and new detail JSON are both kept (`listing_versions`).

**FR-19 Change log.** Changes to rent, available date, lease text and status, and every removal or reappearance, are recorded with old value, new value and run.

**FR-20 Removals.** A listing is marked removed only when (a) a **complete full sweep** no longer contains it, or (b) its detail request returns 404 or a non-active status. A listing that reappears is marked active again.
- *Given* a full sweep that stopped after page 2 of 4, *when* it is imported, *then* no listing is marked removed.
- *Given* an incremental run, *when* it is imported, *then* no listing is marked removed for being absent from the search.
- *Given* a complete full sweep without listing X, *when* it is imported, *then* X has `removed_at` set and a change-log row.

**FR-21 Resume.** After a partial capture is imported, the next capture fetches only what is still missing or due.

**FR-22 Report.** Each import writes a Markdown report `reports/<date>-run-<id>.md`: run summary, new listings in the window, changes, removals, with links to Oikotie.

### 6.3 Local querying

**FR-23 Views.** `v_active` (not removed), `v_window` (active and available date unknown or before the cutoff) and `v_new` (FR-17).

**FR-24 CLI.** `node src/cli.mjs list window|new|removed`, `show <id>`, `sql "<query>"` and `export <dir>` (dumps the stored JSON to files).

**FR-25 Offline rebuild.** `npm run rebuild` recomputes every extracted column from the stored JSON with no network access.
- *Given* the network is disconnected, *when* the user runs `npm run rebuild`, *then* it succeeds and row counts are unchanged.

### 6.4 Web UI

**FR-26 Local server.** `npm run ui` builds the UI and serves it with a read-only JSON API on `http://localhost:3000`. `npm run ui:dev` runs it with hot reload.

**FR-27 Map.** One marker per listing, shaded by build year (newer is deeper blue) with a legend; pins for Keskustori and the railway station; an optional overlay of the 17 postal areas; three switchable base maps.
- *Given* the UI is open with no filters, *when* markers are counted, *then* the count equals the number of active listings that have coordinates.

**FR-28 List.** Photo-led cards showing district and street, build year, size, rooms, available date (or "no date"), distances and, quietly, rent. Sortable by build year (newest first, the default), size, rent, available date, distance to centre, distance to station and newest listing.

**FR-29 Hover sync.** Hovering a card highlights its marker; hovering a marker highlights its card and scrolls it into view. Clicking either opens the detail.

**FR-30 Filters.** Every numeric or date filter is a min–max range with a dual-handle slider and number inputs, bounded by the data: build year (first and most prominent), rent, size, rooms, available date (with "include no date"). Plus postal codes (multi-select), "only new" and "hide removed". Reset clears all. The filter state lives in the URL.
- *Given* build year is set to 2010–2026, *when* the filter applies, *then* the list and the markers shrink together and the URL changes; reloading the URL restores the same view.

**FR-31 New markers.** Listings in `v_new` carry a "New" tag and a distinct marker; the header shows "N of M homes · K new since <last crawl>".

**FR-32 Detail drawer.** Photos, key fields, description, a link to the Oikotie listing and the raw JSON (collapsed). The lease text (`rentTermInfo`) is shown in full so the user can verify the lease type by reading it; lease type is deliberately **not** a filter (decided 2026-11-11, because Oikotie gives it only as free text).

**FR-33 Narrow windows.** Below a set width the list stacks under the map with no horizontal scrolling.

## 7. Non-functional requirements
| Id | Requirement |
|---|---|
| **NFR-01 Compliance** | Nothing in the project may disguise itself as a browser (no spoofed User-Agent, no headless or stealth automation). The bulk capture is run only by the user in their own browser, never by an AI agent's browser. |
| **NFR-02 Politeness** | Sequential requests, ≥ 2 s apart plus jitter. Stop on 403 or 429; never retry around a block. |
| **NFR-03 Local only** | Listing data never leaves the PC. `data/`, `reports/`, `dist/` and capture files are git-ignored. The web server listens on localhost only and is read-only. |
| **NFR-04 No re-fetch** | Any new column or filter must be derivable from stored JSON (FR-25). |
| **NFR-05 Dependencies** | Capture, import, database and CLI use only Node built-ins (`node:sqlite`, `node:test`, `fetch`). Only the web UI has npm dependencies. |
| **NFR-06 Platform** | Windows 11, Node ≥ 26 (pinned 26.13.0 in `.nvmrc`), current Chrome or Edge. |
| **NFR-07 Atomic import** | An import runs in one transaction; a bad or truncated file leaves the database untouched. |
| **NFR-08 Testability** | Planning, hashing and normalising are pure functions. `npm test` needs no network and uses only synthetic fixtures; no real Oikotie JSON is committed. |
| **NFR-09 One logic, two runtimes** | The card hash and run planning give identical results in Node and in the built browser script (verified by a test). |
| **NFR-10 Traceability** | Every request the capture makes is logged in the capture file. |
| **NFR-11 Time** | Stored timestamps are UTC ISO 8601. Finnish local times are converted with the `Europe/Helsinki` zone, never a fixed offset. |
| **NFR-12 UI quality** | Components use only design tokens; text contrast meets WCAG AA; keyboard focus is visible; `prefers-reduced-motion` is respected; fonts are self-hosted. |
| **NFR-13 UI speed** | Filtering and sorting about 400 listings happens client-side with no perceptible delay. |

## 8. Glossary (Finnish terms in listings)
| Finnish | Meaning |
|---|---|
| vuokra, €/kk | rent, euros per month (*kk* = *kuukausi*) |
| vapautuu | becomes available (date follows) |
| heti vapaa / vapaa heti | available immediately |
| sopimuksen mukaan | by agreement (no fixed date) |
| toistaiseksi voimassa oleva | indefinite lease (valid until further notice) |
| määräaikainen | fixed-term lease |
| vakuus / takuuvuokra | security deposit |
| vesimaksu, €/hlö/kk | water fee, per person per month (*hlö* = *henkilö*) |
| sähkö | electricity |
| postinumero | postal code |
| kaupunginosa | district |
| kerrostalo / rivitalo / omakotitalo / paritalo / luhtitalo | apartment block / terraced house / detached house / semi-detached house / gallery-access block |
| rakennusvuosi | build year |
| kerros | floor (e.g. 3/5 = third of five) |
| h, k, kk, kt, avok, tk | room, kitchen, kitchenette, cooking area, open kitchen, kitchen-living room (in room configurations such as `2h+kk+s`; here *kk* is *keittokomero*) |
| s, kph, vh, p / parv, las. parv | sauna, bathroom, walk-in wardrobe, balcony, glazed balcony |
| kalustettu | furnished |
| lemmikit sallittu | pets allowed |
| alivuokra | sublet |
| soluasunto | room in a shared flat |
| Arava / korkotuki (ARA) | state-subsidised rental housing |
| opiskelija-asunto / senioriasunto / palveluasunto / työsuhdeasunto | student / senior / service / employer housing |
| vapaarahoitteinen | privately financed (ordinary market rental) |
| Keskustori, rautatieasema | Tampere's central square, railway station |
