const fs = require("node:fs");
const path = require("node:path");
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { Readable } = require("node:stream");

const testDbPath = path.join(process.cwd(), "tmp", "p014-persistence.sqlite");
process.env.TODO_DB_PATH = testDbPath;
fs.mkdirSync(path.dirname(testDbPath), { recursive: true });
for (const suffix of ["", "-shm", "-wal"]) {
  fs.rmSync(`${testDbPath}${suffix}`, { force: true });
}

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

beforeEach(() => {
  // Cleanup fixture data so this smoke test can be rerun without manual edits.
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

test("smoke: created todo persists after simulated app restart", async () => {
  const createResponse = await callRequestHandler({
    method: "POST",
    url: "/api/todos",
    body: { title: "Persistence smoke", category: "QA", group: "MVP" },
  });
  assert.equal(createResponse.statusCode, 201);

  const createdId = createResponse.body.id;

  const serverPath = require.resolve("../src/server");
  const dbPath = require.resolve("../src/db");
  delete require.cache[serverPath];
  delete require.cache[dbPath];
  ({ requestHandler } = require("../src/server"));

  const listResponse = await callRequestHandler({ method: "GET", url: "/api/todos" });
  assert.equal(listResponse.statusCode, 200);

  const persistedTodo = listResponse.body.find((todo) => todo.id === createdId);
  assert.notEqual(persistedTodo, undefined);
  assert.equal(persistedTodo.title, "Persistence smoke");
});
