// Task 11 acceptance check, the half that does not need a browser.
//
// The Match state machine is pure, so a whole Arena can be played here: fire, step to the terminal outcome,
// read the Status_Token, the Stroke count and the hole-out latch. That covers the Status_Token edges, the
// Stroke accounting, the cap, the rejection reasons and the start-arena selector.
//
// The other half - that a keyboard drives all of it and every transition is readable from the overlay DOM -
// needs a real browser and is checked with Playwright.
//
// Run with `node verification/tools/check-match.ts`.

import {
  MAX_SHOT_DURATION_STEPS,
  MAX_STROKES_PER_ARENA,
  DEFAULT_AIM_DEGREES,
  DEFAULT_POWER_PERCENT,
} from '../../shared/constants.ts';
import { getArena } from '../../shared/arenas.ts';
import { shoot } from '../../shared/shot.ts';
import {
  anomalyCount,
  applyShotResult,
  createMatch,
  prepareShot,
  resolveStartArena,
  stepMatch,
  type MatchState,
} from '../../client/src/game.ts';
import { createReporter } from './shot-helpers.ts';

const { report, finish } = createReporter();

/** Fires a Shot the way the Input_Controller does: prepare the context, call `shoot`, apply the result. */
function fire(state: MatchState, aimDegrees: number, powerPercent: number): MatchState {
  const prepared = prepareShot(state);
  return applyShotResult(prepared.state, shoot(aimDegrees, powerPercent, prepared.context));
}

/** Steps until the Shot reaches a terminal outcome, bounded by the R5.11 valve. */
function settle(state: MatchState): { state: MatchState; steps: number } {
  let current = state;
  let steps = 0;
  while (current.status === 'BALL_MOVING' && steps <= MAX_SHOT_DURATION_STEPS + 1) {
    current = stepMatch(current).state;
    steps += 1;
  }
  return { state: current, steps };
}

// -- R1.25, R1.26: the start-arena selector -------------------------------------------------------

for (const [selector, expectedArena, expectRefusal] of [
  [null, 1, false],
  ['', 1, false],
  ['1', 1, false],
  ['2', 2, false],
  [' 2 ', 2, false],
  ['3', 1, true],
  ['5', 1, true],
  ['0', 1, true],
  ['-1', 1, true],
  ['banana', 1, true],
  ['2.5', 1, true],
  ['NaN', 1, true],
] as readonly (readonly [string | null, number, boolean])[]) {
  const resolved = resolveStartArena(selector);
  report(
    resolved.arenaNumber === expectedArena && (resolved.refusedValue !== null) === expectRefusal,
    `selector ${JSON.stringify(selector)} starts Arena ${String(expectedArena)}${expectRefusal ? ' and is refused' : ''}`,
    `arena ${String(resolved.arenaNumber)}, refused ${JSON.stringify(resolved.refusedValue)}`,
  );
}

console.log('');

{
  const started = createMatch('2');
  report(started.arenaNumber === 2, 'R1.25 - a selector of 2 begins the Match at Arena 2', String(started.arenaNumber));
  report(
    started.ball.position.x === getArena(2).spawn.x && started.ball.position.y === getArena(2).spawn.y,
    "R1.25 - the Ball starts at Arena 2's declared spawn point",
    `(${String(started.ball.position.x)}, ${String(started.ball.position.y)})`,
  );
  report(started.strokes === 0 && started.runningTotal === 0, 'R1.25 - Stroke counts and totals start at zero', `${String(started.strokes)}, ${String(started.runningTotal)}`);
  report(started.matchPhase === 'IN_PROGRESS', 'R1.25 - the phase starts at IN_PROGRESS', started.matchPhase);
  report(anomalyCount(started) === 0, 'a valid selector records no anomaly', String(anomalyCount(started)));
  report(
    getArena(2).par === 3 && getArena(2).walls.length === 1,
    'R1.25 - the selector alters no Arena geometry and no Par value',
    `par ${String(getArena(2).par)}, ${String(getArena(2).walls.length)} walls`,
  );
}

