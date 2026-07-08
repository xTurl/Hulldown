import Database from 'better-sqlite3';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';

function sqliteOptions(): Database.Options | undefined {
  if (!app.isPackaged) return undefined;
  const nativeBinding = path.join(
    process.resourcesPath,
    'node_modules/better-sqlite3/build/Release/better_sqlite3.node',
  );
  if (!fs.existsSync(nativeBinding)) {
    throw new Error(`SQLite native module missing: ${nativeBinding}`);
  }
  return { nativeBinding };
}

let db: Database.Database | undefined;

const PROGRESS_SNAPSHOT_MIGRATIONS = [
  'wnx INTEGER NOT NULL DEFAULT 0',
  'account_id INTEGER NOT NULL DEFAULT 0',
  'raw_wins INTEGER NOT NULL DEFAULT 0',
  'raw_damage INTEGER NOT NULL DEFAULT 0',
  'raw_frags INTEGER NOT NULL DEFAULT 0',
  'raw_survived INTEGER NOT NULL DEFAULT 0',
  'raw_xp INTEGER NOT NULL DEFAULT 0',
  'raw_spotted INTEGER NOT NULL DEFAULT 0',
  'raw_dropped_cp INTEGER NOT NULL DEFAULT 0',
];

const BATTLES_MIGRATIONS = [
  'dropped_capture INTEGER NOT NULL DEFAULT 0',
  'damage_received INTEGER NOT NULL DEFAULT 0',
  'damage_blocked INTEGER NOT NULL DEFAULT 0',
  'repair_cost INTEGER NOT NULL DEFAULT 0',
  'net_credits INTEGER NOT NULL DEFAULT 0',
  'mark_of_mastery INTEGER NOT NULL DEFAULT 0',
  'marks_on_gun INTEGER NOT NULL DEFAULT 0',
  'life_time INTEGER NOT NULL DEFAULT 0',
  "achievements TEXT NOT NULL DEFAULT '[]'",
];

const BATTLES_MIGRATIONS_V3 = [
  'abandoned INTEGER NOT NULL DEFAULT 0',
  'stats_estimated INTEGER NOT NULL DEFAULT 0',
];

