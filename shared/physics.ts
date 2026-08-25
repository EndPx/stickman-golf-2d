// Physics_Engine - Requirement 3, as amended by A-2.
//
// Hand-written, no third-party physics library (R17.5). Every physics, world-scale and tuning value comes from
// the Constants_Module and every geometry value from the Arena_Registry (R17.5, R3.4), and the module imports
// neither Three.js nor any transport library and touches no browser-only interface (R17.9).
//
// Determinism (R3.13) is structural rather than promised: nothing here reads a clock, a random source or any
// ambient state. `step` is a pure function of the Arena and the Ball state handed to it, and it advances
// exactly one Simulation_Step (R3.1) - the caller supplies the step count, and the engine never asks how much
// wall-clock time has passed.
//
// A-2 changed the model from rolling on a plane to flying and rolling over terrain. Three things follow:
// gravity is applied every step, friction comes from one of two constants depending on whether the Ball is
// touching the ground, and the primary Collision_Surface is the terrain's local tangent line rather than a
// rectangle face. Obstacles keep the rectangle treatment unchanged.
//
// R3.12: a Ball's contact detection sees the terrain and the obstacles, and never another Ball. That holds by
// construction, because `step` is given one Ball and cannot see any other.

import {
  AIR_FRICTION_PER_STEP,
  BALL_RADIUS,
  BOUNCE_MIN_NORMAL_SPEED,
  FIXED_STEP_SECONDS,
  GRAVITY,
  HOLE_CAPTURE_MAX_SPEED,
  HOLE_RADIUS,
  MAX_PENETRATION_TOLERANCE,
  MAX_SHOT_DURATION_STEPS,
  PLAYFIELD_WIDTH,
  REST_DEBOUNCE_STEPS,
  REST_SPEED_THRESHOLD,
  ROLLING_FRICTION_PER_STEP,
  TERRAIN_RESTITUTION,
} from './constants.ts';
import type { ArenaDefinition } from './arenas.ts';
import {
  distanceBetweenPoints,
  distanceFromPointToRectangle,
  distanceFromPointToSegment,
  rectangleOutwardNormal,
  type Rectangle,
  type Vector2,
} from './geometry.ts';
import { signedDistanceToTerrain, type Terrain } from './terrain.ts';

// ---------------------------------------------------------------------------------------------
// Ball state
// ---------------------------------------------------------------------------------------------

/**
 * What has become of a Ball. Distinct from the Status_Token of R5.1, which the Game_Client derives from this
 * together with local state; the engine reports outcomes and never touches the token.
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
   * R6.5, R8.6 - where the Ball sat immediately before launch velocity was imparted. The Shot_Controller
   * records it; the engine reads it when a Ball goes out of bounds, because R6.5 resets to this position and
   * explicitly **not** to the Arena's declared tee.
   */
  readonly preShotPosition: Vector2;
  /** Whether the Ball was touching the terrain at the end of the last step. Selects which friction applies. */
  readonly grounded: boolean;
  readonly outcome: BallOutcome;
}

/** A Ball at rest at the given position, as an Arena's tee placement or an out-of-bounds reset. */
export function createBallAtRest(position: Vector2): BallState {
  return {
    position,
    velocity: { x: 0, y: 0 },
    subThresholdSteps: 0,
    stepsSinceLaunch: 0,
    preShotPosition: position,
    grounded: true,
    outcome: 'AT_REST',
  };
}

/** Speed in world units per second. `Math.sqrt` is correctly rounded; `Math.hypot` is not. */
export function speedOf(ball: BallState): number {
  return Math.sqrt(ball.velocity.x * ball.velocity.x + ball.velocity.y * ball.velocity.y);
}

/**
 * R3.14 - a Ball is in motion for the whole of a Simulation_Step when its velocity is non-zero on at least one
 * axis at the start of that step.
 *
 * Under A-2 this needs one addition that the top-down build did not: a Ball with exactly zero velocity that is
 * **not** resting on the ground is in motion, because gravity is about to move it. Without that clause a Ball
 * dropped from rest would hang in the air for ever.
 */
