// Task 10 acceptance check, the half that does not need a browser.
//
// The identifiers and value sets below are transcribed **independently** from Requirement 9 rather than
// imported from the code, which is the whole point: comparing the code against itself would prove nothing.
// A typo in an identifier or a value dropped from a frozen set fails here.
//
// The DOM half - every declared identifier present and non-empty on first paint, every enumerated field
// holding a member of its set, and both number inputs reading back the read-only values - needs a browser
// and is checked with Playwright against this same declaration.
//
// Run with `node verification/tools/check-overlay-contract.ts`.

import {
  ALL_FIELD_IDS,
  ALWAYS_PRESENT_FIELD_IDS,
  ENUMERATED_FIELD_VALUE_SETS,
  FIXED_FIELD_VALUES,
  MATCH_COMPLETE_ONLY_FIELD_IDS,
  formatCount,
  isFieldValueValid,
} from '../../shared/overlay-contract.ts';
import { MAX_STROKES_PER_ARENA } from '../../shared/constants.ts';
import { createReporter } from './shot-helpers.ts';

const { report, finish } = createReporter();

// -- transcribed from Requirement 9 ---------------------------------------------------------------

/** Every field identifier Requirement 9 and R10.15 declare, with the criterion that declares it. */
const DECLARED_FIELDS: readonly (readonly [string, string])[] = [
  ['overlay-arena', 'R9.2'],
  ['overlay-active-player', 'R9.3'],
  ['overlay-p1-strokes', 'R9.4'],
  ['overlay-p2-strokes', 'R9.5'],
  ['overlay-p1-total', 'R9.6'],
  ['overlay-p2-total', 'R9.7'],
  ['overlay-aim-angle', 'R9.8'],
  ['overlay-power', 'R9.9'],
  ['overlay-status', 'R9.10'],
  ['overlay-match-phase', 'R9.11'],
  ['overlay-p1-participation', 'R9.12'],
  ['overlay-p2-participation', 'R9.12'],
  ['overlay-result', 'R9.17'],
  ['overlay-p1-completion', 'R9.18'],
  ['overlay-p2-completion', 'R9.18'],
  ['overlay-p1-arena-1-strokes', 'R9.19'],
  ['overlay-p1-arena-2-strokes', 'R9.19'],
  ['overlay-p1-arena-3-strokes', 'R9.19'],
  ['overlay-p1-arena-4-strokes', 'R9.19'],
  ['overlay-p1-arena-5-strokes', 'R9.19'],
  ['overlay-p2-arena-1-strokes', 'R9.19'],
  ['overlay-p2-arena-2-strokes', 'R9.19'],
  ['overlay-p2-arena-3-strokes', 'R9.19'],
  ['overlay-p2-arena-4-strokes', 'R9.19'],
  ['overlay-p2-arena-5-strokes', 'R9.19'],
  ['overlay-last-rejection', 'R9.21'],
  ['overlay-p1-hole-out', 'R9.23'],
  ['overlay-p2-hole-out', 'R9.23'],
  ['overlay-anomaly-count', 'R9.25, R10.15'],
  ['overlay-aim-input', 'R7.19, R9.26'],
  ['overlay-power-input', 'R7.19, R9.26'],
];

/** Every enumerated field's declared value set, transcribed from Requirement 9. */
const DECLARED_VALUE_SETS: Readonly<Record<string, readonly string[]>> = {
  'overlay-active-player': ['P1', 'P2', 'NONE'],
  'overlay-status': ['BALL_MOVING', 'BALL_AT_REST', 'IN_HOLE', 'OUT_OF_BOUNDS'],
  'overlay-match-phase': ['WAITING_FOR_OPPONENT', 'IN_PROGRESS', 'MATCH_COMPLETE'],
  'overlay-p1-participation': ['CONNECTED', 'DISCONNECTED'],
  'overlay-p2-participation': ['CONNECTED', 'DISCONNECTED'],
  'overlay-p1-completion': ['NONE', 'DNF'],
  'overlay-p2-completion': ['NONE', 'DNF'],
  'overlay-p1-hole-out': ['NOT_HOLED_OUT', 'HOLED_OUT_BY_CAPTURE', 'HOLED_OUT_BY_STROKE_CAP'],
  'overlay-p2-hole-out': ['NOT_HOLED_OUT', 'HOLED_OUT_BY_CAPTURE', 'HOLED_OUT_BY_STROKE_CAP'],
  'overlay-last-rejection': [
    'NONE',
    'MATCH_NOT_STARTED',
    'NOT_YOUR_TURN',
    'BALL_NOT_AT_REST',
    'ALREADY_HOLED_OUT',
    'MATCH_COMPLETE',
    'ARENA_ADVANCE_IN_PROGRESS',
    'INVALID_SHOT_ARGUMENT',
  ],
  'overlay-result': ['P1', 'P2', 'TIE', 'VOID'],
};

