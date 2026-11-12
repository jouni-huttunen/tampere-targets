# Changelog

## 1.6.4 — 2026-11-12: touch changes reverted

**Reverted**
- The 1.6.3 touch-screen changes: on the phone, taps on map markers no longer registered as easily. Touch screens behave as in 1.6.2 again (hover on tap, tooltip, lock on tablets, marker growth). The issue and the options for next time are in [docs/issue-touch-markers.md](docs/issue-touch-markers.md).

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
