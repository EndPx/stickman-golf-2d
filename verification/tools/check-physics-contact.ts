// Task 5.1 acceptance check.
//
// "A Ball fired into a walled corner reflects twice and its overlap after every step stays within
// MAX_PENETRATION_TOLERANCE."
//
// Arena 1 is fully walled, so its bottom-left corner is two perpendicular Collision_Surfaces meeting.
// A Ball aimed into it must reflect off both and come back out into the Playfield, and no step may
// ever leave it deeper than the tolerance.
//
// Run with `node verification/tools/check-physics-contact.ts`.

import { getArena } from '../../shared/arenas.ts';
import {
  BALL_RADIUS,
  FRICTION_PER_STEP,
  MAX_PENETRATION_TOLERANCE,
  POWER_MAX_PERCENT,
  WALL_RESTITUTION,
  launchSpeedForPower,
} from '../../shared/constants.ts';
import {
  createArenaCollision,
  createBallAtRest,
  isInMotion,
  largestSurfaceOverlap,
  speedOf,
  step,
  type BallState,
} from '../../shared/physics.ts';

let failures = 0;

function report(ok: boolean, label: string, detail: string): void {
  if (!ok) {
    failures += 1;
  }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === '' ? '' : ` - ${detail}`}`);
}

const collision = createArenaCollision(getArena(1));

function launch(from: { x: number; y: number }, angleDegrees: number, powerPercent: number): BallState {
  const speed = launchSpeedForPower(powerPercent);
  const radians = (angleDegrees * Math.PI) / 180;
  return {
    ...createBallAtRest(from),
    velocity: { x: Math.cos(radians) * speed, y: Math.sin(radians) * speed },
    outcome: 'IN_MOTION',
  };
}

// -- corner reflection ---------------------------------------------------------------------------

// Fired down-left at full power from near the bottom-left corner of Arena 1.
let ball = launch({ x: 200, y: 200 }, 225, POWER_MAX_PERCENT);

let totalReflections = 0;
let worstOverlap = Number.NEGATIVE_INFINITY;
let stepsRun = 0;
let anomalies = 0;
const reflectionSteps: number[] = [];
// A Ball stopped by the R3.16 bail-out has zero velocity, so `isInMotion` also ends the loop then.
const stepCeiling = 600;

while (isInMotion(ball) && stepsRun < stepCeiling) {
  const outcome = step(collision, ball);
  ball = outcome.ball;
  stepsRun += 1;

  if (outcome.reflectionCount > 0) {
    totalReflections += outcome.reflectionCount;
    reflectionSteps.push(stepsRun);
  }
  if (outcome.residualOverlapAnomaly) {
    anomalies += 1;
  }

  const overlap = largestSurfaceOverlap(collision, ball);
  worstOverlap = Math.max(worstOverlap, overlap);
}

console.log(
  `corner shot: ${String(stepsRun)} steps, ${String(totalReflections)} reflections at steps [${reflectionSteps.join(', ')}], final position (${ball.position.x.toFixed(3)}, ${ball.position.y.toFixed(3)}), final speed ${speedOf(ball).toFixed(4)}\n`,
);

report(
  totalReflections >= 2,
  'a Ball fired into a walled corner reflects at least twice',
  `${String(totalReflections)} reflections`,
);
report(
  worstOverlap <= MAX_PENETRATION_TOLERANCE + 1e-9,
  'overlap after every step stays within MAX_PENETRATION_TOLERANCE',
  `worst overlap ${worstOverlap.toFixed(9)} against a tolerance of ${String(MAX_PENETRATION_TOLERANCE)}`,
);
report(anomalies === 0, 'no residual-overlap anomaly on the corner shot', `${String(anomalies)} raised`);

// -- both components reversed by the corner -------------------------------------------------------

// Velocity started down-left; after two perpendicular reflections both components must point up-right.
report(
  ball.velocity.x >= 0 && ball.velocity.y >= 0,
  'both velocity components reverse across the corner',
  `final velocity (${ball.velocity.x.toFixed(4)}, ${ball.velocity.y.toFixed(4)})`,
);

// -- R3.6: restitution on the perpendicular component, parallel component preserved --------------

// Straight down at the bottom edge: the perpendicular component is the whole velocity, so one step's
// friction and one reflection are the only things acting on it.
{
  const start = { x: 500, y: BALL_RADIUS + 1 };
  const incoming = launch(start, 270, POWER_MAX_PERCENT);
  const first = step(collision, incoming);

  const expectedSpeed =
    Math.abs(incoming.velocity.y) * FRICTION_PER_STEP * WALL_RESTITUTION;
  const actualSpeed = speedOf(first.ball);

  report(
    first.reflectionCount === 1,
    'a head-on edge contact reflects exactly once',
    `${String(first.reflectionCount)} reflections`,
  );
  report(
    Math.abs(actualSpeed - expectedSpeed) < 1e-9,
    'the perpendicular component is scaled by WALL_RESTITUTION after friction',
    `expected ${expectedSpeed.toFixed(6)}, got ${actualSpeed.toFixed(6)}`,
  );
  report(
    first.ball.velocity.y > 0,
    'the reflected Ball travels away from the edge',
    `velocity y ${first.ball.velocity.y.toFixed(4)}`,
  );
  report(
    Math.abs(first.ball.velocity.x) < 1e-12,
    'a purely perpendicular contact leaves the parallel component at zero',
    `velocity x ${first.ball.velocity.x.toExponential(3)}`,
  );
  report(
    first.pathSegments.length === 2,
    'a step that resolves contact reports a two-segment path for R6.1',
    `${String(first.pathSegments.length)} segments`,
  );
}

// -- R3.15: a glancing contact preserves the parallel component ----------------------------------

{
  const start = { x: 500, y: BALL_RADIUS + 1 };
  const incoming = launch(start, 315, POWER_MAX_PERCENT); // down and to the right
  const parallelBefore = incoming.velocity.x * FRICTION_PER_STEP;
  const first = step(collision, incoming);

  report(
    Math.abs(first.ball.velocity.x - parallelBefore) < 1e-9,
    'a glancing edge contact preserves the parallel component exactly',
    `expected ${parallelBefore.toFixed(6)}, got ${first.ball.velocity.x.toFixed(6)}`,
  );
}

// -- R3.13: determinism across repeated runs from an identical state ------------------------------

{
  function runToStop(): string {
    let current = launch({ x: 200, y: 200 }, 225, POWER_MAX_PERCENT);
    let steps = 0;
    while (isInMotion(current) && steps < stepCeiling) {
      current = step(collision, current).ball;
      steps += 1;
    }
    return `${String(steps)}|${current.position.x.toExponential(17)}|${current.position.y.toExponential(17)}`;
  }

  const first = runToStop();
  const second = runToStop();
  report(first === second, 'repeated runs from an identical state agree exactly', first === second ? first : `${first} vs ${second}`);
}

// -- R3.16: a Ball driven far outside geometry is returned to its step-start position -------------

{
  // A Playfield edge is a half-plane, so depenetration always clears it in one move however deep the
  // Ball is - there is no residual overlap to find there. Producing one needs a surface whose
  // interior can swallow the Ball centre, because then the centre-to-surface distance saturates at
  // zero and pushing out by BALL_RADIUS is not enough to escape.
  //
  // Arena 2's wall spans x 470 to 500, which is 30 world units across, narrower than twice
  // BALL_RADIUS. A centre parked inside it is a state no legal Shot can produce, which is exactly what
  // R3.16 guards against.
  const wallCollision = createArenaCollision(getArena(2));
  const wedged: BallState = {
    ...createBallAtRest({ x: 485, y: 300 }),
    velocity: { x: 600, y: 0 },
    outcome: 'IN_MOTION',
  };
  const outcome = step(wallCollision, wedged);

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
}

// -- R6.8: an open edge contributes no surface ----------------------------------------------------

{
  const arena2Collision = createArenaCollision(getArena(2));
  const rightEdgeSurfaces = arena2Collision.surfaces.filter((surface) => surface.label === 'edge right');
  const arena1RightEdge = collision.surfaces.filter((surface) => surface.label === 'edge right');

  report(
    rightEdgeSurfaces.length === 0,
    "Arena 2's open right edge declares no Collision_Surface",
    `${String(rightEdgeSurfaces.length)} found`,
  );
  report(
    arena1RightEdge.length === 1,
    "Arena 1's walled right edge declares one Collision_Surface",
    `${String(arena1RightEdge.length)} found`,
  );
  console.log(
    `\nArena 1 surfaces: [${collision.surfaces.map((surface) => surface.label).join(', ')}]`,
  );
  console.log(
    `Arena 2 surfaces: [${arena2Collision.surfaces.map((surface) => surface.label).join(', ')}]`,
  );
}

console.log('');
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${String(failures)} CHECK(S) FAILED`);
if (failures > 0) {
  process.exitCode = 1;
}
