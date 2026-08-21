// Game_Client entry point.
//
// Built up task by task. Task 8 wired the Renderer, task 9 the Input_Controller, task 10 the
// Debug_Overlay. Task 11 replaces the static state below with the real Arena 1 loop driven by the clock,
// the Physics_Engine and the Shot_Controller, and adds the start-arena selector.

import { getArena } from '../../shared/arenas.ts';
import { createArenaCollision, createBallAtRest } from '../../shared/physics.ts';
import type { ShotContext, ShotResult } from '../../shared/shot.ts';
import { createRenderer, type RenderState } from './renderer.ts';
import { createInputController } from './input.ts';
import { createOverlay, type LastRejection, type OverlayState } from './overlay.ts';

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

  // TASK 10 PREVIEW STATE. Replaced by the real Arena 1 loop in task 11, which brings the Status_Token
  // machine, stroke accounting, the anomaly counter and the start-arena selector with it.
  const arena = getArena(1);
  const collision = createArenaCollision(arena);
  let ball = createBallAtRest(arena.spawn);
  let lastRejection: LastRejection = 'NONE';

  const input = createInputController({
    aimInput: overlay.aimInput,
    powerInput: overlay.powerInput,
    // Task 11 supplies the real precondition, derived from the Status_Token machine.
    shotContext: (): ShotContext => ({ collision, ball, precondition: null }),
    onShotResult: (result: ShotResult): void => {
      if (result.accepted) {
        ball = result.ball;
        // R9.22 - the rejection field returns to NONE when a Shot is accepted.
        lastRejection = 'NONE';
      } else {
        lastRejection = result.reason;
      }
    },
  });

  // R14.9 - the Renderer's frame rate is decoupled from SIMULATION_HZ, so drawing runs on the frame
  // callback while the simulation runs on its own time source (R3.17, task 7).
  function frame(): void {
    // R7.20 - reconciles a value written to either number input by any means, including a write that
    // fired no event at all.
    input.refresh();

    const overlayState: OverlayState = {
      arenaNumber: arena.number,
      p1Strokes: 0,
      p1Total: 0,
      p1StrokesByArena: new Map(),
      aimDegrees: input.aimDegrees(),
      powerPercent: input.powerPercent(),
      status: 'BALL_AT_REST',
      matchPhase: 'IN_PROGRESS',
      p1HoleOut: 'NOT_HOLED_OUT',
      lastRejection,
      anomalyCount: 0,
      result: null,
    };
    overlay.render(overlayState);

    const renderState: RenderState = {
      arena,
      ballPosition: ball.position,
      aimDegrees: input.aimDegrees(),
      powerPercent: input.powerPercent(),
      isActivePlayer: true,
    };
    renderer.render(renderState);

    window.requestAnimationFrame(frame);
  }
  window.requestAnimationFrame(frame);

  window.addEventListener('resize', () => {
    renderer.resize();
  });
}

main();
