import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import { chooseTurn, evaluateAfterState } from '../../ai/evaluate';
import { defaultNet } from '../../ai/weights';
import { diceFromValues } from '../../engine/dice';
import { initialGameState } from '../../engine/setup';
import { enumerateTurnOutcomes } from '../../engine/turns';
import { rankedTurnsAtom } from '../analysis';
import { gameStateAtom } from '../game';

describe('rankedTurnsAtom', () => {
  it('is null outside the moving phase', () => {
    const store = createStore();
    expect(store.get(rankedTurnsAtom)).toBeNull();
  });

  it('ranks every distinct turn best-first and agrees with chooseTurn', () => {
    const store = createStore();
    const game = {
      ...initialGameState(),
      turn: 'white' as const,
      phase: 'moving' as const,
      dice: diceFromValues(3, 1),
    };
    store.set(gameStateAtom, game);

    const ranked = store.get(rankedTurnsAtom);
    expect(ranked).not.toBeNull();
    expect(ranked!.length).toBe(
      enumerateTurnOutcomes(game.board, 'white', [3, 1]).length,
    );
    for (let i = 1; i < ranked!.length; i++) {
      expect(ranked![i - 1].equity).toBeGreaterThanOrEqual(ranked![i].equity);
    }

    const best = chooseTurn(defaultNet, game.board, 'white', [3, 1]);
    expect(ranked![0].equity).toBeCloseTo(
      evaluateAfterState(defaultNet, best!.board, 'white'),
      6,
    );
  });
});
