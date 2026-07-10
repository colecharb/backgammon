import { describe, expect, it } from 'vitest';
import {
  accumulateHeadGradient,
  makeParamVector,
  ParamVector,
} from '../../../train/backprop';
import { makeTdState, tdStep } from '../../../train/td';
import { mulberry32 } from '../../engine/rng';
import { equity, flipOutputs, Outputs } from '../evaluate';
import { forward, initNet, makeActivations, Net } from '../network';

const sampleOutputs = (): Outputs => Float32Array.from([0.62, 0.2, 0.05, 0.14, 0.03]);

describe('flipOutputs', () => {
  it('is an involution', () => {
    const o = sampleOutputs();
    expect([...flipOutputs(flipOutputs(o))].map((v) => v.toFixed(6))).toEqual(
      [...o].map((v) => v.toFixed(6)),
    );
  });

  it('negates equity', () => {
    const o = sampleOutputs();
    expect(equity(flipOutputs(o))).toBeCloseTo(-equity(o), 6);
  });

  it('swaps the winner and the gammon sides', () => {
    const o = sampleOutputs();
    const f = flipOutputs(o);
    expect(f[0]).toBeCloseTo(1 - o[0], 6);
    expect(f[1]).toBeCloseTo(o[3], 6);
    expect(f[2]).toBeCloseTo(o[4], 6);
    expect(f[3]).toBeCloseTo(o[1], 6);
    expect(f[4]).toBeCloseTo(o[2], 6);
  });
});

function cloneNet(net: Net): Net {
  return {
    ...net,
    W1: net.W1.slice(),
    b1: net.b1.slice(),
    W2: net.W2.slice(),
    b2: net.b2.slice(),
  };
}

/** ∇V^k at (x, h, o), one fresh vector per head. */
function headGradients(net: Net, x: Float32Array, h: Float32Array, o: Float32Array) {
  return Array.from({ length: net.outputs }, (_, k) => {
    const grad = makeParamVector(net);
    accumulateHeadGradient(net, grad, k, x, h, o);
    return grad;
  });
}

/** e ← λ·L(e) + g, computed independently of td.ts for cross-checking. */
function mixAndAdd(traces: ParamVector[], grads: ParamVector[], lambda: number) {
  const arrays: (keyof ParamVector)[] = ['W1', 'b1', 'W2', 'b2'];
  const like = (v: ParamVector, f: (name: keyof ParamVector, i: number) => number) => {
    const out: ParamVector = {
      W1: new Float32Array(v.W1.length),
      b1: new Float32Array(v.b1.length),
      W2: new Float32Array(v.W2.length),
      b2: new Float32Array(v.b2.length),
    };
    for (const name of arrays) {
      for (let i = 0; i < out[name].length; i++) out[name][i] = f(name, i);
    }
    return out;
  };
  const source = [0, 3, 4, 1, 2]; // L permutation; head 0 negates.
  return grads.map((g, k) =>
    like(g, (name, i) => {
      const mixed = traces[source[k]][name][i] * lambda * (k === 0 ? -1 : 1);
      return mixed + g[name][i];
    }),
  );
}

function randomInput(net: Net, seed: number): Float32Array {
  const rng = mulberry32(seed);
  return Float32Array.from({ length: net.inputs }, () => (rng() < 0.7 ? 0 : rng()));
}

describe('tdStep', () => {
  it('with λ=0 applies exactly α·Σ δ_k·∇V^k', () => {
    const net = initNet(8, mulberry32(1));
    const reference = cloneNet(net);
    const x = randomInput(net, 2);
    const act = makeActivations(net);
    const o = forward(net, x, act).slice();
    const h = act.h.slice();
    const delta = Float32Array.from([0.3, -0.1, 0.05, 0.2, -0.02]);
    const alpha = 0.1;

    const grads = headGradients(reference, x, h, o);
    tdStep(net, makeTdState(net), { alpha, lambda: 0 }, x, h, o, delta);

    for (const name of ['W1', 'b1', 'W2', 'b2'] as const) {
      for (let i = 0; i < net[name].length; i++) {
        let expected = reference[name][i];
        for (let k = 0; k < 5; k++) expected += alpha * delta[k] * grads[k][name][i];
        expect(net[name][i]).toBeCloseTo(expected, 5);
      }
    }
  });

  it('with λ>0 mixes traces across frames per the flip algebra', () => {
    const lambda = 0.7;
    const alpha = 0.05;
    const net = initNet(8, mulberry32(3));
    const reference = cloneNet(net);
    const td = makeTdState(net);
    const act = makeActivations(net);

    const x1 = randomInput(net, 10);
    const delta1 = Float32Array.from([0.2, 0.1, -0.05, -0.1, 0.02]);
    const x2 = randomInput(net, 11);
    const delta2 = Float32Array.from([-0.15, 0.05, 0.01, 0.2, -0.03]);

    // Step 1 on the real net.
    const o1 = forward(net, x1, act).slice();
    const h1 = act.h.slice();
    tdStep(net, td, { alpha, lambda }, x1, h1, o1, delta1);

    // Expected step 1 against the reference copy: traces = ∇V(s1).
    const zero = Array.from({ length: 5 }, () => makeParamVector(reference));
    const e1 = mixAndAdd(zero, headGradients(reference, x1, h1, o1), lambda);
    for (const name of ['W1', 'b1', 'W2', 'b2'] as const) {
      for (let i = 0; i < reference[name].length; i++) {
        for (let k = 0; k < 5; k++) {
          reference[name][i] += alpha * delta1[k] * e1[k][name][i];
        }
      }
    }

    // Step 2 on the real net (gradients under the post-step-1 weights).
    const o2 = forward(net, x2, act).slice();
    const h2 = act.h.slice();
    tdStep(net, td, { alpha, lambda }, x2, h2, o2, delta2);

    // Expected step 2: e2 = λ·L(e1) + ∇V(s2).
    const e2 = mixAndAdd(e1, headGradients(reference, x2, h2, o2), lambda);
    for (const name of ['W1', 'b1', 'W2', 'b2'] as const) {
      for (let i = 0; i < reference[name].length; i++) {
        for (let k = 0; k < 5; k++) {
          reference[name][i] += alpha * delta2[k] * e2[k][name][i];
        }
      }
    }

    for (const name of ['W1', 'b1', 'W2', 'b2'] as const) {
      for (let i = 0; i < net[name].length; i++) {
        expect(net[name][i]).toBeCloseTo(reference[name][i], 4);
      }
    }
  });
});
