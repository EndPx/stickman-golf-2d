// The Debug_Overlay's frozen contract, as data - Requirement 9.
//
// Requirement 9 is the declaration site for the contract; this is the one place in code that holds it.
// It lives in `shared/` rather than beside the DOM code deliberately: R9.16 freezes every identifier,
// spelling and value set for the lifetime of the project, and a contract that can only be read from
// inside a browser is a contract nothing can check. Holding it here lets the Debug_Overlay render it and
// lets a verification tool assert against it under Node, from the same declaration.
//
// Nothing here imports Three.js or any transport library, and nothing references a browser-only
// interface (R17.9). It is data and type declarations only.

import { ARENAS } from './arenas.ts';
import type { ShotRejectionReason } from './shot.ts';

// ---------------------------------------------------------------------------------------------
// Frozen value sets
// ---------------------------------------------------------------------------------------------

/** R5.1, R9.10 - the four Status_Token values. Spelling and casing frozen by R5.2. */
export const STATUS_TOKENS = ['BALL_MOVING', 'BALL_AT_REST', 'IN_HOLE', 'OUT_OF_BOUNDS'] as const;
export type StatusToken = (typeof STATUS_TOKENS)[number];

/** R9.11 - the Match phase, separate from the Status_Token. */
export const MATCH_PHASES = ['WAITING_FOR_OPPONENT', 'IN_PROGRESS', 'MATCH_COMPLETE'] as const;
export type MatchPhase = (typeof MATCH_PHASES)[number];

/** R9.3 - the Active_Player identity, where `NONE` means no Active_Player is designated. */
export const ACTIVE_PLAYERS = ['P1', 'P2', 'NONE'] as const;
export type ActivePlayer = (typeof ACTIVE_PLAYERS)[number];

/** R9.12 - per-Player participation. */
export const PARTICIPATION_STATES = ['CONNECTED', 'DISCONNECTED'] as const;
export type ParticipationState = (typeof PARTICIPATION_STATES)[number];

/** R9.18 - per-Player completion. */
export const COMPLETION_STATES = ['NONE', 'DNF'] as const;
export type CompletionState = (typeof COMPLETION_STATES)[number];

/** R5.17, R9.23 - the per-Player hole-out latch for the current Arena. */
export const HOLE_OUT_STATES = [
  'NOT_HOLED_OUT',
  'HOLED_OUT_BY_CAPTURE',
  'HOLED_OUT_BY_STROKE_CAP',
] as const;
export type HoleOutState = (typeof HOLE_OUT_STATES)[number];

/** R9.17 - the Match result. Note there is no `NONE`, which is why the field is phase-scoped below. */
export const MATCH_RESULTS = ['P1', 'P2', 'TIE', 'VOID'] as const;
export type MatchResult = (typeof MATCH_RESULTS)[number];

/**
 * R9.21 - the Shot rejection field's value set, in the order R9.21 declares it.
 *
 * Equal to `NONE` plus R8.11's frozen rejection set. The two orders differ; the set does not, and the set
 * is what R15.26 asserts membership against.
 */
export const LAST_REJECTION_VALUES = [
  'NONE',
  'MATCH_NOT_STARTED',
  'NOT_YOUR_TURN',
  'BALL_NOT_AT_REST',
  'ALREADY_HOLED_OUT',
  'MATCH_COMPLETE',
  'ARENA_ADVANCE_IN_PROGRESS',
  'INVALID_SHOT_ARGUMENT',
] as const;
export type LastRejection = 'NONE' | ShotRejectionReason;

// ---------------------------------------------------------------------------------------------
// Field identifiers
// ---------------------------------------------------------------------------------------------

/** Every declared Arena number, so the per-Arena Stroke fields cover 1 through 5 (R9.19). */
export const ARENA_NUMBERS: readonly number[] = ARENAS.map((arena) => arena.number);

/** R7.19, R9.26 - the two number inputs, which are part of the frozen contract rather than an extra. */
export const NUMBER_INPUT_FIELD_IDS = ['overlay-aim-input', 'overlay-power-input'] as const;

/**
 * Field identifiers required in **every** Match phase (R15.34).
 *
 * `overlay-result` is deliberately absent: R9.17 declares its value set with no `NONE` member, so before
 * the Match completes there is no truthful in-set value it could hold. R15.34 scopes it to the
 * `MATCH_COMPLETE` phase for exactly that reason.
 *
 * The per-Arena Stroke fields *are* here even though R9.19 scopes them to `MATCH_COMPLETE`, because a
 * per-Arena Stroke count is a non-negative integer in every phase. Exposing them throughout is strictly
 * more useful than withholding them and cannot put an out-of-set value on screen.
 */
