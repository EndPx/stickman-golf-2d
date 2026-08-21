// Arena_Registry - Requirement 2.
//
// All five Arenas are declared here as data from this increment onward (R2.2), whether or not they
// are playable. Only Arenas 1 and 2 are playable in the delivered scope; Arenas 3, 4 and 5 are
// descoped but still declared, so the registry shape and the load-time validations are exercised over
// the full set.
//
// This module declares Arena data and load-time validation only, and imports exactly the two modules
// R2.18 permits: the Constants_Module and the geometry module. It declares no physics, world-scale or
// tuning value of its own (R2.16) - Arena difficulty is expressed purely through geometry.
//
// R2.5: adding or retuning an Arena requires a change to this file and to no other.

import {
  BALL_RADIUS,
  MIN_WALL_THICKNESS,
  PLAYFIELD_HEIGHT,
  PLAYFIELD_WIDTH,
} from './constants.ts';
import {
  distanceFromPointToRectangle,
  isPointInsideRectangle,
  rectangleShorterSide,
  type Rectangle,
  type Vector2,
} from './geometry.ts';

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

/** The five declared Arena numbers. */
export type ArenaNumber = 1 | 2 | 3 | 4 | 5;

/**
 * R2.1 - per-edge flag stating whether each of the four Playfield edges is walled or open.
 *
 * `true` means walled, so the Physics_Engine reflects off it (R6.7). `false` means open, so a Ball
 * whose centre crosses it is out of bounds with no reflection (R6.8).
 */
export interface PlayfieldEdgeWalls {
  readonly left: boolean;
  readonly right: boolean;
  readonly top: boolean;
  readonly bottom: boolean;
}

/**
 * R2.11 - a Moving_Obstacle: an axis-aligned rectangle of the given extent whose centre travels the
 * straight segment from `pathStart` to `pathEnd`.
 *
 * Declared as data only. The Moving_Obstacle is descoped, so nothing advances it, nothing collides
 * with it, nothing draws it and nothing validates it.
 */
export interface MovingObstacleDeclaration {
  readonly width: number;
  readonly height: number;
  readonly pathStart: Vector2;
  readonly pathEnd: Vector2;
}

