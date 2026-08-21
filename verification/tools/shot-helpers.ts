// Shared helpers for the verification tools.
//
// Every tool launches a Ball through `shoot`, never by assembling a velocity itself. That is not
// tidiness: R8.9 makes the Shot_Controller the only writer of Ball velocity outside the Physics_Engine's
// per-step integration, and a tool that built its own launch vector would be quietly exercising
// different code from the game.

import { getArena, type ArenaNumber } from '../../shared/arenas.ts';
import {
  createArenaCollision,
  createBallAtRest,
  simulateShotToRest,
  type AdvanceOutcome,
  type ArenaCollision,
  type BallState,
} from '../../shared/physics.ts';
import { shoot } from '../../shared/shot.ts';
import type { Vector2 } from '../../shared/geometry.ts';

/** The Arena_Registry's collision view for one Arena, built once. */
export function collisionFor(arenaNumber: ArenaNumber): ArenaCollision {
  return createArenaCollision(getArena(arenaNumber));
}

/**
 * A Ball in motion, launched through `shoot` from the given resting position.
 *
 * Throws on rejection rather than returning a result, because every call site here supplies finite
 * arguments and a satisfied precondition, so a rejection means the tool itself is wrong.
 */
export function launchFrom(
  collision: ArenaCollision,
  from: Vector2,
  angleDegrees: number,
  powerPercent: number,
): BallState {
  const result = shoot(angleDegrees, powerPercent, {
    collision,
    ball: createBallAtRest(from),
    precondition: null,
  });

  if (!result.accepted) {
    throw new Error(
      `shoot rejected a tool launch at ${String(angleDegrees)} degrees and ${String(powerPercent)} percent: ${result.reason}`,
    );
  }
  return result.ball;
}

/** A Ball in motion, launched through `shoot` from the Arena's declared spawn point. */
export function launchFromSpawn(
  collision: ArenaCollision,
  angleDegrees: number,
  powerPercent: number,
): BallState {
  return launchFrom(collision, collision.arena.spawn, angleDegrees, powerPercent);
}

/** One whole Shot, from the Arena's spawn point to its terminal outcome. */
export function shotFromSpawn(
  collision: ArenaCollision,
  angleDegrees: number,
  powerPercent: number,
): AdvanceOutcome {
  return simulateShotToRest(collision, launchFromSpawn(collision, angleDegrees, powerPercent));
}

/** A tiny PASS/FAIL reporter shared by the tools. */
export function createReporter(): {
  report: (ok: boolean, label: string, detail: string) => void;
  finish: () => void;
} {
  let failures = 0;

  return {
    report(ok: boolean, label: string, detail: string): void {
      if (!ok) {
        failures += 1;
      }
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === '' ? '' : ` - ${detail}`}`);
    },
    finish(): void {
      console.log('');
      console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${String(failures)} CHECK(S) FAILED`);
      if (failures > 0) {
        process.exitCode = 1;
      }
    },
  };
}
