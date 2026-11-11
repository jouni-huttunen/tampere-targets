// Shared by Node and the browser capture script. Keep it pure and ASCII-only.
import { cardHash } from './hash.mjs';

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;

function parseTime(iso) {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Decide between a full sweep and an age-filtered incremental search.
 * state: { lastRunStartedAt, lastFullSweepAt, forceFull }
 * cfg:   { fullSweepEveryDays, maxGapDays }
 * Returns { mode: 'full'|'incremental', ageFilter: null|1|2|4, reason }.
 */
export function planRun(state, cfg, nowMs) {
  const full = (reason) => ({ mode: 'full', ageFilter: null, reason });
  if (state && state.forceFull) return full('forced');
  const last = parseTime(state && state.lastRunStartedAt);
  if (last === null) return full('first run');
  const lastFull = parseTime(state && state.lastFullSweepAt);
  if (lastFull === null) return full('no complete full sweep yet');
  if (nowMs - lastFull > cfg.fullSweepEveryDays * DAY_MS) return full('full sweep is due');
  const gap = nowMs - last;
  if (gap > cfg.maxGapDays * DAY_MS) return full('long gap since the last run');
  const padded = gap + 2 * HOUR_MS;
  const ageFilter = padded <= 24 * HOUR_MS ? 1 : padded <= 48 * HOUR_MS ? 2 : 4;
  return { mode: 'incremental', ageFilter, reason: 'recent run' };
}

/**
 * Which listings need their detail fetched, in priority order:
 * new, changed card, no detail yet, stale in-window, stale other.
 * state.known: { "<cardId>": [searchHash, detailFetchedAtISO|null, inWindow 0|1] }
 * opts.onlySeen: skip known listings that this search did not return
 *   (used after a complete full sweep, where they are about to be marked removed).
 * Returns numeric card ids. The caller applies the maxDetails cap.
 */
export function detailsDue(cards, state, cfg, nowMs, opts) {
  const known = (state && state.known) || {};
  const onlySeen = !!(opts && opts.onlySeen);
  const groups = [[], [], [], [], []];
  const seen = new Set();

  for (const card of cards || []) {
    if (!card || card.cardId == null) continue;
    const id = String(card.cardId);
    if (seen.has(id)) continue;
    seen.add(id);
    const k = known[id];
    if (!k) groups[0].push(id);
    else if (k[0] !== cardHash(card)) groups[1].push(id);
  }

  for (const id of Object.keys(known)) {
    if (onlySeen && !seen.has(id)) continue;
    const k = known[id];
    const fetched = parseTime(k[1]);
    if (fetched === null) {
      groups[2].push(id);
      continue;
    }
    const age = nowMs - fetched;
    if (k[2]) {
      if (age > cfg.windowDays * DAY_MS) groups[3].push(id);
    } else if (age > cfg.otherDays * DAY_MS) {
      groups[4].push(id);
    }
  }

  const out = [];
  const taken = new Set();
  for (const group of groups) {
    for (const id of group) {
      if (taken.has(id)) continue;
      taken.add(id);
      out.push(Number(id));
    }
  }
  return out;
}
