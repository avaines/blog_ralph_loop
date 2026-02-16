const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const defaultDbPath = path.join(process.cwd(), "data", "app.sqlite");
const dbPath = process.env.TODO_DB_PATH
  ? path.resolve(process.env.TODO_DB_PATH)
  : defaultDbPath;
const dataDir = path.dirname(dbPath);

function initDb() {
  fs.mkdirSync(dataDir, { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      group_name TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  return { db, dbPath };
}

module.exports = { initDb, dbPath };
