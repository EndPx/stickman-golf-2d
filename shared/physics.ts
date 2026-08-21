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
//
// TASK 5.2 completes this module with R3.14 operations 5 through 7 - Hole capture, out of bounds and
// the rest-debounce counter - plus the `MAX_SHOT_DURATION_SECONDS` valve. Operations 2, 3 and 4,
// multi-surface ordering and the residual-overlap bail-out are implemented here.

import {
  BALL_RADIUS,
  FIXED_STEP_SECONDS,
  FRICTION_PER_STEP,
  MAX_PENETRATION_TOLERANCE,
  PLAYFIELD_WIDTH,
  WALL_RESTITUTION,
} from './constants.ts';
import { PLAYFIELD_BOUNDS, type ArenaDefinition } from './arenas.ts';
import {
  distanceFromPointToRectangle,
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
  readonly outcome: BallOutcome;
}

/** A Ball at rest at the given position, as an Arena's spawn placement or an out-of-bounds reset. */
export function createBallAtRest(position: Vector2): BallState {
  return {
    position,
    velocity: { x: 0, y: 0 },
    subThresholdSteps: 0,
    stepsSinceLaunch: 0,
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
   * The path the Ball's centre traced across this step, as one or more segments, including any
   * segment contact resolution introduced. R6.1's Hole capture test runs against this in task 5.2.
   */
  readonly pathSegments: readonly (readonly [Vector2, Vector2])[];
}

function addScaled(point: Vector2, direction: Vector2, scale: number): Vector2 {
  return { x: point.x + direction.x * scale, y: point.y + direction.y * scale };
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
 *   5-7. Hole capture, out of bounds and the rest-debounce counter - **task 5.2**.
 *
 * A Ball that is not in motion is returned untouched, per R3.14's definition of a Ball in motion.
 */
export function step(collision: ArenaCollision, ball: BallState): StepOutcome {
  if (!isInMotion(ball)) {
    return {
      ball,
      reflectionCount: 0,
      residualOverlapAnomaly: false,
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
    return {
      ball: {
        ...ball,
        position: stepStartPosition,
        velocity: { x: 0, y: 0 },
        stepsSinceLaunch: ball.stepsSinceLaunch + 1,
      },
      reflectionCount,
      residualOverlapAnomaly: true,
      pathSegments,
    };
  }

  // Operations 5 through 7 land here in task 5.2. Until then the step reports position and velocity
  // only, and the caller owns every terminal outcome.
  return {
    ball: {
      ...ball,
      position,
      velocity,
      stepsSinceLaunch: ball.stepsSinceLaunch + 1,
    },
    reflectionCount,
    residualOverlapAnomaly: false,
    pathSegments,
  };
}

/** The result of advancing a caller-supplied number of Simulation_Steps. */
export interface AdvanceOutcome {
  readonly ball: BallState;
  readonly stepsExecuted: number;
  readonly reflectionCount: number;
  readonly residualOverlapAnomalyCount: number;
}

/**
 * Advances exactly `steps` Simulation_Steps.
 *
 * R3.1 and R3.17: the engine is advanced only by a caller-supplied step count and reads no wall-clock
 * time source of its own. The clock that decides how many steps to ask for lives in the Game_Client
 * (task 7), outside this module and outside the render callback.
 */
export function advance(collision: ArenaCollision, ball: BallState, steps: number): AdvanceOutcome {
  let current = ball;
  let reflectionCount = 0;
  let residualOverlapAnomalyCount = 0;
  let stepsExecuted = 0;

  for (let index = 0; index < steps; index += 1) {
    const outcome = step(collision, current);
    current = outcome.ball;
    reflectionCount += outcome.reflectionCount;
    residualOverlapAnomalyCount += outcome.residualOverlapAnomaly ? 1 : 0;
    stepsExecuted += 1;
  }

  return { ball: current, stepsExecuted, reflectionCount, residualOverlapAnomalyCount };
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
