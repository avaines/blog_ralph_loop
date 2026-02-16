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

## 2026-02-16
- What changed:
  - Implemented `P015` in `src/public/styles.css` by adding root-level design tokens for colors, typography, spacing, radius, and shadow.
  - Replaced repeated hard-coded values with token references across base body styles, heading typography, form controls, filter text, todo cards, and action buttons.
  - Updated `docs/PLAN.json` to mark `P015` as passing with implementation and validation notes.
- Commands run:
  - `npm test`
  - `rg -n "var\\(--" src/public/styles.css`
  - `rg -n "^\\s*(background|color|padding|gap|border-radius|box-shadow|font-size|font-weight):" src/public/styles.css`
  - `printf "surface=%s\\nspace3=%s\\ntext-muted=%s\\n" "$(rg -o "var\\(--color-surface\\)" src/public/styles.css | wc -l | tr -d ' ')" "$(rg -o "var\\(--space-3\\)" src/public/styles.css | wc -l | tr -d ' ')" "$(rg -o "var\\(--color-text-muted\\)" src/public/styles.css | wc -l | tr -d ' ')"`
- Results:
  - Full automated test suite passed (`9/9`).
  - CSS token check confirmed base text/background plus spacing and button styling use `var(...)` token references.
  - Shared token usage is confirmed (`var(--color-surface)` appears 3 times, `var(--space-3)` appears 4 times, `var(--color-text-muted)` appears 2 times), showing one-token updates affect multiple UI elements.
- Next failing docs/PLAN.json item:
  - `P016` (Refactor the app shell to a responsive layout that supports mobile and desktop.)

## 2026-02-16
- What changed:
  - Implemented `P016` by refactoring the app shell layout in `src/public/styles.css` for responsive mobile/desktop behavior.
  - Added fluid container sizing with safe side gutters (`--layout-gutter`) and a desktop max-width (`--layout-max-width`) to keep content centered and readable at large widths.
  - Added overflow guards (`overflow-x: hidden`, `min-width: 0`, wrapped action rows, and long-text wrapping) to prevent horizontal scroll in primary views on narrow screens.
  - Added a `768px+` layout rule to present the create form in a denser desktop grid while preserving stacked mobile usability.
  - Updated `docs/PLAN.json` to mark `P016` as passing.
- Commands run:
  - `npm test`
  - `node - <<'NODE'
const fs = require('node:fs');
const assert = require('node:assert/strict');

const css = fs.readFileSync('src/public/styles.css', 'utf8');

assert.match(css, /\.app\s*\{[\s\S]*width:\s*min\(calc\(100% - \(var\(--layout-gutter\) \* 2\)\),\s*var\(--layout-max-width\)\);/);
assert.match(css, /body\s*\{[\s\S]*overflow-x:\s*hidden;/);
assert.match(css, /@media \(min-width:\s*768px\)\s*\{[\s\S]*#todo-form\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\) auto;/);
assert.match(css, /\.todo-actions\s*\{[\s\S]*flex-wrap:\s*wrap;/);
assert.match(css, /\.todo-item \.title\s*\{[\s\S]*overflow-wrap:\s*anywhere;/);

console.log('P016 CSS layout validation passed');
NODE`
- Results:
  - Full automated suite passed (`9/9`).
  - Targeted CSS validation passed (`P016 CSS layout validation passed`), confirming responsive shell width constraints, desktop form reflow rules, and no-horizontal-overflow protections are present.
- Next failing docs/PLAN.json item:
  - `P017` (Style TODO list rows as modern cards with clear active/completed distinction.)

## 2026-02-16
- What changed:
  - Implemented `P017` by restyling TODO list rows in `src/public/styles.css` as modern cards with stronger surfaces, consistent spacing/radius, and improved per-item alignment.
  - Added explicit active/completed visual distinction on cards using left accent bars and completed-state background treatment.
  - Improved task readability with tuned title/meta line-height and added state-pill styling.
  - Updated `src/public/app.js` to render completion state metadata with `state-pill active|completed` classes.
  - Updated `docs/PLAN.json` to mark `P017` as passing with implementation and validation notes.
- Commands run:
  - `npm test`
  - `node - <<'NODE' ... P017 style validation assertions ... NODE`
- Results:
  - Full automated suite passed (`9/9`).
  - Targeted style checks passed (`P017 style validation passed`), confirming card spacing/radius treatment, active vs completed distinction, and readability-focused typography rules.
- Next failing docs/PLAN.json item:
  - `P018` (Upgrade form and button components to a consistent modern style system.)

