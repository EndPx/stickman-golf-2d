// Task 7 acceptance check.
//
// "Step count per wall-clock second holds at SIMULATION_HZ independently of the render rate, and a long
// stall discards rather than replays."
//
// Driven by a controlled time source rather than a real clock. That is deliberate: timing this against
// `performance.now` would make the check flaky for reasons unrelated to the code, and the property under
// test is arithmetic - the accumulator either drains at the right rate or it does not.
//
// Run with `node verification/tools/check-clock.ts`.

import {
  FIXED_STEP_SECONDS,
  MAX_CATCHUP_STEPS_PER_FRAME,
  SIMULATION_HZ,
} from '../../shared/constants.ts';
import {
  MAX_ABSORBED_STALL_SECONDS,
  MILLISECONDS_PER_SECOND,
  TICK_PERIOD_MILLISECONDS,
  createFixedStepClock,
  planCatchUp,
  type ClockEnvironment,
} from '../../client/src/clock.ts';
import { createReporter } from './shot-helpers.ts';

const { report, finish } = createReporter();

/** A time source the test advances by hand, plus a scheduler the test pumps by hand. */
function createControlledEnvironment(): {
  environment: ClockEnvironment;
  advanceMilliseconds: (amount: number) => void;
  pump: () => void;
  scheduledPeriod: () => number | null;
} {
  let nowMilliseconds = 0;
  let scheduled: { callback: () => void; periodMilliseconds: number } | null = null;

  return {
    environment: {
      now: () => nowMilliseconds,
      scheduleRepeating: (callback, periodMilliseconds) => {
        scheduled = { callback, periodMilliseconds };
        return () => {
          scheduled = null;
        };
      },
    },
    advanceMilliseconds: (amount) => {
      nowMilliseconds += amount;
    },
    pump: () => {
      scheduled?.callback();
    },
    scheduledPeriod: () => scheduled?.periodMilliseconds ?? null,
  };
}

console.log(
  `SIMULATION_HZ ${String(SIMULATION_HZ)}, FIXED_STEP_SECONDS ${FIXED_STEP_SECONDS.toFixed(9)}, tick period ${TICK_PERIOD_MILLISECONDS.toFixed(4)} ms, MAX_CATCHUP_STEPS_PER_FRAME ${String(MAX_CATCHUP_STEPS_PER_FRAME)}, longest absorbed stall ${(MAX_ABSORBED_STALL_SECONDS * MILLISECONDS_PER_SECOND).toFixed(2)} ms\n`,
);

// -- planCatchUp, the whole R3.3 policy -----------------------------------------------------------

for (const [accumulated, expectedSteps, expectedDiscarded] of [
  [0, 0, 0],
  [FIXED_STEP_SECONDS * 0.99, 0, 0],
  [FIXED_STEP_SECONDS, 1, 0],
  [FIXED_STEP_SECONDS * 2.5, 2, 0],
  [FIXED_STEP_SECONDS * MAX_CATCHUP_STEPS_PER_FRAME, MAX_CATCHUP_STEPS_PER_FRAME, 0],
  [FIXED_STEP_SECONDS * (MAX_CATCHUP_STEPS_PER_FRAME + 1), MAX_CATCHUP_STEPS_PER_FRAME, 1],
  [FIXED_STEP_SECONDS * 600, MAX_CATCHUP_STEPS_PER_FRAME, 600 - MAX_CATCHUP_STEPS_PER_FRAME],
] as readonly (readonly [number, number, number])[]) {
  const plan = planCatchUp(accumulated);
  report(
    plan.stepsToRun === expectedSteps && plan.discardedSteps === expectedDiscarded,
    `${(accumulated / FIXED_STEP_SECONDS).toFixed(2)} steps of accumulated time runs ${String(expectedSteps)} and discards ${String(expectedDiscarded)}`,
    `ran ${String(plan.stepsToRun)}, discarded ${String(plan.discardedSteps)}`,
  );
  report(
    plan.retainedSeconds >= 0 && plan.retainedSeconds < FIXED_STEP_SECONDS,
    `  the retained remainder stays below one Simulation_Step`,
    `${plan.retainedSeconds.toFixed(12)} against ${FIXED_STEP_SECONDS.toFixed(12)}`,
  );
}

report(
  planCatchUp(FIXED_STEP_SECONDS * 2.5).retainedSeconds > 0,
  'a fractional remainder is carried forward rather than dropped',
  planCatchUp(FIXED_STEP_SECONDS * 2.5).retainedSeconds.toFixed(12),
);

// -- R3.2: the step rate holds at SIMULATION_HZ, whatever the pass rate ---------------------------

console.log('');

const stepCountsByPassRate = new Map<number, number>();

