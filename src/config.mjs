import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DB_PATH = process.env.TCB_DB || path.join(ROOT, 'data', 'listings.db');
export const REPORTS_DIR = process.env.TCB_REPORTS || path.join(ROOT, 'reports');
export const DIST_DIR = path.join(ROOT, 'dist');

export function loadConfig(file = path.join(ROOT, 'config.json')) {
  return validateConfig(JSON.parse(readFileSync(file, 'utf8')));
}

export function validateConfig(config) {
  const fail = (msg) => {
    throw new Error('config.json: ' + msg);
  };
  if (!Array.isArray(config.areas) || config.areas.length === 0) fail('"areas" must be a non-empty list');
  for (const a of config.areas) {
    if (!/^\d{5}$/.test(String(a.zip))) fail(`bad postal code "${a.zip}"`);
    if (a.id != null && !Number.isInteger(a.id)) fail(`area ${a.zip}: "id" must be a whole number`);
    if ((a.lat == null) !== (a.lon == null)) fail(`area ${a.zip}: give both "lat" and "lon", or neither`);
    if (a.lat != null && (!Number.isFinite(a.lat) || !Number.isFinite(a.lon))) fail(`area ${a.zip}: "lat"/"lon" must be numbers`);
  }
  const f = config.filters || {};
  for (const key of ['cardType', 'sizeMin', 'priceMax']) {
    if (!Number.isFinite(f[key])) fail(`filters.${key} must be a number`);
  }
  if (!Array.isArray(config.places)) fail('"places" must be a list');
  const keys = new Set();
  for (const p of config.places) {
    if (!/^[a-z][a-z0-9_]*$/.test(String(p.key))) fail(`place key "${p.key}" must be lower-case letters, digits or _`);
    if (keys.has(p.key)) fail(`duplicate place key "${p.key}"`);
    keys.add(p.key);
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) fail(`place "${p.key}" needs lat and lon`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(config.windowCutoff))) fail('"windowCutoff" must be YYYY-MM-DD');
  const c = config.capture || {};
  for (const key of ['delayMs', 'jitterMs', 'pageSize', 'maxDetails']) {
    if (!Number.isFinite(c[key]) || c[key] < 0) fail(`capture.${key} must be a number`);
  }
  if (c.delayMs < 500) fail('capture.delayMs must be at least 500 (polite pacing is a hard rule)');
  const r = config.refresh || {};
  for (const key of ['fullSweepEveryDays', 'maxGapDays', 'windowDays', 'otherDays']) {
    if (!Number.isFinite(r[key]) || r[key] < 0) fail(`refresh.${key} must be a number`);
  }
  return config;
}

/** The flat config object that is built into the browser capture script. */
export function captureConfig(config, overrides = {}) {
  const missing = config.areas.filter((a) => a.id == null).map((a) => a.zip);
  if (missing.length) throw new Error('No Oikotie location id for postal code(s): ' + missing.join(', '));
  return {
    cardType: config.filters.cardType,
    sizeMin: config.filters.sizeMin,
    priceMax: config.filters.priceMax,
    areas: config.areas.map((a) => [a.id, 5, String(a.zip)]),
    delayMs: config.capture.delayMs,
    jitterMs: config.capture.jitterMs,
    pageSize: config.capture.pageSize,
    maxDetails: config.capture.maxDetails,
    fullSweepEveryDays: config.refresh.fullSweepEveryDays,
    maxGapDays: config.refresh.maxGapDays,
    windowDays: config.refresh.windowDays,
    otherDays: config.refresh.otherDays,
    ...overrides,
  };
}
