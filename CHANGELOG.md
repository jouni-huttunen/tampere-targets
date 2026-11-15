# Changelog

## 1.17.0 — 2026-11-15: Small homes and new keys

Deployed.

**Added**
- Map: the TARGET LOCKED label also shows the marker tooltip's facts (rent, build year, size, address) on a row of their own, between the title and the coordinates.
- Desktop keys: F zooms to the open target at zoom 17 (two levels in from where night vision starts showing bus stops), centred in the visible map; with no target open it fits the map to the targets.

**Changed**
- Crawl scope: searches ask for homes from 20 m² up (`size[min]=20`), so studios and small one-bedroom flats are captured too.
- Mission parameters: Area starts at 40 m² (`DEFAULT_SIZE`), so the view looks as before; pull the Area slider down to see the smaller homes.
- Capture pacing: 0.5 s between requests plus 0–0.8 s jitter (was 2 s), about 0.9 s per request on average; still one request at a time and a stop on 403 or 429. `config.json` refuses a delay under 500 ms.
- Desktop keys remapped (the field manual shows them all, with an arrow cluster at the right):
  - W or ↑ zooms in and S or ↓ out; with a target open the zoom centres it in the visible map. Z, X, + and − no longer zoom, the map no longer pans with the arrow keys, and a focused list row keeps ↑ / ↓ for moving between rows.
  - A or ← opens the previous target and D or → the next, also with no profile open.
  - Q or N switches night vision (F and V no longer do), E or M the base map, and R and T show or hide the Mission parameters and the Target list.
  - C fits the map to all targets, like the Fit button. Only Esc closes (C no longer does).
  - Tooltips: night vision (Q), panels (R) / (T), Fit (C), the profile's Close (Esc).

**Removed**
- New contacts: the data is shown as it is now, so nothing is marked new any more. Gone: the New tag on rows and in the profile, the pulsing ring on the map, the legend line, the "New contacts only" switch (an old `new=1` link is ignored), the boot line, `is_new` in the API, the `v_new` view, `list new` in the CLI and the report's "New in your window". The import's run log still counts what each run added.

## 1.16.0 — 2026-11-15: Done fits

Deployed.

**Added**
- Slide-out parameters (phones and narrower windows): Done fits the map to the new list when the parameters changed, so the targets you filtered for are all on the map. Done without a change, Esc, C and a tap outside leave the map as it is.

**Fixed**
- Fit (and the framing on load and after Done) counts each target as drawn: homes in one building sit on a ring round their shared point, and a big ring at the edge (Lielahti) hung off the map. The rings now fit too, clear of the map buttons at the top and the legend at the bottom.

## 1.15.0 — 2026-11-15: exact fit and zoom keys

Deployed.

**Added**
- Desktop keys: Z zooms the map in one level and X out, around the open target (it stays put and keeps its lock), else around the centre of the visible map. + and − (also = and the numpad keys) do the same on any keyboard layout. The field manual shows Z and X, and lights them for + and −.

**Fixed**
- On load, every target in the list starts on the map: the opening view (Keskustori, zoom 13) left most of them off the map on a phone (154 of 333 in view) and some on desktop (297 of 333), and the list only counts targets in view. The map now frames them all on load, like "Fit N targets".

**Changed**
- Fit (and the framing on load) zooms to the exact level that fits the targets instead of the half step below it, with 24 px of margin on a phone (48 px on desktop): a phone opens at zoom 11.2 instead of 10.5, the cluster about 1.6 times as wide. Other zooms keep their half steps.

## 1.14.0 — 2026-11-14: Alko

Deployed.

**Added**
- Night vision ground intel: the 14 Alko stores in the area (Tampere and Pirkkala), from OpenStreetMap. Each is a hexagon with an A in its own pale tone; hover for a one-line status ("Alko Stockmann · Open · closes 21:00"), tap or click for the card with the address, open or closed now and the week's hours. The legend lists it. `npm run infra` asks for them in the same single Overpass request; `web/public/infra.json` is refreshed (some grocery hours changed too).

**Changed**
- Intel cards: a kicker whose group and chain are the same reads once ("Lidl", not "Lidl · Lidl"); a store named only by its chain gets its street in the hover tooltip.

## 1.13.0 — 2026-11-14: top floor

Deployed.

