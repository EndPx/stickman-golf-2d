// Shot_Controller - Requirement 8.
//
// One exported function, `shoot(angleDegrees, powerPercent, context)`, is the only code path in the
// project that can impart velocity to a Ball outside the Physics_Engine's per-step integration (R8.1,
// R8.9). Both input paths funnel through it: the relative arrow stepping of R7.1 through R7.4 and the
// absolute number inputs of R7.19 through R7.26 (R8.2).
//
// `shoot` imparts velocity **locally and permanently**. There is no Game_Server, so there is no
// request pipeline, no Shot sequence number, no broadcast launch vector to await and no later
// conversion. That also disposes of D-10's problem: the launch vector is derived from the R4.5 mapping
// in exactly one runtime, so `Math.cos` and `Math.sin` being implementation-approximated in ECMAScript
// cannot make two processes disagree, because there is only one process.
//
// The function is pure. It reads the state it is handed and returns the state that results, which is
// what keeps R8.8's "leave every piece of state unchanged on rejection" true by construction rather
// than by careful bookkeeping - a rejection carries no Ball, so a caller has nothing to apply.

import {
  BALL_RADIUS,
  MAX_PENETRATION_TOLERANCE,
  POWER_MAX_PERCENT,
  POWER_MIN_PERCENT,
  launchSpeedForPower,
} from './constants.ts';
import {
  WORLD_COMPARISON_SLACK,
  smallestSurfaceClearance,
  type ArenaCollision,
  type BallState,
} from './physics.ts';
import type { Vector2 } from './geometry.ts';

/**
 * R8.11 - the closed set of Shot rejection reasons. Spelling and casing are frozen for the lifetime of
 * the project, and nothing is removed from the set even where the delivered scope cannot reach it.
 *
 * `NOT_YOUR_TURN`, `MATCH_NOT_STARTED` and `ARENA_ADVANCE_IN_PROGRESS` are unreachable here: turn
 * enforcement, the join step and the Arena-advance window are all descoped with the Game_Server. They
 * stay in the set because R9.16 freezes it, and `overlay-last-rejection` is still exercised through
 * `BALL_NOT_AT_REST` and `INVALID_SHOT_ARGUMENT`.
 */
export const SHOT_REJECTION_REASONS = [
  'BALL_NOT_AT_REST',
  'NOT_YOUR_TURN',
  'ALREADY_HOLED_OUT',
  'MATCH_COMPLETE',
  'MATCH_NOT_STARTED',
  'ARENA_ADVANCE_IN_PROGRESS',
  'INVALID_SHOT_ARGUMENT',
] as const;

export type ShotRejectionReason = (typeof SHOT_REJECTION_REASONS)[number];

/** What `shoot` needs to know about the world to decide and to act. */
export interface ShotContext {
  readonly collision: ArenaCollision;
  readonly ball: BallState;
  /**
   * The reason the first failing precondition returned, or `null` when every precondition holds.
   *
   * Evaluated by the caller rather than here, because every surviving precondition is a property of
   * Match state the Shot_Controller does not own - the Status_Token, the Holed_Out latch and the Match
   * phase. R11.9's precedence order over the six Game_Server preconditions is descoped with the
   * Game_Server; the caller (task 11) applies what is left of it, in that order, and hands the winner
   * in here.
   */
  readonly precondition: ShotRejectionReason | null;
}

/** An accepted Shot: the Ball now in motion, and the parameters the Shot was accepted with. */
export interface ShotAccepted {
  readonly accepted: true;
  readonly ball: BallState;
  /** The wrapped angle, in degrees, in the range 0 up to but excluding 360. */
  readonly angleDegrees: number;
  /** The clamped power, in percent, within POWER_MIN_PERCENT through POWER_MAX_PERCENT. */
  readonly powerPercent: number;
  readonly launchVelocity: Vector2;
  /**
   * R6.9 was violated: the position recorded as the pre-shot position was not a legal resting place.
   * The Shot still proceeds, because refusing it would need a rejection reason outside R8.11's frozen
   * set, but the Game_Client records an anomaly - and every Verification_Flow fails on a non-zero
   * anomaly count under R15.17, so this cannot pass unnoticed.
   */
  readonly preShotPositionAnomaly: boolean;
}

/** A rejected Shot. Carries no Ball, so nothing about the world changes. */
export interface ShotRejected {
  readonly accepted: false;
  readonly reason: ShotRejectionReason;
}

export type ShotResult = ShotAccepted | ShotRejected;

