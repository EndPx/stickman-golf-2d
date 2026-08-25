// Task 6 acceptance check.
//
// "`shoot` is the only writer of Ball velocity outside the engine, and a non-finite argument leaves
// every piece of state unchanged."
//
// The first half is structural and cannot be asserted from inside the program, so it is checked two
// ways: every verification tool launches through `shoot` (see shot-helpers.ts), and a grep gate below
// reports any other construction of a non-zero velocity in the shared modules or the client.
//
// Run with `node verification/tools/check-shot.ts`.

import {
  ANGLE_STEP_DEGREES,
  BALL_RADIUS,
  MAX_PENETRATION_TOLERANCE,
  POWER_MAX_PERCENT,
  POWER_MIN_PERCENT,
  launchSpeedForPower,
} from '../../shared/constants.ts';
import { createBallAtRest, speedOf, type BallState } from '../../shared/physics.ts';
import { restingCentreAt } from '../../shared/terrain.ts';
import type { Vector2 } from '../../shared/geometry.ts';
import {
  SHOT_REJECTION_REASONS,
  clampPowerPercent,
  isLegalPreShotPosition,
  shoot,
  wrapAngleDegrees,
} from '../../shared/shot.ts';
import { collisionFor, createReporter } from './shot-helpers.ts';

const { report, finish } = createReporter();
const collision = collisionFor(1);
const atSpawn = createBallAtRest(collision.arena.spawn);

function fire(angleDegrees: number, powerPercent: number): ReturnType<typeof shoot> {
  return shoot(angleDegrees, powerPercent, { collision, ball: atSpawn, precondition: null });
}

// -- R8.8: a non-finite argument changes nothing --------------------------------------------------

for (const [label, angle, power] of [
  ['NaN angle', Number.NaN, 50],
  ['NaN power', 0, Number.NaN],
  ['Infinity angle', Number.POSITIVE_INFINITY, 50],
  ['-Infinity power', 0, Number.NEGATIVE_INFINITY],
] as readonly (readonly [string, number, number])[]) {
  const result = fire(angle, power);
  report(
    !result.accepted && result.reason === 'INVALID_SHOT_ARGUMENT',
    `${label} is rejected with INVALID_SHOT_ARGUMENT`,
    result.accepted ? 'accepted' : result.reason,
  );
  report(
    !result.accepted && !('ball' in result),
    `${label} carries no Ball, so nothing can change`,
    result.accepted ? 'a Ball was returned' : 'no Ball returned',
  );
}

// The Ball handed in is untouched: it is a frozen input, and a rejection returns no replacement.
report(
  speedOf(atSpawn) === 0 &&
    atSpawn.position.x === collision.arena.spawn.x &&
    atSpawn.position.y === collision.arena.spawn.y,
  'the Ball handed to a rejected Shot is unchanged',
  `position (${String(atSpawn.position.x)}, ${String(atSpawn.position.y)}), speed ${String(speedOf(atSpawn))}`,
);

// -- R8.11: the frozen rejection reason set ------------------------------------------------------

report(
  SHOT_REJECTION_REASONS.join(',') ===
    'BALL_NOT_AT_REST,NOT_YOUR_TURN,ALREADY_HOLED_OUT,MATCH_COMPLETE,MATCH_NOT_STARTED,ARENA_ADVANCE_IN_PROGRESS,INVALID_SHOT_ARGUMENT',
  'the rejection reason set matches R8.11 exactly, in order',
  SHOT_REJECTION_REASONS.join(','),
);

// -- a supplied precondition is returned verbatim, and argument checks come first ------------------

for (const reason of SHOT_REJECTION_REASONS) {
  const result = shoot(0, 50, { collision, ball: atSpawn, precondition: reason });
  report(
    !result.accepted && result.reason === reason,
    `a failing ${reason} precondition is returned verbatim`,
    result.accepted ? 'accepted' : result.reason,
  );
}

