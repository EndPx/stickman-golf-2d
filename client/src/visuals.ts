// Asset_Registry, simplified - Requirement 16.
//
// The full Requirement 16 registry carried per-key asset file references, anchor points and a
// load-failure fallback. That is over-built for two days, so it is reduced to what the Renderer actually
// needs: one module holding every colour palette value and every drawn size, keyed by Asset_Key
// (R16.1), resolved to a procedural placeholder because no asset file is supplied (R16.2), and reached
// only by key lookup (R16.8).
//
// What that drops, recorded rather than quietly abandoned: asset file references and the one-line
// binding promise (R16.1, R16.3), the anchor-point pairing (R16.9), and the load-failure fallback with
// its anomaly entry (R16.10). Because R16.10's anomaly path no longer exists, R15.35's exemption for
// asset-load anomalies is moot and every anomaly a Verification_Flow observes is fatal.
//
// On R4.18: the drawn sizes below are world-unit quantities, which would normally belong to the
// Constants_Module. R16.9 assigns "a drawn size in world units" to the Asset_Registry explicitly, so
// this is the declaration site the spec names for them. No physics, simulation-timing or gameplay
// tuning value appears here.

/** Every keyed visual the Renderer draws. Spelling is frozen for the lifetime of the project (R16.1). */
export type AssetKey =
  | 'PLAYFIELD_INTERIOR'
  | 'PLAYFIELD_BORDER'
  | 'OUTSIDE_PLAYFIELD'
  | 'WALL'
  | 'OBSTACLE'
  | 'HOLE'
  | 'BALL_P1'
  | 'BALL_P2'
  | 'AIM_INDICATOR'
  | 'POWER_INDICATOR_TRACK'
  | 'POWER_INDICATOR_FILL'
  | 'PAR_LABEL';

interface AssetDeclaration {
  /** Colour palette value, as a hexadecimal RGB integer. */
  readonly colour: number;
  /**
   * Drawn size in world units, where the element's size is not derived from the Arena_Registry.
   *
   * `null` for anything whose extent comes from Arena geometry - the Playfield, the walls, the
   * obstacles, the Hole and the Ball all take their size from the registry or the Constants_Module, and
   * a size here would be a second source of truth (R2.3).
   */
  readonly drawnSize: number | null;
}

const ASSETS: Readonly<Record<AssetKey, AssetDeclaration>> = {
  /** The fairway. Differs from the area outside the Playfield, per R14.4. */
  PLAYFIELD_INTERIOR: { colour: 0x2f7a3f, drawnSize: null },
  /** A hairline around the Playfield bounds, so the edge is readable where a wall does not mark it. */
  PLAYFIELD_BORDER: { colour: 0x9fe0ad, drawnSize: 3 },
  /** Everything the viewport shows beyond the Playfield. R14.4 requires a different fill. */
  OUTSIDE_PLAYFIELD: { colour: 0x13181d, drawnSize: null },
  WALL: { colour: 0x6b4f36, drawnSize: null },
  OBSTACLE: { colour: 0x8a6a4a, drawnSize: null },
  /** R14.4 requires a fill differing from every wall and every static obstacle. */
  HOLE: { colour: 0x0c0e10, drawnSize: null },
  BALL_P1: { colour: 0xf6f8fb, drawnSize: null },
  /**
   * R14.7 would distinguish `P2`'s Ball from `P1`'s by an attribute other than position. There is no
   * second Player in the delivered scope, so nothing draws this. It is declared because the palette is
   * the registry's business and a later reader should not have to invent the colour.
   */
  BALL_P2: { colour: 0xf0b429, drawnSize: null },
  /** Thickness only. The length is `AIM_INDICATOR_MIN_LENGTH` from the Constants_Module (R4.31). */
  AIM_INDICATOR: { colour: 0xffe066, drawnSize: 4 },
  /** Full length of the power bar at `POWER_MAX_PERCENT`, and its thickness through `barThickness`. */
  POWER_INDICATOR_TRACK: { colour: 0x1c3a26, drawnSize: 220 },
  POWER_INDICATOR_FILL: { colour: 0xffb703, drawnSize: 18 },
  PAR_LABEL: { colour: 0xf6f8fb, drawnSize: 34 },
};

/** R16.8 - the Renderer obtains every colour palette value by Asset_Key lookup and by no other means. */
export function colourFor(key: AssetKey): number {
  return ASSETS[key].colour;
}

/**
 * R16.8, R16.9 - the drawn size in world units for an Asset_Key that declares one.
 *
 * Throws for a key whose extent comes from the Arena_Registry or the Constants_Module instead, because
 * a caller asking for one has confused the two sources and returning a default would hide that.
 */
export function drawnSizeFor(key: AssetKey): number {
  const declared = ASSETS[key].drawnSize;
  if (declared === null) {
    throw new Error(
      `Asset_Key ${key} declares no drawn size; its extent comes from the Arena_Registry or the Constants_Module.`,
    );
  }
  return declared;
}

/** Every declared Asset_Key, for a consumer that needs to walk the registry. */
export const ASSET_KEYS = Object.keys(ASSETS) as readonly AssetKey[];
