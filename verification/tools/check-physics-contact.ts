// Task 5.1 acceptance check - as amended by A-2.
//
// The top-down build tested a walled corner. A-2 removed the walls: the primary Collision_Surface is
// now the terrain's local tangent line, and obstacles keep the rectangle treatment. The equivalent
// acceptance here:
//
//   - a Ball fired on a steep arc lands, reflects off the terrain, and its overlap after every step
//     stays within MAX_PENETRATION_TOLERANCE;
//   - the per-step operation order is exact - gravity, then friction, then displacement;
//   - a head-on terrain contact reflects across the tangent's normal scaled by TERRAIN_RESTITUTION,
//     preserving the parallel component;
//   - a contact whose velocity already points away from the surface reflects nothing (R3.15);
//   - repeated runs from an identical state agree exactly (R3.13);
//   - a Ball driven deep inside an obstacle - a state no legal Shot can produce, which is exactly what
//     R3.16 guards against - is returned to its step-start position with zero velocity;
//   - a resting Ball is untouched by `step` and traces no path.
//
// Every launch goes through `shoot`, per R8.9. Where a check needs a state `shoot` cannot produce -
// a Ball wedged inside an obstacle, or one parked a hand-picked distance above the turf - that is
// stated at the call site.
//
// Run with `node verification/tools/check-physics-contact.ts`.

import {
  AIR_FRICTION_PER_STEP,
  BALL_RADIUS,
  FIXED_STEP_SECONDS,
  GRAVITY,
  MAX_PENETRATION_TOLERANCE,
  POWER_MAX_PERCENT,
  REST_SPEED_THRESHOLD,
  ROLLING_FRICTION_PER_STEP,
  TERRAIN_RESTITUTION,
} from '../../shared/constants.ts';
import {
  createBallAtRest,
  isInMotion,
  largestSurfaceOverlap,
  speedOf,
  step,
  type BallState,
} from '../../shared/physics.ts';
import { restingCentreAt } from '../../shared/terrain.ts';
import type { Vector2 } from '../../shared/geometry.ts';
import { collisionFor, createReporter, launchFrom } from './shot-helpers.ts';

const { report, finish } = createReporter();

const collision = collisionFor(1);
const arena4Collision = collisionFor(4);

// A Ball stopped by the R3.16 bail-out or by the rest debounce has zero velocity, so `isInMotion` ends
// the loop. The ceiling only stops a runaway.
const STEP_CEILING = 2000;

function scaleAdd(point: Vector2, direction: Vector2, scale: number): Vector2 {
  return { x: point.x + direction.x * scale, y: point.y + direction.y * scale };
}

// -- landing on the terrain: reflection, tolerance, and a clean settle -----------------------------

{
  // Steep and full-power from a point above the tee: a high arc that comes down hard on rolling ground.
  const start = { x: 300, y: 300 };
  const ballLaunched = launchFrom(collision, start, 75, POWER_MAX_PERCENT);

  let ball = ballLaunched;
  let totalReflections = 0;
  let worstOverlap = Number.NEGATIVE_INFINITY;
  let stepsRun = 0;
  let anomalies = 0;

  while (isInMotion(ball) && stepsRun < STEP_CEILING) {
    const outcome = step(collision, ball);
    ball = outcome.ball;
    stepsRun += 1;

    totalReflections += outcome.reflectionCount;
    if (outcome.residualOverlapAnomaly) {
      anomalies += 1;
    }
    worstOverlap = Math.max(worstOverlap, largestSurfaceOverlap(collision, ball));
  }

  console.log(
    `ballistic shot: ${String(stepsRun)} steps, ${String(totalReflections)} terrain reflections, outcome ${ball.outcome}, final position (${ball.position.x.toFixed(3)}, ${ball.position.y.toFixed(3)})\n`,
  );

  report(
    totalReflections >= 1,
    'a Ball fired on a steep arc reflects off the terrain at least once',
    `${String(totalReflections)} reflections`,
  );
  report(
    worstOverlap <= MAX_PENETRATION_TOLERANCE + 1e-9,
    'overlap after every step stays within MAX_PENETRATION_TOLERANCE',
    `worst overlap ${worstOverlap.toFixed(9)} against a tolerance of ${String(MAX_PENETRATION_TOLERANCE)}`,
  );
  report(anomalies === 0, 'no residual-overlap anomaly on the ballistic shot', `${String(anomalies)} raised`);
  report(
    ball.outcome === 'AT_REST' && speedOf(ball) === 0,
    'the Ball settles to exactly zero speed rather than micro-bouncing for ever',
    `${ball.outcome} at ${String(speedOf(ball))}`,
  );
}

