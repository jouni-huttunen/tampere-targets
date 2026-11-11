# Tampere Targets

A personal tool for finding a rental in Tampere. It collects Oikotie rental listings into a local SQLite database (through a script you run in your own browser) and lets you browse them on a local map and list. Everything stays on your PC.

_Version 1.1.0 (called "Tampere homes" up to 1.0.0). The UI is a tactical console: press **N** for night vision._

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

**Capturing:** open asunnot.oikotie.fi in Chrome or Edge, press F12 and open the Console. The first time in a browser profile, type `allow pasting` and press Enter. Paste the script and press Enter, then keep that tab in front until it downloads `oikotie-<time>.json` (about one request every two seconds, so a first full capture takes 10–25 minutes; later runs fetch far less). Then run step 2.

Filters are kept in the address bar, so any view can be bookmarked. The shortlist is saved in the browser only.

## Other commands

| Command | Does |
|---|---|
| `npm test` | All tests (synthetic data only, no network) |
| `npm run list` | Listings in the move-in window, in the terminal |
| `npm run report` | Re-writes the latest run's report |
| `npm run rebuild` | Recomputes every column from the stored JSON (offline) |
| `npm run ui:dev` | The UI with hot reload at http://localhost:5173 |
| `npm run ui -- --port 3001` | The UI on another port |
| `npm run ui -- --no-photos` | The UI with photo placeholders |

## Documentation

- [CLAUDE.md](CLAUDE.md): rules and read order for AI agents working on the project
- [HANDOFF.md](HANDOFF.md): current state and what is planned next
- [docs/](docs/): requirements, data source and design
- [CHANGELOG.md](CHANGELOG.md): what is in each release

Listing data (`data/`, `reports/`, capture files) is personal and git-ignored; never commit or share it.
