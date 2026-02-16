# Features

## Scope
- Purpose: Deliver a small, modern-looking browser TODO app for managing tasks by category and group.
- Non-goals: Multi-user auth, cloud sync, reminders, due dates, mobile app, sharing/collaboration.

## Shipped
- [x] Create a TODO item
- [x] List TODO items
- [x] Local persistence

## Backlog (MVP)
- [x] Create a TODO item
  - Acceptance criteria:
  - User can enter task text and save a new TODO.
  - User can assign one category and one group at creation time.
  - New TODO appears immediately in the list without page reload.

- [x] List TODO items
  - Acceptance criteria:
  - User sees all TODOs with title, category, group, and completion state.
  - User can visually distinguish completed vs active TODOs.
  - Empty state is shown when no TODOs exist.

- [x] Toggle TODO completion
  - Acceptance criteria:
  - User can mark an active TODO as complete and unmark it back to active.
  - Completion state change is reflected immediately in the UI.
  - Completion state is preserved after app restart (local persistence).

- [x] Delete a TODO item
  - Acceptance criteria:
  - User can delete any TODO from the list.
  - Deleted TODO is removed from UI immediately.
  - Deleted TODO does not reappear after app restart (local persistence).

- [x] Local persistence
  - Acceptance criteria:
  - TODO data is persisted in local app storage (SQLite file) on the same machine.
  - Restarting the server/app retains created/updated TODOs.
  - Data model stores at least: id, title, category, group, completed, created_at.

- [x] Basic categories and grouping support
  - Acceptance criteria:
  - User can choose a category label for each TODO.
  - User can choose a group label for each TODO.
  - List view supports grouping or filtering by group/category at a basic level.

- [x] Quality gates: tests and run instructions
  - Acceptance criteria:
  - Repository includes basic automated tests for core TODO operations (create/list/toggle/delete).
  - README contains clear local run steps and test command(s).
  - MVP is not considered complete unless tests pass locally.

## Epic: Modern Responsive Styling

- [x] Feature: Responsive layout for mobile and desktop
  - Acceptance criteria:
  - App is fully usable at 360px width (mobile) and 1280px+ width (desktop).
  - Main layout reflows without horizontal scrolling on supported viewport sizes.
  - Touch targets for primary actions are comfortably tappable on mobile.

- [x] Feature: Modern visual system (type, spacing, color, components)
  - Acceptance criteria:
  - UI uses a consistent design token set for spacing, typography, and colors.
  - Core components (form, buttons, cards/list items, filters) share a coherent style language.
  - Completed TODOs, active TODOs, and interactive states are clearly distinguishable.

- [x] Feature: Interaction polish and feedback states
  - Acceptance criteria:
  - Hover, focus, active, and disabled states are visually distinct for interactive controls.
  - Keyboard focus indicators are visible and meet accessibility contrast expectations.
  - Empty, loading, and error states have intentional styling and readable messaging.

- [ ] Feature: Cross-browser and device fit check
  - Acceptance criteria:
  - Styling is verified on current Chrome, Safari, and Firefox.
  - No major visual breakage on common mobile browsers (iOS Safari, Android Chrome).
  - Layout and typography remain legible and stable across tested environments.

## Notes
- Keep each backlog item small and testable.
- Move completed items to **Shipped** with checkboxes ticked.
