import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import { diceFromValues } from '../../engine/dice';
import { initialGameState } from '../../engine/setup';
import { computerActionAtom } from '../../state/ai';
import {
  canUndoAtom,
  gameStateAtom,
  playersAtom,
  rollAtom,
  tapLocationAtom,
} from '../../state/game';
import { nextComputerAction } from '../ai';
import { defaultNet } from '../weights';

describe('computer vs computer through the app atoms', () => {
  it('plays a complete game to gameOver', { timeout: 30_000 }, () => {
    const store = createStore();
    store.set(playersAtom, { white: 'computer', black: 'computer' });

    for (let step = 0; step < 5000; step++) {
      const game = store.get(gameStateAtom);
      if (game.phase === 'gameOver') break;
      const next = nextComputerAction(game, store.get(playersAtom), defaultNet);
      expect(next, `no action for phase ${game.phase}`).not.toBeNull();
      const before = store.get(gameStateAtom);
      store.set(computerActionAtom, next!.action);
      expect(store.get(gameStateAtom), `${next!.action.kind} was a no-op`).not.toBe(before);
    }

    const finished = store.get(gameStateAtom);
    expect(finished.phase).toBe('gameOver');
    expect(finished.result).not.toBeNull();
    const { winner, kind } = finished.result!;
    if (kind === 'drop') {
      expect(finished.board.off[winner]).toBeLessThan(15);
    } else {
      expect(finished.board.off[winner]).toBe(15);
    }
  });
});

describe('human action atoms are inert on a computer turn', () => {
  it('cannot roll for the computer', () => {
    const store = createStore();
    store.set(playersAtom, { white: 'human', black: 'computer' });
    const state = { ...initialGameState(), turn: 'black' as const, history: [{ player: 'white' as const, from: 24, to: 23 }] };
    store.set(gameStateAtom, state);
    store.set(rollAtom);
    expect(store.get(gameStateAtom)).toBe(state);
  });

  it('cannot move the computer’s checkers or undo its moves', () => {
    const store = createStore();
    store.set(playersAtom, { white: 'human', black: 'computer' });
    const moving = {
      ...initialGameState(),
      turn: 'black' as const,
      phase: 'moving' as const,
      dice: diceFromValues(3, 4),
    };
    store.set(gameStateAtom, moving);
    store.set(tapLocationAtom, { location: 1 });
    expect(store.get(gameStateAtom)).toBe(moving);

    const afterMove = {
      ...moving,
      dice: [
        { value: 3, used: true },
        { value: 4, used: false },
      ],
      history: [{ player: 'black' as const, from: 1, to: 4, die: 3 }],
    };
    store.set(gameStateAtom, afterMove);
    expect(store.get(canUndoAtom)).toBe(false);
  });

  it('still lets the human act on their own turn', () => {
    const store = createStore();
    store.set(playersAtom, { white: 'human', black: 'computer' });
    store.set(gameStateAtom, {
      ...initialGameState(),
      history: [{ player: 'black' as const, from: 1, to: 2 }],
    });
    store.set(rollAtom);
    expect(store.get(gameStateAtom).phase).toBe('moving');
  });
});