export function isInMotion(ball: BallState): boolean {
  if (ball.velocity.x !== 0 || ball.velocity.y !== 0) {
    return true;
  }
  return !ball.grounded;
}

// ---------------------------------------------------------------------------------------------
// Collision surfaces
// ---------------------------------------------------------------------------------------------

/** Everything a repeated `step` call needs about one Arena, built once and reused. */
export interface ArenaCollision {
  readonly arena: ArenaDefinition;
  readonly terrain: Terrain;
  readonly obstacles: readonly Rectangle[];
}

export function createArenaCollision(arena: ArenaDefinition): ArenaCollision {
  return { arena, terrain: arena.terrain, obstacles: arena.obstacles };
}

// ---------------------------------------------------------------------------------------------
// One Simulation_Step
// ---------------------------------------------------------------------------------------------

/**
 * Floating-point slack for comparing a world-unit distance against a world-unit bound.
 *
 * Not a physics, world-scale or tuning value, so R4.18 does not reach it. It exists because two comparisons in
 * this project test a quantity against the very bound that produced it: R3.16 compares the recomputed overlap
 * against the `MAX_PENETRATION_TOLERANCE` depenetration deliberately left behind, and R6.9 compares a resting
 * Ball's clearance against the `BALL_RADIUS` minus `MAX_PENETRATION_TOLERANCE` that contact resolution put it
 * at. Without slack both would trip on the last bits of their own arithmetic. Scaled by the viewport width
 * because that bounds the magnitudes involved.
 */
export const WORLD_COMPARISON_SLACK = Number.EPSILON * PLAYFIELD_WIDTH * 8;

/** What one Simulation_Step did. */
export interface StepOutcome {
  readonly ball: BallState;
  /** How many surfaces reflected the Ball on this step. */
  readonly reflectionCount: number;
  /**
   * R3.16 fired: overlap survived contact resolution, so the Ball was returned to its step-start position with
   * zero velocity. The Game_Client records an anomaly naming the Arena, the Player and the Shot parameters.
   */
  readonly residualOverlapAnomaly: boolean;
  /**
   * R5.11 fired: the Ball was still in motion after `MAX_SHOT_DURATION_SECONDS` of simulated time, so the
   * safety valve stopped it.
   */
  readonly shotDurationAnomaly: boolean;
  /**
   * The path the Ball's centre traced across this step, as one or more segments, including any segment contact
   * resolution introduced. This is what R6.1's Hole capture test runs against.
   */
  readonly pathSegments: readonly (readonly [Vector2, Vector2])[];
}

function addScaled(point: Vector2, direction: Vector2, scale: number): Vector2 {
  return { x: point.x + direction.x * scale, y: point.y + direction.y * scale };
}

/**
 * Most depenetration top-ups one contact resolution may apply.
 *
 * Not a physics, world-scale or tuning value, so R4.18 does not reach it - it bounds an algorithm, the
 * same way {@link WORLD_COMPARISON_SLACK} does. One push computes the displacement that would clear a
 * **flat** surface; on curved ground the surface can rise past the tangent line the push was measured
 * against, so resolution becomes a fixed-point crawl - each small push changes the x the next distance
 * is measured at. Sixteen closes every case the full grid over both playable Arenas produces; a state
 * none of them can clear is what the R3.16 bail-out exists for.
 */
const MAX_DEPENETRATION_TOPUPS = 16;

/**
 * Depenetrates a position along a surface normal until the measured overlap is within
 * {@link MAX_PENETRATION_TOLERANCE}, re-measuring after each push.
 *
 * R3.7 asks for "the smallest distance that leaves the overlap no greater than the tolerance", which
 * on curved ground is a fixed point rather than a single computation: each push changes the x at which
 * the next distance is measured. Velocity is deliberately untouched here - reflection happened once,
 * in the caller; these top-ups are positional only, so they cannot re-reflect or double-restitute.
 *
 * The cumulative push is capped at {@link BALL_RADIUS}. Legitimate curvature corrections travel a
 * fraction of a radius; a state needing more than a whole radius of sliding is not a contact this
 * engine resolved badly but one no legal Shot can produce, and walking it out along a wall of pushes
 * would silently teleport the Ball instead of letting the R3.16 bail-out catch it.
 */
