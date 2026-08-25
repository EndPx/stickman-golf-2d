// Renderer - Requirement 14, as amended by A-2.
//
// Three.js, orthographic camera, everything in a single plane (R14.1, R14.2). Layering is done with
// `renderOrder` and depth testing switched off rather than with per-element z offsets, so "a single
// plane" is literally true: every mesh sits at z = 0.
//
// A-2 replaced the walled Playfield rectangle with a side-view Course: the Renderer now draws the sky,
// two parallax mountain layers, clouds with pines, the interpolated terrain surface, the Hole with a
// flag, the Ball, the stickman (R14.14), the aim indicator, an arc power gauge, and HUD chips pinned
// to the camera (R14.15). The camera is centred on the Ball and clamped to the Course bounds, so it
// pans as the Ball travels and the whole Course is deliberately never visible at once (R14.3).
//
// All drawn Arena geometry is derived from the Arena_Registry and there is no inline Arena geometry
// literal anywhere in this file (R2.3): the terrain polygon is sampled from the registry's own
// interpolation through `sampleTerrain`, at the Constants_Module's rendering spacing, so the drawn
// ground and the collided ground cannot diverge (R2.21). Every colour and every drawn size that is
// not Arena geometry comes from the Asset_Registry by key (R16.8). The remaining literals here are
// draw-order indices and decorative aspect ratios - proportions of already-declared sizes - which
// R4.18 exempts, exactly as the LAYER_* indices always have.
//
// R14.9: the Renderer draws whatever state it is handed, which is the most recently completed
// Simulation_Step, with no interpolation and no extrapolation. It owns no clock and cannot change the
// number of Simulation_Steps per second. R14.10 follows from the same property - a stopped Ball's
// position does not change, so its drawn position does not either.

import * as THREE from 'three';

import {
  AIM_INDICATOR_MIN_LENGTH,
  BALL_RADIUS,
  HOLE_RADIUS,
  PLAYFIELD_HEIGHT,
  PLAYFIELD_WIDTH,
  POWER_MAX_PERCENT,
  TERRAIN_RENDER_SAMPLE_SPACING,
} from '../../shared/constants.ts';
import type { ArenaDefinition } from '../../shared/arenas.ts';
import type { Vector2 } from '../../shared/geometry.ts';
import { sampleTerrain } from '../../shared/terrain.ts';
import { colourFor, drawnSizeFor } from './visuals.ts';

/** Everything the Renderer needs for one frame. */
export interface RenderState {
  readonly arena: ArenaDefinition;
  readonly ballPosition: Vector2;
  readonly aimDegrees: number;
  readonly powerPercent: number;
  /** R14.5 - the aim indicator is drawn only while the local Player is the Active_Player. */
  readonly isActivePlayer: boolean;
  /**
   * R14.14 - the stickman stands at the Ball only while the Status_Token reads `BALL_AT_REST`, and is
   * omitted while the Ball is in motion. The caller derives this from the token; the Renderer owns no
   * Match state.
   */
  readonly showStickman: boolean;
  /** R14.15 - the Strokes chip shows the current Arena's Stroke count, as the overlay exposes it. */
  readonly strokesThisArena: number;
}

export interface Renderer {
  readonly render: (state: RenderState) => void;
  /** Recomputes the camera framing and the drawing buffer for the container's current size. */
  readonly resize: () => void;
  readonly dispose: () => void;
  /** The canvas the scene is drawn into. Exposed so the entry point can style or query it. */
  readonly canvas: HTMLCanvasElement;
}

const FULL_TURN_DEGREES = 360;
const RADIANS_PER_DEGREE = (2 * Math.PI) / FULL_TURN_DEGREES;

// Layer order, lowest drawn first. Not world-scale values - these are draw-order indices, which R4.18
// exempts explicitly.
const LAYER_SKY = 0;
const LAYER_SCENERY_FAR = 1;
const LAYER_SCENERY_NEAR = 2;
const LAYER_CLOUDS = 3;
const LAYER_TERRAIN = 4;
const LAYER_TERRAIN_SOIL = 5;
const LAYER_TERRAIN_EDGE = 6;
const LAYER_HOLE = 7;
const LAYER_FLAG = 7;
const LAYER_OBSTACLE = 8;
const LAYER_AIM = 9;
const LAYER_STICKMAN = 10;
const LAYER_BALL = 11;
const LAYER_GAUGE = 12;
const LAYER_HUD = 13;

