# Stickman Golf 2D

A browser-based, turn-based, two-player 2D mini-golf game. Two players connect through a room
code, alternate shots within an arena, and progress through a course of five arenas of rising
difficulty. Strokes accumulate across the course; lowest total wins.

## What this project is actually about

The game is the vehicle. The deliverable is a **closed verification loop**: an external AI browser
agent ([Kane CLI](https://github.com/LambdaTest/kane-cli)) plays the game using only the keyboard,
reads game state back from a DOM debug overlay, discovers real defects, and those failures feed
into fixes.

A canvas is opaque to selector-based tooling — there is no DOM to query, so nothing can assert
anything about game state. The solution is a debug overlay that exposes state as plain DOM text.
That overlay is the **formal, frozen contract** between the game and any external verifier. Its
field identifiers and value spellings do not change once defined, because tests are written against
those exact strings.

The overlay and the verification harness are first-class parts of the product, not test scaffolding
bolted on at the end.

## Stack

| Concern | Choice |
|---|---|
| Rendering | Three.js, orthographic camera, single plane |
| Server | Colyseus — authoritative state, room management, turn enforcement |
| Language | TypeScript, strict mode |
| Client build | Vite |
| Physics | Hand-written: velocity integration, friction decay, wall reflection, radius check |
| Verification | Kane CLI, DOM assertion mode |

No physics library. No additional test runner. The dependency set is exactly TypeScript, Vite,
Three.js, Colyseus and the Colyseus browser client.

## Design constraints worth knowing

- **Keyboard only.** Arrows adjust aim and power, space fires. Every input path funnels through one
  `shoot(angle, power)` function; no other code path may move a ball.
- **Fixed 60-step simulation clock**, driven from a time source that is not the render callback, so
  a shot behaves identically on a 60Hz and a 144Hz display.
- **Difficulty comes from geometry, never from physics constants.** All five arenas share one
  constant set, so skill transfers between them.
- **Arenas are data.** One registry module holds geometry, spawn, hole, par and obstacles for all
  five. Adding or retuning an arena never touches rendering or physics.
- **A dropped client never stalls a match.** The remaining player plays on to completion with no
  input from them. Verification runs two browsers as parallel processes and one will die.

## Repository layout

```
.kiro/specs/stickman-golf-2d/   requirements.md and tasks.md — the contract and the plan
shared/                          Physics engine, constants, arena registry, geometry
client/                          Vite app: renderer, input, overlay
server/                          Colyseus room
verification/flows/              Kane CLI *_test.md flows
docs/asset-requests.md           Running list of art requests
```

## Status

Specification complete. Implementation not started.

See `.kiro/specs/stickman-golf-2d/tasks.md` for the plan, its milestone, and an explicit record of
what is descoped and what is consequently left unverified.
