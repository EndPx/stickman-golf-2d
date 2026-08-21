// Constants_Module - Requirement 4.
//
// Every physics, world-scale, simulation-timing and gameplay tuning value in the project is declared
// here and nowhere else (R4.18). Per-Arena geometry, spawn points, Hole positions and Par values are
// the declared exception and live in the Arena_Registry.
//
// Nothing in this file imports anything. R17.9 keeps it free of Three.js, of any transport library
// and of every browser-only interface, so the identical module loads under Node and in the browser.
// The shared TypeScript project omits the DOM lib, which enforces that mechanically.
//
// Every binding is `export const`, so each holds the value it acquired at the completion of module
// load for the lifetime of the process (R4.24), and the whole set is supplied to every consumer from
// this one site (R4.26).

/** Raised when a Constants_Module load-time invariant fails. Names the invariant that failed. */
export class ConstantsInvariantError extends Error {
  public override readonly name = 'ConstantsInvariantError';

  public constructor(invariant: string, detail: string) {
    super(`Constants_Module invariant failed: ${invariant}. ${detail}`);
  }
}

function requireInvariant(condition: boolean, invariant: string, detail: string): void {
  if (!condition) {
    throw new ConstantsInvariantError(invariant, detail);
  }
}

// ---------------------------------------------------------------------------------------------
// World scale
// ---------------------------------------------------------------------------------------------

/** R4.1 - Playfield width in world units. */
export const PLAYFIELD_WIDTH = 1000;

/** R4.1 - Playfield height in world units. */
export const PLAYFIELD_HEIGHT = 600;

/** R4.2 - Ball radius in world units. */
export const BALL_RADIUS = 10;

/** R4.2 - Hole radius in world units. */
export const HOLE_RADIUS = 18;

/** R4.14 - shortest side any wall or obstacle may declare, in world units. */
export const MIN_WALL_THICKNESS = 20;

/** R4.23 - narrowest clear corridor width, in world units. Four times {@link BALL_RADIUS}. */
export const MIN_CORRIDOR_WIDTH = 40;

// ---------------------------------------------------------------------------------------------
// Simulation timing
// ---------------------------------------------------------------------------------------------

/** R4.3 - Simulation_Steps per second of wall-clock time. */
export const SIMULATION_HZ = 60;

/** R4.3 - duration of one Simulation_Step in seconds. Derived, never a literal. */
export const FIXED_STEP_SECONDS = 1 / SIMULATION_HZ;

/** R4.27 - most Simulation_Steps one catch-up pass may execute. */
export const MAX_CATCHUP_STEPS_PER_FRAME = 5;

/**
 * R4.12 - safety valve on a single Shot, in seconds of *simulated* time. Not wall-clock time.
 * @see MAX_SHOT_DURATION_STEPS for the same bound expressed in Simulation_Steps.
 */
export const MAX_SHOT_DURATION_SECONDS = 15;

/** R4.12 - {@link MAX_SHOT_DURATION_SECONDS} as a Simulation_Step count. Derived, never a literal. */
export const MAX_SHOT_DURATION_STEPS = MAX_SHOT_DURATION_SECONDS * SIMULATION_HZ;

// ---------------------------------------------------------------------------------------------
// Shot power and launch speed
// ---------------------------------------------------------------------------------------------

/** R4.4 - lowest selectable power value, in percent. */
export const POWER_MIN_PERCENT = 10;

/** R4.4 - highest selectable power value, in percent. */
export const POWER_MAX_PERCENT = 100;

/** R4.5 - launch speed at {@link POWER_MIN_PERCENT}, in world units per second. */
export const MIN_LAUNCH_SPEED = 60;

/** R4.5 - launch speed at {@link POWER_MAX_PERCENT}, in world units per second. */
export const MAX_LAUNCH_SPEED = 800;

/**
 * R4.5 - the power-to-launch-speed mapping. Linear and strictly increasing across the closed
 * interval {@link POWER_MIN_PERCENT} through {@link POWER_MAX_PERCENT}, anchored at
 * {@link MIN_LAUNCH_SPEED} and {@link MAX_LAUNCH_SPEED}.
 *
 * This is the only derivation of launch speed in the project. `shoot(angle, power)` consumes it
 * (R8.5 clamps power into range before calling, so values outside the interval do not arise here,
 * and the mapping is left unclamped so a caller cannot mistake it for a validation step).
 */
