# Implementation Plan: Stickman Golf 2D

## Overview

This plan builds a browser-based, turn-based two-player 2D mini-golf game whose real deliverable is a closed verification loop: an external AI browser agent drives the game entirely through the keyboard and reads every piece of state back from a DOM Debug_Overlay. The plan is scoped to one developer working under two days, so it is a deliberate subset of `requirements.md` rather than full coverage of it. Ordering is driven by reaching an agent-drivable Arena 1 as early as possible, marked as [Milestone 1](#milestone-1) at task 11. Property-based testing and all automated testing are descoped, so verification rests entirely on the Kane CLI flows and on playing the game.

## Scope

One developer, under two days, roughly 16 hours of focused work. That budget governs this plan and it is tighter than `requirements.md`. The requirements document remains the complete contract; this task list is a deliberate subset of it. Where a criterion is not traced by any task below, it is either in the [Descoped](#descoped) section or it is not being built in this window.

Ordering is driven by one goal: reach Arena 1, single player, Debug Overlay live, keyboard end to end, as early as possible. Everything else follows.

**Budget arithmetic, stated honestly.** Required tasks (1 through 16, plus 19) total **15h 20m** against a 16h budget. That is 40 minutes of slack, roughly 4 percent, which is thin for a greenfield project with a hand-written physics engine. The two optional tasks add **2h 05m** and take the plan to **17h 25m**, which is over budget. They are therefore only reachable if earlier tasks come in under estimate. If the budget bites, cut in this order:

1. Task 18 — Arena 5 and the Moving_Obstacle. Cut first. It is the only feature that risks making `BALL_AT_REST` non-deterministic, and every flow depends on that token being reliable.
2. Task 17 — Arenas 3 and 4. Cut second.

Both cuts drop Arenas 3, 4 and 5 from the submission and reduce the Verification_Harness inventory from six flows to three. That is the product owner's stated fallback for the step-budget risk (O-5) and it is a clean cut rather than an unpicking, which is why both tasks are marked `(OPTIONAL)` and both sit at the end.

**Step budget risk accepted.** `AGENT_STEP_BUDGET_PER_FLOW` stays at 15 (R15.4). Flow scope is not narrowed. Arenas 4 and 5 have no slack under that budget and may fail their flows; the response is to drop those Arenas, not to widen the budget or redesign the harness.

---

## Milestone 1

**Tasks 1 through 11.** The marker `**◄── MILESTONE 1**` appears in the task list immediately after task 11.

When Milestone 1 is done, all of the following are true:

- A human or an agent, using only the keyboard, can adjust aim and power in Arena 1, fire, watch the Ball roll and stop, and hole out.
- Every one of those state changes is readable from the Debug Overlay DOM by `data-testid` selector.
- No Game_Server, no second Player, no Colyseus. The client runs standalone and owns its own state for that one Arena.
- All five Arenas are already declared in the Arena_Registry as data, whether or not they are playable.

This is the point at which the project is agent-drivable. Task 12, the first Kane CLI flow, proves the closed loop exists and comes immediately after.

---

## Descoped

### 1. Requirement 18, in full — property-based testing and all automated testing

All 47 properties, including R18.32 and R18.33, are cut. No property-based testing library, no test runner, no automated test suite of any kind. This resolves open decision **O-1** by declining the dependency. The dependency set is exactly: TypeScript, Vite, Three.js, Colyseus, and the Colyseus browser client. Nothing else.

The cost, stated plainly: the physics invariants Requirement 18 was going to assert — determinism, no tunnelling at maximum launch speed, monotonic speed decay, the rest-debounce behaviour, stroke accounting, turn exclusivity, and the rest — become verified only by playing the game and by whatever the six Kane CLI flows happen to exercise along their single path. `REST_SPEED_THRESHOLD` and `FRICTION_PER_STEP` are the two hardest numbers in the project to get right, and nothing automated will catch a regression in either of them. See [Left Unverified](#left-unverified) for the full exposure in one place.

R17.10's clause requiring the single command to run "the full declared test suite" is void as a consequence. The command compiles and type-checks; there is no suite for it to run.

### 2. R2.14 — load-time reachability validation

Cut. R2.14 requires validating each Hole against the *shortest obstacle-free path* from the spawn point. That is a pathfinding computation, not a distance check, and it is expensive to write correctly against arbitrary axis-aligned rectangle layouts.

Kept instead, as cheap load-time validations in task 4:

- spawn point and Hole lie inside the Playfield with at least `BALL_RADIUS` clearance from every wall and every static obstacle (R2.15),
- every wall and every obstacle has a shorter side of at least `MIN_WALL_THICKNESS` (R2.13),
- the Moving_Obstacle clears the Hole by `HOLE_RADIUS` plus twice `BALL_RADIUS` at every path position (R2.20).

Reachability is instead confirmed by hand while tuning. Task 19 carries that as its stated acceptance condition.

### 3. R2.17 — corridor clear-width validation

Cut, following from the same reasoning as R2.14 and from the keep-list above. The narrowest-clear-width computation and the Moving_Obstacle gap-on-path check are sweeps over the layout, not comparisons. `MIN_CORRIDOR_WIDTH` is instead satisfied by construction in the Arena 3 data and confirmed by hand in task 19. Flagged here because it is a consequence of the owner's cut rather than a separate owner decision.

### 4. R4.25 — build-time numeric-literal gate

Cut. Failing the build on a stray physics literal outside the Constants_Module needs a lint rule, and a linter is a gated dependency the owner has ruled out (R17.6, O-2). The *enforcement* is cut; R4.18's single-declaration-site discipline is kept as a convention that every task below follows. Nothing mechanical will catch a violation.

### 5. R16 Asset_Registry — simplified, not cut

A keyed registry with per-key drawn size, anchor point, colour palette value and load-failure fallback is over-built for two days. Reduced to a single module of named colour and size constants that the Renderer reads by key (task 8), plus `docs/asset-requests.md` created in the first increment (task 2).

What that drops: asset *file* references and the one-line binding promise (R16.1, R16.3), the anchor-point pairing (R16.9), and the load-failure fallback with its anomaly entry (R16.10). Because R16.10's anomaly path no longer exists, R15.35's exemption for asset-load anomalies is moot — every anomaly a flow observes is fatal.

---

## Tasks

- [ ] 1. Pre-flight — verify Assumption A-1 before any code is written
  - Drive a throwaway page with Kane CLI and confirm one agent step can dispatch a batched key sequence (for example, ArrowLeft pressed four times in one dispatched action) rather than one keypress per step.
  - **If this fails, the plan stops here.** Control granularity in R4.13, R7.1 through R7.4, R7.15 and R7.16 has to be revisited, and the whole step-budget arithmetic in R15.4, R15.22 and R15.23 has to be redone, before any code is written. Do not start task 2 on an unverified A-1.
  - Acceptance: a recorded observation stating whether one agent step carried more than one keypress, and the observed count.
  - Estimate: **15 min**
  - _Requirements: R4.13, R7.1, R7.2, R7.3, R7.4, R7.15, R7.16, R15.4, R15.16, R15.22, R15.23_

- [ ] 2. Project scaffold, TypeScript configuration, single build command
  - Create the repository layout: `client/` for the Vite application, `shared/` for the Physics_Engine, Constants_Module, Arena_Registry and geometry module, and `server/` reserved for task 14. `verification/flows/` created empty.
  - One shared base `tsconfig` with `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` enabled, which neither client nor server overrides.
  - One command that type-checks `client/`, `shared/` and (from task 14 onward) `server/`, and produces no output on a type error. R17.10's test-suite clause is void; see Descoped.
  - Create `docs/asset-requests.md` in this increment with its header and the `REQUESTED`/`SUPPLIED` status convention, so later tasks only append.
  - Acceptance: the single command runs clean on an empty-but-compiling tree, and `docs/asset-requests.md` exists.
  - Estimate: **45 min**
  - _Requirements: R17.1, R17.2, R17.7, R17.8, R17.10, R16.6_

- [ ] 3. Constants_Module
  - Declare every value in Requirement 4 as a read-only binding in one module under `shared/`. Derive `FIXED_STEP_SECONDS` from `SIMULATION_HZ` and derive `MAX_CARRY_DISTANCE` by running the R3.14 per-step decay-then-displace loop at `POWER_MAX_PERCENT` until speed falls below `REST_SPEED_THRESHOLD`; neither is a literal.
  - Assert the R4.33 ordering relation at load time. Import nothing from Three.js or Colyseus and reference no browser-only or server-only interface.
  - Acceptance: every constant in Requirement 4 resolves, `MAX_CARRY_DISTANCE` lands near 877 world units, and the module loads under both Node and the browser.
  - Estimate: **30 min**
  - _Requirements: R4.1–R4.24, R4.26–R4.33, R17.9_

- [ ] 4. Geometry module and Arena_Registry — all five Arenas as data
  - Write the shared geometry module: point-in-rectangle, circle-to-axis-aligned-rectangle distance and overlap, segment-to-point distance. It declares no physics or tuning value and is the single source of the math both Arena validation and the Physics_Engine consume.
  - Declare all five Arenas: number, walls, obstacles, spawn point, Hole position, Par (2, 3, 3, 4, 4), per-edge wall flags with Arena 4 carrying the single open edge, and Arena 5's Moving_Obstacle path. Declared from this increment regardless of which Arenas are playable.
  - Implement the kept load-time validations only: R2.15 clearance, R2.13 minimum thickness, R2.20 Moving_Obstacle Hole clearance. Each raises a load-time error naming the failing Arena and the failed validation before anything renders. R2.14 and R2.17 are descoped.
  - Acceptance: all five Arena definitions load without error, and deliberately corrupting one spawn point raises a named load-time error.
  - Estimate: **60 min**
  - _Requirements: R2.1–R2.13, R2.15, R2.16, R2.18, R2.19, R2.20, R6.6_

- [ ] 5. Physics_Engine
  - [ ] 5.1 Step order, integration, friction, and contact resolution
    - Implement `step()` advancing exactly one Simulation_Step in the R3.14 operation order. Multiply velocity by `FRICTION_PER_STEP` once before integration, displace by the post-friction velocity times `FIXED_STEP_SECONDS`, then resolve contact by testing centre-to-surface distance against `BALL_RADIUS` at the integrated position — one test per step, no sub-stepping and no swept test for surfaces.
    - Reflect the perpendicular component with `WALL_RESTITUTION`, preserve the parallel component, depenetrate along the outward normal to within `MAX_PENETRATION_TOLERANCE`. Handle multi-surface overlap in Arena_Registry declaration order, skipping surfaces the velocity points away from. Implement the R3.16 residual-overlap bail-out. Balls are transparent to each other.
    - Advance only by a caller-supplied step count and read no wall-clock time source. Import neither Three.js nor Colyseus.
    - Acceptance: a Ball fired into a walled corner reflects twice and its overlap after every step stays within `MAX_PENETRATION_TOLERANCE`.
    - Estimate: **75 min**
    - _Requirements: R3.1, R3.4–R3.8, R3.12, R3.13, R3.14 (operations 1–4), R3.15, R3.16, R6.7, R6.8, R17.5, R17.9_
  - [ ] 5.2 Terminal outcomes — rest debounce, Hole capture, out of bounds, duration valve
    - Rest debounce: track consecutive sub-threshold steps, reset on any step at or above `REST_SPEED_THRESHOLD`, and zero the velocity on both axes on the step the count reaches `REST_DEBOUNCE_STEPS`.
    - Hole capture: test the path traced across the step, including any reflection segment, against `HOLE_RADIUS` with end-of-step speed below `HOLE_CAPTURE_MAX_SPEED`; on capture, zero velocity and hold the centre at the Hole centre. Capture outranks out of bounds within a step.
    - Out of bounds: centre strictly outside the Playfield rectangle at end of step, direction-independent, edge-inclusive as inside. Reset places the Ball at the recorded pre-shot position, not the spawn point.
    - `MAX_SHOT_DURATION_SECONDS` valve: stop the Ball, re-evaluate capture against the stopped position, and record an anomaly. Expose an anomaly counter the overlay reads.
    - Acceptance: a slow Ball rolling over the Hole is captured; the same shot at full power passes over it and is later capturable.
    - Estimate: **45 min**
    - _Requirements: R3.14 (operations 5–7), R4.12, R5.6, R5.8, R5.11, R6.1, R6.2, R6.4, R6.5_

- [ ] 6. Shot_Controller — the single shot entry point
  - One exported `shoot(angle, power)` under `shared/`, the only code path that may impart velocity to a Ball outside the Physics_Engine's per-step integration. Clamp power into range, wrap angle into 0 up to 360, apply no rounding onto either grid, reject non-finite arguments with `INVALID_SHOT_ARGUMENT`, and record the pre-shot position for the out-of-bounds reset with the R6.9 legality check.
  - For Milestone 1 this imparts velocity locally and derives it from the R4.5 mapping. Task 14.2 converts it to a server request that waits for the broadcast vector; that conversion is expected and is priced into 14.2.
  - Acceptance: `shoot` is the only writer of Ball velocity outside the engine, and a non-finite argument leaves every piece of state unchanged.
  - Estimate: **25 min**
  - _Requirements: R8.1, R8.2, R8.5, R8.6, R8.8, R8.9, R8.11, R6.9, R4.5_

- [ ] 7. Fixed-step clock separated from the render callback
  - Drive Simulation_Steps from a time source that is not the frame callback, accumulate elapsed time, execute whole steps up to `MAX_CATCHUP_STEPS_PER_FRAME` per pass, retain only the sub-step remainder, and discard the excess rather than carrying it forward. Record the R3.18 discard anomaly.
  - Acceptance: step count per wall-clock second holds at `SIMULATION_HZ` independently of the render rate, and a long stall discards rather than replays.
  - Estimate: **30 min**
  - _Requirements: R3.2, R3.3, R3.17, R3.18, R14.9_

- [ ] 8. Renderer and the visual constants module
  - Three.js orthographic camera, single plane, framed so the whole Playfield is visible at equal world units per pixel on both axes with surplus viewport area falling outside the Playfield bounds. Draw Playfield bounds, walls, obstacles, Hole, both Balls, the outside-Playfield area, the aim indicator at `AIM_INDICATOR_MIN_LENGTH` or longer, the power indicator with strictly increasing extent, and the current Arena's Par. All geometry derived from the Arena_Registry with no inline literal.
  - Create the simplified visual constants module: named colour and size constants read by key, per the R16 simplification. Append the corresponding entries to `docs/asset-requests.md` before recording this task complete.
  - Draw at the most recently completed Simulation_Step with no interpolation and no extrapolation; hold a stopped Ball's drawn position until the next shot or an adopted position.
  - Acceptance: Arena 1 draws correctly at two different window sizes with the aim and power indicators tracking their values.
  - Estimate: **60 min**
  - _Requirements: R14.1–R14.7, R14.9–R14.12, R2.3, R13.11, R16.2, R16.4, R16.5, R16.8_

- [ ] 9. Input_Controller — keyboard only
  - Left and right arrows step the aim angle by `ANGLE_STEP_DEGREES` per press including auto-repeat, wrapping into 0 up to 360 and staying on the grid. Up and down step power by `POWER_STEP_PERCENT`, clamping at both ends with no rejection and staying on the 19-value grid. Space invokes `shoot(angle, power)` with the values the overlay currently exposes, irrespective of the Status_Token.
  - Suppress default scrolling for all five keys. Deliver every press to the controller from any focus position in the page, including focus on an overlay element or the canvas, with no pointer interaction required. Accept adjustment while the Ball is moving.
  - Acceptance: an agent that loads the page and immediately presses keys, without clicking anything, moves the aim indicator.
  - Estimate: **40 min**
  - _Requirements: R7.1–R7.8, R7.11–R7.18, R8.2_

- [ ] 10. Debug_Overlay — the frozen DOM contract
  - Render the overlay as DOM outside the canvas, present from the first frame in every Match phase with no query parameter or keypress required. Expose every field Requirement 9 declares, each carrying its declared `data-testid`, each rendered as bare trimmed text with no label, unit or punctuation: arena, active player, per-Player strokes, totals, aim angle, power, status, match phase, participation, completion, hole-out, last rejection, anomaly count, result, and the per-Arena stroke fields.
  - Derive status, aim and power from local state. Server-derived fields hold placeholder-but-valid values until task 14 wires the Game_Server; every value must already be a member of its declared set so a flow reading the overlay cannot fail on an out-of-set value.
  - Update a field within one rendered frame of its source changing and before the Status_Token next reads `BALL_AT_REST`.
  - Acceptance: every declared `data-testid` is present and non-empty on first paint, and every enumerated field holds a member of its declared set.
  - Estimate: **55 min**
  - _Requirements: R9.1–R9.16, R9.19–R9.25, R10.9, R10.15, R5.1, R5.2, R5.3_

- [ ] 11. Local Arena 1 loop — Status_Token state machine and shot accounting
  - Implement the Status_Token machine over the R5.16 edges only, with `BALL_AT_REST` held before any shot, `BALL_MOVING` on launch, and the three terminal values. Reject a shot while the token is not `BALL_AT_REST` with `BALL_NOT_AT_REST`.
  - Count one stroke per fired shot locally, latch the per-Player hole-out field to `HOLED_OUT_BY_CAPTURE` or `HOLED_OUT_BY_STROKE_CAP` and hold it, cap at `MAX_STROKES_PER_ARENA`, and reset aim and power to their defaults when a shot completes and when a turn begins.
  - Wire the clock, engine, shot controller, input controller, renderer and overlay into one running client for Arena 1 with a single local Player.
  - Acceptance: keyboard alone drives aim, power, fire, roll, stop and hole-out in Arena 1, and every one of those transitions is readable from the overlay DOM.
  - Estimate: **45 min**
  - _Requirements: R5.4, R5.5, R5.7, R5.9, R5.10, R5.12–R5.18, R6.3, R6.10, R7.9, R7.10, R13.5, R13.16, R9.14_

**◄── MILESTONE 1: agent-drivable Arena 1 reached here**

- [ ] 12. First Kane CLI flow — Arena 1 solo, and the defect log
  - Build the harness conventions under `verification/flows/`, one flow per file, and write the Arena 1 flow: fresh browser instance per run, browsing context kept visible, keyboard input only, state read only from overlay text content with no page script evaluated. Each Status_Token wait is one agent step polling at `STATUS_POLL_INTERVAL_MILLISECONDS` up to `STATUS_POLL_TIMEOUT_SECONDS`. Count every dispatched step, reads included, against the 15-step budget.
  - Pass when the flow's Player's hole-out field reads `HOLED_OUT_BY_CAPTURE` within budget and within `MAX_STROKES_PER_ARENA`. Fail on budget exhaustion, a stroke-cap hole-out, a poll timeout, an out-of-set field value, an absent declared field identifier for the current phase, or a non-zero anomaly count. On a non-environment failure, append a replayable entry to `verification/defects.md`, recording the step sequence and every shot's aim and power.
  - Create `verification/defects.md` in this increment, with its entry template and the classification rule that separates a game defect from a harness or environment failure.
  - Until the server exists this flow drives the standalone client, which is single-occupant by construction; task 14.2 re-points it at the Game_Server with `ALLOW_SINGLE_OCCUPANT_START` enabled, which is what actually satisfies R15.10 and R15.19.
  - Acceptance: the Arena 1 flow runs unattended, reports pass or fail with a classification, and files a replayable entry on failure.
  - Estimate: **45 min**
  - _Requirements: R15.1–R15.4, R15.6–R15.9, R15.12–R15.14, R15.17, R15.21–R15.29, R15.31–R15.34_

- [ ] 13. Arena 2 playable and verified — bank shots
  - Tune the Arena 2 wall so the Hole is unreachable in a straight line and reachable off at least one reflection, then write the Arena 2 flow against it. Confirm `WALL_RESTITUTION` produces a bank shot that holes out inside the step budget.
  - A client-side start-arena query parameter stands in for `START_AT_ARENA` until task 14.1 moves arena entry to the room parameter; the parameter is temporary scaffolding and is removed there.
  - Acceptance: the Arena 2 flow passes with a shot whose path reflects at least once before capture.
  - Estimate: **40 min**
  - _Requirements: R2.8, R3.6, R4.7, R15.12, R15.13, R15.20_

- [ ] 14. Colyseus server — authoritative state and turn enforcement
  - [ ] 14.1 Room, schema, lifecycle, and the flags
    - Colyseus room owning the authoritative values in R10.1. Room creation returns a distinct 6-character code from the declared alphabet; join validates the code and rejects with `ROOM_NOT_FOUND`, `ROOM_FULL` or `MATCH_ALREADY_STARTED` in that precedence. Two-Player hard limit. Dispose the room when no connected Player remains, after the result is recorded.
    - `ALLOW_SINGLE_OCCUPANT_START` resolved once at Constants_Module load in the server process and held for the process lifetime; disabled by default. With it enabled, a single occupant starts immediately at Arena 1 and `START_AT_ARENA` is accepted for 1 through 5, rejecting with `START_AT_ARENA_REFUSED` otherwise. With it disabled, `WAITING_FOR_OPPONENT` rejects shots with `MATCH_NOT_STARTED` while aim and power still adjust locally.
    - Extend the single build command to type-check `server/`.
    - Acceptance: two browser instances join one room by code, a third is rejected `ROOM_FULL`, and a bad code is rejected `ROOM_NOT_FOUND`.
    - Estimate: **60 min**
    - _Requirements: R1.1–R1.3, R1.9–R1.12, R1.15, R1.17, R1.19, R1.20, R1.22, R1.23, R4.20, R4.28, R10.1, R10.11, R17.4, R17.8, R17.10_
  - [ ] 14.2 Shot request pipeline, server simulation, and client adoption
    - Convert `shoot` from a local launch to a request carrying angle, power and a sequence number, asserting no position or velocity and imparting nothing until the server publishes acceptance. Set the token to `BALL_MOVING` on submission and release it on acceptance or rejection.
    - Server evaluates preconditions in the R11.9 order and returns exactly one reason. On acceptance it increments the stroke count once per unseen sequence number, derives the launch velocity vector once from the R4.5 mapping, broadcasts both components, and runs the same shared simulation the client runs. Replay of a seen sequence number republishes the prior outcome and mutates nothing.
    - Client takes the broadcast vector verbatim, derives no part of it from the angle, applies no local prediction while awaiting a response, adopts the published terminal position when divergence exceeds `POSITION_DIVERGENCE_TOLERANCE` and records the anomaly, and handles the R10.13 out-of-order and timeout paths.
    - Re-point the Arena 1 and Arena 2 flows at the server with `ALLOW_SINGLE_OCCUPANT_START` and `START_AT_ARENA`, and remove the task 13 query-parameter scaffolding.
    - Acceptance: two clients see identical strokes, active player and terminal positions for the same shot, and rejections mutate nothing.
    - Estimate: **75 min**
    - _Requirements: R8.4, R8.7, R8.10, R8.12, R10.2–R10.8, R10.10, R10.12–R10.14, R11.1–R11.4, R11.6, R11.9–R11.11, R5.18, R5.19, R9.22, R15.10, R15.19, R15.20_
  - [ ] 14.3 Two-client turn-enforcement flow
    - Run two Game_Clients as separate parallel processes, each with its own browser instance. Dispatch a shot from the client whose Player the overlay's active-player field does not identify, and assert both Players' per-Arena strokes and totals are unchanged and that client's `overlay-last-rejection` reads `NOT_YOUR_TURN`.
    - Acceptance: the turn-enforcement flow passes and no per-Arena flow covers turn enforcement.
    - Estimate: **30 min**
    - _Requirements: R15.11, R15.18, R11.1, R11.5, R11.10, R9.21, R9.22_

- [ ] 15. Disconnect handling
  - Detect loss of a room session within `DISCONNECT_DETECTION_SECONDS`, including a process killed without closing its session, with no grace period and no reconnect window. Set participation to `DISCONNECTED`, mark DNF while `IN_PROGRESS`, preserve that Player's strokes and total, and hold the phase at `IN_PROGRESS`.
  - Transfer the active-player designation to the remaining connected Player before accepting another shot, without waiting for an in-flight shot, and complete that in-flight shot's simulation with its stroke retained. Run the Match to completion for the survivor, advancing exactly once per Arena and covering the case where the survivor has already holed out. Both disconnected sets the result `VOID`, records it, then disposes the room. A disconnect while `WAITING_FOR_OPPONENT` or `MATCH_COMPLETE` mutates nothing.
  - Surviving client updates the participation field only, shows a notice that dismisses itself within `DISCONNECT_NOTICE_SECONDS`, leaves focus alone, and keeps delivering keys while it shows.
  - Acceptance: killing one client's process mid-Match leaves the other playing on to Arena 5 without any action from it.
  - Estimate: **45 min**
  - _Requirements: R12.1–R12.15, R1.14, R9.12, R9.18, R4.29, R4.30_

- [ ] 16. Scoring, Arena advance, and Match completion across the Course
  - Transfer the active-player designation on every terminal outcome per R1.5. Advance the Arena as one state update when every connected Player has holed out, placing Balls at the new spawn point, zeroing that Arena's strokes, clearing hole-out, designating P1 where connected and P2 otherwise, and resetting aim and power. Reject a shot arriving mid-advance with `ARENA_ADVANCE_IN_PROGRESS`.
  - Add each Arena's strokes to the running total on completion and retain the per-Arena value addressed by Arena number; the total covers completed Arenas only. Record zero for a Player with no accepted shot in a completed Arena. Cap at `MAX_STROKES_PER_ARENA` evaluated at the shot's terminal outcome.
  - On Arena 5 completion set `MATCH_COMPLETE`, hold the active-player designation, determine the winner as the strictly lowest total among Players whose completion field is `NONE`, `TIE` on equality, `VOID` when all are DNF, and publish the result plus every per-Arena stroke field.
  - Acceptance: a single-occupant run reaches `MATCH_COMPLETE` after Arena 5 with the result field and all ten per-Arena stroke fields populated and the totals matching their per-Arena sums.
  - Estimate: **50 min**
  - _Requirements: R1.5–R1.8, R1.13, R1.16, R1.18, R1.21, R13.1–R13.4, R13.6–R13.10, R13.12–R13.15, R13.17, R9.17, R9.19_

- [ ] 17. Arenas 3 and 4 playable and verified (OPTIONAL)
  - Tune the Arena 3 corridor to satisfy `MIN_CORRIDOR_WIDTH` by construction with no straight-line bypass, and the Arena 4 static obstacle so at least two distinct angles on the grid can hole out, with its single open Playfield edge making out of bounds reachable. Write both flows.
  - Cut this second if the budget bites. Dropping it removes Arenas 3 and 4 from the submission and two flows from the inventory.
  - Acceptance: both flows pass within the 15-step budget, and an Arena 4 shot across the open edge produces `OUT_OF_BOUNDS` with the Ball reset to its pre-shot position.
  - Estimate: **55 min**
  - _Requirements: R2.9, R2.10, R2.19, R6.4, R6.6, R6.8, R15.12, R15.13_

- [ ] 18. Arena 5 Moving_Obstacle (OPTIONAL)
  - Advance the Moving_Obstacle on every Simulation_Step of the same clock, derived from the step count since Arena entry and the declared path alone with no wall-clock source, clamping at each endpoint and reversing on the following step. Reflect a moving Ball off it with `WALL_RESTITUTION` at the post-advance normal, imparting none of the obstacle's own velocity. Displace a resting Ball the advance overlaps, treat it as in motion for the rest of that step, and evaluate capture and out of bounds against the displaced position, which is what the two `BALL_AT_REST` outward edges in R5.16 exist for. Draw the path with a fill distinct from the obstacle. Write the Arena 5 flow.
  - Cut this first if the budget bites. Motion is the one feature that risks making `BALL_AT_REST` non-deterministic, and every flow depends on that token being reliable.
  - Acceptance: the obstacle position is reproducible from the step count alone, and a resting Ball it pushes does not jitter and does not silently acquire a capture.
  - Estimate: **70 min**
  - _Requirements: R2.11, R2.20, R3.9–R3.11, R3.14 (operation 1), R4.11, R5.16, R6.11, R14.13, R15.12_

- [ ] 19. Physics tuning and full-course playtest
  - Play every implemented Arena by hand and tune `FRICTION_PER_STEP`, `REST_SPEED_THRESHOLD`, `REST_DEBOUNCE_STEPS`, `HOLE_CAPTURE_MAX_SPEED` and `WALL_RESTITUTION` for a decisive stop and a fair capture. All five Arenas share one constant set; per-Arena tuning is forbidden.
  - **This task carries the reachability acceptance that R2.14 and R2.17 were going to validate at load time.** Confirm by hand, per implemented Arena, that the Hole is reachable within Par plus one shots from the spawn point using only grid angles and grid power values, and that Arena 3's corridor is at least `MIN_CORRIDOR_WIDTH` at its narrowest. Record the witness shot sequence per Arena in `verification/defects.md` alongside the flow entries, so a later regression has something to compare against.
  - Re-run every implemented flow after the final constant change and record the results. Confirm a full Course run completes with every visual resolved to its constant-driven placeholder.
  - Acceptance: every implemented flow passes on the final constant set, and every implemented Arena has a recorded witness sequence within Par plus one.
  - Estimate: **50 min**
  - _Requirements: R4.6–R4.10, R4.17, R2.14 (by hand), R2.17 (by hand), R15.30, R16.7_

---

## Notes

- Tasks marked `(OPTIONAL)` are the planned cut line, not nice-to-haves. Cut 18 before 17.
- Required total 15h 20m, optional total 2h 05m, grand total 17h 25m against a 16h budget.
- `shared/` holds the Physics_Engine, Constants_Module, Arena_Registry and geometry module as exactly one copy each, consumed by both processes, importing neither Three.js nor Colyseus and touching no browser-only or server-only interface. Task 5.1 and task 14.2 both depend on that holding.
- `docs/asset-requests.md` exists from task 2. `verification/defects.md` exists from task 12.
- Every task follows R4.18's single-declaration-site discipline as a convention. Nothing enforces it; see Descoped item 4.

---

## Left Unverified

Dropping Requirement 18 removes every automated check from the project. This is the exposure in one place. Each item below was going to be asserted by a property or a test and is now confirmed only by playing the game and by whatever the six Kane CLI flows happen to touch along their single path.

**Physics, and this is where the real risk sits**

- Determinism across two runtimes and across repeated runs from an identical state (R18.11). The launch vector is derived server-side once to avoid trigonometric drift, but nothing checks that the two simulations actually agree; a divergence shows up only as an anomaly count at run time.
- No tunnelling, including at `MAX_LAUNCH_SPEED` against a wall of `MIN_WALL_THICKNESS` at every grid angle (R18.9, R18.10). The Q-17 margin is about 3x on paper and untested in fact.
- Monotonic speed decay and no energy gain on contact (R18.6, R18.7).
- Containment inside a fully walled Arena at every step (R18.8).
- Rest-debounce behaviour, including the no-premature-rest case where speed dips below threshold for fewer than `REST_DEBOUNCE_STEPS` and then recovers (R18.4, R18.5). This one was to be driven by generated velocity sequences straight into the engine, which no amount of playing reproduces reliably.
- Termination within `MAX_SHOT_DURATION_SECONDS` for every grid angle, grid power and legal start position (R18.2).
- Carry bound and agreement between the derived `MAX_CARRY_DISTANCE` and the Carry_Distance the engine actually produces (R18.14, R18.47).
- Capture threshold behaviour for a fast Ball crossing the Hole (R18.44) and out-of-bounds reset legality (R18.45).
- Frame-rate independence across arbitrary step batchings (R18.12) and the Moving_Obstacle single-clock property (R18.15).

**`REST_SPEED_THRESHOLD` and `FRICTION_PER_STEP` are the hardest numbers in the project to get right, and nothing automated will catch a regression in either of them.** They are tuned by feel in task 19 and then frozen by hope. A later change to one of them can silently break `BALL_AT_REST` timing, which is the token every flow polls on, and the failure will present as a flaky flow rather than as a physics bug.

**Protocol and accounting**

- Status_Token value set and transition-edge legality (R18.1, R18.3).
- Turn exclusivity under arbitrary interleavings, rejection side-effect freedom, exactly-one-active-player liveness, and the no-stall property after a disconnect (R18.16 through R18.20).
- Stroke accounting: the accounting identity, unit cost, monotonicity, frozen scores after hole-out, the `MAX_STROKES_PER_ARENA` bound, preservation across a disconnect, and advance accounting (R18.21 through R18.27, R18.46).
- Rejection precedence and the closed rejection-reason sets (R18.41, R18.42).
- Overlay contract completeness — that the exposed identifier set exactly equals the declared set for the current phase, with nothing absent and nothing extra (R18.43), and the overlay round trip (R18.31).
- Arena round-trip equivalence between declared and exposed definitions (R18.30).

**What partially survives, and why it is not a substitute**

The six flows assert on every read that each declared field identifier is present and each enumerated value is in its set (R15.26), and they fail on any non-zero anomaly count (R15.17, R15.32). That catches a contract break and catches divergence, synchronisation, discard, overlap and duration anomalies — but only along the one path each flow walks, only for the Arenas that get implemented, and only for the inputs those flows happen to use. It is incidental coverage, not a regression suite.

**The consequence to plan around:** after task 19 there is no safety net. Any change to physics, the overlay contract, or stroke accounting is unverified until someone replays the flows by hand, and a regression in a tuning constant may not surface at all.

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["3"] },
    { "id": 3, "tasks": ["4"] },
    { "id": 4, "tasks": ["5.1"] },
    { "id": 5, "tasks": ["5.2"] },
    { "id": 6, "tasks": ["6", "7"] },
    { "id": 7, "tasks": ["8", "9"] },
    { "id": 8, "tasks": ["10"] },
    { "id": 9, "tasks": ["11"] },
    { "id": 10, "tasks": ["12"] },
    { "id": 11, "tasks": ["13"] },
    { "id": 12, "tasks": ["14.1"] },
    { "id": 13, "tasks": ["14.2"] },
    { "id": 14, "tasks": ["14.3"] },
    { "id": 15, "tasks": ["15"] },
    { "id": 16, "tasks": ["16"] },
    { "id": 17, "tasks": ["17"] },
    { "id": 18, "tasks": ["18"] },
    { "id": 19, "tasks": ["19"] }
  ]
}
```
