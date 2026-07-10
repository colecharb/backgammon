import { describe, expect, it } from 'vitest';
import { rollDie } from '../dice';
import { applyMoveToBoard } from '../moves';
import { mulberry32 } from '../rng';
import { getLegalMoves, LegalMove } from '../rules';
import { initialBoard } from '../setup';
import { boardKey, enumerateTurnOutcomes } from '../turns';
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
    result: null,
  };
}

const moveKey = (m: LegalMove) => `${m.from}>${m.to}#${m.die}`;

describe('boardKey', () => {
  it('identifies a position and distinguishes different ones', () => {
    expect(boardKey(initialBoard())).toBe(boardKey(initialBoard()));
    const moved = applyMoveToBoard(initialBoard(), 'white', 24, 18).board;
    expect(boardKey(moved)).not.toBe(boardKey(initialBoard()));
  });
});

describe('enumerateTurnOutcomes', () => {
  it('replaying each outcome reproduces its board and key', () => {
    const outcomes = enumerateTurnOutcomes(initialBoard(), 'white', [6, 5]);
    expect(outcomes.length).toBeGreaterThan(0);
    for (const outcome of outcomes) {
      let board = initialBoard();
      for (const move of outcome.moves) {
        board = applyMoveToBoard(board, move.player, move.from, move.to).board;
      }
      expect(boardKey(board)).toBe(outcome.key);
      expect(board).toEqual(outcome.board);
    }
  });

  it('dedups outcomes by final position', () => {
    const outcomes = enumerateTurnOutcomes(initialBoard(), 'white', [6, 5]);
    const keys = outcomes.map((o) => o.key);
    expect(new Set(keys).size).toBe(keys.length);
    // 24/18 then 18/13 and 24/19 then 19/13 collapse to one 24/13 outcome.
    const lovers = outcomes.filter(
      (o) => o.moves.some((m) => m.from === 24) && o.moves.some((m) => m.to === 13),
    );
    expect(lovers).toHaveLength(1);
  });

  it('keeps only maximal sequences (must use both dice)', () => {
    // Same fixture as rules.test.ts: playing 1 as 6→5 forfeits the 6.
    const board = makeBoard(
      [
        { player: 'white', point: 7, count: 1 },
        { player: 'white', point: 6, count: 1 },
        { player: 'black', point: 1, count: 2 },
      ],
      {},
      { white: 13 },
    );
    const outcomes = enumerateTurnOutcomes(board, 'white', [6, 1]);
    expect(outcomes.length).toBeGreaterThan(0);
    for (const outcome of outcomes) {
      expect(outcome.moves).toHaveLength(2);
      expect(outcome.moves[0]).toEqual({ player: 'white', from: 7, to: 6, die: 1 });
    }
  });

  it('forces the larger die when only one die can be played', () => {
    const board = makeBoard([
      { player: 'white', point: 24, count: 1 },
      { player: 'black', point: 13, count: 2 },
    ]);
    const outcomes = enumerateTurnOutcomes(board, 'white', [6, 5]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].moves).toEqual([{ player: 'white', from: 24, to: 18, die: 6 }]);
  });

  it('plays as many dice of a double as fit', () => {
    // White dances behind a wall after two 6es: only 24→18→12 plays.
    const board = makeBoard([
      { player: 'white', point: 24, count: 1 },
      { player: 'black', point: 6, count: 2 },
      { player: 'black', point: 19, count: 2 },
    ]);
    const outcomes = enumerateTurnOutcomes(board, 'white', [6, 6, 6, 6]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].moves.map(moveKey)).toEqual(['24>18#6', '18>12#6']);
  });

  it('returns [] on a dance', () => {
    const board = makeBoard(
      [
        { player: 'black', point: 21, count: 2 },
        { player: 'black', point: 22, count: 2 },
      ],
      { white: 1 },
    );
    expect(enumerateTurnOutcomes(board, 'white', [3, 4])).toEqual([]);
  });

  it('handles doubles without exploding', () => {
    const outcomes = enumerateTurnOutcomes(initialBoard(), 'black', [3, 3, 3, 3]);
    expect(outcomes.length).toBeGreaterThan(5);
    expect(outcomes.length).toBeLessThan(500);
    for (const outcome of outcomes) expect(outcome.moves).toHaveLength(4);
  });

  it('agrees with getLegalMoves across random playouts', () => {
    // Soundness: every outcome's first move is legal. Completeness: every
    // legal move extends to a maximal sequence whose final board appears in
    // the outcome set (composition property).
    const rng = mulberry32(2026);
    let positionsChecked = 0;
    for (let game = 0; game < 30; game++) {
      let board = initialBoard();
      let player: Player = 'white';
      for (let turn = 0; turn < 60; turn++) {
        const a = rollDie(rng);
        const b = rollDie(rng);
        const dice = a === b ? [a, a, a, a] : [a, b];
        const outcomes = enumerateTurnOutcomes(board, player, dice);
        const legal = getLegalMoves(makeState(board, player, dice));

        if (outcomes.length === 0) {
          expect(legal).toEqual([]);
        } else {
          positionsChecked++;
          const legalKeys = new Set(legal.map(moveKey));
          const outcomeKeys = new Set(outcomes.map((o) => o.key));
          const depth = outcomes[0].moves.length;

          for (const outcome of outcomes) {
            expect(legalKeys.has(moveKey(outcome.moves[0]))).toBe(true);
          }
          for (const move of legal) {
            const after = applyMoveToBoard(board, player, move.from, move.to).board;
            const rest = enumerateTurnOutcomes(
              after,
              player,
              removeOne(dice, move.die),
            );
            if (rest.length === 0) {
              expect(depth).toBe(1);
              expect(outcomeKeys.has(boardKey(after))).toBe(true);
            } else {
              expect(rest[0].moves.length + 1).toBe(depth);
              for (const continuation of rest) {
                expect(outcomeKeys.has(continuation.key)).toBe(true);
              }
            }
          }
          // Advance the playout with a random legal outcome.
          const next = outcomes[Math.floor(rng() * outcomes.length)];
          board = next.board;
          if (board.off[player] === 15) break;
        }
        player = player === 'white' ? 'black' : 'white';
      }
    }
    expect(positionsChecked).toBeGreaterThan(500);
  });
});

function removeOne(dice: number[], value: number): number[] {
  const index = dice.indexOf(value);
  return [...dice.slice(0, index), ...dice.slice(index + 1)];
}