export function launchSpeedForPower(powerPercent: number): number {
  const powerSpan = POWER_MAX_PERCENT - POWER_MIN_PERCENT;
  const speedSpan = MAX_LAUNCH_SPEED - MIN_LAUNCH_SPEED;
  return MIN_LAUNCH_SPEED + ((powerPercent - POWER_MIN_PERCENT) / powerSpan) * speedSpan;
}

// ---------------------------------------------------------------------------------------------
// Physics tuning
// ---------------------------------------------------------------------------------------------

/**
 * R4.6 - dimensionless per-Simulation_Step velocity multiplier, strictly above 0 and strictly
 * below 1. Applied exactly once per step, before that step's position integration (R3.5).
 */
export const FRICTION_PER_STEP = 0.985;

/**
 * R4.7 - dimensionless multiplier on the velocity component perpendicular to a contacted surface,
 * at or above 0 and at or below 1.
 */
export const WALL_RESTITUTION = 0.7;

/** R4.8 - speed below which a Ball counts toward the rest debounce, in world units per second. */
export const REST_SPEED_THRESHOLD = 5;

/** R4.9 - consecutive sub-threshold Simulation_Steps required before a Ball is declared at rest. */
export const REST_DEBOUNCE_STEPS = 3;

/** R4.10 - highest end-of-step speed at which the Hole may capture a Ball, world units per second. */
export const HOLE_CAPTURE_MAX_SPEED = 200;

/** R4.22 - largest surface overlap contact resolution may leave behind, in world units. */
export const MAX_PENETRATION_TOLERANCE = 0.5;

/** R4.21 - largest client/server terminal-position disagreement tolerated, in world units. */
export const POSITION_DIVERGENCE_TOLERANCE = 1;

/**
 * R4.11 - Moving_Obstacle travel speed, in world units per second.
 *
 * Declared with no consumer. The Moving_Obstacle is descoped, so nothing advances it.
 */
export const MOVING_OBSTACLE_SPEED = 80;

// ---------------------------------------------------------------------------------------------
// Input grids and defaults
// ---------------------------------------------------------------------------------------------

/** R4.13 - aim adjustment per keypress, in degrees. 360 is an integer multiple of it. */
export const ANGLE_STEP_DEGREES = 5;

/** R4.13 - power adjustment per keypress, in percentage points. Divides the power span exactly. */
export const POWER_STEP_PERCENT = 5;

/** R4.19 - aim angle a turn begins at, in degrees. */
export const DEFAULT_AIM_DEGREES = 0;

/** R4.19 - power value a turn begins at, in percent. */
export const DEFAULT_POWER_PERCENT = 50;

// ---------------------------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------------------------

/** R4.15 - Stroke count at which a Player is marked Holed_Out without a capture. */
export const MAX_STROKES_PER_ARENA = 8;

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------

/** R4.31 - shortest the aim indicator may be drawn, in world units. Six times {@link BALL_RADIUS}. */
export const AIM_INDICATOR_MIN_LENGTH = 6 * BALL_RADIUS;

/** R4.32 - permitted difference between drawn aim direction and the aim angle, in degrees. */
export const AIM_INDICATOR_ANGLE_TOLERANCE_DEGREES = 1;

// ---------------------------------------------------------------------------------------------
// Declared with no consumer
//
// The networking and disconnect requirements are descoped, so nothing reads the four values below.
// They stay declared because R4 declares them and because deleting them would move the decision out
// of the spec and into a future reader's guesswork.
// ---------------------------------------------------------------------------------------------

/** R4.28 - room code length in characters. No consumer; there is no Game_Server. */
export const ROOM_CODE_LENGTH = 6;

/** R4.28 - the 26 upper-case Latin letters and the 10 decimal digits. No consumer. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** R4.29 - bound on transport liveness detection, in seconds. Not a grace period. No consumer. */
export const DISCONNECT_DETECTION_SECONDS = 3;

/** R4.30 - how long the disconnect notice stays up, in seconds. No consumer. */
export const DISCONNECT_NOTICE_SECONDS = 4;

// ---------------------------------------------------------------------------------------------
// Load-time invariants
//
// These run before MAX_CARRY_DISTANCE is derived, because that derivation loops on
// FRICTION_PER_STEP and REST_SPEED_THRESHOLD and would not terminate if either were wrong.
// ---------------------------------------------------------------------------------------------

