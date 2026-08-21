// Physics_Engine - Requirement 3.
//
// Hand-written, no third-party physics library (R17.5). Every physics, world-scale and tuning value
// comes from the Constants_Module and every geometry value from the Arena_Registry (R17.5, R3.4), and
// the module imports neither Three.js nor any transport library and touches no browser-only
// interface (R17.9).
//
// Determinism (R3.13) is structural rather than promised: nothing here reads a clock, a random source
// or any ambient state. `step` is a pure function of the Arena and the Ball state handed to it, and it
// advances exactly one Simulation_Step (R3.1) - the caller supplies the step count, and the engine
// never asks how much wall-clock time has passed.
//
// R3.12: a Ball's contact detection sees walls, obstacles and walled Playfield edges, and never
// another Ball. That holds by construction, because `step` is given one Ball and cannot see any other.

import {
  BALL_RADIUS,
  FIXED_STEP_SECONDS,
  FRICTION_PER_STEP,
  HOLE_CAPTURE_MAX_SPEED,
  HOLE_RADIUS,
  MAX_PENETRATION_TOLERANCE,
  MAX_SHOT_DURATION_STEPS,
  PLAYFIELD_WIDTH,
  REST_DEBOUNCE_STEPS,
  REST_SPEED_THRESHOLD,
  WALL_RESTITUTION,
} from './constants.ts';
import { PLAYFIELD_BOUNDS, type ArenaDefinition } from './arenas.ts';
import {
  distanceBetweenPoints,
  distanceFromPointToRectangle,
  distanceFromPointToSegment,
  isPointInsideRectangle,
  rectangleOutwardNormal,
  type Rectangle,
  type Vector2,
} from './geometry.ts';

// ---------------------------------------------------------------------------------------------
// Ball state
// ---------------------------------------------------------------------------------------------

/**
 * What has become of a Ball. Distinct from the Status_Token of R5.1, which the Game_Client derives
 * from this together with local state; the engine reports outcomes and never touches the token.
 */
export type BallOutcome = 'IN_MOTION' | 'AT_REST' | 'HOLED' | 'OUT_OF_BOUNDS';

/** A Ball, as the engine sees it. Treated as immutable; every engine function returns a new one. */
export interface BallState {
  readonly position: Vector2;
  readonly velocity: Vector2;
  /** R3.14 operation 7 - consecutive Simulation_Steps whose end speed was sub-threshold. */
  readonly subThresholdSteps: number;
  /** Simulation_Steps elapsed since the Shot_Controller imparted velocity, for the R5.11 valve. */
  readonly stepsSinceLaunch: number;
  /**
   * R6.5, R8.6 - where the Ball sat immediately before launch velocity was imparted. The
   * Shot_Controller records it (task 6); the engine reads it when a Ball goes out of bounds, because
   * R6.5 resets to this position and explicitly **not** to the Arena's declared spawn point.
   */
  readonly preShotPosition: Vector2;
  readonly outcome: BallOutcome;
}

/** A Ball at rest at the given position, as an Arena's spawn placement or an out-of-bounds reset. */
export function createBallAtRest(position: Vector2): BallState {
  return {
    position,
    velocity: { x: 0, y: 0 },
    subThresholdSteps: 0,
    stepsSinceLaunch: 0,
    preShotPosition: position,
    outcome: 'AT_REST',
  };
}

/** Speed in world units per second. `Math.sqrt` is correctly rounded; `Math.hypot` is not. */
export function speedOf(ball: BallState): number {
  return Math.sqrt(ball.velocity.x * ball.velocity.x + ball.velocity.y * ball.velocity.y);
}

/**
 * R3.14 - a Ball is in motion for the whole of a Simulation_Step when its velocity is non-zero on at
 * least one axis at the start of that step. Operation 1 is descoped with the Moving_Obstacle, so that
 * is the only test; a Ball whose velocity is exactly zero is excluded from every operation, which is
 * what stops a Ball resting against a wall from jittering.
 */
export function isInMotion(ball: BallState): boolean {
  return ball.velocity.x !== 0 || ball.velocity.y !== 0;
}

// ---------------------------------------------------------------------------------------------
// Collision surfaces
// ---------------------------------------------------------------------------------------------

