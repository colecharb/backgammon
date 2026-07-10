// Self-play worker thread: one TD(λ) game per weights message, replying
// with the weight delta. Spawned by td-train.ts with --workers > 1.
// Training-only: nothing under src/ may import from train/.
import { parentPort, workerData } from 'node:worker_threads';
import { NUM_INPUTS } from '../src/ai/encoding';
import { Net, NUM_OUTPUTS } from '../src/ai/network';
import { mulberry32 } from '../src/engine/rng';
import { computeDeltaInPlace, ResultMessage, StopMessage, WeightsMessage } from './parallel';
import { playTrainingGame } from './selfplay';
import { makeTdState, TdConfig } from './td';

const { hidden, cfg, seed } = workerData as {
  hidden: number;
  cfg: TdConfig;
  seed: number;
};

const net: Net = {
  inputs: NUM_INPUTS,
  hidden,
  outputs: NUM_OUTPUTS,
  W1: new Float32Array(NUM_INPUTS * hidden),
  b1: new Float32Array(hidden),
  W2: new Float32Array(NUM_OUTPUTS * hidden),
  b2: new Float32Array(NUM_OUTPUTS),
};
const td = makeTdState(net);
const rng = mulberry32(seed);

parentPort!.on('message', (msg: WeightsMessage | StopMessage) => {
  if (msg.type === 'stop') {
    parentPort!.close();
    return;
  }
  net.W1.set(msg.W1);
  net.b1.set(msg.b1);
  net.W2.set(msg.W2);
  net.b2.set(msg.b2);

  const record = playTrainingGame(net, td, cfg, rng);

  // The cloned message arrays are ours: reuse them as the delta buffers
  // (base := trained − base) and transfer them back without copying.
  const base = { W1: msg.W1, b1: msg.b1, W2: msg.W2, b2: msg.b2 };
  computeDeltaInPlace(base, net);
  const reply: ResultMessage = { type: 'result', record, delta: base };
  const transfer = [base.W1.buffer, base.b1.buffer, base.W2.buffer, base.b2.buffer];
  parentPort!.postMessage(reply, transfer as ArrayBuffer[]);
});
