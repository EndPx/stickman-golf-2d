// Geometry module - permitted by R2.18 as the Arena_Registry's only import besides the
// Constants_Module.
//
// It declares no physics, world-scale or tuning value, and it imports nothing at all - not the
// Physics_Engine, not the Renderer, not the Constants_Module. That is deliberate: this module is the
// single source of the distance and overlap math that both Arena load-time validation and the
// Physics_Engine consume, so the two cannot disagree about whether a Ball is touching a wall.
//
// Every rectangle here is axis-aligned, which is the only collision primitive the project declares
// (R2.13). Distances use `Math.sqrt`, which IEEE-754 requires to be correctly rounded, rather than
// `Math.hypot`, which is implementation-approximated.

/** A point or a direction in world units. */
export interface Vector2 {
  readonly x: number;
  readonly y: number;
}

/** An axis-aligned rectangle in world units, expressed by its two opposite corners. */
export interface Rectangle {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Horizontal extent in world units. */
export function rectangleWidth(rect: Rectangle): number {
  return rect.maxX - rect.minX;
}

/** Vertical extent in world units. */
export function rectangleHeight(rect: Rectangle): number {
  return rect.maxY - rect.minY;
}

/** The shorter of the two sides, which R2.13 bounds below by `MIN_WALL_THICKNESS`. */
export function rectangleShorterSide(rect: Rectangle): number {
  return Math.min(rectangleWidth(rect), rectangleHeight(rect));
}

/** Straight-line distance between two points, in world units. */
export function distanceBetweenPoints(a: Vector2, b: Vector2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Whether a point lies within a rectangle, counting the boundary as inside.
 *
 * Edge-inclusive to match R6.4, which treats a Ball centre lying exactly on a Playfield edge as
 * inside the Playfield.
 */
export function isPointInsideRectangle(point: Vector2, rect: Rectangle): boolean {
  return (
    point.x >= rect.minX && point.x <= rect.maxX && point.y >= rect.minY && point.y <= rect.maxY
  );
}

/** The point of the rectangle, boundary or interior, nearest to the given point. */
export function clampPointToRectangle(point: Vector2, rect: Rectangle): Vector2 {
  return {
    x: Math.min(Math.max(point.x, rect.minX), rect.maxX),
    y: Math.min(Math.max(point.y, rect.minY), rect.maxY),
  };
}

/**
 * Distance from a point to a rectangle, in world units. Zero when the point is inside or on the
 * boundary.
 *
 * This is the measure R2.15's spawn and Hole clearance validation applies, and the measure R3.8's
 * contact test compares against `BALL_RADIUS`.
 */
export function distanceFromPointToRectangle(point: Vector2, rect: Rectangle): number {
  return distanceBetweenPoints(point, clampPointToRectangle(point, rect));
}

/**
 * How far a circle overlaps a rectangle, in world units. Positive means overlapping, zero or
 * negative means clear.
 *
 * A positive result is exactly the depenetration distance R3.7 asks for, before
 * `MAX_PENETRATION_TOLERANCE` is allowed back.
 *
 * Note the limitation this shares with {@link distanceFromPointToRectangle}: once the circle's
 * centre is inside the rectangle the distance saturates at zero, so the reported overlap saturates
 * at the radius. R3.16's residual-overlap bail-out is what covers that case.
 */
export function circleRectangleOverlap(
  centre: Vector2,
  radius: number,
  rect: Rectangle,
): number {
  return radius - distanceFromPointToRectangle(centre, rect);
}

/**
 * Unit outward normal of the rectangle surface nearest the given point, pointing away from the
 * rectangle and toward the point.
 *
 * When the point lies strictly outside, that is the direction from the nearest boundary point to the
 * point, which is what R3.6 reflects across and R3.7 displaces along.
 *
 * When the point lies inside the rectangle the outward direction is ambiguous, so the axis of least
 * penetration is chosen - the shortest way back out. Ties resolve left, right, down, up in that
 * order, which makes the result deterministic (R3.13) rather than merely reasonable.
 */
export function rectangleOutwardNormal(rect: Rectangle, point: Vector2): Vector2 {
  const nearest = clampPointToRectangle(point, rect);
  const dx = point.x - nearest.x;
  const dy = point.y - nearest.y;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length > 0) {
    return { x: dx / length, y: dy / length };
  }

  const depthToMinX = point.x - rect.minX;
  const depthToMaxX = rect.maxX - point.x;
  const depthToMinY = point.y - rect.minY;
  const depthToMaxY = rect.maxY - point.y;
  const least = Math.min(depthToMinX, depthToMaxX, depthToMinY, depthToMaxY);

  if (least === depthToMinX) {
    return { x: -1, y: 0 };
  }
  if (least === depthToMaxX) {
    return { x: 1, y: 0 };
  }
  if (least === depthToMinY) {
    return { x: 0, y: -1 };
  }
  return { x: 0, y: 1 };
}

/**
 * Shortest distance from a point to a line segment, in world units.
 *
 * R6.1 needs this: Hole capture tests the Hole centre against the path a Ball's centre traced across
 * one Simulation_Step, including any segment that step's reflection introduced, rather than against
 * the step's end position alone. A degenerate segment, both endpoints equal, reduces to the
 * point-to-point distance.
 */
export function distanceFromPointToSegment(point: Vector2, from: Vector2, to: Vector2): number {
  const segmentX = to.x - from.x;
  const segmentY = to.y - from.y;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;

  if (segmentLengthSquared === 0) {
    return distanceBetweenPoints(point, from);
  }

  const offsetX = point.x - from.x;
  const offsetY = point.y - from.y;
  const rawProjection = (offsetX * segmentX + offsetY * segmentY) / segmentLengthSquared;
  const projection = Math.min(Math.max(rawProjection, 0), 1);

  return distanceBetweenPoints(point, {
    x: from.x + projection * segmentX,
    y: from.y + projection * segmentY,
  });
}
