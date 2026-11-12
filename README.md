# Tampere Targets

A personal tool for finding a rental in Tampere. It collects Oikotie rental listings into a local SQLite database (through a script you run in your own browser) and lets you browse them on a local map and list. The local database is the master.

_Version 1.6.3 (called "Tampere homes" up to 1.0.0; the version is shown after the title). The UI is a tactical console: press **N** for night vision, which also shows stops and grocery stores._

## Setup

Requires Node 26 (the installer from nodejs.org). Then, once:

```bash
npm install
```

## Everyday use

| Step | Command | What happens |
|---|---|---|
| 1. Capture | `npm run capture` | Builds `dist/capture.js` and copies it to the clipboard. |
| 2. Import | `npm run import` | Loads the newest capture file from Downloads into `data/listings.db` and writes a report to `reports/`. |
| 3. Browse | `npm run ui` | Builds the web app and serves it at http://localhost:3000. |
| 4. Publish (optional) | `npm run deploy` | Uploads a copy of the UI with the current data to your Azure static website. |

**Capturing:** open asunnot.oikotie.fi in Chrome or Edge, press F12 and open the Console. The first time in a browser profile, type `allow pasting` and press Enter. Paste the script and press Enter, then keep that tab in front until it downloads `oikotie-<time>.json` (about one request every two seconds, so a first full capture takes 10–25 minutes; later runs fetch far less). Then run step 2.

Filters are kept in the address bar, so any view can be bookmarked. Back closes a target profile (or goes to the target before it). The shortlist is saved in the browser only.

**Keys:** D or S opens the next target, A or W the previous one; N toggles night vision; Esc closes. The two keys right of P ([ and ], Å and ¨ on a Finnish keyboard) hide or show the Mission parameters and the Target list for more map; so do the « » buttons in their title bars. The choice is remembered in the browser.

**Night vision** (N) also shows tram stops, bus stops (zoom in) and Kesko, S-ryhmä and Lidl grocery stores; hover or tap one for its card with the stop number or the store's opening hours. The data is in `web/public/infra.json`; refresh it now and then with `npm run infra` (it downloads the Nysse timetable feed and asks OpenStreetMap; then rebuild the UI or deploy).

## Hosted copy (Azure)

The local database is the master. `npm run deploy` uploads a read-only snapshot (the web app plus the data as JSON files) to Azure Storage static website hosting; it changes only when you run it again.

One-time setup in the Azure Portal:
1. Create a storage account, then under **Data management > Static website** enable it with index document `index.html`.
2. Under **Containers > $web > Shared access tokens**, create a SAS token with Read, Add, Create, Write, Delete and List, HTTPS only, and an expiry date.
3. Fill in `.env` in the project folder (git-ignored; the comments say where each value is).

Then `npm run deploy` after each import. `npm run deploy -- --dry-run` builds into `dist/site` without uploading. The site has no sign-in, so keep the URL to yourself; it is kept out of search engines.

## Other commands

| Command | Does |
|---|---|
| `npm test` | All tests (synthetic data only, no network) |
| `npm run list` | Listings in the move-in window, in the terminal |
| `npm run report` | Re-writes the latest run's report |
| `npm run rebuild` | Recomputes every column from the stored JSON (offline) |
| `npm run infra` | Refreshes the night-vision stops and stores (`-- --dry-run` to only show the counts) |
| `npm run ui:dev` | The UI with hot reload at http://localhost:5173 |
| `npm run ui -- --port 3001` | The UI on another port |
| `npm run ui -- --no-photos` | The UI with photo placeholders |
| `npm run deploy -- --dry-run` | Builds the hosted copy into `dist/site` without uploading |

## Documentation

- [CLAUDE.md](CLAUDE.md): rules and read order for AI agents working on the project
- [HANDOFF.md](HANDOFF.md): current state and what is planned next
- [docs/](docs/): requirements, data source and design
- [CHANGELOG.md](CHANGELOG.md): what is in each release

Listing data (`data/`, `reports/`, capture files) is personal and git-ignored; never commit or share it.