function depenetrateToTolerance(
  measureOverlap: (position: Vector2) => number,
  normalAt: (position: Vector2) => Vector2,
  position: Vector2,
): Vector2 {
  let current = position;
  let pushedTotal = 0;
  for (let topUp = 0; topUp < MAX_DEPENETRATION_TOPUPS; topUp += 1) {
    const overlap = measureOverlap(current);
    if (overlap <= MAX_PENETRATION_TOLERANCE + WORLD_COMPARISON_SLACK) {
      return current;
    }
    const push = overlap - MAX_PENETRATION_TOLERANCE;
    if (pushedTotal + push > BALL_RADIUS) {
      return current;
    }
    pushedTotal += push;
    current = addScaled(current, normalAt(current), push);
  }
  return current;
}

const ZERO_VELOCITY: Vector2 = { x: 0, y: 0 };

/**
 * R6.1 - the Hole capture condition, as a path test rather than an endpoint test.
 *
 * The shortest distance from the Hole to the path the Ball's centre traced across the step, including any
 * segment a reflection within that step introduced, must be at or below `HOLE_RADIUS`, and the end-of-step
 * speed must be strictly below `HOLE_CAPTURE_MAX_SPEED`.
 *
 * A-2 makes the path test matter more, not less. A Ball arriving on a descending arc crosses the Hole faster
 * than a rolling one, so an endpoint-only test would miss captures the Player earned.
 */
function isHoleCaptureSatisfied(
  hole: Vector2,
  pathSegments: readonly (readonly [Vector2, Vector2])[],
  endOfStepSpeed: number,
): boolean {
  if (endOfStepSpeed >= HOLE_CAPTURE_MAX_SPEED) {
    return false;
  }
  return pathSegments.some(([from, to]) => distanceFromPointToSegment(hole, from, to) <= HOLE_RADIUS);
}

/**
 * R6.4, amended by A-2 - the out-of-bounds condition. The Ball's centre has left the Course in x.
 *
 * Falling below the terrain cannot happen, because contact resolution runs every step, so x is the only axis
 * that can put a Ball out of play. Both Course ends are open in every Arena, which is what makes
 * `OUT_OF_BOUNDS` reachable everywhere rather than only where a wall was left off.
 */
function isOutOfBounds(position: Vector2, courseWidth: number): boolean {
  return position.x < 0 || position.x > courseWidth;
}

/** Resolves one contact: reflect across the normal, scale by restitution, and depenetrate. */
function resolveContact(
  position: Vector2,
  velocity: Vector2,
  normal: Vector2,
  penetration: number,
): { position: Vector2; velocity: Vector2; reflected: boolean } {
  const perpendicular = velocity.x * normal.x + velocity.y * normal.y;

  // R3.15 - a surface the velocity points away from leaves that perpendicular component unchanged. Without
  // this a Ball leaving a surface it is still overlapping - the normal state after depenetration leaves
  // MAX_PENETRATION_TOLERANCE behind - would be reflected back into it every step.
  if (perpendicular >= 0) {
    return { position, velocity, reflected: false };
  }

  // R3.20 - below BOUNCE_MIN_NORMAL_SPEED the perpendicular component is zeroed rather than reflected.
  //
  // This is what lets a Ball settle. Reflecting returns TERRAIN_RESTITUTION of the normal speed gravity added
  // on the way down, so on a slope the bounce amplitude shrinks without ever reaching zero: the rest debounce
  // would never complete and the Status_Token would sit at BALL_MOVING until the R5.11 valve fired fifteen
  // simulated seconds later.
  const restitution = -perpendicular < BOUNCE_MIN_NORMAL_SPEED ? 0 : TERRAIN_RESTITUTION;

  return {
    velocity: addScaled(velocity, normal, -(1 + restitution) * perpendicular),
    // R3.7 - displace along the outward normal by the smallest distance that leaves the overlap no greater
    // than MAX_PENETRATION_TOLERANCE.
    position:
      penetration > MAX_PENETRATION_TOLERANCE
        ? addScaled(position, normal, penetration - MAX_PENETRATION_TOLERANCE)
        : position,
    reflected: true,
  };
}