**Added**
- Mission parameters: a "Top floor only" switch under Flags, with its count. A home counts when its floor equals the building's floor count (nobody lives above; 1- and 2-storey buildings count). Homes with no known floor count are hidden while it is on. URL key `top=1`.
- Target profile: a top-floor home shows an amber TOP tag after its floor ("6 / 6 TOP").

**Fixed**
- The building's floor count now falls back to the search card's `buildingFloorCount` and the detail's `buildingOverrideFloors` when the detail's `floorCount` is empty, so more profiles read "3 / 4" instead of "3" (`npm run rebuild` applies it to stored data). The floor itself falls back to the card's `floor`.

## 1.12.1 — 2026-11-14: rent in the map tooltip

Deployed.

**Changed**
- Map: a target's hover tooltip leads with its rent ("850 €/mo · 1965 · 56 m² · Hallituskatu 25 B").

## 1.12.0 — 2026-11-13: move-in up front

Deployed.

**Added**
- Target profile: move-in up front, on the row with the priority star ("IN 1.12.2026"), so it is on a phone's first screen. Without a date it shows the listing's own text, cut to one line (40 characters at most, with "…"; the full text in its tooltip and still in the facts); nothing when the listing gives neither.

## 1.11.1 — 2026-11-13: profile range labels

Deployed.

**Changed**
- Target profile: the distance facts read "Range to Keskustori" and "Range to railway station".

## 1.11.0 — 2026-11-13: scorched earth

Deployed.

**Added**
- **Scorched earth**, the reset of last resort, on desktop and phones: at the very bottom of Mission parameters (a slim hazard bar until you lift the safety cover; then the full brief on phones, a short one with Disarm / Burn on desktop) and at the bottom of the field manual. Lift the safety cover, then Burn it all: it wipes everything this browser remembers (priority targets, parameters, night vision, panels, list view), clears the address and reboots the console from zero with the boot sequence. No undo; your listing data stays. A double-click on the cover never fires.

**Changed**
- Priority targets: stars on listings that are no longer in the data, or withdrawn, are ignored silently: they no longer count in the header, the list chip, the parameters switch or the boot log. They stay stored, so a listing that comes back keeps its star.
- Header: the Priority readout shows –– until the data is in, like the Targets readout.

## 1.10.1 — 2026-11-13: phone target swipe fix

Deployed.

**Fixed**
- Phones: swiping to the next or previous target no longer stops at random. A swipe that started on the profile's edge margins or in the gaps between sections (about a sixth of it) was taken over by the browser and cancelled; and diagonal swipes between 34° and 45° were neither a swipe nor a scroll. Both came with the swipe rewrite in 1.9.1. Also, a second swipe right after the first now works once the new target has slid in (0.2 s), instead of being ignored for about 0.8 s. Photos and the raw JSON still scroll sideways.

## 1.10.0 — 2026-11-13: price first, keys and field manual

Deployed.

**Changed**
- Target profile: the three big numbers are now Cost / month, Area and Built. The price shows at a glance, also on the phone; Rooms is gone from them (Layout says it) and the Cost line under them went with it.
- Upright phones: the header's Priority readout is gone (the list's ★ Priority chip does the same), and the Targets readout (only as wide as its numbers, at the left) shares the row right above the map with the Params and NV buttons at the right. Params shows its name again beside the icon. The header is 108 px tall at 384 px wide (was 115).
- Keys remapped: F fits the map to the targets (was C), C works like Esc and closes whatever is on top: the profile, the slide-out parameters, an intel card or the field manual (Close was X), V switches night vision (was N). X does nothing now. N (night vision) and M (base map) also work as second keys; the tooltips name only F, C and V.

**Added**
- Field manual (desktop): H or the new keyboard button in the header (after NV) opens a card with the keys drawn as a keyboard block, Esc included. While it is open, pressing a key lights it and says what it does. The boot log points to it ("Field manual · press H"). Hidden on touch screens.

## 1.9.1 — 2026-11-13: mobile responsiveness

Deployed.

**Fixed**
- Mobile profile gestures no longer cancel vertical scrolling after a small sideways wobble; passive pointer listeners keep scrolling native.
- Previously loaded listing details reopen immediately from a bounded page-session cache, without flashing the previous target or loading skeletons.
- Distant unloaded gallery slides use static placeholders instead of continuously animated loaders.

