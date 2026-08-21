// Task 4 acceptance check, made repeatable.
//
// 1. All five Arena definitions load without error - importing the Arena_Registry runs every kept
//    load-time validation, so a clean import is itself the first half of the check.
// 2. Deliberately corrupting one spawn point raises a named load-time error.
//
// Run with `node verification/tools/check-arenas.ts`.

import {
  ARENAS,
  ArenaValidationError,
  PLAYABLE_ARENA_NUMBERS,
  PLAYFIELD_BOUNDS,
  getArena,
  nextPlayableArenaNumber,
  validateArena,
  type ArenaDefinition,
} from '../../shared/arenas.ts';
import { BALL_RADIUS, MAX_CARRY_DISTANCE } from '../../shared/constants.ts';
import { distanceBetweenPoints, rectangleShorterSide } from '../../shared/geometry.ts';

let failures = 0;

function report(ok: boolean, label: string, detail: string): void {
  if (!ok) {
    failures += 1;
  }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === '' ? '' : ` - ${detail}`}`);
}

// -- 1. all five load -------------------------------------------------------------------------

report(ARENAS.length === 5, 'five Arenas declared', `${String(ARENAS.length)} found`);

console.log(
  `\nPlayfield ${String(PLAYFIELD_BOUNDS.maxX)} x ${String(PLAYFIELD_BOUNDS.maxY)}, MAX_CARRY_DISTANCE ${MAX_CARRY_DISTANCE.toFixed(2)}\n`,
);

for (const arena of ARENAS) {
  const straightLine = distanceBetweenPoints(arena.spawn, arena.hole);
  const openEdges = (
    [
      ['left', arena.edges.left],
      ['right', arena.edges.right],
      ['top', arena.edges.top],
      ['bottom', arena.edges.bottom],
    ] as readonly (readonly [string, boolean])[]
  )
    .filter(([, walled]) => !walled)
    .map(([name]) => name);

  console.log(
    [
      `Arena ${String(arena.number)}`,
      `par ${String(arena.par)}`,
      `"${arena.lesson}"`,
      `spawn (${String(arena.spawn.x)}, ${String(arena.spawn.y)})`,
      `hole (${String(arena.hole.x)}, ${String(arena.hole.y)})`,
      `straight ${straightLine.toFixed(1)}`,
      `walls ${String(arena.walls.length)}`,
      `obstacles ${String(arena.obstacles.length)}`,
      `open edges [${openEdges.join(', ')}]`,
      `moving obstacle ${arena.movingObstacle === null ? 'none' : 'declared'}`,
    ].join('  |  '),
  );

  for (const [index, rect] of [...arena.walls, ...arena.obstacles].entries()) {
    console.log(
      `        surface ${String(index)}: x [${String(rect.minX)}, ${String(rect.maxX)}] y [${String(rect.minY)}, ${String(rect.maxY)}] shorter side ${String(rectangleShorterSide(rect))}`,
    );
  }
}

console.log('');
report(
  PLAYABLE_ARENA_NUMBERS.join(',') === '1,2',
  'playable Course is Arenas 1 and 2',
  PLAYABLE_ARENA_NUMBERS.join(','),
);
report(nextPlayableArenaNumber(1) === 2, 'Arena 1 advances to Arena 2', '');
report(
  nextPlayableArenaNumber(2) === null,
  'Arena 2 is the last playable Arena',
  String(nextPlayableArenaNumber(2)),
);

// -- 2. a corrupted spawn point raises a named error -------------------------------------------

function expectArenaValidationError(label: string, corrupt: () => void): void {
  try {
    corrupt();
    report(false, label, 'no error raised');
  } catch (thrown: unknown) {
    if (thrown instanceof ArenaValidationError) {
      report(
        true,
        label,
        `${thrown.name} on Arena ${String(thrown.arenaNumber)}: ${thrown.message}`,
      );
    } else {
      report(false, label, `wrong error type: ${String(thrown)}`);
    }
  }
}

const arena2 = getArena(2);

console.log('');

// Spawn point moved on top of the Arena 2 wall.
expectArenaValidationError('corrupted spawn point inside a wall raises a named error', () => {
  const corrupted: ArenaDefinition = { ...arena2, spawn: { x: 485, y: 300 } };
  validateArena(corrupted);
});

// Spawn point moved to within less than BALL_RADIUS of the wall's left face at x=470.
expectArenaValidationError('spawn point under BALL_RADIUS from a wall raises a named error', () => {
  const corrupted: ArenaDefinition = {
    ...arena2,
    spawn: { x: 470 - (BALL_RADIUS - 1), y: 300 },
  };
  validateArena(corrupted);
});

// Spawn point moved outside the Playfield.
expectArenaValidationError('spawn point outside the Playfield raises a named error', () => {
  const corrupted: ArenaDefinition = { ...arena2, spawn: { x: -20, y: 300 } };
  validateArena(corrupted);
});

// Hole moved on top of the wall.
expectArenaValidationError('corrupted Hole position inside a wall raises a named error', () => {
  const corrupted: ArenaDefinition = { ...arena2, hole: { x: 485, y: 300 } };
  validateArena(corrupted);
});

// A wall thinner than MIN_WALL_THICKNESS.
expectArenaValidationError('a wall under MIN_WALL_THICKNESS raises a named error', () => {
  const corrupted: ArenaDefinition = {
    ...arena2,
    walls: [{ minX: 470, minY: 60, maxX: 481, maxY: 600 }],
  };
  validateArena(corrupted);
});

console.log('');
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${String(failures)} CHECK(S) FAILED`);
if (failures > 0) {
  process.exitCode = 1;
}
