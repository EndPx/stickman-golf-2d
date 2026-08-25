// Task 5.2 acceptance check.
//
// "A slow Ball rolling over the Hole is captured; the same shot at full power passes over it and is
// later capturable."
//
// Plus the rest debounce, the out-of-bounds reset, the capture-outranks-out-of-bounds precedence and
// the maximum-shot-duration valve.
//
// Run with `node verification/tools/check-physics-terminal.ts`.

import {
  HOLE_CAPTURE_MAX_SPEED,
  HOLE_RADIUS,
  MAX_SHOT_DURATION_STEPS,
  POWER_MAX_PERCENT,
  POWER_MIN_PERCENT,
  REST_DEBOUNCE_STEPS,
  REST_SPEED_THRESHOLD,
} from '../../shared/constants.ts';
import { distanceBetweenPoints } from '../../shared/geometry.ts';
import {
  advance,
  createBallAtRest,
  simulateShotToRest,
  speedOf,
  step,
  type AdvanceOutcome,
  type BallState,
} from '../../shared/physics.ts';
import { restingCentreAt } from '../../shared/terrain.ts';
import { collisionFor, createReporter, launchFrom } from './shot-helpers.ts';

const { report, finish } = createReporter();

const collision1 = collisionFor(1);
const collision2 = collisionFor(2);
const arena1 = collision1.arena;
const arena2 = collision2.arena;

/** An Arena 1 Ball in motion, launched from that Arena's spawn point through `shoot`. */
function launch(angleDegrees: number, powerPercent: number): BallState {
  return launchFrom(collision1, arena1.spawn, angleDegrees, powerPercent);
}

// -- the acceptance condition: slow captures, full power passes over -----------------------------