**Validation**
- Added regression coverage for touch direction, cancellation, multi-touch, gallery exclusion, cached revisits and retrying failed/aborted requests.

## 1.9.0 — 2026-11-12: housing filters and loaders

Deployed.

**Changed**
- Withdrawn listings are always left out, without notice: the "Hide withdrawn" switch, the Withdrawn tags and the dimmed markers are gone, and an old `removed=show` link is ignored.
- The target profile no longer shows "Details fetched".
- The header no longer shows New contacts (and its "only new" button): the count is still on the "New contacts only" switch in the parameters. On phones the header row holds Targets and Priority.

**Added**
- Mission parameters: **Financing** chips, Free-market and Subsidised, each with its count; only Free-market is on by default, so subsidised listings (Arava / korkotukiasunto) are out of view but counted. Every other listing, including one without a housing form, is free-market (FR-49).
- Mission parameters: **Housing type** chips (Shared flat, Sublet, Senior, Employer, Service, Student) with counts; none selected by default (no type filter), and selecting some shows only listings of those types.
- Target profile: a photo loader ("Acquiring visual": a scan band sweeping over the grid and a pulsing reticle) in the photo's own frame while the details and each photo load; the photo fades in over it, so nothing moves. The same loader, as a small reticle without the label, sits under the gallery thumbnails and the list's row and card photos.
- Target profile: while the details load, the thumbnail strip is already there with one placeholder per photo, and its scrollbar when the photos will not fit (on desktop from 7), so the profile no longer jumps when the thumbnails arrive. The list API sends `photo_count` for this.
- Target profile: skeleton loaders while the details load: one line under Lease terms (it said "Loading…") and ten under Briefing (it was missing until loaded). Ten lines is the 5th percentile of the real briefings at the desktop width, so the text that arrives is almost always at least that long.
- The housing form comes from Oikotie's own AI-guessed field `aiHabitationRentTypes`, the one its "Asumismuoto" search filter uses; the list API sends it as `housing_types`.

**Fixed**
- Tooltips name the current keys, one each: the profile's ‹ › "Previous target (A)" and "Next target (D)", its × "Close (X)", and the slide-out parameters' × "Close (Q)". W / ←, S / → and Esc still work.
- Target profile: descriptions and lease texts sent as HTML (`<p>`, `<b>`, `<br>`; 48 of 380 descriptions) showed the tags as text. Briefing and Lease terms now show plain and HTML texts alike: paragraphs, line breaks and bold, never as raw HTML.
- docs/02-data-source.md named `habitationRentType` as the housing-form field; it is `aiHabitationRentTypes`.

## 1.8.1 — 2026-11-12: mobile stability and leaner listing details

Deployed.

**Fixed** (phone stability; checked in the browser pane at phone sizes, and by the user on the S24+)
- The page could become wider than the phone and scroll sideways (408 px on a 384 px screen in the Cards view): the layout's grid columns took their width from the widest card text. They now take the screen's width; long text ends in "…".
- Scrolling past either end of the full-screen target profile scrolled the page hidden behind it (over 1,600 px), which then jumped on close. The page now stays put while the profile is open.
- A target opened from under "Outside map view" on a phone had no ‹ › and no swipe. The hidden map now centres it (instantly) as it does on desktop, so it is in view and can be stepped from; after closing, its row is scrolled into view.

**Changed**
- "Raw intel (JSON)" loads only when opened (new route `/api/raw/:id`, and `api/raw/<id>.json` on the hosted copy). Opening a target downloads about 3 KB instead of 12 KB (gzipped, average of 381 listings).

## 1.8.0 — 2026-11-12: move-in months

Deployed.

**Changed**
- Mission parameters: the move-in date range and "include no date" are replaced by **move-in month chips**: November, December, January, Later and Unknown, each with its count (FR-48). The month comes from the date field, or from the text: "heti" means the month the listing was fetched, and explicit dates or Finnish month names in the text are read too; a date already past counts as the fetch month. Later (from February 2027 on) is off by default, so those listings are out of view but still counted. With today's data: November 202, December 144, January 28, Later 1, Unknown 6.

## 1.7.0 — 2026-11-12: phone breakpoints, desktop keys, leaner profile

