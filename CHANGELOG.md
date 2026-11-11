# Changelog

## 1.0.0 — 2026-11-12: local map and list web UI

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
