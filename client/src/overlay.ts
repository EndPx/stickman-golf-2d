// Debug_Overlay - Requirement 9.
//
// The DOM half of the contract. The contract itself - every identifier, every frozen value set, the
// R9.28 fixed values and R9.15's number format - lives in `shared/overlay-contract.ts` so that a
// verification tool can assert against it under Node rather than only from inside a browser.
//
// Every field renders as DOM outside the rendering canvas, present from the first frame in every Match
// phase, with no query parameter, keypress or configuration flag needed (R9.1). Each carries its declared
// identifier as a `data-testid`, and each renders as bare trimmed text with no label, no unit symbol and
// no punctuation (R9.13, R9.15) - visible captions are sibling elements, never inside the value element,
// which is what keeps `textContent` equal to the declared value exactly.

import {
  ARENA_NUMBERS,
  FIXED_FIELD_VALUES,
  formatCount,
  type HoleOutState,
  type LastRejection,
  type MatchPhase,
  type MatchResult,
  type StatusToken,
} from '../../shared/overlay-contract.ts';
import { MAX_STROKES_PER_ARENA } from '../../shared/constants.ts';

// Re-exported so the rest of the client reads the contract from one import rather than two.
export * from '../../shared/overlay-contract.ts';

/** Everything the overlay renders that is not fixed by R9.28. */
export interface OverlayState {
  readonly arenaNumber: number;
  readonly p1Strokes: number;
  readonly p1Total: number;
  /** Retained per-Arena Stroke counts, addressed by Arena number (R13.3). */
  readonly p1StrokesByArena: ReadonlyMap<number, number>;
  readonly aimDegrees: number;
  readonly powerPercent: number;
  readonly status: StatusToken;
  readonly matchPhase: MatchPhase;
  readonly p1HoleOut: HoleOutState;
  readonly lastRejection: LastRejection;
  readonly anomalyCount: number;
  /** R9.17 - the result, or `null` before the Match completes, in which case the field is absent. */
  readonly result: MatchResult | null;
}

export interface Overlay {
  readonly render: (state: OverlayState) => void;
  /** R7.19, R9.26 - the `overlay-aim-input` element, owned by the overlay and driven by the input. */
  readonly aimInput: HTMLInputElement;
  /** R7.19, R9.26 - the `overlay-power-input` element. */
  readonly powerInput: HTMLInputElement;
  readonly dispose: () => void;
}

