// Input_Controller - Requirement 7.
//
// Two input paths, one funnel. Relative arrow stepping (R7.1 through R7.4) is what a human uses;
// absolute writes into two DOM number inputs (R7.19 through R7.26) are what an external agent uses.
// Both end at `shoot(angle, power)`, exactly as R8.2 requires, so the absolute path is not a second way
// to move a Ball.
//
// The absolute path exists because assumption A-1 was tested against Kane CLI 0.8.4 and rejected: one
// agent step carries one keypress, so reaching an arbitrary aim by arrow stepping costs up to 36 steps
// against a 15-step budget. Writing the field costs one step whatever the value, which is what makes the
// Verification_Flows fit without coarsening the control grids and damaging the difficulty curve.
//
// Two decisions here are load-bearing and easy to get wrong:
//
// 1. **Capture-phase interception** (R7.23). A native number input drives its own spinner from ArrowUp
//    and ArrowDown, swallows the space key and submits an enclosing form on Enter. Asking the inputs not
//    to take focus does not fix that, because a browser driver filling a field *will* focus it and the
//    game cannot control how an external agent chooses to write a value. A document-level listener in
//    the capture phase runs before the input element's own default behaviour, which makes focus
//    irrelevant rather than merely discouraged.
//
// 2. **Grid snapping lives here, not in `shoot`** (R7.20, R7.21). R8.5 forbids `shoot` from rounding
//    onto either grid, so the absolute path snaps before calling it. That keeps the reachable grids of
//    R7.15 and R7.16 meaningful - the absolute path cannot reach a value the relative path cannot.

import {
  ANGLE_STEP_DEGREES,
  DEFAULT_AIM_DEGREES,
  DEFAULT_POWER_PERCENT,
  POWER_MAX_PERCENT,
  POWER_MIN_PERCENT,
  POWER_STEP_PERCENT,
} from '../../shared/constants.ts';
import { shoot, wrapAngleDegrees, type ShotContext, type ShotResult } from '../../shared/shot.ts';

/** R7.15 - the 19 reachable power values: 10, 15, 20 and so on up to 100. Derived, never listed. */
export const POWER_GRID: readonly number[] = Array.from(
  { length: (POWER_MAX_PERCENT - POWER_MIN_PERCENT) / POWER_STEP_PERCENT + 1 },
  (_unused, index) => POWER_MIN_PERCENT + index * POWER_STEP_PERCENT,
);

/** R7.16 - the reachable aim angles: whole multiples of `ANGLE_STEP_DEGREES` in 0 up to 360. */
export const AIM_GRID: readonly number[] = Array.from(
  { length: 360 / ANGLE_STEP_DEGREES },
  (_unused, index) => index * ANGLE_STEP_DEGREES,
);

/**
 * R7.20 - the nearest whole multiple of `ANGLE_STEP_DEGREES`, wrapped into 0 up to but excluding 360.
 *
 * Wrapping after rounding matters: 358 rounds to 360, which is off the grid, and wrapping brings it to 0.
 */
export function snapAimDegrees(value: number): number {
  return wrapAngleDegrees(Math.round(value / ANGLE_STEP_DEGREES) * ANGLE_STEP_DEGREES);
}

/** R7.21 - the nearest member of the power grid, clamped into range. */
export function snapPowerPercent(value: number): number {
  const clamped = Math.min(Math.max(value, POWER_MIN_PERCENT), POWER_MAX_PERCENT);
  const steps = Math.round((clamped - POWER_MIN_PERCENT) / POWER_STEP_PERCENT);
  const snapped = POWER_MIN_PERCENT + steps * POWER_STEP_PERCENT;
  return Math.min(Math.max(snapped, POWER_MIN_PERCENT), POWER_MAX_PERCENT);
}

/**
 * R7.23 - every key intercepted at the document level in the capture phase, with its default behaviour
 * suppressed whatever holds focus.
 *
 * `Enter` is in the set for the same reason as the rest: an agent that presses Enter after filling a
 * field would otherwise submit an enclosing form and reload the page.
 */
