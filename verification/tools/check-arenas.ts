// Task 4 acceptance check, made repeatable - as amended by A-2.
//
// 1. All five Arena definitions load without error - importing the Arena_Registry runs every kept
//    load-time validation, so a clean import is itself the first half of the check.
// 2. Deliberately corrupting a definition raises a named load-time error.
//
// Under A-2 there are no walls and no per-edge flags: an Arena is terrain control points, a tee x,
// a Hole x, derived spawn and Hole positions, and optional rectangle obstacles. The corruptions below
// aim at exactly the validations that survive: R2.15 clearance and Course bounds, R2.13 obstacle
// thickness, and R2.21 terrain coverage and headroom.
//
// Run with `node verification/tools/check-arenas.ts`.

import {
  ARENAS,
  ArenaValidationError,
  PLAYABLE_ARENA_NUMBERS,
  getArena,
  nextPlayableArenaNumber,
  validateArena,
  type ArenaDefinition,
} from '../../shared/arenas.ts';
import {
  MAX_CARRY_DISTANCE,
  MIN_WALL_THICKNESS,
  PLAYFIELD_HEIGHT,
  PLAYFIELD_WIDTH,
} from '../../shared/constants.ts';
import { distanceBetweenPoints } from '../../shared/geometry.ts';

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
  `\nViewport ${String(PLAYFIELD_WIDTH)} x ${String(PLAYFIELD_HEIGHT)}, MAX_CARRY_DISTANCE ${MAX_CARRY_DISTANCE.toFixed(2)}\n`,
);

for (const arena of ARENAS) {
  const straightLine = distanceBetweenPoints(arena.spawn, arena.hole);
  const teeToHole = arena.holeX - arena.teeX;

  console.log(
    [
      `Arena ${String(arena.number)}`,
      `par ${String(arena.par)}`,
      `"${arena.lesson}"`,
      `course ${String(arena.courseWidth)} wide`,
      `tee-to-hole ${String(teeToHole)}`,
      `spawn (${arena.spawn.x.toFixed(1)}, ${arena.spawn.y.toFixed(1)})`,
      `hole (${arena.hole.x.toFixed(1)}, ${arena.hole.y.toFixed(1)})`,
      `straight ${straightLine.toFixed(1)}`,
      `terrain ${arena.terrain.lowestHeight.toFixed(0)}..${arena.terrain.highestHeight.toFixed(0)}`,
      `obstacles ${String(arena.obstacles.length)}`,
      `moving obstacle ${arena.movingObstacle === null ? 'none' : 'declared'}`,
    ].join('  |  '),
  );
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

// -- 2. corrupted definitions raise named errors -----------------------------------------------

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
const arena4 = getArena(4);

console.log('');

// Tee point dragged left of the Course.
expectArenaValidationError('a tee outside the Course raises a named error', () => {
  const corrupted: ArenaDefinition = { ...arena2, spawn: { x: -20, y: arena2.spawn.y } };
  validateArena(corrupted);
});

// The Hole dropped onto Arena 4's free-standing obstacle, clearing it by less than BALL_RADIUS.
const arena4Obstacle = arena4.obstacles[0];
if (arena4Obstacle !== undefined) {
  expectArenaValidationError('a Hole inside an obstacle raises a named error', () => {
    const corrupted: ArenaDefinition = {
      ...arena4,
      hole: {
        x: (arena4Obstacle.minX + arena4Obstacle.maxX) / 2,
        y: (arena4Obstacle.minY + arena4Obstacle.maxY) / 2,
      },
    };
    validateArena(corrupted);
  });
} else {
  report(false, 'Arena 4 declares its approach obstacle', 'not found');
}

// An obstacle thinner than MIN_WALL_THICKNESS.
expectArenaValidationError('an obstacle under MIN_WALL_THICKNESS raises a named error', () => {
  const corrupted: ArenaDefinition = {
    ...arena4,
    obstacles: [{ minX: 1000, minY: 200, maxX: 1000 + MIN_WALL_THICKNESS - 5, maxY: 320 }],
  };
  validateArena(corrupted);
});

// Terrain that stops short of the far end of the Course, so a Ball could run off the ground.
expectArenaValidationError('terrain short of the Course end raises a named error', () => {
  const corrupted: ArenaDefinition = {
    ...arena2,
    terrain: { ...arena2.terrain, maxX: arena2.courseWidth - 100 },
  };
  validateArena(corrupted);
});

// Terrain rising above half the viewport height, leaving too little sky to arc a Shot through.
expectArenaValidationError('terrain above half the viewport height raises a named error', () => {
  const corrupted: ArenaDefinition = {
    ...arena2,
    terrain: { ...arena2.terrain, highestHeight: PLAYFIELD_HEIGHT / 2 + 10 },
  };
  validateArena(corrupted);
});

console.log('');
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${String(failures)} CHECK(S) FAILED`);
if (failures > 0) {
  process.exitCode = 1;
}
