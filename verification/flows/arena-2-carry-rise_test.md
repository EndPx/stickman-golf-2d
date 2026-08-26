---
url: http://localhost:4173/?arena=2
mode: testing
---

# Arena 2 - carrying the rise, holed out through the absolute inputs

The witness shot is the grid-proven one: aim 40, power 100 clears the crest and drops into the far
bowl in a single Stroke (Par 3, so well within Par plus one). The fills exercise the R7.19-R7.26
absolute input path that the A-1 arithmetic priced at two Agent_Steps per Shot.

## Step 1

Fill the number input with data-testid overlay-aim-input with the value 40, and fill the number input with data-testid overlay-power-input with the value 100.

**Expected**: the element with data-testid overlay-aim-angle reads 40 and the element with data-testid overlay-power reads 100.

## Step 2

Press the Space key exactly once.

**Expected**: the element with data-testid overlay-status reads BALL_MOVING immediately after the press, and the element with data-testid overlay-p1-strokes reads 1.

## Step 3

Wait until the element with data-testid overlay-status reads IN_HOLE, then assert it.

**Expected**: the element with data-testid overlay-status reads IN_HOLE.

## Step 4

Read the elements with data-testid overlay-p1-hole-out and overlay-anomaly-count and assert their values.

**Expected**: overlay-p1-hole-out reads HOLED_OUT_BY_CAPTURE and overlay-anomaly-count reads 0.