/**
 * One Collision_Surface. R2.1 declares no collision surface beyond the Playfield edges, the walls, the
 * obstacles and the Moving_Obstacle, so this covers all of them.
 *
 * `normalFrom` points from the surface toward the approach side - the side the Ball is on. That is the
 * direction R3.6 reflects across and R3.7 displaces along.
 */
interface CollisionSurface {
  readonly label: string;
  /** Distance from a Ball centre to the surface. Negative once the centre has passed an edge. */
  readonly distanceFrom: (centre: Vector2) => number;
  readonly normalFrom: (centre: Vector2) => Vector2;
}

/** Everything a repeated `step` call needs about one Arena, built once and reused. */
export interface ArenaCollision {
  readonly arena: ArenaDefinition;
  readonly surfaces: readonly CollisionSurface[];
}

function rectangleSurface(label: string, rect: Rectangle): CollisionSurface {
  return {
    label,
    distanceFrom: (centre) => distanceFromPointToRectangle(centre, rect),
    normalFrom: (centre) => rectangleOutwardNormal(rect, centre),
  };
}

/**
 * A walled Playfield edge, as a one-sided surface.
 *
 * An edge is a line rather than a rectangle, and the Ball is always on the inside of it, so the
 * distance is the signed inward offset and the normal is the constant inward direction. Expressing it
 * this way rather than as a thick rectangle outside the Playfield keeps R6.7's repositioning exact:
 * the Ball ends up `BALL_RADIUS` minus `MAX_PENETRATION_TOLERANCE` from the edge, not from some
 * arbitrary outer face.
 */
function edgeSurface(label: string, inwardNormal: Vector2, offsetFrom: (centre: Vector2) => number): CollisionSurface {
  return {
    label,
    distanceFrom: offsetFrom,
    normalFrom: () => inwardNormal,
  };
}

/**
 * Builds the ordered Collision_Surface list for an Arena.
 *
 * R3.15 resolves multiple simultaneous contacts "in the order in which the Arena_Registry declares
 * them". The registry declares walls, then obstacles, then per-edge flags, so that is the order used
 * here, with the four edges taken left, right, bottom, top. The order is fixed and documented because
 * R3.13 requires the result to be reproducible, not merely reasonable - though note that for
 * perpendicular surfaces, which is every pair of Playfield edges, the order cannot change the outcome.
 *
 * An open edge contributes no surface at all, which is exactly R6.8: no reflection there, and the
 * out-of-bounds condition decides what happens instead.
 */
export function createArenaCollision(arena: ArenaDefinition): ArenaCollision {
  const surfaces: CollisionSurface[] = [];

  for (const [index, wall] of arena.walls.entries()) {
    surfaces.push(rectangleSurface(`wall ${String(index)}`, wall));
  }
  for (const [index, obstacle] of arena.obstacles.entries()) {
    surfaces.push(rectangleSurface(`obstacle ${String(index)}`, obstacle));
  }

  if (arena.edges.left) {
    surfaces.push(
      edgeSurface('edge left', { x: 1, y: 0 }, (centre) => centre.x - PLAYFIELD_BOUNDS.minX),
    );
  }
  if (arena.edges.right) {
    surfaces.push(
      edgeSurface('edge right', { x: -1, y: 0 }, (centre) => PLAYFIELD_BOUNDS.maxX - centre.x),
    );
  }
  if (arena.edges.bottom) {
    surfaces.push(
      edgeSurface('edge bottom', { x: 0, y: 1 }, (centre) => centre.y - PLAYFIELD_BOUNDS.minY),
    );
  }
  if (arena.edges.top) {
    surfaces.push(
      edgeSurface('edge top', { x: 0, y: -1 }, (centre) => PLAYFIELD_BOUNDS.maxY - centre.y),
    );
  }

  return { arena, surfaces };
}

// ---------------------------------------------------------------------------------------------
// One Simulation_Step
// ---------------------------------------------------------------------------------------------