/** One Arena, entirely as data. */
export interface ArenaDefinition {
  readonly number: ArenaNumber;
  /** R2.6 - Par for this Arena. Excluded from every Stroke count and every total (R13.12). */
  readonly par: number;
  /** R2.12 - the one new mechanical idea this Arena introduces. Documentation, not behaviour. */
  readonly lesson: string;
  readonly spawn: Vector2;
  readonly hole: Vector2;
  readonly walls: readonly Rectangle[];
  readonly obstacles: readonly Rectangle[];
  readonly edges: PlayfieldEdgeWalls;
  readonly movingObstacle: MovingObstacleDeclaration | null;
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
// Playfield
// ---------------------------------------------------------------------------------------------

/**
 * The Playfield rectangle, anchored at the coordinate origin. Width and height come from the
 * Constants_Module (R4.1); the origin is the definition of the coordinate system rather than a
 * world-scale value, so it is not a Constants_Module concern.
 *
 * The Physics_Engine takes the Playfield bounds and every edge wall flag from this registry (R3.4).
 */
export const PLAYFIELD_BOUNDS: Rectangle = {
  minX: 0,
  minY: 0,
  maxX: PLAYFIELD_WIDTH,
  maxY: PLAYFIELD_HEIGHT,
};

const ALL_EDGES_WALLED: PlayfieldEdgeWalls = {
  left: true,
  right: true,
  top: true,
  bottom: true,
};

// ---------------------------------------------------------------------------------------------
// The five Arenas
// ---------------------------------------------------------------------------------------------

/**
 * Arena 1 - aiming and power. R2.7: open ground, no interior wall, no obstacle, and an unobstructed
 * straight line from the spawn point to the Hole. Every Playfield edge walled.
 *
 * 500 world units of separation against a derived `MAX_CARRY_DISTANCE` near 870, so the Hole is
 * comfortably in range. Capture needs the Ball to still be under `HOLE_CAPTURE_MAX_SPEED` when it
 * crosses the Hole, which puts an upper bound on power as well as a lower one - the Arena's whole
 * lesson.
 */
const ARENA_1: ArenaDefinition = {
  number: 1,
  par: 2,
  lesson: 'aiming and power',
  spawn: { x: 200, y: 300 },
  hole: { x: 700, y: 300 },
  walls: [],
  obstacles: [],
  edges: ALL_EDGES_WALLED,
  movingObstacle: null,
};

/**
 * Arena 2 - bank shots, and the one Arena carrying an open Playfield edge (R2.19, D-18).
 *
 * The wall hangs from the top edge down to y=60, leaving a 60-unit gap along the bottom. R2.8: it
 * intersects the straight line between the spawn point and the Hole, which both sit at y=100, so a
 * flat shot strikes the wall's left face. Nothing passes above the wall because it meets the top
 * edge, so the bottom gap is the only way through, and reaching the Hole from there needs a
 * reflection off the bottom edge.
 *
 * The **right edge is open**. That is what makes `OUT_OF_BOUNDS` reachable through play at all in the
 * delivered scope: Arena 1 is fully walled and Arenas 3, 4 and 5 are descoped, so with every edge
 * walled the frozen Status_Token value would have gone dead. It also fits the Arena's lesson rather
 * than fighting it - the punishment for over-hitting a bank shot is losing the Ball off the far side.
 */
const ARENA_2: ArenaDefinition = {
  number: 2,
  par: 3,
  lesson: 'bank shots',
  spawn: { x: 200, y: 100 },
  hole: { x: 760, y: 100 },
  walls: [{ minX: 470, minY: 60, maxX: 500, maxY: PLAYFIELD_HEIGHT }],
  obstacles: [],
  edges: { left: true, right: false, top: true, bottom: true },
  movingObstacle: null,
};

/**
 * Arena 3 - precision. **Descoped**: declared as data, not playable, no Verification_Flow.
 *
 * Two wall slabs leave a 60-unit corridor at mid-height, above `MIN_CORRIDOR_WIDTH`. Both slabs run
 * to a Playfield edge, so the corridor cannot be bypassed. R2.17's corridor clear-width validation is
 * descoped, so nothing checks that width mechanically.
 */
const ARENA_3: ArenaDefinition = {
  number: 3,
  par: 3,
  lesson: 'precision over power',
  spawn: { x: 120, y: 300 },
  hole: { x: 880, y: 300 },
  walls: [
    { minX: 400, minY: 0, maxX: 600, maxY: 270 },
    { minX: 400, minY: 330, maxX: 600, maxY: PLAYFIELD_HEIGHT },
  ],
  obstacles: [],
  edges: ALL_EDGES_WALLED,
  movingObstacle: null,
};

/**
 * Arena 4 - approach angle. **Descoped**: declared as data, not playable, no Verification_Flow.
 *
 * A free-standing obstacle sits across the straight line from the spawn point to the Hole, so the
 * Hole has to be approached from the side rather than head on.
 */
const ARENA_4: ArenaDefinition = {
  number: 4,
  par: 4,
  lesson: 'approach angle',
  spawn: { x: 150, y: 480 },
  hole: { x: 820, y: 150 },
  walls: [],
  obstacles: [{ minX: 600, minY: 80, maxX: 700, maxY: 300 }],
  edges: ALL_EDGES_WALLED,
  movingObstacle: null,
};

/**
 * Arena 5 - timing. **Descoped**: declared as data, not playable, no Verification_Flow.
 *
 * Exactly one Moving_Obstacle, its path a straight vertical segment parallel to the left and right
 * Playfield edges, both endpoints placed so the obstacle lies entirely inside the Playfield along the
 * whole path. Nothing advances it, nothing collides with it and nothing draws it.
 */
const ARENA_5: ArenaDefinition = {
  number: 5,
  par: 4,
  lesson: 'timing',
  spawn: { x: 150, y: 300 },
  hole: { x: 850, y: 300 },
  walls: [],
  obstacles: [],
  edges: ALL_EDGES_WALLED,
  movingObstacle: {
    width: 40,
    height: 160,
    pathStart: { x: 500, y: 120 },
    pathEnd: { x: 500, y: 480 },
  },
};

/** R2.2 - all five Arenas, in Course order. */
export const ARENAS: readonly ArenaDefinition[] = [ARENA_1, ARENA_2, ARENA_3, ARENA_4, ARENA_5];

/**
 * The Arenas that are playable in the delivered scope, in Course order.
 *
 * Arenas 3, 4 and 5 are descoped. This is the set R1.26's start-arena selector falls back out of, and
 * the set the Course of R1.6 and R1.8 runs over.
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
// Only the two validations tasks.md keeps are implemented. R2.14's reachability check needs a
// shortest-obstacle-free-path computation rather than a distance comparison and is descoped, moving
// to a recorded hand-check for Arenas 1 and 2. R2.17's corridor clear width and R2.20's
// Moving_Obstacle Hole clearance are descoped with Arenas 3 and 5.
// ---------------------------------------------------------------------------------------------

const R2_13 = 'R2.13 every wall and obstacle has a shorter side of at least MIN_WALL_THICKNESS';
const R2_15 =
  'R2.15 the spawn point and the Hole lie inside the Playfield with at least BALL_RADIUS clearance from every wall and every static obstacle';

function validateRectangleThickness(
  arena: ArenaDefinition,
  rect: Rectangle,
  kind: string,
  index: number,
): void {
  const shorterSide = rectangleShorterSide(rect);
  if (shorterSide < MIN_WALL_THICKNESS) {
    throw new ArenaValidationError(
      arena.number,
      R2_13,
      `${kind} at index ${String(index)} has a shorter side of ${String(shorterSide)} world units, below MIN_WALL_THICKNESS of ${String(MIN_WALL_THICKNESS)}.`,
    );
  }
}

function validatePointClearance(
  arena: ArenaDefinition,
  point: Vector2,
  pointName: string,
): void {
  if (!isPointInsideRectangle(point, PLAYFIELD_BOUNDS)) {
    throw new ArenaValidationError(
      arena.number,
      R2_15,
      `the ${pointName} at (${String(point.x)}, ${String(point.y)}) lies outside the Playfield.`,
    );
  }

  const clearanceFromBoundary = Math.min(
    point.x - PLAYFIELD_BOUNDS.minX,
    PLAYFIELD_BOUNDS.maxX - point.x,
    point.y - PLAYFIELD_BOUNDS.minY,
    PLAYFIELD_BOUNDS.maxY - point.y,
  );
  if (clearanceFromBoundary < BALL_RADIUS) {
    throw new ArenaValidationError(
      arena.number,
      R2_15,
      `the ${pointName} at (${String(point.x)}, ${String(point.y)}) clears the Playfield boundary by ${String(clearanceFromBoundary)} world units, below BALL_RADIUS of ${String(BALL_RADIUS)}.`,
    );
  }

  const surfaces: readonly { readonly kind: string; readonly rect: Rectangle }[] = [
    ...arena.walls.map((rect) => ({ kind: 'wall', rect })),
    ...arena.obstacles.map((rect) => ({ kind: 'obstacle', rect })),
  ];

  for (const [index, surface] of surfaces.entries()) {
    const clearance = distanceFromPointToRectangle(point, surface.rect);
    if (clearance < BALL_RADIUS) {
      throw new ArenaValidationError(
        arena.number,
        R2_15,
        `the ${pointName} at (${String(point.x)}, ${String(point.y)}) clears ${surface.kind} at index ${String(index)} by ${String(clearance)} world units, below BALL_RADIUS of ${String(BALL_RADIUS)}.`,
      );
    }
  }
}

/**
 * Runs every kept load-time validation against one Arena, raising an {@link ArenaValidationError}
 * naming the failing Arena and the failed validation on the first failure.
 *
 * Exported so the same checks can be run against a deliberately corrupted definition without
 * reloading the module.
 */
export function validateArena(arena: ArenaDefinition): void {
  for (const [index, wall] of arena.walls.entries()) {
    validateRectangleThickness(arena, wall, 'wall', index);
  }
  for (const [index, obstacle] of arena.obstacles.entries()) {
    validateRectangleThickness(arena, obstacle, 'obstacle', index);
  }

  validatePointClearance(arena, arena.spawn, 'spawn point');
  validatePointClearance(arena, arena.hole, 'Hole position');
}

/**
 * Declaration invariants: cheap consistency checks on what the registry itself states, kept separate
 * from the two R2 validations above because they guard the declarations rather than the layout.
 *
 * R2.19 is the load-bearing one. D-18 moved the single open Playfield edge from Arena 4 to Arena 2,
 * and if a later edit walled Arena 2's right edge, `OUT_OF_BOUNDS` would silently become unreachable
 * and task 13's acceptance condition would fail for a reason nothing else would explain.
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

  for (const arena of ARENAS) {
    const openEdgeCount = [
      arena.edges.left,
      arena.edges.right,
      arena.edges.top,
      arena.edges.bottom,
    ].filter((walled) => !walled).length;
    const expectedOpenEdgeCount = arena.number === 2 ? 1 : 0;

    if (openEdgeCount !== expectedOpenEdgeCount) {
      throw new ArenaValidationError(
        arena.number,
        'R2.19 exactly one Playfield edge of Arena 2 is open and every edge of every other Arena is walled',
        `${String(openEdgeCount)} edges are declared open where ${String(expectedOpenEdgeCount)} is required.`,
      );
    }
  }
}

// R2.15 - validation runs at module load, before any Arena is rendered and before any Shot is
// simulated. Importing this module is therefore the whole gate; nothing has to remember to call it.
validateRegistryDeclarations();
for (const arena of ARENAS) {
  validateArena(arena);
}