/**
 * Advances one Simulation_Step.
 *
 * R3.14 fixes the operation order, as amended by A-2. Operation 1, advancing the Moving_Obstacle, is omitted
 * with the Moving_Obstacle cut:
 *
 *   1a. apply `GRAVITY` to the vertical velocity (R3.19 - before friction and before integration);
 *   2.  multiply velocity by `ROLLING_FRICTION_PER_STEP` if grounded, `AIR_FRICTION_PER_STEP` if not (R3.5);
 *   3.  displace by the velocity operation 2 left, times `FIXED_STEP_SECONDS` (R3.4);
 *   4.  resolve contact against the terrain and every overlapped obstacle (R3.6, R3.7, R3.8, R3.15, R3.20),
 *       then apply the R3.16 bail-out;
 *   5.  evaluate Hole capture against the path and the speed operation 4 left (R6.1);
 *   6.  evaluate out of bounds against the position operation 4 left (R6.4);
 *   7.  advance the rest-debounce counter against the speed operation 4 left, and zero the velocity on the
 *       step that completes it (R5.6, R5.8).
 *
 * Two precedence rules fall out of that order and are load-bearing. Hole capture is evaluated before out of
 * bounds, so a Ball satisfying both in one step is holed rather than lost. And a Ball whose capture or
 * out-of-bounds condition is satisfied skips every remaining operation of the step, so a captured Ball never
 * touches the debounce counter.
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

  // -- operation 1a: gravity (R3.19) -----------------------------------------------------------
  const gravityVelocity: Vector2 = {
    x: ball.velocity.x,
    y: ball.velocity.y - GRAVITY * FIXED_STEP_SECONDS,
  };

  // -- operation 2: friction, exactly once, before integration (R3.5) --------------------------
  const friction = ball.grounded ? ROLLING_FRICTION_PER_STEP : AIR_FRICTION_PER_STEP;
  const decayedVelocity: Vector2 = {
    x: gravityVelocity.x * friction,
    y: gravityVelocity.y * friction,
  };

  // -- operation 3: displace by the post-friction velocity (R3.4) ------------------------------
  const integratedPosition: Vector2 = {
    x: stepStartPosition.x + decayedVelocity.x * FIXED_STEP_SECONDS,
    y: stepStartPosition.y + decayedVelocity.y * FIXED_STEP_SECONDS,
  };

  // -- operation 4: contact resolution ---------------------------------------------------------
  //
  // R3.8 tests contact exactly once per step, at the position operation 3 produced. No sub-stepping and no
  // swept test for surfaces.
  let position = integratedPosition;
  let velocity = decayedVelocity;
  let reflectionCount = 0;
  let grounded = false;

  // The terrain first, because it is the surface a Ball is almost always touching.
  const terrainDistance = signedDistanceToTerrain(collision.terrain, position);
  if (terrainDistance < BALL_RADIUS) {
    grounded = true;
    const resolved = resolveContact(
      position,
      velocity,
      collision.terrain.normalAt(position.x),
      BALL_RADIUS - terrainDistance,
    );
    position = resolved.position;
    velocity = resolved.velocity;
    reflectionCount += resolved.reflected ? 1 : 0;

    // Curvature top-up: the push above measured against the tangent line at the pre-push x, which on
    // curved ground can leave the Ball still overlapping. Re-measure and finish the job; see
    // `depenetrateToTolerance`.
    position = depenetrateToTolerance(
      (candidate) => BALL_RADIUS - signedDistanceToTerrain(collision.terrain, candidate),
      (candidate) => collision.terrain.normalAt(candidate.x),
      position,
    );
  }

  // Then any overlapped obstacle, in Arena_Registry declaration order (R3.15).
  for (const obstacle of collision.obstacles) {
    const distance = distanceFromPointToRectangle(position, obstacle);
    if (distance >= BALL_RADIUS) {
      continue;
    }
    const resolved = resolveContact(
      position,
      velocity,
      rectangleOutwardNormal(obstacle, position),
      BALL_RADIUS - distance,
    );
    position = resolved.position;
    velocity = resolved.velocity;
    reflectionCount += resolved.reflected ? 1 : 0;

    // Same top-up for obstacles: pushing off one face can slide the Ball into range of an adjacent
    // face of the same rectangle when the push starts deep inside it.
    position = depenetrateToTolerance(
      (candidate) => BALL_RADIUS - distanceFromPointToRectangle(candidate, obstacle),
      (candidate) => rectangleOutwardNormal(obstacle, candidate),
      position,
    );
  }

  const pathSegments: readonly (readonly [Vector2, Vector2])[] =
    position === integratedPosition
      ? [[stepStartPosition, integratedPosition]]
      : [
          [stepStartPosition, integratedPosition],
          [integratedPosition, position],
        ];

  // R3.16 - if any surface is still overlapped by more than the tolerance once resolution has finished, the
  // step is abandoned: the Ball returns to where it started the step and stops dead. Every surface is
  // re-checked, because depenetrating off one can drive the Ball into another.
  const residualOverlap =
    BALL_RADIUS - signedDistanceToTerrain(collision.terrain, position) >
      MAX_PENETRATION_TOLERANCE + WORLD_COMPARISON_SLACK ||
    collision.obstacles.some(
      (obstacle) =>
        BALL_RADIUS - distanceFromPointToRectangle(position, obstacle) >
        MAX_PENETRATION_TOLERANCE + WORLD_COMPARISON_SLACK,
    );

  if (residualOverlap) {
    // R3.16 zeroes the velocity, which makes the Ball not in motion, so no later step would process it again.
    // The rest-debounce counter is therefore completed here rather than left part-way: a zero-speed Ball is
    // trivially below `REST_SPEED_THRESHOLD`, so treating the debounce as satisfied on this step keeps the
    // resulting Status_Token transition on R5.16's declared rest-debounce edge.
    return {
      ball: {
        ...ball,
        position: stepStartPosition,
        velocity: ZERO_VELOCITY,
        subThresholdSteps: REST_DEBOUNCE_STEPS,
        stepsSinceLaunch: ball.stepsSinceLaunch + 1,
        grounded: true,
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

  // -- operation 5: Hole capture ---------------------------------------------------------------
  if (isHoleCaptureSatisfied(collision.arena.hole, pathSegments, endOfStepSpeed)) {
    return {
      ball: {
        ...ball,
        position: collision.arena.hole,
        velocity: ZERO_VELOCITY,
        stepsSinceLaunch,
        grounded: true,
        outcome: 'HOLED',
      },
      reflectionCount,
      residualOverlapAnomaly: false,
      shotDurationAnomaly: false,
      pathSegments,
    };
  }

  // -- operation 6: out of bounds --------------------------------------------------------------
  if (isOutOfBounds(position, collision.arena.courseWidth)) {
    return {
      ball: {
        ...ball,
        position: ball.preShotPosition,
        velocity: ZERO_VELOCITY,
        stepsSinceLaunch,
        grounded: true,
        outcome: 'OUT_OF_BOUNDS',
      },
      reflectionCount,
      residualOverlapAnomaly: false,
      shotDurationAnomaly: false,
      pathSegments,
    };
  }

  // -- operation 7: rest debounce --------------------------------------------------------------
  //
  // A Ball is only counted toward rest while it is touching the ground. An airborne Ball at the apex of its
  // arc is momentarily slow, and without the grounded clause a high lob would be declared at rest in mid-air.
  const subThresholdSteps =
    grounded && endOfStepSpeed < REST_SPEED_THRESHOLD ? ball.subThresholdSteps + 1 : 0;

  if (subThresholdSteps >= REST_DEBOUNCE_STEPS) {
    return {
      ball: {
        ...ball,
        position,
        velocity: ZERO_VELOCITY,
        subThresholdSteps,
        stepsSinceLaunch,
        grounded: true,
        outcome: 'AT_REST',
      },
      reflectionCount,
      residualOverlapAnomaly: false,
      shotDurationAnomaly: false,
      pathSegments,
    };
  }

  // -- R5.11, R4.12: the maximum-shot-duration safety valve ------------------------------------
  if (stepsSinceLaunch >= MAX_SHOT_DURATION_STEPS) {
    const stoppedInHole = distanceBetweenPoints(position, collision.arena.hole) <= HOLE_RADIUS;
    return {
      ball: {
        ...ball,
        position: stoppedInHole ? collision.arena.hole : position,
        velocity: ZERO_VELOCITY,
        subThresholdSteps,
        stepsSinceLaunch,
        grounded: true,
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
      grounded,
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
  /** The highest the Ball's centre reached, for confirming a Shot actually arced. */
  readonly peakHeight: number;
}

