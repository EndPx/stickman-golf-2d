// Match state machine - the Status_Token, Shot accounting, and the start-arena selector.
//
// Deliberately free of every browser interface, so the whole state machine can be driven and asserted
// under Node. With Requirement 18 descoped there is no test suite, and a state machine that could only be
// exercised through a real browser and a real clock would be the least verifiable part of the project.
// `main.ts` supplies the DOM, the clock and the Renderer; everything below is pure.
//
// The Status_Token edges implemented are the ones R5.16 leaves reachable in the delivered scope. The two
// Moving_Obstacle edges are unreachable because the Moving_Obstacle is descoped, and the rejection edge is
// unreachable because there is no Game_Server to publish a rejection - `shoot` decides locally and
// synchronously, so a Shot never sits in flight.

import {
  DEFAULT_AIM_DEGREES,
  DEFAULT_POWER_PERCENT,
  MAX_STROKES_PER_ARENA,
} from '../../shared/constants.ts';
import {
  ARENAS,
  PLAYABLE_ARENA_NUMBERS,
  getArena,
  isPlayableArenaNumber,
  nextPlayableArenaNumber,
  type ArenaNumber,
} from '../../shared/arenas.ts';
import {
  createArenaCollision,
  createBallAtRest,
  step as stepPhysics,
  type ArenaCollision,
  type BallState,
} from '../../shared/physics.ts';
import type { ShotContext, ShotResult } from '../../shared/shot.ts';
import type {
  HoleOutState,
  LastRejection,
  MatchPhase,
  MatchResult,
  StatusToken,
} from '../../shared/overlay-contract.ts';
import type { ShotRejectionReason } from '../../shared/shot.ts';

/** One recorded anomaly. R10.15 counts these; the text is for `verification/defects.md`. */
export interface AnomalyEntry {
  readonly requirement: string;
  readonly detail: string;
}

export interface MatchState {
  readonly arenaNumber: ArenaNumber;
  readonly collision: ArenaCollision;
  readonly ball: BallState;
  readonly status: StatusToken;
  readonly matchPhase: MatchPhase;
  /** Strokes in the current Arena. */
  readonly strokes: number;
  /** R13.3 - retained per-Arena Stroke counts across completed Arenas, by Arena number. */
  readonly strokesByArena: ReadonlyMap<number, number>;
  /** R13.4 - the sum over completed Arenas only. The current Arena is excluded. */
  readonly runningTotal: number;
  readonly holeOut: HoleOutState;
  readonly lastRejection: LastRejection;
  readonly anomalies: readonly AnomalyEntry[];
  readonly result: MatchResult | null;
  /**
   * The aim and power the Shot in flight was accepted with, recorded at launch.
   *
   * The Input_Controller is the single owner of the live aim and power values - it owns the grids, the
   * snapping and R7.9 and R7.10's resets - so they are deliberately not duplicated here. These two are the
   * parameters of the Shot being simulated, which R3.16 and R5.11 both require an anomaly entry to name.
   */
  readonly shotAimDegrees: number;
  readonly shotPowerPercent: number;
}

/** R10.15 - the anomaly count the Debug_Overlay exposes. Starts at 0 and never decreases. */
export function anomalyCount(state: MatchState): number {
  return state.anomalies.length;
}

/**
 * R9.19, R13.3, R13.4 - the per-Arena Stroke counts as the Debug_Overlay exposes them, which is the
 * retained record **plus the Arena currently being played**.
 *
 * `strokesByArena` alone is the R13.3 retained record: an Arena's count is added to it when that Arena
 * completes. That is not what the overlay should show. R13.4 confines the running total to completed Arenas
 * precisely so that "an agent reading the overlay finds the current Arena's Strokes in the per-Arena field
 * and not in the total", and a per-Arena field reading 0 while that Arena is being played would leave the
 * current Stroke count absent from both. Merging here keeps the retained record and the display distinct
 * without giving either a second source of truth.
 */