// Degrees in a full turn, and the conversion to radians. Both are mathematical facts rather than
// physics, world-scale or tuning values, so R4.18 does not reserve them to the Constants_Module.
const FULL_TURN_DEGREES = 360;
const RADIANS_PER_DEGREE = (2 * Math.PI) / FULL_TURN_DEGREES;

/**
 * R8.5 - wrap an angle into the range 0 up to but excluding 360 degrees, and apply no other
 * alteration. In particular no rounding onto a multiple of `ANGLE_STEP_DEGREES`: grid snapping belongs
 * to the Input_Controller (R7.20), which is what keeps R7.16's reachable grid meaningful while leaving
 * `shoot` able to accept any finite angle.
 */
export function wrapAngleDegrees(angleDegrees: number): number {
  return ((angleDegrees % FULL_TURN_DEGREES) + FULL_TURN_DEGREES) % FULL_TURN_DEGREES;
}

/**
 * R8.5 - clamp a power value into `POWER_MIN_PERCENT` through `POWER_MAX_PERCENT`, and apply no other
 * alteration. No rounding onto the R7.15 power grid, for the same reason.
 */
export function clampPowerPercent(powerPercent: number): number {
  return Math.min(Math.max(powerPercent, POWER_MIN_PERCENT), POWER_MAX_PERCENT);
}

/**
 * R6.9 - whether a Ball centre is a legal pre-shot position: inside the Playfield, and no closer than
 * `BALL_RADIUS` reduced by `MAX_PENETRATION_TOLERANCE` to any Collision_Surface.
 *
 * That bound is exactly where contact resolution parks a Ball resting against a surface, so a Ball
 * that arrived by spawn placement, by an earlier Shot coming to rest or by an out-of-bounds reset
 * satisfies it by construction. A violation therefore means a Physics_Engine defect, not a player
 * action, which is why the response is an anomaly rather than a rejection.
 */
export function isLegalPreShotPosition(collision: ArenaCollision, position: Vector2): boolean {
  // A-2 - the Course, not a Playfield rectangle. A Ball outside it in x is already out of bounds, and there is
  // no upper or lower bound to test: contact resolution keeps the Ball on the surface every step.
  if (position.x < 0 || position.x > collision.arena.courseWidth) {
    return false;
  }
  const bound = BALL_RADIUS - MAX_PENETRATION_TOLERANCE;
  return smallestSurfaceClearance(collision, position) >= bound - WORLD_COMPARISON_SLACK;
}

/**
 * The one function capable of imparting velocity to a Ball.
 *
 * Argument validity is tested before the Match-state preconditions. R11.9's precedence order covers the
 * six Game_Server preconditions and says nothing about `INVALID_SHOT_ARGUMENT`, which is a local
 * argument check; testing it first means a malformed call is always reported as malformed rather than
 * masked by whatever the Ball happened to be doing.
 */
export function shoot(
  angleDegrees: number,
  powerPercent: number,
  context: ShotContext,
): ShotResult {
  // R8.8 - a non-finite angle or power leaves Ball velocity, Ball position, the recorded pre-shot
  // position and every Stroke count unchanged.
  if (!Number.isFinite(angleDegrees) || !Number.isFinite(powerPercent)) {
    return { accepted: false, reason: 'INVALID_SHOT_ARGUMENT' };
  }

  if (context.precondition !== null) {
    return { accepted: false, reason: context.precondition };
  }

  const wrappedAngle = wrapAngleDegrees(angleDegrees);
  const clampedPower = clampPowerPercent(powerPercent);

  // R4.5 - the launch speed comes from the Constants_Module's power mapping and from nowhere else.
  // R7.6 - the angle is measured counter-clockwise from the positive horizontal axis.
  const speed = launchSpeedForPower(clampedPower);
  const radians = wrappedAngle * RADIANS_PER_DEGREE;
  const launchVelocity: Vector2 = {
    x: Math.cos(radians) * speed,
    y: Math.sin(radians) * speed,
  };

  // R8.6 - record the position the Ball holds immediately before launch velocity is imparted, for the
  // out-of-bounds reset of R6.5.
  const preShotPosition = context.ball.position;

  return {
    accepted: true,
    angleDegrees: wrappedAngle,
    powerPercent: clampedPower,
    launchVelocity,
    preShotPositionAnomaly: !isLegalPreShotPosition(context.collision, preShotPosition),
    ball: {
      position: preShotPosition,
      velocity: launchVelocity,
      subThresholdSteps: 0,
      stepsSinceLaunch: 0,
      preShotPosition,
      // The Ball leaves the tee touching the ground. The first step's contact resolution decides whether it
      // stays that way, which is what selects rolling friction for a putt and air friction for a lofted Shot.
      grounded: true,
      outcome: 'IN_MOTION',
    },
  };
}