Deployed.

**Changed**
- Phones, tuned for the Galaxy S24+ in Chrome (384 px wide) and good from 360 to 430 px: a two-row header (Params and NV as icon buttons, the version under the name, the three readouts across), 177 → 115 px tall, so the map and the first list row fit on the first screen. The order select gets its own row and shows its full text; smaller row photos leave more room for the address.
- The map's height on phones uses the screen height with the address bar showing, so it no longer runs under the bar.
- A phone held sideways: map and list side by side at full height under a one-row header (the map was a 172 px strip, now 266 px on the S24+), the profile full screen with swipe, and its photo fitted to the screen height.
- Desktop keys: **Q** and **E** show or hide the left and right panels (they replace [ and ]), **C** fits the map to the targets, **R** switches the base map, **X** closes the target profile and drops the lock marker. Tooltips show the keys.
- Target profile: Electricity, Pets allowed, Building type and First seen are gone; Furnished shows only when it is yes; Water and Deposit show only when the listing gives them.

## 1.6.4 — 2026-11-12: touch changes reverted

Deployed.

**Reverted**
- The 1.6.3 touch-screen changes: on the phone, taps on map markers no longer registered as easily. Touch screens behave as in 1.6.2 again (hover on tap, tooltip, lock on tablets, marker growth).

## 1.6.3 — 2026-11-12: no hover glitches on touch screens

Deployed.

**Changed**
- Touch screens (phones, tablets): a tap on a map marker or a list row only opens the target profile. No more fake hover on each tap (the marker growing, the list re-rendering, a tooltip left behind on the map) and no "Target locked" reticle. Markers keep their size, also when selected (one could stay big and white after closing a profile); the selected marker only lights up. Mouse and trackpad are unchanged.

## 1.6.2 — 2026-11-12: Fit beside the target profile

Deployed.

**Fixed**
- "Fit N targets" with a target profile open (desktop): the targets now fit in the part of the map the profile leaves visible, instead of partly under the profile, so after a fit they are all in view.

## 1.6.1 — 2026-11-12: profile photo size fix

Deployed.

**Fixed**
- The photo in the target profile grew with the number of photos (up to many times the screen width on phones, 1.6.0 regression): the thumbnail strip widened the gallery's column. The gallery is now one column exactly as wide as the profile, and the strip scrolls inside it.

## 1.6.0 — 2026-11-12: hideable side panels, smoother phone profile

Deployed.

**Added**
- Mission parameters and the Target list can be hidden for more map: « / » in their title bars, or the two keys right of P ([ ], Å ¨ on a Finnish keyboard). A hidden panel leaves a slim rail with its count; click it to bring the panel back. Both are shown by default; the choice is remembered in the browser. On phones the list always shows.

**Fixed**
- Phones: the target profile no longer jumps while it opens. The space for the thumbnail row under the photo is kept while the details load, so the content stays put when they arrive (on the hosted copy that is often mid slide-in).
- Phones: the profile slides and fades in instead of the desktop wipe, which repainted the whole screen on every frame and stuttered. Desktop keeps the wipe.
- Phones: no "target locked" animation under the full-screen profile, where it could not be seen; it appears when the map shows beside the profile (a turned phone or a wider window).

## 1.5.0 — 2026-11-12: night-vision ground intel, step keys

Deployed.

**Added**
- Night vision now shows ground intel on the map: tram stops (a T square), bus stops (small rings, from zoom 15) and Kesko, S-ryhmä and Lidl grocery stores (a hexagon with K, S or L; bigger store, bigger hexagon), all under the target markers. Hover for a one-line summary; click or tap for a card: stop type, name and number, or the store's chain, address, open or closed now (Helsinki time) and the week's hours with today marked. Esc or a click on the map closes the card. RECON shows none of it. The legend's "More" explains the glyphs.
- `npm run infra` refreshes the data (`web/public/infra.json`, committed): 1,020 stops from the Nysse GTFS feed (CC BY 4.0) and 90 stores from OpenStreetMap (ODbL), in the postal areas plus 1 km.
- Keys: D or S opens the next target, A or W the previous one (wrapping round, like ‹ ›); without an open profile, D opens the first target in the list and A the last.

## 1.4.4 — 2026-11-12: version in the title

Deployed.