export function strokesByArenaForDisplay(state: MatchState): ReadonlyMap<number, number> {
  // Every declared Arena is present, zero-defaulted, so the task 13 guarantee - unplayed Arenas
  // expose 0 - is a property of the exposed map itself rather than of each reader's fallback.
  const merged = new Map<number, number>(ARENAS.map((arena) => [arena.number, 0]));
  for (const [arena, strokes] of state.strokesByArena) {
    merged.set(arena, strokes);
  }
  merged.set(state.arenaNumber, state.strokes);
  return merged;
}

function withAnomaly(state: MatchState, requirement: string, detail: string): MatchState {
  return { ...state, anomalies: [...state.anomalies, { requirement, detail }] };
}

// ---------------------------------------------------------------------------------------------
// The start-arena selector
// ---------------------------------------------------------------------------------------------

/**
 * R1.25, R1.26 - resolves the load-time start-arena selector.
 *
 * Takes the raw selector text rather than reading it, so this stays testable and DOM-free. A value naming
 * an Arena outside the delivered scope, or not naming one at all, falls back to Arena 1 and is reported
 * as refused so the caller can record the R1.26 anomaly naming the refused value.
 *
 * This is a permanent affordance, not scaffolding. It is what makes the Arena 2 Verification_Flow possible
 * at all: playing Arena 1 first costs 10 Agent_Steps of a 15-step budget, so a flow that cannot begin in
 * Arena 2 cannot fit. R15.19's rule that such a flag selects only the starting Match state, and alters no
 * code path, carries over to it unchanged.
 */
export function resolveStartArena(selector: string | null): {
  readonly arenaNumber: ArenaNumber;
  readonly refusedValue: string | null;
} {
  const fallback = PLAYABLE_ARENA_NUMBERS[0] ?? 1;

  if (selector === null || selector.trim() === '') {
    return { arenaNumber: fallback, refusedValue: null };
  }

  const parsed = Number(selector.trim());
  if (!Number.isInteger(parsed) || !isPlayableArenaNumber(parsed)) {
    return { arenaNumber: fallback, refusedValue: selector };
  }
  return { arenaNumber: parsed, refusedValue: null };
}

// ---------------------------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------------------------

/**
 * R1.4, R1.25, R5.15 - begins the Match.
 *
 * The sole Player is the Active_Player from the same update in which the phase becomes `IN_PROGRESS`
 * (R1.4). Every per-Arena Stroke count and the running total start at zero, the Ball sits at the selected
 * Arena's declared spawn point, and the Status_Token reads `BALL_AT_REST` from the first frame (R5.15).
 * Arena geometry, Par and every Constants_Module value are untouched by the selector.
 */
export function createMatch(startArenaSelector: string | null): MatchState {
  const resolved = resolveStartArena(startArenaSelector);
  const arena = getArena(resolved.arenaNumber);

  const base: MatchState = {
    arenaNumber: resolved.arenaNumber,
    collision: createArenaCollision(arena),
    ball: createBallAtRest(arena.spawn),
    status: 'BALL_AT_REST',
    matchPhase: 'IN_PROGRESS',
    strokes: 0,
    strokesByArena: new Map(),
    runningTotal: 0,
    holeOut: 'NOT_HOLED_OUT',
    lastRejection: 'NONE',
    anomalies: [],
    result: null,
    shotAimDegrees: DEFAULT_AIM_DEGREES,
    shotPowerPercent: DEFAULT_POWER_PERCENT,
  };

  if (resolved.refusedValue === null) {
    return base;
  }

  // R1.26 - begin at Arena 1 and record an anomaly naming the refused value.
  return withAnomaly(
    base,
    'R1.26',
    `start-arena selector refused: ${JSON.stringify(resolved.refusedValue)} does not name an Arena implemented in the delivered scope (${PLAYABLE_ARENA_NUMBERS.join(', ')}); began at Arena ${String(resolved.arenaNumber)}`,
  );
}

// ---------------------------------------------------------------------------------------------
// Shot preconditions
// ---------------------------------------------------------------------------------------------