{
  const refused = createMatch('3');
  report(refused.arenaNumber === 1, 'R1.26 - a refused selector begins the Match at Arena 1', String(refused.arenaNumber));
  report(anomalyCount(refused) === 1, 'R1.26 - a refused selector records exactly one anomaly', String(anomalyCount(refused)));
  report(
    refused.anomalies[0]?.detail.includes('"3"') === true,
    'R1.26 - the anomaly names the refused value',
    refused.anomalies[0]?.detail ?? 'no anomaly',
  );
  report(
    refused.anomalies[0]?.requirement === 'R1.26',
    'the anomaly cites R1.26',
    refused.anomalies[0]?.requirement ?? 'none',
  );
}

// -- R5.15: the Status_Token before any Shot ------------------------------------------------------

console.log('');

{
  const fresh = createMatch(null);
  report(fresh.status === 'BALL_AT_REST', 'R5.15 - the token reads BALL_AT_REST before any Shot', fresh.status);
  report(fresh.holeOut === 'NOT_HOLED_OUT', 'the hole-out latch starts at NOT_HOLED_OUT', fresh.holeOut);
  report(fresh.lastRejection === 'NONE', 'the rejection field starts at NONE', fresh.lastRejection);
  report(fresh.result === null, 'the result is absent before the Match completes', String(fresh.result));
  report(
    fresh.shotAimDegrees === DEFAULT_AIM_DEGREES && fresh.shotPowerPercent === DEFAULT_POWER_PERCENT,
    'the recorded Shot parameters start at the declared defaults',
    `${String(fresh.shotAimDegrees)}, ${String(fresh.shotPowerPercent)}`,
  );
}

// -- Arena 1 holed out in one Shot ---------------------------------------------------------------

console.log('');

{
  let match = createMatch(null);
  match = fire(match, 0, 70);

  report(match.status === 'BALL_MOVING', 'R5.4 - the token reads BALL_MOVING the instant velocity is imparted', match.status);
  report(match.strokes === 1, 'R13.1 - exactly one Stroke per accepted Shot', String(match.strokes));
  report(match.lastRejection === 'NONE', 'R9.22 - the rejection field is NONE on acceptance', match.lastRejection);
  report(match.shotAimDegrees === 0 && match.shotPowerPercent === 70, 'the accepted parameters are recorded', `${String(match.shotAimDegrees)}, ${String(match.shotPowerPercent)}`);

  const settled = settle(match);
  match = settled.state;

  console.log(`  Arena 1 at aim 0 power 70 settled after ${String(settled.steps)} steps: ${match.status}, ${String(match.strokes)} strokes, ${match.holeOut}`);

  report(match.status === 'IN_HOLE', 'R5.9 - the token reads IN_HOLE on capture', match.status);
  report(match.holeOut === 'HOLED_OUT_BY_CAPTURE', 'R13.16 - the latch reads HOLED_OUT_BY_CAPTURE', match.holeOut);
  report(match.strokes === 1, 'R6.3 - no additional Stroke is counted for the capture', String(match.strokes));
  report(anomalyCount(match) === 0, 'a clean Shot records no anomaly', String(anomalyCount(match)));

  // R5.9 - IN_HOLE is held rather than collapsing, so a polling verifier can read it.
  const held = stepMatch(stepMatch(stepMatch(match).state).state).state;
  report(held.status === 'IN_HOLE', 'R5.9 - IN_HOLE is held across later steps', held.status);

  // R11.3 - a further Shot in the same Arena is refused because the Player is already Holed_Out.
  const afterHoleOut = fire(match, 0, 70);
  report(afterHoleOut.lastRejection === 'ALREADY_HOLED_OUT', 'a Shot after holing out is refused with ALREADY_HOLED_OUT', afterHoleOut.lastRejection);
  report(afterHoleOut.strokes === 1, 'a refused Shot counts no Stroke', String(afterHoleOut.strokes));
  report(afterHoleOut.status === 'IN_HOLE', 'a refused Shot leaves the token untouched', afterHoleOut.status);
}

