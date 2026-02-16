# Log

## 2026-02-16
- What changed:
  - Implemented `P001` by adding SQLite bootstrap in `src/db.js` and startup initialization in `src/server.js`.
  - Added minimal project manifest in `package.json` with `npm run start`.
  - Updated `docs/PLAN.json` to mark `P001` as passing.
  - Added ADR-002 in `docs/DECISIONS.md` to document the `node:sqlite` driver choice for bootstrap.
  - Marked `Local persistence` as shipped in `docs/FEATURES.md` after validating row persistence across restart.
- Commands run:
  - `npm run start`
  - `sqlite3 data/app.sqlite "PRAGMA table_info(todos);"`
  - `npm run start && ls -l data/app.sqlite`
  - `sqlite3 data/app.sqlite "DELETE FROM todos; INSERT INTO todos (title, category, group_name, completed, created_at) VALUES ('persist-check','infra','qa',0,datetime('now')); SELECT COUNT(*) FROM todos WHERE title='persist-check';"`
  - `npm run start >/tmp/p001-feature.log 2>&1 && sqlite3 data/app.sqlite "SELECT COUNT(*) FROM todos WHERE title='persist-check';" && cat /tmp/p001-feature.log`
- Results:
  - Startup completed without SQL errors and created `data/app.sqlite`.
  - `todos` schema includes required columns: `id`, `title`, `category`, `group_name`, `completed`, `created_at`.
  - Restart check confirmed `data/app.sqlite` persists across runs.
  - Inserted validation row remained present after restart (`COUNT(*) = 1` before and after).
- Next failing docs/PLAN.json item:
  - `P002` (Implement POST endpoint to create a TODO with title, category, and group.)

## 2026-02-16
- What changed:
  - Implemented `P002` in `src/server.js` by adding `POST /api/todos` with JSON body handling, non-empty `title` validation, SQLite insert (`completed=0`, ISO `created_at`), and `201` created-record response.
  - Refactored server flow into reusable handlers (`handlePostTodos`, `requestHandler`, `startServer`) and preserved runtime server start via `require.main`.
  - Updated `docs/PLAN.json` to mark `P002` as passing with validation notes.
- Commands run:
  - `sqlite3 data/app.sqlite "DELETE FROM todos WHERE title='Buy milk' AND category='Errands' AND group_name='Home';"`
  - `node -e "const { handlePostTodos } = require('./src/server'); const valid = handlePostTodos({ title: 'Buy milk', category: 'Errands', group: 'Home' }); const invalid = handlePostTodos({ title: '   ', category: 'Errands', group: 'Home' }); console.log(JSON.stringify({ valid, invalid }, null, 2));"`
  - `sqlite3 data/app.sqlite "SELECT id, title, category, group_name, completed, created_at FROM todos WHERE title='Buy milk' AND category='Errands' AND group_name='Home' ORDER BY id DESC LIMIT 1;"`
  - `sqlite3 data/app.sqlite "SELECT COUNT(*) FROM todos WHERE title='Buy milk' AND category='Errands' AND group_name='Home';"`
- Results:
  - Valid create path returned `statusCode=201` with persisted fields including `id`, `group_name`, `completed=false`, and `created_at`.
  - Empty-title create path returned `statusCode=400`.
  - Database query confirmed inserted row exists (`COUNT(*) = 1`).
  - Note: direct HTTP socket validation could not run in this sandbox due `listen EPERM`; endpoint behavior was validated through exported handler logic.
- Next failing docs/PLAN.json item:
  - `P003` (Add automated test for TODO creation API.)

## 2026-02-16
- What changed:
  - Implemented `P003` by adding `tests/p003-create-todo.test.js` with two automated API tests for `POST /api/todos` (valid `201` response shape and invalid empty-title `400`).
  - Added test isolation using `TODO_DB_PATH=tmp/p003-create.sqlite` and per-test table cleanup to avoid dependence on existing local data.
  - Updated `src/db.js` to support configurable database path via `TODO_DB_PATH` while preserving default `data/app.sqlite` behavior.
  - Added `npm test` script in `package.json`.
  - Updated `docs/PLAN.json` to mark `P003` as passing.
- Commands run:
  - `npm test`
  - `npm test`
- Results:
  - First test run failed due database reset strategy deleting a file under an open connection (`row` lookup undefined).
  - After switching to table-level cleanup, second test run passed (`2/2` tests passing).
  - Tests are isolated from existing app data and validate both success and error paths for TODO creation.
