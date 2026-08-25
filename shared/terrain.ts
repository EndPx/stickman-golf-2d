// Terrain - Amendment A-2, R2.21.
//
// The ground is a function of x with no overhang, built by interpolating a sparse list of authored control
// points. That single interpolation is read by the Physics_Engine and by the Renderer alike, so the drawn
// ground and the collided ground cannot diverge - which is the same reason R2.18 makes the geometry module
// the one source of the contact math.
//
// **Monotone cubic Hermite interpolation** (Fritsch-Carlson) rather than Catmull-Rom or a plain spline.
// Three properties matter and only this one has all three: it passes through every control point, so what
// an Arena author writes is what the ball rolls on; it is smooth, so hills read as hills rather than as
// facets; and it **cannot overshoot** between control points, so it can never fold into a vertical face or
// a loop. An overshooting spline would produce ground that is not a function of x, and every contact test
// below assumes it is.
//
// Nothing here imports Three.js or any transport library, and nothing references a browser-only interface.

import type { Vector2 } from './geometry.ts';

/** Raised when a terrain control-point list cannot describe a surface. */
export class TerrainError extends Error {
  public override readonly name = 'TerrainError';
}

/**
 * An interpolated ground surface.
 *
 * `heightAt` and `slopeAt` are evaluated analytically, so the Physics_Engine samples nothing and gains no
 * faceting artefacts. Only the Renderer samples, and only for drawing.
 */
export interface Terrain {
  /** The authored control points, for reference and for redrawing after a data change. */
  readonly controlPoints: readonly Vector2[];
  readonly minX: number;
  readonly maxX: number;
  /** Ground height at a horizontal position. Clamped to the end heights outside the Course. */
  readonly heightAt: (x: number) => number;
  /** Ground gradient dy/dx at a horizontal position. Zero outside the Course. */
  readonly slopeAt: (x: number) => number;
  /**
   * Unit normal of the local tangent line, pointing up out of the ground.
   *
   * This is the normal R3.6 reflects across and R3.7 depenetrates along.
   */
  readonly normalAt: (x: number) => Vector2;
  /** Lowest and highest ground height anywhere on the Course, for camera clamping and validation. */
  readonly lowestHeight: number;
  readonly highestHeight: number;
}

/**
 * Fritsch-Carlson tangents: the step that makes the interpolation monotone between control points and
 * therefore incapable of overshooting into an overhang.
 */
function monotoneTangents(xs: readonly number[], ys: readonly number[]): readonly number[] {
  const count = xs.length;
  const secants: number[] = [];
  for (let index = 0; index < count - 1; index += 1) {
    const dx = (xs[index + 1] ?? 0) - (xs[index] ?? 0);
    secants.push(((ys[index + 1] ?? 0) - (ys[index] ?? 0)) / dx);
  }

  // Start with the average of the neighbouring secants, one-sided at the ends.
  const tangents: number[] = [secants[0] ?? 0];
  for (let index = 1; index < count - 1; index += 1) {
    const previous = secants[index - 1] ?? 0;
    const next = secants[index] ?? 0;
    // A sign change means a local extremum, and the tangent there must be flat or the curve overshoots.
    tangents.push(previous * next <= 0 ? 0 : (previous + next) / 2);
  }
  tangents.push(secants[count - 2] ?? 0);

  // Clamp each tangent into the Fritsch-Carlson monotonicity region.
  for (let index = 0; index < count - 1; index += 1) {
    const secant = secants[index] ?? 0;
    if (secant === 0) {
      tangents[index] = 0;
      tangents[index + 1] = 0;
      continue;
    }
    const alpha = (tangents[index] ?? 0) / secant;
    const beta = (tangents[index + 1] ?? 0) / secant;
    const magnitude = Math.hypot(alpha, beta);
    if (magnitude > 3) {
      const scale = 3 / magnitude;
      tangents[index] = scale * alpha * secant;
      tangents[index + 1] = scale * beta * secant;
    }
  }

  return tangents;
}

/**
 * Builds a Terrain from sparse control points.
 *
 * Control point x values must strictly increase; anything else would not describe a function of x, and the
 * error names that rather than producing quietly broken ground.
 */