// -- R3.14 order, airborne branch: gravity, then friction, then displacement ----------------------

{
  // High above the turf, falling: no contact can occur this step, so every operation is observable.
  const start: Vector2 = { x: 500, y: 500 };
  const falling: BallState = {
    ...createBallAtRest(start),
    velocity: { x: 80, y: -120 },
    grounded: false,
    outcome: 'IN_MOTION',
  };

  const outcome = step(collision, falling);
  const expectedVelocityX = falling.velocity.x * AIR_FRICTION_PER_STEP;
  const expectedVelocityY = (falling.velocity.y - GRAVITY * FIXED_STEP_SECONDS) * AIR_FRICTION_PER_STEP;

  report(
    Math.abs(outcome.ball.velocity.x - expectedVelocityX) < 1e-9 &&
      Math.abs(outcome.ball.velocity.y - expectedVelocityY) < 1e-9,
    'an airborne step applies gravity before friction, exactly',
    `expected (${expectedVelocityX.toFixed(6)}, ${expectedVelocityY.toFixed(6)}), got (${outcome.ball.velocity.x.toFixed(6)}, ${outcome.ball.velocity.y.toFixed(6)})`,
  );
  report(
    Math.abs(outcome.ball.position.x - (start.x + expectedVelocityX * FIXED_STEP_SECONDS)) < 1e-9 &&
      Math.abs(outcome.ball.position.y - (start.y + expectedVelocityY * FIXED_STEP_SECONDS)) < 1e-9,
    'the displacement uses the post-friction velocity times FIXED_STEP_SECONDS',
    `(${outcome.ball.position.x.toFixed(6)}, ${outcome.ball.position.y.toFixed(6)})`,
  );
  report(
    !outcome.ball.grounded && outcome.reflectionCount === 0 && outcome.pathSegments.length === 1,
    'a clear airborne step touches nothing and traces a single segment',
    `${String(outcome.reflectionCount)} reflections, ${String(outcome.pathSegments.length)} segment(s)`,
  );
}

// -- head-on terrain contact: reflection across the tangent normal ---------------------------------

{
  // Parked just above contact height and driven straight into the turf - a hand-picked state, because
  // no grid Shot arrives this precisely. Impact speed sits above BOUNCE_MIN_NORMAL_SPEED, so the
  // normal component reflects rather than being zeroed.
  const contactX = 800;
  const normal = collision.terrain.normalAt(contactX);
  // 180 units per second crosses the 2-unit approach gap in one step and still sits above
  // BOUNCE_MIN_NORMAL_SPEED, so the normal component reflects rather than being zeroed.
  const impactSpeed = 180;
  const parked: BallState = {
    ...createBallAtRest(scaleAdd(restingCentreAt(collision.terrain, contactX, BALL_RADIUS), normal, 2)),
    velocity: scaleAdd({ x: 0, y: 0 }, normal, -impactSpeed),
  };

  // R3.19 - gravity touches the vertical component before friction runs, so the speed contact
  // reflects is measured on the velocity gravity and friction leave behind.
  const velocityAfterGravity = {
    x: parked.velocity.x,
    y: parked.velocity.y - GRAVITY * FIXED_STEP_SECONDS,
  };
  const preNormalSpeed =
    (velocityAfterGravity.x * normal.x + velocityAfterGravity.y * normal.y) *
    ROLLING_FRICTION_PER_STEP;

  const outcome = step(collision, parked);
  const postNormalSpeed =
    outcome.ball.velocity.x * normal.x + outcome.ball.velocity.y * normal.y;
  const expectedPostNormal = -preNormalSpeed * TERRAIN_RESTITUTION;

  report(
    outcome.reflectionCount === 1,
    'a head-on terrain contact reflects exactly once',
    `${String(outcome.reflectionCount)} reflections`,
  );
  report(
    Math.abs(postNormalSpeed - expectedPostNormal) < 1e-3,
    'the normal component leaves at TERRAIN_RESTITUTION of what arrived (after friction)',
    `expected about ${expectedPostNormal.toFixed(4)}, got ${postNormalSpeed.toFixed(4)}`,
  );
  report(
    postNormalSpeed > 0,
    'the reflected Ball travels back out of the ground',
    `normal-direction speed ${postNormalSpeed.toFixed(4)}`,
  );

  // The tangential component survives contact untouched. Gravity adds along the world vertical rather
  // than the tangent, so the comparison runs against the value gravity and friction leave behind.
  const tangent: Vector2 = { x: normal.y, y: -normal.x };
  const preParallel =
    (velocityAfterGravity.x * tangent.x + velocityAfterGravity.y * tangent.y) *
    ROLLING_FRICTION_PER_STEP;
  const postParallel = outcome.ball.velocity.x * tangent.x + outcome.ball.velocity.y * tangent.y;
  report(
    Math.abs(postParallel - preParallel) < 5e-2,
    'contact resolution preserves the tangential component',
    `expected about ${preParallel.toFixed(4)}, got ${postParallel.toFixed(4)} (residual is projection-frame drift: the tangent rotates slightly across the contact displacement)`,
  );
  report(
    outcome.pathSegments.length === 2,
    'a step that resolves contact reports a two-segment path for R6.1',
    `${String(outcome.pathSegments.length)} segments`,
  );
}

