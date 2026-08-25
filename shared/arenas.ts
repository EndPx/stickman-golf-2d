// Arena_Registry - Requirement 2, as amended by A-2.
//
// A Course is terrain, not a walled rectangle. Each Arena declares its Course width, a sparse list of
// terrain control points, a tee x and a Hole x; the tee and Hole **y values are derived from the terrain**,
// so neither can be authored floating in the air or buried underground (R2.1).
//
// All five Arenas are declared from this increment onward (R2.2), whether or not they are playable. Only
// Arenas 1 and 2 are playable in the delivered scope; Arenas 3, 4 and 5 are descoped but still declared, so
// the registry shape and the load-time validations are exercised over the full set.
//
// This module declares Arena data and load-time validation only, and imports exactly what R2.18 permits plus
// the terrain module A-2 adds. It declares no physics, world-scale or tuning value of its own (R2.16) - Arena
// difficulty is expressed purely through terrain shape and Hole placement.
//
// R2.5: adding or retuning an Arena requires a change to this file and to no other.

import { BALL_RADIUS, MIN_WALL_THICKNESS, PLAYFIELD_HEIGHT } from './constants.ts';
import {
  distanceFromPointToRectangle,
  rectangleShorterSide,
  type Rectangle,
  type Vector2,
} from './geometry.ts';
import { buildTerrain, restingCentreAt, type Terrain } from './terrain.ts';

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

/** The five declared Arena numbers. */
export type ArenaNumber = 1 | 2 | 3 | 4 | 5;

/**
 * R2.11 - a Moving_Obstacle: an axis-aligned rectangle of the given extent whose centre travels the straight
 * segment from `pathStart` to `pathEnd`.
 *
 * Declared as data only. The Moving_Obstacle is descoped, so nothing advances it, nothing collides with it,
 * nothing draws it and nothing validates it.
 */
export interface MovingObstacleDeclaration {
  readonly width: number;
  readonly height: number;
  readonly pathStart: Vector2;
  readonly pathEnd: Vector2;
}

/** What an Arena author writes. */
interface ArenaSource {
  readonly number: ArenaNumber;
  /** R2.6 - Par for this Arena. Excluded from every Stroke count and every total (R13.12). */
  readonly par: number;
  /** R2.12 - the one new mechanical idea this Arena introduces. Documentation, not behaviour. */
  readonly lesson: string;
  /** R2.1 - the Course width in world units. Wider than the viewport, so the camera pans (R14.3). */
  readonly courseWidth: number;
  /** R2.1, R2.21 - sparse terrain control points with strictly increasing x. */
  readonly terrainControlPoints: readonly Vector2[];
  /** R2.1 - the tee's horizontal position. Its height comes from the terrain. */
  readonly teeX: number;
  /** R2.1 - the Hole's horizontal position. Its height comes from the terrain. */
  readonly holeX: number;
  /** Free-standing axis-aligned obstacles. Empty for every Arena in the delivered scope. */
  readonly obstacles: readonly Rectangle[];
  readonly movingObstacle: MovingObstacleDeclaration | null;
}

/** One Arena, with everything the terrain implies already derived. */
export interface ArenaDefinition extends ArenaSource {
  readonly terrain: Terrain;
  /** R2.1 - the Ball centre resting on the terrain at the tee, derived rather than declared. */
  readonly spawn: Vector2;
  /** R2.1 - the Hole, sitting on the terrain surface, derived rather than declared. */
  readonly hole: Vector2;
}

/** Raised at load time when an Arena fails a declared validation. Names the Arena and the check. */
export class ArenaValidationError extends Error {
  public override readonly name = 'ArenaValidationError';
  public readonly arenaNumber: number;
  public readonly validation: string;

  public constructor(arenaNumber: number, validation: string, detail: string) {
    super(`Arena ${String(arenaNumber)} failed validation "${validation}": ${detail}`);
    this.arenaNumber = arenaNumber;
    this.validation = validation;
  }
}

// ---------------------------------------------------------------------------------------------
// The five Arenas
// ---------------------------------------------------------------------------------------------

/**
 * Arena 1 - aiming and power.
 *
 * Gently rolling ground falling away from the tee, with the Hole sitting in a shallow bowl about 1000 world
 * units out. A full-power Shot carries roughly 1289 units, so the Hole is comfortably in range of one big
 * Shot and the bowl gathers a Ball that lands near it - which is what makes Par 2 honest rather than
 * generous. The lesson is entirely in choosing a power: too little falls short of the bowl, too much runs
 * through it and up the far bank.
 */