/**
 * Floating-point slack for the residual-overlap comparison of R3.16.
 *
 * Not a physics, world-scale or tuning value, so R4.18 does not reach it: depenetration leaves
 * *exactly* `MAX_PENETRATION_TOLERANCE` of overlap by construction, so comparing the recomputed
 * overlap against that same tolerance without slack would trip the bail-out on the last bits of the
 * arithmetic that produced it. Scaled by the Playfield width because that bounds the magnitudes the
 * arithmetic runs on.
 */
const RESIDUAL_OVERLAP_SLACK = Number.EPSILON * PLAYFIELD_WIDTH * 8;

/** What one Simulation_Step did. */
export interface StepOutcome {
  readonly ball: BallState;
  /** How many Collision_Surfaces reflected the Ball on this step. */
  readonly reflectionCount: number;
  /**
   * R3.16 fired: overlap survived contact resolution, so the Ball was returned to its step-start
   * position with zero velocity. The Game_Client records an anomaly naming the Arena, the Player and
   * the Shot parameters.
   */
  readonly residualOverlapAnomaly: boolean;
  /**
   * R5.11 fired: the Ball was still in motion after `MAX_SHOT_DURATION_SECONDS` of simulated time, so
   * the safety valve stopped it. The Game_Client records an anomaly naming the Arena, the Player, the
   * aim angle and the power value.
   */
  readonly shotDurationAnomaly: boolean;
  /**
   * The path the Ball's centre traced across this step, as one or more segments, including any
   * segment contact resolution introduced. This is what R6.1's Hole capture test runs against.
   */
  readonly pathSegments: readonly (readonly [Vector2, Vector2])[];
}

function addScaled(point: Vector2, direction: Vector2, scale: number): Vector2 {
  return { x: point.x + direction.x * scale, y: point.y + direction.y * scale };
}

const ZERO_VELOCITY: Vector2 = { x: 0, y: 0 };

/**
 * R6.1 - the Hole capture condition, as a path test rather than an endpoint test.
 *
 * The shortest distance from the Hole centre to the path the Ball's centre traced across the step,
 * including any segment a reflection within that step introduced, must be at or below `HOLE_RADIUS`,
 * and the end-of-step speed must be strictly below `HOLE_CAPTURE_MAX_SPEED`.
 *
 * The path test is the one place the project departs from R3.8's endpoint-only rule, and Requirement 6
 * records why: walls carry `MIN_WALL_THICKNESS` of margin behind them so a missed sample still gets
 * caught next step, while the Hole carries none, and a missed sample there is a capture the Player
 * earned and did not get.
 */
function isHoleCaptureSatisfied(
  holeCentre: Vector2,
  pathSegments: readonly (readonly [Vector2, Vector2])[],
  endOfStepSpeed: number,
): boolean {
  if (endOfStepSpeed >= HOLE_CAPTURE_MAX_SPEED) {
    return false;
  }
  return pathSegments.some(
    ([from, to]) => distanceFromPointToSegment(holeCentre, from, to) <= HOLE_RADIUS,
  );
}

/**
 * R6.4 - the out-of-bounds condition. The Ball's centre lies strictly outside the Playfield rectangle,
 * irrespective of direction of travel and speed, with a centre lying exactly on an edge counted as
 * inside.
 */
function isOutOfBounds(position: Vector2): boolean {
  return !isPointInsideRectangle(position, PLAYFIELD_BOUNDS);
}

/**
 * Advances one Simulation_Step.
 *
 * R3.14 fixes the operation order, and this follows it exactly. Operation 1, advancing the
 * Moving_Obstacle, is omitted with the Moving_Obstacle cut:
 *
 *   2. multiply the velocity of a Ball in motion by `FRICTION_PER_STEP` (R3.5 - once per step,
 *      before integration);
 *   3. displace by the velocity operation 2 left, times `FIXED_STEP_SECONDS` (R3.4);
 *   4. resolve contact against every Collision_Surface overlapped at the position operation 3 left
 *      (R3.6, R3.7, R3.8, R3.15), then apply the R3.16 bail-out;
 *   5. evaluate Hole capture against the path and the speed operation 4 left (R6.1);
 *   6. evaluate out of bounds against the position operation 4 left (R6.4);
 *   7. advance the rest-debounce counter against the speed operation 4 left, and zero the velocity on
 *      the step that completes it (R5.6, R5.8).
 *
 * Two precedence rules fall out of that order and are load-bearing. Hole capture is evaluated before
 * out of bounds, so a Ball satisfying both in one step is holed rather than lost. And a Ball whose
 * capture or out-of-bounds condition is satisfied skips every remaining operation of the step, so a
 * captured Ball never touches the debounce counter.
 *
 * A Ball that is not in motion is returned untouched, per R3.14's definition of a Ball in motion.
 */
