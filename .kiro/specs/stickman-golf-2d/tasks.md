# Implementation Plan: Stickman Golf 2D

## Overview

This plan builds a local single-player browser client for a 2D mini-golf game over Arenas 1 and 2, whose real deliverable is a closed verification loop: the Kane CLI drives the client by keyboard and reads every piece of state back from a DOM Debug_Overlay. There is no Colyseus, no Game_Server, no second Player, no disconnect handling, no cross-Course scoring, no Arenas 3, 4 or 5, no Moving_Obstacle and no automated test suite. The dependency set is exactly TypeScript, Vite and Three.js.

The plan is a deliberate subset of `requirements.md` rather than full coverage of it. `requirements.md` remains the complete contract and the design of record; everything the owner cut is retained there marked `**[DESCOPED]**` rather than deleted, and is listed in the [Descoped](#descoped) section below with its consequence. Ordering is driven by reaching an agent-drivable Arena 1 as early as possible, marked as [Milestone 1](#milestone-1) at task 11.

Assumption A-1 is resolved and needs no pre-flight. It was tested against Kane CLI 0.8.4 and **rejected**: one agent step carries one keypress, not a batched sequence. The resolution is the absolute input path — two DOM number inputs plus document-level capture-phase key interception, R7.19 through R7.26 — which makes a Shot cost a fixed number of Agent_Steps at any grid resolution. Task 1 is now a five-minute read of the recorded finding rather than a gate, and task 9 builds the answer.

Verification rests entirely on the two Kane CLI flows and on playing the game.

## Scope

One developer, under two days, roughly 16 hours of focused work. That budget governs this plan and it is tighter than `requirements.md`. Where a criterion is not traced by any task below, it is either in the [Descoped](#descoped) section or it is not being built in this window.

Ordering is driven by one goal: reach Arena 1, single player, Debug Overlay live, keyboard end to end, as early as possible. Everything else follows.

**Budget arithmetic, stated honestly.** Recomputed from the per-task estimates below:

```
5 + 45 + 30 + 60 + (75 + 45) + 20 + 30 + 60 + 60 + 60 + 45 + 45 + 50 + 40 = 670 min
```

That is **11h 10m** against a 16h budget, leaving **4h 50m of slack, about 30 percent**. There are **no optional tasks any more** — the scope cut removed the cut line rather than deferring it, so every task in this list is required and nothing is marked `(OPTIONAL)`.

What the slack buys, in order of how plainly it buys it: room for the hand-written physics to take two or three tuning passes instead of one, which is where a greenfield project of this shape actually overruns; room for the verification loop to file defects and have them fixed and re-run, which is the deliverable being judged; and, if the owner wanted it, enough headroom to reinstate Arena 3 with its flow. That last is stated as an option the arithmetic permits, not as a recommendation.

**Step budget risk accepted.** `AGENT_STEP_BUDGET_PER_FLOW` stays at 15 (R15.4). Under the absolute input path a Shot cycle costs four Agent_Steps — set the aim, set the power, fire, one bounded poll — and each flow carries one navigation and one final read. Arena 1 at Par 2 costs 10 and fits with headroom for one extra Shot. Arena 2 at Par 3 costs 14 and fits with none. The Arena 2 flow therefore passes only on a Par run; see task 13 and O-5.

---

## Milestone 1

**Tasks 1 through 11.** The marker `**◄── MILESTONE 1**` appears in the task list immediately after task 11.

When Milestone 1 is done, all of the following are true:

- A human or an agent, using only the keyboard, can adjust aim and power in Arena 1 — by arrow stepping or by writing the two number inputs — fire, watch the Ball roll and stop, and hole out.
- Every one of those state changes is readable from the Debug Overlay DOM by `data-testid` selector.
- No Game_Server, no second Player, no Colyseus. The client runs standalone and owns all of its own state. This is permanent, not a staging step.
- All five Arenas are already declared in the Arena_Registry as data per R2.2, whether or not they are playable.

This is the point at which the project is agent-drivable. Task 12, the first Kane CLI flow, proves the closed loop exists and comes immediately after.

---

## Descoped

### 1. Requirement 18, in full — property-based testing and all automated testing

All 47 properties, including R18.32 and R18.33, are cut. No property-based testing library, no test runner, no automated test suite of any kind. This resolves open decision **O-1** by declining the dependency. The dependency set is exactly: TypeScript, Vite and Three.js. Nothing else.

The cost, stated plainly: the physics invariants Requirement 18 was going to assert — determinism, no tunnelling at maximum launch speed, monotonic speed decay, the rest-debounce behaviour, stroke accounting, and the rest — become verified only by playing the game and by whatever the two Kane CLI flows happen to exercise along their single path. `REST_SPEED_THRESHOLD` and `FRICTION_PER_STEP` are the two hardest numbers in the project to get right, and nothing automated will catch a regression in either of them. See [Left Unverified](#left-unverified) for the full exposure in one place.

R17.10's clause requiring the single command to run "the full declared test suite" is void as a consequence. The command compiles and type-checks; there is no suite for it to run.

### 2. R2.14 — load-time reachability validation

Cut. R2.14 requires validating each Hole against the *shortest obstacle-free path* from the spawn point. That is a pathfinding computation, not a distance check, and it is expensive to write correctly against arbitrary axis-aligned rectangle layouts.

Kept instead, as cheap load-time validations in task 4:

- spawn point and Hole lie inside the Playfield with at least `BALL_RADIUS` clearance from every wall and every static obstacle (R2.15),
- every wall and every obstacle has a shorter side of at least `MIN_WALL_THICKNESS` (R2.13).

R2.20's Moving_Obstacle Hole-clearance validation was on this keep-list and falls away with the Moving_Obstacle cut (item 11); Arena 5's path is declared as data and validated by nothing.

Reachability is instead confirmed by hand while tuning, for Arenas 1 and 2 only. Task 14 carries that as its stated acceptance condition.

### 3. R2.17 — corridor clear-width validation

Cut, following from the same reasoning as R2.14 and from the keep-list above. The narrowest-clear-width computation and the Moving_Obstacle gap-on-path check are sweeps over the layout, not comparisons. Its only subject was Arena 3's corridor, and Arena 3 is itself descoped under item 10, so in the delivered scope this cut has no remaining consequence: `MIN_CORRIDOR_WIDTH` constrains no Arena that gets built. Retained here as the record of why the validation was not written, should Arena 3 ever be reinstated.

### 4. R4.25 — build-time numeric-literal gate

Cut. Failing the build on a stray physics literal outside the Constants_Module needs a lint rule, and a linter is a gated dependency the owner has ruled out (R17.6, O-2). The *enforcement* is cut; R4.18's single-declaration-site discipline is kept as a convention that every task below follows. Nothing mechanical will catch a violation.

### 5. R16 Asset_Registry — simplified, not cut

A keyed registry with per-key drawn size, anchor point, colour palette value and load-failure fallback is over-built for two days. Reduced to a single module of named colour and size constants that the Renderer reads by key (task 8), plus `docs/asset-requests.md` created in the first increment (task 2).

What that drops: asset *file* references and the one-line binding promise (R16.1, R16.3), the anchor-point pairing (R16.9), and the load-failure fallback with its anomaly entry (R16.10). Because R16.10's anomaly path no longer exists, R15.35's exemption for asset-load anomalies is moot — every anomaly a flow observes is fatal.

### 6. Colyseus, the Game_Server and all networking — Requirement 10 in full except R10.9 and R10.15

Cut. **The owner's reason applies to this entry and to items 7 through 11 alike: the deliverable being judged is the closed verification loop, and none of them contributes to it.** No room, no room code, no join, no authoritative state, no shot-request pipeline, no broadcast launch vector, no client adoption, no divergence or synchronisation anomalies. R17.4 goes with it and the dependency set becomes exactly TypeScript, Vite and Three.js. `ALLOW_SINGLE_OCCUPANT_START` (R4.20) and `START_AT_ARENA` (R1.22, R1.23, R15.20) go with it too.

Consequence: `shoot(angle, power)` imparts velocity locally and permanently (task 6), the launch vector is derived client-side from R4.5 so D-10's two-runtime trigonometric problem does not arise, and the Arena-entry affordance `START_AT_ARENA` provided is replaced by the local start-arena selector of R1.25 and R1.26 — the one piece of verification affordance the cut left the project genuinely needing, recorded as D-19.

### 7. Turn enforcement and `NOT_YOUR_TURN` — Requirement 11 in full

Cut, for the reason in item 6. With one Player there is no turn to enforce; R15.18's two-Game_Client turn-enforcement flow is cut with it, as is R15.11.

Consequence: `NOT_YOUR_TURN` stays in the frozen R8.11 rejection set and the frozen `overlay-last-rejection` set and becomes unreachable. That field is still exercised through `BALL_NOT_AT_REST` and `INVALID_SHOT_ARGUMENT`, so it is not dead.

### 8. Disconnect handling, DNF and `VOID` — Requirement 12 in full

Cut, for the reason in item 6. No liveness detection, no participation transition, no notice, no in-flight completion, no void-match path. `DISCONNECT_DETECTION_SECONDS` and `DISCONNECT_NOTICE_SECONDS` remain declared constants with no consumer.

Consequence: `DISCONNECTED` is reachable only as the frozen value `overlay-p2-participation` holds under R9.28, and `DNF` and `VOID` become unreachable while staying in their frozen sets.

### 9. Cross-Course scoring and win determination — R13.6, R13.7, R13.8, R13.9, R13.13, R13.14

Cut, for the reason in item 6. No winner determination among Players, no DNF exclusion, no tiebreak, no void retention. What survives and is built: per-Shot stroke increment (R13.1), out-of-bounds stroke retention (R13.2), per-Arena retention and running totals across completed Arenas (R13.3, R13.4), the `MAX_STROKES_PER_ARENA` cap (R13.5), Par display (R13.11, R13.12), and the hole-out latch (R13.15, R13.16). The Arena 1 to Arena 2 advance and the two-Arena total are local and are built in task 13; R1.24 sets the result to `P1` on the Arena 2 hole-out so `MATCH_COMPLETE` and `P1` stay assertable.

Consequence: `TIE` and `VOID` stay in the frozen `overlay-result` set and become unreachable; the only reachable result is `P1`.

### 10. Arenas 3, 4 and 5 — R2.9, R2.10, R2.11, R2.17, R2.20 and the Arena 3, 4 and 5 clauses of R2.6, R2.12, R2.13 and R2.15

Cut, for the reason in item 6. The Course is Arenas 1 and 2. All five Arenas stay declared as data per R2.2, so the registry shape and the load-time validations are exercised over the full set; only Arenas 1 and 2 are playable and only they have flows. The Verification_Harness inventory is two flows (R15.12).

Consequence: R2.19's open Playfield edge had to move from Arena 4 to Arena 2, or `OUT_OF_BOUNDS` would have gone dead in the delivered scope. That is D-18, and task 13 builds it.

### 11. The Moving_Obstacle — R3.9, R3.10, R3.11, R3.14 operation 1, R6.11, R14.13 and R2.20

Cut, for the reason in item 6. Arena 5's declared path stays as data and nothing advances it, nothing collides with it, nothing draws it and nothing validates it.

Consequence: the two `BALL_AT_REST` outward edges in R5.16 — displacement into the Hole and across an open edge — become unreachable, and `BALL_AT_REST` is therefore strictly more deterministic than the full design, which is the one thing every flow depends on.

**The frozen-contract consequence common to items 6 through 11.** The overlay values `P2`, `TIE`, `VOID`, `DNF`, `NOT_YOUR_TURN`, `MATCH_NOT_STARTED` and `ARENA_ADVANCE_IN_PROGRESS` remain in the frozen contract of Requirement 9 and R8.11 and become unreachable in the delivered scope. Nothing is removed from any value set, because R9.16 freezes those sets for the lifetime of the project. Every declared field identifier stays present in the DOM and holds a fixed member of its declared value set per R9.28 — `overlay-active-player` reads `P1`, the `P2` stroke and total fields read 0, `overlay-p1-participation` reads `CONNECTED`, `overlay-p2-participation` reads `DISCONNECTED`, both completion fields read `NONE`, and `overlay-p2-hole-out` reads `NOT_HOLED_OUT` — so both flows still pass their R15.26 presence and set-membership assertions on every read.

### 12. Assumption A-1 — tested and rejected, so the pre-flight is a recorded result rather than a gate

A-1 assumed one Kane CLI agent step could dispatch a batched key sequence. It was tested against Kane CLI 0.8.4 and rejected: one keypress per step, with a full agent round trip between each. The full record, including both runs and the raw transcripts, is `verification/probe/A1-FINDING.md`, and `requirements.md` carries it under Resolved Assumptions.

The resolution was **the absolute input path, not coarser control grids.** `ANGLE_STEP_DEGREES` stays 5 and `POWER_STEP_PERCENT` stays 5; coarsening was rejected because R15.15 forbids compromising the difficulty curve to fit the harness, and the absolute path makes a Shot cost a fixed number of Agent_Steps at any grid resolution, so coarsening buys nothing.

Consequence for this plan: task 1 is no longer a gate to run and has no stop rule. It is a five-minute read to confirm the answer before task 9 builds it. What the finding cost the plan is priced into task 9 (40 to 60 minutes) and task 10 (55 to 60 minutes) rather than into task 1.

---

## Tasks

- [x] 1. Read the recorded A-1 finding and confirm the input path being built
  - Read `verification/probe/A1-FINDING.md`. A-1 is resolved and rejected: one Kane CLI agent step carries one keypress. No probe is run and there is no gate here.
  - Confirm, before task 9 starts, that the answer being built is the absolute input path of R7.19 through R7.26 — two DOM number inputs plus document-level capture-phase key interception — and that the control grids are **not** coarsened. `ANGLE_STEP_DEGREES` stays 5, `POWER_STEP_PERCENT` stays 5.
  - Acceptance: the finding has been read and the absolute input path is confirmed as the design task 9 implements.
  - Estimate: **5 min**
  - _Requirements: R7.19–R7.26, R15.16, R15.22, R15.23, R4.13, R7.15, R7.16_

- [x] 2. Project scaffold, TypeScript configuration, single build command
  - Create the repository layout: `client/` for the Vite application and `shared/` for the Physics_Engine, Constants_Module, Arena_Registry and geometry module. No `server/`; there is no server. `verification/flows/` created empty.
  - One shared base `tsconfig` with `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` enabled, which `client/` does not override.
  - One command that type-checks `client/` and `shared/` and produces no output on a type error. R17.10's test-suite clause is void; see Descoped item 1.
  - Create `docs/asset-requests.md` in this increment with its header and the `REQUESTED`/`SUPPLIED` status convention, so later tasks only append.
  - Acceptance: the single command runs clean on an empty-but-compiling tree, and `docs/asset-requests.md` exists.
  - Estimate: **45 min**
  - _Requirements: R17.1, R17.2, R17.6, R17.7, R17.8, R17.10, R16.6_

- [x] 3. Constants_Module
  - Declare every value in Requirement 4 as a read-only binding in one module under `shared/`. Derive `FIXED_STEP_SECONDS` from `SIMULATION_HZ` and derive `MAX_CARRY_DISTANCE` by running the R3.14 per-step decay-then-displace loop at `POWER_MAX_PERCENT` until speed falls below `REST_SPEED_THRESHOLD`; neither is a literal.
  - Assert the R4.33 ordering relation at load time. Import nothing from Three.js and reference no browser-only interface.
  - Acceptance: every constant in Requirement 4 resolves, `MAX_CARRY_DISTANCE` lands near 877 world units, and the module loads under both Node and the browser.
  - **Measured:** `MAX_CARRY_DISTANCE` derived as **870.0997717136366**, identical under Node and in the browser. The 877 estimate came from the continuous approximation `v0 / 0.9`; under R3.14's declared decay-then-displace order the series asymptote is `(v0 × FIXED_STEP_SECONDS) × FRICTION_PER_STEP / (1 − FRICTION_PER_STEP)` = 875.56, so 877 is not reachable by this derivation at any cutoff and the estimate, not the code, was wrong. 870.1 is 0.8 percent below the estimate and is the correct value for the declared step order.
  - Estimate: **30 min**
  - _Requirements: R4.1–R4.19, R4.21–R4.24, R4.26–R4.33, R17.9_

- [x] 4. Geometry module and Arena_Registry — all five Arenas as data
  - Write the shared geometry module: point-in-rectangle, circle-to-axis-aligned-rectangle distance and overlap, segment-to-point distance. It declares no physics or tuning value and is the single source of the math both Arena validation and the Physics_Engine consume.
  - Declare all five Arenas: number, walls, obstacles, spawn point, Hole position, Par (2, 3, 3, 4, 4), and per-edge wall flags with **Arena 2 carrying the single open edge** per the revised R2.19 and D-18, every other edge of every Arena walled. Arena 5's Moving_Obstacle path is declared as data only and nothing consumes it. Declared from this increment regardless of which Arenas are playable, per R2.2.
  - Implement the kept load-time validations only: R2.15 clearance from walls and static obstacles, R2.13 minimum thickness. Each raises a load-time error naming the failing Arena and the failed validation before anything renders. R2.14, R2.17 and R2.20 are descoped.
  - Acceptance: all five Arena definitions load without error, and deliberately corrupting one spawn point raises a named load-time error.
  - Estimate: **60 min**
  - _Requirements: R2.1–R2.8, R2.12, R2.13, R2.15, R2.16, R2.18, R2.19, R6.6_

- [ ] 5. Physics_Engine
  - [ ] 5.1 Step order, integration, friction, and contact resolution
    - Implement `step()` advancing exactly one Simulation_Step in the R3.14 operation order, operation 1 omitted with the Moving_Obstacle. Multiply velocity by `FRICTION_PER_STEP` once before integration, displace by the post-friction velocity times `FIXED_STEP_SECONDS`, then resolve contact by testing centre-to-surface distance against `BALL_RADIUS` at the integrated position — one test per step, no sub-stepping and no swept test for surfaces.
    - Reflect the perpendicular component with `WALL_RESTITUTION`, preserve the parallel component, depenetrate along the outward normal to within `MAX_PENETRATION_TOLERANCE`. Handle multi-surface overlap in Arena_Registry declaration order, skipping surfaces the velocity points away from. Implement the R3.16 residual-overlap bail-out.
    - Advance only by a caller-supplied step count and read no wall-clock time source. Import neither Three.js nor any transport library.
    - Acceptance: a Ball fired into a walled corner reflects twice and its overlap after every step stays within `MAX_PENETRATION_TOLERANCE`.
    - Estimate: **75 min**
    - _Requirements: R3.1, R3.4–R3.8, R3.12, R3.13, R3.14 (operations 2–4), R3.15, R3.16, R6.7, R6.8, R17.5, R17.9_
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
  - `shoot` imparts velocity **locally and permanently**, derived from the R4.5 power-to-launch-speed mapping. There is no Game_Server, so there is no request pipeline, no broadcast vector to await and no later conversion; D-10's two-runtime trigonometric problem does not arise because only one runtime evaluates the angle.
  - Acceptance: `shoot` is the only writer of Ball velocity outside the engine, and a non-finite argument leaves every piece of state unchanged.
  - Estimate: **20 min**
  - _Requirements: R8.1, R8.2, R8.5, R8.6, R8.8, R8.9, R8.11, R6.9, R4.5_

- [ ] 7. Fixed-step clock separated from the render callback
  - Drive Simulation_Steps from a time source that is not the frame callback, accumulate elapsed time, execute whole steps up to `MAX_CATCHUP_STEPS_PER_FRAME` per pass, retain only the sub-step remainder, and discard the excess rather than carrying it forward. Record the R3.18 discard anomaly.
  - Acceptance: step count per wall-clock second holds at `SIMULATION_HZ` independently of the render rate, and a long stall discards rather than replays.
  - Estimate: **30 min**
  - _Requirements: R3.2, R3.3, R3.17, R3.18, R14.9_

- [ ] 8. Renderer and the visual constants module
  - Three.js orthographic camera, single plane, framed so the whole Playfield is visible at equal world units per pixel on both axes with surplus viewport area falling outside the Playfield bounds. Draw Playfield bounds, walls, obstacles, Hole, the Ball, the outside-Playfield area, the aim indicator at `AIM_INDICATOR_MIN_LENGTH` or longer, the power indicator with strictly increasing extent, and the current Arena's Par. All geometry derived from the Arena_Registry with no inline literal.
  - Create the simplified visual constants module: named colour and size constants read by key, per the R16 simplification. Append the corresponding entries to `docs/asset-requests.md` before recording this task complete.
  - Draw at the most recently completed Simulation_Step with no interpolation and no extrapolation; hold a stopped Ball's drawn position until the next shot.
  - Acceptance: Arena 1 draws correctly at two different window sizes with the aim and power indicators tracking their values.
  - Estimate: **60 min**
  - _Requirements: R14.1–R14.6, R14.8–R14.12, R2.3, R13.11, R16.2, R16.4, R16.5, R16.8_

- [ ] 9. Input_Controller — keyboard only, relative stepping and the absolute path
  - **Relative path.** Left and right arrows step the aim angle by `ANGLE_STEP_DEGREES` per press including auto-repeat, wrapping into 0 up to 360 and staying on the grid. Up and down step power by `POWER_STEP_PERCENT`, clamping at both ends with no rejection and staying on the 19-value grid. Space invokes `shoot(angle, power)` with the values the overlay currently exposes, irrespective of the Status_Token. Accept adjustment while the Ball is moving.
  - **Absolute path.** Two DOM number inputs outside the canvas, `overlay-aim-input` and `overlay-power-input`, each carrying that identifier as its `data-testid`. A value written to either by any means snaps in the Input_Controller — aim to the nearest whole multiple of `ANGLE_STEP_DEGREES` wrapped into 0 up to 360, power to the nearest member of the power grid clamped into range — so the absolute path cannot reach a value the relative path cannot, and R8.5's prohibition on rounding inside `shoot` stays uncontradicted. An empty, non-numeric or non-finite write leaves the held value alone and restores the field's displayed text. Enter commits the focused field and fires nothing. Neither input takes focus implicitly and neither is autofocused.
  - **Capture-phase interception.** Intercept every ArrowLeft, ArrowRight, ArrowUp, ArrowDown, space and Enter keydown in a document-level listener registered in the **capture phase**, suppressing the default behaviour whatever holds focus, which also covers the R7.13 scroll suppression. Capture-phase interception rather than focus avoidance because a browser driver filling a field will focus it and the game cannot control that: a focused number input would otherwise drive its own spinner from ArrowUp and ArrowDown, swallow the space key, and submit an enclosing form on Enter, so preventing focus is a request the driver is free to ignore while capture-phase interception makes focus irrelevant.
  - Keep the aim angle and the power value identical in the read-only overlay field and the number input by every path.
  - Acceptance: an agent that loads the page and immediately presses keys, without clicking anything, moves the aim indicator; and writing 135 into `overlay-aim-input` while it holds focus sets the aim to 135 and leaves ArrowUp still stepping power.
  - Estimate: **60 min**
  - _Requirements: R7.1–R7.8, R7.11–R7.26, R8.2_

- [ ] 10. Debug_Overlay — the frozen DOM contract
  - Render the overlay as DOM outside the canvas, present from the first frame in every Match phase with no query parameter or keypress required. Expose every field Requirement 9 declares, each carrying its declared `data-testid`, each rendered as bare trimmed text with no label, unit or punctuation: arena, active player, per-Player strokes, totals, aim angle, power, status, match phase, participation, completion, hole-out, last rejection, anomaly count, result, and the per-Arena stroke fields.
  - Derive status, aim and power from local state. **Every field whose live source is descoped holds a fixed member of its declared value set for the lifetime of the Match, per R9.28** — `overlay-active-player` reads `P1`, `overlay-p2-strokes` and `overlay-p2-total` read 0, `overlay-p1-participation` reads `CONNECTED`, `overlay-p2-participation` reads `DISCONNECTED`, both completion fields read `NONE`, `overlay-p2-hole-out` reads `NOT_HOLED_OUT` — so a flow reading the overlay can never fail on an out-of-set value or an absent identifier.
  - Add the two number inputs of task 9 to the overlay as part of the frozen contract per R9.26, rendering the current aim angle as the value of `overlay-aim-input` and the current power value as the value of `overlay-power-input`, each a decimal integer with no unit symbol, per R9.27.
  - Update a field within one rendered frame of its source changing and before the Status_Token next reads `BALL_AT_REST`.
  - Acceptance: every declared `data-testid` is present and non-empty on first paint, every enumerated field holds a member of its declared set, and both number inputs read back the values the read-only fields show.
  - Estimate: **60 min**
  - _Requirements: R9.1–R9.16, R9.19–R9.28, R10.9, R10.15, R5.1, R5.2, R5.3_

- [ ] 11. Local Arena 1 loop — Status_Token state machine, shot accounting, start-arena selector
  - Implement the Status_Token machine over the R5.16 edges reachable in the delivered scope, with `BALL_AT_REST` held before any shot, `BALL_MOVING` on launch, and the three terminal values. Reject a shot while the token is not `BALL_AT_REST` with `BALL_NOT_AT_REST`.
  - Count one stroke per fired shot locally, latch the per-Player hole-out field to `HOLED_OUT_BY_CAPTURE` or `HOLED_OUT_BY_STROKE_CAP` and hold it, cap at `MAX_STROKES_PER_ARENA`, and reset aim and power to their defaults when a shot completes and when a turn begins.
  - Implement the **local start-arena selector** of R1.25 and R1.26: a Game_Client load-time selector naming Arena N begins the Match at Arena N with the Ball at that Arena's declared spawn point, every per-Arena stroke count and every running total at zero, and the phase at `IN_PROGRESS`, altering no Arena geometry, no Par value and no Constants_Module value. A value outside the implemented set falls back to Arena 1 and records an anomaly naming the refused value. It is permanent, not scaffolding; it is what makes the Arena 2 flow of task 13 possible at all.
  - Wire the clock, engine, shot controller, input controller, renderer and overlay into one running client for Arena 1 with a single local Player.
  - Acceptance: keyboard alone drives aim, power, fire, roll, stop and hole-out in Arena 1, every one of those transitions is readable from the overlay DOM, and loading with the selector set to 2 starts in Arena 2 while a nonsense value starts in Arena 1 with the anomaly count at 1.
  - Estimate: **45 min**
  - _Requirements: R1.4, R1.25, R1.26, R5.4, R5.5, R5.7, R5.9, R5.10, R5.12–R5.17, R6.3, R6.10, R7.9, R7.10, R13.1, R13.2, R13.5, R13.15, R13.16, R9.14_

**◄── MILESTONE 1: agent-drivable Arena 1 reached here**

- [ ] 12. First Kane CLI flow — Arena 1 solo, and the defect log
  - Build the harness conventions under `verification/flows/`, one flow per file, and write the Arena 1 flow: fresh browser instance per run, browsing context kept visible, keyboard input only, state read only from overlay text content with no page script evaluated. It drives the standalone client permanently — there is no server to re-point it at later.
  - **Step accounting.** A Shot costs three dispatched Agent_Steps — set the aim in `overlay-aim-input`, set the power in `overlay-power-input`, press space to fire — plus one bounded poll of the Status_Token at `STATUS_POLL_INTERVAL_MILLISECONDS` up to `STATUS_POLL_TIMEOUT_SECONDS`, which is one further Agent_Step. Four per Shot. With one navigation and one final read, a Par 2 clear of Arena 1 costs **10 of the 15 available**, leaving room for exactly one extra Shot. Count every dispatched step, reads included.
  - Pass when the flow's Player's hole-out field reads `HOLED_OUT_BY_CAPTURE` within budget and within `MAX_STROKES_PER_ARENA`. Fail on budget exhaustion, a stroke-cap hole-out, a poll timeout, an out-of-set field value, an absent declared field identifier for the current phase, or a non-zero anomaly count. On a non-environment failure, append a replayable entry to `verification/defects.md`, recording the start-arena selector value, the step sequence and every shot's aim and power.
  - Create `verification/defects.md` in this increment, with its entry template and the classification rule that separates a game defect from a harness or environment failure.
  - Acceptance: the Arena 1 flow runs unattended inside 15 Agent_Steps, reports pass or fail with a classification, and files a replayable entry on failure.
  - Estimate: **45 min**
  - _Requirements: R15.1–R15.4, R15.6–R15.9, R15.12–R15.14, R15.16, R15.17, R15.21–R15.29, R15.31–R15.34_

- [ ] 13. Arena 2 playable and verified — bank shots, the open edge, Match completion
  - Tune the Arena 2 wall so the Hole is unreachable in a straight line and reachable off at least one reflection, then write the Arena 2 flow against it. Confirm `WALL_RESTITUTION` produces a bank shot that holes out inside the step budget. The flow selects Arena 2 through the start-arena selector of R1.25, which is permanent; nothing here is temporary scaffolding.
  - **Arena 2 carries the single open Playfield edge**, per the revised R2.19 and D-18. This is what makes `OUT_OF_BOUNDS` reachable through play at all in the delivered scope: with Arenas 3, 4 and 5 cut and Arena 1 fully walled, there is no other Arena left to carry it, and the frozen Status_Token value would otherwise go dead. Punishing an over-hit suits the Arena 2 lesson rather than fighting it.
  - Local Arena advance and totals: on the Arena 1 hole-out, advance to Arena 2 as one state update, place the Ball at Arena 2's spawn point, zero Arena 2's strokes, clear hole-out, reset aim and power, and add Arena 1's strokes to the running total, retaining the per-Arena value addressed by Arena number. On the Arena 2 hole-out set the phase to `MATCH_COMPLETE` and the result to `P1` per R1.24, and expose every per-Arena stroke field with 0 for the Arenas not played.
  - **Budget, stated plainly: the Arena 2 flow fits only on a Par run and has no retry headroom.** Par 3 is three Shots at four Agent_Steps each plus one navigation and one final read, which is 14 of 15. One extra Shot takes it to 18 and fails the flow on budget exhaustion under R15.9 rather than on any game defect. This is O-5, accepted by the owner, and the response is never an easier Arena.
  - Acceptance: the Arena 2 flow passes with a shot whose path reflects at least once before capture; and an over-powered bank shot across the open edge produces `OUT_OF_BOUNDS` and resets the Ball to its pre-shot position rather than to the spawn point.
  - Estimate: **50 min**
  - _Requirements: R2.8, R2.19, R3.6, R4.7, R6.4, R6.5, R6.6, R6.8, R1.6, R1.7, R1.16, R1.24, R13.3, R13.4, R13.10, R13.17, R9.17, R9.19, R15.12, R15.13_

- [ ] 14. Physics tuning and two-arena playtest
  - Play Arenas 1 and 2 by hand and tune `FRICTION_PER_STEP`, `REST_SPEED_THRESHOLD`, `REST_DEBOUNCE_STEPS`, `HOLE_CAPTURE_MAX_SPEED` and `WALL_RESTITUTION` for a decisive stop and a fair capture. Both Arenas share one constant set; per-Arena tuning is forbidden.
  - **This task carries the reachability hand-check that R2.14 and R2.17 were going to validate at load time, now for Arenas 1 and 2 only.** Confirm by hand, per Arena, that the Hole is reachable within Par plus one shots from the spawn point using only grid angles and grid power values. Record the witness shot sequence per Arena in `verification/defects.md` alongside the flow entries, so a later regression has something to compare against. R2.17's corridor check has no subject in the delivered scope; Arena 3 is descoped.
  - Re-run both flows after the final constant change and record the results. Confirm a full two-Arena run reaches `MATCH_COMPLETE` with the result reading `P1` and every visual resolved to its constant-driven placeholder.
  - Acceptance: both flows pass on the final constant set, and each of Arenas 1 and 2 has a recorded witness sequence within Par plus one.
  - Estimate: **40 min**
  - _Requirements: R4.6–R4.10, R4.17, R2.14 (by hand), R15.30, R16.7_

---

## Notes

- There are no optional tasks and no cut line. Every task above is required. Total **11h 10m** against a 16h budget, **4h 50m of slack**.
- `shared/` holds the Physics_Engine, Constants_Module, Arena_Registry and geometry module as exactly one copy each, importing neither Three.js nor any transport library and touching no browser-only interface. Nothing but the client consumes them now, but R17.9 still holds and task 3 and task 5.1 both depend on it — it is what keeps the physics loadable outside a browser if a regression ever needs reproducing in Node.
- `docs/asset-requests.md` exists from task 2. `verification/defects.md` exists from task 12.
- Every task follows R4.18's single-declaration-site discipline as a convention. Nothing enforces it; see Descoped item 4.
- Task 1 is a read, not a gate. Its finding is already recorded in `verification/probe/A1-FINDING.md` and folded into `requirements.md`.

---

## Left Unverified

Dropping Requirement 18 removes every automated check from the project. This is the exposure in one place. Each item below was going to be asserted by a property or a test and is now confirmed only by playing the game and by whatever the two Kane CLI flows happen to touch along their single path.

**Physics, and this is where the real risk sits**

- Determinism across repeated runs from an identical initial state and an identical launch velocity vector (R18.11). Nothing checks it; a divergence shows up only as odd behaviour a human happens to notice.
- No tunnelling, including at `MAX_LAUNCH_SPEED` against a wall of `MIN_WALL_THICKNESS` at every grid angle (R18.9, R18.10). The Q-17 margin is about 3x on paper and untested in fact.
- Monotonic speed decay and no energy gain on contact (R18.6, R18.7).
- Containment inside a fully walled Arena at every step (R18.8). Arena 1 is the only fully walled Arena left, so this is now a one-Arena exposure.
- Rest-debounce behaviour, including the no-premature-rest case where speed dips below threshold for fewer than `REST_DEBOUNCE_STEPS` and then recovers (R18.4, R18.5). This one was to be driven by generated velocity sequences straight into the engine, which no amount of playing reproduces reliably.
- Termination within `MAX_SHOT_DURATION_SECONDS` for every grid angle, grid power and legal start position (R18.2).
- Carry bound and agreement between the derived `MAX_CARRY_DISTANCE` and the Carry_Distance the engine actually produces (R18.14, R18.47).
- Capture threshold behaviour for a fast Ball crossing the Hole (R18.44) and out-of-bounds reset legality (R18.45).
- Frame-rate independence across arbitrary step batchings (R18.12).

**`REST_SPEED_THRESHOLD` and `FRICTION_PER_STEP` are the two hardest numbers in the project to get right, and nothing automated will catch a regression in either of them.** They are tuned by feel in task 14 and then frozen by hope. `BALL_AT_REST` timing falls directly out of the pair, and `BALL_AT_REST` is the token both flows poll on and the token every Shot's precondition reads. A later change to either number can therefore break the harness rather than the game, and it will present as a flaky flow — an intermittent poll timeout or a Shot rejected with `BALL_NOT_AT_REST` — rather than as a physics bug. That is the single worst failure mode this project can have, because it makes the deliverable look broken for a reason that has nothing to do with the deliverable. The mitigation is entirely procedural: change neither constant after task 14 without re-running both flows by hand.

**Protocol and accounting**

- Status_Token value set and transition-edge legality (R18.1, R18.3), now over a smaller edge set: the two Moving_Obstacle edges and the rejection edge of R5.16 are unreachable.
- Stroke accounting: the accounting identity, unit cost, monotonicity, frozen scores after hole-out, the `MAX_STROKES_PER_ARENA` bound, and advance accounting (R18.21 through R18.27, R18.46), scoped to one Player over two Arenas.
- Overlay contract completeness — that the exposed identifier set exactly equals the declared set for the current phase, with nothing absent and nothing extra (R18.43), and the overlay round trip (R18.31).
- Arena round-trip equivalence between declared and exposed definitions (R18.30).

**What left this list, and why it is gone rather than merely deleted**

Four items that stood here before the scope cut are gone because the behaviour they guarded is no longer built, not because the risk was accepted:

- **Turn exclusivity and rejection side-effect freedom** (R18.16 through R18.19). Requirement 11 is descoped and there is one Player, so there is no turn to hold exclusively and no `NOT_YOUR_TURN` path to leave side-effect-free.
- **The no-stall property after a disconnect** (R18.20). Requirement 12 is descoped; nothing detects a disconnect and nothing transfers a designation, so there is no stall to prove absent.
- **DNF and void preservation** (R18.36, and the R13.14 retention it drew on). No DNF marker is ever set and no `VOID` result is ever recorded.
- **Cross-runtime determinism** (the two-runtime half of R18.11). There is no second runtime. One process derives the launch vector once from R4.5, so D-10's trigonometric drift problem does not exist to be verified. This is the one item the cut genuinely removed risk from rather than removing coverage.

The rejection-precedence and join-reason properties (R18.41, R18.42) leave for the same reason: R11.9's precedence order and the whole join and room-creation reason set have no code behind them.

**What partially survives, and why it is not a substitute**

Both flows assert on every read that each declared field identifier is present and each enumerated value is in its set (R15.26), and they fail on any non-zero anomaly count (R15.17, R15.32). That catches a contract break and catches overlap, discard and duration anomalies — but only along the one path each flow walks, only for Arenas 1 and 2, and only for the inputs those flows happen to use. **With two flows rather than six, that incidental coverage is narrower still.** The four flows that are gone were the ones that would have exercised the corridor, the approach angle, the Moving_Obstacle timing and the turn boundary — which is to say most of the geometry and most of the state machine. What remains is one straight-line Shot and one bank shot. It is incidental coverage, not a regression suite, and it is thinner incidental coverage than the previous plan had.

**The consequence to plan around:** after task 14 there is no safety net. Any change to physics, the overlay contract, or stroke accounting is unverified until someone replays both flows by hand, and a regression in a tuning constant may not surface at all.

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
    { "id": 12, "tasks": ["14"] }
  ]
}
```