## 2026-02-16
- What changed:
  - Implemented `P018` by upgrading form and button styling in `src/public/styles.css` to a consistent modern control system.
  - Added shared control sizing/typography tokens (`--font-size-control`, `--control-height`, control padding, and `--radius-md`) and applied them across `input`, `select`, and `button`.
  - Added explicit primary and secondary button variants (`.btn-primary`, `.btn-secondary`) and applied them to create/filter actions via `src/public/index.html` and `src/public/app.js`.
  - Refined responsive form/filter layout behavior for mobile (full-width stacked controls) and desktop (`768px+` denser grid with auto-width action buttons).
  - Updated `docs/PLAN.json` to mark `P018` as passing with implementation/validation notes.
- Commands run:
  - `npm test`
  - `node - <<'NODE'
const fs = require('node:fs');
const assert = require('node:assert/strict');

const html = fs.readFileSync('src/public/index.html', 'utf8');
const css = fs.readFileSync('src/public/styles.css', 'utf8');
const js = fs.readFileSync('src/public/app.js', 'utf8');

assert.match(html, /class="btn btn-primary"\s+type="submit"/);
assert.match(html, /id="clear-filters" class="btn btn-secondary"/);
assert.match(js, /toggleButton\.className = "toggle-btn btn btn-secondary"/);
assert.match(js, /deleteButton\.className = "delete-btn btn"/);

assert.match(css, /input,\s*\nselect,\s*\nbutton\s*\{[\s\S]*font-size:\s*var\(--font-size-control\);[\s\S]*min-height:\s*var\(--control-height\);/);
assert.match(css, /button\s*\{[\s\S]*border-color:\s*var\(--color-secondary-border\);[\s\S]*background:\s*var\(--color-secondary-bg\);/);
assert.match(css, /\.btn-primary\s*\{[\s\S]*background:\s*var\(--color-primary\);[\s\S]*color:\s*var\(--color-primary-contrast\);/);
assert.match(css, /\.btn-secondary\s*\{[\s\S]*background:\s*var\(--color-secondary-bg\);/);

assert.match(css, /@media \(min-width:\s*768px\)\s*\{[\s\S]*#todo-form\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\) auto;/);
assert.match(css, /@media \(min-width:\s*768px\)\s*\{[\s\S]*\.filters\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\) auto;/);

console.log('P018 validation passed');
NODE`
- Results:
  - Full automated test suite passed (`9/9`).
  - Targeted `P018` validation assertions passed (`P018 validation passed`) for unified control styling, primary-vs-secondary action treatment, and responsive form layout rules.
- Next failing docs/PLAN.json item:
  - `P019` (Improve mobile touch ergonomics for all primary interactions.)

## 2026-02-16
- What changed:
  - Selected and implemented `P019` (highest-priority pending functional styling task) by updating `src/public/styles.css` for mobile touch ergonomics.
  - Increased baseline control tap target size from `42px` to `48px`.
  - Updated todo action controls to a single-column mobile layout with larger action buttons (`min-height: 46px`) and increased spacing to reduce accidental adjacent taps.
  - Added explicit spacing separation for the destructive delete control (`.delete-btn`) and desktop-side separation via left margin.
  - Increased filter section spacing to reduce cramped controls on smaller viewports.
  - Marked `P019` as passing in `docs/PLAN.json` and checked `Feature: Responsive layout for mobile and desktop` in `docs/FEATURES.md`.
- Commands run:
  - `npm test`
  - `node - <<'NODE'
const fs = require('node:fs');
const assert = require('node:assert/strict');
const css = fs.readFileSync('src/public/styles.css', 'utf8');
assert.match(css, /--control-height:\\s*48px;/);
assert.match(css, /\\.todo-actions\\s*\\{[\\s\\S]*grid-template-columns:\\s*minmax\\(0, 1fr\\);[\\s\\S]*gap:\\s*var\\(--space-3\\);/);
assert.match(css, /\\.todo-actions button\\s*\\{[\\s\\S]*min-height:\\s*46px;/);
assert.match(css, /\\.delete-btn\\s*\\{[\\s\\S]*margin-top:\\s*var\\(--space-2\\);/);
assert.match(css, /@media \\(min-width:\\s*768px\\)[\\s\\S]*\\.delete-btn\\s*\\{[\\s\\S]*margin-left:\\s*var\\(--space-3\\);/);
console.log('P019 CSS assertions passed');
NODE`
- Results:
  - Automated backend regression suite passed (`9/9`).
  - CSS assertions passed for enlarged tap targets, increased spacing, and destructive-action separation.
- Next failing docs/PLAN.json item:
  - `P020` (Implement explicit hover, focus, active, and disabled control states.)

## 2026-02-16
- What changed:
  - Selected and implemented `P020` as the highest-priority remaining functional styling unit.
  - Updated `src/public/styles.css` with explicit control interaction states: hover, active, keyboard `:focus-visible`, and disabled visual treatments for buttons/inputs/selects.
  - Updated `src/public/app.js` to enforce disabled-state behavior during async interactions by disabling form controls while creating TODOs and disabling per-item action controls while toggle/delete requests are in flight.
  - Updated `docs/PLAN.json` to mark `P020` as passing with implementation/validation notes.
  - Updated `docs/FEATURES.md` to check off `Feature: Modern visual system (type, spacing, color, components)`.
- Commands run:
  - `npm test`
  - `node - <<'NODE' ... P020 CSS/JS assertion checks ... NODE`
- Results:
  - Automated test suite passed (`9/9`).
  - Targeted `P020` assertions passed (`P020 validation passed`), confirming explicit hover/focus/active/disabled styles and disabled behavior hooks in app logic.
- Next failing docs/PLAN.json item:
  - `P021` (Standardize styling for empty, loading, and error UI states.)

## 2026-02-16
- What changed:
  - Selected and implemented `P021` as the highest-priority remaining functional unit in `docs/PLAN.json`.
  - Added a dedicated loading-state element to `src/public/index.html` and standardized all feedback states (`empty`, `loading`, `error`) to shared UI state classes.
  - Updated `src/public/app.js` with `setLoading(isLoading)` and integrated loading visibility into `loadTodos()`, plus filter-aware empty messaging (`No TODOs yet.` vs `No TODOs match the current filters.`).
  - Added consistent state container styling variants in `src/public/styles.css` via `.ui-state`, `.ui-state--empty`, `.ui-state--loading`, and `.ui-state--error`.
  - Updated `docs/PLAN.json` to mark `P021` as passing and updated `docs/FEATURES.md` to check `Feature: Interaction polish and feedback states`.
- Commands run:
  - `npm test && node - <<'NODE'
const fs = require('node:fs');
const assert = require('node:assert/strict');

const html = fs.readFileSync('src/public/index.html', 'utf8');
const css = fs.readFileSync('src/public/styles.css', 'utf8');
const js = fs.readFileSync('src/public/app.js', 'utf8');

assert.match(html, /id="loading-state" class="ui-state ui-state--loading"/);
assert.match(html, /id="error" class="ui-state ui-state--error"/);
assert.match(html, /id="empty-state" class="ui-state ui-state--empty"/);

assert.match(css, /\.ui-state\s*\{[\s\S]*padding:\s*var\(--space-3\) var\(--space-4\);[\s\S]*overflow-wrap:\s*anywhere;/);
assert.match(css, /\.ui-state--empty\s*\{[\s\S]*background:\s*var\(--color-secondary-bg\);/);
assert.match(css, /\.ui-state--loading\s*\{[\s\S]*background:\s*#f2f7fd;/);
assert.match(css, /\.ui-state--error\s*\{[\s\S]*color:\s*var\(--color-danger\);/);

assert.match(js, /function setLoading\(isLoading\)/);
assert.match(js, /setLoading\(true\);/);
assert.match(js, /setLoading\(false\);/);
assert.match(js, /No TODOs match the current filters\./);
assert.match(js, /"No TODOs yet\."/);

console.log('P021 validation passed');
NODE`
- Results:
  - Automated test suite passed (`9/9`).
  - Targeted `P021` assertions passed (`P021 validation passed`) for standardized empty/loading/error state markup, styling, and loading behavior hooks.
- Next failing docs/PLAN.json item:
  - `P022` (Add a repeatable manual QA checklist for responsive and cross-browser styling.)

## 2026-02-16
- What changed:
  - Selected and implemented `P022` as the highest-priority remaining failing unit in `docs/PLAN.json`.
  - Added `docs/QA_CHECKLIST.md` with a repeatable manual QA checklist for responsive and cross-browser styling.
  - Documented required viewport checks (`360x800`, `768x1024`, `1280x800`) and browser coverage (Chrome, Safari, Firefox, iOS Safari, Android Chrome).
  - Added explicit pass/fail criteria and per-browser/per-viewport results tables covering layout, readability, and interaction states.
  - Updated `docs/PLAN.json` to mark `P022` as passing with implementation and validation notes.
- Commands run:
  - `node - <<'NODE' ... checklist coverage assertions ... NODE`
- Results:
  - Checklist coverage validation passed (`P022 checklist validation passed`).
  - `docs/QA_CHECKLIST.md` is executable step-by-step and includes required component coverage (form, list, filters, actions) and pass/fail outcome capture per browser/viewport.
- Next failing docs/PLAN.json item:
  - None.
