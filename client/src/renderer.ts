// Renderer - Requirement 14.
//
// Three.js, orthographic camera, everything in a single plane (R14.1, R14.2). Layering is done with
// `renderOrder` and depth testing switched off rather than with per-element z offsets, so "a single
// plane" is literally true: every mesh sits at z = 0.
//
// All drawn Arena geometry is derived from the Arena_Registry and there is no inline Arena geometry
// literal anywhere in this file (R2.3). Every colour and every drawn size that is not Arena geometry
// comes from the Asset_Registry by key (R16.8).
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
} from '../../shared/constants.ts';
import { PLAYFIELD_BOUNDS, type ArenaDefinition } from '../../shared/arenas.ts';
import type { Rectangle, Vector2 } from '../../shared/geometry.ts';
import { colourFor, drawnSizeFor } from './visuals.ts';

/** Everything the Renderer needs for one frame. */
export interface RenderState {
  readonly arena: ArenaDefinition;
  readonly ballPosition: Vector2;
  readonly aimDegrees: number;
  readonly powerPercent: number;
  /** R14.5 - the aim indicator is drawn only while the local Player is the Active_Player. */
  readonly isActivePlayer: boolean;
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
const LAYER_OUTSIDE = 0;
const LAYER_PLAYFIELD = 1;
const LAYER_BORDER = 2;
const LAYER_HOLE = 3;
const LAYER_WALL = 4;
const LAYER_OBSTACLE = 5;
const LAYER_AIM = 6;
const LAYER_BALL = 7;
const LAYER_INDICATOR = 8;

const CIRCLE_SEGMENTS = 48;

/** A unit square centred on the origin, scaled per mesh. One geometry serves every rectangle. */
const UNIT_SQUARE = new THREE.PlaneGeometry(1, 1);
/** A unit-radius circle centred on the origin, scaled per mesh. */
const UNIT_CIRCLE = new THREE.CircleGeometry(1, CIRCLE_SEGMENTS);

function flatMaterial(colour: number): THREE.MeshBasicMaterial {
  // Depth testing off so `renderOrder` alone decides layering and every mesh can stay at z = 0.
  return new THREE.MeshBasicMaterial({ color: colour, depthTest: false, depthWrite: false });
}

function placeRectangle(mesh: THREE.Mesh, rect: Rectangle): void {
  mesh.position.set((rect.minX + rect.maxX) / 2, (rect.minY + rect.maxY) / 2, 0);
  mesh.scale.set(Math.max(rect.maxX - rect.minX, 0), Math.max(rect.maxY - rect.minY, 0), 1);
}

/** A rectangle mesh in world units. */
function rectangleMesh(rect: Rectangle, colour: number, renderOrder: number): THREE.Mesh {
  const mesh = new THREE.Mesh(UNIT_SQUARE, flatMaterial(colour));
  mesh.renderOrder = renderOrder;
  placeRectangle(mesh, rect);
  return mesh;
}

/** A circle mesh in world units. */
function circleMesh(centre: Vector2, radius: number, colour: number, renderOrder: number): THREE.Mesh {
  const mesh = new THREE.Mesh(UNIT_CIRCLE, flatMaterial(colour));
  mesh.renderOrder = renderOrder;
  mesh.position.set(centre.x, centre.y, 0);
  mesh.scale.set(radius, radius, 1);
  return mesh;
}

/**
 * Renders text to a canvas texture so the Renderer can draw it inside the rendering canvas through
 * Three.js, as R17.3 requires, rather than as a DOM element beside it.
 *
 * R13.11 assigns the Par display to the Renderer, and Requirement 9 deliberately leaves Par out of the
 * Debug_Overlay, so this cannot be satisfied with overlay DOM.
 */
function createTextPlane(text: string, colour: number, worldHeight: number, renderOrder: number): THREE.Mesh {
  const pixelsPerWorldUnit = 4;
  const fontPixels = Math.round(worldHeight * pixelsPerWorldUnit);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (context === null) {
    // No 2D context means no Par label. Everything else still draws, per R16.4's spirit: a missing
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

function disposeSubtree(root: THREE.Object3D): void {
  for (const child of [...root.children]) {
    disposeSubtree(child);
    root.remove(child);
  }
  if (root instanceof THREE.Mesh) {
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
  renderer.setClearColor(colourFor('OUTSIDE_PLAYFIELD'), 1);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);

  // The area outside the Playfield (R14.4). Sized in `resize` to cover whatever the camera can see, and
  // filled differently from the Playfield interior.
  const outside = rectangleMesh(PLAYFIELD_BOUNDS, colourFor('OUTSIDE_PLAYFIELD'), LAYER_OUTSIDE);
  scene.add(outside);

  const playfield = rectangleMesh(PLAYFIELD_BOUNDS, colourFor('PLAYFIELD_INTERIOR'), LAYER_PLAYFIELD);
  scene.add(playfield);

  const borderThickness = drawnSizeFor('PLAYFIELD_BORDER');

  /**
   * The four Playfield bounds as thin rectangles, paired with the Arena_Registry flag saying whether
   * that edge is walled. Derived from `PLAYFIELD_BOUNDS`, so no Arena geometry literal appears (R2.3).
   */
  function borderSegments(arena: ArenaDefinition): readonly { rect: Rectangle; walled: boolean }[] {
    return [
      {
        walled: arena.edges.bottom,
        rect: { minX: PLAYFIELD_BOUNDS.minX, minY: PLAYFIELD_BOUNDS.minY, maxX: PLAYFIELD_BOUNDS.maxX, maxY: PLAYFIELD_BOUNDS.minY + borderThickness },
      },
      {
        walled: arena.edges.top,
        rect: { minX: PLAYFIELD_BOUNDS.minX, minY: PLAYFIELD_BOUNDS.maxY - borderThickness, maxX: PLAYFIELD_BOUNDS.maxX, maxY: PLAYFIELD_BOUNDS.maxY },
      },
      {
        walled: arena.edges.left,
        rect: { minX: PLAYFIELD_BOUNDS.minX, minY: PLAYFIELD_BOUNDS.minY, maxX: PLAYFIELD_BOUNDS.minX + borderThickness, maxY: PLAYFIELD_BOUNDS.maxY },
      },
      {
        walled: arena.edges.right,
        rect: { minX: PLAYFIELD_BOUNDS.maxX - borderThickness, minY: PLAYFIELD_BOUNDS.minY, maxX: PLAYFIELD_BOUNDS.maxX, maxY: PLAYFIELD_BOUNDS.maxY },
      },
    ];
  }

  // Rebuilt whenever the Arena changes: the border, walls, obstacles, the Hole and the Par label.
  let arenaGroup: THREE.Group | null = null;
  let renderedArenaNumber: number | null = null;

  const ball = circleMesh({ x: 0, y: 0 }, BALL_RADIUS, colourFor('BALL_P1'), LAYER_BALL);
  scene.add(ball);

  const aimIndicator = new THREE.Mesh(UNIT_SQUARE, flatMaterial(colourFor('AIM_INDICATOR')));
  aimIndicator.renderOrder = LAYER_AIM;
  scene.add(aimIndicator);

  const powerTrackLength = drawnSizeFor('POWER_INDICATOR_TRACK');
  const powerBarThickness = drawnSizeFor('POWER_INDICATOR_FILL');
  const powerMargin = powerBarThickness;
  const powerTrackLeft = PLAYFIELD_BOUNDS.minX + powerMargin;
  const powerTrackTop = PLAYFIELD_BOUNDS.maxY - powerMargin;

  const powerTrack = rectangleMesh(
    {
      minX: powerTrackLeft,
      minY: powerTrackTop - powerBarThickness,
      maxX: powerTrackLeft + powerTrackLength,
      maxY: powerTrackTop,
    },
    colourFor('POWER_INDICATOR_TRACK'),
    LAYER_INDICATOR,
  );
  scene.add(powerTrack);

  const powerFill = new THREE.Mesh(UNIT_SQUARE, flatMaterial(colourFor('POWER_INDICATOR_FILL')));
  powerFill.renderOrder = LAYER_INDICATOR + 1;
  scene.add(powerFill);

  function buildArena(arena: ArenaDefinition): void {
    if (arenaGroup !== null) {
      scene.remove(arenaGroup);
      disposeSubtree(arenaGroup);
    }

    const group = new THREE.Group();

    // R14.4 - draw the Playfield bounds. A **walled** edge gets the border line; an open edge gets
    // nothing, so the gap in the outline is what tells a player the Ball can leave there.
    //
    // No requirement asks for the distinction. Drawing an identical line on both would satisfy R14.4
    // and leave Arena 2's open right edge indistinguishable from a wall, which makes the Arena's lesson
    // unreadable and turns R2.19's open edge into an unsignalled trap.
    for (const segment of borderSegments(arena)) {
      if (segment.walled) {
        group.add(rectangleMesh(segment.rect, colourFor('PLAYFIELD_BORDER'), LAYER_BORDER));
      }
    }

    // R14.4 - the Hole is drawn beneath the walls so a Hole tucked against one still reads as a Hole,
    // and with a fill differing from every wall and every obstacle.
    group.add(circleMesh(arena.hole, HOLE_RADIUS, colourFor('HOLE'), LAYER_HOLE));

    for (const wall of arena.walls) {
      group.add(rectangleMesh(wall, colourFor('WALL'), LAYER_WALL));
    }
    for (const obstacle of arena.obstacles) {
      group.add(rectangleMesh(obstacle, colourFor('OBSTACLE'), LAYER_OBSTACLE));
    }

    // R13.11 - the current Arena's Par value, as declared in the Arena_Registry.
    const parLabel = createTextPlane(
      `ARENA ${String(arena.number)}   PAR ${String(arena.par)}`,
      colourFor('PAR_LABEL'),
      drawnSizeFor('PAR_LABEL'),
      LAYER_INDICATOR,
    );
    const parMargin = drawnSizeFor('POWER_INDICATOR_FILL');
    parLabel.position.set(
      PLAYFIELD_BOUNDS.maxX - parMargin - parLabel.scale.x / 2,
      PLAYFIELD_BOUNDS.maxY - parMargin - parLabel.scale.y / 2,
      0,
    );
    group.add(parLabel);

    scene.add(group);
    arenaGroup = group;
    renderedArenaNumber = arena.number;
  }

  /**
   * R14.3 - frame the camera so the whole Playfield is visible at equal world units per pixel on both
   * axes, with no rotation, and with any surplus viewport area falling outside the Playfield bounds
   * rather than being absorbed by unequal axis scaling.
   *
   * Taking the smaller of the two axis scales is what does it: the Playfield always fits, the aspect
   * ratio derived from `PLAYFIELD_WIDTH` and `PLAYFIELD_HEIGHT` is preserved, and the leftover shows as
   * the outside-Playfield fill. The mapping changes only here, so only a canvas resize can change it.
   */
  function resize(): void {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);

    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height, false);

    const worldUnitsPerPixel = Math.max(PLAYFIELD_WIDTH / width, PLAYFIELD_HEIGHT / height);
    const halfVisibleWidth = (width * worldUnitsPerPixel) / 2;
    const halfVisibleHeight = (height * worldUnitsPerPixel) / 2;
    const centreX = (PLAYFIELD_BOUNDS.minX + PLAYFIELD_BOUNDS.maxX) / 2;
    const centreY = (PLAYFIELD_BOUNDS.minY + PLAYFIELD_BOUNDS.maxY) / 2;

    // An OrthographicCamera's frustum bounds are in **camera-local** space, so they are symmetric about
    // zero here and the Playfield centre is applied once, through the camera position. Setting both to
    // world coordinates would offset the view twice.
    camera.left = -halfVisibleWidth;
    camera.right = halfVisibleWidth;
    camera.top = halfVisibleHeight;
    camera.bottom = -halfVisibleHeight;
    camera.position.set(centreX, centreY, 1);
    camera.rotation.set(0, 0, 0);
    camera.updateProjectionMatrix();

    // Cover everything the camera can see, so no gap shows at the edges of the viewport.
    placeRectangle(outside, {
      minX: centreX - halfVisibleWidth,
      minY: centreY - halfVisibleHeight,
      maxX: centreX + halfVisibleWidth,
      maxY: centreY + halfVisibleHeight,
    });
  }

  function render(state: RenderState): void {
    if (renderedArenaNumber !== state.arena.number) {
      buildArena(state.arena);
    }

    ball.position.set(state.ballPosition.x, state.ballPosition.y, 0);

    // R14.5 - anchored at the Ball centre, no shorter than AIM_INDICATOR_MIN_LENGTH, oriented along the
    // current aim angle. R14.11 - drawn from the local Player's own aim angle at that Player's own Ball,
    // and drawn at all only while that Player is the Active_Player.
    aimIndicator.visible = state.isActivePlayer;
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
    }

    // R14.6 - drawn extent increases strictly with the power value, so two values differing by
    // POWER_STEP_PERCENT are visibly different. Anchored to the track's left end.
    const filledLength = (state.powerPercent / POWER_MAX_PERCENT) * powerTrackLength;
    placeRectangle(powerFill, {
      minX: powerTrackLeft,
      minY: powerTrackTop - powerBarThickness,
      maxX: powerTrackLeft + filledLength,
      maxY: powerTrackTop,
    });

    renderer.render(scene, camera);
  }

  resize();

  return {
    render,
    resize,
    dispose(): void {
      if (arenaGroup !== null) {
        scene.remove(arenaGroup);
        disposeSubtree(arenaGroup);
        arenaGroup = null;
      }
      disposeSubtree(scene);
      renderer.dispose();
      renderer.domElement.remove();
    },
    canvas: renderer.domElement,
  };
}
