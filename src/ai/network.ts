import { Rng } from '../engine/dice';
import { ENCODING_ID, NUM_INPUTS } from './encoding';

/**
 * A single-hidden-layer MLP with sigmoid activations throughout. The same
 * forward pass evaluates positions during training (Node) and in the app,
 * so there is no train/serve skew: weights move between the two as JSON.
 *
 * Outputs (GNU Backgammon layout, all from the on-roll player's view):
 *   [P(win), P(win gammon or bg), P(win bg), P(lose gammon or bg), P(lose bg)]
 */
export interface Net {
  inputs: number;
  hidden: number;
  outputs: number;
  /** Input-major [inputs][hidden]: rows of zero input skip whole strides. */
  W1: Float32Array;
  b1: Float32Array;
  /** Output-major [outputs][hidden]. */
  W2: Float32Array;
  b2: Float32Array;
}

export const NUM_OUTPUTS = 5;

export interface NetMeta {
  version: 1;
  /** Feature-encoding identity; loading refuses a mismatch (skew guard). */
  encoding: string;
  hidden: number;
  /** Self-play games trained so far (cumulative across resumes). */
  games: number;
  trainedAt?: string;
}

/** Reusable activation buffers for allocation-free evaluation loops. */
export interface Activations {
  h: Float32Array;
  o: Float32Array;
}

export function makeActivations(net: Net): Activations {
  return { h: new Float32Array(net.hidden), o: new Float32Array(net.outputs) };
}

export function forward(net: Net, x: Float32Array, act?: Activations): Float32Array {
  const { inputs, hidden, outputs, W1, b1, W2, b2 } = net;
  const h = act?.h ?? new Float32Array(hidden);
  const o = act?.o ?? new Float32Array(outputs);
  h.set(b1);
  for (let i = 0; i < inputs; i++) {
    const xi = x[i];
    if (xi === 0) continue;
    const row = i * hidden;
    for (let j = 0; j < hidden; j++) h[j] += xi * W1[row + j];
  }
  for (let j = 0; j < hidden; j++) h[j] = sigmoid(h[j]);
  for (let k = 0; k < outputs; k++) {
    let sum = b2[k];
    const row = k * hidden;
    for (let j = 0; j < hidden; j++) sum += W2[row + j] * h[j];
    o[k] = sigmoid(sum);
  }
  return o;
}

export function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/** Xavier-uniform weights, zero biases. */
export function initNet(hidden: number, rng: Rng): Net {
  const inputs = NUM_INPUTS;
  const outputs = NUM_OUTPUTS;
  const uniform = (n: number, r: number) =>
    Float32Array.from({ length: n }, () => (rng() * 2 - 1) * r);
  return {
    inputs,
    hidden,
    outputs,
    W1: uniform(inputs * hidden, Math.sqrt(6 / (inputs + hidden))),
    b1: new Float32Array(hidden),
    W2: uniform(outputs * hidden, Math.sqrt(6 / (hidden + outputs))),
    b2: new Float32Array(outputs),
  };
}

export function serializeNet(net: Net, meta: NetMeta): string {
  const round = (a: Float32Array) => Array.from(a, (v) => Number(v.toPrecision(7)));
  return JSON.stringify({
    meta,
    inputs: net.inputs,
    hidden: net.hidden,
    outputs: net.outputs,
    W1: round(net.W1),
    b1: round(net.b1),
    W2: round(net.W2),
    b2: round(net.b2),
  });
}

export function deserializeNet(data: unknown): { net: Net; meta: NetMeta } {
  const raw = (typeof data === 'string' ? JSON.parse(data) : data) as {
    meta: NetMeta;
    inputs: number;
    hidden: number;
    outputs: number;
    W1: number[];
    b1: number[];
    W2: number[];
    b2: number[];
  };
  if (raw?.meta?.encoding !== ENCODING_ID) {
    throw new Error(
      `Weights encode features as '${raw?.meta?.encoding}', expected '${ENCODING_ID}'`,
    );
  }
  const expect = (name: string, arr: number[], length: number) => {
    if (arr.length !== length) {
      throw new Error(`Bad weights: ${name} has ${arr.length} values, expected ${length}`);
    }
    return Float32Array.from(arr);
  };
  return {
    net: {
      inputs: raw.inputs,
      hidden: raw.hidden,
      outputs: raw.outputs,
      W1: expect('W1', raw.W1, raw.inputs * raw.hidden),
      b1: expect('b1', raw.b1, raw.hidden),
      W2: expect('W2', raw.W2, raw.outputs * raw.hidden),
      b2: expect('b2', raw.b2, raw.outputs),
    },
    meta: raw.meta,
  };
}