/** R9.28 - the fixed value each descoped-source field holds for the lifetime of the Match. */
const DECLARED_FIXED_VALUES: Readonly<Record<string, string>> = {
  'overlay-active-player': 'P1',
  'overlay-p1-participation': 'CONNECTED',
  'overlay-p2-participation': 'DISCONNECTED',
  'overlay-p1-completion': 'NONE',
  'overlay-p2-completion': 'NONE',
  'overlay-p2-hole-out': 'NOT_HOLED_OUT',
  'overlay-p2-strokes': '0',
  'overlay-p2-total': '0',
  'overlay-p2-arena-1-strokes': '0',
  'overlay-p2-arena-2-strokes': '0',
  'overlay-p2-arena-3-strokes': '0',
  'overlay-p2-arena-4-strokes': '0',
  'overlay-p2-arena-5-strokes': '0',
};

// -- the identifier set ---------------------------------------------------------------------------

function compareSets(label: string, declared: readonly string[], coded: readonly string[]): void {
  const missing = declared.filter((id) => !coded.includes(id));
  const extra = coded.filter((id) => !declared.includes(id));
  report(
    missing.length === 0 && extra.length === 0,
    label,
    missing.length === 0 && extra.length === 0
      ? `${String(coded.length)} identifiers`
      : `missing [${missing.join(', ')}], extra [${extra.join(', ')}]`,
  );
}

compareSets(
  'the coded identifier set equals the set Requirement 9 declares',
  DECLARED_FIELDS.map(([id]) => id),
  ALL_FIELD_IDS,
);

report(
  new Set(ALL_FIELD_IDS).size === ALL_FIELD_IDS.length,
  'R9.13 - every identifier is unique',
  `${String(ALL_FIELD_IDS.length)} declared, ${String(new Set(ALL_FIELD_IDS).size)} distinct`,
);

compareSets(
  'R15.34 - only overlay-result is scoped to the MATCH_COMPLETE phase',
  ['overlay-result'],
  MATCH_COMPLETE_ONLY_FIELD_IDS,
);

report(
  !ALWAYS_PRESENT_FIELD_IDS.includes('overlay-result'),
  'overlay-result is not claimed as always present, because its value set has no NONE member',
  ALWAYS_PRESENT_FIELD_IDS.includes('overlay-result') ? 'it is' : 'it is not',
);

report(
  ALWAYS_PRESENT_FIELD_IDS.length + MATCH_COMPLETE_ONLY_FIELD_IDS.length === ALL_FIELD_IDS.length,
  'the always-present and phase-scoped sets partition the whole contract',
  `${String(ALWAYS_PRESENT_FIELD_IDS.length)} + ${String(MATCH_COMPLETE_ONLY_FIELD_IDS.length)} = ${String(ALL_FIELD_IDS.length)}`,
);

// -- the value sets -------------------------------------------------------------------------------

console.log('');

compareSets(
  'the coded enumerated-field list equals the declared one',
  Object.keys(DECLARED_VALUE_SETS),
  Object.keys(ENUMERATED_FIELD_VALUE_SETS),
);