const INTERCEPTED_KEYS: ReadonlySet<string> = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  ' ',
  'Enter',
]);

/** Some drivers report the space key only through `code`. Both spellings are treated as space. */
function isSpaceKey(event: KeyboardEvent): boolean {
  return event.key === ' ' || event.code === 'Space';
}

export interface InputControllerOptions {
  /** The `overlay-aim-input` element. Created by the Debug_Overlay, which owns the DOM contract. */
  readonly aimInput: HTMLInputElement;
  /** The `overlay-power-input` element. */
  readonly powerInput: HTMLInputElement;
  /**
   * Supplies the ShotContext at the instant the space key is pressed.
   *
   * R7.5 fires irrespective of the Status_Token, so every Shot precondition is evaluated by the
   * Shot_Controller rather than second-guessed here. This callback is where the caller reports which
   * precondition, if any, is currently failing.
   */
  readonly shotContext: () => ShotContext;
  /** Receives the outcome of every `shoot` invocation, accepted or rejected. */
  readonly onShotResult: (result: ShotResult) => void;
  /**
   * Called the instant the held aim angle or power value changes, by any path.
   *
   * R7.26 requires the read-only Debug_Overlay field and the number input never to disagree. Without this
   * the read-only field would only catch up on the next rendered frame, so for about 17 milliseconds after
   * a keypress or a field write the two would show different numbers - and an agent that writes the aim and
   * immediately reads `overlay-aim-angle` back would see the old value.
   */
  readonly onValueChange: () => void;
}

export interface InputController {
  /** The current aim angle in degrees, always on the R7.16 grid and always in 0 up to 360. */
  readonly aimDegrees: () => number;
  /** The current power value in percent, always on the R7.15 grid. */
  readonly powerPercent: () => number;
  /** R7.9, R7.10 - back to `DEFAULT_AIM_DEGREES` and `DEFAULT_POWER_PERCENT`. */
  readonly resetToDefaults: () => void;
  /**
   * Reconciles the two number inputs with the held values. Called once per rendered frame.
   *
   * This is what makes R7.20's "written by any means" true. An `input` event covers a driver that types
   * or fills, but a driver that assigns `element.value` directly fires nothing at all, and no listener
   * can see that. Comparing each field's text against the text last seen catches it either way.
   */
  readonly refresh: () => void;
  readonly dispose: () => void;
}

