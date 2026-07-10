// Training-only: nothing under src/ may import from train/, so Metro never
// bundles the trainer into the app.
import { Net } from '../src/ai/network';

/**
 * A vector in parameter space, laid out like the Net's weights. Used for
 * per-head gradients and TD(λ) eligibility traces.
 */
export interface ParamVector {
  W1: Float32Array;
  b1: Float32Array;
  W2: Float32Array;
  b2: Float32Array;
}

export function makeParamVector(net: Net): ParamVector {
  return {
    W1: new Float32Array(net.W1.length),
    b1: new Float32Array(net.b1.length),
    W2: new Float32Array(net.W2.length),
    b2: new Float32Array(net.b2.length),
  };
}

export function zeroParams(v: ParamVector): void {
  v.W1.fill(0);
  v.b1.fill(0);
  v.W2.fill(0);
  v.b2.fill(0);
}

export function scaleParams(v: ParamVector, s: number): void {
  scale(v.W1, s);
  scale(v.b1, s);
  scale(v.W2, s);
  scale(v.b2, s);
}

/** net += s · v */
export function addToNet(net: Net, v: ParamVector, s: number): void {
  axpy(net.W1, v.W1, s);
  axpy(net.b1, v.b1, s);
  axpy(net.W2, v.W2, s);
  axpy(net.b2, v.b2, s);
}

/**
 * v += ∇(output head k) evaluated at the forward pass (x, h, o).
 * `hiddenScratch` (length net.hidden) avoids allocating in the hot loop.
 */
export function accumulateHeadGradient(
  net: Net,
  v: ParamVector,
  k: number,
  x: Float32Array,
  h: Float32Array,
  o: Float32Array,
  hiddenScratch?: Float32Array,
): void {
  const { inputs, hidden } = net;
  const g2 = o[k] * (1 - o[k]);
  const row2 = k * hidden;

  v.b2[k] += g2;
  const gh = hiddenScratch ?? new Float32Array(hidden);
  for (let j = 0; j < hidden; j++) {
    v.W2[row2 + j] += g2 * h[j];
    gh[j] = g2 * net.W2[row2 + j] * h[j] * (1 - h[j]);
    v.b1[j] += gh[j];
  }
  for (let i = 0; i < inputs; i++) {
    const xi = x[i];
    if (xi === 0) continue;
    const row1 = i * hidden;
    for (let j = 0; j < hidden; j++) v.W1[row1 + j] += xi * gh[j];
  }
}

function scale(a: Float32Array, s: number): void {
  for (let i = 0; i < a.length; i++) a[i] *= s;
}

/** a += s · b */
function axpy(a: Float32Array, b: Float32Array, s: number): void {
  for (let i = 0; i < a.length; i++) a[i] += s * b[i];
}
