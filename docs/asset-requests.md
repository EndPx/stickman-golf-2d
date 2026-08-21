# Asset requests

Running list of every visual asset file and colour palette value the project would benefit from.
Required by R16.5 and R16.6: this file exists from the first implementation increment, accumulates
every request raised during the project, and **retains fulfilled entries with their status changed to
`SUPPLIED` rather than removing them**.

Nothing here blocks a task. R16.4 requires every task to complete and be verified against a
procedural placeholder, so an entry below is a request for a later batch, never a dependency.

## Convention

One entry per Asset_Key, appended before the task that raised it is recorded complete. Each entry
states:

| Field | Meaning |
|---|---|
| **Asset_Key** | The identifier the supplied item binds to. Spelling is frozen for the life of the project (R16.1). |
| **Subject or role** | What it depicts, for an asset file; or what it styles, for a colour palette value. |
| **Location of use** | Where it is drawn. |
| **Dimensions and format** | Pixel dimensions and file format. Stated as `n/a - colour palette value` for a palette entry, which has neither (R16.5 names both only for asset file requests). |
| **Status** | Exactly one of `REQUESTED`, `SUPPLIED`. No third value. |

The drawn size in world units and the anchor point are declared in the Asset_Registry, not here, and
they apply identically to the placeholder and to any file later bound to the same Asset_Key, so
adopting a supplied file changes neither drawn size nor drawn position (R16.9).

### Entry template

```
### <Asset_Key>

- **Subject or role:** <what it depicts, or what it styles>
- **Location of use:** <where it is drawn>
- **Dimensions and format:** <NNNxNNN PNG> | n/a - colour palette value
- **Status:** REQUESTED
```

## Entries

Raised by task 8. Every element below currently draws from a procedural placeholder and a default
colour palette value declared in `client/src/visuals.ts`, so the game is complete and verifiable as it
stands (R16.2, R16.4). Each entry is a request for a designer-chosen replacement, not a blocker.

The palette was picked to read clearly rather than to look considered: a fairway green, a timber brown
and one warm accent. A designer replacing these values changes `client/src/visuals.ts` and nothing else.

### PLAYFIELD_INTERIOR

- **Subject or role:** Fill for the playable Playfield area. The fairway.
- **Location of use:** The whole Playfield rectangle, beneath everything else.
- **Dimensions and format:** n/a - colour palette value
- **Current placeholder:** `#2f7a3f`
- **Status:** REQUESTED

### PLAYFIELD_BORDER

- **Subject or role:** Hairline outline marking the Playfield bounds. Drawn only along **walled** edges,
  so the gap in the outline is what signals an open edge.
- **Location of use:** The four Playfield bounds, one thin rectangle per walled edge.
- **Dimensions and format:** n/a - colour palette value
- **Current placeholder:** `#9fe0ad`, drawn 3 world units thick
- **Status:** REQUESTED

### OUTSIDE_PLAYFIELD

- **Subject or role:** Fill for viewport area beyond the Playfield, which appears whenever the canvas
  aspect ratio differs from the Playfield's. R14.4 requires it to differ from the Playfield interior.
- **Location of use:** Everything the camera can see outside the Playfield bounds.
- **Dimensions and format:** n/a - colour palette value
- **Current placeholder:** `#13181d`
- **Status:** REQUESTED

### WALL

- **Subject or role:** Fill for Arena walls. A supplied tiling texture would suit these better than a
  flat fill, since Arena 2's wall is a large unbroken slab.
- **Location of use:** Every wall rectangle the Arena_Registry declares.
- **Dimensions and format:** n/a - colour palette value; a 64x64 PNG tile would also be usable
- **Current placeholder:** `#6b4f36`
- **Status:** REQUESTED

### OBSTACLE

- **Subject or role:** Fill for free-standing static obstacles, distinct from walls.
- **Location of use:** Every obstacle rectangle the Arena_Registry declares. Only Arena 4 declares one,
  and Arena 4 is descoped, so nothing draws this in the delivered scope.
- **Dimensions and format:** n/a - colour palette value
- **Current placeholder:** `#8a6a4a`
- **Status:** REQUESTED

### HOLE

- **Subject or role:** The Hole. R14.4 requires a fill differing from every wall and every obstacle.
- **Location of use:** A circle of `HOLE_RADIUS` at the Arena's declared Hole position.
- **Dimensions and format:** n/a - colour palette value; a 64x64 PNG with a soft rim would read better
  than a flat disc
- **Current placeholder:** `#0c0e10`
- **Status:** REQUESTED

### BALL_P1

- **Subject or role:** The Player's Ball.
- **Location of use:** A circle of `BALL_RADIUS` at the Ball's simulated position.
- **Dimensions and format:** n/a - colour palette value; a 32x32 PNG golf ball would suit
- **Current placeholder:** `#f6f8fb`
- **Status:** REQUESTED

### BALL_P2

- **Subject or role:** A second Player's Ball, which R14.7 would distinguish from `P1`'s by an attribute
  other than position.
- **Location of use:** Nothing draws this. There is no second Player in the delivered scope; the key is
  declared so the palette decision is recorded rather than left to a later reader.
- **Dimensions and format:** n/a - colour palette value
- **Current placeholder:** `#f0b429`
- **Status:** REQUESTED

### AIM_INDICATOR

- **Subject or role:** The aim direction line originating at the Ball centre.
- **Location of use:** Anchored at the Ball, `AIM_INDICATOR_MIN_LENGTH` long, oriented along the aim
  angle. Only its thickness is declared here; its length is a Constants_Module value (R4.31).
- **Dimensions and format:** n/a - colour palette value
- **Current placeholder:** `#ffe066`, drawn 4 world units thick
- **Status:** REQUESTED

### POWER_INDICATOR_TRACK

- **Subject or role:** The unfilled extent of the power bar.
- **Location of use:** Top-left of the Playfield. Its declared size is the bar's full length at
  `POWER_MAX_PERCENT`.
- **Dimensions and format:** n/a - colour palette value
- **Current placeholder:** `#1c3a26`, 220 world units long
- **Status:** REQUESTED

### POWER_INDICATOR_FILL

- **Subject or role:** The filled extent of the power bar, whose drawn length increases strictly with the
  power value (R14.6).
- **Location of use:** Over the track, anchored to its left end. Its declared size is the bar thickness.
- **Dimensions and format:** n/a - colour palette value
- **Current placeholder:** `#ffb703`, 18 world units thick
- **Status:** REQUESTED

### PAR_LABEL

- **Subject or role:** Text colour for the Arena number and Par readout that R13.11 assigns to the
  Renderer. Drawn through a canvas texture so it is inside the rendering canvas, as R17.3 requires.
- **Location of use:** Top-right of the Playfield. Its declared size is the text height in world units.
- **Dimensions and format:** n/a - colour palette value. A supplied bitmap font would remove the
  canvas-texture step, and would be the one asset here that changes the code rather than a value.
- **Current placeholder:** `#f6f8fb`, 34 world units tall
- **Status:** REQUESTED
