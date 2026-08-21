# Requirements Document

## Introduction

Stickman Golf 2D is a browser-based, turn-based, two-player online mini-golf game. Two players connect to a shared match through a room code, alternate shots within an arena, and progress through a fixed course of five arenas of rising difficulty. Strokes are counted per player per arena and accumulated across the course; the lowest total wins.

The game is rendered in 2D through Three.js using an orthographic camera in a single plane. Physics is written directly — velocity integration, multiplicative friction decay, wall reflection, and a radius check against the hole — on a fixed 60-step-per-second simulation clock. No physics library is used.

The strategic purpose of this project is verification, not the game itself. The deliverable is a closed loop in which an external AI browser agent (Kane CLI) plays the game through keyboard input alone, reads game state through a DOM-based Debug Overlay, discovers real defects, and feeds those failures back into fixes. A canvas is opaque to selector-based tooling, so the Debug Overlay is the formal, frozen contract between the game and any external verifier. The Debug Overlay and the Verification Harness are first-class product surfaces, not test scaffolding.

A server configuration flag lets a room holding a single occupant start and play the Course to completion. Verification therefore drives the real game rather than a parallel practice mode that could drift from it, and turn enforcement is verified separately by a dedicated two-client flow.

Difficulty is expressed entirely through arena geometry and layout. Physics constants are identical across all five arenas so that skill transfers between them and the difficulty curve carries meaning.

### How to read this document