export function createInputController(options: InputControllerOptions): InputController {
  const { aimInput, powerInput, shotContext, onShotResult, onValueChange } = options;

  let aimDegrees = snapAimDegrees(DEFAULT_AIM_DEGREES);
  let powerPercent = snapPowerPercent(DEFAULT_POWER_PERCENT);

  /**
   * The only writers of the two held values. Everything routes through these so that R7.26's notification
   * cannot be forgotten at a new call site, and so a write that changes nothing raises no notification.
   */
  function setAimDegrees(next: number): void {
    if (next === aimDegrees) {
      return;
    }
    aimDegrees = next;
    onValueChange();
  }

  function setPowerPercent(next: number): void {
    if (next === powerPercent) {
      return;
    }
    powerPercent = next;
    onValueChange();
  }

  // The text each field held the last time it was looked at. A field whose text has changed since then
  // was written by something, and that is true whether or not an event was fired.
  let aimLastSeenText = '';
  let powerLastSeenText = '';

  function renderAim(): string {
    return String(aimDegrees);
  }

  function renderPower(): string {
    return String(powerPercent);
  }

  /** Whether a field is being edited right now, which is exactly whether it holds focus. */
  function isEditing(field: HTMLInputElement): boolean {
    return document.activeElement === field;
  }

  /**
   * R7.26 - keep each number input showing the held value, so the input and the read-only overlay field
   * never disagree.
   *
   * A field that holds focus is skipped, and that is the one deliberate deviation in this module. Snapping
   * and rewriting on every keystroke makes a field impossible to type into: entering 135 would go "1"
   * snapped to 0, then "03" snapped to 5, then "55", so the field would fight the user and land on 55.
   *
   * What is guaranteed instead: the read-only `overlay-aim-angle` and `overlay-power` fields always show
   * the held value, and each number input shows it too whenever that input is not being edited. A field's
   * text is reconciled the moment it loses focus, on Enter, and on `change`. An agent that writes a field
   * and then reads the read-only field back - which is what the Verification_Flows do - never sees a
   * disagreement.
   */
  function writeFieldText(): void {
    if (!isEditing(aimInput) && aimInput.value !== renderAim()) {
      aimInput.value = renderAim();
    }
    if (!isEditing(powerInput) && powerInput.value !== renderPower()) {
      powerInput.value = renderPower();
    }
    aimLastSeenText = aimInput.value;
    powerLastSeenText = powerInput.value;
  }

  /**
   * R7.22 - an empty, non-numeric or non-finite write leaves the held value alone.
   *
   * `Number('')` is 0, not NaN, so the empty case has to be tested before parsing rather than trusted to
   * fall out of it.
   */
  function parseFieldValue(text: string): number | null {
    const trimmed = text.trim();
    if (trimmed === '') {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  /**
   * R7.20, R7.22 - adopt a written value, or restore the field on an unparseable one.
   *
   * The restore happens immediately and irrespective of focus, which is a deliberate exception to the
   * skip-focused-fields rule above. R7.22 requires the field's displayed text to be put back, and the
   * off-grid reason for deferring does not apply here: an unparseable field is not a value on its way to
   * becoming a valid one, it is a value the Input_Controller has refused.
   *
   * Note that a native number input reports `value` as the empty string when its text is not a valid
   * number, so the empty case and the non-numeric case arrive here indistinguishably. Both are refusals
   * and both restore, so nothing turns on telling them apart.
   */
  function adoptAimText(text: string): void {
    const parsed = parseFieldValue(text);
    if (parsed === null) {
      aimInput.value = renderAim();
      aimLastSeenText = aimInput.value;
      return;
    }
    setAimDegrees(snapAimDegrees(parsed));
  }

  function adoptPowerText(text: string): void {
    const parsed = parseFieldValue(text);
    if (parsed === null) {
      powerInput.value = renderPower();
      powerLastSeenText = powerInput.value;
      return;
    }
    setPowerPercent(snapPowerPercent(parsed));
  }

  /**
   * Commits a field: adopt what it holds and show the snapped result, whether or not it still has focus.
   *
   * This is the only path that rewrites a focused field, and R7.24 is why - Enter has to show the user
   * what the field actually committed to. R7.22's restore falls out of the same line: an unparseable
   * write leaves the held value alone, so rewriting the text puts the held value back.
   */
  function commitAim(): void {
    adoptAimText(aimInput.value);
    aimInput.value = renderAim();
    aimLastSeenText = aimInput.value;
  }

  function commitPower(): void {
    adoptPowerText(powerInput.value);
    powerInput.value = renderPower();
    powerLastSeenText = powerInput.value;
  }

  // -- relative path -----------------------------------------------------------------------------

  /**
   * R7.1, R7.2 - ArrowLeft increases the aim angle and ArrowRight decreases it.
   *
   * That is not inverted. R7.6 measures the aim angle counter-clockwise from the positive horizontal
   * axis, so counter-clockwise is left on screen and increasing in degrees.
   */
  function stepAim(deltaDegrees: number): void {
    setAimDegrees(snapAimDegrees(aimDegrees + deltaDegrees));
    // A relative adjustment supersedes whatever the field holds, so its text is rewritten even while it
    // has focus. Arrow keys are intercepted before the field ever sees them, so a user pressing an arrow
    // is asking for the aim to move, not editing text.
    aimInput.value = renderAim();
    writeFieldText();
  }

  /** R7.3, R7.4, R7.7, R7.8 - step and clamp, with no rejection at either end. */
  function stepPower(deltaPercent: number): void {
    setPowerPercent(snapPowerPercent(powerPercent + deltaPercent));
    powerInput.value = renderPower();
    writeFieldText();
  }

  // -- firing ------------------------------------------------------------------------------------

  /**
   * R7.5, R8.2 - the space key invokes `shoot` with the values currently held, irrespective of the
   * Status_Token.
   *
   * Any field still being edited is committed first, so a Shot cannot be fired with the overlay showing
   * one value and the Shot_Controller receiving another.
   */
  function fire(): void {
    // Commit both fields first, so a Shot cannot be fired with a field showing one value and the
    // Shot_Controller receiving another. This is what lets an agent write the aim, write the power and
    // press space without a commit step in between.
    commitAim();
    commitPower();
    onShotResult(shoot(aimDegrees, powerPercent, shotContext()));
  }

  // -- listeners ---------------------------------------------------------------------------------

  function onKeyDown(event: KeyboardEvent): void {
    const isSpace = isSpaceKey(event);
    if (!INTERCEPTED_KEYS.has(event.key) && !isSpace) {
      return;
    }

    // R7.13, R7.23 - suppress the default unconditionally: page scrolling for the arrows and space, the
    // number input's own spinner for ArrowUp and ArrowDown, and form submission for Enter.
    event.preventDefault();

    if (isSpace) {
      fire();
      return;
    }

    switch (event.key) {
      case 'ArrowLeft':
        stepAim(ANGLE_STEP_DEGREES);
        break;
      case 'ArrowRight':
        stepAim(-ANGLE_STEP_DEGREES);
        break;
      case 'ArrowUp':
        stepPower(POWER_STEP_PERCENT);
        break;
      case 'ArrowDown':
        stepPower(-POWER_STEP_PERCENT);
        break;
      case 'Enter':
        // R7.24 - commit the focused field and fire nothing.
        if (document.activeElement === aimInput) {
          commitAim();
        } else if (document.activeElement === powerInput) {
          commitPower();
        }
        break;
      default:
        break;
    }
  }

  function onAimInput(): void {
    adoptAimText(aimInput.value);
    aimLastSeenText = aimInput.value;
  }

  function onPowerInput(): void {
    adoptPowerText(powerInput.value);
    powerLastSeenText = powerInput.value;
  }

  // R7.23 registers on the document in the **capture** phase, which is what makes this run before the
  // focused element's default behaviour.
  document.addEventListener('keydown', onKeyDown, { capture: true });

  aimInput.addEventListener('input', onAimInput);
  aimInput.addEventListener('change', commitAim);
  aimInput.addEventListener('blur', commitAim);
  powerInput.addEventListener('input', onPowerInput);
  powerInput.addEventListener('change', commitPower);
  powerInput.addEventListener('blur', commitPower);

  // R7.25 - neither input is focused here and neither carries `autofocus`, so arrow and space input
  // reaches the Input_Controller with no pointer interaction and nothing steals the first keypress.
  writeFieldText();

  return {
    aimDegrees: () => aimDegrees,
    powerPercent: () => powerPercent,

    resetToDefaults(): void {
      setAimDegrees(snapAimDegrees(DEFAULT_AIM_DEGREES));
      setPowerPercent(snapPowerPercent(DEFAULT_POWER_PERCENT));
      aimInput.value = renderAim();
      powerInput.value = renderPower();
      writeFieldText();
    },

    refresh(): void {
      // Something wrote the field. Whether it fired an event or assigned `value` silently, the text
      // changing since it was last looked at is the evidence.
      if (aimInput.value !== aimLastSeenText) {
        adoptAimText(aimInput.value);
        aimLastSeenText = aimInput.value;
      }
      if (powerInput.value !== powerLastSeenText) {
        adoptPowerText(powerInput.value);
        powerLastSeenText = powerInput.value;
      }
      writeFieldText();
    },

    dispose(): void {
      document.removeEventListener('keydown', onKeyDown, { capture: true });
      aimInput.removeEventListener('input', onAimInput);
      aimInput.removeEventListener('change', commitAim);
      aimInput.removeEventListener('blur', commitAim);
      powerInput.removeEventListener('input', onPowerInput);
      powerInput.removeEventListener('change', commitPower);
      powerInput.removeEventListener('blur', commitPower);
    },
  };
}
