// Fixed-step Simulation_Step clock - R3.2, R3.3, R3.17, R3.18.
//
// R3.17 is the point of this module: Simulation_Steps are driven from a time source that is **not** the
// rendered-frame callback, so the count of steps executed per second of wall-clock time is independent
// of the display refresh rate and of how many frames the Renderer happens to draw. R14.9 states the
// same rule from the Renderer's side - neither the frame rate nor a canvas resize may change it.
//
// Both the time source and the scheduler are injected rather than reached for. `performance.now` and
// `setInterval` are supplied by the client entry point; a verification tool supplies a controlled pair
// instead. That is what makes R3.2's "exactly SIMULATION_HZ steps per second" and R3.18's stall discard
// checkable as arithmetic rather than as a wall-clock race, and it keeps this module free of every
// browser global.

import {
  FIXED_STEP_SECONDS,
  MAX_CATCHUP_STEPS_PER_FRAME,
  SIMULATION_HZ,
} from '../../shared/constants.ts';

/** Unit conversion, not a simulation-timing value, so R4.18 does not reserve it. */
export const MILLISECONDS_PER_SECOND = 1000;

/** The scheduler period, in milliseconds: one tick per Simulation_Step of nominal time. */
export const TICK_PERIOD_MILLISECONDS = FIXED_STEP_SECONDS * MILLISECONDS_PER_SECOND;

/** What one catch-up pass should do with the time accumulated since the previous pass. */
export interface CatchUpPlan {
  /** Whole Simulation_Steps to execute now, never more than `MAX_CATCHUP_STEPS_PER_FRAME`. */
  readonly stepsToRun: number;
  /** Whole Simulation_Steps thrown away rather than carried forward. Zero on a healthy pass. */
  readonly discardedSteps: number;
  /** Time carried into the next pass. Always strictly below `FIXED_STEP_SECONDS`. */
  readonly retainedSeconds: number;
}

/**
 * R3.3 - the whole catch-up policy, as a pure function of accumulated time.
 *
 * Execute as many whole Simulation_Steps as the accumulated time permits, up to
 * `MAX_CATCHUP_STEPS_PER_FRAME`; retain only the sub-step remainder for the next pass; and **discard**
 * the excess rather than carrying it forward.
 *
 * Discarding is what makes R3.2's guarantee conditional, and R3.18 says so plainly: a suspended or
 * throttled tab loses simulated time rather than silently replaying it later as a burst of hundreds of
 * steps, which would teleport a Ball past a wall. The loss is recorded as an anomaly, and R15.25
 * obliges the Verification_Harness to keep its browsing context visible so no Verification_Flow depends
 * on this path.
 */
export function planCatchUp(accumulatedSeconds: number): CatchUpPlan {
  if (accumulatedSeconds < FIXED_STEP_SECONDS) {
    return { stepsToRun: 0, discardedSteps: 0, retainedSeconds: Math.max(accumulatedSeconds, 0) };
  }

  const wholeSteps = Math.floor(accumulatedSeconds / FIXED_STEP_SECONDS);
  const stepsToRun = Math.min(wholeSteps, MAX_CATCHUP_STEPS_PER_FRAME);

  return {
    stepsToRun,
    discardedSteps: wholeSteps - stepsToRun,
    retainedSeconds: accumulatedSeconds - wholeSteps * FIXED_STEP_SECONDS,
  };
}

/** The platform facilities the clock needs, injected so nothing here reaches for a global. */
export interface ClockEnvironment {
  /** Monotonic elapsed time in milliseconds. Must not be the rendered-frame callback's timestamp. */
  readonly now: () => number;
  /** Schedules a repeating callback and returns the function that cancels it. */
  readonly scheduleRepeating: (callback: () => void, periodMilliseconds: number) => () => void;
}

export interface FixedStepClockOptions {
  readonly environment: ClockEnvironment;
  /** Advances the simulation by exactly one Simulation_Step. */
  readonly onStep: () => void;
  /** R3.18 - called once per pass that discarded time, with the discarded Simulation_Step count. */
  readonly onDiscard: (discardedSteps: number) => void;
}

export interface FixedStepClock {
  readonly start: () => void;
  readonly stop: () => void;
  readonly isRunning: () => boolean;
  /** Total Simulation_Steps executed since the clock was created. */
  readonly totalStepsExecuted: () => number;
  /** Total Simulation_Steps discarded since the clock was created. */
  readonly totalStepsDiscarded: () => number;
  /**
   * Runs one catch-up pass immediately, exactly as the scheduler would.
   *
   * The scheduler calls this; a verification tool calls it directly with a controlled time source, which
   * is how the step-rate and stall-discard behaviour is checked without racing a real clock.
   */
  readonly tick: () => void;
}

/**
 * Builds the Simulation_Step clock.
 *
 * The accumulator is seeded on `start` rather than at construction, so time that passed between
 * building the client and starting it does not arrive as a catch-up burst on the first pass.
 */
export function createFixedStepClock(options: FixedStepClockOptions): FixedStepClock {
  const { environment, onStep, onDiscard } = options;

  let cancel: (() => void) | null = null;
  let lastTickMilliseconds = 0;
  let accumulatedSeconds = 0;
  let totalStepsExecuted = 0;
  let totalStepsDiscarded = 0;

  function tick(): void {
    const now = environment.now();
    const elapsedSeconds = (now - lastTickMilliseconds) / MILLISECONDS_PER_SECOND;
    lastTickMilliseconds = now;

    // A time source that ran backwards would otherwise drain the accumulator; clamp at zero rather
    // than trust it. `performance.now` is monotonic, so this guards a supplied source, not the browser.
    accumulatedSeconds += Math.max(elapsedSeconds, 0);

    const plan = planCatchUp(accumulatedSeconds);
    accumulatedSeconds = plan.retainedSeconds;

    for (let index = 0; index < plan.stepsToRun; index += 1) {
      onStep();
    }
    totalStepsExecuted += plan.stepsToRun;

    // R3.18 - the discard leaves every Ball position and every Stroke count untouched. It only stops
    // steps from being executed, and it is recorded as an anomaly naming the discarded step count.
    if (plan.discardedSteps > 0) {
      totalStepsDiscarded += plan.discardedSteps;
      onDiscard(plan.discardedSteps);
    }
  }

  return {
    start(): void {
      if (cancel !== null) {
        return;
      }
      lastTickMilliseconds = environment.now();
      accumulatedSeconds = 0;
      cancel = environment.scheduleRepeating(tick, TICK_PERIOD_MILLISECONDS);
    },
    stop(): void {
      if (cancel === null) {
        return;
      }
      cancel();
      cancel = null;
    },
    isRunning(): boolean {
      return cancel !== null;
    },
    totalStepsExecuted(): number {
      return totalStepsExecuted;
    },
    totalStepsDiscarded(): number {
      return totalStepsDiscarded;
    },
    tick,
  };
}

/**
 * The longest stall the clock absorbs without discarding, in seconds.
 *
 * Stated as a derived value so a reader does not have to multiply: any gap longer than this loses
 * simulated time. At `SIMULATION_HZ` of 60 and `MAX_CATCHUP_STEPS_PER_FRAME` of 5 it is about 83
 * milliseconds, which a foreground tab clears comfortably and a backgrounded one does not.
 */
export const MAX_ABSORBED_STALL_SECONDS = MAX_CATCHUP_STEPS_PER_FRAME * FIXED_STEP_SECONDS;

/** Nominal Simulation_Steps per second, restated here so a consumer need not divide by the step. */
export const NOMINAL_STEPS_PER_SECOND = SIMULATION_HZ;
