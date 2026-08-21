// Loads the Constants_Module under plain Node and prints every value it exposes.
//
// This is the R17.9 / task 3 acceptance check made repeatable: if the shared modules ever acquire a
// Three.js import, a transport import or a browser-only interface, this script stops running while
// the browser build keeps working, which is the failure mode R17.9 exists to prevent.
//
// Run with `node verification/tools/dump-constants.ts` - Node strips the types natively, so this
// needs no build step and no additional dependency.

import * as constants from '../../shared/constants.ts';

const entries = Object.entries(constants)
  .filter(([, value]) => typeof value !== 'function')
  .sort(([a], [b]) => a.localeCompare(b));

for (const [name, value] of entries) {
  console.log(`${name} = ${String(value)}`);
}

console.log('---');
console.log(`launchSpeedForPower(POWER_MIN_PERCENT) = ${String(constants.launchSpeedForPower(constants.POWER_MIN_PERCENT))}`);
console.log(`launchSpeedForPower(DEFAULT_POWER_PERCENT) = ${String(constants.launchSpeedForPower(constants.DEFAULT_POWER_PERCENT))}`);
console.log(`launchSpeedForPower(POWER_MAX_PERCENT) = ${String(constants.launchSpeedForPower(constants.POWER_MAX_PERCENT))}`);
console.log(`value count = ${String(entries.length)}`);
