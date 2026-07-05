import { describe, expect, it } from 'vitest';
import {
  acceptDouble,
  canOfferDouble,
  declineDouble,
  offerDouble,
  retractDouble,
} from '../cube';
import { applyMove } from '../moves';
import { winKind } from '../score';
import { initialGameState } from '../setup';
import { BoardState, GameState, Player, PointState } from '../types';

function makeBoard(
  stacks: { player: Player; point: number; count: number }[],
  bar: Partial<Record<Player, number>> = {},
  off: Partial<Record<Player, number>> = {},
): BoardState {
  const points: PointState[] = Array.from({ length: 24 }, () => null);
  for (const { player, point, count } of stacks) {
    points[point - 1] = { player, count };
  }
  return {
    points,
    bar: { white: 0, black: 0, ...bar },
    off: { white: 0, black: 0, ...off },
  };
}

/** A game already underway (past the opening roll), about to roll. */
function midGame(overrides: Partial<GameState> = {}): GameState {
  return {
    ...initialGameState(),
    history: [{ player: 'white', from: 13, to: 8, die: 5 }],
    phase: 'rolling',
    turn: 'black',
    ...overrides,
  };
}

describe('doubling', () => {
  it('may double before rolling with a centered or owned cube', () => {
    expect(canOfferDouble(midGame())).toBe(true);
    expect(canOfferDouble(midGame({ cube: { value: 2, owner: 'black' } }))).toBe(true);
    expect(canOfferDouble(midGame({ cube: { value: 2, owner: 'white' } }))).toBe(false);
    expect(canOfferDouble(midGame({ phase: 'moving' }))).toBe(false);
    expect(canOfferDouble(initialGameState())).toBe(false); // opening roll
    expect(canOfferDouble(midGame({ cube: { value: 64, owner: 'black' } }))).toBe(false);
  });

  it('take doubles the stake and hands the cube to the taker', () => {
    const offered = offerDouble(midGame());
    expect(offered.phase).toBe('doubled');
    const taken = acceptDouble(offered);
    expect(taken.cube).toEqual({ value: 2, owner: 'white' }); // black offered
    expect(taken.phase).toBe('rolling');
    expect(taken.turn).toBe('black'); // offerer still to roll
  });

  it('a pending offer can be retracted back to rolling', () => {
    const offered = offerDouble(midGame());
    expect(retractDouble(offered)).toEqual(midGame());
  });

  it('drop ends the game at the pre-double stake', () => {
    const offered = offerDouble(midGame({ cube: { value: 2, owner: 'black' } }));
    const dropped = declineDouble(offered);
    expect(dropped.phase).toBe('gameOver');
    expect(dropped.result).toEqual({ winner: 'black', kind: 'drop', points: 2 });
  });
});

describe('win kinds', () => {
  it('grades single, gammon, and backgammon', () => {
    const single = makeBoard([{ player: 'black', point: 19, count: 14 }], {}, { white: 15, black: 1 });
    expect(winKind(single, 'white')).toBe('single');

    const gammon = makeBoard([{ player: 'black', point: 12, count: 15 }], {}, { white: 15 });
    expect(winKind(gammon, 'white')).toBe('gammon');

    const inHome = makeBoard([{ player: 'black', point: 3, count: 15 }], {}, { white: 15 });
    expect(winKind(inHome, 'white')).toBe('backgammon');

    const onBar = makeBoard([{ player: 'black', point: 12, count: 14 }], { black: 1 }, { white: 15 });
    expect(winKind(onBar, 'white')).toBe('backgammon');
  });

  it('scores the final bear-off with the cube multiplier', () => {
    const board = makeBoard(
      [
        { player: 'white', point: 2, count: 1 },
        { player: 'black', point: 12, count: 15 },
      ],
      {},
      { white: 14 },
    );
    const state: GameState = {
      ...initialGameState(),
      board,
      phase: 'moving',
      dice: [{ value: 3, used: false }],
      cube: { value: 2, owner: 'white' },
    };
    const done = applyMove(state, { player: 'white', from: 2, to: 'off', die: 3 });
    // Gammon (nothing borne off) at cube 2 = 4 points.
    expect(done.result).toEqual({ winner: 'white', kind: 'gammon', points: 4 });
  });
});