const ARENA_1: ArenaSource = {
  number: 1,
  par: 2,
  lesson: 'aiming and power',
  courseWidth: 1600,
  teeX: 150,
  holeX: 1150,
  terrainControlPoints: [
    { x: 0, y: 210 },
    { x: 150, y: 205 },
    { x: 420, y: 245 },
    { x: 700, y: 215 },
    { x: 950, y: 190 },
    { x: 1050, y: 170 },
    { x: 1150, y: 110 },
    { x: 1280, y: 175 },
    { x: 1450, y: 220 },
    { x: 1600, y: 240 },
  ],
  obstacles: [],
  movingObstacle: null,
};

/**
 * Arena 2 - carrying a rise.
 *
 * A hill crest stands between the tee and the Hole, climbing out of a shallow dip to about 105 world units
 * above the tee line across the 500 that lead up to it. A Shot that is too flat or too weak strikes the face
 * and stops short; clearing the crest needs both height and power, and the Hole then sits in a bowl on the
 * far side, 1200 units from the tee.
 *
 * R2.21 caps the terrain at half the viewport height, so the crest tops out at 295 rather than the taller
 * ridge the first sketch used: the climb is read relative to the dip in front of it, which keeps the lesson
 * while leaving room above the ground for the arc that clears it.
 *
 * This replaces the wall-and-bank-shot lesson the top-down build used. R2.8's requirement that the Hole not
 * be reachable in a straight line is satisfied by the terrain itself rather than by an interior wall.
 */
const ARENA_2: ArenaSource = {
  number: 2,
  par: 3,
  lesson: 'carrying a rise',
  courseWidth: 1800,
  teeX: 150,
  holeX: 1350,
  terrainControlPoints: [
    { x: 0, y: 185 },
    { x: 200, y: 190 },
    { x: 500, y: 240 },
    { x: 700, y: 295 },
    { x: 900, y: 268 },
    { x: 1100, y: 225 },
    { x: 1250, y: 195 },
    { x: 1350, y: 140 },
    { x: 1470, y: 210 },
    { x: 1650, y: 248 },
    { x: 1800, y: 262 },
  ],
  obstacles: [],
  movingObstacle: null,
};

/**
 * Arena 3 - precision. **Descoped**: declared as data, not playable, no Verification_Flow.
 *
 * A narrow plateau with steep drops either side, so the Hole has to be landed on rather than rolled to.
 */
const ARENA_3: ArenaSource = {
  number: 3,
  par: 3,
  lesson: 'precision over power',
  courseWidth: 1700,
  teeX: 140,
  holeX: 1200,
  terrainControlPoints: [
    { x: 0, y: 200 },
    { x: 200, y: 195 },
    { x: 600, y: 170 },
    { x: 820, y: 90 },
    { x: 1000, y: 80 },
    { x: 1080, y: 288 },
    { x: 1200, y: 295 },
    { x: 1320, y: 288 },
    { x: 1420, y: 100 },
    { x: 1700, y: 120 },
  ],
  obstacles: [],
  movingObstacle: null,
};

/**
 * Arena 4 - approach angle. **Descoped**: declared as data, not playable, no Verification_Flow.
 *
 * A free-standing obstacle stands over the Hole, so it has to be approached from the side rather than head on.
 * The obstacle keeps the rectangle treatment R3.6 through R3.8 already declared.
 */
const ARENA_4: ArenaSource = {
  number: 4,
  par: 4,
  lesson: 'approach angle',
  courseWidth: 1900,
  teeX: 150,
  holeX: 1400,
  terrainControlPoints: [
    { x: 0, y: 230 },
    { x: 250, y: 240 },
    { x: 650, y: 292 },
    { x: 1000, y: 260 },
    { x: 1300, y: 200 },
    { x: 1400, y: 160 },
    { x: 1520, y: 215 },
    { x: 1700, y: 250 },
    { x: 1900, y: 260 },
  ],
  obstacles: [{ minX: 1240, minY: 320, maxX: 1340, maxY: 460 }],
  movingObstacle: null,
};

/**
 * Arena 5 - timing. **Descoped**: declared as data, not playable, no Verification_Flow.
 *
 * Exactly one Moving_Obstacle, its path a straight vertical segment. Nothing advances it, nothing collides
 * with it and nothing draws it.
 */
