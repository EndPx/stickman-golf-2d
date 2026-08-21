# A-1 pre-flight result — REJECTED

**Assumption under test (A-1, `requirements.md`):** one Kane CLI agent step can dispatch a key
sequence containing more than one keypress, for example "press ArrowLeft four times", rather than
being limited to a single keypress per step.

**Result: the assumption does not hold.** Kane CLI dispatches one keypress per agent step, with a
full agent round trip between each.

## Environment

| | |
|---|---|
| Kane CLI | `@testmuai/kane-cli@0.8.4` (0.8.5 available) |
| Profile | `Albary`, env `prod`, oauth, token valid |
| Model | `v16-alpha` |
| Assertion mode | `dom` |
| Mode | `testing` |
| Target | `http://localhost:4173` (probe page, this directory) |
| Node | v24.18.0 |

## Method

`verification/probe/index.html` counts individual `keydown` events and groups them into **bursts**.
A burst is a run of keydowns with no gap longer than 400 ms. Browser auto-repeat sits at 30–50 ms;
a separate agent step costs a network round trip and lands seconds apart, so 400 ms separates the
two cleanly. The page exposes the counts as DOM text under `data-testid` attributes, which is also
a rehearsal of the real overlay contract.

If one step carries N presses, the page sees **1 burst of size N**.
If each step carries one press, the page sees **N bursts of size 1**.

## Run 1 — natural phrasing

Objective: navigate to the probe, *"press the ArrowLeft key exactly 4 times"*, then read the counters.
Flags: `--max-steps 12 --timeout 420 --headless --agent`

| Measurement | Value |
|---|---|
| Status | passed |
| `probe-keydown-count` | **4** |
| `probe-burst-count` | **4** |
| `probe-max-burst` | **1** |
| `probe-gaps` (ms) | **7819, 7348, 18728** |
| `overlay-aim-angle` | 20 (4 × 5°, mechanic correct) |
| Agent steps consumed | 8 (steps 2–9) for 1 navigation + 4 presses + reads |
| Wall-clock duration | 86.6 s |
| Credits | 23.73 |

Four presses arrived as four separate bursts of one, separated by 7.3 s, 7.8 s and 18.7 s. That is
one keypress per agent step.

## Run 2 — explicit batching instruction

Objective asked, in capitals, for six ArrowLeft presses *"dispatched together as a single batched
action, not six separate actions"*.
Flags: `--max-steps 10 --timeout 420 --headless --agent`

| Measurement | Value |
|---|---|
| Status | **failed** |
| Duration | 104.2 s |
| Kane's own summary | *"the automation split the work into separate key actions and kept retrying instead of completing the readout"* |

Explicitly requesting a batch did not produce one. It consumed the step budget retrying and never
reached the readout.

## Consequence

The blast radius recorded in `requirements.md` under Unverified Assumptions is now live:

`R4.13` (`ANGLE_STEP_DEGREES`, `POWER_STEP_PERCENT`) · `R7.1`–`R7.4` (per-press step sizes) ·
`R7.15` (power grid) · `R7.16` (angle grid) · `R15.3` (flow scope) · `R15.4` (step budget) ·
`R15.16` (Agent_Step definition) · `R15.22`, `R15.23` (step accounting) · `R18.35`, `R18.38`.

### The arithmetic that breaks

With one press per step, and the current grid:

- Aim: 72 reachable angles at 5°, default 0. Worst case **36 presses**, typical ~8.
- Power: 19 values at 5% over 10–100, default 50. Worst case **10 presses**, typical ~4.
- Fire: 1 press.

**Worst case 47 steps for a single shot. Typical ~13.** Against a budget of 15 steps per flow, one
shot can consume the entire budget. Arena 1 is par 2. Nothing fits.

At ~8 s per step, a 15-step flow also costs roughly two minutes of wall clock, and 47 steps would
cost six.

### Note on the budget itself

Kane CLI's own `--max-steps` default is **50**, not 15. The 15-step budget is self-imposed by this
project's brief, not a tool limit.

## Recommended resolution — an absolute input path

Do not coarsen the control grid. Coarsening aim to 15° and power to 25% would bring a shot down to
about 7 steps, but it directly damages arena 3 ("precision over power") and arena 4 ("approach
angle"), which is the difficulty curve `R15.15` forbids compromising.

Instead, add an **absolute** keyboard input path alongside the relative stepping one:

- Two DOM number inputs, aim and power, that the agent fills directly, plus space to fire.
- Cost per shot becomes **fill both fields (1 step) + fire (1 step) + status wait (1 step) = 3 steps**,
  independent of the target values.
- Par 4 then costs `1 navigate + 4 × 3 + 1 final read` = **14 steps**, inside the existing budget of
  15 with no widening.

Why this is the cheapest correct fix:

- It changes no physics constant, no arena geometry and no par value. The difficulty curve is
  untouched, so `R15.15` holds.
- It is still keyboard-only, so the brief's primary-path constraint holds.
- It does not create a second way to move a ball. `R8.1`–`R8.3` already require every input path to
  funnel through `shoot(angle, power)`; this is that clause used as intended, the same way the
  deferred pointer-drag method would be.
- Relative arrow stepping stays for human play, and remains the thing `R7.1`–`R7.4` describe.

Residual risk: even at 3 steps per shot, arenas 4 and 5 are marginal if a flow needs par + 1 shots
(17 steps). That is the same exposure already accepted as **O-5**, with the same stated fallback of
cutting arenas 4 and 5 from the submission rather than redesigning the harness.

## Reproducing

```bash
node verification/probe/serve.mjs 4173
kane-cli run "Navigate to http://localhost:4173 . Then press the ArrowLeft key exactly 4 times. Then read and report the text content of the elements with data-testid probe-keydown-count, probe-burst-count, probe-max-burst, probe-gaps and overlay-aim-angle." --max-steps 12 --timeout 420 --headless --agent
```

Raw NDJSON transcripts: `a1-run.ndjson` (run 1), `a1-run-batched.ndjson` (run 2).