export function createOverlay(root: HTMLElement): Overlay {
  const valueElements = new Map<string, HTMLElement>();

  function addGroup(title: string): HTMLElement {
    const group = document.createElement('section');
    group.className = 'overlay-group';
    const heading = document.createElement('h2');
    heading.textContent = title;
    group.appendChild(heading);
    root.appendChild(group);
    return group;
  }

  /** One label-and-value row. The caption is a sibling of the value element, never inside it (R9.15). */
  function buildFieldRow(testId: string, caption: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'overlay-field';

    const label = document.createElement('span');
    label.className = 'overlay-label';
    label.textContent = caption;

    const value = document.createElement('span');
    value.className = 'overlay-value';
    value.setAttribute('data-testid', testId);

    row.append(label, value);
    valueElements.set(testId, value);
    return row;
  }

  function addField(group: HTMLElement, testId: string, caption: string): void {
    group.appendChild(buildFieldRow(testId, caption));
  }

  function addNumberInput(group: HTMLElement, testId: string, caption: string): HTMLInputElement {
    const row = document.createElement('div');
    row.className = 'overlay-field';

    const label = document.createElement('label');
    label.className = 'overlay-label';
    label.textContent = caption;
    label.setAttribute('for', testId);

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'overlay-input';
    input.setAttribute('data-testid', testId);
    input.id = testId;
    // R7.25 - no `autofocus`, and nothing here focuses the field.

    row.append(label, input);
    group.appendChild(row);
    return input;
  }

  function setValue(testId: string, text: string): void {
    const element = valueElements.get(testId);
    if (element !== undefined && element.textContent !== text) {
      element.textContent = text;
    }
  }

  // -- shot group: the fields a flow writes and polls ------------------------------------------

  const shotGroup = addGroup('shot');
  const aimInput = addNumberInput(shotGroup, 'overlay-aim-input', 'aim');
  const powerInput = addNumberInput(shotGroup, 'overlay-power-input', 'power');
  addField(shotGroup, 'overlay-aim-angle', 'aim angle');
  addField(shotGroup, 'overlay-power', 'power value');
  addField(shotGroup, 'overlay-status', 'status');
  addField(shotGroup, 'overlay-last-rejection', 'last rejection');

  // -- match group ------------------------------------------------------------------------------

  const matchGroup = addGroup('match');
  addField(matchGroup, 'overlay-arena', 'arena');
  addField(matchGroup, 'overlay-match-phase', 'phase');
  addField(matchGroup, 'overlay-active-player', 'active player');
  addField(matchGroup, 'overlay-anomaly-count', 'anomalies');

  // R9.17, R15.34 - held out of the DOM until the Match phase reads MATCH_COMPLETE, because its declared
  // value set has no member that would be true before then.
  const resultRow = buildFieldRow('overlay-result', 'result');
  let resultAttached = false;

  // -- per-Player groups ------------------------------------------------------------------------

  const p1Group = addGroup('P1');
  addField(p1Group, 'overlay-p1-strokes', 'strokes');
  addField(p1Group, 'overlay-p1-total', 'total');
  addField(p1Group, 'overlay-p1-hole-out', 'hole out');
  addField(p1Group, 'overlay-p1-participation', 'participation');
  addField(p1Group, 'overlay-p1-completion', 'completion');

  const p2Group = addGroup('P2');
  addField(p2Group, 'overlay-p2-strokes', 'strokes');
  addField(p2Group, 'overlay-p2-total', 'total');
  addField(p2Group, 'overlay-p2-hole-out', 'hole out');
  addField(p2Group, 'overlay-p2-participation', 'participation');
  addField(p2Group, 'overlay-p2-completion', 'completion');

  // -- per-Arena Stroke counts ------------------------------------------------------------------

  const perArenaGroup = addGroup('strokes by arena');
  for (const arenaNumber of ARENA_NUMBERS) {
    addField(
      perArenaGroup,
      `overlay-p1-arena-${String(arenaNumber)}-strokes`,
      `P1 arena ${String(arenaNumber)}`,
    );
  }
  for (const arenaNumber of ARENA_NUMBERS) {
    addField(
      perArenaGroup,
      `overlay-p2-arena-${String(arenaNumber)}-strokes`,
      `P2 arena ${String(arenaNumber)}`,
    );
  }

  // -- fields fixed for the lifetime of the Match (R9.28) ---------------------------------------
  //
  // Written once from the shared declaration rather than on every render. That is what makes "fixed for
  // the lifetime of the Match" structural: no code path exists that could change them.
  for (const [testId, text] of Object.entries(FIXED_FIELD_VALUES)) {
    setValue(testId, text);
  }

  function render(state: OverlayState): void {
    setValue('overlay-arena', formatCount(state.arenaNumber));
    setValue('overlay-match-phase', state.matchPhase);
    setValue('overlay-anomaly-count', formatCount(state.anomalyCount));

    setValue('overlay-aim-angle', formatCount(state.aimDegrees));
    setValue('overlay-power', formatCount(state.powerPercent));
    setValue('overlay-last-rejection', state.lastRejection);

    setValue('overlay-p1-strokes', formatCount(Math.min(state.p1Strokes, MAX_STROKES_PER_ARENA)));
    setValue('overlay-p1-total', formatCount(state.p1Total));
    setValue('overlay-p1-hole-out', state.p1HoleOut);

    for (const arenaNumber of ARENA_NUMBERS) {
      // R9.19 - 0 for every Arena that Player did not play.
      setValue(
        `overlay-p1-arena-${String(arenaNumber)}-strokes`,
        formatCount(state.p1StrokesByArena.get(arenaNumber) ?? 0),
      );
    }

    // R9.17, R15.34 - the result field appears with the MATCH_COMPLETE phase and not before.
    if (state.result !== null) {
      setValue('overlay-result', state.result);
      if (!resultAttached) {
        matchGroup.appendChild(resultRow);
        resultAttached = true;
      }
    } else if (resultAttached) {
      resultRow.remove();
      resultAttached = false;
    }

    // R9.14 - the Status_Token is written last, which gives an external reader the ordering guarantee it
    // can actually assert: when `overlay-status` reads BALL_AT_REST, every other field already reflects
    // the completed Shot. The whole of `render` is synchronous, so no reader can observe a half-updated
    // overlay in any case; writing the token last makes the guarantee hold even for a reader that
    // somehow could.
    setValue('overlay-status', state.status);
  }

  return {
    render,
    aimInput,
    powerInput,
    dispose(): void {
      root.replaceChildren();
      valueElements.clear();
    },
  };
}