requireInvariant(
  FRICTION_PER_STEP > 0 && FRICTION_PER_STEP < 1,
  'R4.6 FRICTION_PER_STEP lies strictly above 0 and strictly below 1',
  `FRICTION_PER_STEP is ${String(FRICTION_PER_STEP)}.`,
);

requireInvariant(
  WALL_RESTITUTION >= 0 && WALL_RESTITUTION <= 1,
  'R4.7 WALL_RESTITUTION lies at or above 0 and at or below 1',
  `WALL_RESTITUTION is ${String(WALL_RESTITUTION)}.`,
);

requireInvariant(
  REST_SPEED_THRESHOLD > 0,
  'R4.16 REST_SPEED_THRESHOLD is strictly above 0 so the carry derivation terminates',
  `REST_SPEED_THRESHOLD is ${String(REST_SPEED_THRESHOLD)}.`,
);

// R4.33 - the four-way speed ordering, stated as the three strict comparisons it decomposes into.
requireInvariant(
  REST_SPEED_THRESHOLD < HOLE_CAPTURE_MAX_SPEED,
  'R4.33 REST_SPEED_THRESHOLD is strictly below HOLE_CAPTURE_MAX_SPEED',
  `REST_SPEED_THRESHOLD is ${String(REST_SPEED_THRESHOLD)} and HOLE_CAPTURE_MAX_SPEED is ${String(HOLE_CAPTURE_MAX_SPEED)}.`,
);

requireInvariant(
  HOLE_CAPTURE_MAX_SPEED < MAX_LAUNCH_SPEED,
  'R4.33 HOLE_CAPTURE_MAX_SPEED is strictly below MAX_LAUNCH_SPEED',
  `HOLE_CAPTURE_MAX_SPEED is ${String(HOLE_CAPTURE_MAX_SPEED)} and MAX_LAUNCH_SPEED is ${String(MAX_LAUNCH_SPEED)}.`,
);

requireInvariant(
  MIN_LAUNCH_SPEED > REST_SPEED_THRESHOLD,
  'R4.33 MIN_LAUNCH_SPEED is strictly above REST_SPEED_THRESHOLD',
  `MIN_LAUNCH_SPEED is ${String(MIN_LAUNCH_SPEED)} and REST_SPEED_THRESHOLD is ${String(REST_SPEED_THRESHOLD)}.`,
);

// R4.5 - the mapping is strictly increasing, which needs the speed span to be strictly positive.
requireInvariant(
  MIN_LAUNCH_SPEED < MAX_LAUNCH_SPEED,
  'R4.5 the power-to-launch-speed mapping is strictly increasing',
  `MIN_LAUNCH_SPEED is ${String(MIN_LAUNCH_SPEED)} and MAX_LAUNCH_SPEED is ${String(MAX_LAUNCH_SPEED)}.`,
);

// R4.4 - a non-empty power interval, which R4.13's divisibility check below depends on.
requireInvariant(
  POWER_MIN_PERCENT < POWER_MAX_PERCENT,
  'R4.4 POWER_MIN_PERCENT is strictly below POWER_MAX_PERCENT',
  `POWER_MIN_PERCENT is ${String(POWER_MIN_PERCENT)} and POWER_MAX_PERCENT is ${String(POWER_MAX_PERCENT)}.`,
);

// R4.13 - both control grids close exactly, so no press sequence can leave either grid.
const FULL_TURN_DEGREES = 360;

requireInvariant(
  FULL_TURN_DEGREES % ANGLE_STEP_DEGREES === 0,
  'R4.13 360 is an integer multiple of ANGLE_STEP_DEGREES',
  `ANGLE_STEP_DEGREES is ${String(ANGLE_STEP_DEGREES)}.`,
);

requireInvariant(
  (POWER_MAX_PERCENT - POWER_MIN_PERCENT) % POWER_STEP_PERCENT === 0,
  'R4.13 the POWER_MIN_PERCENT to POWER_MAX_PERCENT span is an integer multiple of POWER_STEP_PERCENT',
  `the span is ${String(POWER_MAX_PERCENT - POWER_MIN_PERCENT)} and POWER_STEP_PERCENT is ${String(POWER_STEP_PERCENT)}.`,
);

