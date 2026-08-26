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

## Fixed

| Found | Date | Defect | Symptom | Fix |
|---|---|---|---|---|
| `check-course.ts` grid sweep | 2026-08-24 | Authored terrain violated the R2.21 validator in Arenas 2, 3 and 4 (crests above half the viewport height) | every tool and the client died at import with `ArenaValidationError` | control points re-authored under the 300-unit cap with each Arena's lesson intact |
| `check-course.ts` grid sweep | 2026-08-24 | Single-push depenetration undershot on curved ground, so the R3.16 residual-overlap bail-out fired on ~1,500 of 2,736 grid Shots | Balls stopped dead mid-roll with `residualOverlapAnomaly`; flows would fail R15.17 | `depenetrateToTolerance` in `shared/physics.ts` iterates measure-and-push (16 top-ups), cumulative push capped at `BALL_RADIUS` so genuine wedges still bail |
| Playwright browser run | 2026-08-25 | Scenery painted over the Course: three.js sorts by the nearest ancestor Group's `renderOrder` (`groupOrder`) before mesh-level `renderOrder`, and the Course group and bare root meshes sat at 0 | fairway invisible; pine and mountain colours sampled inside the terrain silhouette | every layer boundary expressed on a Group (`client/src/renderer.ts`); verified by pixel sampling |
| First kane-cli flow run | 2026-08-26 | A seven-sentence flow objective bifurcated down to its first clause: kane navigated, declared the objective complete, and exited `passed` (code 0) without filling an input or firing a Shot | false green - exit-code-only gating reported PASS on a run that never touched the game | flow objectives are one flowing sentence of then-clauses (the A-1 probe's proven grammar), and the flow script gates on the transcript showing the `IN_HOLE` assertion readout, not on kane's exit code |
| Kane flow runs 2-6 | 2026-08-26 | Objective-shape sweep against the planner: comma-chain objective bifurcated to navigation-only; three runs without a Navigate clause hung in cloud setup after TMS test creation (killed at ~18 min, zero agent steps); the A-1 "Then"-sentence grammar with a fill-inputs clause also bifurcated to navigation-only | five non-verdict runs; the substance gate caught both false greens, the hangs were killed manually | the working hypothesis, to be tested: the one full-execution run in project history (the A-1 probe) used three short sentences with one simple action each, `--headless`, and no `--mode`/`--assertion-mode` overrides; the flow now matches that shape exactly, and the fill-inputs clause moves to a later flow since the Arena 1 witness shot needs only the defaults |

## Observations (not defects)

- A headless or occluded browsing context throttles `setInterval` past the ~83 ms absorb window, so
  `overlay-anomaly-count` climbs through R3.18 discards. This is the specified behaviour, and
  R15.25 already obliges flows to keep the context visible - which is why `arena-1-hole-out.mjs`
  runs kane-cli without `--headless`.
