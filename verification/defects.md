# Defect ledger

Task 12's record of defects found during verification. Every defect gets an entry here when found,
and its status moves from OPEN to fixed-in-`<commit>` when fixed. Open defects stay at the top.

## Classification rule

A finding is a **game defect** when the running game, the shared engine or the frozen contract
behaved contrary to `.kiro/specs/stickman-golf-2d/requirements.md` — wrong physics, a validator its
own data fails, a frozen value spelled wrongly, a required DOM field absent or mis-valued through
play. A finding is a **harness or environment failure** when the game under test was correct and the
driver was not — a flow objective the agent planner executed partially, a throttled or occluded
browsing context, a hung cloud session, a server that was not up. Both get entries; only game
defects block a task. A harness failure gets its workaround or fix recorded and the flow re-run.

## Entry template

```
### <short title> — <OPEN | fixed in <commit>>

- **Classified:** game defect | harness failure
- **Found:** <which flow or tool>, <date YYYY-MM-DD>
- **Requirement:** <R-id or amendment clause, or "none - contract gap">
- **Symptom:** <what was observed, with the evidence that distinguishes it from a harness failure>
- **Replay:** <start-arena selector, the step sequence, and every shot's aim and power>
- **Fix:** <what changed, or "open">
```

## Open

### Kane's per-step analysis stalls the page and trips R3.18 — OPEN

- **Classified:** harness failure (the game is correct per R3.18; the driver violates R15.25's premise)
- **Found:** `arena-1-hole-out_test.md` runs 11-14, 2026-08-26
- **Requirement:** R15.17 (fail on non-zero anomaly count) as interacting with R3.18 and R15.25
- **Symptom:** every game assertion passes through kane-cli - BALL_MOVING asserted immediately after
  the Space press, IN_HOLE asserted after capture, strokes 1 and HOLED_OUT_BY_CAPTURE extracted and
  matched - and the anomaly count reads 0 at the final analyze, then 1 at the final assert tens of
  seconds later, inside a single analysis pass, in both vision and DOM assertion modes. Kane's
  per-step reasoning (screenshot capture plus model round-trips against the live page) stalls the
  main thread past the ~83 ms absorb window, and the game books the loss exactly as R3.18 requires.
- **Replay:** start-arena selector `?arena=1`; testmd replay: navigate, press Space once, wait for
  IN_HOLE, assert the four overlay fields. Witness shot: defaults (aim 0, power 50).
- **Fix:** open - needs the spec owner. Options: (a) refine R15.17 to "the anomaly count is unchanged
  across the flow's action window, measured immediately after the final action", so harness-induced
  stalls between reads are classified as environment rather than game; (b) a kane-cli mode that
  observes without stalling (no per-step screenshots); (c) accept the flow failing on this assertion
  and record it as environment per the classification rule.

## Fixed

| Found | Date | Defect | Symptom | Fix |
|---|---|---|---|---|
| `check-course.ts` grid sweep | 2026-08-24 | Authored terrain violated the R2.21 validator in Arenas 2, 3 and 4 (crests above half the viewport height) | every tool and the client died at import with `ArenaValidationError` | control points re-authored under the 300-unit cap with each Arena's lesson intact |
| `check-course.ts` grid sweep | 2026-08-24 | Single-push depenetration undershot on curved ground, so the R3.16 residual-overlap bail-out fired on ~1,500 of 2,736 grid Shots | Balls stopped dead mid-roll with `residualOverlapAnomaly`; flows would fail R15.17 | `depenetrateToTolerance` in `shared/physics.ts` iterates measure-and-push (16 top-ups), cumulative push capped at `BALL_RADIUS` so genuine wedges still bail |
| Playwright browser run | 2026-08-25 | Scenery painted over the Course: three.js sorts by the nearest ancestor Group's `renderOrder` (`groupOrder`) before mesh-level `renderOrder`, and the Course group and bare root meshes sat at 0 | fairway invisible; pine and mountain colours sampled inside the terrain silhouette | every layer boundary expressed on a Group (`client/src/renderer.ts`); verified by pixel sampling |
| First kane-cli flow run | 2026-08-26 | A seven-sentence flow objective bifurcated down to its first clause: kane navigated, declared the objective complete, and exited `passed` (code 0) without filling an input or firing a Shot | false green - exit-code-only gating reported PASS on a run that never touched the game | flow objectives are one flowing sentence of then-clauses (the A-1 probe's proven grammar), and the flow script gates on the transcript showing the `IN_HOLE` assertion readout, not on kane's exit code |
| Kane flow runs 2-6 | 2026-08-26 | Objective-shape sweep against the planner: comma-chain objective bifurcated to navigation-only; three runs without a Navigate clause hung in cloud setup after TMS test creation (killed at ~18 min, zero agent steps); the A-1 "Then"-sentence grammar with a fill-inputs clause also bifurcated to navigation-only | five non-verdict runs; the substance gate caught both false greens, the hangs were killed manually | the working hypothesis, to be tested: the one full-execution run in project history (the A-1 probe) used three short sentences with one simple action each, `--headless`, and no `--mode`/`--assertion-mode` overrides; the flow now matches that shape exactly, and the fill-inputs clause moves to a later flow since the Arena 1 witness shot needs only the defaults |
| Kane flow runs 7-10 | 2026-08-26 | The A-1 invocation shape now hangs in cloud setup on kane 0.8.4 and 0.8.6 alike (its success predates a cloud/TMS config change), and every objective the planner accepts is compressed to at most navigate-plus-one-action regardless of grammar | four more non-verdict or compressed runs | the executable base is `--url` + `--mode testing` + `--assertion-mode dom`; multi-clause objectives are abandoned in favour of kane's own replay format, `testmd`, which executes pre-planned steps without objective compression |
| Cold-load discard | 2026-08-26 | Seeding the step clock during module evaluation charged the page load itself as a stall: the first interval tick landed more than one catch-up window late and every cold load began with an anomaly already recorded | `overlay-anomaly-count` read 1-8 on a fresh page before any Shot | `main.ts` seeds the clock on the first rendered frame, so the count starts from an idle main thread; steady-state rate (R3.2) untouched |

## Observations (not defects)

- A headless or occluded browsing context throttles `setInterval` past the ~83 ms absorb window, so
  `overlay-anomaly-count` climbs through R3.18 discards. This is the specified behaviour, and
  R15.25 already obliges flows to keep the context visible - which is why `arena-1-hole-out.mjs`
  runs kane-cli without `--headless`.