/**
 * The first failing Shot precondition, or `null` when every one holds.
 *
 * Evaluated in what survives of R11.9's precedence order: `MATCH_COMPLETE`, then `ALREADY_HOLED_OUT`, then
 * `BALL_NOT_AT_REST`. `MATCH_NOT_STARTED`, `ARENA_ADVANCE_IN_PROGRESS` and `NOT_YOUR_TURN` are descoped
 * with the Game_Server - there is no join step, no Arena-advance window and no second Player - so they are
 * unreachable while staying in R8.11's frozen set.
 */
export function shotPrecondition(state: MatchState): ShotRejectionReason | null {
  if (state.matchPhase === 'MATCH_COMPLETE') {
    return 'MATCH_COMPLETE';
  }
  if (state.holeOut !== 'NOT_HOLED_OUT') {
    return 'ALREADY_HOLED_OUT';
  }
  if (state.status !== 'BALL_AT_REST') {
    return 'BALL_NOT_AT_REST';
  }
  return null;
}

/**
 * R5.9, R5.10 - acknowledges a held terminal Status_Token, which is what begins the next turn.
 *
 * `IN_HOLE` and `OUT_OF_BOUNDS` are held until the Player asks for the next turn, rather than collapsing
 * to `BALL_AT_REST` on the step they are set. That is the local reading of "until the Game_Server publishes
 * the Active_Player designation for the next Shot": with no Game_Server, the designation is published when
 * the Player acts.
 *
 * It matters because the alternative makes both values unobservable. A Verification_Flow polls the
 * Status_Token every `STATUS_POLL_INTERVAL_MILLISECONDS`, and a token that held for one Simulation_Step -
 * about 17 milliseconds - would be missed almost every time. `OUT_OF_BOUNDS` would then be dead in the
 * delivered scope, which is precisely what D-18 moved Arena 2's open edge in order to prevent.
 *
 * Holding until the Player acts costs nothing: the acknowledgement is folded into the same space press that
 * fires the next Shot, so no extra Agent_Step is spent, and an observer has unlimited time to read the token.
 */
function acknowledgeTerminalToken(state: MatchState): MatchState {
  if (state.status !== 'IN_HOLE' && state.status !== 'OUT_OF_BOUNDS') {
    return state;
  }
  // R5.10's first condition - the Ball has already been placed at its pre-shot position by the engine on
  // the step the out-of-bounds condition was satisfied - and now its second.
  return { ...state, status: 'BALL_AT_REST' };
}

/**
 * Task 13 - the local Arena advance and the Match completion, as one state update each.
 *
 * The advance is deliberately **not** part of the step that latches the hole-out: R5.9 holds the
 * terminal token until the Player acts, precisely so a polling verifier can read it, and an advance
 * on the latching step would replace `IN_HOLE` with the next Arena's `BALL_AT_REST` in the same
 * update it was set. Instead the held token is the thing the Player acknowledges, and the
 * acknowledgement - the same space press that would have begun the next turn anyway - is where the
 * Course moves. No extra Agent_Step is spent, and the aim and power the Input_Controller reset to
 * defaults on the completing step are exactly what the next Shot in the new Arena fires with.
 *
 * R13.3 - the completed Arena's Stroke count joins the retained per-Arena record. R13.4 - the
 * running total gains it, staying the sum over completed Arenas only. The new Arena begins at its
 * declared spawn with zero Strokes, a clear hole-out field and a `BALL_AT_REST` token (R5.15's
 * starting shape, again). On the last Arena the same acknowledgement completes the Match instead:
 * R1.24 sets the phase to `MATCH_COMPLETE` and the result to `P1`, and the per-Arena record and
 * total stand with zeros for every Arena not played.
 */