- Next failing docs/PLAN.json item:
  - `P004` (Implement GET endpoint to list TODOs.)

## 2026-02-16
- What changed:
  - Implemented `P004` in `src/server.js` by adding `GET /api/todos`.
  - Added query logic to return `id`, `title`, `category`, `group_name`, `completed`, and `created_at` sorted newest first (`created_at DESC`, `id DESC`).
  - Exported `handleGetTodos` for parity with existing handler-level validation style.
  - Updated `docs/PLAN.json` to mark `P004` as passing with validation notes.
- Commands run:
  - `node - <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const testDbPath = path.join(process.cwd(), 'tmp', 'p004-list.sqlite');
process.env.TODO_DB_PATH = testDbPath;
fs.mkdirSync(path.dirname(testDbPath), { recursive: true });
fs.rmSync(testDbPath, { force: true });
fs.rmSync(`${testDbPath}-shm`, { force: true });
fs.rmSync(`${testDbPath}-wal`, { force: true });

const { requestHandler } = require('./src/server');

function callRequestHandler({ method, url, body }) {
  return new Promise((resolve, reject) => {
    const req = Readable.from(body ? [JSON.stringify(body)] : []);
    req.method = method;
    req.url = url;
    req.on('error', reject);

    const res = {
      statusCode: 200,
      headers: {},
      chunks: [],
      writeHead(code, headers) {
        this.statusCode = code;
        this.headers = headers;
      },
      end(chunk) {
        if (chunk) this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        const raw = Buffer.concat(this.chunks).toString('utf8');
        resolve({ statusCode: this.statusCode, headers: this.headers, body: raw ? JSON.parse(raw) : null });
      },
    };

    requestHandler(req, res).catch(reject);
  });
}

(async () => {
  const first = await callRequestHandler({
    method: 'POST',
    url: '/api/todos',
    body: { title: 'Oldest', category: 'A', group: 'G1' },
  });
  await new Promise((r) => setTimeout(r, 5));
  const second = await callRequestHandler({
    method: 'POST',
    url: '/api/todos',
    body: { title: 'Newest', category: 'B', group: 'G2' },
  });

  assert.equal(first.statusCode, 201);
  assert.equal(second.statusCode, 201);

  const listed = await callRequestHandler({ method: 'GET', url: '/api/todos' });

  assert.equal(listed.statusCode, 200);
  assert.ok(Array.isArray(listed.body));
  assert.equal(listed.body.length, 2);

  const [item0, item1] = listed.body;
  for (const item of listed.body) {
    assert.equal(typeof item.id, 'number');
    assert.equal(typeof item.title, 'string');
    assert.equal(typeof item.category, 'string');
    assert.equal(typeof item.group_name, 'string');
    assert.equal(typeof item.completed, 'boolean');
    assert.equal(typeof item.created_at, 'string');
  }

  assert.equal(item0.title, 'Newest');
  assert.equal(item1.title, 'Oldest');

  console.log('P004 validation passed');
})();
NODE`
  - `npm test`
- Results:
  - GET list validation passed: response returned `200` with JSON array.
  - After creating todos, GET returned both items with required fields.
  - Ordering validation passed with newest todo first.
  - Existing automated tests continued to pass (`2/2`).
- Next failing docs/PLAN.json item:
  - `P005` (Add automated test for TODO listing API.)

## 2026-02-16
- What changed:
  - Implemented `P005` by adding `tests/p005-list-todos.test.js`.
  - Added isolated test database setup via `TODO_DB_PATH=tmp/p005-list.sqlite` with per-test cleanup.
  - Seeded two todos in setup and asserted `GET /api/todos` returns both todos with required fields and newest-first ordering.
  - Updated `docs/PLAN.json` to mark `P005` as passing with validation notes.
- Commands run:
  - `node --test tests/p005-list-todos.test.js`
  - `npm test`
  - `node - <<'NODE' ... assert.equal(response.body[0].title, 'Older'); ... NODE`
- Results:
  - Targeted list endpoint test passed (`1/1`).
  - Full test suite passed (`3/3`).
  - Mutation-style negative check failed as expected (`'Newer' !== 'Older'`), confirming ordering assertion catches reversed sort expectations.
  - Test isolation confirmed by dedicated SQLite path under `tmp/` and explicit table reset/seed per test.
