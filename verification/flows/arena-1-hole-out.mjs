// Kane Verification_Flow: Arena 1 holes out from the defaults (task 12).
//
// The closed loop, end to end through the real harness: kane-cli drives a real Chrome against the
// preview build, fills the absolute inputs (R7.19-R7.26 - three Agent_Steps per Shot per the A-1
// arithmetic), fires with Space, polls the frozen Debug_Overlay contract (Requirement 9) and must
// read IN_HOLE with exactly one Stroke and the capture latch set (R5.9, R13.1, R13.16).
//
// No --headless: R15.25 obliges the harness to keep its browsing context visible, because a
// throttled background tab discards Simulation_Steps as R3.18 anomalies and R15.17 fails any flow
// with a nonzero anomaly count.
//
// Run with the preview server up:  npm run build && npm run preview &
//                                  node verification/flows/arena-1-hole-out.mjs

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const transcriptPath = join(here, 'arena-1-hole-out.ndjson');

// Harness lessons so far, all recorded in verification/defects.md. Nine runs isolate the pattern:
// only --url with --mode testing and --assertion-mode dom reaches the agent step loop; and every
// objective carrying a Navigate clause - whatever its grammar - bifurcated onto that clause alone.
// This objective therefore carries no Navigate clause at all: --url opens ?arena=1 (its stated job
// is the first step's start URL), and the objective is pure actions on the page it finds there.
const objective = [
  'Press the Space key exactly once and wait until the element with data-testid overlay-status reads IN_HOLE .',
  'Then read and report the text content of the elements with data-testid overlay-status , overlay-p1-strokes , overlay-p1-hole-out and overlay-anomaly-count .',
  // R15.17 - a non-zero anomaly count fails the flow, same as any other assertion.
  'The test passes only if overlay-status reads IN_HOLE , overlay-p1-strokes reads 1 , overlay-p1-hole-out reads HOLED_OUT_BY_CAPTURE and overlay-anomaly-count reads 0 .',
].join(' ');

// The only flag set that reaches the agent step loop on the current cloud configuration.
const args = [
  'run',
  objective,
  '--url', 'http://localhost:4173/?arena=1',
  '--max-steps', '15',
  '--timeout', '420',
  '--assertion-mode', 'dom',
  '--mode', 'testing',
  '--agent',
];

console.log('kane-cli', args.map((arg) => (arg.includes(' ') ? JSON.stringify(arg) : arg)).join(' '));
console.log('');

const result = spawnSync('kane-cli', args, { stdio: ['ignore', 'pipe', 'inherit'], shell: true });

const stdout = result.stdout === null ? '' : result.stdout.toString();
if (stdout.length > 0) {
  writeFileSync(transcriptPath, stdout);
  process.stdout.write(stdout);
  console.log('');
}

console.log(`transcript written to ${transcriptPath}`);
console.log(`kane-cli exit code: ${String(result.status)}`);

// Kane's exit code alone is not the gate: the first run of this flow exited 0 with status "passed"
// having only navigated (defects.md). The transcript must show the run reaching the assertions - a
// passed run whose summary never mentions the IN_HOLE readout stopped short, and the flow fails.
const runEnds = stdout
  .split('\n')
  .filter((line) => line.startsWith('{"type":"run_end"'))
  .map((line) => JSON.parse(line));
const finalRun = runEnds[runEnds.length - 1];

const reachedAssertions =
  finalRun !== undefined &&
  `${finalRun.summary ?? ''} ${finalRun.one_liner ?? ''}`.includes('IN_HOLE');

if (finalRun === undefined || finalRun.status !== 'passed' || !reachedAssertions) {
  console.log(
    `FLOW FAILED - kane status ${String(finalRun?.status)}, assertion readout ${
      reachedAssertions ? 'present' : 'absent'
    } from the run summary`,
  );
  process.exit(1);
}

console.log('FLOW PASSED - IN_HOLE with one Stroke and the capture latch, read from the live overlay');
process.exit(0);
