# Features

## Scope
- Purpose: Deliver a small, modern-looking browser TODO app for managing tasks by category and group.
- Non-goals: Multi-user auth, cloud sync, reminders, due dates, mobile app, sharing/collaboration.

## Shipped
- _None yet._

## Backlog (MVP)
- [ ] Create a TODO item
  - Acceptance criteria:
  - User can enter task text and save a new TODO.
  - User can assign one category and one group at creation time.
  - New TODO appears immediately in the list without page reload.

- [ ] List TODO items
  - Acceptance criteria:
  - User sees all TODOs with title, category, group, and completion state.
  - User can visually distinguish completed vs active TODOs.
  - Empty state is shown when no TODOs exist.

- [ ] Toggle TODO completion
  - Acceptance criteria:
  - User can mark an active TODO as complete and unmark it back to active.
  - Completion state change is reflected immediately in the UI.
  - Completion state is preserved after app restart (local persistence).

- [ ] Delete a TODO item
  - Acceptance criteria:
  - User can delete any TODO from the list.
  - Deleted TODO is removed from UI immediately.
  - Deleted TODO does not reappear after app restart (local persistence).

- [ ] Local persistence
  - Acceptance criteria:
  - TODO data is persisted in local app storage (SQLite file) on the same machine.
  - Restarting the server/app retains created/updated TODOs.
  - Data model stores at least: id, title, category, group, completed, created_at.

- [ ] Basic categories and grouping support
  - Acceptance criteria:
  - User can choose a category label for each TODO.
  - User can choose a group label for each TODO.
  - List view supports grouping or filtering by group/category at a basic level.

- [ ] Quality gates: tests and run instructions
  - Acceptance criteria:
  - Repository includes basic automated tests for core TODO operations (create/list/toggle/delete).
  - README contains clear local run steps and test command(s).
  - MVP is not considered complete unless tests pass locally.

## Notes
- Keep each backlog item small and testable.
- Move completed items to **Shipped** with checkboxes ticked.
