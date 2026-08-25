# Project Instructions

Stickman Golf 2D — a browser mini-golf client whose real deliverable is a **closed verification
loop**: the Kane CLI plays by keyboard only and reads all state from a frozen DOM Debug_Overlay.
The game is the vehicle; the loop is the product.

**Current state: Amendment A-2 (side-view gravity terrain golf) is mid-migration and uncommitted.**
`shared/` is migrated and type-checks clean; `client/src/renderer.ts` still targets the old
top-down wall model and fails `npm run check`. Pre-A-2 build is tagged `topdown-final`. Tasks 1–11
of `.kiro/specs/stickman-golf-2d/tasks.md` are done; tasks 12–14 (Kane flows, Arena 2, tuning) are
open. The README predates both the descope and A-2 — trust the spec, not the README.

## Tech Stack

TypeScript strict + Vite + Three.js (rendering only). Nothing else — no test runner, no linter, no
physics library, no server. Node >= 22.18. Physics is hand-written.

## Commands

- Type-check gate: `npm run check` (tsc over shared/, client/, verification/tools/)
- Dev server: `npm run dev`
- Build / preview: `npm run build`, `npm run preview`
- Verification tools run under plain Node, e.g.: `node verification/tools/check-course.ts`

## Code Style

- **Spec-traced comments.** Every non-obvious decision cites its requirement (`R3.16`, `A-2`,
  `D-18`). Match that density; the requirement IDs live in `.kiro/specs/stickman-golf-2d/requirements.md`.
- **Pure functions, immutable state.** Engine and state-machine functions take state and return new
  state; rejections return instead of throwing. Only error classes and module-level constants.
- **Single declaration site (R4.18).** Every physics/tuning constant lives in `shared/constants.ts`.
  Arena geometry lives only in `shared/arenas.ts`. No physics literal anywhere else.
- **Load-time validation.** Data modules validate at import and throw named errors
  (`ConstantsInvariantError`, `ArenaValidationError`) — importing the module is the whole gate.
- **`shared/` purity.** No Three.js, no transport, no DOM/browser interface (enforced: its tsconfig
  omits the DOM lib). Everything in `shared/` must keep loading under Node.
- Relative imports carry the `.ts` extension (Node ESM compat).
- Frozen value sets (overlay contract, rejection reasons) never change spelling or lose members,
  even for unreachable values.

## Architecture Notes That Bite

- `shoot(angle, power)` in `shared/shot.ts` is the ONLY code path that may impart ball velocity.
- Simulation runs on a fixed 60 Hz clock with its own time source (`client/src/clock.ts`),
  decoupled from requestAnimationFrame. Never drive physics from the frame callback.
- Difficulty comes from geometry (terrain shape), never from per-arena physics constants.
- The Debug_Overlay contract (`shared/overlay-contract.ts`) is frozen: field identifiers and value
  spellings are load-bearing for external tests. Changing them breaks verification.
- Aim/power grids (5° steps, 5% power steps) are fixed; snapping belongs to the Input_Controller,
  never inside `shoot`.
- After changing `REST_SPEED_THRESHOLD` or `ROLLING_FRICTION_PER_STEP`, re-run the Kane flows — a
  regression there presents as harness flakiness, not as a physics bug.

## Verification

There is NO automated test suite (Requirement 18 descoped, deliberately). The substitutes are:

1. `npm run check` — types only.
2. `verification/tools/check-*.ts` — Node scripts asserting behaviour (physics, match state,
   overlay contract vs an independent transcription of Requirement 9, course playability grid).
   Run them after any change to `shared/`.
3. The two Kane CLI flows under `verification/flows/` (task 12–13, not yet written) and hand play.

When fixing a defect, record it in `verification/defects.md` once task 12 creates it.

## Key Files

| Purpose | File |
|---|---|
| Spec (contract + amendments) | `.kiro/specs/stickman-golf-2d/requirements.md` |
| Plan, status, descopes | `.kiro/specs/stickman-golf-2d/tasks.md` |
| Constants + invariants | `shared/constants.ts` |
| Terrain interpolation (A-2) | `shared/terrain.ts` |
| Arena data + validation | `shared/arenas.ts` |
| Physics step | `shared/physics.ts` |
| Shot entry point | `shared/shot.ts` |
| Frozen overlay contract | `shared/overlay-contract.ts` |
| Match state machine | `client/src/game.ts` |
| Wiring | `client/src/main.ts` |

## Git

Commit style: `Task N: short outcome-focused summary`. One task per commit. Do not commit the
A-2 work until `npm run check` passes and the verification tools have been re-run.
