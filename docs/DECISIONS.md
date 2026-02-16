# Decisions

## ADR-001: Initial MVP Stack
- Date: 2026-02-16
- Status: Accepted
- Context:
  - Need a small, low-risk stack for a browser TODO MVP with local persistence and basic tests.
  - Team requested a boring stack and no premature platform complexity.
- Decision:
  - Use `Express + SQLite` for the backend and persistence.
  - Serve a simple browser UI from the same app for MVP.
- Why this stack (2 bullets):
  - Widely known, minimal setup, and very fast iteration for CRUD endpoints plus static UI.
  - SQLite file-based local persistence fits MVP constraints with no external services.
- Key constraints:
  - MVP scope is strictly create/list/toggle complete/delete.
  - Data is local-only (single machine), no auth, no cloud sync.
  - Must include basic automated tests and documented run/test instructions.
- Consequences:
  - Positive: Low operational overhead and straightforward local development.
  - Tradeoff: Not designed for multi-user concurrency or remote access at this stage.

## ADR-002: SQLite Driver for MVP Bootstrap
- Date: 2026-02-16
- Status: Accepted
- Context:
  - Need to implement and validate database bootstrap (`P001`) in a sandbox without relying on package installation.
- Decision:
  - Use Node's built-in `node:sqlite` (`DatabaseSync`) for SQLite initialization.
- Consequences:
  - Positive: No external install required for DB bootstrap validation.
  - Tradeoff: Feature is experimental in Node 22 and emits a runtime warning.