**Added**
- The version ("v1.4.4") sits small and quiet after the TAMPERE TARGETS title, on the same baseline, also on phones and in the hosted copy, to tell which build is running. It comes from package.json, like the boot screen.

## 1.4.3 — 2026-11-12: decade build-year slider, phone profile

Deployed.

**Changed**
- Build-year slider: the handles snap to decades ('60, '70 … '20; everything before 1960 is one step) and every step has the same width, so the recent decades are no longer squeezed into a sliver. '90 → '10 means 1990–2009. The typed year fields still take any year.
- Phones: the target profile header shows only "TARGET PROFILE"; the TGT id is hidden there.
- The photo carousel loops: past the last photo comes the first, before the first the last.

## 1.4.2 — 2026-11-12: phone fixes (map controls, swipe)

Fixes for phones. Deployed.

**Changed**
- "Fit N targets" moved to the top of the map, beside the zoom buttons, so it no longer covers the map. On phones (and windows up to 1100 px) it shows the icon and the count only.
- The legend has a "Hide" button that folds it into a small "Legend" chip with the colour strip; tap the chip to open it again. Phones start with the chip. "More" is unchanged.

**Added**
- Phones: the photo in the target profile is a swipeable carousel; the counter and the thumbnails follow, and the ‹ › over the photo are gone. Desktop also swipes with a trackpad; ‹ › and the keys there are unchanged.
- Phones: swipe sideways on the profile to go to the next or previous target, like ‹ › (same order, wraps round, Back works). The profile follows the finger and slides; a short swipe springs back. Swipes on the photos only change the photo. No swipe hints.

## 1.4.1 — 2026-11-12: boot screen version

A small fix. Deployed.

**Fixed**
- The boot screen still said "tactical console v1.1.0". It now shows the real version, taken from package.json at build time (also in the hosted copy), so it cannot fall behind again.

## 1.4.0 — 2026-11-11: targets in map view first

The target list follows the map: the targets you can see come first, the rest sit under a separator. Same data and look elsewhere. Deployed.

**Added**
- Target list: the targets on the visible map come first, then an "Outside map view" separator and the rest, both in the chosen order; the head reads "N in view · M targets". Targets hidden by an open target profile count as outside. It follows the map after each pan or zoom, also while a target profile is open, and jumps to the top when it reorders. Rows outside the view have a sunk background and a faded photo.

**Changed**
- Selecting a target no longer pulls it towards the middle of the map: the map moves only if the target is within 48 px of the edge of the visible map, and then only just enough. A target off the map (picked under the separator) is centred.
- ‹ › in the target profile step only through the targets on the visible map, and wrap round (› on the last goes to the first, ‹ on the first to the last).
- Dragging or zooming the map so that the locked target leaves the view (or goes under the profile) releases the lock, closes the profile and shows the top of the list.

## 1.3.0 — 2026-11-11: faster on phones, browser history

Smoother sliders and map on phones, a smaller download, and Back/Forward through target profiles. Same look. Deployed and in use.

**Added**
- Browser history for target profiles: opening one and each ‹ › step add a history entry, so Back (also the Android back gesture) walks back through the targets viewed and then to the main view; × and Esc go straight to the main view; a link to a target goes back to the main view instead of leaving the site.

**Changed**
- Faster sliders: the list and map update in a deferred render, so the thumb follows the finger at once; rows and markers that did not change are not redrawn; off-screen rows skip layout. One build-year step: 189 ms → 12 ms on the dev PC.
- Touch screens: finger-sized slider thumbs, and lighter graphics (no terrain-shading layer, marker glow or blur). Desktop unchanged.
- Smoother map panning: no marker hovers or tooltips while dragging; tiles load during a drag on phones and more loaded tiles are kept; a hover re-renders only the list and the markers; the spinning rings and the new-contact pulse run on the GPU instead of repainting every frame. Same look.
- The hosted copy is served gzipped: about 1.1 MB → 0.24 MB on first load.

## 1.2.0 — 2026-11-11: hosted copy on Azure, phone fix

A read-only copy of the app on Azure Storage, deployed by hand from the local database, and a fix for the phone layout. Deployed and in use.

**Added**
- `npm run deploy`: publishes a read-only copy of the UI with the current local data to Azure Storage static website hosting (`$web`), by hand only. The API answers are exported as static JSON through the local server's own routes; the upload uses the Blob REST API with a SAS token from a git-ignored `.env` (placeholders included), no Azure SDK. Hashed assets first, `index.html` last, stale files removed. `--dry-run` builds only.
- `noindex` meta tag and a deny-all `robots.txt` on the hosted copy; the boot log names the real host.
- Tests for the deploy (95 in total).

**Fixed**
- Phone layout: tapping a map target no longer scrolls the page down to its list row; the profile opens, and closing it brings the map back into view. Desktop is unchanged.

**Changed**
- The "listing data never leaves this PC" rule is removed (the user's decision): a hosted copy for the user's own use is allowed; personal use only, nothing shared, nothing in Git.

## 1.1.0 — 2026-11-11: Tampere Targets (tactical UI)

Renamed to **Tampere Targets** and restyled as a tactical / spec-ops targeting console, at the user's request. Same data, filters and behaviour; new look, language and effects. Reviewed and approved by the user.

**Added**
- A boot sequence (about 3 s, once per tab, skippable, real values only) followed by a deploy animation of the console.
- Two themes: RECON (navy, cyan, amber; the default) and night vision (green), switched with the NV button or the N key, with a short goggles effect; remembered in the browser (`tcb.theme.v1`).
- Zoom strike (a crosshair at the point zoomed at) and target lock (a reticle with "Target locked" and coordinates on the selected marker); selecting a target pans it towards the middle of the visible map, not just inside its edge.
- Mission parameters: all filters in an always-open panel on the left in wide windows (≥ 1360 px), so the layout is parameters | map | targets with the map in the centre; a slide-out panel below that.
- Header readouts: priority count (toggles the shortlist filter), median cost of the shown targets, and a live Helsinki clock; a live cursor-coordinate readout on the map.
- Tests for the theme store and the median (87 in total).

**Changed**
- Tactical wording everywhere: targets, TARGET PROFILE, mission parameters, priority targets, new contacts, withdrawn, sectors, HQ and RAIL, last recon.
- The target list moved to the right edge, and the target profile docks over the right of the map against it, so the list and the parameters stay visible.
- Fonts: Rajdhani and JetBrains Mono replace Cinzel, Barlow Condensed and Noto Sans Runic (Barlow stays for text). The runes are gone.
- `package.json` name is `tampere-targets`; the capture format and the `tcb.*` storage keys are unchanged.
- Fixed the 1.0.0 dates in the docs (2026-11-11, not 11-12).

## 1.0.0 — 2026-11-11: local map and list web UI

The first complete version: capture, import, query and browse. Reviewed and approved by the user.

**Added**
- `server/`: a read-only Fastify app on 127.0.0.1 (`/api/listings`, `/api/listings/:id`, `/api/meta`), plus `--no-photos` and `--port`.
- `web/`: a React + Vite + react-leaflet app. Map with build-year markers, rune pins for the centre and the station, optional postal-area overlay (Statistics Finland, CC BY 4.0), and three keyless base maps (dark canvas with hillshade, satellite, terrain).
- Compact-rows or photo-cards list with hover sync, sorting (including rent per m²), and keyboard browsing; min–max range filters kept in the URL; detail drawer with photo gallery, full lease text and raw JSON; "new since last crawl" tag, halo and filter.
- Shortlist (stars) stored in the browser only; homes sharing one coordinate are spread out on the map; fit-to-results button; loading, empty and error states.
- A dark Nordic-pagan look (night forest, ice, bronze; Cinzel, Barlow, Elder Futhark runes), built on design tokens, WCAG AA contrast.
- Tests for the API, the filter/sort/URL logic and the UI helpers (85 tests in total).

**Changed**
- CARTO base maps now need an API key, so they were replaced (see `docs/02-data-source.md` §8).
- `HANDOFF.md` was shortened, `PLAN.md` was archived, and the spec in `docs/` was brought up to date.

## 0.1.0 — 2026-11-10/11: data retrieval

- A DevTools capture script (`npm run capture`), an importer into a local SQLite database (`npm run import`), `rebuild`, `report`, and a small CLI.
- Two real captures were imported (381 listings, all with details).
- The spec: `docs/01-requirements.md`, `docs/02-data-source.md`, `docs/03-design.md`.
