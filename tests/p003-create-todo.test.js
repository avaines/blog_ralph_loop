const fs = require("node:fs");
const path = require("node:path");
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { Readable } = require("node:stream");

const testDbPath = path.join(process.cwd(), "tmp", "p003-create.sqlite");
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
  db.close();
});

test("POST /api/todos returns 201 and created todo shape for valid payload", async () => {
  const response = await callRequestHandler({
    method: "POST",
    url: "/api/todos",
    body: { title: "Buy milk", category: "Errands", group: "Home" },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.title, "Buy milk");
  assert.equal(response.body.category, "Errands");
  assert.equal(response.body.group_name, "Home");
  assert.equal(response.body.completed, false);
  assert.equal(typeof response.body.id, "number");
  assert.equal(typeof response.body.created_at, "string");

  const db = new DatabaseSync(testDbPath);
  const row = db
    .prepare(
      "SELECT title, category, group_name, completed FROM todos WHERE id = ?;"
    )
    .get(response.body.id);
  db.close();

  assert.equal(row.title, "Buy milk");
  assert.equal(row.category, "Errands");
  assert.equal(row.group_name, "Home");
  assert.equal(row.completed, 0);
});

test("POST /api/todos returns 400 for empty title", async () => {
  const response = await callRequestHandler({
    method: "POST",
    url: "/api/todos",
    body: { title: "   ", category: "Errands", group: "Home" },
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: "title must be a non-empty string" });
});