/**
 * Advances up to `steps` Simulation_Steps, stopping early once the Ball is no longer in motion.
 *
 * Stopping early changes nothing: a step on a Ball that is at rest on the ground returns that Ball untouched
 * and does not advance `stepsSinceLaunch`, so the resulting state is identical to running the full count. It
 * matters only for speed, and task 14's grid search runs this a few million times.
 */
export function advance(collision: ArenaCollision, ball: BallState, steps: number): AdvanceOutcome {
  let current = ball;
  let reflectionCount = 0;
  let residualOverlapAnomalyCount = 0;
  let shotDurationAnomalyCount = 0;
  let stepsExecuted = 0;
  let peakHeight = ball.position.y;

  for (let index = 0; index < steps; index += 1) {
    if (!isInMotion(current)) {
      break;
    }
    const outcome = step(collision, current);
    current = outcome.ball;
    reflectionCount += outcome.reflectionCount;
    residualOverlapAnomalyCount += outcome.residualOverlapAnomaly ? 1 : 0;
    shotDurationAnomalyCount += outcome.shotDurationAnomaly ? 1 : 0;
    peakHeight = Math.max(peakHeight, current.position.y);
    stepsExecuted += 1;
  }

  return {
    ball: current,
    stepsExecuted,
    reflectionCount,
    residualOverlapAnomalyCount,
    shotDurationAnomalyCount,
    peakHeight,
  };
}