export function closeDb(): void {
  if (db) {
    db.close();
    db = undefined;
  }
}

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'cache.db');
    db = new Database(dbPath, sqliteOptions());
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS tank_details (
        tank_id INTEGER PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS player_info (
        id INTEGER PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS progress_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        taken_at INTEGER NOT NULL,
        battles INTEGER NOT NULL,
        wn8 INTEGER NOT NULL,
        wnx INTEGER NOT NULL DEFAULT 0,
        win_rate REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS battles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        arena_id TEXT NOT NULL,
        played_at INTEGER NOT NULL,
        tank_key TEXT NOT NULL,
        tank_name TEXT NOT NULL DEFAULT '',
        map_name TEXT NOT NULL,
        battle_type TEXT NOT NULL,
        result TEXT NOT NULL,
        damage INTEGER NOT NULL DEFAULT 0,
        assist INTEGER NOT NULL DEFAULT 0,
        kills INTEGER NOT NULL DEFAULT 0,
        shots INTEGER NOT NULL DEFAULT 0,
        hits INTEGER NOT NULL DEFAULT 0,
        pens INTEGER NOT NULL DEFAULT 0,
        spotted INTEGER NOT NULL DEFAULT 0,
        xp INTEGER NOT NULL DEFAULT 0,
        credits INTEGER NOT NULL DEFAULT 0,
        survived INTEGER NOT NULL DEFAULT 0,
        duration INTEGER NOT NULL DEFAULT 0,
        dropped_capture INTEGER NOT NULL DEFAULT 0,
        damage_received INTEGER NOT NULL DEFAULT 0,
        damage_blocked INTEGER NOT NULL DEFAULT 0,
        repair_cost INTEGER NOT NULL DEFAULT 0,
        net_credits INTEGER NOT NULL DEFAULT 0,
        mark_of_mastery INTEGER NOT NULL DEFAULT 0,
        marks_on_gun INTEGER NOT NULL DEFAULT 0,
        life_time INTEGER NOT NULL DEFAULT 0,
        achievements TEXT NOT NULL DEFAULT '[]',
        UNIQUE(account_id, arena_id)
      );
      CREATE TABLE IF NOT EXISTS scan_state (
        account_id INTEGER PRIMARY KEY,
        last_scan_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS wg_data_cache (
        account_id INTEGER PRIMARY KEY,
        tank_stats TEXT NOT NULL,
        encyclopedia TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS battle_debriefs (
        account_id INTEGER NOT NULL,
        arena_id TEXT NOT NULL,
        json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (account_id, arena_id)
      );
      CREATE TABLE IF NOT EXISTS weekly_reports (
        account_id INTEGER NOT NULL,
        iso_week TEXT NOT NULL,
        json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (account_id, iso_week)
      );
      CREATE TABLE IF NOT EXISTS tank_stat_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        tank_id INTEGER NOT NULL,
        captured_at INTEGER NOT NULL,
        battles INTEGER NOT NULL,
        wins INTEGER NOT NULL,
        losses INTEGER NOT NULL,
        draws INTEGER NOT NULL,
        survived_battles INTEGER NOT NULL,
        damage_dealt INTEGER NOT NULL,
        frags INTEGER NOT NULL,
        spotted INTEGER NOT NULL,
        dropped_capture_points INTEGER NOT NULL,
        xp INTEGER NOT NULL,
        assisted_damage INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_battle_debriefs_account ON battle_debriefs(account_id);
      CREATE INDEX IF NOT EXISTS idx_battles_account_played   ON battles(account_id, played_at DESC);
      CREATE INDEX IF NOT EXISTS idx_battles_account_tank     ON battles(account_id, tank_key);
      CREATE INDEX IF NOT EXISTS idx_battles_account_map      ON battles(account_id, map_name);
      CREATE INDEX IF NOT EXISTS idx_battles_account_arena_id ON battles(account_id, arena_id);
      CREATE INDEX IF NOT EXISTS idx_tank_snapshots_lookup    ON tank_stat_snapshots(account_id, tank_id, captured_at DESC);
    `);
    runMigrations(db);
  }
  return db;
}

/**
 * Numbered schema migrations, applied in order and tracked with
 * PRAGMA user_version. Each entry runs at most once per database;
 * bump the array with a new function to change the schema.
 *
 * Migrations 1–2 predate user_version tracking and therefore stay
 * idempotent (existing installs enter at version 0 regardless of
 * which legacy migrations already ran).
 */
const MIGRATIONS: Array<(db: Database.Database) => void> = [
  // v1 — add columns introduced after the initial release
  (db) => {
    addMissingColumns(db, 'progress_snapshots', PROGRESS_SNAPSHOT_MIGRATIONS);
    addMissingColumns(db, 'battles', BATTLES_MIGRATIONS);
  },
  // v2 — battle_debriefs composite (account_id, arena_id) primary key
  (db) => {
    migrateBattleDebriefsPk(db);
  },
  // v3 — abandoned/stats_estimated flags on battles, so previously-incomplete
  // battles resolved via WG API stat diffing can still be flagged "left early"
  // in the UI while showing real (estimated) numbers instead of blanks.
  (db) => {
    addMissingColumns(db, 'battles', BATTLES_MIGRATIONS_V3);
    db.exec("UPDATE battles SET abandoned = 1 WHERE result = 'incomplete' AND abandoned = 0");
  },
];

function runMigrations(database: Database.Database): void {
  const current = database.pragma('user_version', { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    MIGRATIONS[v](database);
    database.pragma(`user_version = ${v + 1}`);
  }
}

/**
 * Legacy battle_debriefs used arena_id as the sole PRIMARY KEY, which could
 * collide between accounts sharing a machine. Rebuild the table with a
 * composite (account_id, arena_id) key.
 */
function migrateBattleDebriefsPk(database: Database.Database): void {
  const cols = database.prepare('PRAGMA table_info(battle_debriefs)').all() as { name: string; pk: number }[];
  const accountIsPk = (cols.find(c => c.name === 'account_id')?.pk ?? 0) > 0;
  if (accountIsPk) return;
  database.exec(`
    BEGIN;
    CREATE TABLE battle_debriefs_new (
      account_id INTEGER NOT NULL,
      arena_id TEXT NOT NULL,
      json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (account_id, arena_id)
    );
    INSERT INTO battle_debriefs_new (account_id, arena_id, json, created_at)
      SELECT account_id, arena_id, json, created_at FROM battle_debriefs;
    DROP TABLE battle_debriefs;
    ALTER TABLE battle_debriefs_new RENAME TO battle_debriefs;
    COMMIT;
  `);
}

function addMissingColumns(database: Database.Database, table: string, columnDefs: string[]): void {
  const existing = (database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(c => c.name);
  for (const colDef of columnDefs) {
    const colName = colDef.split(' ')[0];
    if (!existing.includes(colName)) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN ${colDef}`);
    }
  }
}
