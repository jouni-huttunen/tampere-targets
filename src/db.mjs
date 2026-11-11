// SQLite access (node:sqlite). Schema is documented in docs/03-design.md, section 4.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { distanceColumn } from './normalize.mjs';

const MIGRATIONS = [
  // 1: initial schema
  `
  CREATE TABLE runs (
    run_id           INTEGER PRIMARY KEY,
    capture_id       TEXT NOT NULL UNIQUE,
    started_at       TEXT NOT NULL,
    finished_at      TEXT,
    imported_at      TEXT NOT NULL,
    mode             TEXT NOT NULL,
    age_filter       INTEGER,
    sweep_complete   INTEGER NOT NULL,
    is_initial       INTEGER NOT NULL,
    found            INTEGER,
    search_requests  INTEGER,
    detail_requests  INTEGER,
    new_count        INTEGER,
    changed_count    INTEGER,
    removed_count    INTEGER,
    error_count      INTEGER,
    status           TEXT NOT NULL,
    stopped_reason   TEXT
  );

  CREATE TABLE listings (
    card_id            INTEGER PRIMARY KEY,
    url                TEXT,
    status             INTEGER,
    first_seen_at      TEXT NOT NULL,
    first_seen_run_id  INTEGER NOT NULL REFERENCES runs(run_id),
    last_seen_at       TEXT NOT NULL,
    removed_at         TEXT,
    published_at       TEXT,
    published_sort_at  TEXT,
    price_changed_at   TEXT,
    address            TEXT,
    district           TEXT,
    zip                TEXT,
    lat                REAL,
    lon                REAL,
    rent_eur           REAL,
    size_m2            REAL,
    rooms              INTEGER,
    room_config        TEXT,
    build_year         INTEGER,
    building_type      INTEGER,
    floor              INTEGER,
    floor_count        INTEGER,
    available_date     TEXT,
    availability_text  TEXT,
    lease_text         TEXT,
    deposit_eur        REAL,
    water_fee          TEXT,
    electric_fee       TEXT,
    pets_allowed       TEXT,
    furnished          TEXT,
    company_name       TEXT,
    search_json        TEXT,
    search_hash        TEXT,
    search_fetched_at  TEXT,
    detail_json        TEXT,
    detail_hash        TEXT,
    detail_fetched_at  TEXT
  );
  CREATE INDEX listings_zip ON listings(zip);
  CREATE INDEX listings_removed ON listings(removed_at);

  CREATE TABLE listing_versions (
    card_id      INTEGER NOT NULL,
    fetched_at   TEXT NOT NULL,
    run_id       INTEGER NOT NULL,
    detail_hash  TEXT NOT NULL,
    detail_json  TEXT NOT NULL,
    PRIMARY KEY (card_id, fetched_at)
  );

  CREATE TABLE listing_changes (
    change_id   INTEGER PRIMARY KEY,
    card_id     INTEGER NOT NULL,
    run_id      INTEGER NOT NULL,
    changed_at  TEXT NOT NULL,
    field       TEXT NOT NULL,
    old         TEXT,
    new         TEXT
  );
  CREATE INDEX listing_changes_run ON listing_changes(run_id);
  `,
  // 2: 1 = lat/lon is the postal-code centre, not the home itself
  `
  ALTER TABLE listings ADD COLUMN location_approx INTEGER NOT NULL DEFAULT 0;
  `,
];

/**
 * Open the database.
 * - readOnly: no schema work at all (the file must exist).
 * - otherwise: create the folder, run migrations and, when a config is given,
 *   make sure the distance columns and the views match it.
 */
export function openDb(file, { readOnly = false, config = null } = {}) {
  if (!readOnly && file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file, { readOnly });
  if (!readOnly) {
    db.exec('PRAGMA foreign_keys = ON');
    migrate(db);
    if (config) {
      ensurePlaceColumns(db, config);
      createViews(db, config);
    }
  }
  return db;
}

function migrate(db) {
  let version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > MIGRATIONS.length) {
    throw new Error(`Database schema version ${version} is newer than this tool (${MIGRATIONS.length}).`);
  }
  while (version < MIGRATIONS.length) {
    transaction(db, () => {
      db.exec(MIGRATIONS[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
    });
    version++;
  }
}

export function listingColumns(db) {
  return db.prepare('PRAGMA table_info(listings)').all().map((c) => c.name);
}

function ensurePlaceColumns(db, config) {
  const existing = new Set(listingColumns(db));
  for (const place of config.places) {
    const column = distanceColumn(place);
    if (!existing.has(column)) db.exec(`ALTER TABLE listings ADD COLUMN ${column} REAL`);
  }
}

function createViews(db, config) {
  const cutoff = config.windowCutoff; // validated as YYYY-MM-DD by config.mjs
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) throw new Error('Bad windowCutoff');
  db.exec(`
    DROP VIEW IF EXISTS v_new;
    DROP VIEW IF EXISTS v_window;
    DROP VIEW IF EXISTS v_active;
    CREATE VIEW v_active AS SELECT * FROM listings WHERE removed_at IS NULL;
    CREATE VIEW v_window AS
      SELECT * FROM v_active WHERE available_date IS NULL OR available_date < '${cutoff}';
    CREATE VIEW v_new AS
      SELECT l.* FROM v_active l JOIN runs r ON r.run_id = l.first_seen_run_id
      WHERE r.is_initial = 0
        AND l.first_seen_run_id >= (SELECT MAX(run_id) FROM runs WHERE sweep_complete = 1);
  `);
}

/** Run fn inside a transaction; roll back on any error. */
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function sqlValue(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  return v;
}

export function insertRow(db, table, row) {
  const keys = Object.keys(row);
  const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
  return db.prepare(sql).run(...keys.map((k) => sqlValue(row[k])));
}

export function updateRow(db, table, keyColumn, keyValue, patch) {
  const keys = Object.keys(patch);
  if (keys.length === 0) return;
  const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE ${keyColumn} = ?`;
  db.prepare(sql).run(...keys.map((k) => sqlValue(patch[k])), keyValue);
}

export function getListing(db, cardId) {
  return db.prepare('SELECT * FROM listings WHERE card_id = ?').get(cardId) ?? null;
}

export function latestRun(db) {
  return db.prepare('SELECT * FROM runs ORDER BY run_id DESC LIMIT 1').get() ?? null;
}

export function counts(db) {
  const one = (sql) => db.prepare(sql).get().n;
  return {
    total: one('SELECT COUNT(*) AS n FROM listings'),
    active: one('SELECT COUNT(*) AS n FROM v_active'),
    window: one('SELECT COUNT(*) AS n FROM v_window'),
    isNew: one('SELECT COUNT(*) AS n FROM v_new'),
    removed: one('SELECT COUNT(*) AS n FROM listings WHERE removed_at IS NOT NULL'),
    withDetail: one('SELECT COUNT(*) AS n FROM v_active WHERE detail_json IS NOT NULL'),
  };
}