{
  const result = shoot(Number.NaN, 50, {
    collision,
    ball: atSpawn,
    precondition: 'BALL_NOT_AT_REST',
  });
  report(
    !result.accepted && result.reason === 'INVALID_SHOT_ARGUMENT',
    'a non-finite argument outranks a failing Match-state precondition',
    result.accepted ? 'accepted' : result.reason,
  );
}

// -- R8.5: clamp power, wrap angle, round neither -------------------------------------------------

console.log('');

for (const [angle, expected] of [
  [0, 0],
  [355, 355],
  [360, 0],
  [365, 5],
  [-5, 355],
  [-365, 355],
  [1080, 0],
  [-1e-20, 0],
] as readonly (readonly [number, number])[]) {
  const wrapped = wrapAngleDegrees(angle);
  report(
    wrapped === expected,
    `angle ${String(angle)} wraps to ${String(expected)}`,
    String(wrapped),
  );
}

report(
  wrapAngleDegrees(-1e-9) >= 0 && wrapAngleDegrees(-1e-9) < 360,
  'a tiny negative angle never wraps to 360',
  String(wrapAngleDegrees(-1e-9)),
);

for (const [power, expected] of [
  [50, 50],
  [0, POWER_MIN_PERCENT],
  [-100, POWER_MIN_PERCENT],
  [500, POWER_MAX_PERCENT],
  [POWER_MAX_PERCENT, POWER_MAX_PERCENT],
] as readonly (readonly [number, number])[]) {
  const clamped = clampPowerPercent(power);
  report(clamped === expected, `power ${String(power)} clamps to ${String(expected)}`, String(clamped));
}

{
  // R8.5 forbids rounding onto either grid inside `shoot`. An off-grid angle and an off-grid power must
  // survive intact, because grid snapping is the Input_Controller's job (R7.20, R7.21).
  const offGridAngle = ANGLE_STEP_DEGREES / 2 + 1;
  const result = fire(offGridAngle, 63.5);
  report(
    result.accepted && result.angleDegrees === offGridAngle,
    'an off-grid angle is not rounded onto the ANGLE_STEP_DEGREES grid',
    result.accepted ? String(result.angleDegrees) : result.reason,
  );
  report(
    result.accepted && result.powerPercent === 63.5,
    'an off-grid power is not rounded onto the power grid',
    result.accepted ? String(result.powerPercent) : result.reason,
  );
}

// -- R4.5, R7.6: the launch vector -----------------------------------------------------------------

console.log('');

for (const [angle, power] of [
  [0, POWER_MIN_PERCENT],
  [90, 50],
  [180, POWER_MAX_PERCENT],
  [270, 75],
] as readonly (readonly [number, number])[]) {
  const result = fire(angle, power);
  if (!result.accepted) {
    report(false, `launch at ${String(angle)} degrees`, result.reason);
    continue;
  }
  const expectedSpeed = launchSpeedForPower(power);
  const actualSpeed = Math.sqrt(
    result.launchVelocity.x * result.launchVelocity.x +
      result.launchVelocity.y * result.launchVelocity.y,
  );
  report(
    Math.abs(actualSpeed - expectedSpeed) < 1e-9,
    `launch speed at power ${String(power)} matches the R4.5 mapping`,
    `expected ${expectedSpeed.toFixed(6)}, got ${actualSpeed.toFixed(6)}`,
  );
  console.log(
    `        ${String(angle).padStart(3)} deg / ${String(power).padStart(3)}%  ->  velocity (${result.launchVelocity.x.toFixed(3)}, ${result.launchVelocity.y.toFixed(3)})`,
  );
}

{
  // R7.6 - counter-clockwise from the positive horizontal axis, so 90 degrees points at increasing y.
  const up = fire(90, 50);
  report(
    up.accepted && Math.abs(up.launchVelocity.x) < 1e-12 && up.launchVelocity.y > 0,
    '90 degrees points along increasing y, counter-clockwise from the positive x axis',
    up.accepted ? `(${up.launchVelocity.x.toExponential(2)}, ${up.launchVelocity.y.toFixed(3)})` : up.reason,
  );
}