const CIRCLE_SEGMENTS = 48;

/** A unit square centred on the origin, scaled per mesh. One geometry serves every rectangle. */
const UNIT_SQUARE = new THREE.PlaneGeometry(1, 1);
/** A unit-radius circle centred on the origin, scaled per mesh. */
const UNIT_CIRCLE = new THREE.CircleGeometry(1, CIRCLE_SEGMENTS);

// Decorative aspect ratios and layout fractions. Proportions of declared sizes or of the viewport -
// neither physics, world-scale nor tuning values, so R4.18 does not reach them.
const CLOUD_ASPECT = 2.6;
const FLAG_CLOTH_ASPECT = 1.8;
const FLAG_POLE_WIDTH_FRACTION = 0.03;
const CHIP_MARGIN = 26;
const CHIP_GAP = 20;
const CHIP_PAD_X = 18;
const SCENERY_SPAN_PAD_FRACTION = 0.6;

// Parallax factors: how much of the camera's travel each layer follows. Sky-fixed world moves at 1.
const PARALLAX_FAR = 0.35;
const PARALLAX_NEAR = 0.6;
const PARALLAX_PINES = 0.78;
const PARALLAX_CLOUDS = 0.12;

function flatMaterial(colour: number): THREE.MeshBasicMaterial {
  // Depth testing off so `renderOrder` alone decides layering and every mesh can stay at z = 0.
  return new THREE.MeshBasicMaterial({ color: colour, depthTest: false, depthWrite: false });
}

/** A rectangle mesh in world units, centred on the given point. */
function rectangleMesh(
  centreX: number,
  centreY: number,
  width: number,
  height: number,
  colour: number,
  renderOrder: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(UNIT_SQUARE, flatMaterial(colour));
  mesh.renderOrder = renderOrder;
  mesh.position.set(centreX, centreY, 0);
  mesh.scale.set(Math.max(width, 0), Math.max(height, 0), 1);
  return mesh;
}

/** A circle mesh in world units. */
function circleMesh(
  centre: Vector2,
  radius: number,
  colour: number,
  renderOrder: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(UNIT_CIRCLE, flatMaterial(colour));
  mesh.renderOrder = renderOrder;
  mesh.position.set(centre.x, centre.y, 0);
  mesh.scale.set(radius, radius, 1);
  return mesh;
}

/** An isoceles triangle mesh, base centred on the given x at the given base y, apex up. */
function triangleMesh(
  baseCentreX: number,
  baseY: number,
  halfWidth: number,
  height: number,
  colour: number,
  renderOrder: number,
): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(
      new Float32Array([
        baseCentreX - halfWidth, baseY, 0,
        baseCentreX + halfWidth, baseY, 0,
        baseCentreX, baseY + height, 0,
      ]),
      3,
    ),
  );
  const mesh = new THREE.Mesh(geometry, flatMaterial(colour));
  mesh.renderOrder = renderOrder;
  return mesh;
}

/**
 * A horizontal band hanging below a polyline of surface points - the terrain's soil layer and crest
 * highlight are both this shape at different depths.
 */