{
  // Arena 1's Hole sits in a basin down a falling fairway, so under A-2 the parameters that capture
  // and the parameters that fly over are found on the grid rather than assumed. The acceptance
  // condition is unchanged: some Shot arrives slow enough to capture; a harder one passes over without
  // capturing and stops beyond the Hole; from there the Hole is capturable again (R6.2).
  let slow: AdvanceOutcome | null = null;
  let slowLabel = '';
  for (let power = POWER_MIN_PERCENT; power <= POWER_MAX_PERCENT; power += 5) {
    const candidate = simulateShotToRest(collision1, launch(0, power));
    if (candidate.ball.outcome === 'HOLED') {
      slow = candidate;
      slowLabel = `angle 0 / power ${String(power)}`;
      break;
    }
  }

  let over: AdvanceOutcome | null = null;
  let overLabel = '';
  searchOver: for (const angle of [0, 5, 355, 10, 350]) {
    for (let power = POWER_MAX_PERCENT; power >= POWER_MIN_PERCENT; power -= 5) {
      const candidate = simulateShotToRest(collision1, launch(angle, power));
      if (
        candidate.ball.outcome === 'AT_REST' &&
        candidate.ball.position.x > arena1.hole.x + HOLE_RADIUS
      ) {
        over = candidate;
        overLabel = `angle ${String(angle)} / power ${String(power)}`;
        break searchOver;
      }
    }
  }

  if (slow === null || over === null) {
    report(false, 'acceptance setup - a capturing Shot and an overshooting Shot both exist', `captured ${slowLabel || 'none'}, overshot ${overLabel || 'none'}`);
  } else {
    console.log(
      `capture shot (${slowLabel}): outcome HOLED in ${String(slow.stepsExecuted)} steps`,
    );
    console.log(
      `overshoot shot (${overLabel}): outcome AT_REST at x ${over.ball.position.x.toFixed(2)} against a Hole at x ${String(arena1.hole.x)}\n`,
    );

    report(true, 'a slow Ball arriving at the Hole is captured', slowLabel);
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
      over.ball.outcome === 'AT_REST' && over.shotDurationAnomalyCount === 0,
      'a harder Shot passes over the Hole without capture and stops beyond it',
      `${overLabel}, x ${over.ball.position.x.toFixed(2)}`,
    );

    // "...and is later capturable": the Ball that passed over is still eligible, so some following
    // Shot from where it stopped holes out. The return leg runs uphill out of the basin, so a small
    // search picks the club rather than assuming one.
    let followUp: AdvanceOutcome | null = null;
    let followLabel = '';
    searchFollowUp: for (let angle = 140; angle <= 220; angle += 10) {
      for (let power = 20; power <= 80; power += 10) {
        const candidate = simulateShotToRest(collision1, launchFrom(collision1, over.ball.position, angle, power));
        if (candidate.ball.outcome === 'HOLED') {
          followUp = candidate;
          followLabel = `angle ${String(angle)} / power ${String(power)}`;
          break searchFollowUp;
        }
      }
    }
    report(
      followUp !== null,
      'a Ball that passed over the Hole is capturable on a later Shot',
      followUp === null ? 'no grid Shot from the overshoot position reached the Hole' : followLabel,
    );
  }
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
  // A Ball lofted straight up at minimum power lands back on the tee slope and rolls to a stop well
  // short of the Hole - rest by debounce, not by capture.
  let ball = launch(90, 10);
  let stepsBelowThresholdBeforeStop = 0;
  let stopped = false;

  for (let index = 0; index < MAX_SHOT_DURATION_STEPS; index += 1) {
    const before = ball;
    ball = step(collision1, ball).ball;
    // Only grounded slowness counts toward the debounce (R3.14 operation 7's grounded clause), so the
    // probe applies the same filter an apex would otherwise trip.
    if (before.grounded && speedOf(before) < REST_SPEED_THRESHOLD && !stopped) {
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
  // Rolling uphill along the turf at just under the threshold speed: gravity along the slope bleeds
  // what little speed remains, the step ends sub-threshold and grounded, and the counter must advance
  // - while the Ball must not latch to rest, because one step is not three.
  const rollX = 200;
  const rollNormal = collision1.terrain.normalAt(rollX);
  const rollTangent = { x: rollNormal.y, y: -rollNormal.x };
  let ball: BallState = {
    ...createBallAtRest(restingCentreAt(collision1.terrain, rollX, 10)),
    velocity: {
      x: rollTangent.x * REST_SPEED_THRESHOLD * 0.9,
      y: rollTangent.y * REST_SPEED_THRESHOLD * 0.9,
    },
    grounded: true,
    outcome: 'IN_MOTION',
  };
  ball = step(collision1, ball).ball;
  const afterOneSubThresholdStep = ball.subThresholdSteps;

  // Give it a shove back above the threshold, as a downhill grade or a bounce would.
  ball = {
    ...ball,
    velocity: {
      x: -rollTangent.x * REST_SPEED_THRESHOLD * 4,
      y: -rollTangent.y * REST_SPEED_THRESHOLD * 4,
    },
  };
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
  // Arena 2's Course ends are open (A-2 R2.19). Fired from ON the terrain near the right end, from a
  // position that is deliberately **not** the spawn point, so R6.5's "reset to the pre-shot position
  // rather than the spawn point" clause is actually distinguishable.
  const preShot = restingCentreAt(collision2.terrain, arena2.courseWidth - 120, 10);
  const fired = launchFrom(collision2, preShot, 0, POWER_MAX_PERCENT);
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

// -- R6.4: the boundary itself is inside; half a unit past it is not -------------------------------

{
  // Both ends are open and the exit test is strict (`position.x > courseWidth`), so the boundary value
  // is inside. Contact resolution nudges a rolling Ball along a tilted normal, so exact-landing
  // arithmetic is brittle; the two sides of the comparison are placed directly instead.
  const edgeX = arena2.courseWidth;
  const justInsideStart = restingCentreAt(collision2.terrain, edgeX - 0.5, 10);
  const justInside: BallState = {
    ...createBallAtRest(justInsideStart),
    velocity: { x: 30, y: 0 },
    outcome: 'IN_MOTION',
  };
  const stayedIn = step(collision2, justInside).ball;

  const pastEdgeStart = restingCentreAt(collision2.terrain, edgeX + 0.5, 10);
  const justOutside: BallState = {
    ...createBallAtRest(pastEdgeStart),
    velocity: { x: 30, y: 0 },
    outcome: 'IN_MOTION',
  };
  const wentOut = step(collision2, justOutside).ball;

  report(
    stayedIn.outcome !== 'OUT_OF_BOUNDS' && stayedIn.position.x <= edgeX,
    'a centre at or before the Course end is not out of bounds',
    `ended x ${stayedIn.position.x.toFixed(3)}, outcome ${stayedIn.outcome}`,
  );
  report(
    wentOut.outcome === 'OUT_OF_BOUNDS' &&
      wentOut.position.x === pastEdgeStart.x &&
      wentOut.position.y === pastEdgeStart.y,
    'a centre past the Course end is out of bounds and resets to its pre-shot position',
    `outcome ${wentOut.outcome}, reset to (${wentOut.position.x.toFixed(3)}, ${wentOut.position.y.toFixed(3)})`,
  );
}

// -- capture outranks out of bounds within one step ------------------------------------------------

{
  // No declared Arena puts the Hole within one step of a Course end, so the co-occurrence cannot be
  // produced through play. It is produced here directly: a synthetic Arena whose Course ends two world
  // units past the Hole, a Ball rolling across the Hole under the capture speed, so this one step
  // satisfies both the R6.1 path test and the R6.4 exit test and only one may decide.
  const syntheticArena = { ...arena2, courseWidth: arena2.holeX + 1 };
  const syntheticCollision = {
    arena: syntheticArena,
    terrain: arena2.terrain,
    obstacles: [],
  };

  const startX = arena2.holeX - 2;
  const startOnSurface = restingCentreAt(arena2.terrain, startX, 10);
  const crossingOut: BallState = {
    ...createBallAtRest(startOnSurface),
    // Post-friction speed stays just under HOLE_CAPTURE_MAX_SPEED, while the displacement carries the
    // centre past the truncated Course end in the same step.
    velocity: { x: HOLE_CAPTURE_MAX_SPEED - 1, y: 0 },
    grounded: true,
    outcome: 'IN_MOTION',
  };
  const outcome = step(syntheticCollision, crossingOut);
  report(
    outcome.ball.outcome === 'HOLED' && !outcome.residualOverlapAnomaly,
    'Hole capture outranks out of bounds within one Simulation_Step',
    `${outcome.ball.outcome}, end x ${outcome.ball.position.x.toFixed(2)} against a Course end at ${String(syntheticArena.courseWidth)}`,
  );
}

// -- R6.1: the swept path test catches a graze the endpoint test would miss -----------------------

{
  // One step at just under the capture speed covers about 3.3 world units, far less than HOLE_RADIUS.
  // The Ball flies a step's length straight over the Hole, held `BALL_RADIUS` short of the turf above
  // it - never touching the ground, never entering the cup horizontally at the step's end, yet its
  // centre's path passes within HOLE_RADIUS of the Hole and the capture takes it.
  const stepDistance = (HOLE_CAPTURE_MAX_SPEED - 1) / 60;
  const halfSpan = stepDistance / 2;
  const grazeX = arena1.hole.x - halfSpan;
  const grazing: BallState = {
    ...createBallAtRest({
      x: grazeX,
      // Clear of the turf (`HOLE_RADIUS - 2` = 16 exceeds `BALL_RADIUS` = 10) yet low enough that the
      // path passes within `HOLE_RADIUS` of a Hole centre sitting on that same surface.
      y: collision1.terrain.heightAt(grazeX) + HOLE_RADIUS - 2,
    }),
    // Airborne, so air friction applies: launching at exactly MAX-1 lands the end-of-step speed just
    // under the capture ceiling rather than just over it.
    velocity: { x: HOLE_CAPTURE_MAX_SPEED - 1, y: 0 },
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
          launchFrom(collision, collision.arena.spawn, angle, power),
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
          launchFrom(collision, collision.arena.spawn, angle, power),
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

finish();
