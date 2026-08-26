// Game_Client entry point.
//
// This is where the six pieces meet: the fixed-step clock, the Physics_Engine, the Shot_Controller, the
// Input_Controller, the Renderer and the Debug_Overlay. Everything above it is pure or DOM-only; this
// module owns the wiring, the browser interfaces and the single piece of mutable state.
//
// R3.17 is visible in the shape of it. There are two loops, not one: Simulation_Steps run on the clock's own
// repeating timer and drawing runs on the frame callback, so neither can change the other's rate.

import { isInMotion } from '../../shared/physics.ts';
import { createFixedStepClock } from './clock.ts';
import { createRenderer } from './renderer.ts';
import { createInputController } from './input.ts';
import { createOverlay } from './overlay.ts';
import { createMenu } from './menu.ts';
import {
  anomalyCount,
  applyShotResult,
  createMatch,
  prepareShot,
  stepMatch,
  strokesByArenaForDisplay,
  withDiscardAnomaly,
  type MatchState,
} from './game.ts';

/** R1.25 - the start-arena selector, read from the query string at load time. */
const START_ARENA_PARAMETER = 'arena';

function requireElement(selector: string): HTMLElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`the Game_Client requires an element matching ${selector}`);
  }
  return element;
}

export function main(): void {
  const renderer = createRenderer(requireElement('#playfield-root'));
  const overlay = createOverlay(requireElement('#overlay-root'));

  // R1.25, R1.26 - resolved before anything renders, so the first frame already shows the chosen Arena and
  // the anomaly count a refused value produced.
  const selector = new URLSearchParams(window.location.search).get(START_ARENA_PARAMETER);
  let match: MatchState = createMatch(selector);

  /**
   * Pushes the current Match state into the Debug_Overlay.
   *
   * Called from the frame loop, and called again **synchronously** the instant a Shot result is applied.
   * R9.14 allows a one-rendered-frame lag, and that lag is a trap for an external verifier: for the ~17
   * milliseconds between the space press and the next frame the DOM would still read `BALL_AT_REST`, so a
   * flow that fires and then immediately polls the Status_Token would exit its poll on the stale value and
   * spend an Agent_Step discovering the mistake. Rendering on the transition closes the window entirely.
   */
  function renderOverlay(): void {
    overlay.render({
      arenaNumber: match.arenaNumber,
      p1Strokes: match.strokes,
      p1Total: match.runningTotal,
      p1StrokesByArena: strokesByArenaForDisplay(match),
      aimDegrees: input.aimDegrees(),
      powerPercent: input.powerPercent(),
      status: match.status,
      matchPhase: match.matchPhase,
      p1HoleOut: match.holeOut,
      lastRejection: match.lastRejection,
      anomalyCount: anomalyCount(match),
      result: match.result,
    });
  }

  const input = createInputController({
    aimInput: overlay.aimInput,
    powerInput: overlay.powerInput,
    shotContext: () => {
      // Acknowledging a held IN_HOLE or OUT_OF_BOUNDS token is a state transition, so the state it returns
      // has to be kept rather than discarded.
      const prepared = prepareShot(match);
      match = prepared.state;
      return prepared.context;
    },
    onShotResult: (result) => {
      match = applyShotResult(match, result);
      // R5.18 - the token reads BALL_MOVING before the next rendered frame. Written to the DOM here rather
      // than on that frame, so no reader can observe the pre-Shot value after the Shot was accepted.
      renderOverlay();
    },
    // R7.26 - the read-only aim and power fields follow their number inputs immediately rather than on the
    // next frame, so the two never disagree even for a reader that writes and reads back in one breath.
    onValueChange: () => {
      renderOverlay();
    },
  });

  // R3.2, R3.17 - Simulation_Steps on a time source that is not the frame callback.
  const clock = createFixedStepClock({
    environment: {
      now: () => performance.now(),
      scheduleRepeating: (callback, periodMilliseconds) => {
        const handle = window.setInterval(callback, periodMilliseconds);
        return () => {
          window.clearInterval(handle);
        };
      },
    },
    onStep: () => {
      // A Ball that is not in motion cannot change. The engine returns it untouched either way; this only
      // avoids the call.
      if (!isInMotion(match.ball)) {
        return;
      }
      const stepped = stepMatch(match);
      match = stepped.state;
      if (stepped.shotCompleted) {
        // R7.9, R7.10 - the Match reports the step a Shot completed on; the Input_Controller owns the
        // values, so it performs the reset.
        input.resetToDefaults();
        // And the terminal Status_Token reaches the DOM on the step it is set rather than on the next frame,
        // for the same reason the launch transition does.
        renderOverlay();
      }
    },
    // R3.18 - a suspended or throttled tab loses simulated time rather than replaying it, and the loss is
    // recorded as an anomaly naming the discarded Simulation_Step count.
    onDiscard: (discardedSteps) => {
      match = withDiscardAnomaly(match, discardedSteps);
    },
  });
  clock.start();

  // R14.9 - drawing is decoupled from SIMULATION_HZ and draws the most recently completed Simulation_Step
  // with no interpolation and no extrapolation.
  function frame(): void {
    // R7.20 - reconciles a value written to either number input by any means, including a write that fired
    // no event at all. Done before anything reads the values.
    input.refresh();
    renderOverlay();

    renderer.render({
      arena: match.collision.arena,
      ballPosition: match.ball.position,
      aimDegrees: input.aimDegrees(),
      powerPercent: input.powerPercent(),
      // R14.5, R14.11 - the sole Player is always the Active_Player (R1.4).
      isActivePlayer: true,
      // R14.14 - the stickman stands at the Ball only while it rests, and vanishes the instant a Shot
      // is fired.
      showStickman: match.status === 'BALL_AT_REST',
      // R14.15 - the Strokes chip mirrors what overlay-p1-arena-N-strokes shows.
      strokesThisArena: match.strokes,
    });

    window.requestAnimationFrame(frame);
  }
  window.requestAnimationFrame(frame);

  window.addEventListener('resize', () => {
    renderer.resize();
  });
}

// Two entry paths. A URL with the R1.25 start-arena selector boots straight into the Match - that is
// the path every Verification_Flow takes, and the menu never sits in front of it. A bare URL shows
// the main menu, whose Solo Play simply navigates to /?arena=1 and lands in the first path.
if (new URLSearchParams(window.location.search).has('arena')) {
  main();
} else {
  const menuMount = document.getElementById('menu-root');
  if (menuMount === null) {
    // No menu root means no menu to show; boot into Arena 1 rather than leave a blank page.
    window.location.replace('/?arena=1');
  } else {
    createMenu(menuMount);
  }
}
