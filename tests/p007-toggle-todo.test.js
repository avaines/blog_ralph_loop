const fs = require("node:fs");
const path = require("node:path");
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { Readable } = require("node:stream");

const testDbPath = path.join(process.cwd(), "tmp", "p007-toggle.sqlite");
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

beforeEach(async () => {
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

  const createResponse = await callRequestHandler({
    method: "POST",
    url: "/api/todos",
    body: { title: "Toggle candidate", category: "QA", group: "Core" },
  });

  assert.equal(createResponse.statusCode, 201);
});

test("PATCH /api/todos/:id/toggle flips completion state on repeated calls and persists it", async () => {
  const db = new DatabaseSync(testDbPath);
  const seededTodo = db.prepare("SELECT id FROM todos LIMIT 1;").get();
  db.close();

  const firstToggle = await callRequestHandler({
    method: "PATCH",
    url: `/api/todos/${seededTodo.id}/toggle`,
  });
  assert.equal(firstToggle.statusCode, 200);
  assert.equal(firstToggle.body.completed, true);

  const dbAfterFirst = new DatabaseSync(testDbPath);
  const firstRow = dbAfterFirst
    .prepare("SELECT completed FROM todos WHERE id = ?;")
    .get(seededTodo.id);
  dbAfterFirst.close();
  assert.equal(firstRow.completed, 1);

  const secondToggle = await callRequestHandler({
    method: "PATCH",
    url: `/api/todos/${seededTodo.id}/toggle`,
  });
  assert.equal(secondToggle.statusCode, 200);
  assert.equal(secondToggle.body.completed, false);

  const dbAfterSecond = new DatabaseSync(testDbPath);
  const secondRow = dbAfterSecond
    .prepare("SELECT completed FROM todos WHERE id = ?;")
    .get(seededTodo.id);
  dbAfterSecond.close();
  assert.equal(secondRow.completed, 0);
});

test("PATCH /api/todos/:id/toggle returns 404 for nonexistent id", async () => {
  const response = await callRequestHandler({
    method: "PATCH",
    url: "/api/todos/999999/toggle",
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: "todo not found" });
});