- Next failing docs/PLAN.json item:
  - `P006` (Implement endpoint to toggle TODO completion state.)

## 2026-02-16
- What changed:
  - Implemented `P006` in `src/server.js` by adding `PATCH /api/todos/:id/toggle`.
  - Added toggle logic to flip `completed` for the targeted row and return the updated TODO.
  - Added `404` handling when the target TODO id does not exist (or id is invalid for route matching).
  - Updated `docs/PLAN.json` to mark `P006` as passing with validation notes.
- Commands run:
  - `node - <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const testDbPath = path.join(process.cwd(), 'tmp', 'p006-toggle.sqlite');
process.env.TODO_DB_PATH = testDbPath;
fs.mkdirSync(path.dirname(testDbPath), { recursive: true });
for (const suffix of ['', '-shm', '-wal']) {
  fs.rmSync(`${testDbPath}${suffix}`, { force: true });
}

const { db } = require('./src/db').initDb();
const { handlePostTodos, handleToggleTodo } = require('./src/server');

const created = handlePostTodos({ title: 'Toggle me', category: 'QA', group: 'Core' });
assert.equal(created.statusCode, 201);
const todoId = created.body.id;
assert.equal(created.body.completed, false);

const firstToggle = handleToggleTodo(String(todoId));
assert.equal(firstToggle.statusCode, 200);
assert.equal(firstToggle.body.completed, true);
const dbAfterFirst = db.prepare('SELECT completed FROM todos WHERE id = ?').get(todoId);
assert.equal(dbAfterFirst.completed, 1);

const secondToggle = handleToggleTodo(String(todoId));
assert.equal(secondToggle.statusCode, 200);
assert.equal(secondToggle.body.completed, false);
const dbAfterSecond = db.prepare('SELECT completed FROM todos WHERE id = ?').get(todoId);
assert.equal(dbAfterSecond.completed, 0);

const missing = handleToggleTodo('999999');
assert.equal(missing.statusCode, 404);
assert.equal(missing.body.error, 'todo not found');

console.log('P006 validation passed');
NODE`
  - `npm test`
- Results:
  - Toggle validation passed for `false -> true -> false` on repeated calls.
  - Unknown id returned `404` with `todo not found`.
  - Database assertions confirmed `completed` persisted as `1` then `0` after each toggle call.
  - Existing automated test suite passed (`3/3`).
- Next failing docs/PLAN.json item:
  - `P007` (Add automated test for completion toggle API.)

## 2026-02-16
- What changed:
  - Implemented `P007` by adding `tests/p007-toggle-todo.test.js`.
  - Added isolated DB setup via `TODO_DB_PATH=tmp/p007-toggle.sqlite` with per-test cleanup and seeded one todo in setup.
  - Added automated assertions for `PATCH /api/todos/:id/toggle` false->true->false behavior, `404` for nonexistent id, and DB-persisted completion state after each toggle.
  - Updated `docs/PLAN.json` to mark `P007` as passing with validation notes.
- Commands run:
  - `node --test tests/p007-toggle-todo.test.js`
  - `npm test`
  - `node - <<'NODE' ... assert.equal(row.completed, 1); ... NODE`
- Results:
  - Targeted toggle test file passed (`2/2`).
  - Full automated suite passed (`5/5`).
  - Mutation-style negative check failed as expected (`0 !== 1`), confirming the test would catch an implementation that always leaves `completed=true` instead of toggling.
- Next failing docs/PLAN.json item:
  - `P008` (Implement endpoint to delete a TODO.)

## 2026-02-16
- What changed:
  - Implemented `P008` in `src/server.js` by adding `DELETE /api/todos/:id`.
  - Added delete handler logic that returns `204` when a TODO is removed and `404` when the id is missing/invalid.
  - Wired delete route matching into `requestHandler` and exported `handleDeleteTodo`.
  - Updated `docs/PLAN.json` to mark `P008` as passing with validation notes.
