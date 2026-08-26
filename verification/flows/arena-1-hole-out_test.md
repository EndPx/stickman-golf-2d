---
url: http://localhost:4173/?arena=1
mode: testing
---

# Arena 1 holes out from the defaults

## Step 1

Press the Space key exactly once.

**Expected**: the element with data-testid overlay-status reads BALL_MOVING immediately after the press.

## Step 2

Wait until the element with data-testid overlay-status reads IN_HOLE, then assert it.

**Expected**: the element with data-testid overlay-status reads IN_HOLE.

## Step 3

Read the elements with data-testid overlay-p1-strokes, overlay-p1-hole-out and overlay-anomaly-count and assert their values.

**Expected**: overlay-p1-strokes reads 1, overlay-p1-hole-out reads HOLED_OUT_BY_CAPTURE and overlay-anomaly-count reads 0.