export function buildTerrain(controlPoints: readonly Vector2[]): Terrain {
  if (controlPoints.length < 2) {
    throw new TerrainError(
      `terrain needs at least 2 control points, got ${String(controlPoints.length)}`,
    );
  }

  const xs = controlPoints.map((point) => point.x);
  const ys = controlPoints.map((point) => point.y);

  for (let index = 0; index < xs.length - 1; index += 1) {
    if ((xs[index + 1] ?? 0) <= (xs[index] ?? 0)) {
      throw new TerrainError(
        `terrain control point x values must strictly increase; index ${String(index)} is ${String(xs[index])} and index ${String(index + 1)} is ${String(xs[index + 1])}`,
      );
    }
  }

  const tangents = monotoneTangents(xs, ys);
  const minX = xs[0] ?? 0;
  const maxX = xs[xs.length - 1] ?? 0;

  /** The control-point interval containing x, by binary search. */
  function intervalFor(x: number): number {
    let low = 0;
    let high = xs.length - 2;
    while (low < high) {
      const middle = Math.floor((low + high + 1) / 2);
      if ((xs[middle] ?? 0) <= x) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    return low;
  }

  function heightAt(x: number): number {
    if (x <= minX) {
      return ys[0] ?? 0;
    }
    if (x >= maxX) {
      return ys[ys.length - 1] ?? 0;
    }

    const index = intervalFor(x);
    const x0 = xs[index] ?? 0;
    const x1 = xs[index + 1] ?? 0;
    const y0 = ys[index] ?? 0;
    const y1 = ys[index + 1] ?? 0;
    const m0 = tangents[index] ?? 0;
    const m1 = tangents[index + 1] ?? 0;

    const h = x1 - x0;
    const t = (x - x0) / h;
    const t2 = t * t;
    const t3 = t2 * t;

    // Cubic Hermite basis.
    return (
      (2 * t3 - 3 * t2 + 1) * y0 +
      (t3 - 2 * t2 + t) * h * m0 +
      (-2 * t3 + 3 * t2) * y1 +
      (t3 - t2) * h * m1
    );
  }

  function slopeAt(x: number): number {
    // Flat beyond the Course ends, matching `heightAt`'s clamp. A Ball out there is already out of bounds.
    if (x <= minX || x >= maxX) {
      return 0;
    }

    const index = intervalFor(x);
    const x0 = xs[index] ?? 0;
    const x1 = xs[index + 1] ?? 0;
    const y0 = ys[index] ?? 0;
    const y1 = ys[index + 1] ?? 0;
    const m0 = tangents[index] ?? 0;
    const m1 = tangents[index + 1] ?? 0;

    const h = x1 - x0;
    const t = (x - x0) / h;
    const t2 = t * t;

    // Derivative of the cubic Hermite basis with respect to x.
    return (
      ((6 * t2 - 6 * t) * y0) / h +
      (3 * t2 - 4 * t + 1) * m0 +
      ((-6 * t2 + 6 * t) * y1) / h +
      (3 * t2 - 2 * t) * m1
    );
  }

  function normalAt(x: number): Vector2 {
    const slope = slopeAt(x);
    // The upward unit normal of the line with gradient `slope`.
    const length = Math.sqrt(1 + slope * slope);
    return { x: -slope / length, y: 1 / length };
  }

  // Extremes, sampled densely enough to catch a hill crest between control points. Used for camera
  // clamping and for the load-time checks that keep terrain inside the viewport's vertical range.
  let lowestHeight = Number.POSITIVE_INFINITY;
  let highestHeight = Number.NEGATIVE_INFINITY;
  const extremeSamples = 512;
  for (let index = 0; index <= extremeSamples; index += 1) {
    const height = heightAt(minX + ((maxX - minX) * index) / extremeSamples);
    lowestHeight = Math.min(lowestHeight, height);
    highestHeight = Math.max(highestHeight, height);
  }

  return {
    controlPoints,
    minX,
    maxX,
    heightAt,
    slopeAt,
    normalAt,
    lowestHeight,
    highestHeight,
  };
}

/**
 * Samples the terrain into a dense point list, for drawing only.
 *
 * The Physics_Engine never calls this. R4.36's spacing is a rendering quantity, and keeping the sampling on
 * the Renderer's side of the boundary is what stops a resolution change from altering physics.
 */
export function sampleTerrain(terrain: Terrain, spacing: number): readonly Vector2[] {
  const points: Vector2[] = [];
  const span = terrain.maxX - terrain.minX;
  const steps = Math.max(1, Math.ceil(span / spacing));
  for (let index = 0; index <= steps; index += 1) {
    const x = terrain.minX + (span * index) / steps;
    points.push({ x, y: terrain.heightAt(x) });
  }
  return points;
}

/**
 * Signed distance from a Ball centre to the terrain's local tangent line at that Ball's x.
 *
 * Positive above the ground, negative below. This is the quantity R3.8 compares against `BALL_RADIUS`, and
 * A-2 records why it is the tangent line rather than the true circle-to-curve distance: it is exact on flat
 * ground, cheap, and departs from the true distance only where curvature is high relative to `BALL_RADIUS`,
 * which the authored control-point spacing keeps the terrain away from.
 */
export function signedDistanceToTerrain(terrain: Terrain, centre: Vector2): number {
  const groundHeight = terrain.heightAt(centre.x);
  const slope = terrain.slopeAt(centre.x);
  return (centre.y - groundHeight) / Math.sqrt(1 + slope * slope);
}

/** The Ball centre position that rests exactly on the terrain at a given x. */
export function restingCentreAt(terrain: Terrain, x: number, ballRadius: number): Vector2 {
  const slope = terrain.slopeAt(x);
  const length = Math.sqrt(1 + slope * slope);
  // Offset along the upward normal, so a Ball on a slope sits on the surface rather than above it in y.
  return {
    x: x - (slope / length) * ballRadius,
    y: terrain.heightAt(x) + ballRadius / length,
  };
}
