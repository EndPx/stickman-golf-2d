// Game_Client entry point.
//
// Built up task by task. Task 8 wires the Renderer and draws Arena 1 from a static state; task 9 adds
// the Input_Controller, task 10 the Debug_Overlay, and task 11 replaces the static state below with the
// real Arena 1 loop driven by the clock, the Physics_Engine and the Shot_Controller.

import { DEFAULT_AIM_DEGREES, DEFAULT_POWER_PERCENT } from '../../shared/constants.ts';
import { getArena } from '../../shared/arenas.ts';
import { createRenderer, type RenderState } from './renderer.ts';

function requireElement(selector: string): HTMLElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`the Game_Client requires an element matching ${selector}`);
  }
  return element;
}

export function main(): void {
  const renderer = createRenderer(requireElement('#playfield-root'));

  // TASK 8 PREVIEW STATE. Replaced by the real Arena 1 loop in task 11.
  const arena = getArena(1);
  let state: RenderState = {
    arena,
    ballPosition: arena.spawn,
    aimDegrees: DEFAULT_AIM_DEGREES,
    powerPercent: DEFAULT_POWER_PERCENT,
    isActivePlayer: true,
  };

  // R14.9 - the Renderer's frame rate is decoupled from SIMULATION_HZ, so drawing runs on the frame
  // callback while the simulation runs on its own time source (R3.17, task 7).
  function frame(): void {
    renderer.render(state);
    window.requestAnimationFrame(frame);
  }
  window.requestAnimationFrame(frame);

  window.addEventListener('resize', () => {
    renderer.resize();
  });

  // A preview hook so task 8's acceptance condition - the indicators tracking their values - can be
  // driven from outside without an Input_Controller. Removed when task 9 lands.
  Object.assign(window, {
    __preview(aimDegrees: number, powerPercent: number, arenaNumber?: 1 | 2 | 3 | 4 | 5): void {
      const previewArena = arenaNumber === undefined ? state.arena : getArena(arenaNumber);
      state = {
        ...state,
        arena: previewArena,
        ballPosition: previewArena === state.arena ? state.ballPosition : previewArena.spawn,
        aimDegrees,
        powerPercent,
      };
    },
  });
}

main();
