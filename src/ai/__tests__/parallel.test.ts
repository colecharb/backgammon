import { describe, expect, it } from 'vitest';
import { makeParamVector } from '../../../train/backprop';
import { applyDelta, computeDeltaInPlace } from '../../../train/parallel';
import { makeTdState } from '../../../train/td';
import { playTrainingGame } from '../../../train/selfplay';
import { mulberry32 } from '../../engine/rng';
import { initNet, Net } from '../network';

function cloneNet(net: Net): Net {
  return {
    ...net,
    W1: net.W1.slice(),
    b1: net.b1.slice(),
    W2: net.W2.slice(),
    b2: net.b2.slice(),
  };
}

describe('delta shipping', () => {
  it('base + (trained − base) reproduces the trained weights exactly', () => {
    // Simulate one worker round trip: train locally from a base, ship the
    // delta, apply it to a master that still sits at the base.
    const base = initNet(16, mulberry32(21));
    const worker = cloneNet(base);
    playTrainingGame(worker, makeTdState(worker), { alpha: 0.1, lambda: 0.7 }, mulberry32(3));

    const delta = {
      W1: base.W1.slice(),
      b1: base.b1.slice(),
      W2: base.W2.slice(),
      b2: base.b2.slice(),
    };
    computeDeltaInPlace(delta, worker);

    const master = cloneNet(base);
    applyDelta(master, delta);
    for (const name of ['W1', 'b1', 'W2', 'b2'] as const) {
      for (let i = 0; i < master[name].length; i++) {
        expect(master[name][i]).toBeCloseTo(worker[name][i], 6);
      }
    }
  });

  it('deltas from different bases merge additively', () => {
    const master = initNet(8, mulberry32(5));
    const deltaA = makeParamVector(master);
    const deltaB = makeParamVector(master);
    deltaA.W2[3] = 0.25;
    deltaB.W2[3] = -0.1;
    deltaB.b1[0] = 0.5;

    const before = master.W2[3];
    applyDelta(master, deltaA);
    applyDelta(master, deltaB);
    expect(master.W2[3]).toBeCloseTo(before + 0.15, 6);
    expect(master.b1[0]).toBeCloseTo(0.5, 6);
  });
});