- Commands run:
  - `node - <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { DatabaseSync } = require('node:sqlite');

const testDbPath = path.join(process.cwd(), 'tmp', 'p008-delete.sqlite');
process.env.TODO_DB_PATH = testDbPath;
fs.mkdirSync(path.dirname(testDbPath), { recursive: true });
for (const suffix of ['', '-shm', '-wal']) {
  fs.rmSync(`${testDbPath}${suffix}`, { force: true });
}

const { requestHandler } = require('./src/server');

function callRequestHandler({ method, url, body }) {
  return new Promise((resolve, reject) => {
    const req = Readable.from(body ? [JSON.stringify(body)] : []);
    req.method = method;
    req.url = url;
    req.on('error', reject);

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
        const raw = Buffer.concat(this.chunks).toString('utf8');
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

(async () => {
  const createResponse = await callRequestHandler({
    method: 'POST',
    url: '/api/todos',
    body: { title: 'Delete me', category: 'Ops', group: 'Core' },
  });
  assert.equal(createResponse.statusCode, 201);
  const createdId = createResponse.body.id;

  const deleteResponse = await callRequestHandler({
    method: 'DELETE',
    url: `/api/todos/${createdId}`,
  });
  assert.equal(deleteResponse.statusCode, 204);
  assert.equal(deleteResponse.body, null);

  const listResponse = await callRequestHandler({ method: 'GET', url: '/api/todos' });
  assert.equal(listResponse.statusCode, 200);
  assert.ok(Array.isArray(listResponse.body));
  assert.equal(listResponse.body.find((todo) => todo.id === createdId), undefined);

  const db = new DatabaseSync(testDbPath);
  const row = db.prepare('SELECT id FROM todos WHERE id = ?;').get(createdId);
  db.close();
  assert.equal(row, undefined);

  const missingDelete = await callRequestHandler({
    method: 'DELETE',
    url: '/api/todos/999999',
  });
  assert.equal(missingDelete.statusCode, 404);
  assert.deepEqual(missingDelete.body, { error: 'todo not found' });

  console.log('P008 validation passed');
})();
NODE`
  - `npm test`
- Results:
  - `DELETE` existing id returned `204` with no response body.
  - Subsequent `GET /api/todos` no longer contained the deleted TODO.
  - Direct DB query confirmed deleted row was absent.
  - `DELETE` unknown id returned `404` with `{ "error": "todo not found" }`.
  - Full automated suite passed (`5/5`).
- Next failing docs/PLAN.json item:
  - `P009` (Add automated test for delete API.)

## 2026-02-16
- What changed:
  - Implemented `P009` by adding `tests/p009-delete-todo.test.js`.
  - Added isolated DB setup via `TODO_DB_PATH=tmp/p009-delete.sqlite` with per-test cleanup and one seeded TODO in setup.
  - Added automated assertions for `DELETE /api/todos/:id` returning `204`, removal verification through both `GET /api/todos` and direct DB query, `404` for nonexistent id, and deletion persistence after simulated app restart via server module reload.
  - Updated `docs/PLAN.json` to mark `P009` as passing with validation notes.
- Commands run:
  - `node --test tests/p009-delete-todo.test.js`
  - `npm test`
  - `node - <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { DatabaseSync } = require('node:sqlite');

const testDbPath = path.join(process.cwd(), 'tmp', 'p009-mutation-check.sqlite');
process.env.TODO_DB_PATH = testDbPath;
fs.mkdirSync(path.dirname(testDbPath), { recursive: true });
for (const suffix of ['', '-shm', '-wal']) fs.rmSync(`${testDbPath}${suffix}`, { force: true });

const { requestHandler } = require('./src/server');

function callRequestHandler({ method, url, body }) {
  return new Promise((resolve, reject) => {
    const req = Readable.from(body ? [JSON.stringify(body)] : []);
    req.method = method;
    req.url = url;
    req.on('error', reject);

    const res = {
      statusCode: 200,
      headers: {},
      chunks: [],
      writeHead(code, headers) { this.statusCode = code; this.headers = headers || {}; },
      end(chunk) {
        if (chunk) this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        const raw = Buffer.concat(this.chunks).toString('utf8');
        resolve({ statusCode: this.statusCode, body: raw ? JSON.parse(raw) : null });
      },
    };

    requestHandler(req, res).catch(reject);
  });
}

(async () => {
  const created = await callRequestHandler({
    method: 'POST',
    url: '/api/todos',
    body: { title: 'Mutation delete', category: 'QA', group: 'Core' },
  });
  await callRequestHandler({ method: 'DELETE', url: `/api/todos/${created.body.id}` });

  const db = new DatabaseSync(testDbPath);
  const row = db.prepare('SELECT id FROM todos WHERE id = ?').get(created.body.id);
  db.close();

  assert.notEqual(row, undefined);
})();
NODE`
- Results:
  - Targeted delete API tests passed (`3/3`).
  - Full automated suite passed (`8/8`).
  - Mutation-style negative check failed with assertion error as expected, confirming deletion assertions catch non-removal behavior.