const ARENA_5: ArenaSource = {
  number: 5,
  par: 4,
  lesson: 'timing',
  courseWidth: 2000,
  teeX: 160,
  holeX: 1500,
  terrainControlPoints: [
    { x: 0, y: 220 },
    { x: 300, y: 230 },
    { x: 700, y: 210 },
    { x: 1100, y: 240 },
    { x: 1400, y: 195 },
    { x: 1500, y: 150 },
    { x: 1620, y: 205 },
    { x: 1800, y: 235 },
    { x: 2000, y: 245 },
  ],
  obstacles: [],
  movingObstacle: {
    width: 40,
    height: 160,
    pathStart: { x: 900, y: 320 },
    pathEnd: { x: 900, y: 560 },
  },
};

/** Derives the terrain, the spawn and the Hole from an authored Arena. */
function buildArena(source: ArenaSource): ArenaDefinition {
  const terrain = buildTerrain(source.terrainControlPoints);
  return {
    ...source,
    terrain,
    // R2.1 - the Ball rests on the surface at the tee, offset along the terrain normal so it sits on a slope
    // correctly rather than merely above it in y.
    spawn: restingCentreAt(terrain, source.teeX, BALL_RADIUS),
    // The Hole is a point on the surface itself.
    hole: { x: source.holeX, y: terrain.heightAt(source.holeX) },
  };
}

/** R2.2 - all five Arenas, in Course order. */
export const ARENAS: readonly ArenaDefinition[] = [
  ARENA_1,
  ARENA_2,
  ARENA_3,
  ARENA_4,
  ARENA_5,
].map(buildArena);

/**
 * The Arenas that are playable in the delivered scope, in Course order.
 *
 * Arenas 3, 4 and 5 are descoped. This is the set R1.26's start-arena selector falls back out of, and the set
 * the Course of R1.6 and R1.8 runs over.
 */
export const PLAYABLE_ARENA_NUMBERS: readonly ArenaNumber[] = [1, 2];

// ---------------------------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------------------------

/** Whether a number is one of the five declared Arena numbers. */
export function isArenaNumber(value: number): value is ArenaNumber {
  return ARENAS.some((arena) => arena.number === value);
}

/** Whether a number names an Arena that is playable in the delivered scope. */
export function isPlayableArenaNumber(value: number): value is ArenaNumber {
  return PLAYABLE_ARENA_NUMBERS.some((arenaNumber) => arenaNumber === value);
}

/** The declared definition of one Arena. */
export function getArena(arenaNumber: ArenaNumber): ArenaDefinition {
  const arena = ARENAS.find((candidate) => candidate.number === arenaNumber);
  if (arena === undefined) {
    throw new ArenaValidationError(
      arenaNumber,
      'R2.2 every Arena number 1 through 5 is declared',
      'no declared Arena carries that number.',
    );
  }
  return arena;
}

/** The next Arena in the playable Course, or `null` when the given Arena is the last one. */
export function nextPlayableArenaNumber(arenaNumber: ArenaNumber): ArenaNumber | null {
  const position = PLAYABLE_ARENA_NUMBERS.indexOf(arenaNumber);
  if (position < 0) {
    return null;
  }
  return PLAYABLE_ARENA_NUMBERS[position + 1] ?? null;
}

// ---------------------------------------------------------------------------------------------
// Load-time validation
//
// Only the validations tasks.md keeps, as amended by A-2. R2.14's reachability check needs a trajectory
// search rather than a distance comparison and is descoped, moving to a recorded hand-check for Arenas 1 and
// 2. R2.17's corridor clear width and R2.20's Moving_Obstacle Hole clearance are descoped with Arenas 3 and 5.
// ---------------------------------------------------------------------------------------------

const R2_13 = 'R2.13 every obstacle has a shorter side of at least MIN_WALL_THICKNESS';
const R2_15 =
  'R2.15 the tee and the Hole lie within the Course and clear every obstacle by at least BALL_RADIUS';
const R2_21 = 'R2.21 the terrain spans the whole Course and stays within the viewport height';