// -- R5.13: a Shot while the Ball is moving is refused --------------------------------------------

console.log('');

{
  let match = createMatch(null);
  match = fire(match, 0, 70);
  match = stepMatch(match).state;

  const second = fire(match, 90, 50);
  report(second.lastRejection === 'BALL_NOT_AT_REST', 'R5.13 - a Shot while the token is BALL_MOVING is refused', second.lastRejection);
  report(second.strokes === 1, 'the refused Shot counts no Stroke', String(second.strokes));
  report(
    second.ball.velocity.x === match.ball.velocity.x && second.ball.velocity.y === match.ball.velocity.y,
    'R5.13 - the refused Shot leaves Ball velocity unchanged',
    `(${second.ball.velocity.x.toFixed(3)}, ${second.ball.velocity.y.toFixed(3)})`,
  );
}

// -- R8.8: a non-finite argument -----------------------------------------------------------------

{
  let match = createMatch(null);
  match = fire(match, Number.NaN, 50);
  report(match.lastRejection === 'INVALID_SHOT_ARGUMENT', 'R8.8 - a non-finite angle is refused with INVALID_SHOT_ARGUMENT', match.lastRejection);
  report(match.strokes === 0, 'the refused Shot counts no Stroke', String(match.strokes));
  report(match.status === 'BALL_AT_REST', 'the refused Shot leaves the token at BALL_AT_REST', match.status);
}

// -- R5.7: a Shot that comes to rest, and the next turn -------------------------------------------

console.log('');

{
  let match = createMatch(null);
  // Away from the Hole, so it stops rather than dropping in.
  match = fire(match, 180, 30);
  const settled = settle(match);
  match = settled.state;

  report(match.status === 'BALL_AT_REST', 'R5.7 - the token reads BALL_AT_REST when the rest debounce completes', match.status);
  report(match.holeOut === 'NOT_HOLED_OUT', 'a Shot that came to rest does not latch the hole-out field', match.holeOut);
  report(match.strokes === 1, 'the Stroke stands', String(match.strokes));

  // R5.13's converse - the next Shot is accepted straight away, with no acknowledgement needed.
  const next = fire(match, 0, 60);
  report(next.status === 'BALL_MOVING', 'the next Shot is accepted immediately after BALL_AT_REST', next.status);
  report(next.strokes === 2, 'the second Stroke is counted', String(next.strokes));
}

// -- R6.4, R6.5, R5.10: out of bounds across Arena 2's open edge ----------------------------------

console.log('');

{
  let match = createMatch('2');
  const spawn = { ...match.ball.position };

  // 340 degrees at full power banks off the bottom edge and leaves through the open right edge.
  match = fire(match, 340, 100);
  const settled = settle(match);
  match = settled.state;

  console.log(`  Arena 2 at aim 340 power 100 settled after ${String(settled.steps)} steps: ${match.status}`);

  report(match.status === 'OUT_OF_BOUNDS', 'R5.10 - the token reads OUT_OF_BOUNDS when the Ball leaves the Playfield', match.status);
  report(
    match.ball.position.x === spawn.x && match.ball.position.y === spawn.y,
    'R6.5 - the Ball resets to its pre-shot position',
    `(${String(match.ball.position.x)}, ${String(match.ball.position.y)})`,
  );
  report(match.strokes === 1, 'R13.2 - the Stroke already counted is retained', String(match.strokes));
  report(match.holeOut === 'NOT_HOLED_OUT', 'an out-of-bounds Shot does not latch the hole-out field', match.holeOut);

  // R5.10 - OUT_OF_BOUNDS is held, so a polling verifier can read it.
  const held = stepMatch(stepMatch(stepMatch(match).state).state).state;
  report(held.status === 'OUT_OF_BOUNDS', 'R5.10 - OUT_OF_BOUNDS is held across later steps', held.status);

  // The next Shot acknowledges the held token and fires in the same action, so no Agent_Step is wasted.
  const next = fire(match, 340, 80);
  report(next.status === 'BALL_MOVING', 'the next Shot both acknowledges the held token and fires', next.status);
  report(next.strokes === 2, 'the second Stroke is counted', String(next.strokes));

  const cleared = settle(next).state;
  report(cleared.status === 'IN_HOLE', 'Arena 2 holes out at aim 340 power 80 after the reset', cleared.status);
  report(cleared.holeOut === 'HOLED_OUT_BY_CAPTURE', 'and latches by capture', cleared.holeOut);
}

