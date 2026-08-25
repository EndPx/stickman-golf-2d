// Course playability probe for the side-view gravity build (Amendment A-2).
//
// Brute-forces the whole 72-angle by 19-power grid through the real Physics_Engine for each playable Arena and
// reports which single Shots hole out, which leave the Course, and how long the longest Shot takes. This is the
// evidence task 14 turns into recorded witness sequences, and it is the check that says whether the authored
// terrain is playable at all before any of it is drawn.
//
// Run with `node verification/tools/check-course.ts`.

import {
  ANGLE_STEP_DEGREES,
  BALL_RADIUS,
  MAX_CARRY_DISTANCE,
  MAX_SHOT_DURATION_STEPS,
  POWER_MAX_PERCENT,
  POWER_MIN_PERCENT,
  POWER_STEP_PERCENT,
} from '../../shared/constants.ts';
import { PLAYABLE_ARENA_NUMBERS, getArena, type ArenaNumber } from '../../shared/arenas.ts';
import { signedDistanceToTerrain } from '../../shared/terrain.ts';
import { simulateShotToRest, speedOf } from '../../shared/physics.ts';
import { collisionFor, createReporter, launchFromSpawn } from './shot-helpers.ts';

const { report, finish } = createReporter();

console.log(`MAX_CARRY_DISTANCE ${MAX_CARRY_DISTANCE.toFixed(1)} world units\n`);

for (const arenaNumber of PLAYABLE_ARENA_NUMBERS as readonly ArenaNumber[]) {
  const arena = getArena(arenaNumber);
  const collision = collisionFor(arenaNumber);
  const teeToHole = arena.holeX - arena.teeX;

  console.log(
    `Arena ${String(arena.number)} "${arena.lesson}"  par ${String(arena.par)}  course ${String(arena.courseWidth)} wide  tee x ${String(arena.teeX)} y ${arena.spawn.y.toFixed(1)}  hole x ${String(arena.holeX)} y ${arena.hole.y.toFixed(1)}  tee-to-hole ${String(teeToHole)}`,
  );
  console.log(
    `  terrain height ${arena.terrain.lowestHeight.toFixed(1)} to ${arena.terrain.highestHeight.toFixed(1)}`,
  );

  const holed: string[] = [];
  const lost: string[] = [];
  let worstSteps = 0;
  let anomalies = 0;
  let nonTerminal = 0;
  const outcomes = new Map<string, number>();

  for (let angle = 0; angle < 360; angle += ANGLE_STEP_DEGREES) {
    for (let power = POWER_MIN_PERCENT; power <= POWER_MAX_PERCENT; power += POWER_STEP_PERCENT) {
      const result = simulateShotToRest(collision, launchFromSpawn(collision, angle, power));
      worstSteps = Math.max(worstSteps, result.stepsExecuted);
      anomalies += result.residualOverlapAnomalyCount + result.shotDurationAnomalyCount;
      if (result.ball.outcome === 'IN_MOTION') {
        nonTerminal += 1;
      }
      outcomes.set(result.ball.outcome, (outcomes.get(result.ball.outcome) ?? 0) + 1);

      const label = `${String(angle)}/${String(power)}`;
      if (result.ball.outcome === 'HOLED') {
        holed.push(`${label} peak ${result.peakHeight.toFixed(0)}`);
      }
      if (result.ball.outcome === 'OUT_OF_BOUNDS') {
        lost.push(label);
      }
    }
  }

  for (const [outcome, count] of [...outcomes].sort()) {
    console.log(`    ${outcome.padEnd(14)} ${String(count)}`);
  }
  console.log(`  worst ${String(worstSteps)} steps, ${String(anomalies)} anomalies`);
  console.log(
    `  single-Shot holes out (${String(holed.length)}): ${holed.length === 0 ? 'NONE' : holed.slice(0, 14).join(', ')}${holed.length > 14 ? ', ...' : ''}`,
  );
  console.log(
    `  single-Shot out of bounds (${String(lost.length)}): ${lost.length === 0 ? 'none' : lost.slice(0, 10).join(', ')}${lost.length > 10 ? ', ...' : ''}`,
  );

  report(
    holed.length > 0,
    `Arena ${String(arena.number)} is holed out by at least one single Shot from the tee`,
    `${String(holed.length)} of ${String((360 / ANGLE_STEP_DEGREES) * 19)} grid Shots`,
  );
  report(nonTerminal === 0, `Arena ${String(arena.number)} - every grid Shot reaches a terminal outcome`, `${String(nonTerminal)} still moving`);
  report(
    worstSteps < MAX_SHOT_DURATION_STEPS,
    `Arena ${String(arena.number)} - no grid Shot needs the duration valve`,
    `worst ${String(worstSteps)} against a bound of ${String(MAX_SHOT_DURATION_STEPS)}`,
  );
  report(anomalies === 0, `Arena ${String(arena.number)} - no anomaly anywhere on the grid`, String(anomalies));
  report(
    lost.length > 0,
    `Arena ${String(arena.number)} - OUT_OF_BOUNDS is reachable through play (A-2 R2.19)`,
    `${String(lost.length)} grid Shots leave the Course`,
  );

  // Every Shot must finish resting on the ground, never buried in it or hovering above it.
  let worstOverlap = Number.NEGATIVE_INFINITY;
  for (let angle = 0; angle < 360; angle += ANGLE_STEP_DEGREES) {
    const result = simulateShotToRest(collision, launchFromSpawn(collision, angle, 55));
    if (result.ball.outcome !== 'AT_REST') {
      continue;
    }
    worstOverlap = Math.max(
      worstOverlap,
      BALL_RADIUS - signedDistanceToTerrain(arena.terrain, result.ball.position),
    );
    report(
      speedOf(result.ball) === 0,
      `  Arena ${String(arena.number)} at ${String(angle)}/55 comes to a dead stop`,
      String(speedOf(result.ball)),
    );
  }
  report(
    worstOverlap <= 0.5 + 1e-9,
    `Arena ${String(arena.number)} - a resting Ball sits on the surface within MAX_PENETRATION_TOLERANCE`,
    `worst overlap ${worstOverlap.toFixed(6)}`,
  );

  console.log('');
}

finish();