- Next failing docs/PLAN.json item:
  - `P010` (Serve a minimal browser UI shell for creating and listing TODOs.)

## 2026-02-16
- What changed:
  - Implemented `P010` by serving a browser UI shell from `src/public/index.html` with static assets `src/public/app.js` and `src/public/styles.css`.
  - Updated `src/server.js` to serve `GET /` and static assets under `GET /static/*` while preserving existing API routes.
  - Added client-side create/list behavior: form inputs for `title`, `category`, `group`, initial list load from `GET /api/todos`, post-submit refresh without page reload, and explicit empty state messaging.
  - Updated `docs/PLAN.json` to mark `P010` as passing and updated `docs/FEATURES.md` checkboxes for completed create/list acceptance.
- Commands run:
  - `npm test`
  - `node - <<'NODE'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');

const testDbPath = path.join(process.cwd(), 'tmp', 'p010-ui-shell.sqlite');
process.env.TODO_DB_PATH = testDbPath;
fs.mkdirSync(path.dirname(testDbPath), { recursive: true });
for (const suffix of ['', '-shm', '-wal']) fs.rmSync(`${testDbPath}${suffix}`, { force: true });

const { requestHandler } = require('./src/server');

function callRequestHandler({ method, url, body }) {
  return new Promise((resolve, reject) => {
    const req = Readable.from(body ? [JSON.stringify(body)] : []);
    req.method = method;
    req.url = url;
    req.on('error', reject);

    const res = {
      statusCode: 200,
      headers: {},
      chunks: [],
      writeHead(code, headers) {
        this.statusCode = code;
        this.headers = headers || {};
      },
      end(chunk) {
        if (chunk) this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        const raw = Buffer.concat(this.chunks).toString('utf8');
        resolve({ statusCode: this.statusCode, headers: this.headers, raw, body: raw ? (() => {
          try { return JSON.parse(raw); } catch { return null; }
        })() : null });
      }
    };

    requestHandler(req, res).catch(reject);
  });
}

(async () => {
  const root = await callRequestHandler({ method: 'GET', url: '/' });
  assert.equal(root.statusCode, 200);
  assert.match(root.headers['Content-Type'] || '', /text\\/html/);
  assert.match(root.raw, /<form id="todo-form">/);
  assert.match(root.raw, /id="empty-state"/);

  const js = await callRequestHandler({ method: 'GET', url: '/static/app.js' });
  assert.equal(js.statusCode, 200);
  assert.match(js.headers['Content-Type'] || '', /application\\/javascript/);

  const css = await callRequestHandler({ method: 'GET', url: '/static/styles.css' });
  assert.equal(css.statusCode, 200);
  assert.match(css.headers['Content-Type'] || '', /text\\/css/);

  const create = await callRequestHandler({
    method: 'POST',
    url: '/api/todos',
    body: { title: 'P010 create', category: 'UI', group: 'MVP' },
  });
  assert.equal(create.statusCode, 201);

  const list = await callRequestHandler({ method: 'GET', url: '/api/todos' });
  assert.equal(list.statusCode, 200);
  assert.ok(Array.isArray(list.body));
  assert.ok(list.body.some((todo) => todo.title === 'P010 create'));

  console.log('P010 validation passed');
})();
NODE`
- Results:
  - Full automated test suite passed (`8/8`).
  - `P010` validation script passed:
    - `GET /` returned HTML containing the TODO form and empty-state element.
    - `GET /static/app.js` and `GET /static/styles.css` returned `200` with expected content types.
    - POST create + GET list flow confirmed API-backed creation and retrieval used by the UI shell.
- Next failing docs/PLAN.json item:
  - `P011` (Add UI actions to toggle complete and delete TODOs.)

## 2026-02-16
- What changed:
  - Implemented `P011` in `src/public/app.js` by adding per-item `toggle` and `delete` controls wired to `PATCH /api/todos/:id/toggle` and `DELETE /api/todos/:id`.
  - Added immediate UI state updates after actions (optimistic toggle/delete rendering) and retained server-authoritative state by applying API responses.
  - Added stale-item consistency handling: when action APIs return `404`, the UI refreshes via `loadTodos()` and displays `TODO no longer exists. List refreshed.`.
  - Updated `src/public/styles.css` with minimal styles for the new action controls.
  - Updated `docs/PLAN.json` to mark `P011` as passing and updated `docs/FEATURES.md` to tick `Toggle TODO completion` and `Delete a TODO item`.
