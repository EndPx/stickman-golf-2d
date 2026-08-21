// Game_Client entry point.
//
// Built up task by task. Task 8 wired the Renderer, task 9 adds the Input_Controller, task 10 replaces
// the two hand-made number inputs below with the full Debug_Overlay, and task 11 replaces the static
// preview state with the real Arena 1 loop driven by the clock, the Physics_Engine and the
// Shot_Controller.

import { DEFAULT_AIM_DEGREES, DEFAULT_POWER_PERCENT } from '../../shared/constants.ts';
import { getArena } from '../../shared/arenas.ts';
import { createArenaCollision, createBallAtRest } from '../../shared/physics.ts';
import type { ShotContext, ShotResult } from '../../shared/shot.ts';
import { createRenderer, type RenderState } from './renderer.ts';
import { createInputController } from './input.ts';

function requireElement(selector: string): HTMLElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`the Game_Client requires an element matching ${selector}`);
  }
  return element;
}

/**
 * TASK 9 SCAFFOLD. The two number inputs of R7.19 belong to the Debug_Overlay's frozen DOM contract
 * (R9.26), so task 10 takes this over. Until then they are built here so the Input_Controller has
 * something to bind to.
 *
 * R7.25 - no `autofocus`, and nothing here focuses either field.
 */
function createNumberInput(testId: string, labelText: string, container: HTMLElement): HTMLInputElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'field';

  const caption = document.createElement('span');
  caption.textContent = labelText;
  wrapper.appendChild(caption);

  const input = document.createElement('input');
  input.type = 'number';
  input.dataset['testid'] = testId;
  input.setAttribute('data-testid', testId);
  wrapper.appendChild(input);

  container.appendChild(wrapper);
  return input;
}

export function main(): void {
  const renderer = createRenderer(requireElement('#playfield-root'));
  const overlayRoot = requireElement('#overlay-root');

  const aimInput = createNumberInput('overlay-aim-input', 'aim', overlayRoot);
  const powerInput = createNumberInput('overlay-power-input', 'power', overlayRoot);

  // TASK 9 PREVIEW STATE. Replaced by the real Arena 1 loop in task 11.
  const arena = getArena(1);
  const collision = createArenaCollision(arena);
  let ball = createBallAtRest(arena.spawn);

  const input = createInputController({
    aimInput,
    powerInput,
    // Task 11 supplies the real precondition, derived from the Status_Token machine. Until then every
    // Shot is accepted so the funnel can be exercised.
    shotContext: (): ShotContext => ({ collision, ball, precondition: null }),
    onShotResult: (result: ShotResult): void => {
      if (result.accepted) {
        ball = result.ball;
      }
    },
  });

  // A read-only echo of the two values, so the aim and power readouts exist before task 10 builds the
  // full overlay. Task 10 replaces this with the declared `overlay-aim-angle` and `overlay-power` fields.
  const readout = document.createElement('div');
  readout.className = 'readout';
  overlayRoot.appendChild(readout);

  const aimReadout = document.createElement('span');
  aimReadout.setAttribute('data-testid', 'overlay-aim-angle');
  const powerReadout = document.createElement('span');
  powerReadout.setAttribute('data-testid', 'overlay-power');
  readout.append('aim ', aimReadout, ' power ', powerReadout);

  // R14.9 - the Renderer's frame rate is decoupled from SIMULATION_HZ, so drawing runs on the frame
  // callback while the simulation runs on its own time source (R3.17, task 7).
  function frame(): void {
    // R7.20 - reconciles a value written to either number input by any means, including a write that
    // fired no event at all.
    input.refresh();

    aimReadout.textContent = String(input.aimDegrees());
    powerReadout.textContent = String(input.powerPercent());

    const state: RenderState = {
      arena,
      ballPosition: ball.position,
      aimDegrees: input.aimDegrees(),
      powerPercent: input.powerPercent(),
      isActivePlayer: true,
    };
    renderer.render(state);
    window.requestAnimationFrame(frame);
  }
  window.requestAnimationFrame(frame);

  window.addEventListener('resize', () => {
    renderer.resize();
  });

  // Sanity: the defaults the Input_Controller starts from are the declared ones.
  if (input.aimDegrees() !== DEFAULT_AIM_DEGREES || input.powerPercent() !== DEFAULT_POWER_PERCENT) {
    throw new Error('the Input_Controller did not start at the declared aim and power defaults');
  }
}

main();
