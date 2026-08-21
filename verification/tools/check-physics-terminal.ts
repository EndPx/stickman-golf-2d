// Task 5.2 acceptance check.
//
// "A slow Ball rolling over the Hole is captured; the same shot at full power passes over it and is
// later capturable."
//
// Plus the rest debounce, the out-of-bounds reset, the capture-outranks-out-of-bounds precedence and
// the maximum-shot-duration valve.
//
// Run with `node verification/tools/check-physics-terminal.ts`.

import { getArena } from '../../shared/arenas.ts';
import {
  HOLE_CAPTURE_MAX_SPEED,
  HOLE_RADIUS,
  MAX_SHOT_DURATION_STEPS,
  POWER_MAX_PERCENT,
  REST_DEBOUNCE_STEPS,
  REST_SPEED_THRESHOLD,
  launchSpeedForPower,
} from '../../shared/constants.ts';
import { distanceBetweenPoints } from '../../shared/geometry.ts';
import {
  advance,
  createArenaCollision,
  createBallAtRest,
  simulateShotToRest,
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

const arena1 = getArena(1);
const arena2 = getArena(2);
const collision1 = createArenaCollision(arena1);
const collision2 = createArenaCollision(arena2);

function launchFrom(
  from: { x: number; y: number },
  angleDegrees: number,
  powerPercent: number,
): BallState {
  const speed = launchSpeedForPower(powerPercent);
  const radians = (angleDegrees * Math.PI) / 180;
  const base = createBallAtRest(from);
  return {
    ...base,
    velocity: { x: Math.cos(radians) * speed, y: Math.sin(radians) * speed },
    outcome: 'IN_MOTION',
  };
}

function launch(angleDegrees: number, powerPercent: number): BallState {
  return launchFrom(arena1.spawn, angleDegrees, powerPercent);
}

// -- the acceptance condition: slow captures, full power passes over -----------------------------

{
  // Arena 1: spawn and Hole both at y=300, 500 world units apart, so angle 0 aims straight at it.
  const slow = simulateShotToRest(collision1, launch(0, 70));
  const full = simulateShotToRest(collision1, launch(0, POWER_MAX_PERCENT));

  console.log(
    `power 70:  outcome ${slow.ball.outcome}, ${String(slow.stepsExecuted)} steps, final (${slow.ball.position.x.toFixed(2)}, ${slow.ball.position.y.toFixed(2)})`,
  );
  console.log(
    `power 100: outcome ${full.ball.outcome}, ${String(full.stepsExecuted)} steps, final (${full.ball.position.x.toFixed(2)}, ${full.ball.position.y.toFixed(2)})\n`,
  );

  report(slow.ball.outcome === 'HOLED', 'a slow Ball rolling over the Hole is captured', slow.ball.outcome);
  report(
    slow.ball.position.x === arena1.hole.x && slow.ball.position.y === arena1.hole.y,
    'a captured Ball is held at the Hole centre',
    `(${String(slow.ball.position.x)}, ${String(slow.ball.position.y)})`,
  );
  report(
    speedOf(slow.ball) === 0,
    'a captured Ball has exactly zero velocity on both axes',
    String(speedOf(slow.ball)),
  );

  report(
    full.ball.outcome !== 'HOLED',
    'the same shot at full power passes over the Hole without capture',
    full.ball.outcome,
  );
  report(
    full.ball.position.x > arena1.hole.x + HOLE_RADIUS,
    'the full-power Ball comes to rest beyond the Hole',
    `x ${full.ball.position.x.toFixed(2)} against a Hole at x ${String(arena1.hole.x)}`,
  );

  // "...and is later capturable": the Ball that passed over is still eligible, so a following Shot
  // from where it stopped holes out. R6.2 requires exactly this. Power 35 rather than the minimum,
  // because the return leg is 236 world units and the weakest grid powers cannot carry that far.
  const followUp = simulateShotToRest(collision1, launchFrom(full.ball.position, 180, 35));
  console.log(
    `follow-up from (${full.ball.position.x.toFixed(2)}, ${full.ball.position.y.toFixed(2)}) at 180 deg power 35: outcome ${followUp.ball.outcome}\n`,
  );
  report(
    followUp.ball.outcome === 'HOLED',
    'a Ball that passed over the Hole is capturable on a later Shot',
    followUp.ball.outcome,
  );
}

// -- R6.2: speed at the Hole decides, and the boundary is HOLE_CAPTURE_MAX_SPEED -----------------

{
  // Walk the power grid and record the speed at which the Ball crosses the Hole against the outcome.
  const rows: string[] = [];
  for (let power = 10; power <= POWER_MAX_PERCENT; power += 5) {
    let ball = launch(0, power);
    let speedAtHole: number | null = null;

    for (let index = 0; index < MAX_SHOT_DURATION_STEPS; index += 1) {
      const outcome = step(collision1, ball);
      const crossed =
        ball.position.x <= arena1.hole.x && outcome.ball.position.x >= arena1.hole.x;
      ball = outcome.ball;
      if (crossed && speedAtHole === null) {
        speedAtHole = speedOf(ball);
      }
      if (ball.outcome !== 'IN_MOTION') {
        break;
      }
    }

    rows.push(
      `  power ${String(power).padStart(3)}  ->  ${ball.outcome.padEnd(13)} speed at Hole ${speedAtHole === null ? '   n/a' : speedAtHole.toFixed(1).padStart(6)}`,
    );
  }
  console.log('Arena 1, angle 0, across the power grid:');
  console.log(rows.join('\n'));
  console.log('');
}

// -- R5.6, R5.8: the rest debounce ---------------------------------------------------------------

{
  // A Ball launched away from the Hole comes to rest by debounce, not by capture.
  let ball = launch(180, 20);
  let stepsBelowThresholdBeforeStop = 0;
  let stopped = false;

  for (let index = 0; index < MAX_SHOT_DURATION_STEPS; index += 1) {
    const before = ball;
    ball = step(collision1, ball).ball;
    if (speedOf(before) < REST_SPEED_THRESHOLD && !stopped) {
      stepsBelowThresholdBeforeStop += 1;
    }
    if (ball.outcome === 'AT_REST') {
      stopped = true;
      break;
    }
  }

  report(stopped, 'a Ball away from the Hole comes to rest by debounce', ball.outcome);
  report(
    ball.subThresholdSteps === REST_DEBOUNCE_STEPS,
    'the rest debounce completes at exactly REST_DEBOUNCE_STEPS',
    `${String(ball.subThresholdSteps)} sub-threshold steps`,
  );
  report(
    ball.velocity.x === 0 && ball.velocity.y === 0,
    'R5.6 sets velocity to exactly zero on both axes on the completing step',
    `(${String(ball.velocity.x)}, ${String(ball.velocity.y)})`,
  );
  report(
    stepsBelowThresholdBeforeStop === REST_DEBOUNCE_STEPS - 1,
    'the Ball keeps being integrated on every earlier sub-threshold step',
    `${String(stepsBelowThresholdBeforeStop)} earlier sub-threshold steps observed`,
  );
}

// -- R5.8: a dip below the threshold that recovers does not stop the Ball -------------------------

{
  // Fired almost straight at a wall at low speed: the perpendicular bounce leaves it briefly slow, and
  // it must not latch to rest while it is still moving.
  const nearWall = { x: 200, y: 300 };
  let ball: BallState = {
    ...createBallAtRest(nearWall),
    velocity: { x: -REST_SPEED_THRESHOLD * 0.9, y: 0 },
    outcome: 'IN_MOTION',
  };
  ball = step(collision1, ball).ball;
  const afterOneSubThresholdStep = ball.subThresholdSteps;

  // Give it a shove back above the threshold, as a wall reflection or a Moving_Obstacle would.
  ball = { ...ball, velocity: { x: 0, y: REST_SPEED_THRESHOLD * 4 } };
  ball = step(collision1, ball).ball;

  report(
    afterOneSubThresholdStep === 1,
    'one sub-threshold step advances the counter to 1',
    String(afterOneSubThresholdStep),
  );
  report(
    ball.subThresholdSteps === 0,
    'R5.8 resets the counter when speed recovers before the debounce completes',
    String(ball.subThresholdSteps),
  );
  report(ball.outcome === 'IN_MOTION', 'the recovered Ball is still in motion', ball.outcome);
}

// -- R6.4, R6.5: out of bounds across Arena 2's open right edge ----------------------------------

{
  // Arena 2's right edge is open. Fired from beyond the wall so nothing stands between the Ball and
  // that edge, and from a position that is deliberately **not** the spawn point, so R6.5's "reset to
  // the pre-shot position rather than the spawn point" clause is actually distinguishable.
  const preShot = { x: 600, y: 300 };
  const fired = launchFrom(preShot, 0, POWER_MAX_PERCENT);
  const result = simulateShotToRest(collision2, fired);

  console.log(
    `\nArena 2, angle 0 power 100 from (${String(preShot.x)}, ${String(preShot.y)}): outcome ${result.ball.outcome}, final (${result.ball.position.x.toFixed(2)}, ${result.ball.position.y.toFixed(2)})`,
  );

  report(
    result.ball.outcome === 'OUT_OF_BOUNDS',
    'a Ball crossing an open Playfield edge is out of bounds',
    result.ball.outcome,
  );
  report(
    result.ball.position.x === preShot.x && result.ball.position.y === preShot.y,
    'R6.5 resets to the recorded pre-shot position, not to the spawn point',
    `reset to (${String(result.ball.position.x)}, ${String(result.ball.position.y)}), spawn is (${String(arena2.spawn.x)}, ${String(arena2.spawn.y)})`,
  );
  report(
    speedOf(result.ball) === 0,
    'an out-of-bounds Ball has exactly zero velocity on both axes',
    String(speedOf(result.ball)),
  );
}

// -- R6.4: a centre exactly on an edge counts as inside ------------------------------------------

{
  // Arena 2's right edge is open, so nothing reflects there. Placed just inside and crawling right at a
  // speed low enough that one step lands the centre exactly on the edge.
  const onEdge: BallState = {
    ...createBallAtRest({ x: 1000 - 1 / 60, y: 300 }),
    velocity: { x: 1 / 0.985, y: 0 },
    outcome: 'IN_MOTION',
  };
  const landed = step(collision2, onEdge).ball;
  report(
    Math.abs(landed.position.x - 1000) < 1e-9 && landed.outcome !== 'OUT_OF_BOUNDS',
    'a centre lying exactly on a Playfield edge counts as inside',
    `x ${landed.position.x.toFixed(12)}, outcome ${landed.outcome}`,
  );
}

// -- capture outranks out of bounds within one step ------------------------------------------------

{
  // A Hole placed against Arena 2's open right edge would let a Ball satisfy both conditions on the
  // same step. Arena 2's Hole is at (760, 100), so instead this is checked directly: a Ball that would
  // exit is holed when its step path also passes through the Hole under the capture speed.
  const justInside = { x: 760 - HOLE_RADIUS / 2, y: 100 };
  const crawlingOut: BallState = {
    ...createBallAtRest(justInside),
    // Fast enough to leave the Playfield in one step from here, but under the capture speed.
    velocity: { x: (HOLE_CAPTURE_MAX_SPEED - 1) / 0.985, y: 0 },
    outcome: 'IN_MOTION',
  };
  const outcome = step(collision2, crawlingOut);
  report(
    outcome.ball.outcome === 'HOLED',
    'Hole capture outranks out of bounds within one Simulation_Step',
    `${outcome.ball.outcome}, end position (${outcome.ball.position.x.toFixed(2)}, ${outcome.ball.position.y.toFixed(2)})`,
  );
}

// -- R6.1: the swept path test catches a graze the endpoint test would miss -----------------------

{
  // One step at just under the capture speed covers about 3.3 world units, far less than HOLE_RADIUS,
  // so a straight roll through the Hole cannot slip between samples. The path test is proved instead by
  // a step whose start and end both sit outside HOLE_RADIUS while the segment between them crosses it.
  const stepDistance = (HOLE_CAPTURE_MAX_SPEED - 1) / 60;
  const halfSpan = stepDistance / 2;
  const grazing: BallState = {
    ...createBallAtRest({ x: arena1.hole.x - halfSpan, y: arena1.hole.y + HOLE_RADIUS - 1 }),
    velocity: { x: (HOLE_CAPTURE_MAX_SPEED - 1) / 0.985, y: 0 },
    outcome: 'IN_MOTION',
  };
  const outcome = step(collision1, grazing);
  const endDistance = distanceBetweenPoints(outcome.pathSegments[0]?.[1] ?? grazing.position, arena1.hole);

  report(
    outcome.ball.outcome === 'HOLED',
    'the R6.1 path test captures a Ball whose step crosses the Hole',
    `${outcome.ball.outcome}, endpoint distance from the Hole ${endDistance.toFixed(2)} against HOLE_RADIUS ${String(HOLE_RADIUS)}`,
  );
}

// -- R5.11, R4.12: the maximum-shot-duration valve ------------------------------------------------

{
  // A frictionless Ball is not reachable through play, so the valve is exercised by handing the engine a
  // Ball whose step count is already at the bound. It must stop, and it must report the anomaly.
  const atTheBound: BallState = {
    ...createBallAtRest({ x: 400, y: 300 }),
    velocity: { x: 300, y: 0 },
    stepsSinceLaunch: MAX_SHOT_DURATION_STEPS - 1,
    outcome: 'IN_MOTION',
  };
  const outcome = step(collision1, atTheBound);

  report(
    outcome.shotDurationAnomaly,
    'the valve fires at MAX_SHOT_DURATION_SECONDS of simulated time',
    `after ${String(outcome.ball.stepsSinceLaunch)} steps against a bound of ${String(MAX_SHOT_DURATION_STEPS)}`,
  );
  report(
    outcome.ball.outcome === 'AT_REST' && speedOf(outcome.ball) === 0,
    'the valve stops the Ball and reports it at rest',
    `${outcome.ball.outcome}, speed ${String(speedOf(outcome.ball))}`,
  );

  // The same valve, with the stopped position inside the Hole, must report a capture instead.
  const stoppingInHole: BallState = {
    ...createBallAtRest({ x: arena1.hole.x - 1, y: arena1.hole.y }),
    velocity: { x: HOLE_CAPTURE_MAX_SPEED * 3, y: 0 },
    stepsSinceLaunch: MAX_SHOT_DURATION_STEPS - 1,
    outcome: 'IN_MOTION',
  };
  const inHole = step(collision1, stoppingInHole);
  report(
    inHole.ball.outcome === 'HOLED' && inHole.shotDurationAnomaly,
    'the valve re-evaluates Hole capture against the stopped Ball',
    `${inHole.ball.outcome}, anomaly ${String(inHole.shotDurationAnomaly)}`,
  );
}

// -- every accepted Shot terminates (R5.12) across the whole grid ---------------------------------

{
  let worstSteps = 0;
  let nonTerminal = 0;
  let anomalies = 0;
  const outcomeCounts = new Map<string, number>();

  for (const collision of [collision1, collision2]) {
    for (let angle = 0; angle < 360; angle += 5) {
      for (let power = 10; power <= POWER_MAX_PERCENT; power += 5) {
        const result = advance(
          collision,
          launchFrom(collision.arena.spawn, angle, power),
          MAX_SHOT_DURATION_STEPS + 1,
        );
        worstSteps = Math.max(worstSteps, result.stepsExecuted);
        anomalies += result.residualOverlapAnomalyCount + result.shotDurationAnomalyCount;
        if (result.ball.outcome === 'IN_MOTION') {
          nonTerminal += 1;
        }
        outcomeCounts.set(result.ball.outcome, (outcomeCounts.get(result.ball.outcome) ?? 0) + 1);
      }
    }
  }

  console.log(
    `\nfull grid over Arenas 1 and 2: ${String(72 * 19 * 2)} Shots, worst ${String(worstSteps)} steps, ${String(anomalies)} anomalies`,
  );
  for (const [outcome, count] of [...outcomeCounts].sort()) {
    console.log(`  ${outcome.padEnd(14)} ${String(count)}`);
  }

  // Informational, and the raw material task 14 turns into recorded witness sequences: which single
  // Shots from each Arena's spawn point hole out, and which leave the Playfield.
  for (const collision of [collision1, collision2]) {
    const holed: string[] = [];
    const lost: string[] = [];
    for (let angle = 0; angle < 360; angle += 5) {
      for (let power = 10; power <= POWER_MAX_PERCENT; power += 5) {
        const result = simulateShotToRest(
          collision,
          launchFrom(collision.arena.spawn, angle, power),
        );
        const label = `${String(angle)}deg/${String(power)}%`;
        if (result.ball.outcome === 'HOLED') {
          holed.push(`${label}${result.reflectionCount > 0 ? `(${String(result.reflectionCount)}x bounce)` : ''}`);
        }
        if (result.ball.outcome === 'OUT_OF_BOUNDS') {
          lost.push(label);
        }
      }
    }
    console.log(`\nArena ${String(collision.arena.number)} single-Shot holes out: ${holed.join(', ')}`);
    console.log(`Arena ${String(collision.arena.number)} single-Shot out of bounds: ${lost.length === 0 ? 'none' : lost.join(', ')}`);
  }

  report(nonTerminal === 0, 'every Shot on the grid reaches a terminal outcome', `${String(nonTerminal)} still in motion`);
  report(
    worstSteps < MAX_SHOT_DURATION_STEPS,
    'no Shot on the grid needs the duration valve',
    `worst ${String(worstSteps)} steps against a bound of ${String(MAX_SHOT_DURATION_STEPS)}`,
  );
  report(anomalies === 0, 'no anomaly is raised anywhere on the grid', String(anomalies));
}

console.log('');
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${String(failures)} CHECK(S) FAILED`);
if (failures > 0) {
  process.exitCode = 1;
}