// -- R13.5, R6.10, R13.15, R13.16: the Stroke cap -------------------------------------------------

console.log('');

{
  let match = createMatch(null);
  // Aim straight up at low power: it can never reach the Hole, so the cap decides.
  for (let shotNumber = 1; shotNumber <= MAX_STROKES_PER_ARENA + 2; shotNumber += 1) {
    const before = match;
    match = settle(fire(match, 90, 10)).state;
    if (before.holeOut !== 'NOT_HOLED_OUT') {
      // Already capped: the Shot must have been refused and nothing may have changed.
      report(
        match.strokes === before.strokes && match.lastRejection === 'ALREADY_HOLED_OUT',
        `R6.10 - Shot ${String(shotNumber)} after the cap is refused and counts nothing`,
        `${String(match.strokes)} strokes, ${match.lastRejection}`,
      );
    }
  }

  report(
    match.strokes === MAX_STROKES_PER_ARENA,
    'R13.5 - the Stroke count records exactly MAX_STROKES_PER_ARENA',
    String(match.strokes),
  );
  report(
    match.holeOut === 'HOLED_OUT_BY_STROKE_CAP',
    'R13.16 - the latch reads HOLED_OUT_BY_STROKE_CAP',
    match.holeOut,
  );
  report(
    match.status !== 'IN_HOLE',
    'R13.15 - a cap-out never reaches IN_HOLE',
    match.status,
  );
  report(anomalyCount(match) === 0, 'capping out records no anomaly', String(anomalyCount(match)));
}

// -- R5.12: every accepted Shot terminates -------------------------------------------------------

console.log('');

{
  let worstSteps = 0;
  let nonTerminal = 0;
  let anomalies = 0;
  const outcomes = new Map<string, number>();

  for (const selector of ['1', '2']) {
    for (let angle = 0; angle < 360; angle += 5) {
      for (let power = 10; power <= 100; power += 5) {
        const settled = settle(fire(createMatch(selector), angle, power));
        worstSteps = Math.max(worstSteps, settled.steps);
        anomalies += anomalyCount(settled.state);
        if (settled.state.status === 'BALL_MOVING') {
          nonTerminal += 1;
        }
        outcomes.set(settled.state.status, (outcomes.get(settled.state.status) ?? 0) + 1);
      }
    }
  }

  console.log(`  full grid over Arenas 1 and 2: worst ${String(worstSteps)} steps, ${String(anomalies)} anomalies`);
  for (const [status, count] of [...outcomes].sort()) {
    console.log(`    ${status.padEnd(14)} ${String(count)}`);
  }

  report(nonTerminal === 0, 'R5.12 - every accepted Shot reaches a terminal Status_Token', `${String(nonTerminal)} still moving`);
  report(worstSteps < MAX_SHOT_DURATION_STEPS, 'no Shot on the grid needs the duration valve', `worst ${String(worstSteps)}`);
  report(anomalies === 0, 'no anomaly anywhere on the grid', String(anomalies));

  // R5.16 - only declared token values are ever reached.
  const reached = [...outcomes.keys()].sort();
  report(
    reached.every((status) => ['BALL_AT_REST', 'IN_HOLE', 'OUT_OF_BOUNDS'].includes(status)),
    'R5.16 - every terminal token reached is a declared value',
    reached.join(', '),
  );
}

finish();