for (const [fieldId, declaredValues] of Object.entries(DECLARED_VALUE_SETS)) {
  const codedValues = ENUMERATED_FIELD_VALUE_SETS[fieldId] ?? [];
  const missing = declaredValues.filter((value) => !codedValues.includes(value));
  const extra = codedValues.filter((value) => !declaredValues.includes(value));
  report(
    missing.length === 0 && extra.length === 0,
    `${fieldId} holds exactly its declared value set`,
    missing.length === 0 && extra.length === 0
      ? codedValues.join(' ')
      : `missing [${missing.join(', ')}], extra [${extra.join(', ')}]`,
  );
}

// -- R9.28's fixed values -------------------------------------------------------------------------

console.log('');

compareSets(
  'R9.28 - the coded fixed-value field list equals the declared one',
  Object.keys(DECLARED_FIXED_VALUES),
  Object.keys(FIXED_FIELD_VALUES),
);

for (const [fieldId, declaredValue] of Object.entries(DECLARED_FIXED_VALUES)) {
  const codedValue = FIXED_FIELD_VALUES[fieldId];
  report(
    codedValue === declaredValue,
    `R9.28 - ${fieldId} is fixed at ${declaredValue}`,
    String(codedValue),
  );
  // A fixed value that fell outside its own declared set would fail every flow on R15.26.
  report(
    isFieldValueValid(fieldId, declaredValue),
    `  and ${declaredValue} is a member of ${fieldId}'s declared set`,
    String(isFieldValueValid(fieldId, declaredValue)),
  );
}

// -- R9.15's number format ------------------------------------------------------------------------

console.log('');

for (const [value, expected] of [
  [0, '0'],
  [1, '1'],
  [MAX_STROKES_PER_ARENA, String(MAX_STROKES_PER_ARENA)],
  [5 * MAX_STROKES_PER_ARENA, String(5 * MAX_STROKES_PER_ARENA)],
  [359, '359'],
  [-3, '0'],
  [2.7, '2'],
] as readonly (readonly [number, string])[]) {
  report(
    formatCount(value) === expected,
    `R9.15 - ${String(value)} formats as ${expected}`,
    formatCount(value),
  );
}

for (const [fieldId, text, wanted] of [
  ['overlay-arena', '1', true],
  ['overlay-arena', '0', true],
  ['overlay-arena', '', false],
  ['overlay-arena', ' 1', false],
  ['overlay-arena', '1 ', false],
  ['overlay-arena', '01', false],
  ['overlay-arena', '+1', false],
  ['overlay-arena', '1,000', false],
  ['overlay-arena', '-1', false],
  ['overlay-arena', '1.5', false],
  ['overlay-status', 'BALL_AT_REST', true],
  ['overlay-status', 'ball_at_rest', false],
  ['overlay-status', 'BALL_AT_REST ', false],
  ['overlay-status', 'ROLLING', false],
  ['overlay-last-rejection', 'NONE', true],
  ['overlay-last-rejection', 'INVALID_SHOT_ARGUMENT', true],
  ['overlay-result', 'VOID', true],
  ['overlay-result', 'NONE', false],
] as readonly (readonly [string, string, boolean])[]) {
  report(
    isFieldValueValid(fieldId, text) === wanted,
    `R9.15, R15.26 - ${fieldId} ${wanted ? 'accepts' : 'rejects'} ${JSON.stringify(text)}`,
    String(isFieldValueValid(fieldId, text)),
  );
}

console.log('');
console.log(`contract holds ${String(ALL_FIELD_IDS.length)} identifiers:`);
for (const fieldId of ALL_FIELD_IDS) {
  const set = ENUMERATED_FIELD_VALUE_SETS[fieldId];
  const fixed = FIXED_FIELD_VALUES[fieldId];
  const phaseScoped = MATCH_COMPLETE_ONLY_FIELD_IDS.includes(fieldId);
  console.log(
    `  ${fieldId.padEnd(30)} ${set === undefined ? 'non-negative integer' : set.join(' | ')}${fixed === undefined ? '' : `   [fixed at ${fixed}]`}${phaseScoped ? '   [MATCH_COMPLETE only]' : ''}`,
  );
}

finish();