- Each requirement follows exactly one EARS pattern.
- Every question previously open has been answered. The decisions and, where given, the reasoning behind them are recorded in [Resolved Decisions](#resolved-decisions).
- Requirements tagged **⚠ ASSUMPTION A-1 (UNVERIFIED)** rest on one assumption that is empirical rather than a design choice: that one Kane CLI agent step can dispatch a batched key sequence. The assumption is recorded in [Unverified Assumptions](#unverified-assumptions) together with its fallback direction. The tag marks the blast radius, so that if the assumption proves false the affected criteria are already enumerated.
- Requirement 18 collects correctness properties suitable for property-based testing.

---

## Glossary

**Agent_Step** — One action dispatched by the Verification_Harness to the browser. Assumed to carry a batched key sequence rather than a single keypress. See [Unverified Assumptions](#unverified-assumptions).

**ALLOW_SINGLE_OCCUPANT_START** — The Game_Server configuration flag that permits a room holding one Player to start the Match and play the Course to completion. Disabled by default; enabled by the Verification_Harness.

**Arena** — One of five fixed playfield layouts in the course, identified by an integer 1 through 5.

**Arena_Registry** — The single data module that declares geometry, spawn point, hole position, par, obstacle configuration, and per-edge wall flags for all five Arenas. Contains data and validation only, no rendering or simulation logic.

**Active_Player** — The Player whose turn it currently is, and the only Player permitted to fire a Shot.

**Asset_Key** — The unique identifier under which the Asset_Registry exposes one visual asset file reference or one colour palette value, together with that item's declared drawn size in world units and anchor point.

**Asset_Registry** — The single constants module holding every visual asset reference, so that replacing a procedural placeholder with a supplied file is a single-line change.

**Ball** — A simulated circle of radius `BALL_RADIUS` owned by exactly one Player and persisting for the duration of one Arena.

**Carry_Distance** — The total distance a Ball travels along an unobstructed straight line from launch until the Physics_Engine declares it at rest.

**Collision_Surface** — Any Arena wall surface, any static obstacle surface, any Moving_Obstacle surface, or any Playfield edge the Arena_Registry declares walled.

**Constants_Module** — The single module holding every physics, world-scale, and tuning number. No physics number appears inline anywhere else in the codebase.

**Course** — The ordered sequence of Arenas 1 through 5 played in a single Match.

**Debug_Overlay** — A DOM element tree, rendered outside the rendering canvas, that exposes game state as plain text. The formal verification contract.

**DNF** — Did Not Finish. The terminal marker applied to a Player who disconnects before the Match completes.

**Game_Client** — The browser application: Renderer, Input_Controller, local simulation, and Debug_Overlay.

**Game_Server** — The Colyseus room process that owns authoritative game state, enforces turn order, and arbitrates Match lifecycle.

**Hole** — A circular target of radius `HOLE_RADIUS` at a position declared by the Arena_Registry.

**Holed_Out** — The state of a Player who has completed the current Arena, either by Hole capture or by reaching `MAX_STROKES_PER_ARENA`.

**Input_Controller** — The Game_Client component that translates keyboard events into aim, power, and fire intent.

**Match** — One play-through of the Course by one or two Players in a single room.

**Moving_Obstacle** — The obstacle in Arena 5 that translates along a declared path at `MOVING_OBSTACLE_SPEED` and reverses at the path ends.

**Par** — A per-Arena integer expressing the expected stroke count, declared in the Arena_Registry.

**Physics_Engine** — The module that advances Ball and Moving_Obstacle state by exactly one Simulation_Step.

**Playfield** — The rectangular simulation domain, `PLAYFIELD_WIDTH` by `PLAYFIELD_HEIGHT` world units.

**Player** — One of at most two participants in a Match, identified as `P1` or `P2`.

**Renderer** — The Three.js orthographic-camera component that draws Playfield, Arena geometry, Balls, aim indicator, and power indicator.

**Rest_Debounce** — The requirement that Ball speed remain below `REST_SPEED_THRESHOLD` for `REST_DEBOUNCE_STEPS` consecutive Simulation_Steps before rest is declared.

**Score_Keeper** — The Game_Server component that accumulates Strokes per Player per Arena and determines the winner.

**Shot** — One launch of a Ball, produced by exactly one call to `shoot(angle, power)`.

**Shot_Controller** — The single module exposing `shoot(angle, power)`. The only code path that may impart velocity to a Ball.

**Simulation_Step** — One advance of the Physics_Engine by `FIXED_STEP_SECONDS`.

**START_AT_ARENA** — A room creation parameter, permitted only where `ALLOW_SINGLE_OCCUPANT_START` is enabled, that sets the Arena in which a Match begins so that a Verification_Flow can enter its Arena without playing the preceding Arenas.

**Status_Token** — A single string field in the Debug_Overlay whose value is exactly one of `BALL_MOVING`, `BALL_AT_REST`, `IN_HOLE`, `OUT_OF_BOUNDS`. Refers to the Active_Player's Ball.

**Stroke** — One counted attempt. Every Shot costs exactly one Stroke.

**Verification_Harness** — The Kane CLI flow suite that drives the Game_Client through keyboard input and asserts against the Debug_Overlay.

**Verification_Flow** — One Kane CLI scenario, bounded by `AGENT_STEP_BUDGET_PER_FLOW` Agent_Steps. A per-Arena Verification_Flow covers one Player clearing one Arena; the turn-enforcement Verification_Flow of R15.18 covers two Game_Clients instead.

**Void_Match** — A Match in which every Player is marked DNF. Its recorded result is the value `VOID` and no winner is recorded.

---

## Requirements

### Requirement 1: Match Lifecycle and Game Loop

**User Story:** As a player, I want to join a match with a friend and play a five-arena course of alternating shots, so that we can compete on total strokes.

#### Acceptance Criteria

1. WHEN a Player requests a new Match, THE Game_Server SHALL create a room, assign that Player the identity `P1`, and return a room code of exactly `ROOM_CODE_LENGTH` characters drawn from `ROOM_CODE_ALPHABET` that is distinct from the room code of every room the Game_Server currently holds.
2. WHILE the Match phase is `WAITING_FOR_OPPONENT`, WHEN a second Player joins an existing room using a room code identical character for character to that room's room code, THE Game_Server SHALL, in a single state update, assign that Player the identity `P2`, set the current Arena to Arena 1, set each Player's Stroke count for Arena 1 and each Player's running total to zero, and set the Match phase to `IN_PROGRESS`.
3. IF a third Player attempts to join a room that already holds two Players, THEN THE Game_Server SHALL reject the join request and return the reason `ROOM_FULL`.
4. WHEN a Match starts, THE Game_Server SHALL designate `P1` as the Active_Player within the same state update in which the Match phase becomes `IN_PROGRESS`.
5. WHEN the Game_Server's simulation of the Active_Player's Shot reaches a terminal outcome of holed, out of bounds, or at rest, THE Game_Server SHALL transfer the Active_Player designation to the other Player where that Player's participation state is `CONNECTED` and that Player is not Holed_Out for the current Arena, and SHALL otherwise retain the designation.
6. WHILE at least one Player's participation state is `CONNECTED`, WHEN every Player whose participation state is `CONNECTED` has Holed_Out in the current Arena and the current Arena is not Arena 5, THE Game_Server SHALL advance the Match to the next Arena in the Course as a single state update.
7. WHEN the Match advances to a new Arena, THE Game_Server SHALL place each Ball at that Arena's declared spawn point, set each Player's Stroke count for that Arena to zero, and clear the Holed_Out state of every Player whose participation state is `CONNECTED`, and THE Game_Client SHALL set the aim angle to `DEFAULT_AIM_DEGREES` and the power value to `DEFAULT_POWER_PERCENT`.
8. WHEN every Player whose participation state is `CONNECTED` has Holed_Out in Arena 5, THE Game_Server SHALL set the Match phase to `MATCH_COMPLETE`, publish the final result in that same state update, and hold the Active_Player designation at the value it held immediately before that update.
9. THE Game_Server SHALL support at most two Players per Match.
10. WHERE `ALLOW_SINGLE_OCCUPANT_START` is disabled, WHILE the Match phase is `WAITING_FOR_OPPONENT`, THE Game_Server SHALL reject every Shot request, leave every Stroke count and every Ball position and velocity unchanged, and return the reason `MATCH_NOT_STARTED`.
11. WHERE `ALLOW_SINGLE_OCCUPANT_START` is disabled, WHILE the Match phase is `WAITING_FOR_OPPONENT`, THE Game_Client SHALL accept aim and power adjustment input and update the aim indicator and the power indicator.
12. WHEN the room holds no Player whose participation state is `CONNECTED`, THE Game_Server SHALL dispose of the room and release its state with no grace period, and SHALL complete the recording of that Match's result before that disposal.
13. WHILE `P1`'s participation state is `CONNECTED`, WHEN the Match advances to a new Arena, THE Game_Server SHALL designate `P1` as the Active_Player.
14. WHILE `P1`'s participation state is `DISCONNECTED` and `P2`'s participation state is `CONNECTED`, WHEN the Match advances to a new Arena, THE Game_Server SHALL designate `P2` as the Active_Player.
15. WHERE `ALLOW_SINGLE_OCCUPANT_START` is enabled, WHEN a Player requests a new Match, THE Game_Server SHALL, in a single state update, set the current Arena to Arena 1, set that Player's Stroke count for Arena 1 and that Player's running total to zero, set the Match phase to `IN_PROGRESS`, and designate that Player as the Active_Player.
16. WHERE `ALLOW_SINGLE_OCCUPANT_START` is enabled, WHILE exactly one Player is connected, WHEN that Player Holes_Out in the current Arena, THE Game_Server SHALL advance the Match to the next Arena in the Course.
17. IF a Player attempts to join a room whose Match phase is `IN_PROGRESS` or `MATCH_COMPLETE`, THEN THE Game_Server SHALL reject the join request and return the reason `MATCH_ALREADY_STARTED`.
18. WHERE `ALLOW_SINGLE_OCCUPANT_START` is enabled, WHILE exactly one Player is connected, THE Game_Server SHALL run the Match to completion through Arena 5 for that Player.
19. IF a join request carries a room code that matches no room the Game_Server currently holds, or whose length differs from `ROOM_CODE_LENGTH`, or that contains any character outside `ROOM_CODE_ALPHABET`, THEN THE Game_Server SHALL reject the join request, leave every room's state unchanged, and return the reason `ROOM_NOT_FOUND` in precedence over `ROOM_FULL` and `MATCH_ALREADY_STARTED`.
20. WHERE `ALLOW_SINGLE_OCCUPANT_START` is disabled, WHEN a Player requests a new Match, THE Game_Server SHALL set the Match phase to `WAITING_FOR_OPPONENT` within the same state update in which it returns the room code.
21. IF a Shot request arrives after the last Player whose participation state is `CONNECTED` has Holed_Out in the current Arena and before the Arena advance state update has completed, THEN THE Game_Server SHALL reject that Shot request, leave every Stroke count, every Ball position, and the Active_Player designation unchanged, and return the reason `ARENA_ADVANCE_IN_PROGRESS`.
22. WHERE `ALLOW_SINGLE_OCCUPANT_START` is enabled, WHEN a room is created with the room parameter `START_AT_ARENA` set to N, THE Game_Server SHALL set the current Arena to N, place the Ball at Arena N's declared spawn point, set every per-Arena Stroke count and every running total to zero, set the Match phase to `IN_PROGRESS`, and leave Arena N's declared geometry, Arena N's declared Par value, and every Constants_Module value unchanged.
23. IF a room creation request sets `START_AT_ARENA` while `ALLOW_SINGLE_OCCUPANT_START` is disabled, or sets `START_AT_ARENA` to a value outside the range 1 through 5, THEN THE Game_Server SHALL reject that room creation request, create no room, and return the reason `START_AT_ARENA_REFUSED`.

*Criteria 19 through 23 are appended so criteria 1 through 18 keep the numbers cited in Resolved Decisions. They close room-code validity, initial Match phase, Arena-advance atomicity, and the Verification_Harness Arena-entry path. They introduce the reasons `ROOM_NOT_FOUND`, `ARENA_ADVANCE_IN_PROGRESS`, `START_AT_ARENA_REFUSED` and the room parameter `START_AT_ARENA`, all unratified.*

---

### Requirement 2: Arena Data Model

**User Story:** As a developer, I want all five arenas expressed purely as data in one module, so that adding or retuning an arena never requires touching rendering or physics code.

#### Acceptance Criteria

1. THE Arena_Registry SHALL declare, for each of the five Arenas, the Arena number, the wall and obstacle geometry, the Ball spawn point, the Hole position, the Par value, and a per-edge flag stating whether each of the four Playfield edges is walled or open, with every position and every extent expressed in world units, and SHALL declare no collision surface beyond those Playfield edges, those walls, those obstacles, and the Moving_Obstacle.
2. THE Arena_Registry SHALL declare all five Arenas from the first implementation increment, independently of which Arenas are rendered or playable.
3. THE Renderer SHALL derive all drawn Arena geometry from the Arena_Registry and SHALL contain no inline Arena geometry numeric literal.
4. THE Physics_Engine SHALL derive all collision geometry, every Playfield edge wall flag, and the Moving_Obstacle path from the Arena_Registry, and SHALL contain no inline Arena geometry numeric literal.
5. WHEN an Arena definition is added or its values are changed, THE Arena_Registry SHALL be the only module requiring modification.
6. THE Arena_Registry SHALL declare Par values of 2 for Arena 1, 3 for Arena 2, 3 for Arena 3, 4 for Arena 4, and 4 for Arena 5.
7. THE Arena_Registry SHALL declare Arena 1 as open ground with no interior wall and no obstacle, and with an unobstructed straight line between the spawn point and the Hole.
8. THE Arena_Registry SHALL declare Arena 2 with a wall intersecting every straight line between the spawn point and the Hole, such that the Hole is reachable by a Shot whose path reflects off at least one surface before satisfying the Hole capture condition.
9. THE Arena_Registry SHALL declare Arena 3 with a corridor bounded by walls through which the Ball travels to reach the Hole, SHALL declare that corridor's narrowest clear width as at least `MIN_CORRIDOR_WIDTH`, and SHALL declare no unobstructed straight line from the spawn point to the Hole that bypasses that corridor.
10. THE Arena_Registry SHALL declare Arena 4 with a static obstacle positioned between the Hole and the straight line from the spawn point, such that the Hole capture condition is satisfiable from the spawn point by at least two distinct aim angles on the `ANGLE_STEP_DEGREES` grid.
11. THE Arena_Registry SHALL declare Arena 5 with exactly one Moving_Obstacle, SHALL declare that obstacle's path as a straight segment parallel to one Playfield edge, and SHALL declare both path endpoints such that the obstacle lies entirely inside the Playfield at every position along that path.
12. THE Arena_Registry SHALL declare exactly one new mechanical idea per Arena, in the order aiming and power, bank shots, precision, approach angle, timing.
13. THE Arena_Registry SHALL declare every wall, every static obstacle, and the Moving_Obstacle as an axis-aligned rectangle whose edges are parallel to the Playfield edges and whose shorter side measures at least `MIN_WALL_THICKNESS` world units.
14. WHEN the Arena_Registry is loaded, THE Arena_Registry SHALL validate that every declared Hole position lies within `MAX_CARRY_DISTANCE` multiplied by the Arena's Par of shortest obstacle-free path length from that Arena's spawn point, and SHALL raise a load-time error naming the failing Arena and the failed validation, before any Arena is rendered or any Shot is simulated, when that validation fails.
15. WHEN the Arena_Registry is loaded, THE Arena_Registry SHALL validate that every declared spawn point and every declared Hole position lies inside the Playfield with at least `BALL_RADIUS` clearance from every wall, from every static obstacle, and from the Moving_Obstacle at every position along its declared path, and SHALL raise a load-time error naming the failing Arena and the failed validation, before any Arena is rendered or any Shot is simulated, when that validation fails.
16. THE Arena_Registry SHALL express Arena difficulty exclusively through geometry, layout, and obstacle configuration, and SHALL declare no physics, world-scale, or tuning value.
17. WHEN the Arena_Registry is loaded, THE Arena_Registry SHALL validate that the narrowest clear width of every declared corridor is at least `MIN_CORRIDOR_WIDTH` and that at least one position of the Moving_Obstacle along its declared path leaves a clear gap of at least `MIN_CORRIDOR_WIDTH` on a path from the spawn point to the Hole, and SHALL raise a load-time error naming the failing Arena and the failed validation, before any Arena is rendered or any Shot is simulated, when that validation fails.
18. THE Arena_Registry SHALL contain Arena data declarations and load-time validation only, and SHALL import no module other than the Constants_Module and a geometry module that declares no physics, world-scale, or tuning value and that imports neither the Physics_Engine, the Renderer, nor any Game_Server module.
19. THE Arena_Registry SHALL declare exactly one Playfield edge of Arena 4 as open, and SHALL declare every Playfield edge of Arena 1, Arena 2, Arena 3, and Arena 5 as walled.
20. THE Arena_Registry SHALL declare the Moving_Obstacle path such that the Moving_Obstacle clears the Hole position by at least `HOLE_RADIUS` plus twice `BALL_RADIUS` at every position along that path, and SHALL raise a load-time error naming the failing Arena when that validation fails.

*Criteria 17 through 20 are appended so criteria 1 through 16 keep their numbers. Criterion 19 fixes Arena 4 as the Arena satisfying R6.6. Criterion 18 makes criterion 5 mechanically checkable. The geometry module permitted by criterion 18 is the single source of the distance and overlap math that criteria 14, 15 and 17 and the Physics_Engine both consume, so Arena validation and simulation cannot diverge. Criterion 13 fixes axis-aligned rectangles as the only collision primitive. Criterion 20 keeps the Moving_Obstacle from displacing a resting Ball into the Hole, which R6.11 would otherwise treat as a capture the Player did not earn; criterion 20's margin is stated as `HOLE_RADIUS` plus twice `BALL_RADIUS` rather than plus one `BALL_RADIUS` so that it stays independent of `MAX_PENETRATION_TOLERANCE`, which R3.14 operation 1 subtracts from a displaced Ball's clearance and which O-4 leaves open to revision. Criteria 13, 18, 19 and 20 are derived and unratified.*

---

### Requirement 3: Fixed-Step Physics Simulation

**User Story:** As a developer, I want physics driven by a fixed simulation clock, so that a shot behaves identically on a 60Hz and a 144Hz display and the course stays tunable.

#### Acceptance Criteria

1. THE Physics_Engine SHALL advance simulation state in discrete Simulation_Steps of exactly `FIXED_STEP_SECONDS` duration.
2. WHILE the interval between consecutive rendered frames is no greater than `MAX_CATCHUP_STEPS_PER_FRAME` multiplied by `FIXED_STEP_SECONDS`, THE Physics_Engine SHALL advance the simulation at exactly `SIMULATION_HZ` Simulation_Steps per second of wall-clock time, independently of the display refresh rate and independently of the number of frames rendered in that second.
3. WHEN the elapsed wall-clock time since the previous frame exceeds `FIXED_STEP_SECONDS`, THE Game_Client SHALL execute as many whole Simulation_Steps as the accumulated time permits up to a maximum of `MAX_CATCHUP_STEPS_PER_FRAME` Simulation_Steps in that frame, SHALL retain for the following frame only the accumulated time remaining below `FIXED_STEP_SECONDS`, and SHALL discard accumulated time in excess of `MAX_CATCHUP_STEPS_PER_FRAME` multiplied by `FIXED_STEP_SECONDS` rather than carrying it forward.
4. THE Physics_Engine SHALL derive a Ball's displacement on a Simulation_Step from that Ball's velocity after that step's friction multiplication, multiplied by `FIXED_STEP_SECONDS`.
5. WHILE a Ball is in motion, THE Physics_Engine SHALL multiply that Ball's velocity by `FRICTION_PER_STEP` exactly once per Simulation_Step, before that step's position integration.
6. WHEN a Ball in motion overlaps exactly one Collision_Surface on a Simulation_Step, THE Physics_Engine SHALL reflect the component of that Ball's velocity perpendicular to that surface, SHALL multiply that perpendicular component by `WALL_RESTITUTION`, and SHALL preserve the component parallel to that surface unchanged.
7. WHEN a Ball in motion overlaps a Collision_Surface on a Simulation_Step, THE Physics_Engine SHALL displace that Ball along that surface's outward normal, on the approach side, by the smallest distance that leaves that overlap no greater than `MAX_PENETRATION_TOLERANCE`.
8. THE Physics_Engine SHALL detect a Ball's contact with a Collision_Surface by testing whether the distance from that Ball's centre to that surface is less than `BALL_RADIUS`, SHALL perform that test exactly once per Simulation_Step at the position produced by that step's position integration, and SHALL use neither sub-stepping nor swept collision.
9. THE Physics_Engine SHALL advance the Moving_Obstacle position on every Simulation_Step of the same Simulation_Step clock used for Ball integration, irrespective of whether any Ball is in motion, and SHALL derive that position from the count of Simulation_Steps elapsed since the current Arena was entered and the Moving_Obstacle path declared by the Arena_Registry alone.
10. WHEN the Moving_Obstacle's advance on a Simulation_Step would carry it beyond an endpoint of its declared path, THE Physics_Engine SHALL place the Moving_Obstacle at that endpoint for that Simulation_Step and SHALL reverse its direction of travel for the following Simulation_Step.
11. WHEN a Ball in motion overlaps the Moving_Obstacle on a Simulation_Step, THE Physics_Engine SHALL reflect that Ball using `WALL_RESTITUTION` against the contacted surface normal taken at the Moving_Obstacle position produced by that step's obstacle advance, and SHALL impart none of the Moving_Obstacle's own velocity to that Ball.
12. THE Physics_Engine SHALL exclude every other Player's Ball from a Ball's contact detection and contact response, so that no Ball changes another Ball's position or velocity.
13. WHEN the Physics_Engine is executed repeatedly from an identical initial state with identical Shot parameters, THE Physics_Engine SHALL produce an identical sequence of Ball positions and Ball velocities at every Simulation_Step and an identical terminal outcome.
14. WHEN the Physics_Engine advances one Simulation_Step, THE Physics_Engine SHALL apply the following operations in exactly this order, together with the actions that R5.6, R5.11 and R6.5 declare for that Simulation_Step, each operation reading the state left by the operations before it, and SHALL treat as a Ball in motion for the whole of that Simulation_Step every Ball whose velocity is non-zero on at least one axis at the start of that Simulation_Step or that operation 1 displaces:
    1. advance the Moving_Obstacle position, and displace along the Moving_Obstacle's direction of travel any Ball that advance overlaps, by the smallest distance that leaves that overlap no greater than `MAX_PENETRATION_TOLERANCE`;
    2. multiply the velocity of every Ball in motion by `FRICTION_PER_STEP`;
    3. displace every Ball in motion by the velocity left by operation 2 multiplied by `FIXED_STEP_SECONDS`;
    4. resolve contact between every Ball in motion and every Collision_Surface that Ball overlaps at the position left by operation 3, reflecting and repositioning that Ball;
    5. evaluate the Hole capture condition for every Ball in motion against the position and the speed left by operation 4;
    6. evaluate the out-of-bounds condition for every Ball in motion against the position left by operation 4;
    7. increment the consecutive sub-threshold Simulation_Step count of every Ball in motion whose speed left by operation 4 is below `REST_SPEED_THRESHOLD`, and reset that count to zero for every Ball in motion whose speed left by operation 4 is at or above `REST_SPEED_THRESHOLD`;
    and THE Physics_Engine SHALL skip every remaining operation of that Simulation_Step for any Ball whose Hole capture condition or out-of-bounds condition is satisfied.
15. WHEN a Ball in motion overlaps more than one Collision_Surface on the same Simulation_Step, THE Physics_Engine SHALL apply the reflection and the repositioning declared in criteria 6 and 7 exactly once for each overlapped Collision_Surface toward which that Ball's velocity is directed, taking those surfaces in the order in which the Arena_Registry declares them, and SHALL leave unchanged the velocity component perpendicular to every overlapped Collision_Surface from which that Ball's velocity is directed away.
16. IF a Ball overlaps any Collision_Surface by more than `MAX_PENETRATION_TOLERANCE` after contact resolution has completed for a Simulation_Step, THEN THE Physics_Engine SHALL place that Ball at the position it held at the start of that Simulation_Step and SHALL set that Ball's velocity to exactly zero on both axes, and THE Game_Client SHALL record an anomaly entry naming the Arena, the Player, and the Shot parameters.
17. THE Game_Client SHALL drive Simulation_Step execution from a time source that is not the rendered-frame callback, so that the count of Simulation_Steps executed per second of wall-clock time is independent of the rendered frame rate.
18. WHILE the browsing context is not visible, IF the platform suspends or throttles the Game_Client's Simulation_Step time source, THEN THE Game_Client SHALL discard the accumulated time in excess of `MAX_CATCHUP_STEPS_PER_FRAME` multiplied by `FIXED_STEP_SECONDS` as criterion 3 declares, SHALL record an anomaly entry naming the discarded Simulation_Step count, and SHALL leave every Ball position and every Stroke count unchanged by that discard.

*Criteria 14 through 18 are appended so criteria 1 through 13 keep their numbers. Criterion 14 fixes the intra-step order, from which three previously undetermined behaviours follow: a Ball may be captured by the Hole on the same Simulation_Step on which it reflects, because capture is tested after contact resolution; Hole capture takes precedence over out of bounds when both are satisfied; and a Ball whose velocity is zero and that operation 1 does not displace is excluded from operations 2 through 7, so a Ball resting against a Collision_Surface cannot jitter. A Ball displaced by operation 1 counts as a Ball in motion for the remainder of that Simulation_Step, so a resting Ball the Moving_Obstacle pushes still receives contact resolution, Hole capture evaluation, and out-of-bounds evaluation. Operation 1 is the only path by which a Ball at rest changes position. Note that criterion 14 operation 7 tracks the rest debounce counter but does not zero velocity; zeroing is deferred to R5.6, which fires only once the debounce completes. Criterion 17 separates the simulation clock from the render callback so that R18.12's frame-rate independence holds. Criterion 18 states plainly what a suspended tab costs, because criterion 3's discard rule and a guarantee of constant Simulation_Steps per second cannot both hold. A suspended tab therefore loses simulated time rather than silently replaying it, the loss is recorded as an anomaly, and the Verification_Harness is required by R15 to keep its browsing context visible so that no Verification_Flow depends on this path.*

---

### Requirement 4: Physics Constants Module

**User Story:** As a developer, I want every tuning number in one module, so that the game can be tuned by playing rather than by hunting through code.

#### Acceptance Criteria

1. THE Constants_Module SHALL declare `PLAYFIELD_WIDTH` as 1000 world units and `PLAYFIELD_HEIGHT` as 600 world units.
2. THE Constants_Module SHALL declare `BALL_RADIUS` as 10 world units and `HOLE_RADIUS` as 18 world units.
3. THE Constants_Module SHALL declare `SIMULATION_HZ` as 60 Simulation_Steps per second of wall-clock time and SHALL derive `FIXED_STEP_SECONDS` at load time as the reciprocal of `SIMULATION_HZ` rather than declaring it as a numeric literal.
4. THE Constants_Module SHALL declare `POWER_MIN_PERCENT` as 10 and `POWER_MAX_PERCENT` as 100.
5. THE Constants_Module SHALL declare `MIN_LAUNCH_SPEED` as 60 world units per second, `MAX_LAUNCH_SPEED` as 800 world units per second, and a mapping from power percentage to launch speed that is linear and strictly increasing across the closed interval `POWER_MIN_PERCENT` through `POWER_MAX_PERCENT`, anchored at `POWER_MIN_PERCENT` mapping to `MIN_LAUNCH_SPEED` and `POWER_MAX_PERCENT` mapping to `MAX_LAUNCH_SPEED`.
6. THE Constants_Module SHALL declare `FRICTION_PER_STEP` as 0.985, a dimensionless per-Simulation_Step velocity multiplier whose value lies strictly above 0 and strictly below 1.
7. THE Constants_Module SHALL declare `WALL_RESTITUTION` as 0.7, a dimensionless multiplier applied to the velocity component perpendicular to a contacted surface, whose value lies at or above 0 and at or below 1.
8. THE Constants_Module SHALL declare `REST_SPEED_THRESHOLD` as 5 world units per second.
9. THE Constants_Module SHALL declare `REST_DEBOUNCE_STEPS` as 3.
10. THE Constants_Module SHALL declare `HOLE_CAPTURE_MAX_SPEED` as 200 world units per second.
11. THE Constants_Module SHALL declare `MOVING_OBSTACLE_SPEED` as 80 world units per second.
12. THE Constants_Module SHALL declare `MAX_SHOT_DURATION_SECONDS` as 15 seconds of simulated time, equal to 15 multiplied by `SIMULATION_HZ` Simulation_Steps, and not as a span of wall-clock time.
13. THE Constants_Module SHALL declare `ANGLE_STEP_DEGREES` as 5 degrees and `POWER_STEP_PERCENT` as 5 percentage points, such that 360 is an integer multiple of `ANGLE_STEP_DEGREES` and the span from `POWER_MIN_PERCENT` to `POWER_MAX_PERCENT` is an integer multiple of `POWER_STEP_PERCENT`. **⚠ ASSUMPTION A-1 (UNVERIFIED)**
14. THE Constants_Module SHALL declare `MIN_WALL_THICKNESS` as 20 world units.
15. THE Constants_Module SHALL declare `MAX_STROKES_PER_ARENA` as 8.
16. WHEN the Constants_Module is loaded, THE Constants_Module SHALL derive `MAX_CARRY_DISTANCE`, rather than declaring it as a numeric literal, as the Carry_Distance produced by a Shot at `POWER_MAX_PERCENT` on an unobstructed line, accumulated over Simulation_Steps using the same per-step order of `FRICTION_PER_STEP` decay and displacement that R3.14 declares, until Ball speed falls below `REST_SPEED_THRESHOLD`.
17. THE Constants_Module SHALL apply identical constant values to all five Arenas for the duration of a Match.
18. THE Constants_Module SHALL be the only module in which a numeric literal representing a physics quantity, a world-scale quantity, a simulation-timing quantity, or a gameplay tuning quantity appears, and SHALL exclude from that rule the per-Arena geometry, spawn point, Hole position, and Par values that the Arena_Registry declares under Requirement 2, together with numeric literals used as collection indices, loop bounds, array lengths, or arguments to formatting and platform interfaces.
19. THE Constants_Module SHALL declare `DEFAULT_AIM_DEGREES` as 0 and `DEFAULT_POWER_PERCENT` as 50.
20. THE Constants_Module SHALL declare `ALLOW_SINGLE_OCCUPANT_START` as a Game_Server configuration flag whose value is exactly one of enabled or disabled, whose default value is disabled, which is resolved at the completion of Constants_Module load in the Game_Server process and held unchanged for the lifetime of that process, and which is excluded from criterion 26, being a Game_Server run-time configuration input rather than a value any Simulation_Step consumes.
21. THE Constants_Module SHALL declare `POSITION_DIVERGENCE_TOLERANCE` as 1 world unit.
22. THE Constants_Module SHALL declare `MAX_PENETRATION_TOLERANCE` as 0.5 world units.
23. THE Constants_Module SHALL declare `MIN_CORRIDOR_WIDTH` as 40 world units, which is four times `BALL_RADIUS`.
24. THE Constants_Module SHALL expose every value it declares and every value it derives as a read-only binding that holds the value it acquired at the completion of module load for the lifetime of the process in which that module is loaded.
25. IF a module other than the Constants_Module contains a numeric literal reserved to the Constants_Module by criterion 18, or assigns to a value exposed by the Constants_Module, THEN THE build SHALL fail and SHALL report the offending module and the offending line.
26. THE Constants_Module SHALL supply every value it declares or derives, other than `ALLOW_SINGLE_OCCUPANT_START`, to THE Game_Server and THE Game_Client as one identical value set, so that no value consumed by a Simulation_Step differs between the two processes for the duration of a Match.
27. THE Constants_Module SHALL declare `MAX_CATCHUP_STEPS_PER_FRAME` as 5 Simulation_Steps.
28. THE Constants_Module SHALL declare `ROOM_CODE_LENGTH` as 6 characters and `ROOM_CODE_ALPHABET` as the 26 upper-case Latin letters together with the 10 decimal digits.
29. THE Constants_Module SHALL declare `DISCONNECT_DETECTION_SECONDS` as 3 seconds, being the bound on transport liveness detection and not a grace period and not a reconnect window.
30. THE Constants_Module SHALL declare `DISCONNECT_NOTICE_SECONDS` as 4 seconds.
31. THE Constants_Module SHALL declare `AIM_INDICATOR_MIN_LENGTH` as 6 multiplied by `BALL_RADIUS` world units.
32. THE Constants_Module SHALL declare `AIM_INDICATOR_ANGLE_TOLERANCE_DEGREES` as 1 degree.
33. THE Constants_Module SHALL declare `HOLE_CAPTURE_MAX_SPEED`, `REST_SPEED_THRESHOLD`, `MIN_LAUNCH_SPEED`, and `MAX_LAUNCH_SPEED` such that `REST_SPEED_THRESHOLD` is strictly below `HOLE_CAPTURE_MAX_SPEED`, `HOLE_CAPTURE_MAX_SPEED` is strictly below `MAX_LAUNCH_SPEED`, and `MIN_LAUNCH_SPEED` is strictly above `REST_SPEED_THRESHOLD`.

*Criteria 19 through 23 declare constants introduced while folding in the answers to Q-2, Q-4, Q-6, Q-11 and Q-12, and by the constants audit. They are appended rather than inserted so that criteria 1 through 18 keep their numbers.*

*Criteria 24 through 33 close the run-time immutability, enforcement, cross-process agreement, and undeclared-constant gaps found while detailing Requirements 1 through 5, 12, 14 and 15. Values for criteria 27 through 32 are concrete but unratified. The agreement between the derived `MAX_CARRY_DISTANCE` and the Carry_Distance the Physics_Engine actually produces is asserted as a correctness property in Requirement 18 rather than as a load-time check inside the Constants_Module, because the Physics_Engine consumes the Constants_Module and a check in the other direction would invert that dependency. `ALLOW_SINGLE_OCCUPANT_START` is server run-time configuration rather than a tuning number and is a candidate for relocation to a separate server configuration module during design, with criterion 20 retained as a pointer.*

---

### Requirement 5: Status Token State Machine and Rest Detection

**User Story:** As an external verifier, I want a single status token whose values never change, so that I can poll it to know when it is safe to take the next action.

#### Acceptance Criteria

1. THE Debug_Overlay SHALL expose a Status_Token whose value is exactly one of the strings `BALL_MOVING`, `BALL_AT_REST`, `IN_HOLE`, `OUT_OF_BOUNDS`.
2. THE Debug_Overlay SHALL preserve the spelling and the casing of every Status_Token value for the lifetime of the project.
3. THE Debug_Overlay SHALL derive the Status_Token from the Active_Player's Ball.
4. WHEN the Shot_Controller imparts velocity to the Active_Player's Ball, THE Game_Client SHALL hold the Status_Token at `BALL_MOVING` from the Simulation_Step on which that velocity is imparted, having already set that value on submission under criterion 18.
5. WHILE the Active_Player's Ball speed is at or above `REST_SPEED_THRESHOLD` and neither the Hole capture condition nor the out-of-bounds condition is satisfied, THE Game_Client SHALL hold the Status_Token at `BALL_MOVING`.
6. WHEN the Active_Player's Ball speed has remained below `REST_SPEED_THRESHOLD` for `REST_DEBOUNCE_STEPS` consecutive Simulation_Steps, THE Physics_Engine SHALL set that Ball's velocity to exactly zero on both axes on that Simulation_Step, and SHALL continue integrating that Ball under `FRICTION_PER_STEP` on every earlier Simulation_Step of that sub-threshold run.
7. WHEN the Active_Player's Ball speed has remained below `REST_SPEED_THRESHOLD` for `REST_DEBOUNCE_STEPS` consecutive Simulation_Steps, THE Game_Client SHALL set the Status_Token to `BALL_AT_REST` on that Simulation_Step, after the Physics_Engine has set that Ball's velocity to exactly zero on both axes.
8. IF the Active_Player's Ball speed rises to or above `REST_SPEED_THRESHOLD` after fewer than `REST_DEBOUNCE_STEPS` consecutive Simulation_Steps below that threshold, THEN THE Game_Client SHALL hold the Status_Token at `BALL_MOVING` and THE Physics_Engine SHALL reset the consecutive sub-threshold Simulation_Step count to zero.
9. WHEN the Active_Player's Ball satisfies the Hole capture condition, THE Game_Client SHALL set the Status_Token to `IN_HOLE` on that Simulation_Step and SHALL hold that value until the Game_Server publishes the Active_Player designation for the next Shot, or for the remainder of the Match where the Match phase becomes `MATCH_COMPLETE`.
10. WHEN the Active_Player's Ball satisfies the out-of-bounds condition, THE Game_Client SHALL set the Status_Token to `OUT_OF_BOUNDS` on that Simulation_Step and SHALL hold that value until that Ball has been placed at the position it occupied immediately before that Shot was fired and the Game_Server has published the Active_Player designation for the next Shot.
11. WHEN the Active_Player's Ball has been in motion for `MAX_SHOT_DURATION_SECONDS` of simulated time since the Shot_Controller imparted velocity to it without the Status_Token leaving `BALL_MOVING`, THE Physics_Engine SHALL set that Ball's velocity to exactly zero on both axes, THE Game_Client SHALL then evaluate the Hole capture condition against that stopped Ball and SHALL set the Status_Token to `IN_HOLE` where that condition is satisfied and to `BALL_AT_REST` otherwise, and THE Game_Client SHALL record an anomaly entry naming the Arena, the Player, the aim angle, and the power value of that Shot.
12. THE Game_Client SHALL set the Status_Token to one of `BALL_AT_REST`, `IN_HOLE`, or `OUT_OF_BOUNDS` within `MAX_SHOT_DURATION_SECONDS` of simulated time measured from the Simulation_Step on which the Shot_Controller imparted velocity, for every accepted Shot.
13. WHILE the Status_Token holds a value other than `BALL_AT_REST`, THE Shot_Controller SHALL reject every Shot request, SHALL leave Ball velocity, Ball position, and every Stroke count unchanged, and SHALL return the reason `BALL_NOT_AT_REST`; and WHILE the local Player is the Active_Player and the Status_Token reads `BALL_AT_REST` and no Shot request from the local Game_Client is awaiting its outcome, THE Shot_Controller SHALL return that reason for no Shot request.
14. WHILE the newly designated Active_Player's Ball velocity is exactly zero on both axes, WHEN the Game_Server publishes the Active_Player designation for the next Shot, THE Game_Client SHALL set the Status_Token to `BALL_AT_REST` within one rendered frame of receiving that publication.
15. WHILE no Shot has been fired in the current Arena, WHILE the Active_Player's Ball velocity is exactly zero on both axes, and WHILE neither criterion 9 nor criterion 10 requires a different value, THE Game_Client SHALL hold the Status_Token at `BALL_AT_REST`, from the first rendered frame of the Debug_Overlay onward and in every Match phase.
16. THE Game_Client SHALL transition the Status_Token only along the following edges, and SHALL treat every other ordered pair of distinct Status_Token values as a prohibited transition:
    - `BALL_AT_REST` to `BALL_MOVING`, when the Shot_Controller imparts velocity to the Active_Player's Ball.
    - `BALL_MOVING` to `BALL_AT_REST`, when the Rest_Debounce condition is satisfied, or when `MAX_SHOT_DURATION_SECONDS` of motion elapses and the Hole capture condition is not satisfied against the stopped Ball.
    - `BALL_MOVING` to `IN_HOLE`, when the Hole capture condition is satisfied.
    - `BALL_MOVING` to `OUT_OF_BOUNDS`, when the out-of-bounds condition is satisfied.
    - `IN_HOLE` to `BALL_AT_REST`, when the Game_Server publishes the Active_Player designation for the next Shot and the newly designated Active_Player's Ball velocity is exactly zero on both axes.
    - `OUT_OF_BOUNDS` to `BALL_AT_REST`, when that Ball has been placed at its pre-Shot position and the Game_Server publishes the Active_Player designation for the next Shot.
    - `BALL_AT_REST` to `BALL_MOVING`, when the Shot_Controller submits a Shot request to the Game_Server.
    - `BALL_AT_REST` to `IN_HOLE`, when the Moving_Obstacle displaces a Ball whose velocity is exactly zero and the Hole capture condition is satisfied against the displaced position.
    - `BALL_AT_REST` to `OUT_OF_BOUNDS`, when the Moving_Obstacle displaces a Ball whose velocity is exactly zero and the out-of-bounds condition is satisfied against the displaced position.
    - `BALL_MOVING` to `BALL_AT_REST`, when the Game_Server publishes rejection of the Shot request that set `BALL_MOVING` under criterion 18 and the Active_Player's Ball velocity is exactly zero on both axes.
17. THE Debug_Overlay SHALL expose, for each Player, a hole-out field for the current Arena whose value is exactly one of `NOT_HOLED_OUT`, `HOLED_OUT_BY_CAPTURE`, `HOLED_OUT_BY_STROKE_CAP`, and SHALL hold the value that field takes when the Game_Server marks that Player Holed_Out until the Match advances to the next Arena, irrespective of every Status_Token value read in that interval.
18. WHILE the local Player is the Active_Player, WHEN the Shot_Controller submits a Shot request to the Game_Server, THE Game_Client SHALL set the Status_Token to `BALL_MOVING` before the next rendered frame and SHALL hold that value until the Game_Server publishes acceptance or rejection of that Shot request.
19. WHILE the local Player is not the Active_Player, WHEN the Shot_Controller submits a Shot request to the Game_Server, THE Game_Client SHALL leave the Status_Token unchanged.

*Criteria 15 through 19 are appended so criteria 1 through 14 keep their numbers and criterion 3 keeps its Q-8 citation. Criterion 15 fixes the value read before any Shot. Criterion 16 declares the state machine edges that R18.3 asserts against. Criterion 17 latches hole-out per Player for the current Arena so a hole-out survives between Verification_Harness polls without adding a fifth Status_Token value; the `IN_HOLE` token is transient and derived from the Active_Player, so a polling flow could otherwise miss it. Criteria 6 and 7 previously contradicted each other; zeroing is now bound to the Simulation_Step on which the debounce completes and is ordered before the token is set, which keeps R18.4 satisfied and makes criterion 8 and R18.5 reachable. Criterion 5 previously collided with criterion 9, because a Ball crossing the Hole below `HOLE_CAPTURE_MAX_SPEED` but above `REST_SPEED_THRESHOLD` satisfied both; criterion 5 now yields to the Hole capture and out-of-bounds conditions. Criterion 11's Hole capture re-evaluation is reachable only where the safety valve stops a Ball that overlaps the Hole while its speed is at or above `HOLE_CAPTURE_MAX_SPEED`, since R3.14 operation 5 captures every slower overlapping Ball on the Simulation_Step it occurs; it is retained as a guard so that the valve cannot strand a Ball inside the Hole reading `BALL_AT_REST`. Criterion 17's field values are newly proposed and unratified. Criterion 18 closes the window between Shot submission and Game_Server acceptance. Without it the Status_Token still read `BALL_AT_REST` while a request was in flight, R15.7 told the Verification_Harness that value meant the next Shot was safe to initiate, and R8.8's `BALL_NOT_AT_REST` rejection for a second invocation in that window contradicted criterion 13's converse clause. Criterion 16 gains the two `BALL_AT_REST` transitions that R6.11 requires when the Moving_Obstacle displaces a resting Ball into the Hole or across an open edge. Criterion 19 keeps criterion 3's derivation intact when R11.6 forwards a non-Active_Player's fire intent, and criterion 16's rejection edge is what stops a rejected request from latching the token at `BALL_MOVING` permanently, which would otherwise stall every later Shot through criterion 13 and make R15.18's turn-enforcement flow fail for a reason unrelated to turn enforcement. Criterion 13's converse clause is scoped to the Active_Player and to the absence of an awaiting request, because R5.19 deliberately leaves the token untouched on a non-Active_Player's Game_Client while R11.6 forwards that Player's fire intent, and R8.8 legitimately returns `BALL_NOT_AT_REST` for a second press in that window.*

---

### Requirement 6: Hole Capture and Out of Bounds

**User Story:** As a player, I want powerful shots to carry real risk, so that choosing high power is a decision rather than a default.

#### Acceptance Criteria

1. WHEN the shortest distance between the Hole centre and the path traced by a Ball's centre across one Simulation_Step, including any segment of that path introduced by reflection within that Simulation_Step, is at or below `HOLE_RADIUS` AND that Ball's speed at the end of that Simulation_Step is below `HOLE_CAPTURE_MAX_SPEED`, THE Physics_Engine SHALL declare that Ball holed, SHALL set that Ball's velocity to exactly zero on both axes, and SHALL hold that Ball's centre at the Hole centre until the Match advances to the next Arena.
2. WHILE a Ball's speed is at or above `HOLE_CAPTURE_MAX_SPEED`, THE Physics_Engine SHALL allow that Ball to pass across the Hole without capture, SHALL leave that Ball's velocity unaltered by the Hole, and SHALL keep that Ball eligible for capture on any later Simulation_Step at which the capture condition of criterion 1 is satisfied.
3. WHEN a Ball is declared holed, THE Game_Server SHALL mark the owning Player as Holed_Out for the current Arena, SHALL count no additional Stroke for that capture, and SHALL hold that Player's Stroke count for that Arena at the value recorded at the instant of capture for the remainder of the Match.
4. WHEN a Ball's centre lies strictly outside the Playfield rectangle at the end of a Simulation_Step, THE Physics_Engine SHALL declare that Ball out of bounds irrespective of that Ball's direction of travel and speed, and SHALL treat a Ball's centre lying exactly on a Playfield edge as inside the Playfield.
5. WHEN a Ball is declared out of bounds, THE Game_Server SHALL retain the single Stroke already counted for the Shot that produced that outcome, and THE Physics_Engine SHALL set that Ball's velocity to exactly zero on both axes and SHALL place that Ball's centre at the pre-shot position recorded for that Shot rather than at that Arena's declared spawn point.
6. THE Arena_Registry SHALL declare at least one Arena in which at least one Playfield edge is open, so that the out-of-bounds condition is reachable through play.
7. WHERE a Playfield edge is declared walled in the Arena_Registry, WHEN a Ball overlaps that edge, THE Physics_Engine SHALL reflect the velocity component perpendicular to that edge, SHALL multiply that perpendicular component by `WALL_RESTITUTION`, SHALL preserve the parallel component unchanged, and SHALL reposition that Ball so that its overlap with that edge is no greater than `MAX_PENETRATION_TOLERANCE` on the approach side.
8. WHERE a Playfield edge is declared open in the Arena_Registry, WHEN a Ball's centre crosses that edge, THE Physics_Engine SHALL apply no reflection at that edge and SHALL evaluate the out-of-bounds condition at the end of that Simulation_Step.
9. THE Shot_Controller SHALL record, as the pre-shot position of an accepted Shot, only a Ball centre position lying inside the Playfield whose distance from every wall and every static obstacle declared for the current Arena is at least `BALL_RADIUS` reduced by `MAX_PENETRATION_TOLERANCE`, whether that position was produced by that Arena's spawn placement, by an earlier Shot coming to rest, or by an earlier out-of-bounds reset.
10. IF a Ball is declared out of bounds and the Stroke counted for that Shot brings the owning Player's Stroke count for the current Arena to `MAX_STROKES_PER_ARENA`, THEN THE Game_Server SHALL mark that Player as Holed_Out for that Arena, SHALL record `MAX_STROKES_PER_ARENA` as that Player's Stroke count for that Arena, SHALL apply the Active_Player designation rule declared in R1.5, and SHALL accept no further Shot from that Player in that Arena.
11. WHEN the Moving_Obstacle displaces a Ball whose velocity is exactly zero on both axes, THE Physics_Engine SHALL evaluate the Hole capture condition and the out-of-bounds condition against that Ball's displaced position, and SHALL apply the outcome of whichever condition is satisfied.

*Criteria 9 through 11 are appended so criteria 1 through 8 keep their numbers and criteria 6, 7 and 8 keep their Q-5 citation. Criterion 1 applies the capture test to the path traced across a Simulation_Step rather than to the step endpoint alone, which is in tension with Q-17's rejection of swept collision; the tension is recorded rather than resolved silently. Q-17's reasoning holds for walls and static obstacles, which carry `MIN_WALL_THICKNESS` plus twice `BALL_RADIUS` of margin behind them, so R3.8's endpoint test stands unchanged for every Collision_Surface and no swept test is introduced for any surface. The Hole carries no such margin, it is an absorbing outcome rather than a rejecting surface, and a missed sample is a capture the Player earned and did not get. Because capture also requires speed below `HOLE_CAPTURE_MAX_SPEED`, per-step displacement at the moment of capture is a small fraction of `HOLE_RADIUS`, so the path test changes the outcome only for grazing passes. Criterion 4 fixes the boundary test as the Playfield rectangle itself rather than an outset of it, so a Ball is out of bounds as soon as its centre passes an open edge, and a Ball travelling parallel to and just outside an open edge is out of bounds rather than in play. R3.14 fixes the intra-step ordering these criteria depend on, and Hole capture takes precedence over out of bounds when a Ball satisfies both within one Simulation_Step. Criteria 9 through 11 and the criterion 1 path test are derived and unratified.*

---

### Requirement 7: Keyboard Input Controls

**User Story:** As an AI agent driving the game, I want every action reachable through the keyboard, so that I can play without a pointing device.

#### Acceptance Criteria

1. WHEN the left arrow key is pressed, including every auto-repeat press the platform generates while that key is held down, THE Input_Controller SHALL increase the aim angle by exactly `ANGLE_STEP_DEGREES` per press. **⚠ ASSUMPTION A-1 (UNVERIFIED)**
2. WHEN the right arrow key is pressed, including every auto-repeat press the platform generates while that key is held down, THE Input_Controller SHALL decrease the aim angle by exactly `ANGLE_STEP_DEGREES` per press. **⚠ ASSUMPTION A-1 (UNVERIFIED)**
3. WHEN the up arrow key is pressed, including every auto-repeat press the platform generates while that key is held down, THE Input_Controller SHALL increase the power value by exactly `POWER_STEP_PERCENT` per press. **⚠ ASSUMPTION A-1 (UNVERIFIED)**
4. WHEN the down arrow key is pressed, including every auto-repeat press the platform generates while that key is held down, THE Input_Controller SHALL decrease the power value by exactly `POWER_STEP_PERCENT` per press. **⚠ ASSUMPTION A-1 (UNVERIFIED)**
5. WHEN the space key is pressed, THE Input_Controller SHALL invoke `shoot(angle, power)` with the aim angle and the power value that the Debug_Overlay exposes at that instant, irrespective of the current Status_Token value, so that every Shot precondition is evaluated by the Shot_Controller.
6. THE Input_Controller SHALL express the aim angle in degrees, measured counter-clockwise from the positive horizontal axis, and SHALL wrap the aim angle into the range 0 up to but excluding 360 after every adjustment, so that the aim angle exposed in the Debug_Overlay never lies outside that range.
7. IF an increase would take the power value above `POWER_MAX_PERCENT`, THEN THE Input_Controller SHALL set the power value to `POWER_MAX_PERCENT`, SHALL leave the power value unchanged for every further increase press, and SHALL return no rejection for that press.
8. IF a decrease would take the power value below `POWER_MIN_PERCENT`, THEN THE Input_Controller SHALL set the power value to `POWER_MIN_PERCENT`, SHALL leave the power value unchanged for every further decrease press, and SHALL return no rejection for that press.
9. WHEN a turn begins, THE Input_Controller SHALL set the aim angle to `DEFAULT_AIM_DEGREES` and the power value to `DEFAULT_POWER_PERCENT`.
10. WHEN a Shot completes, THE Input_Controller SHALL set the aim angle to `DEFAULT_AIM_DEGREES` and the power value to `DEFAULT_POWER_PERCENT`, discarding every aim and power adjustment made after that Shot was fired, so that the aim angle and the power value of one Shot form no part of the starting state of any later Shot.
11. WHEN the aim angle changes, THE Renderer SHALL update the aim indicator within one rendered frame of that change, so that the indicator's direction equals the aim angle exposed in the Debug_Overlay to within `AIM_INDICATOR_ANGLE_TOLERANCE_DEGREES`.
12. WHEN the power value changes, THE Renderer SHALL update the power indicator within one rendered frame of that change, so that the power indicator's drawn extent corresponds to the power value exposed in the Debug_Overlay and is strictly increasing in that value.
13. WHEN an arrow key or the space key is pressed, including every auto-repeat press, THE Game_Client SHALL suppress the browser's default scrolling behaviour for that key, so that no key press changes the page scroll position.
14. THE Input_Controller SHALL treat keyboard input as the only input device required to complete a Match.
15. THE Input_Controller SHALL restrict the reachable power values to the grid `POWER_MIN_PERCENT`, `POWER_MIN_PERCENT` plus `POWER_STEP_PERCENT`, and so on up to `POWER_MAX_PERCENT`, which is the 19 values 10, 15, 20 through 100, SHALL place `DEFAULT_POWER_PERCENT` on that grid, and SHALL hold the power value on that grid for every sequence of presses applied in the order received, including auto-repeat presses and presses at either clamp boundary. **⚠ ASSUMPTION A-1 (UNVERIFIED)**
16. THE Input_Controller SHALL restrict the reachable aim angles to the grid of whole multiples of `ANGLE_STEP_DEGREES` lying in the range 0 up to but excluding 360, SHALL place `DEFAULT_AIM_DEGREES` on that grid, and SHALL hold the aim angle on that grid for every sequence of presses applied in the order received, including auto-repeat presses and presses that wrap across the ends of that range.
17. WHILE the Status_Token is `BALL_MOVING`, THE Input_Controller SHALL accept aim and power adjustment input and SHALL update the aim angle and the power value exposed in the Debug_Overlay.
18. THE Game_Client SHALL deliver every arrow key press and every space key press to the Input_Controller for every focus position reachable within the page, including focus resting on a Debug_Overlay element and focus resting on the rendering canvas, and without requiring any pointer interaction to establish focus.

*The former criterion 15, a fine-adjustment modifier key, was deleted when Q-4 resolved to a global 5 percent power step. The number 15 has been reused for the power-grid criterion above; criteria 1 through 14 keep their original numbers and no other criterion in this requirement was renumbered.*

*Criteria 16 through 18 are appended so criteria 1 through 15 keep their numbers. They declare the aim angle grid implied by criterion 6, permit adjustment while the Active_Player's Ball is in motion, and require key delivery independent of focus, which is a real failure mode for an external agent that loads the page and presses keys without clicking. Criterion 16 holds for any declared value of `ANGLE_STEP_DEGREES`, so it carries no A-1 tag; the grid it declares does move with that value, so Unverified Assumptions lists criterion 16 among the requirements that change if A-1 is false.*

---

### Requirement 8: Single Shot Entry Point

**User Story:** As a developer, I want exactly one function that can launch a ball, so that no future input method can bypass validation or turn enforcement.

#### Acceptance Criteria

1. THE Shot_Controller SHALL expose exactly one function, `shoot(angle, power)`, capable of imparting velocity to a Ball.
2. THE Input_Controller SHALL launch every Shot by invoking `shoot(angle, power)`.
3. WHERE a pointer-drag input method is added, THAT input method SHALL launch every Shot by invoking `shoot(angle, power)`.
4. WHEN the Game_Server publishes a submitted Shot request as accepted, THE Shot_Controller SHALL take the launch velocity vector the Game_Server broadcast for that Shot and SHALL impart that velocity to the firing Player's Ball.
5. WHEN `shoot(angle, power)` is invoked with finite arguments, THE Shot_Controller SHALL clamp the power value into the range `POWER_MIN_PERCENT` through `POWER_MAX_PERCENT`, SHALL wrap the angle value into the range 0 up to but excluding 360, SHALL apply no other alteration to either argument, including no rounding of the angle value onto a multiple of `ANGLE_STEP_DEGREES` and no rounding of the power value onto the power grid declared in R7.15, and SHALL submit the clamped power value and the wrapped angle value as the parameters of the Shot request.
6. WHEN the Game_Server publishes a submitted Shot request as accepted, THE Shot_Controller SHALL record the position that Ball holds immediately before launch velocity is imparted to it, for use by the out-of-bounds reset.
7. WHEN the Game_Server accepts a Shot request carrying a Shot sequence number it has not previously accepted from the requesting Player, THE Game_Server SHALL increment that Player's Stroke count for the current Arena by exactly 1.
8. IF `shoot(angle, power)` is invoked with an angle value or a power value that is not a finite number, while a Shot request previously submitted by the same Game_Client is awaiting its outcome, or while any other Shot_Controller precondition fails, THEN THE Shot_Controller SHALL submit no Shot request, SHALL leave Ball velocity, Ball position, the recorded pre-shot position, and every Stroke count unchanged, and SHALL return `INVALID_SHOT_ARGUMENT` for a non-finite argument, `BALL_NOT_AT_REST` for an awaiting Shot request, and otherwise the reason declared for the failing precondition.
9. THE Shot_Controller SHALL be the only module that writes to Ball velocity outside the Physics_Engine's per-step integration, in the Game_Client and in the Game_Server alike.
10. WHEN `shoot(angle, power)` is invoked and every Shot_Controller precondition holds, THE Shot_Controller SHALL submit to the Game_Server exactly one Shot request carrying the angle value, the power value, and a Shot sequence number, SHALL assert no Ball position and no Ball velocity in that request, SHALL impart no velocity to any Ball at the time of submission, and SHALL report the outcome of that invocation only once the Game_Server has published acceptance or rejection of that Shot request.
11. THE Shot_Controller SHALL return every Shot rejection reason as exactly one value drawn from the closed set `BALL_NOT_AT_REST`, `NOT_YOUR_TURN`, `ALREADY_HOLED_OUT`, `MATCH_COMPLETE`, `MATCH_NOT_STARTED`, `ARENA_ADVANCE_IN_PROGRESS`, `INVALID_SHOT_ARGUMENT`, and SHALL preserve the spelling and the casing of every value in that set for the lifetime of the project.
12. IF a Shot request arrives carrying a Shot sequence number that the Game_Server has already accepted from the requesting Player, THEN THE Game_Server SHALL leave every Stroke count unchanged, SHALL impart no velocity to any Ball, and SHALL republish the outcome already published for that Shot sequence number.

*Criteria 10 through 12 are appended so criteria 1 through 9 keep their numbers. The authority split is now explicit: `shoot` submits a request and imparts velocity only when the Game_Server publishes acceptance, so an optimistic launch later rejected with `NOT_YOUR_TURN` cannot move a Ball and violate R18.18. Criterion 4 takes the launch velocity vector from the Game_Server broadcast rather than deriving it from the angle, which is what keeps the Game_Server and the Game_Client simulations bit-identical across two runtimes; the derivation itself is declared in Requirement 10. Criterion 11 freezes the Shot rejection reason set; `ROOM_FULL`, `MATCH_ALREADY_STARTED` and `START_AT_ARENA_REFUSED` are join-time or room-creation reasons and are deliberately excluded. `INVALID_SHOT_ARGUMENT` is declared here for the first time and is unratified.*

---

### Requirement 9: Debug Overlay Contract

**User Story:** As an external verifier, I want game state exposed as plain DOM text, so that I can read it with selector-based tooling that cannot see into a canvas.

#### Acceptance Criteria

1. THE Debug_Overlay SHALL render as DOM elements outside the rendering canvas, SHALL be present in the document from the Game_Client's first rendered frame until the browsing context closes irrespective of the Match phase, and SHALL require no query parameter, no keypress, and no configuration flag to be present.
2. THE Debug_Overlay SHALL expose the current Arena number in the field identified `overlay-arena` as a decimal integer from 1 through 5.
3. THE Debug_Overlay SHALL expose the identity of the Active_Player in the field identified `overlay-active-player` as exactly one of `P1`, `P2`, or `NONE`, where `NONE` indicates that no Active_Player is designated.
4. THE Debug_Overlay SHALL expose `P1`'s Stroke count for the current Arena in the field identified `overlay-p1-strokes` as a decimal integer from 0 through `MAX_STROKES_PER_ARENA`.
5. THE Debug_Overlay SHALL expose `P2`'s Stroke count for the current Arena in the field identified `overlay-p2-strokes` as a decimal integer from 0 through `MAX_STROKES_PER_ARENA`.
6. THE Debug_Overlay SHALL expose `P1`'s running Stroke total across all completed Arenas in the field identified `overlay-p1-total` as a decimal integer from 0 through five times `MAX_STROKES_PER_ARENA`.
7. THE Debug_Overlay SHALL expose `P2`'s running Stroke total across all completed Arenas in the field identified `overlay-p2-total` as a decimal integer from 0 through five times `MAX_STROKES_PER_ARENA`.
8. THE Debug_Overlay SHALL expose the current aim angle in the field identified `overlay-aim-angle` as a decimal integer number of degrees from 0 through 359, with no degree symbol and no fractional part.
9. THE Debug_Overlay SHALL expose the current power value in the field identified `overlay-power` as a decimal integer from `POWER_MIN_PERCENT` through `POWER_MAX_PERCENT`, with no percent symbol.
10. THE Debug_Overlay SHALL expose the Status_Token in the field identified `overlay-status` as exactly one of the four declared Status_Token strings.
11. THE Debug_Overlay SHALL expose a Match phase field, identified `overlay-match-phase`, separate from the Status_Token, whose value is exactly one of `WAITING_FOR_OPPONENT`, `IN_PROGRESS`, `MATCH_COMPLETE`.
12. THE Debug_Overlay SHALL expose, for each Player, a participation field, identified `overlay-p1-participation` for `P1` and `overlay-p2-participation` for `P2`, whose value is exactly one of `CONNECTED`, `DISCONNECTED`.
13. THE Debug_Overlay SHALL identify every exposed field by a `data-testid` attribute whose value is the identifier declared for that field in this requirement, unique within the document, and independent of visual layout, of the field's displayed label, and of the field's position in the element tree.
14. WHEN a value from which an exposed field is derived changes in Game_Client state, THE Debug_Overlay SHALL update that field within one rendered frame of that change and before the Status_Token next reads `BALL_AT_REST`, so that no Shot request can be accepted while any exposed field still holds a pre-change value.
15. THE Debug_Overlay SHALL render every exposed value as the text content of that field's element containing no label, no unit symbol, and no punctuation, such that the whitespace-trimmed text content is non-empty and equals the declared value exactly, SHALL render every numeric value as decimal digits with no sign, no thousands separator, and no leading zero unless the value is zero, and SHALL render every value readable without executing page scripts beyond normal page load.
16. THE Debug_Overlay SHALL preserve the spelling, the casing, the identifier, and the declared text format of every exposed field and of every enumerated value for the lifetime of the project.
17. WHILE the Match phase is `MATCH_COMPLETE`, THE Debug_Overlay SHALL expose a result field, identified `overlay-result`, whose value is exactly one of `P1`, `P2`, `TIE`, `VOID`.
18. THE Debug_Overlay SHALL expose, for each Player, a completion field, identified `overlay-p1-completion` for `P1` and `overlay-p2-completion` for `P2`, whose value is exactly one of `NONE`, `DNF`.
19. WHILE the Match phase is `MATCH_COMPLETE`, THE Debug_Overlay SHALL expose each Player's Stroke count for every Arena in the Course in the fields identified `overlay-p1-arena-N-strokes` and `overlay-p2-arena-N-strokes` for each Arena number N from 1 through 5, SHALL expose each Player's running total, SHALL expose all of those values irrespective of that Player's completion field value, and SHALL expose the value 0 for every Arena that Player did not play.
20. WHILE the `P2` slot is unoccupied, THE Debug_Overlay SHALL expose `overlay-p2-strokes` as 0, `overlay-p2-total` as 0, `overlay-p2-participation` as `DISCONNECTED`, and `overlay-p2-completion` as `NONE`.
21. THE Debug_Overlay SHALL expose a Shot rejection field, identified `overlay-last-rejection`, whose value is exactly one of `NONE`, `MATCH_NOT_STARTED`, `NOT_YOUR_TURN`, `BALL_NOT_AT_REST`, `ALREADY_HOLED_OUT`, `MATCH_COMPLETE`, `ARENA_ADVANCE_IN_PROGRESS`, `INVALID_SHOT_ARGUMENT`.
22. WHEN a Shot request from the local Player is rejected, THE Debug_Overlay SHALL set the Shot rejection field to the reason returned by that rejection, and SHALL set that field to `NONE` when the Game_Server next accepts a Shot request from the local Player or when the Active_Player designation next changes, whichever occurs first.
23. THE Debug_Overlay SHALL expose, for each Player, the hole-out field that R5.17 declares, identified `overlay-p1-hole-out` for `P1` and `overlay-p2-hole-out` for `P2`, whose value is exactly one of `NOT_HOLED_OUT`, `HOLED_OUT_BY_CAPTURE`, `HOLED_OUT_BY_STROKE_CAP`.
24. WHEN the Game_Server-published state that an exposed field derives from becomes unavailable, including after the Game_Server disposes of the room, THE Debug_Overlay SHALL hold that field at the last value the Game_Server published for it rather than emptying that field.
25. THE Debug_Overlay SHALL expose the anomaly count field that R10.15 declares, identified `overlay-anomaly-count`, as a non-negative decimal integer.

*Criteria 1 through 19 keep their numbers and their original intent, each tightened in place to name its field identifier and its text format; criteria 11, 12, 17 and 18 keep their Q-7, Q-9, Q-18 and D-2 citations. Criteria 20 through 25 are appended. Criterion 13 previously required a stable machine-readable identifier and named none, so no Verification_Flow could be written against it; `data-testid` is used rather than `id` so that styling and layout changes cannot collide with the contract. Criterion 14's one-rendered-frame bound is not observable from outside the browser, so it is paired with an ordering guarantee an external agent can assert: when `overlay-status` reads `BALL_AT_REST`, every other field already reflects the completed Shot. Criterion 23 gives the R5.17 hole-out field its identifiers here, so that Requirement 9 remains the single declaration site for the overlay contract. Par is deliberately not exposed, because R13.11 assigns Par display to the Renderer and no Verification_Flow pass condition depends on it; `overlay-par` is reserved should that change. The `data-testid` identifiers, the `NONE` value of the Active_Player field, and the `overlay-last-rejection` field and its value set are newly proposed and unratified; once ratified they fall under the criterion 16 freeze. Criterion 24 keeps criteria 1 and 15 satisfiable after R12.11 disposes of the room, since every R10.8-derived field would otherwise lose its source while the overlay is still required to be present and non-empty. Criterion 25 brings the R10.15 anomaly count under the criterion 13 and criterion 16 freeze, in the same way criterion 23 does for the R5.17 hole-out field; R10.15 declares the field's semantics and this requirement remains the single declaration site for its identifier and its text format.*

---

### Requirement 10: Networking and Authoritative State

**User Story:** As a player, I want the server to own the game state, so that neither client can produce an outcome the other client disagrees with.

#### Acceptance Criteria

1. THE Game_Server SHALL own the authoritative values of Arena number, Active_Player identity, per-Arena Stroke counts, running Stroke totals, Holed_Out state, Match phase, per-Player participation state, per-Player completion state, the Shot sequence number, and the Match result.
2. THE Game_Server SHALL accept Shot requests carrying an angle and a power value, SHALL wrap the accepted angle into the range 0 up to but excluding 360 degrees and clamp the accepted power into the range `POWER_MIN_PERCENT` through `POWER_MAX_PERCENT` before acting on that request, and SHALL reject any client message that asserts a Ball position, a Ball velocity, a Stroke count, an Active_Player designation, or a Match phase directly, leaving every authoritative value unchanged and returning a rejection reason.
3. WHEN the Game_Server accepts a Shot request, THE Game_Server SHALL derive the launch velocity vector from the accepted angle and the accepted power using the mapping declared in R4.5, and SHALL broadcast exactly once to every connected Game_Client, irrespective of how many Game_Clients are connected, the accepted angle, the accepted power, both components of that launch velocity vector, the firing Player identity, and a Shot sequence number that is 1 for the first accepted Shot of the Match and greater by exactly 1 than that of the previously accepted Shot of the same Match.
4. WHEN a Game_Client receives an accepted Shot broadcast, THE Game_Client SHALL simulate that Shot using the Physics_Engine, the Constants_Module, and the Arena_Registry, taking the broadcast launch velocity vector as that Ball's initial velocity and deriving no part of that velocity from the broadcast angle.
5. THE Game_Server SHALL simulate every accepted Shot using the same Physics_Engine, Constants_Module, and Arena_Registry used by the Game_Client, SHALL restrict that shared simulation to arithmetic and comparison operations whose results are exactly specified for the numeric type in use, and SHALL exclude every trigonometric evaluation from that shared simulation, so that the shared simulation produces identical results in the runtime hosting the Game_Server and the runtime hosting the Game_Client.
6. WHEN the Game_Server's simulation of a Shot reaches a terminal outcome, THE Game_Server SHALL publish that Shot's sequence number, the terminal outcome as exactly one of `BALL_AT_REST`, `IN_HOLE`, `OUT_OF_BOUNDS`, the resulting Ball position, the firing Player's Stroke count for the current Arena, the firing Player's Holed_Out state, and the Active_Player designation, SHALL withhold every per-Simulation_Step Ball position from that publication, and SHALL deliver that publication as one discrete event that is complete irrespective of the state-synchronisation patch rate.
7. IF the distance between a Game_Client's simulated terminal Ball position and the Game_Server's published terminal Ball position carrying the same Shot sequence number is greater than `POSITION_DIVERGENCE_TOLERANCE`, THEN THE Game_Client SHALL adopt the published position as that Ball's position, SHALL leave the Game_Server's published Stroke counts and Active_Player designation in force, and SHALL record a divergence anomaly.
8. THE Debug_Overlay SHALL derive the Arena number, the Active_Player identity, the Stroke counts, the running totals, the Match phase, the participation fields, the completion fields, the hole-out fields, and the result field from Game_Server-published state, and SHALL change each of those fields only when the Game_Server publishes a new value for it.
9. THE Debug_Overlay SHALL derive the Status_Token, the aim angle, and the power value from local Game_Client state, and SHALL continue to expose all three of those fields while the Game_Client is awaiting a Game_Server publication.
10. THE Game_Server SHALL support two Game_Clients running concurrently in entirely separate browser instances within a single Match, and SHALL publish identical authoritative values to both Game_Clients.
11. THE Game_Server SHALL identify a Match by a room code declared under R1.1 that a second Player can use to join.
12. WHILE a Game_Client is awaiting the Game_Server's response to a Shot request it has sent, THE Game_Client SHALL leave that Ball's position and velocity unchanged and SHALL apply no local prediction of that Shot.
13. IF a Game_Client receives an accepted Shot broadcast whose Shot sequence number is not exactly 1 greater than the highest Shot sequence number it has already simulated, or receives neither an accepted Shot broadcast nor a rejection reason for a Shot request it sent within `MAX_SHOT_DURATION_SECONDS`, THEN THE Game_Client SHALL simulate no Shot from that broadcast, SHALL adopt the Game_Server's most recently published Ball positions, Stroke counts, Holed_Out states, and Active_Player designation as its current state, SHALL set the Status_Token to the Game_Server's most recently published terminal outcome, and SHALL record a synchronisation anomaly.
14. WHEN a Game_Client receives a Game_Server publication, THE Game_Client SHALL apply every field of that publication to its own state as one update, before the Status_Token next reads `BALL_AT_REST`, so that no exposed Debug_Overlay field holds a pre-publication value while the Status_Token reads `BALL_AT_REST`.
15. THE Debug_Overlay SHALL expose an anomaly count field, identified `overlay-anomaly-count`, whose value is a non-negative decimal integer, whose value is 0 at the start of a Match, that increases by exactly 1 for each anomaly entry the Game_Client records under any requirement in this document, including each divergence anomaly, each synchronisation anomaly, each discarded-simulated-time anomaly, each residual-overlap anomaly, each maximum-shot-duration anomaly, and each asset-load anomaly, and that never decreases for the remainder of the Match.

*Criteria 12 through 15 are appended so criteria 1 through 11 keep their numbers and criteria 4 through 9 keep their Q-3 citation. Criteria 3, 4 and 5 together confine every trigonometric evaluation to one Game_Server-side derivation per Shot and carry the resulting vector forward through operations whose results are exactly specified, which is what makes criterion 5 and R18.11 achievable across two runtimes: `Math.sin`, `Math.cos` and `Math.atan2` are implementation-approximated in ECMAScript, so deriving the same angle independently in a Node runtime and a browser runtime can differ in the last bits, and that difference compounds over hundreds of Simulation_Steps until every terminal position diverges and criterion 7 fires on every Shot. The angle remains in the broadcast because the aim indicator and the Debug_Overlay consume it. Two residual exposures are recorded rather than legislated: `Math.sqrt` stays in the shared path because IEEE-754 requires it to be correctly rounded, and comparing squared magnitudes against squared constants would remove even that; and friction must be applied as repeated multiplication per R3.5 rather than by exponentiation, since `Math.pow` is also implementation-approximated. Criterion 14 gives R9.14's ordering guarantee its matching atomicity rule. Criterion 15 makes R18.11 and R18.12 observable through the frozen overlay contract rather than only in unit tests, and it falls under the R9.13 and R9.16 freeze. Criterion 15 counts every anomaly entry this document declares, not only the two recorded here, because R15.17 and R15.32 fail a Verification_Flow on a non-zero count and an anomaly the count ignored would be invisible to every flow; R3.16, R3.18, R5.11 and R16.10 are the other recording sites.*

---

### Requirement 11: Turn Enforcement

**User Story:** As a player, I want the server to reject shots that are not mine to take, so that turn order cannot be broken by a modified or misbehaving client.

#### Acceptance Criteria

1. IF a Shot request arrives from a Player that is not the Active_Player, THEN THE Game_Server SHALL reject the request, leave the Active_Player designation, every per-Arena Stroke count, every running Stroke total, and every Ball position and velocity unchanged, and return the reason `NOT_YOUR_TURN` to the requesting Game_Client only.
2. IF a Shot request arrives from the Active_Player while a Shot previously accepted from that Player is in flight, where in flight means the Game_Server has accepted that Shot and has not yet published its terminal outcome, THEN THE Game_Server SHALL reject the request, leave every Stroke count and every Ball position unchanged, return the reason `BALL_NOT_AT_REST`, and apply this rejection irrespective of any Game_Client rendering or animation state.
3. IF a Shot request arrives from a Player already marked Holed_Out for the current Arena, whether by Hole capture or by reaching `MAX_STROKES_PER_ARENA`, THEN THE Game_Server SHALL reject the request, leave every Stroke count and that Player's Holed_Out state unchanged, and return the reason `ALREADY_HOLED_OUT`.
4. IF a Shot request arrives while the Match phase is `MATCH_COMPLETE`, THEN THE Game_Server SHALL reject the request, leave the Match phase, the recorded result, and every Stroke count unchanged, and return the reason `MATCH_COMPLETE`.
5. WHEN the Game_Server rejects a Shot request, THE Game_Client SHALL set the Debug_Overlay Shot rejection field declared in R9.21 to the returned reason within one rendered frame of receiving it, and SHALL leave the aim angle and the power value unchanged.
6. WHILE a Player is not the Active_Player, THE Game_Client SHALL accept aim and power adjustment input, SHALL update the aim indicator and the power indicator locally within one rendered frame, SHALL leave every Game_Server-owned field unchanged, and SHALL forward that Player's fire intent to the Game_Server as a Shot request rather than suppressing that intent locally.
7. WHILE the Match phase is `IN_PROGRESS` and at least one Player's participation state is `CONNECTED`, THE Game_Server SHALL designate exactly one Active_Player, irrespective of the number of connected Players and irrespective of whether that same Player fired the preceding Shot.
8. WHEN a Player becomes the Active_Player, THE Input_Controller SHALL set the aim angle to `DEFAULT_AIM_DEGREES` and the power value to `DEFAULT_POWER_PERCENT`, irrespective of any adjustment that Player made while not the Active_Player.
9. THE Game_Server SHALL evaluate every Shot request against its preconditions in exactly the order Match phase `MATCH_COMPLETE`, Match phase `WAITING_FOR_OPPONENT`, Arena advance in progress, Active_Player identity, Holed_Out state, Shot in flight, and SHALL return the reason of the first failing precondition only, which is `MATCH_COMPLETE`, `MATCH_NOT_STARTED`, `ARENA_ADVANCE_IN_PROGRESS`, `NOT_YOUR_TURN`, `ALREADY_HOLED_OUT`, `BALL_NOT_AT_REST` respectively.
10. WHEN the Game_Server accepts a Shot request, THE Game_Client SHALL set the Debug_Overlay Shot rejection field to `NONE` within one rendered frame.
11. WHEN two or more Shot requests arrive at the Game_Server before it has completed evaluating a preceding Shot request, THE Game_Server SHALL evaluate them one at a time in arrival order, each against the Active_Player designation, the Holed_Out state, and the in-flight state resulting from every request already evaluated, SHALL apply the precedence order declared in criterion 9 to each, and SHALL hold at most one Shot in flight at any instant.

*Criterion 8 states the interaction between criterion 6 and the per-turn reset resolved in Q-11 explicitly: adjustment while waiting keeps the indicators live and observable, and it does not carry into the turn.*

*Criteria 9 through 11 are appended so criteria 1 through 8 keep their numbers and criteria 6 and 8 keep their D-5 citation. Criterion 2 replaces "while that Player's Ball is in motion" with a Game_Server-observable definition, because under Q-3 the Game_Server publishes discrete outcomes and never per-Simulation_Step positions, so "in motion" had no server-side referent; the Game_Server gate is publication and the Game_Client gate remains the Status_Token under R5.13, so a request accepted while a Game_Client is still animating is correct behaviour rather than a defect. Criterion 9 declares which single reason is returned when several preconditions fail at once, which a Verification_Flow asserting on an exact string requires, and it makes this requirement and R1.10 and R1.21 return the same reason for the cases they share. Criterion 11 makes turn transfer atomic with respect to a second request arriving in the same tick. Criterion 6 forwards fire intent rather than suppressing it, which is what makes `NOT_YOUR_TURN` reachable through keyboard alone as R15.1 and R15.18 require; note that R8.10 blocks a second local invocation only while an earlier request from the same Game_Client is awaiting its outcome, so a non-Active_Player's first request still reaches the Game_Server.*

---

### Requirement 12: Disconnect Handling

**User Story:** As a player whose opponent drops out, I want the match to continue to completion without any action from me, so that a dropped connection never strands me.

#### Acceptance Criteria

1. WHILE the Match phase is `IN_PROGRESS`, WHEN the Game_Server observes loss of a Player's room session, being either that session reported closed or no transport liveness response received from that session for `DISCONNECT_DETECTION_SECONDS`, including the case of a Game_Client process terminated without closing its session, THE Game_Server SHALL set that Player's participation state to `DISCONNECTED` no later than `DISCONNECT_DETECTION_SECONDS` after the last transport liveness response received from that session, SHALL apply no further waiting period before treating that Player as `DISCONNECTED`, and SHALL hold the Match phase at `IN_PROGRESS`.
2. WHEN the Game_Server sets a Player's participation state to `DISCONNECTED`, THE Game_Server SHALL preserve that Player's per-Arena Stroke counts and running total at the values they hold at that instant, for the remainder of the Match.
3. WHILE the Match phase is `IN_PROGRESS`, WHEN the Game_Server sets a Player's participation state to `DISCONNECTED`, THE Game_Server SHALL mark that Player as DNF and SHALL set that Player's completion field to `DNF`.
4. WHEN the Game_Server sets the Active_Player's participation state to `DISCONNECTED` and at least one other Player's participation state is `CONNECTED`, THE Game_Server SHALL transfer the Active_Player designation to that remaining connected Player before accepting any further Shot request, and SHALL not wait for any in-flight Shot to reach a terminal outcome.
5. WHILE exactly one Player is connected and the Match phase is `IN_PROGRESS`, THE Game_Server SHALL designate that Player as the Active_Player for every subsequent Shot.
6. WHILE exactly one Player's participation state is `CONNECTED`, WHEN that Player Holes_Out in the current Arena, THE Game_Server SHALL advance the Match to the next Arena in the Course exactly once for that Arena.
7. WHEN the Game_Server sets a Player's participation state to `DISCONNECTED`, THE Game_Client of each remaining connected Player SHALL update that Player's participation field in the Debug_Overlay, SHALL display a notice that dismisses itself within `DISCONNECT_NOTICE_SECONDS`, SHALL leave keyboard focus unchanged, SHALL deliver every arrow key and space key press to the Input_Controller while that notice is displayed, and SHALL alter no Debug_Overlay field other than the participation field.
8. WHEN a Player disconnects, THE Game_Client of the remaining Player SHALL continue accepting input without requiring any acknowledgement from that Player.
9. WHEN the Game_Server sets a Player's participation state to `DISCONNECTED` while at least one other Player's participation state is `CONNECTED`, THE Game_Server SHALL run the Match to completion through Arena 5 for the remaining connected Player, and SHALL neither pause the Match, nor await a reconnection, nor apply any grace period.
10. WHEN a previously disconnected Player connects again, THE Game_Server SHALL treat that connection as a new session, SHALL assign a Player slot only in a room that holds an unoccupied slot and whose Match phase is `WAITING_FOR_OPPONENT`, and SHALL restore no Stroke count, no DNF marker, and no Active_Player designation from that Player's prior session.
11. WHILE the Match phase is `IN_PROGRESS`, WHEN every Player in the Match holds the participation state `DISCONNECTED`, THE Game_Server SHALL set the Match phase to `MATCH_COMPLETE`, record the result `VOID`, write that result and every Player's preserved Stroke counts and DNF markers to the Game_Server match log, and then dispose of the room and release its state.
12. WHEN the Game_Server records the result `VOID`, THE Game_Server SHALL complete that record before releasing room state.
13. WHEN the Game_Server sets a Player's participation state to `DISCONNECTED` while a Shot already accepted from that Player has not reached a terminal outcome, THE Game_Server SHALL complete that Shot's simulation to a terminal outcome, SHALL retain the Stroke already counted for that Shot, SHALL apply the resulting Hole capture or out-of-bounds outcome to that Player's Stroke count and Holed_Out state for the current Arena, and SHALL not return the Active_Player designation to that Player.
14. IF a Player disconnects while the Match phase is `WAITING_FOR_OPPONENT` or `MATCH_COMPLETE`, THEN THE Game_Server SHALL record no DNF marker for that Player, SHALL leave the result field and every Stroke count unchanged, and SHALL dispose of the room when that Player was the last connected Player.
15. WHEN the Game_Server sets a Player's participation state to `DISCONNECTED` and exactly one Player remains `CONNECTED` and that remaining Player is already Holed_Out in the current Arena, THE Game_Server SHALL advance the Match to the next Arena in the Course, or SHALL set the Match phase to `MATCH_COMPLETE` when the current Arena is Arena 5.

*Criteria 11 and 12 resolve a tension between two of the owner's answers, and the resolution is deliberately visible rather than silent. Q-7 requires a both-DNF Match to read `MATCH_COMPLETE` with both Players marked DNF; Q-15 disposes of the room once both Players are disconnected. With zero connected Game_Clients there is no Debug_Overlay left to read. The `VOID` outcome is therefore computed and recorded on the Game_Server before disposal, and under the criteria in this document no client observes it. The value `VOID` is still declared in the frozen overlay result value set in R9.17, so that the set does not have to change if a grace period or any other path later leaves a client connected at that moment.*

*Criteria 13 through 15 are appended so criteria 1 through 12 keep their numbers and their Q-7, Q-15 and D-1 citations. Criterion 1 names both detection paths and bounds detection latency, because a Game_Client process killed outright does not close its session cleanly and an unbounded transport default would reproduce exactly the stall this requirement exists to prevent: two Verification_Harness processes running in parallel, one dies, and the surviving flow waits for a turn transfer that has not happened. Criterion 3 and criterion 11 gained the `IN_PROGRESS` guard, and criterion 14 states that a disconnect at `WAITING_FOR_OPPONENT` or `MATCH_COMPLETE` mutates nothing; without those guards a Verification_Flow that cleared Arena 5 and then closed its browser would mark its sole Player DNF, R13.7 would exclude that Player from winner determination, and R13.13 would record `VOID` on every passing run. A mid-Course single-occupant disconnect still voids, per Q-7, and the flow is separately recorded as failed under R15.9. Criterion 13 completes an in-flight Shot rather than abandoning it, because R8.7 counts the Stroke at acceptance and abandoning would leave a counted Stroke with no outcome; nothing blocks, since the two Balls are transparent to each other under R3.12 and the Status_Token follows the new Active_Player under R5.3. Criterion 6 is exactly-once per Arena and criterion 15 covers the case where the survivor has already Holed_Out and the Holes_Out trigger has therefore already passed, which is what R18.20's no-stall property needs to be testable. `DISCONNECT_DETECTION_SECONDS` bounds liveness detection only; it is not a grace period and not a reconnect window, since participation state flips at first detection and criterion 10 still admits no reconnection.*

---

### Requirement 13: Scoring and Win Determination

**User Story:** As a player, I want the winner decided by total strokes across the whole course, so that consistent play across five arenas decides the match.

#### Acceptance Criteria

1. WHEN the Game_Server accepts a Shot request under R8.7, THE Score_Keeper SHALL increment the firing Player's Stroke count for the current Arena by exactly 1 and SHALL leave every other Player's Stroke count unchanged.
2. WHEN a Ball is declared out of bounds, THE Score_Keeper SHALL retain the single Stroke already counted for the Shot that produced that outcome and SHALL count no further Stroke for the repositioning of that Ball.
3. WHEN an Arena completes, THE Score_Keeper SHALL add each Player's Stroke count for that Arena to that Player's running total and SHALL retain that Arena's Stroke count for each Player as a separate value, addressed by Arena number, for the remainder of the Match.
4. THE Score_Keeper SHALL compute each Player's running total as the sum of that Player's per-Arena Stroke counts across completed Arenas only, and SHALL exclude from that total the Stroke count of an Arena that has not completed.
5. WHEN a Player's Stroke count for the current Arena reaches `MAX_STROKES_PER_ARENA` and the Shot that produced that count reaches a terminal outcome other than holed, THE Game_Server SHALL mark that Player as Holed_Out for that Arena and SHALL record exactly `MAX_STROKES_PER_ARENA`, counting the Shot that reached the cap, as that Player's Stroke count for that Arena, irrespective of whether that Shot ended at rest or out of bounds.
6. WHEN the Match phase becomes `MATCH_COMPLETE`, THE Score_Keeper SHALL determine the winner as the Player holding the strictly lowest running total among Players whose completion field is `NONE`, and SHALL set the result to that Player's identity, irrespective of any lower running total held by a Player marked DNF.
7. WHEN the Match phase becomes `MATCH_COMPLETE`, THE Score_Keeper SHALL exclude every Player marked DNF from winner determination.
8. WHEN the Match phase becomes `MATCH_COMPLETE` and exactly one Player is not marked DNF, THE Score_Keeper SHALL declare that Player the winner and SHALL set the result to that Player's identity, irrespective of that Player's running total and of the number of Arenas that Player completed.
9. WHEN the Match phase becomes `MATCH_COMPLETE` and two Players not marked DNF hold equal running totals, THE Score_Keeper SHALL declare the result `TIE` and SHALL apply no tiebreak drawn from Par, from per-Arena Stroke counts, or from Arena completion order.
10. WHEN the Match phase becomes `MATCH_COMPLETE`, THE Game_Client SHALL display each Player's retained Stroke count for every Arena in the Course, each Player's running total, and the DNF marker for every Player marked DNF, irrespective of any Player's completion field value.
11. THE Renderer SHALL display the current Arena's Par value as declared in the Arena_Registry.
12. THE Score_Keeper SHALL exclude Par from winner determination, from every per-Arena Stroke count, and from every running total.
13. WHEN the Match phase becomes `MATCH_COMPLETE` and every Player in the Match is marked DNF, THE Score_Keeper SHALL record no winner and SHALL set the result to `VOID`, irrespective of every Player's running total and of the number of Arenas completed.
14. WHEN the Score_Keeper sets the result to `VOID`, THE Score_Keeper SHALL retain each Player's per-Arena Stroke counts, each Player's running total, and each Player's DNF marker at the values held at the instant the last connected Player disconnected, and SHALL add no per-Arena Stroke count for any Arena that had not completed at that instant.
15. WHEN a Player is marked Holed_Out by reaching `MAX_STROKES_PER_ARENA` rather than by Hole capture, THE Game_Client SHALL leave the Status_Token value `IN_HOLE` unreached for that Player in that Arena, and SHALL apply the Status_Token lifetimes declared in R5.9, R5.10 and R5.16 to the Shot that reached the cap without exception.
16. WHEN a Player is marked Holed_Out by reaching `MAX_STROKES_PER_ARENA`, THE Game_Server SHALL set that Player's hole-out field declared in R5.17 to `HOLED_OUT_BY_STROKE_CAP`, and WHEN a Player is marked Holed_Out by Hole capture, THE Game_Server SHALL set that field to `HOLED_OUT_BY_CAPTURE`.
17. WHEN an Arena completes and a Player has no accepted Shot recorded in that Arena, THE Score_Keeper SHALL record zero as that Player's Stroke count for that Arena.

*Criteria 15 through 17 are appended so criteria 1 through 14 keep their numbers and their Q-7, Q-12, Q-14 and Q-18 citations. Criterion 1 now defers to R8.7's Shot-sequence-number condition rather than incrementing on any acceptance, so a retried network message cannot double-count and the Game_Server and the Score_Keeper cannot disagree about which acceptance counts. Criteria 3 and 4 resolve a three-way ambiguity between the former criteria 3 and 4 and R9.6: the running total covers completed Arenas only, so an agent reading the overlay finds the current Arena's Strokes in the per-Arena field and not in the total. Criteria 15 and 16 answer how an external verifier separates a capped-out Player from a holed-out Player without adding a value to the frozen Status_Token set: the hole-out field carries it, and R15.17's fail condition is therefore decidable. The durable capped-out signal is the hole-out field of R5.17 and criterion 16, not the Status_Token, because the token is transient by design and R5.10 releases `OUT_OF_BOUNDS` as soon as the Ball is repositioned; criterion 15 therefore claims no token lifetime of its own and defers to R5.9, R5.10 and R5.16 for the capping Shot. Criterion 5 evaluates the cap at the Shot's terminal outcome rather than at increment time, so a Player is not marked Holed_Out while the capping Ball is still moving. Criterion 17 keeps R18.21's accounting identity true for a Player marked DNF before an Arena completed.*

---

### Requirement 14: Rendering

**User Story:** As a player, I want a clear 2D view of the arena, my ball, my aim, and my power, so that I can judge a shot before taking it.

#### Acceptance Criteria

1. THE Renderer SHALL render the scene through Three.js using an orthographic camera.
2. THE Renderer SHALL render all geometry in a single plane.
3. THE Renderer SHALL frame the orthographic camera so that, at every rendered frame and for every canvas size, the entire Playfield is visible without scrolling at equal world units per pixel on the horizontal axis and the vertical axis and with no camera rotation, such that the Playfield aspect ratio derived from `PLAYFIELD_WIDTH` and `PLAYFIELD_HEIGHT` is preserved and any surplus viewport area falls outside the Playfield bounds rather than being absorbed by unequal axis scaling, and SHALL change the resulting world-to-screen mapping only when the canvas dimensions change.
4. THE Renderer SHALL draw the Playfield bounds, the Arena walls, the Arena obstacles, the Hole, each Player's Ball, and every viewport area lying outside the Playfield bounds, SHALL draw the Hole with a fill differing from every wall and every static obstacle, and SHALL draw the area outside the Playfield bounds with a fill differing from the Playfield interior.
5. WHILE the local Player is the Active_Player, THE Renderer SHALL draw an aim indicator originating at that Player's Ball centre, extending no less than `AIM_INDICATOR_MIN_LENGTH` world units, and oriented along the current aim angle to within `AIM_INDICATOR_ANGLE_TOLERANCE_DEGREES`.
6. THE Renderer SHALL draw a power indicator whose drawn extent increases strictly with the current power value across the range `POWER_MIN_PERCENT` through `POWER_MAX_PERCENT`, such that two power values differing by `POWER_STEP_PERCENT` produce different drawn extents.
7. THE Renderer SHALL visually distinguish `P1`'s Ball from `P2`'s Ball by an attribute other than position, including while the two Balls overlap.
8. THE Renderer SHALL draw every visual element for which the Asset_Registry resolves an Asset_Key to a procedural placeholder by drawing that placeholder, and SHALL require no supplied asset file to draw the Playfield bounds, the Arena walls, the Arena obstacles, the Hole, each Player's Ball, the aim indicator, or the power indicator.
9. THE Renderer SHALL decouple its frame rate from `SIMULATION_HZ`, SHALL draw every Ball and every Moving_Obstacle at the state of the most recently completed Simulation_Step without interpolating or extrapolating between Simulation_Steps, and SHALL alter neither the Simulation_Step time source declared in R3.17 nor the count of Simulation_Steps executed per second of wall-clock time by its own frame rate or by a canvas resize.
10. WHEN a Ball's velocity reaches exactly zero, THE Renderer SHALL draw that Ball at the position held at the Simulation_Step in which the velocity reached zero, SHALL hold that drawn position unchanged on every subsequent frame until the next accepted Shot, until the Game_Client adopts a Game_Server-published position, or until the Moving_Obstacle displaces that Ball, and SHALL apply an adopted position on the next rendered frame without drawing any intermediate position.
11. WHILE the local Player is not the Active_Player, THE Renderer SHALL draw the aim indicator and the power indicator from the local Player's own aim angle and power value anchored at that Player's own Ball, and SHALL draw no aim indicator and no power indicator for the other Player.
12. WHILE the Status_Token reads `BALL_MOVING` and the Game_Server has not yet published that Shot's outcome, THE Renderer SHALL draw the Active_Player's Ball at the position produced by the local Physics_Engine's most recently completed Simulation_Step.
13. WHERE the current Arena declares a Moving_Obstacle, THE Renderer SHALL draw that Moving_Obstacle's declared path derived from the Arena_Registry with a fill differing from the Moving_Obstacle itself.

*Criteria 11 through 13 are appended so criteria 1 through 10 keep their numbers. Criterion 3 resolves the aspect-ratio question in favour of preserving the Playfield ratio at equal scale on both axes, so surplus viewport area shows as space outside the Playfield rather than stretching the world, and it fixes the mapping so that an agent screenshotting and a human judging aim both work against a stable pixels-per-world-unit relationship. Criterion 9 states the interpolation decision explicitly: no interpolation and no extrapolation, always the most recently completed Simulation_Step, which keeps every drawn frame equal to a real simulated state, keeps criterion 10's fixed-position guarantee exact, and serves the decisive-stop feel goal at the cost of repeated frames above 60Hz; it also forbids a resize or the render rate from changing Simulation_Steps per second. A hidden tab is a separate matter and criterion 9 no longer claims immunity to it: R3.17 puts the simulation on a time source other than the frame callback, R3.18 states what a suspended or throttled time source costs, and R15.25 obliges the Verification_Harness to keep its browsing context visible so that no Verification_Flow depends on that path. Criterion 10 gained the Moving_Obstacle exception required by R3.14 operation 1, and requires a Game_Server correction to be applied without an animated tween, since an eased correction would read as post-stop drift while the Status_Token already reads `BALL_AT_REST`. Criterion 5 is scoped to the local Active_Player because aim and power are local state under R10.9, and its minimum length is what makes R7.11's visible-change requirement testable. Criterion 13 draws the Moving_Obstacle path so that Arena 5's timing lesson is readable rather than trial and error.*

---

### Requirement 15: Verification Harness and Step Budget

**User Story:** As the project owner, I want an external AI agent to verify the game through keyboard input and the overlay alone, so that the closed verification loop is the demonstrable deliverable.

#### Acceptance Criteria

1. THE Verification_Harness SHALL drive the Game_Client using keyboard input only.
2. THE Verification_Harness SHALL read game state from the Debug_Overlay only.
3. THE Verification_Harness SHALL scope each per-Arena Verification_Flow to exactly one Player clearing exactly one Arena, and SHALL exclude every other Arena from that flow's scope. **⚠ ASSUMPTION A-1 (UNVERIFIED)**
4. THE Verification_Harness SHALL declare `AGENT_STEP_BUDGET_PER_FLOW` as 15 Agent_Steps and SHALL constrain every Verification_Flow to no more than `AGENT_STEP_BUDGET_PER_FLOW` dispatched Agent_Steps. **⚠ ASSUMPTION A-1 (UNVERIFIED)**
5. THE Verification_Harness SHALL exclude any Verification_Flow covering a complete two-Player five-Arena Match.
6. WHEN a Verification_Flow needs to know whether the next action is safe to take, THE Verification_Harness SHALL read the Status_Token at intervals of `STATUS_POLL_INTERVAL_MILLISECONDS` until the Status_Token holds a value other than `BALL_MOVING` or until `STATUS_POLL_TIMEOUT_SECONDS` has elapsed since that read sequence began.
7. WHEN the Status_Token reads `BALL_AT_REST` and the Debug_Overlay Active_Player field identifies the Verification_Flow's Player, THE Verification_Harness SHALL treat the next Shot as safe to initiate.
8. WHEN the Debug_Overlay hole-out field for the Verification_Flow's Player reads `HOLED_OUT_BY_CAPTURE`, THE Verification_Harness SHALL treat the Arena as cleared for that Player and SHALL record the flow as passed.
9. IF a Verification_Flow dispatches `AGENT_STEP_BUDGET_PER_FLOW` Agent_Steps without that flow's Player's hole-out field reading `HOLED_OUT_BY_CAPTURE`, THEN THE Verification_Harness SHALL record the flow as failed and SHALL capture the value of every Debug_Overlay field that Requirement 9 and R10.15 declare for the Match phase in force at the point of failure.
10. THE Verification_Harness SHALL obtain its single-Player consecutive-Shot path by running the Game_Server with `ALLOW_SINGLE_OCCUPANT_START` enabled and occupying the room with one Game_Client.
11. THE Verification_Harness SHALL run two Game_Clients as separate parallel processes, each driving its own browser instance.
12. THE Verification_Harness SHALL store its Verification_Flows under the repository directory `verification/flows/` in version control as one Verification_Flow per file, and SHALL declare exactly six Verification_Flows: one per-Arena flow for each of Arenas 1 through 5, each driven by one Game_Client with `ALLOW_SINGLE_OCCUPANT_START` enabled and therefore holding exactly one Player for that Arena, and one turn-enforcement flow driven by two Game_Clients.
13. THE Verification_Harness SHALL declare, for each per-Arena Verification_Flow, a pass condition satisfied when that flow's Player's hole-out field reads `HOLED_OUT_BY_CAPTURE` within `AGENT_STEP_BUDGET_PER_FLOW` Agent_Steps and within `MAX_STROKES_PER_ARENA` Strokes.
14. WHEN a Verification_Flow fails, THE Verification_Harness SHALL report the flow identifier, the Arena number, the failing assertion, the expected value, the observed value, and the failure classification.
15. THE Verification_Harness SHALL preserve the Course difficulty curve, and SHALL adapt to the step budget by narrowing flow scope rather than by changing Arena geometry, Par values, or physics constants.
16. THE Verification_Harness SHALL define one Agent_Step as one dispatched key sequence, which may contain more than one keypress. **⚠ ASSUMPTION A-1 (UNVERIFIED)**
17. THE Verification_Harness SHALL declare, for each Verification_Flow, a fail condition satisfied by any one of: exhaustion of `AGENT_STEP_BUDGET_PER_FLOW`; that flow's Player's Stroke count for the current Arena reaching `MAX_STROKES_PER_ARENA` while that Player's hole-out field does not read `HOLED_OUT_BY_CAPTURE`; that Player's hole-out field reading `HOLED_OUT_BY_STROKE_CAP`; expiry of `STATUS_POLL_TIMEOUT_SECONDS` while the Status_Token holds `BALL_MOVING`; a Status_Token value outside the four declared values; a Debug_Overlay field value outside the value set declared for that field; an absent Debug_Overlay field identifier that Requirement 9 declares for the current Match phase; or a non-zero `overlay-anomaly-count`.
18. THE Verification_Harness SHALL cover turn enforcement in a dedicated two-Game_Client Verification_Flow rather than within any per-Arena Verification_Flow, and SHALL declare that flow's pass condition as satisfied when a Shot dispatched from the Game_Client whose Player the Debug_Overlay Active_Player field does not identify leaves both Players' per-Arena Stroke counts and both Players' running totals unchanged and sets that Game_Client's `overlay-last-rejection` field to `NOT_YOUR_TURN`.
19. THE Verification_Harness SHALL drive the same Game_Client, Input_Controller, Shot_Controller, Physics_Engine, and Arena_Registry code paths that a two-Player Match uses, and SHALL restrict `ALLOW_SINGLE_OCCUPANT_START` and `START_AT_ARENA` to selecting the starting Match state rather than to altering those code paths.
20. WHERE `ALLOW_SINGLE_OCCUPANT_START` is enabled, WHEN a per-Arena Verification_Flow for Arena N begins, THE Verification_Harness SHALL create the room with the room parameter `START_AT_ARENA` set to N, so that that flow's first Shot is taken in Arena N without a Shot being taken in any preceding Arena.
21. THE Verification_Harness SHALL declare `STATUS_POLL_INTERVAL_MILLISECONDS` as 100 and `STATUS_POLL_TIMEOUT_SECONDS` as 20 seconds of wall-clock time, which exceeds the wall-clock time in which `MAX_SHOT_DURATION_SECONDS` of simulated time elapses while criterion 25 holds the browsing context visible, so that a Ball that never reaches a terminal Status_Token value is recorded as a Game_Client failure rather than as a Verification_Harness timeout.
22. THE Verification_Harness SHALL count every Agent_Step it dispatches against `AGENT_STEP_BUDGET_PER_FLOW`, including every Agent_Step whose only action is reading a Debug_Overlay field.
23. WHERE the browser driver exposes an action that polls a condition within a single Agent_Step, THE Verification_Harness SHALL perform each Status_Token wait as exactly one Agent_Step that polls at `STATUS_POLL_INTERVAL_MILLISECONDS` and that ends when the Status_Token holds a value other than `BALL_MOVING` or when `STATUS_POLL_TIMEOUT_SECONDS` has elapsed.
24. WHEN a Verification_Flow run begins, THE Verification_Harness SHALL create a new room and a new browser instance for that run, so that every Verification_Flow produces the same pass or fail result irrespective of the order in which the Verification_Flows are run and irrespective of any earlier run of that Verification_Flow.
25. WHILE a Verification_Flow is running, THE Verification_Harness SHALL keep the browsing context it drives visible, so that no Verification_Flow depends on the suspended-time-source path declared in R3.18.
26. WHEN a Verification_Flow reads the Debug_Overlay, THE Verification_Harness SHALL assert that every field identifier Requirement 9 declares for the current Match phase is present, and that every enumerated field value is a member of the value set declared for that field in Requirement 5, Requirement 9, or Requirement 10.
27. IF a Verification_Flow fails while the Game_Server is unreachable, while the Game_Client has not completed page load, or while the Debug_Overlay root element is absent from the DOM, THEN THE Verification_Harness SHALL classify that failure as a harness or environment failure and SHALL append no entry to `verification/defects.md`.
28. WHEN a Verification_Flow fails and that failure is not classified as a harness or environment failure, THE Verification_Harness SHALL classify that failure as a game defect and SHALL append an entry to `verification/defects.md` recording the flow identifier, the Arena number, the `START_AT_ARENA` value, the ordered Agent_Step sequence dispatched in that run, the aim angle and the power value of every Shot in that run, the Debug_Overlay field values captured at the point of failure, the failing assertion, the expected value, and the observed value.
29. THE Verification_Harness SHALL make every entry in `verification/defects.md` re-runnable by replaying that entry's recorded Agent_Step sequence into a room created with that entry's recorded `START_AT_ARENA` value.
30. WHEN an entry in `verification/defects.md` is marked fixed, THE Verification_Harness SHALL re-run the Verification_Flow that produced that entry together with every other Verification_Flow, SHALL record that entry as closed only when the re-run of that Verification_Flow satisfies its pass condition, and SHALL hold that entry open otherwise.
31. THE file `verification/defects.md` SHALL exist from the increment in which the first Verification_Flow is added and SHALL retain every entry it accumulates.
32. THE Verification_Harness SHALL treat a Verification_Flow that both satisfies its pass condition and records a non-zero `overlay-anomaly-count` as failed.
33. THE Verification_Harness SHALL dispatch no Agent_Step that reads or writes Game_Client state other than through keyboard input and Debug_Overlay text content, and SHALL evaluate no page script of its own to obtain game state.
34. THE Verification_Harness SHALL treat the field identifiers `overlay-result`, `overlay-p1-arena-N-strokes` and `overlay-p2-arena-N-strokes` as required only while the Debug_Overlay Match phase field reads `MATCH_COMPLETE`, and SHALL treat every other field identifier declared in Requirement 9 and in R10.15 as required in every Match phase.
35. IF the only anomalies recorded during a Verification_Flow run are the asset-load anomalies that R16.10 declares, THEN THE Verification_Harness SHALL classify that run's non-zero `overlay-anomaly-count` as a harness or environment condition rather than as a game defect, SHALL not fail that run on that count alone, and SHALL report that count with the run result.

*Criteria 20 through 35 are appended so criteria 1 through 19 keep their numbers and their Q-1, Q-2, Q-12 and Q-20 citations. Criterion 20 closes the Arena-entry blocker: nothing previously let a flow for Arena 3 begin in Arena 3, so flows 2 through 5 would have had to play the preceding Arenas and exhaust their budget, and criterion 15 forbids making the Arenas easier instead. Criterion 12 states the flow inventory as six, because under single occupancy one flow per Player per Arena collapses to five per-Arena flows plus the turn-enforcement flow of criterion 18. Criteria 8, 9, 13 and 17 read the hole-out field of R5.17 rather than racing the transient `IN_HOLE` Status_Token, which a poll at `STATUS_POLL_INTERVAL_MILLISECONDS` could otherwise miss between reads, and criterion 17 distinguishes a genuine capture from a `MAX_STROKES_PER_ARENA` cap-out. Criteria 6, 21 and 23 bound polling, and the timeout deliberately exceeds `MAX_SHOT_DURATION_SECONDS` so that a stalled Ball is recorded as a game failure rather than a hung harness. Criteria 22 and 23 make criterion 4's budget arithmetic checkable rather than assumed. Criteria 27 through 31 close the feedback loop that is the project's actual deliverable: classify the failure, file a replayable reproduction, replay it, and close it only when a re-run of every flow passes. Criteria 17, 26 and 32 assert the frozen contract itself on every read, which catches a contract break on the first read rather than as a confusing downstream failure; criterion 34 scopes that assertion by Match phase, because R9.17 and R9.19 declare the result field and the per-Arena Stroke fields only while the Match phase is `MATCH_COMPLETE` and every per-Arena flow would otherwise fail on its first overlay read. Criterion 21's timeout is wall-clock time and `MAX_SHOT_DURATION_SECONDS` is simulated time under R4.12, so the comparison is stated as the wall-clock time in which that simulated span elapses, which criterion 25 makes bounded by keeping the browsing context visible and R3.18 out of the path. `AGENT_STEP_BUDGET_PER_FLOW`, `STATUS_POLL_INTERVAL_MILLISECONDS` and `STATUS_POLL_TIMEOUT_SECONDS` are declared by the Verification_Harness in this requirement rather than in the Constants_Module, because none is a physics, world-scale, simulation-timing, or gameplay tuning quantity and R4.18 is therefore untouched. Budget arithmetic worth the owner's attention: with A-1 true a Shot costs roughly two to three Agent_Steps once its wait is counted, so 15 Agent_Steps admits about five to seven Shots against a `MAX_STROKES_PER_ARENA` of 8, which means the step budget can bite before the stroke cap on Arenas 4 and 5; the response per criterion 15 is narrower flow scope, never easier Arenas. Criterion 35 keeps a first-frame asset load race from failing every flow once supplied files exist, while leaving every other anomaly class fatal under criteria 17 and 32. Criteria 20 through 35 are derived and unratified.*

---

### Requirement 16: Asset Placeholder Handling

**User Story:** As the project owner, I want asset requests collected in a list rather than blocking tasks, so that I can produce artwork in batches while development continues.

#### Acceptance Criteria

1. THE Asset_Registry SHALL be the only module holding a visual asset file reference or a colour palette value, and SHALL expose each one under a unique identifier, that item's Asset_Key, whose spelling is preserved for the lifetime of the project.
2. WHILE no asset file and no colour palette value is supplied for an Asset_Key, THE Asset_Registry SHALL resolve that Asset_Key to a procedurally drawn placeholder or to a declared default colour palette value.
3. WHEN an asset file or a colour palette value is supplied for an Asset_Key, THE Asset_Registry SHALL adopt it through a change to exactly one keyed reference and SHALL require no change in any other module.
4. WHEN a task would benefit from a supplied asset file, THE project SHALL complete and verify that task using a procedural placeholder, without deferring that task until that file is supplied.
5. WHEN a task would benefit from a supplied asset file or a supplied colour palette value, THE project SHALL append exactly one entry to `docs/asset-requests.md` before recording that task as complete, stating the Asset_Key the supplied item will be bound to, the depicted subject or the styling role, the location of use, the pixel dimensions and the file format for an asset file request, and a status field whose value is exactly one of `REQUESTED`, `SUPPLIED`.
6. THE file `docs/asset-requests.md` SHALL exist from the first implementation increment, SHALL accumulate every asset request raised during the project, and SHALL retain every fulfilled entry with its status set to `SUPPLIED` rather than removing that entry.
7. THE Game_Client SHALL complete a full Match from Arena 1 through Arena 5 with every Asset_Key resolved to its procedural placeholder, and SHALL complete a full Match with any subset of Asset_Keys bound to supplied asset files.
8. THE Renderer and every other Asset_Registry consumer SHALL obtain each visual asset and each colour palette value by Asset_Key lookup from the Asset_Registry, and SHALL resolve it by no other means.
9. THE Asset_Registry SHALL declare, for each Asset_Key, a drawn size in world units and an anchor point that apply identically to that Asset_Key's procedural placeholder and to any asset file later bound to that Asset_Key, so that adopting a supplied asset file changes neither the drawn size nor the drawn position of that element.
10. IF an asset file bound to an Asset_Key is absent, fails to load, or has not finished loading by the frame in which that Asset_Key is first drawn, THEN THE Asset_Registry SHALL resolve that Asset_Key to its procedural placeholder for that frame and SHALL record an anomaly entry naming that Asset_Key.

*Criteria 8 through 10 are appended so criteria 1 through 7 keep their numbers. Criterion 5 replaces a passive criterion with a named actor and binds the entry to the Asset_Key that will consume the file, which is what makes dropping a delivered file into the right slot mechanical rather than guesswork; the status field is what lets one running list serve the owner's batch workflow. Criteria 1 and 8 together make criterion 3's one-line-change promise enforceable, since one keyed declaration site is not enough without forbidding consumers from reaching around it. Criterion 9 holds a supplied file to the drawn size and anchor point its placeholder already used, so a delivered asset cannot shift the layout. Criterion 10 keeps a half-supplied asset set playable, which is the likely real state for most of the project. Colour palettes ride the same Asset_Key mechanism because a palette value is not a file reference and had no home under the former criterion 1.*

---

### Requirement 17: Language, Build, and Dependency Constraints

**User Story:** As a developer, I want the stack fixed and dependency additions gated, so that the project stays small and predictable.

#### Acceptance Criteria

1. THE Game_Client and THE Game_Server SHALL be written in TypeScript and SHALL compile under one shared base TypeScript compiler configuration in which `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` are enabled, and in which neither the Game_Client nor the Game_Server overrides any of those three settings.
2. THE Game_Client SHALL use Vite as its development server and as its production build tool, and SHALL use no second development server and no second bundler.
3. THE Game_Client SHALL draw every element rendered inside the rendering canvas through Three.js.
4. THE Game_Server SHALL use Colyseus for room management and state synchronisation.
5. THE Physics_Engine SHALL implement velocity integration, friction decay, wall reflection, and Hole radius checking without a third-party physics library, and SHALL take every physics, world-scale, and tuning value it uses from the Constants_Module and every geometry value from the Arena_Registry.
6. WHEN a dependency outside the set consisting of TypeScript, Vite, Three.js, Colyseus together with the Colyseus browser client library used by the Game_Client, and the test tooling recorded as approved under this criterion is needed, THE project SHALL obtain the product owner's recorded approval before that dependency is added to the Game_Client, the Game_Server, or the shared modules.
7. IF the TypeScript compiler reports a type error in the Game_Client sources, in the Game_Server sources, or in the shared modules, THEN THE build SHALL fail and SHALL produce no build output.
8. THE Physics_Engine, THE Constants_Module, and THE Arena_Registry SHALL each exist as exactly one module, consumed by both the Game_Client and the Game_Server from one shared source location.
9. THE Physics_Engine, THE Constants_Module, and THE Arena_Registry SHALL import neither Three.js nor Colyseus, and SHALL reference no browser-only interface and no server-only interface, so that the identical module executes unchanged in the Game_Client and in the Game_Server.
10. THE project SHALL provide exactly one command that compiles the Game_Client sources, the Game_Server sources, and the shared modules, runs the full declared test suite, and reports failure when that compilation reports a type error or when any test in that suite fails.

*Criteria 8 through 10 are appended so criteria 1 through 7 keep their numbers. Criteria 8 and 9 give R10.5, Q-3 and R18.11 their structural teeth: one copy of the simulation modules, loadable from either runtime, so the Game_Server and the Game_Client cannot drift into separate physics, and nothing can make the Physics_Engine unloadable on the Game_Server by importing Three.js into it. Criterion 3 is scoped to what is drawn inside the canvas so that it does not contradict R9.1's DOM overlay. Criterion 6 previously exempted "the declared test tooling" without declaring any, so the exemption pointed at nothing; it now covers only tooling with a recorded approval, which leaves it empty until the owner rules. Three decisions in this requirement remain the product owner's and are recorded as open in Resolved Decisions: the test runner and the property-based testing library that R18.32 and R18.33 require, which stay inside criterion 6's gate until an approval is recorded and which block writing the first test; whether the gate in criterion 10 also fails on lint findings, which would itself add a gated dependency; and whether a Node runtime version and a browser engine baseline are pinned, noting that R10.3 through R10.5 already remove the trigonometric exposure and R10.7 absorbs residual drift up to `POSITION_DIVERGENCE_TOLERANCE`. The stricter reading of "strict mode" in criterion 1, adding `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` beyond the `strict` flag, is a derived choice and is cheap to overrule.*

---

### Requirement 18: Correctness Properties for Property-Based Testing

**User Story:** As a developer, I want the invariants that matter expressed as properties, so that many generated cases exercise them rather than a handful of examples.

#### Acceptance Criteria

##### Status Token State Machine

1. FOR ALL instants during a Match, THE Status_Token SHALL hold exactly one value drawn from the declared set of four strings.
2. FOR ALL Shots fired with any aim angle on the grid declared in R7.16, any power value on the grid declared in R7.15, from the declared spawn point or from any Ball position inside the Playfield clearing every wall and every static obstacle by at least `BALL_RADIUS` reduced by `MAX_PENETRATION_TOLERANCE`, in any Arena in the Course, THE Status_Token SHALL reach one of `BALL_AT_REST`, `IN_HOLE`, or `OUT_OF_BOUNDS` within `MAX_SHOT_DURATION_SECONDS` of simulated time (termination property).
3. FOR ALL Simulation_Step sequences, THE Status_Token SHALL transition only along the edges declared in R5.16, SHALL make no other transition, and SHALL hold at `BALL_MOVING` until the Rest_Debounce condition, the Hole capture condition, the out-of-bounds condition, the maximum-shot-duration condition, or a published Shot rejection is satisfied.
4. FOR ALL Shots, THE Game_Client SHALL set the Status_Token to `BALL_AT_REST` only while Ball velocity is exactly zero on both axes.
5. FOR ALL Simulation_Step sequences in which Ball speed is below `REST_SPEED_THRESHOLD` for fewer than `REST_DEBOUNCE_STEPS` consecutive steps and then reaches that threshold, THE Status_Token SHALL hold at `BALL_MOVING`, and THE test suite SHALL cover this property by advancing the Physics_Engine with generated velocity sequences directly rather than only through Shots fired from a spawn point (no premature rest property).

##### Physics Invariants

6. FOR ALL Simulation_Steps in which a Ball contacts no surface and in which that Ball's speed before that step is at or above `REST_SPEED_THRESHOLD`, THE Ball's speed after that step SHALL be strictly lower than its speed before that step (monotonic decay property).
7. FOR ALL Simulation_Steps in which a Ball contacts a surface, THE Ball's speed after that step SHALL be no greater than its speed before that step (no energy gain property).
8. FOR ALL Shots in an Arena declaring every Playfield edge as walled, THE Ball's centre SHALL remain inside the Playfield bounds at every Simulation_Step, and SHALL come no closer to any walled edge than `BALL_RADIUS` reduced by `MAX_PENETRATION_TOLERANCE` (containment property).
9. FOR ALL Shots at any aim angle on the declared angle grid and any power value on the declared power grid, THE Ball SHALL end every Simulation_Step overlapping no wall and no static obstacle by more than `MAX_PENETRATION_TOLERANCE` (no-tunnel property).
10. FOR ALL Shots at `POWER_MAX_PERCENT`, which launch at `MAX_LAUNCH_SPEED`, against a wall whose shorter side measures `MIN_WALL_THICKNESS`, at every aim angle on the declared angle grid, THE Ball SHALL remain on its approach side of that wall (no-tunnel-at-max-speed property).
11. FOR ALL pairs of identical initial states and identical launch velocity vectors, THE Physics_Engine SHALL produce Ball positions and Ball velocities that are exactly equal at every Simulation_Step index of the two runs (determinism property).
12. FOR ALL launch velocity vectors and FOR ALL groupings of a given Simulation_Step count into per-invocation batches of no more than `MAX_CATCHUP_STEPS_PER_FRAME` steps, THE Physics_Engine SHALL produce exactly equal terminal Ball positions, and THE Physics_Engine SHALL advance only by a Simulation_Step count supplied by its caller and SHALL read no wall-clock time source (frame-rate independence property).
13. FOR ALL pairs of power values on the declared power grid, THE mapping from power percentage to launch speed SHALL be strictly increasing (monotonic power property).
14. FOR ALL power values in the declared range, THE Carry_Distance on an unobstructed line SHALL be no greater than `MAX_CARRY_DISTANCE` increased by `POSITION_DIVERGENCE_TOLERANCE` (carry bound property).
15. FOR ALL Simulation_Step counts, THE Moving_Obstacle position SHALL be a function of that step count and the obstacle's declared path alone, and THE Physics_Engine SHALL read no wall-clock time source when advancing it (single-clock property).

##### Turn Enforcement

16. FOR ALL sequences of Shot requests from both Players in any interleaving, THE Game_Server SHALL accept a Shot only from the Active_Player (turn exclusivity property).
17. FOR ALL sequences of Shot requests, THE count of Shots accepted by the Game_Server from a Player while that Player is not the Active_Player SHALL be zero.
18. FOR ALL rejected Shot requests, THE Game_Server SHALL leave the Active_Player designation, every Stroke count, and every Ball position unchanged (rejection has no side effects property).
19. FOR ALL Match states in which the Match phase is `IN_PROGRESS` and at least one Player is connected, THE Game_Server SHALL designate exactly one Active_Player (liveness property).
20. FOR ALL disconnect events at any point in a Match in which at least one Player remains connected, THE Game_Server SHALL reach the Match phase `MATCH_COMPLETE` within `MAX_STROKES_PER_ARENA` accepted Shots per remaining Arena per connected Player (no-stall property).

##### Stroke Accounting

21. FOR ALL Matches, a Player's running total SHALL equal the sum of that Player's per-Arena Stroke counts across the Arenas that completed in that Match, excluding every Arena preceding the Arena at which that Match started under `START_AT_ARENA` (accounting identity property).
22. FOR ALL accepted Shots, THE increase in the firing Player's per-Arena Stroke count SHALL be exactly 1 (unit cost property).
23. FOR ALL rejected Shot requests, THE change in every Stroke count SHALL be zero.
24. FOR ALL Shot sequences, a Player's per-Arena Stroke count SHALL be no lower than its value at the preceding Game_Server publication for that Arena (monotonic strokes property).
25. FOR ALL Players marked Holed_Out in an Arena, that Player's Stroke count for that Arena SHALL hold its recorded value for the remainder of the Match (frozen score property).
26. FOR ALL Players in any Arena, that Player's Stroke count for that Arena SHALL be no greater than `MAX_STROKES_PER_ARENA` (bounded strokes property).
27. FOR ALL disconnect events, THE disconnected Player's per-Arena Stroke counts and running total SHALL hold their values recorded at the moment of disconnect (preservation property).

##### Arena Data and Round Trips

28. FOR ALL five Arena definitions, THE Arena_Registry validation SHALL complete without raising a load-time error.
29. FOR ALL five Arena definitions, THERE SHALL EXIST a sequence of no more than the Arena's Par plus one Shots, each drawn from the declared angle grid and the declared power grid, that ends with the Ball declared holed, and THE test suite SHALL evaluate this property by replaying one recorded witness Shot sequence per Arena rather than by generated-input sampling or by search over Shot sequences (reachability property).
30. FOR ALL five Arena definitions, THE definition the Arena_Registry exposes to the Renderer and to the Physics_Engine SHALL be equivalent, field for field, to the declared definition (round-trip property).
31. FOR ALL Debug_Overlay states, THE field values the Debug_Overlay produces from Game_Server-published state and from local Game_Client state SHALL be equivalent to those underlying state values, and THE read-back of those field values from the DOM SHALL be covered by an integration test rather than by a property-based test (overlay round-trip property).

##### Test Method Selection

32. WHERE a behaviour varies meaningfully with generated input, executes without an external service call, and is decidable without a solver and without a search over Shot sequences, THE test suite SHALL cover that behaviour with a property-based test.
33. WHERE a behaviour depends on Colyseus transport, browser lifecycle, DOM read-back, or another external service, THE test suite SHALL cover that behaviour with an integration test using between one and three representative examples.

##### Input Defaults, Match Result, and Single Occupancy

*These properties follow from the resolution of Q-2, Q-7 and Q-11. They are appended so that properties 1 through 33 keep their numbers.*

34. FOR ALL turns in a Match, THE Debug_Overlay SHALL report the aim angle as `DEFAULT_AIM_DEGREES` and the power value as `DEFAULT_POWER_PERCENT` at the first instant of that turn, for every sequence of aim and power adjustments made before that turn began (turn reset property).
35. FOR ALL power values reachable by any sequence of power adjustment presses, THAT power value SHALL be a member of the power grid declared in R7.15 (power grid property). **⚠ ASSUMPTION A-1 (UNVERIFIED)**
36. FOR ALL Matches in which every Player becomes marked DNF, THE Score_Keeper SHALL record no winner, SHALL set the result to `VOID`, and SHALL preserve every Stroke count held at the moment of the last disconnect (void match property).
37. FOR ALL Arenas played WHERE `ALLOW_SINGLE_OCCUPANT_START` is enabled and exactly one Player is connected, THE Game_Server SHALL accept consecutive Shots from that Player and SHALL reach the Match phase `MATCH_COMPLETE` after Arena 5 (single occupancy progression property).

##### Generators, Shrinking, and Added Coverage

*These properties pin the generator domains, the failure-reporting obligation, and the coverage gaps found while auditing properties 1 through 37 against the rest of this document. They are appended so that properties 1 through 37 keep their numbers.*

38. FOR ALL property-based tests declared under the Status Token State Machine and Physics Invariants headings, THE test suite SHALL draw the aim angle from the grid declared in R7.16, the power value from the grid declared in R7.15, the Arena from all five Arena definitions, the initial Ball position from the positions inside the Playfield clearing every wall and every static obstacle by at least `BALL_RADIUS` reduced by `MAX_PENETRATION_TOLERANCE`, and the Simulation_Step count from zero up to `MAX_SHOT_DURATION_SECONDS` multiplied by `SIMULATION_HZ` (generator domain property).
39. FOR ALL property-based tests declared under the Turn Enforcement, Stroke Accounting, and Input Defaults, Match Result, and Single Occupancy headings, THE test suite SHALL draw Shot requests from both Player identities in every interleaving, the disconnect event from any Simulation_Step index within a Match, each per-Arena Stroke count from zero through `MAX_STROKES_PER_ARENA`, the Arena from all five Arena definitions, and the value of `ALLOW_SINGLE_OCCUPANT_START` from both enabled and disabled (match generator domain property).
40. FOR ALL failing property-based tests, THE test suite SHALL report a minimal failing case reached by shrinking, SHALL name that case's Arena, aim angle, power value, initial Ball position, and request sequence, and SHALL report the generator seed that reproduces it (shrinking property).
41. FOR ALL Shot requests failing more than one precondition, THE Game_Server SHALL return exactly one rejection reason, selected in the order declared in R11.9; and FOR ALL join requests failing more than one precondition, THE Game_Server SHALL return exactly one rejection reason, selected in the order `ROOM_NOT_FOUND`, `ROOM_FULL`, `MATCH_ALREADY_STARTED` (rejection precedence property).
42. FOR ALL rejected Shot requests, THE returned reason SHALL be exactly one member of the set declared in R8.11; and FOR ALL rejected join requests and rejected room creation requests, THE returned reason SHALL be exactly one member of the set `ROOM_FULL`, `ROOM_NOT_FOUND`, `MATCH_ALREADY_STARTED`, `START_AT_ARENA_REFUSED`; with the spelling and the casing of every member of both sets preserved for the lifetime of the project (closed rejection reason set property).
43. FOR ALL Match states, THE set of field identifiers the Debug_Overlay exposes SHALL equal the set Requirement 9 and R10.15 declare for that Match phase, with no declared identifier absent and no additional identifier present, and the spelling of each identifier SHALL be unchanged across every state transition (overlay contract completeness property).
44. FOR ALL Shots whose trajectory brings the Ball's centre to within `HOLE_RADIUS` of the Hole centre while that Ball's speed is at or above `HOLE_CAPTURE_MAX_SPEED` at every such Simulation_Step, THE Physics_Engine SHALL declare no capture and THE Status_Token SHALL not reach `IN_HOLE` for that Shot (capture threshold property).
45. FOR ALL Shots declared out of bounds, THE Ball's position after the reset SHALL equal the position recorded immediately before that Shot was fired, SHALL lie inside the Playfield clearing every wall and every static obstacle by at least `BALL_RADIUS` reduced by `MAX_PENETRATION_TOLERANCE`, and THE Ball's velocity SHALL be exactly zero on both axes (reset legality property).
46. FOR ALL Arena advances, each Player's running total after the advance SHALL equal that Player's running total before the advance plus that Player's Stroke count for the Arena just completed, each Player's recorded Stroke count for every previously completed Arena SHALL be unchanged, and each Player SHALL hold zero Strokes for the newly entered Arena (advance accounting property).
47. FOR a Shot at `POWER_MAX_PERCENT` on an unobstructed line, THE Carry_Distance the Physics_Engine produces SHALL equal the `MAX_CARRY_DISTANCE` that R4.16 derives to within `POSITION_DIVERGENCE_TOLERANCE` (carry derivation agreement property).

---

## Out of Scope

These are explicit non-goals, recorded as scope boundaries rather than as testable requirements.

| Excluded | Note |
|---|---|
| 3D gameplay | Rendering runs through Three.js but the game plays in one plane. |
| Sound | No audio of any kind. |
| Accounts, authentication, persistence | No user records, no saved matches. |
| Matchmaking and lobbies | A room code is the only join mechanism. |
| More than two Players | Two Player slots per room, hard limit. |
| Mobile and touch controls | Desktop keyboard only. |
| Spectator mode | Only the two Player slots may observe a Match. |
| Leaderboards | No cross-match record keeping. |
| Reconnection and session resume | A returning Player joins as a new session. |
| Required sprite assets | Every visual works procedurally; supplied assets are an optional upgrade. |
| Third-party physics engines | No Rapier, Matter, Box2D, Planck, or equivalent. |

---

## Resolved Decisions

A decision log. Every question previously open is answered. Reasoning is recorded only where the product owner gave one.

**Q-1 — Agent step accounting.** One Agent_Step dispatches a batched key sequence. Resolved as an assumption rather than a design decision, because it is a property of Kane CLI rather than of this game; recorded as A-1 in [Unverified Assumptions](#unverified-assumptions). *R4.13, R7.1 through R7.4, R7.15, R15.3, R15.4, R15.16, R18.35.*

**Q-2 — Solo verification path.** Option (c): the Game_Server configuration flag `ALLOW_SINGLE_OCCUPANT_START` permits a single-occupant room to play the Course through. No separate solo practice mode. Owner's reasoning: one code path instead of two; it doubles as the answer to what `P1` may do before `P2` joins; and verification exercises the real game rather than a special mode that could drift from it. Turn enforcement is still tested, in a dedicated two-client flow rather than inside every Arena flow. *R1.15, R1.16, R1.18, R4.20, R15.10, R15.18, R15.19, R18.37.*

**Q-3 — Simulation ownership.** Accepted as written. Game_Server and Game_Client both run the identical deterministic simulation; the Game_Server publishes discrete Shot outcomes rather than per-Simulation_Step positions; the Debug_Overlay takes match-level fields from the Game_Server and the Status_Token, aim angle, and power value from local state; divergence beyond `POSITION_DIVERGENCE_TOLERANCE` snaps to the Game_Server value and records an anomaly. *R10.4 through R10.9.*

**Q-4 — Power granularity.** The fine-adjust modifier is dropped and `POWER_STEP_PERCENT` becomes 5 globally. Owner's reasoning: with Agent_Step batching, finer increments cost nothing in agent steps, and one less key is one less thing to specify and test. Under the Q-6 mapping one 5 percent step shifts unobstructed Carry_Distance by roughly 45 world units, down from about 67 under the former 10 percent step and 600 unit per second maximum, against a `HOLE_RADIUS` of 18. The reachable power grid is 10, 15, 20 through 100, which is 19 values, and `DEFAULT_POWER_PERCENT` of 50 sits on that grid. Revisit if A-1 proves false. *R4.13, R7.15; former R7.15 deleted.*

**Q-5 — Out-of-bounds reachability.** Accepted as written. Per-edge wall flags in Arena data, with at least one Arena declaring an open edge so `OUT_OF_BOUNDS` is reachable through play. *R2.1, R6.6, R6.7, R6.8.*

**Q-6 — Maximum carry.** `MAX_LAUNCH_SPEED` is raised to 800 world units per second rather than restating the intent. That yields roughly 877 world units of Carry_Distance on a 1000-unit-wide Playfield, which makes the "crosses most of the playfield" goal true and stops Arena geometry from being constrained by an arbitrary number. `MAX_CARRY_DISTANCE` remains derived rather than hand-entered, and the load-time reachability validation stays. `MIN_LAUNCH_SPEED` stays 60. *R4.5, R4.16, R2.14, R18.14, R18.29.*

**Q-7 — DNF and the win condition.** The DNF rule is accepted as written: strokes preserved, DNF Players excluded from winner determination. Added: when every Player is marked DNF the Match is void, no winner is recorded, and the result reads `VOID` with the Match phase at `MATCH_COMPLETE` and both Players marked DNF. See the note under Requirement 12 for why no client observes that outcome. *R12.3, R12.11, R12.12, R13.6, R13.7, R13.13, R13.14, R9.17, R9.18, R18.36.*

**Q-8 — Ball ownership.** Accepted as written. Two Balls, one per Player, persisting for the duration of an Arena, transparent to each other, with the Status_Token referring to the Active_Player's Ball. *R3.12, R5.3.*

**Q-9 — Match state fields.** Accepted as written. Separate Match phase and participation fields rather than extra Status_Token values, with the frozen value sets `WAITING_FOR_OPPONENT` / `IN_PROGRESS` / `MATCH_COMPLETE` and `CONNECTED` / `DISCONNECTED`. *R9.11, R9.12, R9.17.*

**Q-10 — Angle convention.** Accepted as written. 0 degrees points along the positive horizontal axis, positive rotation is counter-clockwise, values wrap into 0 up to but excluding 360 in `ANGLE_STEP_DEGREES` steps, left arrow increases and right arrow decreases. *R7.1, R7.2, R7.6.*

**Q-11 — Defaults and persistence.** `DEFAULT_AIM_DEGREES` is 0 and `DEFAULT_POWER_PERCENT` is 50, and both reset at the start of every turn rather than persisting. Owner's reasoning: resetting is more predictable for an agent, and predictable beats convenient here. This overrides the earlier provisional in which aim and power persisted across a Player's own Shots within an Arena, so R7.10 is inverted from retain to reset. *R1.7, R4.19, R7.9, R7.10, R11.8, R18.34.*

**Q-12 — Maximum strokes per Arena.** `MAX_STROKES_PER_ARENA` is 8. Owner's reasoning: above Par 4 that is generous for a human and still bounds a Verification_Flow. *R4.15, R13.5, R15.13, R15.17, R18.26.*

**Q-13 — Tee order.** Accepted as written. `P1` tees off first in every Arena, and `P2` tees off when `P1` is disconnected. *R1.4, R1.13, R1.14.*

**Q-14 — Purpose of Par.** Accepted as written. Display only, plus an input to Arena reachability validation. Excluded from winner determination. *R13.11, R13.12, R2.14.*

**Q-15 — Room cleanup.** Accepted as written. The room is disposed when the last Player leaves and when both Players are disconnected, with no grace period. *R1.12, R12.11.*

**Q-16 — What `P1` may do before `P2` joins.** Accepted as written, scoped to the `ALLOW_SINGLE_OCCUPANT_START` flag being disabled: aim and power adjust freely, Shot requests rejected with `MATCH_NOT_STARTED`. With the flag enabled the Match starts immediately for the single occupant instead. *R1.10, R1.11, R1.15.*

**Q-17 — Collision robustness.** Accepted as written. Radius-aware discrete collision, no sub-stepping and no swept collision. Updated for the Q-6 mapping: at `MAX_LAUNCH_SPEED` of 800 the Ball advances about 13.3 world units per Simulation_Step, while escaping a wall of `MIN_WALL_THICKNESS` 20 within one step would require displacement greater than 20 plus twice `BALL_RADIUS`, which is 40 world units. The margin is about 3 times. *R3.8, R2.13, R4.14, R18.9, R18.10.*

**Q-18 — Tie handling.** Accepted as written. Two Players not marked DNF holding equal running totals produce the result `TIE`, with no tiebreak. *R13.9, R9.17.*

**Q-19 — Minimum power feel.** Accepted as written. `POWER_MIN_PERCENT` stays 10 and `MIN_LAUNCH_SPEED` stays 60, which carries roughly 66 world units over about 2.7 seconds. *R4.4, R4.5.*

**Q-20 — Harness shape.** Accepted as written, then tightened in meaning while folding in the rest of this document. Verification_Flows live under `verification/flows/`, one flow per file. The inventory is six flows, not one per Player per Arena: under single occupancy that collapses to five per-Arena flows plus the two-client turn-enforcement flow. Pass and fail read the hole-out field of R5.17 rather than the transient `IN_HOLE` Status_Token, which a poll could miss between reads. Fail also covers a `HOLED_OUT_BY_STROKE_CAP` hole-out, a poll timeout, a field value outside its declared set, an absent field identifier declared for the current Match phase, and a non-zero `overlay-anomaly-count`. `verification/defects.md` closes the feedback loop: classify, file a replayable reproduction, replay, close only on a full passing re-run. *R15.12, R15.13, R15.17, R15.8, R15.9, R15.27 through R15.31, R15.34.*

### Derived decisions taken while folding in the answers

These were not put to the owner. They follow from the answers above and are listed so they can be overruled cheaply.

**D-1 — `MATCH_ALREADY_STARTED`.** A join request against a room whose Match phase is `IN_PROGRESS` or `MATCH_COMPLETE` is rejected with this reason, distinct from `ROOM_FULL`. Admitting a second Player mid-Course would leave that Player with no Strokes for completed Arenas. *R1.17.*

**D-2 — `VOID` and the completion field.** The overlay result field's frozen value set becomes `P1` / `P2` / `TIE` / `VOID`, and a per-Player completion field with the frozen value set `NONE` / `DNF` is added, so that both are named before any test is written against them. *R9.17, R9.18.*

**D-3 — Two tolerances named.** R10.7 and R18.9 previously referred to an unnamed declared tolerance. They become `POSITION_DIVERGENCE_TOLERANCE` at 1 world unit and `MAX_PENETRATION_TOLERANCE` at 0.5 world units, declared in Requirement 4 so that it stays the single declaration site for tuning numbers. Both values are concrete but unratified. *R4.21, R4.22, R10.7, R18.9.*

**D-4 — Q-20 values are concrete but unratified.** The directory path, the one-flow-per-file rule, and the pass and fail conditions were chosen to close R15.12 and R15.13 rather than supplied by the owner.

**D-5 — Adjustment while waiting does not carry into a turn.** R11.6 lets a non-Active_Player adjust aim and power locally, while Q-11 resets both at the start of every turn. Rather than dropping either, R11.8 states the interaction: adjustment while waiting keeps the indicators live and observable, and it is discarded when the turn begins.

**D-6 — Collision primitive vocabulary.** Every wall, every static obstacle and the Moving_Obstacle is an axis-aligned rectangle whose shorter side is at least `MIN_WALL_THICKNESS`. Arbitrary polygons and circles are excluded, which keeps reflection to a per-axis test and keeps the Q-17 tunnelling margin meaningful for every surface. *R2.13.*

**D-7 — Arena 4 carries the open Playfield edge.** Q-5 required at least one Arena with an open edge but named none, which left the out-of-bounds Verification_Flow with no fixed target. Arena 4 is the choice: out-of-bounds risk belongs where power decisions bite, Arena 1 stays a safe tutorial, Arena 3's precision stays bounded, and Arena 5 does not compound timing with out-of-bounds. *R2.19.*

**D-8 — Intra-step operation order.** R3.14 fixes a seven-operation order, from which three previously undetermined behaviours follow: a Ball may be captured on the Simulation_Step it reflects, Hole capture outranks out of bounds when both fire, and a resting Ball is excluded from integration so it cannot jitter. *R3.14, R3.15, R3.16.*

**D-9 — Swept capture test for the Hole only.** R6.1 tests capture against the path traced across a Simulation_Step, while R3.8 keeps the endpoint test for every Collision_Surface. Q-17's margin argument holds for walls and obstacles but not for the Hole, which has no material behind it. The tension with Q-17 is recorded in the Requirement 6 note rather than resolved silently. *R6.1, R3.8.*

**D-10 — Server-derived launch velocity.** The Game_Server derives the launch velocity vector once and broadcasts both components; the Game_Client uses that vector verbatim and derives no part of it from the angle. This confines every trigonometric evaluation to one runtime, because `Math.sin`, `Math.cos` and `Math.atan2` are implementation-approximated in ECMAScript and independent derivation in a Node runtime and a browser runtime can differ in the last bits, which would compound into a divergence on every Shot. *R10.3, R10.4, R10.5, R8.4.*

**D-11 — Per-Player hole-out field.** A latched hole-out field with the frozen values `NOT_HOLED_OUT` / `HOLED_OUT_BY_CAPTURE` / `HOLED_OUT_BY_STROKE_CAP` carries the durable clear-or-cap signal, because the `IN_HOLE` Status_Token is transient and derived from the Active_Player and a polling flow could miss it between reads. The Verification_Harness pass and fail conditions read this field rather than the token. *R5.17, R9.23, R13.16, R15.8, R15.13, R15.17.*

**D-12 — `START_AT_ARENA`.** A room creation parameter, permitted only where `ALLOW_SINGLE_OCCUPANT_START` is enabled, that lets a Verification_Flow enter its Arena without playing the preceding Arenas. Without it, flows for Arenas 2 through 5 would have to play every earlier Arena and exhaust the step budget, and R15.15 forbids making the Arenas easier instead. *R1.22, R1.23, R15.20.*

**D-13 — Suspended-tab simulated time is discarded, not replayed.** R3.3's catch-up cap and a guarantee of constant Simulation_Steps per second of wall-clock time cannot both hold, so a suspended or throttled time source loses simulated time, records an anomaly, and the Verification_Harness is obliged to keep its browsing context visible. *R3.17, R3.18, R14.9, R15.25.*

**D-14 — Two additional overlay fields and their identifiers.** `overlay-last-rejection` exposes the Shot rejection reason so the two-client turn-enforcement flow can assert on `NOT_YOUR_TURN` through the overlay alone, and `overlay-anomaly-count` exposes the anomaly total so divergence, synchronisation, discard, overlap, duration and asset anomalies are observable to a flow. Both fall under the R9.13 and R9.16 freeze. *R9.21, R9.22, R9.25, R10.15, R15.32.*

**D-15 — Overlay field identifiers and text formats.** Every exposed field carries a `data-testid` whose value is declared in Requirement 9, and every value is the bare trimmed text content with no label and no unit symbol. R9.13 previously required a stable identifier and named none, so no Verification_Flow could be written against it. `data-testid` is used rather than `id` so that styling and layout changes cannot collide with the contract. *R9.2 through R9.25.*

**D-16 — Six named constants and one shared geometry module.** `MAX_CATCHUP_STEPS_PER_FRAME`, `ROOM_CODE_LENGTH`, `ROOM_CODE_ALPHABET`, `DISCONNECT_DETECTION_SECONDS`, `DISCONNECT_NOTICE_SECONDS`, `AIM_INDICATOR_MIN_LENGTH` and `AIM_INDICATOR_ANGLE_TOLERANCE_DEGREES` were named and given concrete values so that no criterion depends on an undeclared number, and R2.18 admits one geometry module so that Arena validation and simulation share their distance and overlap math rather than duplicating it. Every value is unratified. *R4.27 through R4.32, R2.18.*

**D-17 — Three new rejection reasons and two request-scoped reason sets.** `ROOM_NOT_FOUND`, `ARENA_ADVANCE_IN_PROGRESS`, `START_AT_ARENA_REFUSED` and `INVALID_SHOT_ARGUMENT` were added, and the reason sets are split by request kind: Shot rejections in R8.11, join and room-creation rejections in R18.42. Precedence is declared in R11.9 for Shot requests and in R18.41 for join requests, because a Verification_Flow asserting on an exact string needs one deterministic reason when several preconditions fail. *R1.19, R1.21, R1.23, R8.8, R8.11, R11.9, R18.41, R18.42.*

### Open decisions for the product owner

These are not answered and are not assumptions about external behaviour. Each blocks or shapes work and each needs the owner's call.

**O-1 — Test runner and property-based testing library.** R18.32 requires property-based tests and R18.33 requires integration tests, so a PBT library and a test runner are not optional. R17.6 gates every dependency on the owner's recorded approval and the owner asked to be consulted before any dependency is chosen, so neither has been selected. This blocks writing the first test and is the decision to make soonest.

**O-2 — Whether the single build-and-test command also fails on lint findings.** R17.10 declares the command and R17.7 fails the build on type errors. Adding a linter would itself be a gated dependency under R17.6.

**O-3 — Whether a Node runtime version and a browser engine baseline are pinned.** R10.3 through R10.5 remove the trigonometric exposure from the shared simulation and R10.7 absorbs residual drift up to `POSITION_DIVERGENCE_TOLERANCE`, so this is a hardening decision rather than a blocker.

**O-4 — Ratification of the derived values.** Every value in D-3, D-11, D-12, D-14, D-15 and D-16, and the Verification_Harness values in R15.4, R15.21 and R15.31, were chosen to close a gap rather than supplied. They are cheap to overrule now and expensive to change once tests assert on them, because R9.16 freezes overlay identifiers and value sets for the lifetime of the project.

**O-5 — Whether the step budget survives Arenas 4 and 5.** R18.29 guarantees the Hole is reachable within Par plus one, which is five Shots on Arenas 4 and 5. At two to three Agent_Steps per Shot that consumes 10 to 15 of the 15 available, so those two flows have no slack. R15.15 rules out easing the Arenas, so the options are a larger budget, narrower flows, or accepting the risk. This interacts with A-1.

---

## Unverified Assumptions

### A-1 — One Agent_Step dispatches a batched key sequence

**The assumption.** One Kane CLI agent step can dispatch a key sequence containing more than one keypress, for example "press ArrowLeft four times", rather than being limited to a single keypress per step.

**Why it is not a design decision.** This is an empirical property of Kane CLI's browser driver, not a choice this project gets to make. The product owner will test the batching behaviour directly before implementation starts. Until that test runs, every requirement resting on it carries the **⚠ ASSUMPTION A-1 (UNVERIFIED)** tag.

**What changes if it is false.** With one keypress per Agent_Step and `ANGLE_STEP_DEGREES` of 5, the aim angle has 72 reachable values and an arbitrary target costs up to 36 presses. With `POWER_STEP_PERCENT` of 5 and `DEFAULT_POWER_PERCENT` of 50, an arbitrary power costs up to 10 presses. One Shot would then cost up to 47 keypresses, which alone exceeds the 15-step Verification_Flow budget.

**Requirements that change if it is false.** R4.13 (`ANGLE_STEP_DEGREES` and `POWER_STEP_PERCENT` values), R7.1, R7.2, R7.3, R7.4 (per-press step sizes), R7.15 (the reachable power grid), R7.16 (the reachable aim angle grid), R15.3 (flow scope), R15.4 (the approximately 15 Agent_Step budget), R15.16 (the Agent_Step definition itself), R15.22 (Agent_Step accounting, which counts a read against the budget), R15.23 (the single-Agent_Step poll), R18.35 (the power grid property), R18.38 (the generator domains). R18.2, R18.9, R18.10 and R18.38 draw their inputs from the aim angle grid of R7.16 and the power grid of R7.15, so they change with those grids even though they carry no tag of their own.

**Fallback direction.** Coarsen control granularity: raise `ANGLE_STEP_DEGREES` and `POWER_STEP_PERCENT`, and revisit the Q-4 decision, both the 5 percent step and the deletion of the fine-adjust modifier, since that decision was made on the strength of this assumption. Per R15.15 the Course difficulty curve, the Par values, the Arena geometry, and the physics constants are not available as adjustments; narrow Verification_Flow scope instead. R15.22 and R15.23 are the criteria that decide whether the budget survives, because they fix whether a poll and a wait each cost an Agent_Step.
