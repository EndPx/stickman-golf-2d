# Witness sequences - task 14

Task 14's record: for each playable Arena, a Shot sequence that holes out within Par plus one, on the
final constant set, with the evidence that produced it. The constants are the A-2 set declared in
`shared/constants.ts` - `GRAVITY` 900, `ROLLING_FRICTION_PER_STEP` 0.99, `AIR_FRICTION_PER_STEP`
0.9995, `TERRAIN_RESTITUTION` 0.35, `BOUNCE_MIN_NORMAL_SPEED` 40, `REST_SPEED_THRESHOLD` 5,
`REST_DEBOUNCE_STEPS` 3, `HOLE_CAPTURE_MAX_SPEED` 200 - shared by every Arena, per-Arena tuning
forbidden. Both witness sequences were verified end to end through kane-cli against the preview
build (see `verification/defects.md` for the harness classification of the anomaly-count assertion),
and the full 72-angle by 19-power grid behind them is reproducible with
`node verification/tools/check-course.ts`.

## Arena 1 - aiming and power (Par 2)

| # | Aim | Power | Outcome |
|---|-----|-------|---------|
| 1 | 0° | 50% | `IN_HOLE`, latched `HOLED_OUT_BY_CAPTURE` |

One Stroke, inside Par. The tee shot rolls down the falling fairway into the shallow bowl and is
captured after dwelling inside `HOLE_RADIUS` while friction brings the speed under
`HOLE_CAPTURE_MAX_SPEED`. The angle-0 power band 35-75 all hole out (grid-verified), so the witness
has margin either side; the defaults are the witness.

## Arena 2 - carrying a rise (Par 3)

| # | Aim | Power | Outcome |
|---|-----|-------|---------|
| 1 | 40° | 100% | `IN_HOLE`, latched `HOLED_OUT_BY_CAPTURE` |

One Stroke, inside Par. Full power carries the crest at x 700 and drops into the far bowl at the
Hole, x 1350. The grid shows this is the single-Shot witness for the Arena; weaker or flatter Shots
strike the face, and the over-power band leaves through the open Course end as `OUT_OF_BOUNDS`,
which is the lesson working as authored.

## Final-constant-set confirmation

- `npm run check` - passed on this exact constant set.
- All eight `verification/tools/check-*.ts` - `ALL CHECKS PASSED`, including `check-course`'s
  playability grid (both Arenas holed by at least one single Shot, zero anomalies, no Shot needing
  the duration valve, `OUT_OF_BOUNDS` reachable, dead-stop rests within tolerance) and
  `check-match`'s advance/completion block (Arena 1 acknowledgement advances with the record
  retained; the last acknowledgement sets `MATCH_COMPLETE` with result `P1`; a Shot on the completed
  Match is refused with `MATCH_COMPLETE`).
- Both Kane flows executed the witness sequences above against the preview build; every game
  assertion passed, and the sole failing assertion in each run is the harness-stall anomaly
  classified as environment under Amendment A-3.
