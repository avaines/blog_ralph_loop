# Manual QA Checklist: Responsive + Cross-Browser Styling

## Purpose
Use this checklist to verify layout, readability, and interaction styling across required browsers and viewport sizes.

## Test Matrix
- Viewports: `360x800` (mobile), `768x1024` (tablet), `1280x800` (desktop+)
- Browsers:
  - Desktop: Chrome (current), Safari (current), Firefox (current)
  - Mobile: iOS Safari (current), Android Chrome (current)

## Preconditions
1. Install dependencies: `npm install`
2. Start app: `npm run start`
3. Open app at `http://localhost:8080`
4. Seed at least 3 TODOs:
- one active TODO
- one completed TODO
- one TODO with long title text

## Steps (Run for each browser + viewport)
1. Set viewport to one target size from the matrix.
2. Load app and confirm no horizontal scrollbar appears.
3. Validate form area:
- title/category/group inputs are fully visible
- create button is visible and tappable/clickable
- spacing prevents accidental adjacent taps/clicks
4. Validate list/card area:
- cards are readable and aligned
- completed and active TODOs are visually distinct
- long text wraps without layout breakage
5. Validate filters:
- category and group controls are visible and usable
- applying filter updates visible list correctly
- clearing filters restores full list
6. Validate row actions:
- toggle control changes visual completion state
- delete control removes item from list
- delete control is clearly separated from toggle
7. Validate interaction states:
- hover differs from default (desktop)
- keyboard focus is clearly visible on all controls
- active/pressed state appears on click/tap
- disabled controls appear non-interactive during in-flight requests
8. Validate feedback states:
- empty state appears when no TODOs match
- loading state is visible during fetch operations
- error state styling is distinct and readable

## Pass/Fail Criteria
- `PASS`: No major visual breakage, controls usable, text legible, and interaction states visible.
- `FAIL`: Any clipped/overlapping UI, broken layout, unreadable text, or unclear interaction/feedback state.

## Results Log (Record outcomes)

### Desktop Browsers
| Browser | 360x800 | 768x1024 | 1280x800 | Layout | Readability | Interaction States | Notes |
|---|---|---|---|---|---|---|---|
| Chrome | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL | |
| Safari | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL | |
| Firefox | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL | |

### Mobile Browsers
| Browser | 360x800 | 768x1024 | 1280x800 | Layout | Readability | Interaction States | Notes |
|---|---|---|---|---|---|---|---|
| iOS Safari | PASS/FAIL | PASS/FAIL | N/A | PASS/FAIL | PASS/FAIL | PASS/FAIL | |
| Android Chrome | PASS/FAIL | PASS/FAIL | N/A | PASS/FAIL | PASS/FAIL | PASS/FAIL | |

## Sign-off
- Date:
- Tester:
- Overall result: PASS/FAIL
- Follow-up issues:
