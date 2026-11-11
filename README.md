# Tampere homes

A personal tool for finding a rental in Tampere: it collects Oikotie rental listings into a
local SQLite database (through a script you run in your own browser) and shows them on a
local map and list. Everything stays on this PC.

Requires Node 26 (the official installer from nodejs.org). Install the dependencies once:

```bash
npm install
```

## Everyday use

| Step | Command | What happens |
|---|---|---|
| 1. Capture | `npm run capture` | Builds `dist/capture.js` and copies it to the clipboard. Open asunnot.oikotie.fi in Chrome or Edge, press F12 → Console, paste, and keep the tab in front until it downloads `oikotie-<time>.json`. |
| 2. Import | `npm run import` | Loads the newest capture file from Downloads into `data/listings.db` and writes a report to `reports/`. |
| 3. Browse | `npm run ui` | Builds the web app and serves it at **http://localhost:3000**. |

In the browser: build year sits in the header; the other filters are under **Filters**. Hover
a card or a marker to find its partner, click either for the details (← → step through the
list, Esc closes). The star keeps a shortlist in this browser. Filters live in the address
bar, so a view can be bookmarked.

## Other commands

| Command | Does |
|---|---|
| `npm test` | All tests (synthetic data only, no network) |
| `npm run list` | Listings in the move-in window, in the terminal |
| `npm run report` | Re-writes the latest run's report |
| `npm run rebuild` | Recomputes every column from the stored JSON (offline) |
| `npm run ui:dev` | The UI with hot reload at http://localhost:5173 |
| `npm run ui -- --no-photos` | The UI with photo placeholders (used for agent previews) |
| `npm run ui -- --port 3001` | The UI on another port |

## Documents

- `HANDOFF.md`: current state, decisions and next steps (read this first when picking the work up)
- `PLAN.md`: the approved plan
- `docs/01-requirements.md`, `docs/02-data-source.md`, `docs/03-design.md`: the spec

Listing data (`data/`, `reports/`, capture files) is personal and git-ignored; never commit
or share it.
