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

**FR-26 Local server.** `npm run ui` builds the UI and serves it with a read-only JSON API on `http://localhost:3000` (bound to 127.0.0.1 only; no write routes). `npm run ui:dev` runs it with hot reload. `--no-photos` replaces every Oikotie photo with a placeholder (used for agent previews); `--port N` changes the port. Without a database the UI says so and shows the commands to run.

**FR-27 Map.** One marker per listing, coloured by build year in five eras plus "unknown", with a legend; pins for Keskustori and the railway station; an optional overlay of the 17 postal areas; at least three switchable keyless base maps; listings that share one coordinate (same building) are spread out so each stays selectable; a button beside the zoom buttons fits the map to the current list (on phones and windows up to 1100 px it shows the icon and the count only); the legend can be folded into a small chip ("Hide"), and starts folded on phones.
- *Given* the UI is open with no filters, *when* markers are counted, *then* the count equals the number of active listings that have coordinates.
- *Given* a listing has `location_approx = 1`, *then* its marker, card and detail say the location is approximate and its distances are marked "≈".

**FR-28 List.** Every home shows build year, district and street, size, rooms, available date (or its text, or "no date"), distance to Keskustori and to the station, rent and rent per m². A compact-rows layout (the default, many homes visible at once) and a large-photo layout can be switched. Sortable by build year (newest first, the default), size, rent, rent per m², available date, distance to centre, distance to station and newest listing; listings missing the sort value come last. With a row focused, ↑/↓/Home/End move between homes and Enter opens the detail.

**FR-29 Hover sync.** Hovering a home in the list highlights its marker; hovering a marker highlights its home and scrolls it into view. Clicking either opens the detail.

