# Changelog

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