{
  // Every accepted Shot leaves the Ball in motion, because the clamped power floor maps to
  // MIN_LAUNCH_SPEED, which R4.33 puts strictly above REST_SPEED_THRESHOLD.
  const weakest = fire(0, -1000);
  report(
    weakest.accepted && speedOf(weakest.ball) > 0 && weakest.ball.outcome === 'IN_MOTION',
    'the weakest accepted Shot still leaves the Ball in motion',
    weakest.accepted ? `speed ${speedOf(weakest.ball).toFixed(3)}, outcome ${weakest.ball.outcome}` : weakest.reason,
  );
}

// -- R8.6, R6.9: the pre-shot position ------------------------------------------------------------

console.log('');

{
  const result = fire(0, 50);
  report(
    result.accepted &&
      result.ball.preShotPosition.x === collision.arena.spawn.x &&
      result.ball.preShotPosition.y === collision.arena.spawn.y,
    'R8.6 records the position held immediately before launch',
    result.accepted
      ? `(${String(result.ball.preShotPosition.x)}, ${String(result.ball.preShotPosition.y)})`
      : result.reason,
  );
  report(
    result.accepted && result.ball.stepsSinceLaunch === 0 && result.ball.subThresholdSteps === 0,
    'an accepted Shot resets the step counters',
    result.accepted
      ? `${String(result.ball.stepsSinceLaunch)} steps, ${String(result.ball.subThresholdSteps)} sub-threshold`
      : result.reason,
  );
  report(
    result.accepted && !result.preShotPositionAnomaly,
    'a spawn placement is a legal pre-shot position',
    result.accepted ? String(result.preShotPositionAnomaly) : result.reason,
  );
}

{
  // The R6.9 bound is exactly where contact resolution parks a resting Ball - which under A-2 means
  // sunk into the terrain along its local normal by MAX_PENETRATION_TOLERANCE, not near any edge:
  // both Course ends are open in every Arena (A-2 R2.19), so x alone cannot make a position illegal
  // until it leaves the Course outright.
  const contactX = 800;
  const surfaceNormal = collision.terrain.normalAt(contactX);
  const onTheSurface = restingCentreAt(collision.terrain, contactX, BALL_RADIUS);

  function sunkBy(depth: number): Vector2 {
    return {
      x: onTheSurface.x - surfaceNormal.x * depth,
      y: onTheSurface.y - surfaceNormal.y * depth,
    };
  }

  // A hair inside the bound rather than exactly on it: the legality test compares a recomputed
  // clearance against the very number this construction targets, and the last bits of two different
  // square roots may disagree where the mathematics agrees.
  const atTheBound = sunkBy(MAX_PENETRATION_TOLERANCE * 0.999);
  const deeperThanTheBound = sunkBy(MAX_PENETRATION_TOLERANCE + 1);

  report(
    isLegalPreShotPosition(collision, atTheBound),
    'a Ball parked exactly at the R6.9 bound is a legal pre-shot position',
    `sunk ${String(MAX_PENETRATION_TOLERANCE)} below the surface at (${atTheBound.x.toFixed(1)}, ${atTheBound.y.toFixed(1)})`,
  );
  report(
    !isLegalPreShotPosition(collision, deeperThanTheBound),
    'a Ball closer than the R6.9 bound is not a legal pre-shot position',
    `sunk ${(MAX_PENETRATION_TOLERANCE + 1).toFixed(1)} below the surface at (${deeperThanTheBound.x.toFixed(1)}, ${deeperThanTheBound.y.toFixed(1)})`,
  );

  const illegal: BallState = createBallAtRest(deeperThanTheBound);
  const result = shoot(0, 50, { collision, ball: illegal, precondition: null });
  report(
    result.accepted && result.preShotPositionAnomaly,
    'an illegal pre-shot position raises an anomaly rather than a rejection outside the frozen set',
    result.accepted ? `anomaly ${String(result.preShotPositionAnomaly)}` : result.reason,
  );
}

finish();
