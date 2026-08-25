// Asset_Registry, simplified - Requirement 16, as amended by A-2.
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
// A-2 rewrote the element list with R14.4: the Playfield rectangle, its border and the walls are gone -
// the Course is now terrain under a sky, with parallax scenery - and the power bar became an arc gauge.
// The keys those elements used are removed rather than retained, because a frozen spelling protects
// external bindings, and the Debug_Overlay contract is the only external binding here; the palette is
// internal to the Renderer. docs/asset-requests.md records the withdrawal alongside the new entries.
//
// On R4.18: the drawn sizes below are world-unit quantities, which would normally belong to the
// Constants_Module. R16.9 assigns "a drawn size in world units" to the Asset_Registry explicitly, so
// this is the declaration site the spec names for them. No physics, simulation-timing or gameplay
// tuning value appears here.

/** Every keyed visual the Renderer draws. Spelling is frozen for the lifetime of the project (R16.1). */
export type AssetKey =
  | 'SKY'
  | 'CLOUD'
  | 'MOUNTAIN_FAR'
  | 'MOUNTAIN_NEAR'
  | 'PINE'
  | 'TERRAIN_GRASS'
  | 'TERRAIN_SOIL'
  | 'TERRAIN_EDGE'
  | 'HOLE'
  | 'FLAG_POLE'
  | 'FLAG_CLOTH'
  | 'OBSTACLE'
  | 'BALL_P1'
  | 'BALL_P2'
  | 'STICKMAN'
  | 'AIM_INDICATOR'
  | 'POWER_GAUGE_TRACK'
  | 'POWER_GAUGE_FILL'
  | 'CHIP_BACKGROUND'
  | 'CHIP_TEXT';

interface AssetDeclaration {
  /** Colour palette value, as a hexadecimal RGB integer. */
  readonly colour: number;
  /**
   * Drawn size in world units, where the element's size is not derived from the Arena_Registry.
   *
   * `null` for anything whose extent comes from Arena geometry - the terrain surface, the obstacles,
   * the Hole and the Ball all take their size from the registry or the Constants_Module, and a size
   * here would be a second source of truth (R2.3). Which dimension a size denotes is stated per entry.
   */
  readonly drawnSize: number | null;
}

const ASSETS: Readonly<Record<AssetKey, AssetDeclaration>> = {
  /** Everything behind the scenery, to the horizon. */
  SKY: { colour: 0x87ceeb, drawnSize: null },
  /** Cloud puffs. Size denotes puff height; width derives by a renderer-local aspect ratio. */
  CLOUD: { colour: 0xffffff, drawnSize: 36 },
  /** The distant mountain silhouettes. Size denotes peak height above the world floor. */
  MOUNTAIN_FAR: { colour: 0x9db4cd, drawnSize: 300 },
  /** The nearer hill silhouettes. Size denotes peak height above the world floor. */
  MOUNTAIN_NEAR: { colour: 0x5d8a63, drawnSize: 160 },
  /** Pine trees standing on the near hills. Size denotes tree height. */
  PINE: { colour: 0x2e5d3a, drawnSize: 64 },
  /** The Course surface itself, filled from the terrain crest down to the world floor. */
  TERRAIN_GRASS: { colour: 0x3f9142, drawnSize: null },
  /** The band of darker ground directly beneath the crest line. Size denotes band depth. */
  TERRAIN_SOIL: { colour: 0x6b4a2e, drawnSize: 26 },
  /** The light crest line along the terrain surface. Size denotes band thickness. */
  TERRAIN_EDGE: { colour: 0x8fd08a, drawnSize: 7 },
  /** R14.4 requires a fill differing from every other element at its position. */
  HOLE: { colour: 0x0c0e10, drawnSize: null },
  /** The flag pole rising from the Hole. Size denotes pole height above the surface. */
  FLAG_POLE: { colour: 0xdadde0, drawnSize: 96 },
  /** The flag cloth. Size denotes cloth height; length derives by a renderer-local aspect ratio. */
  FLAG_CLOTH: { colour: 0xe63946, drawnSize: 22 },
  /** Free-standing static obstacles, distinct from the terrain. Only Arena 4 declares one. */
  OBSTACLE: { colour: 0x8a6a4a, drawnSize: null },
  BALL_P1: { colour: 0xf6f8fb, drawnSize: null },
  /**
   * R14.7 would distinguish `P2`'s Ball from `P1`'s by an attribute other than position. There is no
   * second Player in the delivered scope, so nothing draws this. It is declared because the palette is
   * the registry's business and a later reader should not have to invent the colour.
   */
  BALL_P2: { colour: 0xf0b429, drawnSize: null },
  /** The stickman figure of R14.14. Size denotes total figure height. */
  STICKMAN: { colour: 0x22262b, drawnSize: 62 },
  /** Thickness only. The length is `AIM_INDICATOR_MIN_LENGTH` from the Constants_Module (R4.31). */
  AIM_INDICATOR: { colour: 0xffe066, drawnSize: 4 },
  /** The unfilled extent of the arc power gauge. Size denotes the arc's radius about the Ball. */
  POWER_GAUGE_TRACK: { colour: 0x39414b, drawnSize: 56 },
  /** The filled extent of the arc power gauge. Size denotes the arc band's thickness. */
  POWER_GAUGE_FILL: { colour: 0xffb703, drawnSize: 11 },
  /** HUD chip plate of R14.15. Size denotes chip height; width follows the label text. */
  CHIP_BACKGROUND: { colour: 0x101418, drawnSize: 46 },
  /** HUD chip label text. Size denotes text height in world units. */
  CHIP_TEXT: { colour: 0xf6f8fb, drawnSize: 24 },
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