export function step(collision: ArenaCollision, ball: BallState): StepOutcome {
  if (!isInMotion(ball)) {
    return {
      ball,
      reflectionCount: 0,
      residualOverlapAnomaly: false,
      shotDurationAnomaly: false,
      pathSegments: [],
    };
  }

  const stepStartPosition = ball.position;

  // -- operation 2: friction, exactly once, before integration -------------------------------
  const decayedVelocity: Vector2 = {
    x: ball.velocity.x * FRICTION_PER_STEP,
    y: ball.velocity.y * FRICTION_PER_STEP,
  };

  // -- operation 3: displace by the post-friction velocity ------------------------------------
  const integratedPosition: Vector2 = {
    x: stepStartPosition.x + decayedVelocity.x * FIXED_STEP_SECONDS,
    y: stepStartPosition.y + decayedVelocity.y * FIXED_STEP_SECONDS,
  };

  // -- operation 4: contact resolution --------------------------------------------------------
  //
  // R3.8 tests centre-to-surface distance against BALL_RADIUS exactly once per step, at the position
  // operation 3 produced. No sub-stepping and no swept test for surfaces: the overlapped set is
  // decided here, once, and does not grow while the loop below runs.
  const overlappedSurfaces = collision.surfaces.filter(
    (surface) => surface.distanceFrom(integratedPosition) < BALL_RADIUS,
  );

  let position = integratedPosition;
  let velocity = decayedVelocity;
  let reflectionCount = 0;

  for (const surface of overlappedSurfaces) {
    const normal = surface.normalFrom(position);
    const perpendicular = velocity.x * normal.x + velocity.y * normal.y;

    // R3.15 - skip a surface the velocity points away from, leaving that perpendicular component
    // unchanged. Without this a Ball leaving a surface it is still overlapping, which is the normal
    // state after depenetration leaves MAX_PENETRATION_TOLERANCE behind, would be reflected back
    // into it every step.
    if (perpendicular >= 0) {
      continue;
    }

    // R3.6 - reflect the perpendicular component, scale it by WALL_RESTITUTION, preserve the
    // parallel component. Subtracting (1 + e) times the perpendicular projection does both at once:
    // the new projection is -e times the old, and nothing parallel is touched.
    velocity = addScaled(velocity, normal, -(1 + WALL_RESTITUTION) * perpendicular);

    // R3.7 - displace along the outward normal on the approach side by the smallest distance that
    // leaves the overlap no greater than MAX_PENETRATION_TOLERANCE.
    const overlap = BALL_RADIUS - surface.distanceFrom(position);
    if (overlap > MAX_PENETRATION_TOLERANCE) {
      position = addScaled(position, normal, overlap - MAX_PENETRATION_TOLERANCE);
    }

    reflectionCount += 1;
  }

  const pathSegments: readonly (readonly [Vector2, Vector2])[] =
    position === integratedPosition
      ? [[stepStartPosition, integratedPosition]]
      : [
          [stepStartPosition, integratedPosition],
          [integratedPosition, position],
        ];

  // R3.16 - if any surface is still overlapped by more than the tolerance once resolution has
  // finished, the step is abandoned: the Ball returns to where it started the step and stops dead.
  // Every surface is re-checked, not only the ones resolved above, because depenetrating off one
  // surface can drive the Ball into another.
  const residualOverlap = collision.surfaces.some(
    (surface) =>
      BALL_RADIUS - surface.distanceFrom(position) >
      MAX_PENETRATION_TOLERANCE + RESIDUAL_OVERLAP_SLACK,
  );

  if (residualOverlap) {
    // R3.16 zeroes the velocity, which makes the Ball not in motion, so no later step would ever
    // process it again. The rest-debounce counter is therefore completed here rather than left
    // part-way: a zero-speed Ball is trivially below `REST_SPEED_THRESHOLD`, so treating the debounce
    // as satisfied on this step keeps the resulting Status_Token transition on R5.16's declared
    // `BALL_MOVING` to `BALL_AT_REST` rest-debounce edge. Leaving the counter part-way would strand the
    // token at `BALL_MOVING` until the R5.11 valve fired 15 simulated seconds later, which R5.12's
    // bound permits and no player would forgive.
    return {
      ball: {
        ...ball,
        position: stepStartPosition,
        velocity: ZERO_VELOCITY,
        subThresholdSteps: REST_DEBOUNCE_STEPS,
        stepsSinceLaunch: ball.stepsSinceLaunch + 1,
        outcome: 'AT_REST',
      },
      reflectionCount,
      residualOverlapAnomaly: true,
      shotDurationAnomaly: false,
      pathSegments,
    };
  }

  const endOfStepSpeed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
  const stepsSinceLaunch = ball.stepsSinceLaunch + 1;

  // -- operation 5: Hole capture --------------------------------------------------------------
  //
  // Ahead of out of bounds, so a Ball that drops in as it crosses an open edge is holed. On capture the
  // velocity goes to exactly zero and the centre is held at the Hole centre until the Match advances.
  if (isHoleCaptureSatisfied(collision.arena.hole, pathSegments, endOfStepSpeed)) {
    return {
      ball: {
        ...ball,
        position: collision.arena.hole,
        velocity: ZERO_VELOCITY,
        stepsSinceLaunch,
        outcome: 'HOLED',
      },
      reflectionCount,
      residualOverlapAnomaly: false,
      shotDurationAnomaly: false,
      pathSegments,
    };
  }

  // -- operation 6: out of bounds -------------------------------------------------------------
  //
  // R6.5 resets to the recorded pre-shot position, not to the Arena's declared spawn point. The Stroke
  // already counted for this Shot is retained, which is the Score_Keeper's business (R13.2).
  if (isOutOfBounds(position)) {
    return {
      ball: {
        ...ball,
        position: ball.preShotPosition,
        velocity: ZERO_VELOCITY,
        stepsSinceLaunch,
        outcome: 'OUT_OF_BOUNDS',
      },
      reflectionCount,
      residualOverlapAnomaly: false,
      shotDurationAnomaly: false,
      pathSegments,
    };
  }

  // -- operation 7: rest debounce -------------------------------------------------------------
  //
  // R3.14 operation 7 only counts. R5.6 is what zeroes the velocity, and only on the step the count
  // reaches `REST_DEBOUNCE_STEPS`, so a Ball that dips below the threshold and recovers keeps rolling
  // with its velocity intact (R5.8).
  const subThresholdSteps =
    endOfStepSpeed < REST_SPEED_THRESHOLD ? ball.subThresholdSteps + 1 : 0;

  if (subThresholdSteps >= REST_DEBOUNCE_STEPS) {
    return {
      ball: {
        ...ball,
        position,
        velocity: ZERO_VELOCITY,
        subThresholdSteps,
        stepsSinceLaunch,
        outcome: 'AT_REST',
      },
      reflectionCount,
      residualOverlapAnomaly: false,
      shotDurationAnomaly: false,
      pathSegments,
    };
  }

  // -- R5.11, R4.12: the maximum-shot-duration safety valve ------------------------------------
  //
  // Measured in simulated time, as `MAX_SHOT_DURATION_STEPS` Simulation_Steps since launch, never in
  // wall-clock time. The Ball stops where it is, and the Hole capture condition is re-evaluated
  // against that stopped position - a point test, since a stopped Ball is trivially under
  // `HOLE_CAPTURE_MAX_SPEED`. That re-evaluation is reachable only when the valve stops a Ball
  // overlapping the Hole at or above the capture speed, and it exists so the valve cannot strand a
  // Ball sitting in the Hole while the overlay reads `BALL_AT_REST`.
  if (stepsSinceLaunch >= MAX_SHOT_DURATION_STEPS) {
    const stoppedInHole = distanceBetweenPoints(position, collision.arena.hole) <= HOLE_RADIUS;
    return {
      ball: {
        ...ball,
        position: stoppedInHole ? collision.arena.hole : position,
        velocity: ZERO_VELOCITY,
        subThresholdSteps,
        stepsSinceLaunch,
        outcome: stoppedInHole ? 'HOLED' : 'AT_REST',
      },
      reflectionCount,
      residualOverlapAnomaly: false,
      shotDurationAnomaly: true,
      pathSegments,
    };
  }

  return {
    ball: {
      ...ball,
      position,
      velocity,
      subThresholdSteps,
      stepsSinceLaunch,
      outcome: 'IN_MOTION',
    },
    reflectionCount,
    residualOverlapAnomaly: false,
    shotDurationAnomaly: false,
    pathSegments,
  };
}