// -- R3.15: a separating contact reflects nothing --------------------------------------------------

{
  const contactX = 800;
  const normal = collision.terrain.normalAt(contactX);
  const leaving: BallState = {
    ...createBallAtRest(scaleAdd(restingCentreAt(collision.terrain, contactX, BALL_RADIUS), normal, -0.4)),
    velocity: scaleAdd({ x: 0, y: 0 }, normal, 30),
  };

  const outcome = step(collision, leaving);
  report(
    outcome.reflectionCount === 0 && outcome.ball.grounded,
    'R3.15 - a surface the velocity points away from reflects nothing',
    `${String(outcome.reflectionCount)} reflections, grounded ${String(outcome.ball.grounded)}`,
  );
}

// -- R3.13: determinism across repeated runs from an identical state ------------------------------

{
  const ARC_START: Vector2 = { x: 300, y: 300 };

  function runToStop(): string {
    let current = launchFrom(collision, ARC_START, 75, POWER_MAX_PERCENT);
    let steps = 0;
    while (isInMotion(current) && steps < STEP_CEILING) {
      current = step(collision, current).ball;
      steps += 1;
    }
    return `${String(steps)}|${current.position.x.toExponential(17)}|${current.position.y.toExponential(17)}`;
  }

  const first = runToStop();
  const second = runToStop();
  report(
    first === second,
    'repeated runs from an identical state agree exactly',
    first === second ? first : `${first} vs ${second}`,
  );
}

// -- R3.16: a Ball wedged inside an obstacle is returned to its step-start position ----------------

{
  // Arena 4's free-standing obstacle spans x 1240..1340, y 320..460 - 100 by 140 world units, far
  // wider than twice BALL_RADIUS. A centre parked at its middle is deeper inside than any single
  // depenetration can clear, because the centre-to-surface distance saturates at zero there. This is
  // a state no legal Shot can produce - `shoot` would flag it under R6.9 - which is exactly what the
  // guard exists to catch, so the velocity is set directly.
  const wedged: BallState = {
    ...createBallAtRest({ x: 1290, y: 390 }),
    velocity: { x: 600, y: 0 },
    outcome: 'IN_MOTION',
  };
  const outcome = step(arena4Collision, wedged);

  report(
    outcome.residualOverlapAnomaly,
    'R3.16 fires when overlap survives contact resolution',
    `anomaly ${String(outcome.residualOverlapAnomaly)}`,
  );
  report(
    outcome.ball.position.x === wedged.position.x && outcome.ball.position.y === wedged.position.y,
    'R3.16 returns the Ball to its step-start position',
    `(${String(outcome.ball.position.x)}, ${String(outcome.ball.position.y)})`,
  );
  report(
    outcome.ball.velocity.x === 0 && outcome.ball.velocity.y === 0,
    'R3.16 sets velocity to exactly zero on both axes',
    `(${String(outcome.ball.velocity.x)}, ${String(outcome.ball.velocity.y)})`,
  );
  report(
    outcome.ball.outcome === 'AT_REST',
    'R3.16 leaves the Ball at rest rather than stranded in motion',
    outcome.ball.outcome,
  );
}

// -- a Ball with exactly zero velocity is excluded from every operation ----------------------------

{
  const resting = createBallAtRest({ x: 300, y: 300 });
  const outcome = step(collision, resting);
  report(
    outcome.ball === resting && outcome.pathSegments.length === 0,
    'a Ball at rest is returned untouched and traces no path',
    `${String(outcome.pathSegments.length)} path segments`,
  );
  report(
    speedOf(resting) < REST_SPEED_THRESHOLD && outcome.ball.stepsSinceLaunch === 0,
    'a Ball at rest does not advance its step counter',
    String(outcome.ball.stepsSinceLaunch),
  );
}

finish();
