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

/**
 * R4.1, amended by A-2 - the **viewport** width in world units, not the width of a Course.
 *
 * A Course is wider than this and the camera pans along it (R14.3). Course width is per-Arena data (R2.1).
 */
export const PLAYFIELD_WIDTH = 1000;

/** R4.1, amended by A-2 - the viewport height in world units. */
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

/** R4.5, re-tuned by A-2 - launch speed at {@link POWER_MIN_PERCENT}, in world units per second. */
export const MIN_LAUNCH_SPEED = 150;

/**
 * R4.5, re-tuned by A-2 - launch speed at {@link POWER_MAX_PERCENT}, in world units per second.
 *
 * Chosen against {@link GRAVITY} for the carry a full-power Shot should produce: the level-ground range of a
 * 45 degree launch is `v squared over g`, which at 1100 and 900 is about 1344 world units. That is most of
 * a Course but not all of it, so full power is a real choice rather than a default.
 *
 * Q-6's reasoning for raising this ceiling still holds. The 800 it produced does not survive the addition of
 * gravity, because that number was sized for rolling carry on a 1000-unit field with no vertical component.
 */
export const MAX_LAUNCH_SPEED = 1100;

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
 * R4.34, added by A-2 - downward acceleration in world units per second squared.
 *
 * Applied to the vertical velocity once per Simulation_Step, before friction and before integration (R3.19).
 */
export const GRAVITY = 900;

/**
 * R4.6, replaced by A-2 - per-Simulation_Step velocity multiplier while the Ball is in contact with the
 * terrain. Strictly above 0 and at or below 1.
 *
 * Higher than the old single friction constant, because gravity now does the work of stopping a Ball that
 * rolls uphill and this only has to bleed off a Ball rolling along the flat.
 */
export const ROLLING_FRICTION_PER_STEP = 0.99;

/**
 * R4.6, replaced by A-2 - per-Simulation_Step velocity multiplier while the Ball is airborne.
 *
 * Nearly 1: a golf ball in flight loses far less speed to air than a ball rolling loses to turf, and making
 * this too aggressive turns every arc into a stone drop.
 */
export const AIR_FRICTION_PER_STEP = 0.9995;

/**
 * R4.7, renamed by A-2 - dimensionless multiplier on the velocity component perpendicular to a contacted
 * surface, at or above 0 and at or below 1.
 *
 * Turf is a dead surface, so this is much lower than the old wall value: a Ball landing on a fairway should
 * check up and start running, not ricochet.
 */
export const TERRAIN_RESTITUTION = 0.35;

/**
 * R4.35, added by A-2 - normal-direction speed below which contact resolution zeroes the perpendicular
 * component instead of reflecting it, in world units per second.
 *
 * Load-bearing rather than cosmetic. Without it a Ball resting on a slope bounces forever at ever-smaller
 * amplitude: each reflection returns `TERRAIN_RESTITUTION` of the normal speed gravity added on the way down,
 * so the speed never reaches zero, the rest debounce never completes, and the Status_Token never leaves
 * `BALL_MOVING` until the R5.11 valve fires fifteen simulated seconds later.
 */
export const BOUNCE_MIN_NORMAL_SPEED = 40;

/**
 * R4.36, added by A-2 - horizontal spacing at which the Renderer samples the interpolated terrain, in world
 * units.
 *
 * A rendering quantity only. The Physics_Engine evaluates the interpolation analytically and samples nothing,
 * so changing this alters how the ground looks and never how it plays.
 */
export const TERRAIN_RENDER_SAMPLE_SPACING = 6;

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
// These run before MAX_CARRY_DISTANCE is derived, because that derivation integrates a trajectory and
// would not terminate if gravity or the frictions were wrong.
// ---------------------------------------------------------------------------------------------

requireInvariant(
  ROLLING_FRICTION_PER_STEP > 0 && ROLLING_FRICTION_PER_STEP <= 1,
  'R4.6 ROLLING_FRICTION_PER_STEP lies strictly above 0 and at or below 1',
  `ROLLING_FRICTION_PER_STEP is ${String(ROLLING_FRICTION_PER_STEP)}.`,
);

requireInvariant(
  AIR_FRICTION_PER_STEP > 0 && AIR_FRICTION_PER_STEP <= 1,
  'R4.6 AIR_FRICTION_PER_STEP lies strictly above 0 and at or below 1',
  `AIR_FRICTION_PER_STEP is ${String(AIR_FRICTION_PER_STEP)}.`,
);

