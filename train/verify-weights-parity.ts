// Verify a Python-exported weight file plays identically in the app: load it
// with the app's own deserializeNet + forward and compare to the Python net's
// outputs on the same encodings. This is the train/serve parity gate for the
// Python trainer. Run:
//   npx tsx train/verify-weights-parity.ts <weights.json> <parity-probe.json>
// Exits non-zero if outputs differ by more than the tolerance.
import { readFileSync } from 'node:fs';
import { deserializeNet, forward } from '../src/ai/network';

const [weightsPath, probePath] = process.argv.slice(2);
if (!weightsPath || !probePath) {
  console.error('usage: tsx train/verify-weights-parity.ts <weights.json> <probe.json>');
  process.exit(2);
}

const { net } = deserializeNet(readFileSync(weightsPath, 'utf8'));
const probe = JSON.parse(readFileSync(probePath, 'utf8')) as {
  encodings: number[][];
  outputs: number[][];
};

let maxDiff = 0;
for (let i = 0; i < probe.encodings.length; i++) {
  const o = forward(net, Float32Array.from(probe.encodings[i]));
  for (let k = 0; k < o.length; k++) {
    maxDiff = Math.max(maxDiff, Math.abs(o[k] - probe.outputs[i][k]));
  }
}

const TOL = 1e-4;
console.log(
  `checked ${probe.encodings.length} samples; max |TS − Python| = ${maxDiff.toExponential(3)}`,
);
if (maxDiff > TOL) {
  console.error(`FAIL: parity difference ${maxDiff} exceeds ${TOL}`);
  process.exit(1);
}
console.log('PASS: app forward pass matches the Python net');
