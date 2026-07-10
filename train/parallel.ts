// Training-only: nothing under src/ may import from train/.
import { Net } from '../src/ai/network';
import { addToNet, ParamVector } from './backprop';
import { GameRecord } from './selfplay';

/**
 * Message protocol between the trainer (main thread) and self-play
 * workers. Each round trip is one game: main sends the current master
 * weights, the worker plays one TD(λ) game on its private copy and
 * returns the weight delta it produced. Rounds are synchronous — all
 * workers share the same base weights and main folds their mean delta in
 * before the next round — so there is no staleness between deltas.
 */
export interface WeightsMessage {
  type: 'weights';
  W1: Float32Array;
  b1: Float32Array;
  W2: Float32Array;
  b2: Float32Array;
}

export interface StopMessage {
  type: 'stop';
}

export interface ResultMessage {
  type: 'result';
  record: GameRecord;
  delta: ParamVector;
}

export function weightsMessage(net: Net): WeightsMessage {
  // postMessage structured-clones typed arrays, so the worker gets its
  // own copies; no transfer list needed on this side.
  return { type: 'weights', W1: net.W1, b1: net.b1, W2: net.W2, b2: net.b2 };
}

/** base := current − base (in place), turning the old base into a delta. */
export function computeDeltaInPlace(base: ParamVector, current: Net): void {
  diff(base.W1, current.W1);
  diff(base.b1, current.b1);
  diff(base.W2, current.W2);
  diff(base.b2, current.b2);
}

/** net += scale · delta */
export function applyDelta(net: Net, delta: ParamVector, scale = 1): void {
  addToNet(net, delta, scale);
}

function diff(base: Float32Array, current: Float32Array): void {
  for (let i = 0; i < base.length; i++) base[i] = current[i] - base[i];
}
