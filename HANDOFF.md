# Handoff: Tampere Targets

_Last updated 2026-11-12, at release 1.8.1. The rules and the read order are in [CLAUDE.md](CLAUDE.md); the spec is in [docs/](docs/). This file holds the **current state, open items and things that are true but aren't in the spec**. It is meant to stay short: when something is finished, move it to [CHANGELOG.md](CHANGELOG.md) or the spec and delete it here._

## 1. State
- **Released:** `v1.8.1` on `main` (private GitHub repo `jouni-huttunen/tampere-targets`; `main` tracks `origin/main`). The local folder is named `tampere-city-boy` unless the user asks otherwise. `npm test`: 122 passing.
- **Checked only in the browser pane, not yet on the user's real phone:** the phone layouts (upright and held sideways), swipe between targets, the ground-intel cards, and frame rates (work per step was measured on the dev PC only).
- **Data:** `data/listings.db` (git-ignored) holds 381 listings from two real captures (2026-11-10/11), all with details; the second run found nothing new, so the "New" tag has only been tested on synthetic databases.
- **Environment:** Windows 11, Node 26.13.0 from the official nodejs.org MSI (no version manager; `.nvmrc` only records the version). The user dislikes winget and nvm-windows (see CLAUDE.md). An empty `C:\nvm4w` folder exists; it is harmless.
- **PATH gotcha:** terminal tabs started by a process that predates a PATH change keep the old PATH, so `node` may be missing. Restart the app, or per shell: `$env:Path = "C:\Program Files\nodejs;$env:APPDATA\npm;$env:Path"`.
- **Git:** the user's approved workflow is a short-lived branch → commit → fast-forward `main` → push; commit and push only when asked. "Release" always includes a deploy, and every change is deployed for the user to test (CLAUDE.md, Release and deploy). `git config user.name` is "Anonymous" (the user knows). In PowerShell 5.1, pass multi-line commit messages with `git commit -F <file>` (a here-string piped to `-F -` can lose the message), and read UTF-8 files with `-Encoding UTF8` or .NET (`Get-Content -Raw` mangles `—` and `ä`). The working tree uses CRLF line endings: scripted edits must match `\r\n`.
- **Ground intel:** NV shows tram and bus stops and Kesko / S-ryhmä / Lidl stores (FR-43…45) from `web/public/infra.json` (committed by the user's choice; fetched 2026-11-12: 1,020 stops, 90 stores). Refresh with `npm run infra` (two requests; Overpass often answers 502/504 at first and the script retries), then deploy.
- **Photo checks:** photo layout is tested with a synthetic database of generated SVG photos (data URIs, mixed shapes, one listing with 24 photos) served with `TCB_DB=<file> node server/index.mjs --port 3100`. Test with many photos: gallery layout bugs show only once the thumbnail strip is wider than the profile.

## 2. Next
- **Hosted copy:** live on Azure Storage, deployed 2026-11-12 with **v1.8.1** (mobile stability and leaner listing details): 833 files, 381 listings, 6.2 MB uploaded gzipped, 24.5 MB raw. HTTP verified: index 200, asset `index-DlRdAT-u.js` matches the local build and carries 1.8.1; listing details exclude raw JSON and the separate raw endpoint answers 200. Agent checks use HTTP only, without loading Oikotie photos. Do not read `.env` (it holds the SAS token).
- **Do not change** `format: "tampere-city-boy/oikotie-capture@1"` in the capture files (existing capture files would stop importing) or the `tcb.*` localStorage keys (the shortlist would be lost) without a migration.
- **Agent checks of animations need the browser pane visible:** while it is hidden, `requestAnimationFrame` does not run, so Leaflet pans, zooms and the strike never finish, and CSS animations are measured mid-way. Instant moves (`animate: false`) still work for logic checks.
- **Improvements the user has in mind:** not written down. Ask, then record them here and in the spec before building (explain-before-implementing, see CLAUDE.md).

## 3. Open items
- **Phone stability fixes (1.8.1; physical-device verification pending):** sideways overflow, the page scrolling behind the profile, no ‹ › for targets outside the map view, raw JSON loaded on demand (CHANGELOG "1.8.1"). Checked in the browser pane at 360/384/412/430 px, 915 × 412 sideways and desktop, with photos off; **not yet on the user's S24+** (touch swipes, real scroll momentum, photo decoding and frame rate unverified there), so the original stutter is not confirmed fixed.
- **Phone rotation zoom-out** (parked by the user): portrait → landscape → portrait can leave the page looking smaller. Not reproducible in the pane (the page stays screen-width). The page could be wider than the screen in the Cards view (fixed above), a likely cause: re-check on the phone before trying the other proposed fixes (`minimum-scale=1` in the viewport tag, `overflow-x: clip` on the page, a zoom reset after rotation).
- The user's own check of 3 listings against Oikotie (ids 24760731, 24705365, 24716849: rent, size, available date, lease text) is pending.
- Real Oikotie photos are never seen by an agent (by design); only the user's browser loads them. The gallery and photo cards are tested with generated images.
- Maybe: the satellite map ("Recon sat") as the default instead of the dark canvas.
- One listing has 3.5 €/m² (rent per m²), probably a wrong size in the ad.
- Hot reload in `npm run ui:dev` is untested (Vite and the `/api` proxy work).
- Unknowns about the source (token lifetime, download prompts, Firefox) are in `docs/02-data-source.md` §9; the `buildingOverrideBuildingType` code mapping is unverified (the profile does not show it).
- Scheduling of captures is explicitly deferred ("I will define it later").

## 4. Dataset snapshot (2026-11-11, 381 listings)
Useful for sanity checks, not for spec:
- Build year 1905–2026, **40 have none**; rent 480–1400 €; size 40–136 m²; rooms 1–5; distance to Keskustori 0–5.6 km.
- **136 have no available date** (the text, e.g. "heti", is shown instead); dates run 2025-08-31 … 2027-03-26; 380 are in `v_window`.
- Lease text on 186; pets/furnished are stored as `'1'`, `'0'` or NULL (synthetic fixtures use `'true'`/`'false'`; the API reads both).
- **17 listings have only an approximate location** (Oikotie's placeholder point, shown at the postal-area centre, `location_approx = 1`), in 7 buildings; 158 listings share a coordinate with others (48 spots, up to 10 each), which the map spreads out.
- Building-type codes: 1 (359), 256 (19), 2 (3).

## 5. Privacy
Listing data may leave the PC for the user's own hosted copy (NFR-03), but it stays personal: never in commits, issues or anything shared. `data/`, `reports/`, `dist/`, `web/dist/`, `*.db` and `oikotie-*.json` are git-ignored. This file names 3 listing ids; remove them if the repo is ever made public.