for (const passesPerSecond of [SIMULATION_HZ, 30, 144, 15, 240]) {
  const controlled = createControlledEnvironment();
  let steps = 0;
  let discarded = 0;

  const clock = createFixedStepClock({
    environment: controlled.environment,
    onStep: () => {
      steps += 1;
    },
    onDiscard: (count) => {
      discarded += count;
    },
  });

  clock.start();

  // Exactly ten seconds of wall-clock time, delivered in `passesPerSecond` even passes per second.
  const seconds = 10;
  const passPeriod = MILLISECONDS_PER_SECOND / passesPerSecond;
  for (let pass = 0; pass < passesPerSecond * seconds; pass += 1) {
    controlled.advanceMilliseconds(passPeriod);
    controlled.pump();
  }

  const expected = SIMULATION_HZ * seconds;
  const stallPerPass = passPeriod / MILLISECONDS_PER_SECOND;
  const withinCatchUp = stallPerPass <= MAX_ABSORBED_STALL_SECONDS;
  const shortfall = expected - steps;

  console.log(
    `  ${String(passesPerSecond).padStart(3)} passes/s over ${String(seconds)}s -> ${String(steps)} steps (expected ${String(expected)}), ${String(discarded)} discarded, pass gap ${passPeriod.toFixed(2)} ms`,
  );

  if (withinCatchUp) {
    // R3.2 - within the catch-up bound no time is discarded, so the rate holds at SIMULATION_HZ.
    //
    // The step count may sit one below the ideal, and that is not drift. `FIXED_STEP_SECONDS` is 1/60,
    // which has no exact binary representation, so a pass whose elapsed time is nominally exactly one
    // step can land a fraction of an ULP short. The step then stays in the accumulator until the next
    // pass rather than being lost - which is why the tolerance is one step in total and not one step
    // per second. A rate that were genuinely wrong would miss dozens over ten seconds.
    stepCountsByPassRate.set(passesPerSecond, steps);
    report(
      discarded === 0,
      `at ${String(passesPerSecond)} passes per second nothing is discarded`,
      `${String(discarded)} discarded`,
    );
    report(
      shortfall >= 0 && shortfall <= 1,
      `at ${String(passesPerSecond)} passes per second the rate holds at SIMULATION_HZ`,
      `${String(steps)} of ${String(expected)} steps, shortfall ${String(shortfall)} (at most one sub-step remainder in flight)`,
    );
  } else {
    report(
      steps < expected && discarded > 0,
      `at ${String(passesPerSecond)} passes per second the gap exceeds the catch-up bound and time is discarded`,
      `${String(steps)} steps, ${String(discarded)} discarded`,
    );
  }
  clock.stop();
}

// This is the R3.2 claim itself: the step count is the same whatever rate the passes arrive at.
{
  const counts = [...stepCountsByPassRate.values()];
  const lowest = Math.min(...counts);
  const highest = Math.max(...counts);
  report(
    highest - lowest <= 1,
    'the step count is independent of the pass rate',
    `${[...stepCountsByPassRate].map(([rate, count]) => `${String(rate)}/s -> ${String(count)}`).join(', ')}`,
  );
}

// -- R3.18: a long stall discards rather than replays ---------------------------------------------

console.log('');