// R7.15, R7.16 - both defaults sit on their grid, so a turn never begins off-grid.
requireInvariant(
  DEFAULT_AIM_DEGREES % ANGLE_STEP_DEGREES === 0 &&
    DEFAULT_AIM_DEGREES >= 0 &&
    DEFAULT_AIM_DEGREES < FULL_TURN_DEGREES,
  'R7.16 DEFAULT_AIM_DEGREES lies on the aim grid within 0 up to but excluding 360',
  `DEFAULT_AIM_DEGREES is ${String(DEFAULT_AIM_DEGREES)}.`,
);

requireInvariant(
  DEFAULT_POWER_PERCENT >= POWER_MIN_PERCENT &&
    DEFAULT_POWER_PERCENT <= POWER_MAX_PERCENT &&
    (DEFAULT_POWER_PERCENT - POWER_MIN_PERCENT) % POWER_STEP_PERCENT === 0,
  'R7.15 DEFAULT_POWER_PERCENT lies on the power grid',
  `DEFAULT_POWER_PERCENT is ${String(DEFAULT_POWER_PERCENT)}.`,
);

// R4.23 - the stated relation between MIN_CORRIDOR_WIDTH and BALL_RADIUS.
requireInvariant(
  MIN_CORRIDOR_WIDTH === 4 * BALL_RADIUS,
  'R4.23 MIN_CORRIDOR_WIDTH is four times BALL_RADIUS',
  `MIN_CORRIDOR_WIDTH is ${String(MIN_CORRIDOR_WIDTH)} and BALL_RADIUS is ${String(BALL_RADIUS)}.`,
);

// R4.28 - 26 upper-case Latin letters plus 10 decimal digits.
requireInvariant(
  ROOM_CODE_ALPHABET.length === 36 && new Set(ROOM_CODE_ALPHABET).size === ROOM_CODE_ALPHABET.length,
  'R4.28 ROOM_CODE_ALPHABET holds 36 distinct characters',
  `ROOM_CODE_ALPHABET holds ${String(ROOM_CODE_ALPHABET.length)} characters.`,
);

// ---------------------------------------------------------------------------------------------
// Derived carry bound
// ---------------------------------------------------------------------------------------------

/**
 * R4.16 - the Carry_Distance a Shot at {@link POWER_MAX_PERCENT} produces on an unobstructed line,
 * derived at load time rather than declared as a literal.
 *
 * The loop applies the R3.14 per-step order exactly: multiply velocity by {@link FRICTION_PER_STEP}
 * (operation 2), then displace by the velocity that multiplication left, times
 * {@link FIXED_STEP_SECONDS} (operation 3). It stops once speed has fallen below
 * {@link REST_SPEED_THRESHOLD}, counting the displacement of the step on which it first does, because
 * that step's displacement happens before R3.14 operation 7 observes the sub-threshold speed.
 *
 * The three {@link REST_DEBOUNCE_STEPS} that follow before R5.6 zeroes the velocity add well under
 * one world unit and are excluded, because R4.16 stops the accumulation at the threshold crossing.
 *
 * Guarded against non-termination by the `FRICTION_PER_STEP < 1` and `REST_SPEED_THRESHOLD > 0`
 * invariants asserted above.
 */
export const MAX_CARRY_DISTANCE = ((): number => {
  let speed = launchSpeedForPower(POWER_MAX_PERCENT);
  let carry = 0;
  for (;;) {
    speed *= FRICTION_PER_STEP;
    carry += speed * FIXED_STEP_SECONDS;
    if (speed < REST_SPEED_THRESHOLD) {
      return carry;
    }
  }
})();

// R4.16 read against R4.1 - a full-power Shot must not be able to clear the Playfield's long axis
// several times over, or the carry bound tells an Arena designer nothing.
requireInvariant(
  MAX_CARRY_DISTANCE > 0 && MAX_CARRY_DISTANCE < 2 * PLAYFIELD_WIDTH,
  'R4.16 the derived MAX_CARRY_DISTANCE is positive and under two Playfield widths',
  `MAX_CARRY_DISTANCE derived as ${String(MAX_CARRY_DISTANCE)} against a PLAYFIELD_WIDTH of ${String(PLAYFIELD_WIDTH)}.`,
);
