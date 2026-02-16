const fs = require("node:fs");
const path = require("node:path");
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { Readable } = require("node:stream");

const testDbPath = path.join(process.cwd(), "tmp", "p009-delete.sqlite");
process.env.TODO_DB_PATH = testDbPath;
fs.mkdirSync(path.dirname(testDbPath), { recursive: true });
fs.rmSync(testDbPath, { force: true });
fs.rmSync(`${testDbPath}-shm`, { force: true });
fs.rmSync(`${testDbPath}-wal`, { force: true });

let { requestHandler } = require("../src/server");

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
        this.headers = headers || {};
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
    body: { title: "Delete candidate", category: "QA", group: "Core" },
  });
  assert.equal(createResponse.statusCode, 201);
});

test("DELETE /api/todos/:id returns 204 and removes todo from API and DB", async () => {
  const db = new DatabaseSync(testDbPath);
  const seededTodo = db.prepare("SELECT id FROM todos LIMIT 1;").get();
  db.close();

  const deleteResponse = await callRequestHandler({
    method: "DELETE",
    url: `/api/todos/${seededTodo.id}`,
  });

  assert.equal(deleteResponse.statusCode, 204);
  assert.equal(deleteResponse.body, null);

  const listResponse = await callRequestHandler({ method: "GET", url: "/api/todos" });
  assert.equal(listResponse.statusCode, 200);
  assert.equal(listResponse.body.find((todo) => todo.id === seededTodo.id), undefined);

  const dbAfterDelete = new DatabaseSync(testDbPath);
  const row = dbAfterDelete
    .prepare("SELECT id FROM todos WHERE id = ?;")
    .get(seededTodo.id);
  dbAfterDelete.close();
  assert.equal(row, undefined);
});

test("DELETE /api/todos/:id returns 404 for unknown id", async () => {
  const response = await callRequestHandler({
    method: "DELETE",
    url: "/api/todos/999999",
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: "todo not found" });
});

test("deleted todo stays removed after simulated app restart", async () => {
  const db = new DatabaseSync(testDbPath);
  const seededTodo = db.prepare("SELECT id FROM todos LIMIT 1;").get();
  db.close();

  const deleteResponse = await callRequestHandler({
    method: "DELETE",
    url: `/api/todos/${seededTodo.id}`,
  });
  assert.equal(deleteResponse.statusCode, 204);

  const serverPath = require.resolve("../src/server");
  delete require.cache[serverPath];
  ({ requestHandler } = require("../src/server"));

  const afterRestart = await callRequestHandler({ method: "GET", url: "/api/todos" });
  assert.equal(afterRestart.statusCode, 200);
  assert.equal(afterRestart.body.find((todo) => todo.id === seededTodo.id), undefined);
});