/** The result of advancing a caller-supplied number of Simulation_Steps. */
export interface AdvanceOutcome {
  readonly ball: BallState;
  /** Steps that actually did work. Steps after the Ball stopped are no-ops and are not counted. */
  readonly stepsExecuted: number;
  readonly reflectionCount: number;
  /** R10.15 - anomalies the Game_Client adds to `overlay-anomaly-count`. */
  readonly residualOverlapAnomalyCount: number;
  readonly shotDurationAnomalyCount: number;
}

/**
 * Advances up to `steps` Simulation_Steps, stopping early once the Ball is no longer in motion.
 *
 * Stopping early changes nothing: a step on a Ball whose velocity is exactly zero returns that Ball
 * untouched and does not advance `stepsSinceLaunch`, so the resulting state is identical to running the
 * full count. It matters only for speed, and task 14's grid search runs this a few million times.
 *
 * R3.1 and R3.17: the engine is advanced only by a caller-supplied step count and reads no wall-clock
 * time source of its own. The clock that decides how many steps to ask for lives in the Game_Client
 * (task 7), outside this module and outside the render callback.
 */
export function advance(collision: ArenaCollision, ball: BallState, steps: number): AdvanceOutcome {
  let current = ball;
  let reflectionCount = 0;
  let residualOverlapAnomalyCount = 0;
  let shotDurationAnomalyCount = 0;
  let stepsExecuted = 0;

  for (let index = 0; index < steps; index += 1) {
    if (!isInMotion(current)) {
      break;
    }
    const outcome = step(collision, current);
    current = outcome.ball;
    reflectionCount += outcome.reflectionCount;
    residualOverlapAnomalyCount += outcome.residualOverlapAnomaly ? 1 : 0;
    shotDurationAnomalyCount += outcome.shotDurationAnomaly ? 1 : 0;
    stepsExecuted += 1;
  }

  return {
    ball: current,
    stepsExecuted,
    reflectionCount,
    residualOverlapAnomalyCount,
    shotDurationAnomalyCount,
  };
}

