import { describe, expect, it } from 'vitest';
import { diceFromValues, rollOpening, rollTurn, swapDice } from '../dice';
import { applyMove, undoLastMove } from '../moves';
import { canBearOff, getLegalMoves, movesForDie } from '../rules';
import { initialGameState } from '../setup';
import { BoardState, GameState, Player, PointState } from '../types';

interface Stack {
  player: Player;
  point: number;
  count: number;
}

function makeBoard(
  stacks: Stack[],
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

function makeState(board: BoardState, turn: Player, dice: number[]): GameState {
  return {
    board,
    turn,
    phase: 'moving',
    dice: dice.map((value) => ({ value, used: false })),
    history: [],
    cube: { value: 1, owner: null },
  };
}

describe('bar entry', () => {
  it('forces entry from the bar before any other move', () => {
    const board = makeBoard([{ player: 'white', point: 13, count: 5 }], { white: 1 });
    const moves = getLegalMoves(makeState(board, 'white', [3, 4]));
    expect(moves.every((m) => m.from === 'bar')).toBe(true);
    expect(moves.map((m) => m.to).sort()).toEqual([21, 22]);
  });

  it('returns no moves when the entry points are closed', () => {
    const board = makeBoard(
      [
        { player: 'black', point: 22, count: 2 },
        { player: 'black', point: 21, count: 2 },
      ],
      { white: 1 },
    );
    expect(getLegalMoves(makeState(board, 'white', [3, 4]))).toEqual([]);
  });
});

describe('forced play', () => {
  it('must use both dice: excludes a playable move that forfeits the second die', () => {
    // White on 7 and 6, dice [6,1]. Playing 1 as 7→6 brings everyone home so
    // the 6 bears off (length 2); playing 1 as 6→5 leaves 7 outside with no 6.
    const board = makeBoard(
      [
        { player: 'white', point: 7, count: 1 },
        { player: 'white', point: 6, count: 1 },
        { player: 'black', point: 1, count: 2 },
      ],
      {},
      { white: 13 },
    );
    const moves = getLegalMoves(makeState(board, 'white', [6, 1]));
    expect(moves).toEqual([{ player: 'white', from: 7, to: 6, die: 1 }]);
  });

  it('must play the larger die when only one of the two fits', () => {
    // White on 24 alone; 18 and 19 are open but 13 is closed, so 6-then-5
    // and 5-then-6 both dead-end after one move. The 6 is compulsory.
    const board = makeBoard([
      { player: 'white', point: 24, count: 1 },
      { player: 'black', point: 13, count: 2 },
    ]);
    const moves = getLegalMoves(makeState(board, 'white', [6, 5]));
    expect(moves).toEqual([{ player: 'white', from: 24, to: 18, die: 6 }]);
  });

  it('offers all four moves of a double', () => {
    const state = { ...initialGameState(), phase: 'moving' as const, dice: diceFromValues(3, 3) };
    let s: GameState = state;
    for (let i = 0; i < 4; i++) {
      const moves = getLegalMoves(s);
      expect(moves.length).toBeGreaterThan(0);
      expect(moves.every((m) => m.die === 3)).toBe(true);
      s = applyMove(s, moves[0]);
    }
    expect(getLegalMoves(s)).toEqual([]); // all four dice consumed
  });
});

describe('bearing off', () => {
  it('requires every checker home and none on the bar', () => {
    expect(canBearOff(makeBoard([{ player: 'white', point: 6, count: 15 }]), 'white')).toBe(true);
    expect(canBearOff(makeBoard([{ player: 'white', point: 7, count: 15 }]), 'white')).toBe(false);
    expect(
      canBearOff(makeBoard([{ player: 'white', point: 6, count: 14 }], { white: 1 }), 'white'),
    ).toBe(false);
    expect(canBearOff(makeBoard([{ player: 'black', point: 19, count: 15 }]), 'black')).toBe(true);
    expect(canBearOff(makeBoard([{ player: 'black', point: 18, count: 15 }]), 'black')).toBe(false);
  });

  it('bears off exactly, and allows overshoot only from the farthest point', () => {
    const board = makeBoard(
      [
        { player: 'white', point: 6, count: 2 },
        { player: 'white', point: 5, count: 2 },
      ],
      {},
      { white: 11 },
    );
    const sixes = movesForDie(board, 'white', 6);
    expect(sixes).toContainEqual({ player: 'white', from: 6, to: 'off', die: 6 });
    // No overshoot from 5 while 6 is still occupied.
    expect(sixes.filter((m) => m.to === 'off')).toHaveLength(1);

    const onlyFives = makeBoard([{ player: 'white', point: 4, count: 2 }], {}, { white: 13 });
    expect(movesForDie(onlyFives, 'white', 6)).toContainEqual({
      player: 'white',
      from: 4,
      to: 'off',
      die: 6,
    });
  });

  it('ends the game when the last checker bears off', () => {
    const board = makeBoard([{ player: 'white', point: 2, count: 1 }], {}, { white: 14 });
    const state = makeState(board, 'white', [2, 3]);
    const next = applyMove(state, { player: 'white', from: 2, to: 'off', die: 2 });
    expect(next.phase).toBe('gameOver');
    expect(next.board.off.white).toBe(15);
  });
});

describe('undo', () => {
  it('restores the board, dice, and history', () => {
    const state = { ...initialGameState(), phase: 'moving' as const, dice: diceFromValues(6, 5) };
    const [move] = getLegalMoves(state);
    const undone = undoLastMove(applyMove(state, move));
    expect(undone).toEqual(state);
  });

  it('returns a hit blot to its point', () => {
    const board = makeBoard([
      { player: 'white', point: 6, count: 1 },
      { player: 'black', point: 5, count: 1 },
    ]);
    const state = makeState(board, 'white', [1, 2]);
    const hitState = applyMove(state, { player: 'white', from: 6, to: 5, die: 1 });
    expect(hitState.board.bar.black).toBe(1);
    const undone = undoLastMove(hitState);
    expect(undone.board).toEqual(board);
  });
});

describe('dice', () => {
  const rngFrom = (values: number[]) => {
    let i = 0;
    return () => values[i++];
  };

  it('opening roll: higher die starts and plays both values, ties reroll', () => {
    // 0.99→6, 0.0→1; white wins the opening.
    let state = rollOpening(initialGameState(), rngFrom([0.99, 0.0]));
    expect(state.turn).toBe('white');
    expect(state.phase).toBe('moving');
    expect(state.dice.map((d) => d.value)).toEqual([6, 1]);

    // Tie (3,3) rerolls into (1,6); black starts.
    state = rollOpening(initialGameState(), rngFrom([0.5, 0.5, 0.0, 0.99]));
    expect(state.turn).toBe('black');
    expect(state.dice.map((d) => d.value)).toEqual([1, 6]);
  });

  it('swaps play order only while no die is used', () => {
    const state = { ...initialGameState(), phase: 'moving' as const, dice: diceFromValues(6, 2) };
    expect(swapDice(state).dice.map((d) => d.value)).toEqual([2, 6]);

    const oneUsed = { ...state, dice: [{ value: 6, used: true }, { value: 2, used: false }] };
    expect(swapDice(oneUsed)).toBe(oneUsed);
  });

  it('a rolled double yields four dice', () => {
    const state = { ...initialGameState(), turn: 'black' as const };
    const rolled = rollTurn(state, rngFrom([0.5, 0.5]));
    expect(rolled.dice).toHaveLength(4);
    expect(rolled.phase).toBe('moving');
  });
});
