# Handoff: Tampere Targets

_Last updated 2026-11-12, at release 1.4.2. The rules and the read order are in [CLAUDE.md](CLAUDE.md); the spec is in [docs/](docs/). This file holds the **current state, open items and things that are true but aren't in the spec**. It is meant to stay short: when something is finished, move it to [CHANGELOG.md](CHANGELOG.md) or the spec and delete it here._

## 1. State
- **Released:** `v1.4.2` on `main` (private GitHub repo `jouni-huttunen/tampere-city-boy`, `main` tracks `origin/main`): the tactical UI (1.1.0), the hosted copy with `npm run deploy` (1.2.0), the phone performance work and browser history (1.3.0), and the "in map view first" target list (1.4.0, FR-41); 1.4.1 fixed the boot screen version (now from package.json); 1.4.2 is phone fixes: Fit beside the zoom buttons, a hideable legend, a photo carousel and swipe between targets (FR-42), checked in the browser pane at phone width with synthetic touch events, not yet on the real phone. `npm test`: 101 passing. Still unverified by measurement: frame rates on the user's real Android phone (the agent measured work per step on the dev PC only). The GitHub repo and the folder keep the name `tampere-city-boy` unless the user asks.
- **Data:** `data/listings.db` (git-ignored) holds 381 listings from two real captures (2026-11-10/11), all with details; the second run found nothing new, so the "New" tag has only ever been tested on synthetic databases.
- **Environment:** Windows 11, Node 26.13.0 from the official nodejs.org MSI (no version manager; `.nvmrc` only records the version). The user dislikes winget and nvm-windows (see CLAUDE.md). An empty `C:\nvm4w` folder is left over from the old nvm install; it is harmless.
- **PATH gotcha:** terminal tabs started by a process that predates a PATH change keep the old PATH, so `node` may be missing. Restart the app, or per shell: `$env:Path = "C:\Program Files\nodejs;$env:APPDATA\npm;$env:Path"`.
- **Git:** the user's approved workflow is a short-lived branch → commit → fast-forward `main` → push; commit and push only when asked. `git config user.name` is "Anonymous" (the user knows). In PowerShell 5.1, pass multi-line commit messages with `git commit -F <file>` (a here-string with `-F -` silently lost the message once), and read UTF-8 files with `-Encoding UTF8` or .NET (`Get-Content -Raw` mangles `—` and `ä`).

## 2. Next
- **Hosted copy:** live on Azure Storage static website hosting (the user's storage account, index document `index.html`), deployed with `npm run deploy` after each import; last deployed 2026-11-12 with the 1.4.2 build (451 files, 381 listings; 5.6 MB uploaded gzipped, 24.4 MB raw; checked by HTTP: index 200, it names the new asset hashes). Text files are served with Content-Encoding: gzip (checked: listings 69 KB, app code 133 KB, styles 39 KB over the wire). An agent should not read `.env` (it holds the SAS token) and should not open the hosted site in its own browser (it loads Oikotie photos): check it with HTTP status and headers only. The SAS token has an expiry date; the deploy says when it has expired.
- **Do not change** `format: "tampere-city-boy/oikotie-capture@1"` in the capture files (old capture files would stop importing) or the `tcb.*` localStorage keys (the shortlist would be lost) without a migration.
- **Agent checks of animations need the browser pane visible:** while it is hidden, `requestAnimationFrame` does not run, so Leaflet zooms (and the strike) only happen when a screenshot pumps a frame, and CSS animations are measured mid-way.
- **Improvements the user has in mind:** not yet written down. Ask, then record them here and in the spec before building (explain-before-implementing, see CLAUDE.md).

## 3. Open items
- The user's own check of 3 listings against Oikotie (ids 24760731, 24705365, 24716849: rent, size, available date, lease text) is still pending.
- Real Oikotie photos have never been seen by an agent (by design); only the user's browser loads them. The gallery and photo cards were tested with generated images.
- Maybe: the satellite map ("Recon sat") as the default instead of the dark canvas.
- One listing has 3.5 €/m² (rent per m²), probably a wrong size in the ad.
- `npm run ui:dev` was started once (Vite and the `/api` proxy work) but hot reload was not exercised.
- Move-in buckets are parked ("think later", the user's words). A scratch classifier put the 381 listings into Now (before 1.12.2026) 201, December 144, January 28, Later 2, Unknown 6, using the date field first and otherwise the `availabilityInfo` text (heti, ISO dates, d.m.yyyy, d.m., Finnish month names, "sopimuksen mukaan"). It is not in the project; rebuild it from this description only when the user asks.
- Unknowns about the source (token lifetime, download prompts, Firefox) are in `docs/02-data-source.md` §9; the `buildingOverrideBuildingType` code mapping is unverified (the UI shows the raw code).
- Scheduling of captures is explicitly deferred ("I will define it later").

## 4. Dataset snapshot (2026-11-11, 381 listings)
Useful for sanity checks, not for spec:
- Build year 1905–2026, **40 have none**; rent 480–1400 €; size 40–136 m²; rooms 1–5; distance to Keskustori 0–5.6 km.
- **136 have no available date** (the text, e.g. "heti", is shown instead); dates run 2025-08-31 … 2027-03-26; 380 are in `v_window`.
- Lease text on 186; pets/furnished are stored as `'1'`, `'0'` or NULL (synthetic fixtures use `'true'`/`'false'`; the API reads both).
- **17 listings have only an approximate location** (Oikotie's placeholder point, replaced by the postal-area centre, `location_approx = 1`), in 7 buildings; 158 listings share a coordinate with others (48 spots, up to 10 each), which the map spreads out.
- Building-type codes: 1 (359), 256 (19), 2 (3).

## 5. Privacy
Since 2026-11-11 listing data may leave the PC for the user's own hosted copy (NFR-03; the "stays on this PC" rule was removed), but it stays personal: never in commits, issues or anything shared. `data/`, `reports/`, `dist/`, `web/dist/`, `*.db` and `oikotie-*.json` are git-ignored. This file names 3 listing ids; remove them if the repo is ever made public.