{
  const controlled = createControlledEnvironment();
  let steps = 0;
  const discardReports: number[] = [];

  const clock = createFixedStepClock({
    environment: controlled.environment,
    onStep: () => {
      steps += 1;
    },
    onDiscard: (count) => {
      discardReports.push(count);
    },
  });

  clock.start();

  // Ten healthy passes, then a thirty-second stall, as a backgrounded tab produces.
  const healthyPasses = 10;
  for (let pass = 0; pass < healthyPasses; pass += 1) {
    controlled.advanceMilliseconds(TICK_PERIOD_MILLISECONDS);
    controlled.pump();
  }
  const stepsBeforeStall = steps;

  const stallSeconds = 30;
  controlled.advanceMilliseconds(stallSeconds * MILLISECONDS_PER_SECOND);
  controlled.pump();

  const stepsFromStall = steps - stepsBeforeStall;
  const wouldHaveBeenReplayed = Math.floor(stallSeconds * SIMULATION_HZ);
  const totalElapsedSeconds =
    (healthyPasses * TICK_PERIOD_MILLISECONDS) / MILLISECONDS_PER_SECOND + stallSeconds;
  const wholeStepsOfElapsedTime = Math.floor(totalElapsedSeconds / FIXED_STEP_SECONDS);

  console.log(
    `  ${String(stepsBeforeStall)} steps before a ${String(stallSeconds)}s stall, ${String(stepsFromStall)} steps executed on the pass after it, ${String(discardReports[0] ?? 0)} discarded (a replay would have run ${String(wouldHaveBeenReplayed)})`,
  );

  report(
    stepsFromStall === MAX_CATCHUP_STEPS_PER_FRAME,
    'a long stall executes at most MAX_CATCHUP_STEPS_PER_FRAME steps',
    `${String(stepsFromStall)} steps`,
  );
  report(
    discardReports.length === 1,
    'R3.18 records exactly one anomaly for the stall',
    `${String(discardReports.length)} anomalies`,
  );
  report(
    clock.totalStepsDiscarded() === (discardReports[0] ?? 0),
    'the clock accumulates the discarded step count the anomaly named',
    `${String(clock.totalStepsDiscarded())} accumulated against ${String(discardReports[0] ?? 0)} reported`,
  );

  // The property that actually matters, and it is exact: every whole Simulation_Step of elapsed time is
  // either executed or explicitly discarded. Nothing vanishes quietly, and nothing is banked for a
  // later replay. Stated this way it also absorbs the sub-step remainder, which is why it can be an
  // equality rather than a tolerance.
  report(
    steps + clock.totalStepsDiscarded() === wholeStepsOfElapsedTime,
    'every whole Simulation_Step of elapsed time is either executed or discarded, never banked',
    `${String(steps)} executed + ${String(clock.totalStepsDiscarded())} discarded = ${String(steps + clock.totalStepsDiscarded())}, against ${String(wholeStepsOfElapsedTime)} whole steps of elapsed time`,
  );
  report(
    steps < wouldHaveBeenReplayed / 100,
    'the stall is not replayed as a burst of steps',
    `${String(steps)} steps executed in total against ${String(wouldHaveBeenReplayed)} a replay would have run`,
  );

  // The pass after the stall is back to normal: the discard did not leave a backlog behind.
  const stepsAfterRecovery = steps;
  controlled.advanceMilliseconds(TICK_PERIOD_MILLISECONDS);
  controlled.pump();
  report(
    steps - stepsAfterRecovery === 1,
    'the pass after a discard is back to one step, so nothing was carried forward',
    `${String(steps - stepsAfterRecovery)} steps`,
  );
  clock.stop();
}

// -- the scheduler is not the frame callback, and start/stop behave -------------------------------

console.log('');

{
  const controlled = createControlledEnvironment();
  let steps = 0;
  const clock = createFixedStepClock({
    environment: controlled.environment,
    onStep: () => {
      steps += 1;
    },
    onDiscard: () => undefined,
  });

  report(!clock.isRunning(), 'a new clock is not running', String(clock.isRunning()));

  clock.start();
  report(clock.isRunning(), 'start runs the clock', String(clock.isRunning()));
  report(
    controlled.scheduledPeriod() === TICK_PERIOD_MILLISECONDS,
    'the clock schedules on its own repeating period, not on a frame callback',
    `${String(controlled.scheduledPeriod())} ms`,
  );

  // Time that passed before `start` must not arrive as a catch-up burst on the first pass.
  clock.stop();
  const fresh = createControlledEnvironment();
  let freshSteps = 0;
  const freshClock = createFixedStepClock({
    environment: fresh.environment,
    onStep: () => {
      freshSteps += 1;
    },
    onDiscard: () => undefined,
  });
  fresh.advanceMilliseconds(5 * MILLISECONDS_PER_SECOND);
  freshClock.start();
  fresh.advanceMilliseconds(TICK_PERIOD_MILLISECONDS);
  fresh.pump();
  report(
    freshSteps === 1,
    'time that passed before start is not replayed on the first pass',
    `${String(freshSteps)} steps`,
  );

  freshClock.stop();
  fresh.advanceMilliseconds(TICK_PERIOD_MILLISECONDS * 10);
  fresh.pump();
  report(
    freshSteps === 1,
    'a stopped clock executes no further steps',
    `${String(freshSteps)} steps`,
  );

  report(steps === 0, 'no step ran on a clock that was started and stopped without a pass', String(steps));
}

// -- a time source that runs backwards cannot drain the accumulator --------------------------------

{
  const controlled = createControlledEnvironment();
  let steps = 0;
  const clock = createFixedStepClock({
    environment: controlled.environment,
    onStep: () => {
      steps += 1;
    },
    onDiscard: () => undefined,
  });
  clock.start();
  controlled.advanceMilliseconds(-MILLISECONDS_PER_SECOND);
  controlled.pump();
  controlled.advanceMilliseconds(TICK_PERIOD_MILLISECONDS * 2);
  controlled.pump();
  report(
    steps === 2,
    'a backwards time step is clamped rather than banked against future steps',
    `${String(steps)} steps`,
  );
  clock.stop();
}

finish();