/**
 * Runs a Shot to its terminal outcome, bounded by the `MAX_SHOT_DURATION_SECONDS` valve.
 *
 * Used by playtests and by task 14's grid search, never by the running Game_Client, which advances the
 * simulation from its own clock so the Ball is drawn while it flies.
 */
export function simulateShotToRest(collision: ArenaCollision, ball: BallState): AdvanceOutcome {
  return advance(collision, ball, MAX_SHOT_DURATION_STEPS + 1);
}

/**
 * Largest overlap the Ball currently has with any surface, in world units. Zero or negative means clear.
 *
 * Exported so a playtest or a defect reproduction can assert R3.7's repositioning bound directly rather than
 * inferring it from behaviour.
 */
export function largestSurfaceOverlap(collision: ArenaCollision, ball: BallState): number {
  let largest = BALL_RADIUS - signedDistanceToTerrain(collision.terrain, ball.position);
  for (const obstacle of collision.obstacles) {
    largest = Math.max(largest, BALL_RADIUS - distanceFromPointToRectangle(ball.position, obstacle));
  }
  return largest;
}

/**
 * Smallest clearance between a Ball centre and any surface of the Arena, in world units.
 *
 * The Shot_Controller uses this for R6.9's pre-shot position legality bound.
 */
export function smallestSurfaceClearance(collision: ArenaCollision, position: Vector2): number {
  let smallest = signedDistanceToTerrain(collision.terrain, position);
  for (const obstacle of collision.obstacles) {
    smallest = Math.min(smallest, distanceFromPointToRectangle(position, obstacle));
  }
  return smallest;
}