function advanceCourse(state: MatchState): MatchState {
  const retained = new Map(state.strokesByArena);
  retained.set(state.arenaNumber, state.strokes);
  const runningTotal = state.runningTotal + state.strokes;
  const nextNumber = nextPlayableArenaNumber(state.arenaNumber);

  if (nextNumber === null) {
    return {
      ...state,
      strokesByArena: retained,
      runningTotal,
      matchPhase: 'MATCH_COMPLETE',
      result: 'P1',
      lastRejection: 'NONE',
    };
  }

  const nextArena = getArena(nextNumber);
  return {
    ...state,
    arenaNumber: nextNumber,
    collision: createArenaCollision(nextArena),
    ball: createBallAtRest(nextArena.spawn),
    status: 'BALL_AT_REST',
    strokes: 0,
    strokesByArena: retained,
    runningTotal,
    holeOut: 'NOT_HOLED_OUT',
    lastRejection: 'NONE',
  };
}

/**
 * Builds the ShotContext for the Input_Controller, acknowledging a held terminal token first.
 *
 * Returns the state to adopt alongside it, because the acknowledgement is a state transition and the caller
 * has to keep it.
 */
export function prepareShot(state: MatchState): {
  readonly state: MatchState;
  readonly context: ShotContext;
} {
  // A latched hole-out - by capture or by the Stroke cap - ends the Arena. Acknowledging it advances
  // the Course, or completes the Match on the last Arena, and the returned context carries whatever
  // precondition the new state holds: `null` in a fresh Arena, so the same press fires its first Shot,
  // or `MATCH_COMPLETE` on the finished Course, so further presses are refused.
  if (state.holeOut !== 'NOT_HOLED_OUT') {
    const advanced = advanceCourse(state);
    return {
      state: advanced,
      context: {
        collision: advanced.collision,
        ball: advanced.ball,
        precondition: shotPrecondition(advanced),
      },
    };
  }

  const acknowledged = acknowledgeTerminalToken(state);
  return {
    state: acknowledged,
    context: {
      collision: acknowledged.collision,
      ball: acknowledged.ball,
      precondition: shotPrecondition(acknowledged),
    },
  };
}

/**
 * Applies the outcome of a `shoot` invocation.
 *
 * R13.1 - exactly one Stroke per accepted Shot. R5.4, R5.18 - the Status_Token reads `BALL_MOVING` from the
 * instant velocity is imparted. R9.22 - the rejection field returns to `NONE` on acceptance and holds the
 * returned reason on rejection.
 */
export function applyShotResult(state: MatchState, result: ShotResult): MatchState {
  if (!result.accepted) {
    return { ...state, lastRejection: result.reason };
  }

  const launched: MatchState = {
    ...state,
    ball: result.ball,
    status: 'BALL_MOVING',
    strokes: state.strokes + 1,
    lastRejection: 'NONE',
    // The parameters the Shot was accepted with, wrapped and clamped by `shoot`. Anomaly entries name
    // these rather than whatever the Input_Controller holds by the time the anomaly fires.
    shotAimDegrees: result.angleDegrees,
    shotPowerPercent: result.powerPercent,
  };

  if (!result.preShotPositionAnomaly) {
    return launched;
  }

  // R6.9 - the recorded pre-shot position was not a legal resting place. The Shot proceeds, because
  // refusing it would need a reason outside R8.11's frozen set, but the anomaly makes it fatal to every
  // Verification_Flow under R15.17.
  return withAnomaly(
    launched,
    'R6.9',
    `pre-shot position (${String(result.ball.preShotPosition.x)}, ${String(result.ball.preShotPosition.y)}) in Arena ${String(state.arenaNumber)} is not a legal resting place`,
  );
}

// ---------------------------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------------------------

/** What one Simulation_Step did to the Match. */
export interface MatchStepResult {
  readonly state: MatchState;
  /**
   * True on the step a Shot reached its terminal outcome.
   *
   * R7.9 and R7.10's reset is due on exactly this step. It is reported rather than applied because the
   * Input_Controller owns the live aim and power values, and duplicating them here would give them two
   * owners that could disagree.
   *
   * A turn beginning and the preceding Shot completing are the same instant locally - there is no second
   * Player to hand the turn to - so one reset satisfies both criteria. Notably the reset is **not** due when
   * a held terminal token is acknowledged, because that would wipe the aim and power an agent had just
   * written in order to take the next Shot.
   */
  readonly shotCompleted: boolean;
}

