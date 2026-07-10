import { describe, expect, it } from 'vitest';
import { playMatchGame, playSeries, playTrainingGame } from '../../../train/selfplay';
import { makeTdState } from '../../../train/td';
import { mulberry32 } from '../../engine/rng';
import { randomAgent } from '../agents';
import { initNet, Net } from '../network';

const CFG = { alpha: 0.1, lambda: 0.7 };

function trainSome(games: number): { net: Net; records: string[] } {
  const net = initNet(32, mulberry32(1234));
  const td = makeTdState(net);
  const rng = mulberry32(5678);
  const records: string[] = [];
  for (let i = 0; i < games; i++) {
    const r = playTrainingGame(net, td, CFG, rng);
    records.push(`${r.winner}:${r.kind}:${r.halfMoves}:${r.aborted}`);
  }
  return { net, records };
}

describe('playTrainingGame', () => {
  it('plays seeded games deterministically and learns finite weights', { timeout: 60_000 }, () => {
    const a = trainSome(15);
    const b = trainSome(15);
    expect(a.records).toEqual(b.records);
    expect([...a.net.W1]).toEqual([...b.net.W1]);
    expect([...a.net.b2]).toEqual([...b.net.b2]);

    // Weights moved away from the random init and stayed finite.
    const fresh = initNet(32, mulberry32(1234));
    let moved = 0;
    for (let i = 0; i < a.net.W2.length; i++) {
      if (a.net.W2[i] !== fresh.W2[i]) moved++;
      expect(Number.isFinite(a.net.W2[i])).toBe(true);
    }
    for (let i = 0; i < a.net.W1.length; i++) {
      expect(Number.isFinite(a.net.W1[i])).toBe(true);
    }
    expect(moved).toBeGreaterThan(a.net.W2.length / 2);
  });

  it('finishes most games under the safety cap', { timeout: 60_000 }, () => {
    // An untrained net plays near-randomly, so early games wander long;
    // most should still finish by bear-off rather than hitting the cap.
    const { records } = trainSome(15);
    const completed = records.filter((r) => r.endsWith(':false'));
    expect(completed.length).toBeGreaterThanOrEqual(10);
    for (const record of completed) {
      const halfMoves = Number(record.split(':')[2]);
      expect(halfMoves).toBeLessThan(1000);
    }
  });
});

describe('playMatchGame / playSeries', () => {
  it('runs a deterministic series between two agents', () => {
    const rng = mulberry32(9);
    const record = playMatchGame({ white: randomAgent, black: randomAgent }, rng);
    expect(['white', 'black']).toContain(record.winner);
    expect(record.points).toBeGreaterThanOrEqual(1);
    expect(record.points).toBeLessThanOrEqual(3);

    const series = playSeries(randomAgent, randomAgent, 20, mulberry32(10));
    expect(series.aWins + series.bWins + series.aborted).toBe(20);
    // Random vs random with alternating colors should be roughly even.
    expect(series.aWins).toBeGreaterThan(2);
    expect(series.bWins).toBeGreaterThan(2);
  });
});
