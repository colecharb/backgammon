import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../engine/rng';
import {
  accumulateHeadGradient,
  makeParamVector,
} from '../../../train/backprop';
import { encodeBoard } from '../encoding';
import { initialBoard } from '../../engine/setup';
import {
  deserializeNet,
  forward,
  initNet,
  makeActivations,
  Net,
  NetMeta,
  NUM_OUTPUTS,
  serializeNet,
  sigmoid,
} from '../network';

function tinyNet(): Net {
  // Small, fixed net so gradients and goldens are cheap and deterministic.
  const inputs = 6;
  const hidden = 4;
  const outputs = NUM_OUTPUTS;
  const rng = mulberry32(99);
  const fill = (n: number) => Float32Array.from({ length: n }, () => rng() - 0.5);
  return {
    inputs,
    hidden,
    outputs,
    W1: fill(inputs * hidden),
    b1: fill(hidden),
    W2: fill(outputs * hidden),
    b2: fill(outputs),
  };
}

describe('forward', () => {
  it('matches a hand-computed single-unit network', () => {
    const net: Net = {
      inputs: 2,
      hidden: 1,
      outputs: 5,
      W1: Float32Array.from([0.5, -0.25]), // input-major [inputs][hidden]
      b1: Float32Array.from([0.1]),
      W2: Float32Array.from([1, 2, 3, 4, 5]),
      b2: Float32Array.from([0, -1, 0, 1, 0]),
    };
    const x = Float32Array.from([1, 2]);
    const h = sigmoid(0.1 + 1 * 0.5 + 2 * -0.25);
    const o = forward(net, x);
    expect(o[0]).toBeCloseTo(sigmoid(1 * h), 6);
    expect(o[1]).toBeCloseTo(sigmoid(2 * h - 1), 6);
    expect(o[4]).toBeCloseTo(sigmoid(5 * h), 6);
  });

  it('produces identical results with and without scratch buffers', () => {
    const net = initNet(16, mulberry32(3));
    const x = encodeBoard(initialBoard(), 'white');
    const act = makeActivations(net);
    expect([...forward(net, x, act)]).toEqual([...forward(net, x)]);
  });

  it('outputs stay in (0, 1)', () => {
    const net = initNet(32, mulberry32(11));
    const o = forward(net, encodeBoard(initialBoard(), 'black'));
    for (const p of o) {
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(1);
    }
  });
});

describe('serialization', () => {
  it('round-trips weights and meta through JSON', () => {
    const net = initNet(8, mulberry32(5));
    const meta: NetMeta = { version: 1, encoding: 'v0-196', hidden: 8, games: 123 };
    const restored = deserializeNet(serializeNet(net, meta));
    expect(restored.meta).toEqual(meta);
    const x = encodeBoard(initialBoard(), 'white');
    const a = forward(net, x);
    const b = forward(restored.net, x);
    for (let k = 0; k < a.length; k++) expect(b[k]).toBeCloseTo(a[k], 5);
  });

  it('refuses weights trained on a different encoding', () => {
    const net = initNet(8, mulberry32(5));
    const meta = { version: 1, encoding: 'v1-999', hidden: 8, games: 0 } as NetMeta;
    expect(() => deserializeNet(serializeNet(net, meta))).toThrow(/encode/);
  });

  it('refuses truncated weight arrays', () => {
    const net = initNet(8, mulberry32(5));
    const meta: NetMeta = { version: 1, encoding: 'v0-196', hidden: 8, games: 0 };
    const raw = JSON.parse(serializeNet(net, meta));
    raw.W1 = raw.W1.slice(0, 10);
    expect(() => deserializeNet(raw)).toThrow(/W1/);
  });
});

describe('backprop', () => {
  it('per-head gradients match finite differences', () => {
    const net = tinyNet();
    const x = Float32Array.from([1, 0, -0.5, 0, 2, 0.25]);
    const act = makeActivations(net);

    const params: ['W1', 'b1', 'W2', 'b2'] = ['W1', 'b1', 'W2', 'b2'];
    for (let k = 0; k < net.outputs; k++) {
      const grad = makeParamVector(net);
      const o = forward(net, x, act);
      accumulateHeadGradient(net, grad, k, x, act.h, o);

      for (const name of params) {
        const weights = net[name];
        for (let i = 0; i < weights.length; i++) {
          const saved = weights[i];
          const eps = 1e-2;
          weights[i] = saved + eps;
          const plus = forward(net, x)[k];
          weights[i] = saved - eps;
          const minus = forward(net, x)[k];
          weights[i] = saved;
          const numeric = (plus - minus) / (2 * eps);
          expect(grad[name][i]).toBeCloseTo(numeric, 3);
        }
      }
    }
  });
});