export const ALWAYS_PRESENT_FIELD_IDS: readonly string[] = [
  'overlay-arena',
  'overlay-active-player',
  'overlay-p1-strokes',
  'overlay-p2-strokes',
  'overlay-p1-total',
  'overlay-p2-total',
  'overlay-aim-angle',
  'overlay-power',
  'overlay-status',
  'overlay-match-phase',
  'overlay-p1-participation',
  'overlay-p2-participation',
  'overlay-p1-completion',
  'overlay-p2-completion',
  'overlay-p1-hole-out',
  'overlay-p2-hole-out',
  'overlay-last-rejection',
  'overlay-anomaly-count',
  ...NUMBER_INPUT_FIELD_IDS,
  ...ARENA_NUMBERS.flatMap((arenaNumber) => [
    `overlay-p1-arena-${String(arenaNumber)}-strokes`,
    `overlay-p2-arena-${String(arenaNumber)}-strokes`,
  ]),
];

/** Field identifiers required only while the Match phase reads `MATCH_COMPLETE` (R9.17, R15.34). */
export const MATCH_COMPLETE_ONLY_FIELD_IDS: readonly string[] = ['overlay-result'];

/** Every identifier the Debug_Overlay can expose. */
export const ALL_FIELD_IDS: readonly string[] = [
  ...ALWAYS_PRESENT_FIELD_IDS,
  ...MATCH_COMPLETE_ONLY_FIELD_IDS,
];

/**
 * The declared value set for each enumerated field, so a verifier can assert R15.26 membership without
 * restating the contract. Fields absent from this map hold a non-negative decimal integer instead.
 */
export const ENUMERATED_FIELD_VALUE_SETS: Readonly<Record<string, readonly string[]>> = {
  'overlay-active-player': ACTIVE_PLAYERS,
  'overlay-status': STATUS_TOKENS,
  'overlay-match-phase': MATCH_PHASES,
  'overlay-p1-participation': PARTICIPATION_STATES,
  'overlay-p2-participation': PARTICIPATION_STATES,
  'overlay-p1-completion': COMPLETION_STATES,
  'overlay-p2-completion': COMPLETION_STATES,
  'overlay-p1-hole-out': HOLE_OUT_STATES,
  'overlay-p2-hole-out': HOLE_OUT_STATES,
  'overlay-last-rejection': LAST_REJECTION_VALUES,
  'overlay-result': MATCH_RESULTS,
};

/**
 * R9.28 - the fixed value every field whose live source is descoped holds for the lifetime of the Match.
 *
 * Each is a member of that field's own declared value set, so a flow reading the overlay can never fail
 * on an out-of-set value or an absent identifier just because the Game_Server was cut.
 */
export const FIXED_FIELD_VALUES: Readonly<Record<string, string>> = {
  'overlay-active-player': 'P1',
  'overlay-p1-participation': 'CONNECTED',
  'overlay-p2-participation': 'DISCONNECTED',
  'overlay-p1-completion': 'NONE',
  'overlay-p2-completion': 'NONE',
  'overlay-p2-hole-out': 'NOT_HOLED_OUT',
  'overlay-p2-strokes': '0',
  'overlay-p2-total': '0',
  ...Object.fromEntries(
    ARENA_NUMBERS.map((arenaNumber) => [`overlay-p2-arena-${String(arenaNumber)}-strokes`, '0']),
  ),
};

/**
 * R9.15 - a non-negative decimal integer with no sign, no thousands separator and no leading zero unless
 * the value is zero.
 *
 * Defensive rather than trusting: every caller supplies a non-negative integer by construction, and
 * clamping here means a bug upstream shows as a wrong number rather than as an out-of-format string,
 * which would fail a flow on the format rule instead of on the real fault.
 */
export function formatCount(value: number): string {
  return String(Math.max(0, Math.trunc(value)));
}

/** Whether a rendered field value satisfies R9.15's format and its declared value set. */
export function isFieldValueValid(fieldId: string, text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === '' || trimmed !== text) {
    return false;
  }
  const declaredSet = ENUMERATED_FIELD_VALUE_SETS[fieldId];
  if (declaredSet !== undefined) {
    return declaredSet.includes(trimmed);
  }
  // Every other field is a non-negative decimal integer: digits only, and no leading zero unless zero.
  return /^(0|[1-9][0-9]*)$/.test(trimmed);
}