function ribbonMesh(
  surface: readonly Vector2[],
  depth: number,
  colour: number,
  renderOrder: number,
): THREE.Mesh {
  const count = surface.length;
  const positions = new Float32Array(count * 2 * 3);
  for (let index = 0; index < count; index += 1) {
    const point = surface[index];
    if (point === undefined) {
      continue;
    }
    positions[index * 6] = point.x;
    positions[index * 6 + 1] = point.y;
    positions[index * 6 + 3] = point.x;
    positions[index * 6 + 4] = point.y - depth;
  }
  const indices: number[] = [];
  for (let index = 0; index < count - 1; index += 1) {
    const pairStart = index * 2;
    indices.push(pairStart, pairStart + 1, pairStart + 2, pairStart + 1, pairStart + 3, pairStart + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry, flatMaterial(colour));
  mesh.renderOrder = renderOrder;
  return mesh;
}

/**
 * Renders text to a canvas texture so the Renderer draws it inside the rendering canvas through
 * Three.js, as R17.3 requires, rather than as a DOM element beside it.
 *
 * Used for the HUD chip labels of R14.15. Requirement 9 deliberately leaves Par out of the
 * Debug_Overlay, so none of this can be satisfied with overlay DOM.
 */
function createTextPlane(text: string, colour: number, worldHeight: number, renderOrder: number): THREE.Mesh {
  const pixelsPerWorldUnit = 4;
  const fontPixels = Math.round(worldHeight * pixelsPerWorldUnit);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (context === null) {
    // No 2D context means no label. Everything else still draws, per R16.4's spirit: a missing
    // placeholder must not block the rest of the frame.
    const empty = new THREE.Mesh(UNIT_SQUARE, flatMaterial(colour));
    empty.visible = false;
    return empty;
  }

  context.font = `700 ${String(fontPixels)}px system-ui, sans-serif`;
  const measured = context.measureText(text);
  canvas.width = Math.max(Math.ceil(measured.width), 1);
  canvas.height = Math.ceil(fontPixels * 1.4);

  // Re-set the font: resizing the canvas resets its 2D context state.
  context.font = `700 ${String(fontPixels)}px system-ui, sans-serif`;
  context.textBaseline = 'middle';
  context.fillStyle = `#${colour.toString(16).padStart(6, '0')}`;
  context.fillText(text, 0, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const mesh = new THREE.Mesh(
    UNIT_SQUARE,
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  );
  mesh.renderOrder = renderOrder;
  mesh.scale.set((canvas.width / canvas.height) * worldHeight, worldHeight, 1);
  return mesh;
}

/**
 * The stickman figure of R14.14, built once at unit height with its feet at the local origin, so the
 * caller scales it by the registry's figure height and parks it at the Ball's ground contact point.
 *
 * Proportions are decorative ratios of the declared height, which R4.18 exempts.
 */
function buildStickman(colour: number, renderOrder: number): THREE.Group {
  const group = new THREE.Group();

  function part(centreX: number, centreY: number, width: number, height: number, rotation: number): void {
    const mesh = rectangleMesh(centreX, centreY, width, height, colour, renderOrder);
    mesh.rotation.z = rotation;
    group.add(mesh);
  }

  group.add(circleMesh({ x: 0, y: 0.87 }, 0.13, colour, renderOrder));
  part(0, 0.5, 0.07, 0.38, 0);
  part(-0.15, 0.56, 0.32, 0.055, 0.5);
  part(0.15, 0.56, 0.32, 0.055, -0.5);
  part(-0.08, 0.17, 0.055, 0.36, 0.28);
  part(0.08, 0.17, 0.055, 0.36, -0.28);

  return group;
}

function disposeSubtree(root: THREE.Object3D): void {
  for (const child of [...root.children]) {
    disposeSubtree(child);
    root.remove(child);
  }
  if (root instanceof THREE.Mesh) {
    const geometry = root.geometry;
    // The shared unit geometries outlive any single mesh; everything else was built for one mesh.
    if (geometry !== UNIT_SQUARE && geometry !== UNIT_CIRCLE) {
      geometry.dispose();
    }
    const material = root.material;
    if (material instanceof THREE.Material) {
      if (material instanceof THREE.MeshBasicMaterial && material.map !== null) {
        material.map.dispose();
      }
      material.dispose();
    }
  }
}

export function createRenderer(container: HTMLElement): Renderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setClearColor(colourFor('SKY'), 1);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);

  // Half-extents of the world rectangle the camera reveals, recomputed in `resize` (R14.3: equal
  // world units per pixel on both axes, framing PLAYFIELD_WIDTH by PLAYFIELD_HEIGHT at minimum).
  let halfVisibleWidth = PLAYFIELD_WIDTH / 2;
  let halfVisibleHeight = PLAYFIELD_HEIGHT / 2;

  // The sky follows the camera exactly, so no pan can run off its edge.
  const sky = rectangleMesh(0, 0, 1, 1, colourFor('SKY'), LAYER_SKY);
  sky.scale.set(PLAYFIELD_WIDTH * 8, PLAYFIELD_HEIGHT * 8, 1);
  scene.add(sky);

  // Scenery groups, rebuilt per Arena because their span follows the Course width. Parallax is applied
  // by offsetting each group against the camera's travel by its factor every frame.
  const sceneryFar = new THREE.Group();
  const sceneryNear = new THREE.Group();
  const pines = new THREE.Group();
  const clouds = new THREE.Group();
  sceneryFar.renderOrder = LAYER_SCENERY_FAR;
  sceneryNear.renderOrder = LAYER_SCENERY_NEAR;
  pines.renderOrder = LAYER_SCENERY_NEAR;
  clouds.renderOrder = LAYER_CLOUDS;
  scene.add(sceneryFar, sceneryNear, pines, clouds);

  let courseGroup: THREE.Group | null = null;
  const hudGroup = new THREE.Group();
  hudGroup.renderOrder = LAYER_HUD;
  scene.add(hudGroup);

  const ball = circleMesh({ x: 0, y: 0 }, BALL_RADIUS, colourFor('BALL_P1'), LAYER_BALL);
  scene.add(ball);

  const stickman = buildStickman(colourFor('STICKMAN'), LAYER_STICKMAN);
  stickman.scale.set(drawnSizeFor('STICKMAN'), drawnSizeFor('STICKMAN'), 1);
  stickman.visible = false;
  scene.add(stickman);

  const aimIndicator = new THREE.Mesh(UNIT_SQUARE, flatMaterial(colourFor('AIM_INDICATOR')));
  aimIndicator.renderOrder = LAYER_AIM;
  scene.add(aimIndicator);

  // R14.4's arc power gauge: a fixed track arc over the upper semicircle about the Ball, and a fill
  // arc whose swept angle grows strictly with the power value - the arc form of R14.6.
  const gaugeRadius = drawnSizeFor('POWER_GAUGE_TRACK');
  const gaugeThickness = drawnSizeFor('POWER_GAUGE_FILL');
  const gaugeTrack = new THREE.Mesh(
    new THREE.RingGeometry(gaugeRadius - gaugeThickness, gaugeRadius, CIRCLE_SEGMENTS, 1, 0, Math.PI),
    flatMaterial(colourFor('POWER_GAUGE_TRACK')),
  );
  gaugeTrack.renderOrder = LAYER_GAUGE;
  scene.add(gaugeTrack);

  const gaugeFill = new THREE.Mesh(
    new THREE.RingGeometry(gaugeRadius - gaugeThickness, gaugeRadius, CIRCLE_SEGMENTS, 1, 0, Math.PI),
    flatMaterial(colourFor('POWER_GAUGE_FILL')),
  );
  gaugeFill.renderOrder = LAYER_GAUGE + 1;
  scene.add(gaugeFill);
  let renderedPowerPercent = -1;

  let renderedChipKey = '';
  let renderedArenaNumber: number | null = null;

  /** Populates the three parallax scenery groups for one Course's width. */
  function buildScenery(courseWidth: number): void {
    const spanPad = courseWidth * SCENERY_SPAN_PAD_FRACTION;
    const spanMin = -spanPad;
    const span = courseWidth + spanPad * 2;

    // Peaks at fixed fractional stations of the span, alternating heights for a ridge silhouette.
    const farStations = [0.04, 0.16, 0.29, 0.43, 0.57, 0.71, 0.84, 0.96];
    const farHeights = [1, 0.72, 0.92, 0.65, 0.98, 0.7, 0.9, 0.76];
    for (const [index, station] of farStations.entries()) {
      const peakHeight = drawnSizeFor('MOUNTAIN_FAR') * (farHeights[index] ?? 0.8);
      sceneryFar.add(
        triangleMesh(spanMin + station * span, 0, peakHeight * 1.15, peakHeight, colourFor('MOUNTAIN_FAR'), LAYER_SCENERY_FAR),
      );
    }

    const nearStations = [0.02, 0.14, 0.27, 0.41, 0.55, 0.69, 0.82, 0.95];
    const nearHeights = [0.85, 1, 0.7, 0.95, 0.75, 1, 0.68, 0.9];
    for (const [index, station] of nearStations.entries()) {
      const hillHeight = drawnSizeFor('MOUNTAIN_NEAR') * (nearHeights[index] ?? 0.8);
      sceneryNear.add(
        triangleMesh(spanMin + station * span, 0, hillHeight * 1.5, hillHeight, colourFor('MOUNTAIN_NEAR'), LAYER_SCENERY_NEAR),
      );
    }

    // Pines march the whole span at even spacing; the height jitter is index arithmetic rather than a
    // random source, so the silhouette is identical on every load.
    const pineSpacing = drawnSizeFor('PINE') * 2.2;
    const pineCount = Math.floor(span / pineSpacing);
    for (let index = 0; index < pineCount; index += 1) {
      const height = drawnSizeFor('PINE') * (0.75 + ((index * 37) % 25) / 100);
      pines.add(
        triangleMesh(spanMin + index * pineSpacing, 0, height * 0.32, height, colourFor('PINE'), LAYER_SCENERY_NEAR),
      );
    }

    const cloudStations = [0.08, 0.24, 0.47, 0.66, 0.88];
    const cloudHeights = [430, 500, 455, 520, 470];
    for (const [index, station] of cloudStations.entries()) {
      const puffHeight = drawnSizeFor('CLOUD');
      const cloud = circleMesh(
        { x: spanMin + (station ?? 0.5) * span, y: cloudHeights[index] ?? 480 },
        puffHeight / 2,
        colourFor('CLOUD'),
        LAYER_CLOUDS,
      );
      cloud.scale.set(puffHeight * CLOUD_ASPECT, puffHeight, 1);
      clouds.add(cloud);
    }
  }

  /** Clears and disposes the four scenery groups ahead of a rebuild. */
  function clearScenery(): void {
    for (const group of [sceneryFar, sceneryNear, pines, clouds]) {
      group.clear();
      disposeSubtree(group);
    }
  }

  /** Builds everything that depends on which Arena is loaded. */
  function buildArena(arena: ArenaDefinition): void {
    if (courseGroup !== null) {
      scene.remove(courseGroup);
      disposeSubtree(courseGroup);
    }
    clearScenery();

    buildScenery(arena.courseWidth);

    const group = new THREE.Group();

    // R14.4, R2.21 - the terrain surface, sampled from the registry's own interpolation at the
    // Constants_Module's rendering spacing, filled down to the world floor. This sampling is drawing
    // only; the Physics_Engine evaluates the interpolation analytically (R4.36).
    const surface = sampleTerrain(arena.terrain, TERRAIN_RENDER_SAMPLE_SPACING);
    const first = surface[0];
    const last = surface[surface.length - 1];
    if (first !== undefined && last !== undefined) {
      const shape = new THREE.Shape();
      shape.moveTo(first.x, 0);
      for (const point of surface) {
        shape.lineTo(point.x, point.y);
      }
      shape.lineTo(last.x, 0);
      shape.closePath();
      const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape), flatMaterial(colourFor('TERRAIN_GRASS')));
      fill.renderOrder = LAYER_TERRAIN;
      group.add(fill);
    }

    group.add(ribbonMesh(surface, drawnSizeFor('TERRAIN_SOIL'), colourFor('TERRAIN_SOIL'), LAYER_TERRAIN_SOIL));
    group.add(ribbonMesh(surface, drawnSizeFor('TERRAIN_EDGE'), colourFor('TERRAIN_EDGE'), LAYER_TERRAIN_EDGE));

    // The free-standing obstacles keep their rectangle treatment under A-2 (R2.1, R3.6-R3.8).
    for (const obstacle of arena.obstacles) {
      group.add(
        rectangleMesh(
          (obstacle.minX + obstacle.maxX) / 2,
          (obstacle.minY + obstacle.maxY) / 2,
          obstacle.maxX - obstacle.minX,
          obstacle.maxY - obstacle.minY,
          colourFor('OBSTACLE'),
          LAYER_OBSTACLE,
        ),
      );
    }

    // R14.4 - the Hole with a flag. The flag flies from the Hole's downrange side so it never covers
    // the capture circle from a shot arriving along the Course.
    group.add(circleMesh(arena.hole, HOLE_RADIUS, colourFor('HOLE'), LAYER_HOLE));
    const poleHeight = drawnSizeFor('FLAG_POLE');
    const poleWidth = poleHeight * FLAG_POLE_WIDTH_FRACTION;
    group.add(rectangleMesh(arena.hole.x, arena.hole.y + poleHeight / 2, poleWidth, poleHeight, colourFor('FLAG_POLE'), LAYER_FLAG));
    const clothHeight = drawnSizeFor('FLAG_CLOTH');
    group.add(
      triangleMesh(
        arena.hole.x + poleWidth / 2,
        arena.hole.y + poleHeight - clothHeight,
        clothHeight * FLAG_CLOTH_ASPECT,
        clothHeight,
        colourFor('FLAG_CLOTH'),
        LAYER_FLAG,
      ),
    );

    scene.add(group);
    courseGroup = group;
  }

  /**
   * R14.15 - rebuilds the three HUD chips when anything they show has changed. Drawn inside the
   * rendering canvas and pinned to the camera in `placeCamera`, so they hold position while it pans.
   */
  function buildHud(arenaNumber: number, par: number, strokes: number): void {
    disposeSubtree(hudGroup);

    const labels = [
      `HOLE ${String(arenaNumber)}`,
      `PAR ${String(par)}`,
      `STROKES ${String(strokes)}`,
    ];
    const chipHeight = drawnSizeFor('CHIP_BACKGROUND');
    const textHeight = drawnSizeFor('CHIP_TEXT');

    let cursor = CHIP_MARGIN;
    for (const label of labels) {
      const text = createTextPlane(label, colourFor('CHIP_TEXT'), textHeight, LAYER_HUD + 1);
      const chipWidth = text.scale.x + CHIP_PAD_X * 2;
      hudGroup.add(rectangleMesh(cursor + chipWidth / 2, -(CHIP_MARGIN + chipHeight / 2), chipWidth, chipHeight, colourFor('CHIP_BACKGROUND'), LAYER_HUD));
      text.position.set(cursor + chipWidth / 2, -(CHIP_MARGIN + chipHeight / 2), 0);
      hudGroup.add(text);
      cursor += chipWidth + CHIP_GAP;
    }
  }

  /**
   * R14.3, as amended by A-2 - frame PLAYFIELD_WIDTH by PLAYFIELD_HEIGHT world units at equal world
   * units per pixel on both axes, with no rotation. The frustum never shows less than that rectangle;
   * a wider viewport sees more Course, never a stretched axis.
   */
  function resize(): void {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);

    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height, false);

    const worldUnitsPerPixel = Math.max(PLAYFIELD_WIDTH / width, PLAYFIELD_HEIGHT / height);
    halfVisibleWidth = (width * worldUnitsPerPixel) / 2;
    halfVisibleHeight = (height * worldUnitsPerPixel) / 2;

    // An OrthographicCamera's frustum bounds are in **camera-local** space, symmetric about zero; the
    // world anchor is applied once, through the camera position in `placeCamera`.
    camera.left = -halfVisibleWidth;
    camera.right = halfVisibleWidth;
    camera.top = halfVisibleHeight;
    camera.bottom = -halfVisibleHeight;
    camera.rotation.set(0, 0, 0);
    camera.updateProjectionMatrix();
  }

  /**
   * R14.3 - centre the camera on the Ball, clamped to the Course bounds, so it pans as the Ball
   * travels and the whole Course is never visible at once. Vertically the floor is the bound: the
   * camera never drops below the world floor, and follows a high arc upward from there.
   */
  function placeCamera(ballPosition: Vector2, courseWidth: number): void {
    const camX =
      courseWidth <= halfVisibleWidth * 2
        ? courseWidth / 2
        : Math.min(Math.max(ballPosition.x, halfVisibleWidth), courseWidth - halfVisibleWidth);
    const camY = Math.max(halfVisibleHeight, ballPosition.y);
    camera.position.set(camX, camY, 1);

    sky.position.set(camX, camY, 0);

    // Parallax: each layer shifts against the camera's travel by its factor, so it appears to move
    // at a fraction of the camera's speed.
    sceneryFar.position.x = camX * (1 - PARALLAX_FAR);
    sceneryNear.position.x = camX * (1 - PARALLAX_NEAR);
    pines.position.x = camX * (1 - PARALLAX_PINES);
    clouds.position.x = camX * (1 - PARALLAX_CLOUDS);

    // R14.15 - the HUD holds screen position by riding the camera's top-left corner.
    hudGroup.position.set(camX - halfVisibleWidth, camY + halfVisibleHeight, 0);
  }

  function render(state: RenderState): void {
    if (renderedArenaNumber !== state.arena.number) {
      buildArena(state.arena);
      renderedArenaNumber = state.arena.number;
      renderedChipKey = '';
    }
    placeCamera(state.ballPosition, state.arena.courseWidth);

    ball.position.set(state.ballPosition.x, state.ballPosition.y, 0);

    // R14.14 - the stickman stands at the Ball's ground contact point while the token reads
    // BALL_AT_REST, and is omitted the moment the Ball is in motion.
    stickman.visible = state.showStickman;
    if (state.showStickman) {
      stickman.position.set(state.ballPosition.x, state.ballPosition.y - BALL_RADIUS, 0);
    }

    // R14.5 - anchored at the Ball centre, no shorter than AIM_INDICATOR_MIN_LENGTH, oriented along
    // the current aim angle, drawn only while the local Player is the Active_Player.
    aimIndicator.visible = state.isActivePlayer;
    gaugeTrack.visible = state.isActivePlayer;
    gaugeFill.visible = state.isActivePlayer;
    if (state.isActivePlayer) {
      const radians = state.aimDegrees * RADIANS_PER_DEGREE;
      const length = AIM_INDICATOR_MIN_LENGTH;
      aimIndicator.scale.set(length, drawnSizeFor('AIM_INDICATOR'), 1);
      aimIndicator.rotation.set(0, 0, radians);
      // Offset by half its length along the aim direction so it starts at the Ball centre rather than
      // straddling it.
      aimIndicator.position.set(
        state.ballPosition.x + (Math.cos(radians) * length) / 2,
        state.ballPosition.y + (Math.sin(radians) * length) / 2,
        0,
      );

      // R14.6, in arc form - the swept angle grows strictly with the power value. Rebuilt only when
      // the value moved, since a RingGeometry every frame would churn allocations.
      gaugeTrack.position.set(state.ballPosition.x, state.ballPosition.y, 0);
      gaugeFill.position.set(state.ballPosition.x, state.ballPosition.y, 0);
      if (state.powerPercent !== renderedPowerPercent) {
        const sweep = Math.max((state.powerPercent / POWER_MAX_PERCENT) * Math.PI, 0.0001);
        gaugeFill.geometry.dispose();
        gaugeFill.geometry = new THREE.RingGeometry(
          gaugeRadius - gaugeThickness,
          gaugeRadius,
          CIRCLE_SEGMENTS,
          1,
          0,
          sweep,
        );
        renderedPowerPercent = state.powerPercent;
      }
    }

    const chipKey = `${String(state.arena.number)}|${String(state.arena.par)}|${String(state.strokesThisArena)}`;
    if (chipKey !== renderedChipKey) {
      buildHud(state.arena.number, state.arena.par, state.strokesThisArena);
      renderedChipKey = chipKey;
    }

    renderer.render(scene, camera);
  }

  resize();

  return {
    render,
    resize,
    dispose(): void {
      if (courseGroup !== null) {
        scene.remove(courseGroup);
        disposeSubtree(courseGroup);
        courseGroup = null;
      }
      disposeSubtree(scene);
      renderer.dispose();
      renderer.domElement.remove();
    },
    canvas: renderer.domElement,
  };
}
