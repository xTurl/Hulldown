import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';

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

export function closeDb(): void {
  if (db) {
    db.close();
    db = undefined;
  }
}

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'cache.db');
    db = new Database(dbPath);
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
        arena_id TEXT PRIMARY KEY,
        account_id INTEGER NOT NULL,
        json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS weekly_reports (
        account_id INTEGER NOT NULL,
        iso_week TEXT NOT NULL,
        json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (account_id, iso_week)
      );
      CREATE INDEX IF NOT EXISTS idx_battle_debriefs_account ON battle_debriefs(account_id);
      CREATE INDEX IF NOT EXISTS idx_battles_account_played   ON battles(account_id, played_at DESC);
      CREATE INDEX IF NOT EXISTS idx_battles_account_tank     ON battles(account_id, tank_key);
      CREATE INDEX IF NOT EXISTS idx_battles_account_map      ON battles(account_id, map_name);
      CREATE INDEX IF NOT EXISTS idx_battles_account_arena_id ON battles(account_id, arena_id);
    `);
    runMigrations(db);
  }
  return db;
}

function runMigrations(database: Database.Database): void {
  addMissingColumns(database, 'progress_snapshots', PROGRESS_SNAPSHOT_MIGRATIONS);
  addMissingColumns(database, 'battles', BATTLES_MIGRATIONS);
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
