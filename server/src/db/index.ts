import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// DATA_DIR lets production keep the database and uploaded evidence on a mounted volume (see docs/MIGRATION.md).
// If that folder cannot be created (for example a disk that is not attached), fall back to the local data folder
// with a loud warning rather than refusing to start; data kept there is lost when the host is rebuilt.
const LOCAL_DATA_DIR = path.join(__dirname, '..', '..', 'data');
function resolveDataDir(): string {
  const wanted = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : LOCAL_DATA_DIR;
  try {
    fs.mkdirSync(wanted, { recursive: true });
    fs.accessSync(wanted, fs.constants.W_OK);
    return wanted;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`WARNING: DATA_DIR "${wanted}" is not usable (${(e as Error).message}); using ${LOCAL_DATA_DIR}. Data will NOT persist across restarts.`);
    fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
    return LOCAL_DATA_DIR;
  }
}
const DATA_DIR = resolveDataDir();

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