requireInvariant(
  TERRAIN_RESTITUTION >= 0 && TERRAIN_RESTITUTION <= 1,
  'R4.7 TERRAIN_RESTITUTION lies at or above 0 and at or below 1',
  `TERRAIN_RESTITUTION is ${String(TERRAIN_RESTITUTION)}.`,
);

requireInvariant(
  GRAVITY > 0,
  'R4.34 GRAVITY is strictly above 0, so a Shot comes down and the carry derivation terminates',
  `GRAVITY is ${String(GRAVITY)}.`,
);

requireInvariant(
  BOUNCE_MIN_NORMAL_SPEED > REST_SPEED_THRESHOLD,
  'R4.35 BOUNCE_MIN_NORMAL_SPEED is strictly above REST_SPEED_THRESHOLD, so a settling Ball stops bouncing before it is declared at rest',
  `BOUNCE_MIN_NORMAL_SPEED is ${String(BOUNCE_MIN_NORMAL_SPEED)} and REST_SPEED_THRESHOLD is ${String(REST_SPEED_THRESHOLD)}.`,
);

requireInvariant(
  TERRAIN_RENDER_SAMPLE_SPACING > 0,
  'R4.36 TERRAIN_RENDER_SAMPLE_SPACING is strictly above 0',
  `TERRAIN_RENDER_SAMPLE_SPACING is ${String(TERRAIN_RENDER_SAMPLE_SPACING)}.`,
);

requireInvariant(
  REST_SPEED_THRESHOLD > 0,
  'R4.16 REST_SPEED_THRESHOLD is strictly above 0',
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

/** The launch angle that maximises range over level ground, in degrees. A fact of ballistics, not a tuning value. */
const OPTIMAL_LAUNCH_ANGLE_DEGREES = 45;

/**
 * R4.16, amended by A-2 - the horizontal Carry_Distance a Shot at {@link POWER_MAX_PERCENT} produces over
 * level ground, launched at the range-maximising 45 degrees, derived at load time rather than declared.
 *
 * No longer a rolling distance. It is integrated step by step in the same order R3.14 declares - gravity,
 * then friction, then displacement - rather than from the closed-form `v squared over g`, so that the number
 * an Arena designer works against is the one the Physics_Engine will actually produce, air friction included.
 *
 * Accumulation stops when the Ball returns to its launch height, which is what makes this a carry rather
 * than a total distance: what happens after the landing depends on the terrain, and no constant can know it.
 *
 * Guarded against non-termination by the `GRAVITY > 0` invariant above: a Ball launched upward under positive
 * gravity always comes back down.
 */
export const MAX_CARRY_DISTANCE = ((): number => {
  const speed = launchSpeedForPower(POWER_MAX_PERCENT);
  const radians = (OPTIMAL_LAUNCH_ANGLE_DEGREES * Math.PI) / 180;
  let velocityX = Math.cos(radians) * speed;
  let velocityY = Math.sin(radians) * speed;
  let carry = 0;
  let height = 0;

  for (let step = 0; step < MAX_SHOT_DURATION_STEPS; step += 1) {
    velocityY -= GRAVITY * FIXED_STEP_SECONDS;
    velocityX *= AIR_FRICTION_PER_STEP;
    velocityY *= AIR_FRICTION_PER_STEP;
    carry += velocityX * FIXED_STEP_SECONDS;
    height += velocityY * FIXED_STEP_SECONDS;
    if (height <= 0) {
      return carry;
    }
  }
  return carry;
})();

// R4.16 read against R4.1 - a full-power Shot should carry more than one viewport width, or a Course cannot
// be wider than the viewport without being tedious, and less than three, or the carry bound tells an Arena
// designer nothing useful.
requireInvariant(
  MAX_CARRY_DISTANCE > PLAYFIELD_WIDTH && MAX_CARRY_DISTANCE < 3 * PLAYFIELD_WIDTH,
  'R4.16 the derived MAX_CARRY_DISTANCE lies between one and three viewport widths',
  `MAX_CARRY_DISTANCE derived as ${String(MAX_CARRY_DISTANCE)} against a PLAYFIELD_WIDTH of ${String(PLAYFIELD_WIDTH)}.`,
);