**FR-30 Filters ("mission parameters").** Every numeric or date filter is a min–max range with a dual-handle slider and number inputs, bounded by the data: build year (first and most prominent), rent, size, rooms, available date (with "include no date"). Plus postal codes (multi-select), "only new", "only shortlist" and "hide removed". In a wide window (≥ 1360 px) all filters sit in a panel on the left that is always open, so they are fast to set (layout: filters | map | list); narrower windows open the same panel from a header button. Reset clears all. The filter state lives in the URL. The build-year slider is stepped (added 2026-11-12, the user's choice of decades over the five legend eras): its handles snap to decades from 1960 (everything older is one step), every step has the same width, and the upper handle at a decade means "up to the year before" ('90 → '10 is 1990–2009); the typed fields still take any year. There is no "unknown" stop.
- *Given* the build-year handles are dragged to '90 and '10, *then* the fields read 1990 and 2009 and the URL holds `year=1990..2009`.
- *Given* build year is set to 2010–2026, *when* the filter applies, *then* the list and the markers shrink together and the URL changes; reloading the URL restores the same view.

**FR-31 New markers and readouts.** Listings in `v_new` carry a "New" tag and a distinct marker; the header shows how many listings are shown out of how many, how many are new since the last crawl, how many are on the shortlist, the median rent of the shown listings, when the last crawl ran, and the Helsinki time. The "new" and shortlist counts toggle their filters. Every number shown is real data.

**FR-32 Target profile (detail).** A photo gallery, key fields, description, a link to the Oikotie listing and the raw JSON (collapsed). The lease text (`rentTermInfo`) is shown in full so the user can verify the lease type by reading it; lease type is deliberately **not** a filter (decided 2026-11-11, because Oikotie gives it only as free text). Previous/next controls (and ←/→) step through the current filtered, sorted list; Esc closes. Not shown (the user's choice, 2026-11-12): electricity, pets allowed, building type and first seen; furnished shows only as "Furnished: Yes" when the listing says so (hidden when it says no or nothing); water and deposit show only when the listing gives them (a 0 € deposit is a value and shows). The open listing is part of the URL. In a wide window it docks over the right side of the map, so the list and the filters stay visible.

**FR-33 Narrow windows.** Below 1360 px the filters move into a slide-out panel; below 900 px the list stacks under the map with no horizontal scrolling. Phones are tuned for the user's Galaxy S24+ in Chrome (added 2026-11-12) and work from 360 to 430 px wide: a two-row header there, and a phone held sideways (landscape, ≤ 500 px tall) shows the map and the list side by side under a one-row header.
- *Given* a 384 × 740 phone screen held upright, *then* the header takes at most 120 px, nothing scrolls sideways, the order select shows its full text, and the first list row starts on the first screen.
- *Given* a phone held sideways (832 × 330 or 915 × 412), *then* the map and the list sit side by side at full height, and the target profile opens full screen with swipe between targets.
- *Given* the phone layout, *when* the user taps a marker, *then* the target profile opens without scrolling the page to the list, and closing it shows the map.

**FR-34 Shortlist.** The user can star homes and filter to the starred ones. The shortlist lives only in the browser's `localStorage`; the server and database stay read-only, and the UI works if storage is blocked.

**FR-35 States.** Designed loading, empty ("no targets in sector", with Reset) and error states; a rendering error shows a message with a reload button instead of a blank page.

**FR-36 Boot sequence** (added in 1.1.0). Opening the UI plays a short tactical boot log (about 3 s) while the data loads: uplink, secure channel, encryption, GPS coordinates of the map centre, the number of listings, sectors, last crawl, new contacts, shortlist, "all systems armed". All values are real. Then the console "deploys" (header, map, panels animate in). It plays once per browser tab; any key or click skips it; it is skipped under `prefers-reduced-motion`.
- *Given* the database loads slowly, *then* the log waits on the database line instead of inventing a number.

**FR-37 Themes** (added in 1.1.0). Two colour themes: RECON (navy, cyan, amber; the default) and night vision (green). An "NV" button in the header (or the N key) switches between them with a short goggles effect; the choice is remembered in the browser (`localStorage` key `tcb.theme.v1`) and applied before the first paint.

**FR-38 Map effects** (added in 1.1.0). Zooming shows a fast crosshair "strike" at the point zoomed at (the pointer, or the centre for buttons and keys). Selecting a listing locks a reticle onto its marker with a short animation and a "Target locked" label with its coordinates; the lock stays while the profile is open. Both are decorative, never block the pointer, and are off under `prefers-reduced-motion`.

**FR-40 Browser history** (added 2026-11-11). Opening a target profile, and each ‹ › step inside it, adds one browser-history entry (the user's choice): Back (browser button, Android back gesture, mouse back button) goes to the previous target and finally to the main view as it was; Forward reopens. × and Esc go straight back to the main view, removing the profile entries. A link that opens a target gets a main-view entry under it, so Back closes the profile instead of leaving the site. Filter changes never add entries.
- *Given* the user opened a target and pressed › twice, *when* they press Back three times, *then* they see the second target, the first target, then the main view.

**FR-41 Targets in map view first** (added 2026-11-11). The target list shows the targets whose marker is on the visible map first (a marker hidden by the open target profile counts as outside), then an "Outside map view · N" separator and the rest, each part in the chosen order; the panel head reads "N in view · M targets". The split follows the map after each pan or zoom (not during a drag), also while a target profile is open, and a reordered list jumps to its top. Selecting a target moves the map only when its marker is near the edge of the visible map (48 px); a target off the map is centred. ↑/↓ follow the list as shown; ‹ › in the profile step only through the targets in view, and wrap round (› on the last goes to the first, ‹ on the first to the last). With every target in view there is no separator.
- *Given* the map is zoomed into one district, *then* the list starts with that district's targets and every other target follows under the separator.
- *Given* the user scrolled down the list, *when* they pan the map, *then* the list shows its new first targets.
- *Given* a target well inside the visible map, *when* the user opens it from the list, *then* the map does not move.
- *Given* a target under the separator, *when* the user opens it, *then* the map centres it and ‹ › then step through the targets in view.
- *Given* no profile is open, *when* the user clicks a marker where the profile will dock, *then* the map moves it just beside the profile.
- *Given* a profile is open, *when* the user drags or zooms the map so that the locked target leaves the visible map (or goes under the profile), *then* the lock is released, the profile closes and the list shows its top.

**FR-42 Swipe on phones** (added 2026-11-12). In the full-screen target profile on a phone, the photo is a carousel: a sideways swipe on it moves to the next or previous photo (no wrap; the counter and the thumbnails follow), and it never changes the target ("photos stay photos", the user's choice over carrying on to the next target at the last photo). A sideways swipe anywhere else on the profile steps to the next (swipe left) or previous (swipe right) target exactly like ‹ ›: the targets in view, wrapping round, one history entry per step. A vertical drag still scrolls the profile. No swipe hints are shown (the user's wish). The ‹ › over the photo are hidden on touch phones. The carousel loops (added 2026-11-12): a swipe left on the last photo shows the first, a swipe right on the first shows the last. On phones the profile header shows only "TARGET PROFILE" (no "TGT id").
- *Given* a profile with several photos, *when* the user swipes left on the photo, *then* the next photo snaps in and the counter reads 2 / n; the target does not change.
- *Given* a profile, *when* the user swipes left on the facts, *then* the next target in view slides in and Back returns to the previous one.
- *Given* a short or slow sideways drag (under a quarter of the width, no flick), *then* the profile springs back and stays on the same target.
- *Given* the user scrolls the profile up or down, *then* it scrolls and never changes target.

**FR-43 Ground intel in night vision** (added 2026-11-12). With NV on, the map also shows tram stops, bus stops and grocery stores ("put NV mode to use", the user's words); RECON shows none of them. Stores are only Kesko (K-Citymarket, K-Supermarket, K-Market and other K stores), S-ryhmä (Prisma, S-market, Sale, Alepa) and Lidl, the user's choice of 2026-11-12; no kiosks, petrol-station shops, Tokmanni or independents. Area: the 17 postal areas plus a 1 km margin. Stores and tram stops show from zoom 13, bus stops from zoom 15 (there are about 950). They sit under the target markers and never cover a target. With a mouse, hovering one shows a one-line tooltip; a click or tap opens an intel card on the point: for a stop its type (tram or bus), name and stop number (no lines); for a store its chain, name, address, open or closed now (Helsinki time) with the next closing or opening time, the week's hours with today marked, and where the hours come from ("checked" date when OpenStreetMap has one). A store without hours says "Hours unknown"; hours the parser cannot read are shown as written. A card near an edge moves the map so it fits; that move never releases the target lock. Esc or a click on the map closes the card (Esc closes the card before the profile). The legend's "More" explains the glyphs in NV. The data comes from `npm run infra` (§6.5), not from the browser.
- *Given* NV is on at zoom 15, *when* the user clicks a tram stop, *then* a card shows "Tram stop", its name and its 4-digit number.
- *Given* a store open 07:00–22:00 and the time in Helsinki is 21:00, *then* its card says "Open · closes 22:00"; at 22:30 it says "Closed · opens 07:00" (or the next day's opening).
- *Given* a profile is open, *when* the user opens a card near the map edge, *then* the map moves to fit it and the profile stays open.
- *Given* NV is switched off, *then* every stop, store and card disappears from the map.

**FR-44 Step keys** (added 2026-11-12). D or S opens the next target and A or W the previous one, like › and ‹ in the profile (the targets in view, in list order, wrapping round); with no profile open, D/S opens the first target in the list and A/W the last. The keys go by position (WASD on any layout, for the left hand), are ignored while typing in a field and during the boot, and leave ←/→, ↑/↓ and Esc as they were.
- *Given* no profile is open, *when* the user presses D twice, *then* the first and then the second target in the list are open, and A goes back to the first.

**FR-46 Hideable side panels** (added 2026-11-12). Mission parameters and the Target list can be hidden for more map, wherever they are a column beside the map: the parameters in a wide window (≥ 1360 px), the list above the phone layout (> 900 px) and on a phone held sideways. A « / » button in the panel's title bar hides it; the panel becomes a slim rail at its edge with its number, an upright label and a count (active filters; targets in view), and clicking the rail shows it again. The map grows into the space with a short slide (off under reduced motion), and the target profile docks against the new edge. Both are shown by default; the choice is remembered in this browser (`tcb.panels.v1`, the user's choice). Keys (the user's choice, changed 2026-11-12 from [ and ]): Q toggles the parameters (in a narrower window it opens or closes the slide-out parameters instead) and E the list; by position, ignored while typing (FR-47). On phones the list always shows.
- *Given* both panels shown, *when* the user clicks « on Mission parameters and » on the Target list, *then* the map takes the freed width, two rails remain, and after a reload they are still hidden.
- *Given* the list is hidden and a target profile opens, *then* it docks against the list's rail.

**FR-47 Desktop keys** (added 2026-11-12, the user's choice). Q shows or hides the left panel (Mission parameters) and E the right panel (Target list), as in FR-46; C fits the map to the targets in the list, like the Fit button; R switches to the next base map (Night ops → Recon sat → Terrain → Night ops; the sectors overlay is untouched); X closes the target profile and removes the lock marker, like × (nothing without a profile). With N (night vision) and WASD (FR-44) they go by key position, are ignored while typing in a field, with Ctrl / Alt / Cmd held (Ctrl+C still copies) and during the boot. Tooltips name the keys: "Hide for more map (Q)" / "(E)", the rails' "Show … (Q)" / "(E)", Fit "(C)".
- *Given* a profile is open, *when* the user presses X, *then* it closes, the lock marker goes and Back does not reopen it.
- *Given* the map is zoomed into one street, *when* the user presses C, *then* every target in the list is on the map.

### 6.5 Ground intel data

**FR-45 `npm run infra`** (added 2026-11-12). Downloads the Nysse GTFS feed and asks OpenStreetMap's Overpass API for the stores (two plain requests with an honest client name, retrying twice when Overpass is busy), keeps what FR-43 shows, and writes `web/public/infra.json`, one stop or store per line so a refresh gives a readable diff. The file is public open data, nothing personal, and is committed (the user's choice). It prints counts per chain and every opening-hours text the parser cannot read. `--dry-run` writes nothing; `--gtfs <zip>` and `--osm <json>` read files already on disk. Run it now and then by hand; there is no schedule.

**FR-39 Hosted copy** (added 2026-11-11). `npm run deploy` publishes a read-only copy of the UI with the current local data to Azure Storage static website hosting, by hand only; the local database stays the master. Settings and the SAS token live in a git-ignored `.env`. `--dry-run` builds without uploading. The copy is kept out of search engines (`noindex`, `robots.txt`). Details in [03-design.md §8.4](03-design.md#84-hosted-copy-npm-run-deploy).
- *Given* a listing is gone from the local database export, *when* the deploy runs, *then* its old file is removed from the hosted copy.
- *Given* the SAS token is missing, a placeholder or expired, *then* the deploy stops before building anything and says which value to fix, without printing the token.

## 7. Non-functional requirements
| Id | Requirement |
|---|---|
| **NFR-01 Compliance** | Nothing in the project may disguise itself as a browser (no spoofed User-Agent, no headless or stealth automation). The bulk capture is run only by the user in their own browser, never by an AI agent's browser. |
| **NFR-02 Politeness** | Sequential requests, ≥ 2 s apart plus jitter. Stop on 403 or 429; never retry around a block. |
| **NFR-03 Local master, personal use** | The local database is the master; a hosted copy, if any, is updated only by hand from it and is for the user alone (changed 2026-11-11: listing data no longer has to stay on the PC). Listing data stays out of Git: `data/`, `reports/`, `dist/` and capture files are git-ignored. The local web server listens on localhost only and is read-only. |
| **NFR-04 No re-fetch** | Any new column or filter must be derivable from stored JSON (FR-25). |
| **NFR-05 Dependencies** | Capture, import, database and CLI use only Node built-ins (`node:sqlite`, `node:test`, `fetch`). Only the web UI has npm dependencies; the deploy reuses them (Fastify for the export, Vite for the build) and talks to Azure with plain `fetch`, no SDK. |
| **NFR-06 Platform** | Windows 11, Node ≥ 26 (pinned 26.13.0 in `.nvmrc`), current Chrome or Edge. |
| **NFR-07 Atomic import** | An import runs in one transaction; a bad or truncated file leaves the database untouched. |
| **NFR-08 Testability** | Planning, hashing and normalising are pure functions. `npm test` needs no network and uses only synthetic fixtures; no real Oikotie JSON is committed. |
| **NFR-09 One logic, two runtimes** | The card hash and run planning give identical results in Node and in the built browser script (verified by a test). |
| **NFR-10 Traceability** | Every request the capture makes is logged in the capture file. |
| **NFR-11 Time** | Stored timestamps are UTC ISO 8601. Finnish local times are converted with the `Europe/Helsinki` zone, never a fixed offset. |
| **NFR-12 UI quality** | Components use only design tokens; text contrast meets WCAG AA; keyboard focus is visible; `prefers-reduced-motion` is respected; fonts are self-hosted. |
| **NFR-13 UI speed** | Filtering and sorting about 400 listings happens client-side with no perceptible delay; a slider thumb follows the finger at once on a mid-range Android phone (the list and map may catch up a moment later). Measured 2026-11-11 on the dev PC: one build-year step 12 ms median (was 189 ms before the deferred update). |

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