/**
 * Advances the Match by exactly one Simulation_Step.
 *
 * The Status_Token follows the engine's terminal outcome, and the Stroke accounting and hole-out latch are
 * evaluated on the same step, which is what gives R9.14 its ordering guarantee: by the time the overlay
 * renders, every field already reflects the completed Shot.
 */
export function stepMatch(state: MatchState): MatchStepResult {
  const outcome = stepPhysics(state.collision, state.ball);
  let next: MatchState = { ...state, ball: outcome.ball };

  const shotParameters = `at aim ${String(state.shotAimDegrees)} power ${String(state.shotPowerPercent)}`;

  if (outcome.residualOverlapAnomaly) {
    next = withAnomaly(
      next,
      'R3.16',
      `residual surface overlap survived contact resolution in Arena ${String(state.arenaNumber)} ${shotParameters}`,
    );
  }
  if (outcome.shotDurationAnomaly) {
    next = withAnomaly(
      next,
      'R5.11',
      `Shot exceeded MAX_SHOT_DURATION_SECONDS in Arena ${String(state.arenaNumber)} ${shotParameters}`,
    );
  }

  // A Ball that was already at rest, holed or out of bounds is untouched by the engine, so nothing below
  // should re-fire. Only a Shot in flight can reach a terminal outcome on this step.
  if (state.status !== 'BALL_MOVING') {
    return { state: next, shotCompleted: false };
  }

  switch (outcome.ball.outcome) {
    case 'IN_MOTION':
      // R5.5 - hold BALL_MOVING while the Ball is in motion and neither terminal condition is satisfied.
      return { state: next, shotCompleted: false };

    case 'HOLED':
      // R6.3 - no additional Stroke for the capture, and the Stroke count for this Arena is held at the
      // value recorded at the instant of capture. R13.16 - the hole-out field latches by capture.
      return {
        state: { ...next, status: 'IN_HOLE', holeOut: 'HOLED_OUT_BY_CAPTURE' },
        shotCompleted: true,
      };

    case 'OUT_OF_BOUNDS':
      // R13.2 - the Stroke already counted is retained and no further Stroke is counted for the
      // repositioning. R6.10 - reaching the cap on this Shot marks the Player holed out by the cap.
      return {
        state: applyStrokeCap({ ...next, status: 'OUT_OF_BOUNDS' }),
        shotCompleted: true,
      };

    case 'AT_REST':
      // R5.7 - BALL_AT_REST on the step the rest debounce completes, after the engine has zeroed velocity.
      // The next turn begins in the same instant, so no acknowledgement is needed on this path.
      return {
        state: applyStrokeCap({ ...next, status: 'BALL_AT_REST' }),
        shotCompleted: true,
      };

    default:
      return { state: next, shotCompleted: false };
  }
}

/**
 * R13.5, R6.10 - the `MAX_STROKES_PER_ARENA` cap.
 *
 * Evaluated at the Shot's terminal outcome rather than when the Stroke was counted, so a Player is not
 * marked Holed_Out while the capping Ball is still rolling. R13.15 - a cap-out never reaches `IN_HOLE`, so
 * the Status_Token keeps whatever terminal value the Shot actually produced and only the hole-out field
 * records the cap.
 */
function applyStrokeCap(state: MatchState): MatchState {
  if (state.holeOut !== 'NOT_HOLED_OUT' || state.strokes < MAX_STROKES_PER_ARENA) {
    return state;
  }
  return { ...state, strokes: MAX_STROKES_PER_ARENA, holeOut: 'HOLED_OUT_BY_STROKE_CAP' };
}

/** R3.18 - records the discarded-simulated-time anomaly the clock reports. */
export function withDiscardAnomaly(state: MatchState, discardedSteps: number): MatchState {
  return withAnomaly(
    state,
    'R3.18',
    `discarded ${String(discardedSteps)} Simulation_Steps of accumulated time in Arena ${String(state.arenaNumber)}`,
  );
}