function validatePointClearance(
  arena: ArenaDefinition,
  point: Vector2,
  pointName: string,
): void {
  if (point.x < 0 || point.x > arena.courseWidth) {
    throw new ArenaValidationError(
      arena.number,
      R2_15,
      `the ${pointName} at x ${String(point.x)} lies outside the Course, which spans 0 to ${String(arena.courseWidth)}.`,
    );
  }

  for (const [index, obstacle] of arena.obstacles.entries()) {
    const clearance = distanceFromPointToRectangle(point, obstacle);
    if (clearance < BALL_RADIUS) {
      throw new ArenaValidationError(
        arena.number,
        R2_15,
        `the ${pointName} at (${point.x.toFixed(1)}, ${point.y.toFixed(1)}) clears obstacle ${String(index)} by ${clearance.toFixed(2)} world units, below BALL_RADIUS of ${String(BALL_RADIUS)}.`,
      );
    }
  }
}

/**
 * Runs every kept load-time validation against one Arena, raising an {@link ArenaValidationError} naming the
 * failing Arena and the failed validation on the first failure.
 *
 * Exported so the same checks can be run against a deliberately corrupted definition without reloading.
 */
export function validateArena(arena: ArenaDefinition): void {
  for (const [index, obstacle] of arena.obstacles.entries()) {
    const shorterSide = rectangleShorterSide(obstacle);
    if (shorterSide < MIN_WALL_THICKNESS) {
      throw new ArenaValidationError(
        arena.number,
        R2_13,
        `obstacle at index ${String(index)} has a shorter side of ${String(shorterSide)} world units, below MIN_WALL_THICKNESS of ${String(MIN_WALL_THICKNESS)}.`,
      );
    }
  }

  // R2.21 - the terrain must cover the whole Course, or a Ball could run off the end of the ground while
  // still inside the Course and fall for ever.
  if (arena.terrain.minX > 0 || arena.terrain.maxX < arena.courseWidth) {
    throw new ArenaValidationError(
      arena.number,
      R2_21,
      `the terrain spans x ${String(arena.terrain.minX)} to ${String(arena.terrain.maxX)}, which does not cover the Course from 0 to ${String(arena.courseWidth)}.`,
    );
  }

  // The ground has to leave room above it for a Shot to arc through, and must not sit below the world floor.
  if (arena.terrain.lowestHeight < 0) {
    throw new ArenaValidationError(
      arena.number,
      R2_21,
      `the terrain falls to ${arena.terrain.lowestHeight.toFixed(1)}, below the world floor at 0.`,
    );
  }
  if (arena.terrain.highestHeight > PLAYFIELD_HEIGHT / 2) {
    throw new ArenaValidationError(
      arena.number,
      R2_21,
      `the terrain rises to ${arena.terrain.highestHeight.toFixed(1)}, above half the viewport height of ${String(PLAYFIELD_HEIGHT)}, leaving too little room above it to arc a Shot.`,
    );
  }

  validatePointClearance(arena, arena.spawn, 'tee');
  validatePointClearance(arena, arena.hole, 'Hole position');
}

/**
 * Declaration invariants: cheap consistency checks on what the registry itself states, kept separate from the
 * R2 validations above because they guard the declarations rather than the terrain.
 */
function validateRegistryDeclarations(): void {
  const declaredParByArena: readonly (readonly [ArenaNumber, number])[] = [
    [1, 2],
    [2, 3],
    [3, 3],
    [4, 4],
    [5, 4],
  ];

  for (const [arenaNumber, expectedPar] of declaredParByArena) {
    const arena = getArena(arenaNumber);
    if (arena.par !== expectedPar) {
      throw new ArenaValidationError(
        arenaNumber,
        'R2.6 the declared Par values are 2, 3, 3, 4, 4',
        `Par is declared as ${String(arena.par)} but R2.6 requires ${String(expectedPar)}.`,
      );
    }
  }

  // A Course narrower than the viewport would make the panning camera pointless, and A-2's whole premise is
  // that a hole is longer than one screen.
  for (const arena of ARENAS) {
    if (arena.courseWidth <= PLAYFIELD_HEIGHT) {
      throw new ArenaValidationError(
        arena.number,
        'R2.1 the Course is wider than the viewport',
        `the Course is ${String(arena.courseWidth)} world units wide.`,
      );
    }
    if (arena.holeX <= arena.teeX) {
      throw new ArenaValidationError(
        arena.number,
        'R2.1 the Hole lies downcourse of the tee',
        `the tee is at x ${String(arena.teeX)} and the Hole at x ${String(arena.holeX)}.`,
      );
    }
  }
}

// R2.15 - validation runs at module load, before any Arena is rendered and before any Shot is simulated.
// Importing this module is therefore the whole gate; nothing has to remember to call it.
validateRegistryDeclarations();
for (const arena of ARENAS) {
  validateArena(arena);
}