/**
 * Runs a Shot to its terminal outcome, bounded by the `MAX_SHOT_DURATION_SECONDS` valve.
 *
 * R5.12 guarantees every accepted Shot reaches `BALL_AT_REST`, `IN_HOLE` or `OUT_OF_BOUNDS` within that
 * bound, so `MAX_SHOT_DURATION_STEPS` plus one is enough to reach it - the extra step is the one on
 * which the valve itself fires. Used by playtests and by task 14's grid search, never by the running
 * Game_Client, which advances the simulation from its own clock so the Ball is drawn while it rolls.
 */
export function simulateShotToRest(collision: ArenaCollision, ball: BallState): AdvanceOutcome {
  return advance(collision, ball, MAX_SHOT_DURATION_STEPS + 1);
}

/**
 * Largest overlap the Ball currently has with any Collision_Surface, in world units. Zero or negative
 * means clear.
 *
 * Exported so a playtest or a defect reproduction can assert R3.7's repositioning bound directly
 * rather than inferring it from behaviour.
 */
export function largestSurfaceOverlap(collision: ArenaCollision, ball: BallState): number {
  let largest = Number.NEGATIVE_INFINITY;
  for (const surface of collision.surfaces) {
    largest = Math.max(largest, BALL_RADIUS - surface.distanceFrom(ball.position));
  }
  return largest;
}