- Commands run:
  - `npm test`
  - `node - <<'NODE' ... vm-based mocked DOM/fetch validation for src/public/app.js ... NODE`
- Results:
  - Full automated suite passed (`8/8`).
  - Targeted UI validation passed (`P011 validation passed`), including:
    - Toggle click applies immediate completed visual state and persists through API update flow.
    - Delete stale-id (`404`) flow keeps UI consistent by refreshing list and showing a clear message.
- Next failing docs/PLAN.json item:
  - `P012` (Add basic group/category view controls to manage TODOs by grouping.)

## 2026-02-16
- What changed:
  - Implemented `P012` by adding basic category/group filtering controls to `src/public/index.html` (`filter-category`, `filter-group`, `clear-filters`, and `filter-context`).
  - Updated `src/public/app.js` to maintain active filter state, populate filter options from loaded TODO data, apply client-side filtering, show active filter context, and render a filter-specific empty state message when no items match.
  - Updated `src/public/styles.css` with styles for the new filter controls and context text.
  - Updated `docs/PLAN.json` to mark `P012` as passing and added implementation/validation notes.
  - Updated `docs/FEATURES.md` to tick `Basic categories and grouping support`.
- Commands run:
  - `npm test`
  - `node - <<'NODE' ... targeted app.js filter harness ... NODE`
- Results:
  - Full automated test suite passed (`8/8`).
  - Targeted `P012` validation passed (`P012 validation passed`), confirming:
    - Selecting a category shows only matching TODOs.
    - Selecting a group shows only matching TODOs.
    - Clearing filters restores the full TODO list.
- Next failing docs/PLAN.json item:
  - `P013` (Document local run and test commands in README for MVP quality gate.)

## 2026-02-16
- What changed:
  - Implemented `P013` by adding `README.md` with MVP setup prerequisites and exact local commands for run and test workflows.
  - Updated `docs/PLAN.json` to mark `P013` as passing with validation notes.
  - Updated `docs/FEATURES.md` to tick `Quality gates: tests and run instructions`.
- Commands run:
  - `npm test`
  - `npm run start`
  - `node -e "const fs=require('node:fs');const readme=fs.readFileSync('README.md','utf8');const pkg=require('./package.json');const hasStart=readme.includes('npm run start');const hasTest=readme.includes('npm test');const scriptStart=pkg.scripts && pkg.scripts.start==='node src/server.js';const scriptTest=pkg.scripts && pkg.scripts.test==='node --test';if(!(hasStart&&hasTest&&scriptStart&&scriptTest)){process.exit(1);}console.log('README commands match package scripts');"`
- Results:
  - `npm test` passed (`8/8` tests).
  - `npm run start` is blocked in this sandbox by `listen EPERM` on `0.0.0.0:8080`; startup command itself is documented correctly for local machine usage.
  - README command/script consistency check passed (`README commands match package scripts`).
- Next failing docs/PLAN.json item:
  - `P014` (Add a single smoke test that verifies local persistence across restart.)

## 2026-02-16
- What changed:
  - Implemented `P014` by adding `tests/p014-persistence-smoke.test.js`.
  - Added one smoke test flow that creates a TODO, simulates app restart by reloading `src/server`/`src/db` modules, then lists TODOs and asserts the created item persists.
  - Added deterministic fixture cleanup in `beforeEach` (`DELETE FROM todos` plus `sqlite_sequence` reset) so the smoke test is rerunnable without manual DB edits.
  - Updated `docs/PLAN.json` to mark `P014` as passing with validation notes.
- Commands run:
  - `node --test tests/p014-persistence-smoke.test.js`
  - `npm test`
  - `node - <<'NODE' ... non-persistent two-DB mutation check ... NODE`
- Results:
  - Targeted smoke test passed (`1/1`).
  - Full automated suite passed (`9/9`).
  - Mutation-style negative check failed with `AssertionError` when restart used a different DB file, confirming persistence assertion detects non-persistent storage behavior.
- Next failing docs/PLAN.json item:
  - None.
