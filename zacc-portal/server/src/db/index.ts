import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'zacc_portal.db');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initSchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);
}

export function resetDatabase() {
  // Drops all tables so seed.ts can rebuild from scratch (demo convenience only).
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];
  db.pragma('foreign_keys = OFF');
  for (const t of tables) {
    db.exec(`DROP TABLE IF EXISTS "${t.name}"`);
  }
  db.pragma('foreign_keys = ON');
}

export { UPLOADS_DIR, DATA_DIR };
