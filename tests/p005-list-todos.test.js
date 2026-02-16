const fs = require("node:fs");
const path = require("node:path");
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { Readable } = require("node:stream");

const testDbPath = path.join(process.cwd(), "tmp", "p005-list.sqlite");
process.env.TODO_DB_PATH = testDbPath;
fs.mkdirSync(path.dirname(testDbPath), { recursive: true });
fs.rmSync(testDbPath, { force: true });
fs.rmSync(`${testDbPath}-shm`, { force: true });
fs.rmSync(`${testDbPath}-wal`, { force: true });

const { requestHandler } = require("../src/server");

function callRequestHandler({ method, url, body }) {
  return new Promise((resolve, reject) => {
    const req = Readable.from(body ? [JSON.stringify(body)] : []);
    req.method = method;
    req.url = url;
    req.on("error", reject);

    const res = {
      statusCode: 200,
      headers: {},
      chunks: [],
      writeHead(code, headers) {
        this.statusCode = code;
        this.headers = headers;
      },
      end(chunk) {
        if (chunk) {
          this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const raw = Buffer.concat(this.chunks).toString("utf8");
        resolve({
          statusCode: this.statusCode,
          headers: this.headers,
          body: raw ? JSON.parse(raw) : null,
        });
      },
    };

    requestHandler(req, res).catch(reject);
  });
}

beforeEach(() => {
  const db = new DatabaseSync(testDbPath);
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
  db.exec("DELETE FROM todos;");
  db.exec("DELETE FROM sqlite_sequence WHERE name = 'todos';");

  const seed = db.prepare(`
    INSERT INTO todos (title, category, group_name, completed, created_at)
    VALUES (?, ?, ?, ?, ?);
  `);

  seed.run("Older", "Chores", "Home", 0, "2026-02-15T10:00:00.000Z");
  seed.run("Newer", "Work", "Office", 1, "2026-02-16T10:00:00.000Z");
  db.close();
});

test("GET /api/todos returns seeded todos with required fields in newest-first order", async () => {
  const response = await callRequestHandler({ method: "GET", url: "/api/todos" });

  assert.equal(response.statusCode, 200);
  assert.ok(Array.isArray(response.body));
  assert.equal(response.body.length, 2);

  const [first, second] = response.body;
  assert.equal(first.title, "Newer");
  assert.equal(second.title, "Older");

  for (const item of response.body) {
    assert.equal(typeof item.id, "number");
    assert.equal(typeof item.title, "string");
    assert.equal(typeof item.category, "string");
    assert.equal(typeof item.group_name, "string");
    assert.equal(typeof item.completed, "boolean");
    assert.equal(typeof item.created_at, "string");
  }
});
