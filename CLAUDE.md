# CLAUDE.md

A personal tool that collects Oikotie rental listings for Tampere into a local SQLite database and browses them in a local map and list web app. Single user, runs on their Windows 11 PC. The local database is the master; the user may push a copy to a hosted site for their own use.

This codebase is yours: what it's for and how it's built are your call, and you'll keep building on it.

## Read first
1. [HANDOFF.md](HANDOFF.md): current state, open items and what is planned next.
2. [docs/](docs/): the spec and the single source of truth: `01-requirements.md` (what, with acceptance criteria), `02-data-source.md` (Oikotie API facts, field map, other sources), `03-design.md` (architecture, schema, UI).
3. [CHANGELOG.md](CHANGELOG.md) for what each release contains. [README.md](README.md) for the commands.

When code and docs disagree, fix whichever is wrong in the same change. A change is not done until `npm test` passes and the matching doc is updated.

## Commands
`npm test` · `npm run capture` · `npm run import` · `npm run rebuild` · `npm run report` · `npm run list` · `npm run ui` (builds `web/`, serves http://localhost:3000) · `npm run ui:dev` (hot reload). Node ≥ 26; the capture, import, database and CLI code use only Node built-ins (`node:sqlite`, `node:test`); npm dependencies are for the UI only.

## Working agreements (the user's standing rules)
- **Explain before implementing.** Describe the user-facing flow (what they run, what they see, how it behaves, which dependencies you add) and get an explicit go-ahead before writing code for anything new.
- **Deploy after every change** so the user can test it on the hosted copy (often on their phone), without asking first (the user's rule). See Release and deploy.
- **UI quality matters a lot to this user.** The user rejects anything that looks boring or cheap. Weigh UI and UX heavily, keep all styling in `web/src/styles/tokens.css` (no raw colours elsewhere), keep text contrast at WCAG AA, and respect `prefers-reduced-motion`.

## Release and deploy
`npm run deploy` builds the app from the **working tree** (committed or not) with the current local data and uploads it to the user's Azure static website (about a minute; `.env` holds the SAS token: never read it).
- **After a change** that shows in the app: once `npm test` passes (and the preview check, for UI work), run `npm run deploy`, check it by HTTP (below) and tell the user it is live to test. The header still shows the last released version, so say that the hosted copy runs unreleased work. Update the Hosted copy line in HANDOFF (what is deployed, when).
- **When the user says "release"**, in this order, so one commit holds it all:
  1. Version: patch for fixes and reverts, minor for features. Set it in `package.json`, `package-lock.json` (2 places), the `_Version X_` line in README, the CHANGELOG heading (`## Unreleased` → `## X — YYYY-MM-DD: short title`, then a `Deployed.` line) and HANDOFF (the "at release X" header line, the Released line, the Hosted copy line).
  2. `npm test`.
  3. `npm run deploy`, then the HTTP check.
  4. Branch `release-X` → `git add` the files by name → `git commit -F <file>` → `git switch main` → `git merge --ff-only` → delete the branch → `git tag -a vX -m "Release X: title"` → `git push origin main` and `git push origin vX`.
- **If the deploy fails** (most often an expired SAS token; the deploy says so), stop and tell the user; don't commit a release marked "Deployed".

## Hard guardrails for Oikotie
- Oikotie answers 403 to every non-browser client, so data is captured by a **DevTools console script the user pastes into their own browser** and imported from a downloaded file.
- **Don't run the bulk capture yourself**, and don't load Oikotie pages or photos in the agent's browser pane: Oikotie's robots.txt opts out of Anthropic agents and `Disallow: /api*` for all bots. A smoke test of at most 2 detail requests is allowed.
- One request at a time, about 2 s apart plus jitter; stop on 403 or 429. `config.json` refuses a delay under 2000 ms.
- **Preview the UI with `npm run ui -- --no-photos --port 3005`** (launch entry `ui-no-photos`; the user often has their own `npm run ui` on 3000). The photo CDN is the only Oikotie traffic the UI causes. Test "New" listings and photos against a temporary synthetic database (`TCB_DB=<file>`, built with `test/helpers.mjs`), never by editing `data/listings.db`.
- The user accepted the terms-of-service risk for **personal use** only.

## Privacy
Listing data may leave this PC for the user's own use (a hosted copy of the app), but it is personal use only: never in commits, issues, tests or anything shared with others. Tests use **synthetic** fixtures only. `data/`, `reports/`, `dist/`, `web/dist/`, `*.db` and `oikotie-*.json` are git-ignored. The server binds to 127.0.0.1 and has no write routes.

## Platform notes (Windows, PowerShell 5.1)
- Read and write UTF-8 files with `-Encoding UTF8` or .NET; `Get-Content -Raw` mangles `—`, `ä` and runes.
- Pass multi-line commit messages with `git commit -F <file>`.
- A screenshot of the browser pane can time out while it is hidden; retry, or read the page with scripts instead.
- Checking a tile server's HTTP status is not enough (CARTO returned 200 with an "API key required" image); look at the image.
