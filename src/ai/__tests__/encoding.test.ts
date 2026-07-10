import { describe, expect, it } from 'vitest';
import { rollDie } from '../../engine/dice';
import { mulberry32 } from '../../engine/rng';
import { initialBoard } from '../../engine/setup';
import { enumerateTurnOutcomes } from '../../engine/turns';
import { BoardState, Player, PointState } from '../../engine/types';
import { encodeBoard, mirrorBoard, NUM_INPUTS } from '../encoding';

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

/** Feature offsets for slot (1-based): hero units at +0..3, opponent at +4..7. */
const slot = (s: number) => (s - 1) * 8;

describe('encodeBoard', () => {
  it('encodes the opening position for white (golden values)', () => {
    const x = encodeBoard(initialBoard(), 'white');
    expect(x).toHaveLength(NUM_INPUTS);

    // White's 5 checkers on point 6 → hero slot 6: [1,1,1,1].
    expect([...x.slice(slot(6), slot(6) + 4)]).toEqual([1, 1, 1, 1]);
    // White's 3 on point 8 → [1,1,1,0]; 2 on point 24 → [1,1,0,0].
    expect([...x.slice(slot(8), slot(8) + 4)]).toEqual([1, 1, 1, 0]);
    expect([...x.slice(slot(24), slot(24) + 4)]).toEqual([1, 1, 0, 0]);
    // Black's 2 on point 1 → opponent units of slot 1.
    expect([...x.slice(slot(1) + 4, slot(1) + 8)]).toEqual([1, 1, 0, 0]);
    // Black's 5 on point 19 → opponent units of slot 19.
    expect([...x.slice(slot(19) + 4, slot(19) + 8)]).toEqual([1, 1, 1, 1]);
    // Empty point 2: all zero.
    expect([...x.slice(slot(2), slot(2) + 8)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    // Nobody on the bar or off.
    expect([...x.slice(192)]).toEqual([0, 0, 0, 0]);
  });

  it('encodes the opening position for black through the mirror', () => {
    const x = encodeBoard(initialBoard(), 'black');
    // Black's 5 on physical point 19 = 6 pips from home edge → hero slot 6.
    expect([...x.slice(slot(6), slot(6) + 4)]).toEqual([1, 1, 1, 1]);
    // White's 2 on physical 24 → opponent units of slot 1.
    expect([...x.slice(slot(1) + 4, slot(1) + 8)]).toEqual([1, 1, 0, 0]);
  });

  it('scales stacks, bar, and off', () => {
    const board = makeBoard(
      [{ player: 'white', point: 13, count: 7 }],
      { white: 3, black: 1 },
      { white: 5, black: 10 },
    );
    const x = encodeBoard(board, 'white');
    expect([...x.slice(slot(13), slot(13) + 4)]).toEqual([1, 1, 1, 2]);
    expect(x[192]).toBe(1.5); // own bar / 2
    expect(x[193]).toBe(0.5);
    expect(x[194]).toBeCloseTo(5 / 15);
    expect(x[195]).toBeCloseTo(10 / 15);
  });

  it('reuses and clears a scratch buffer', () => {
    const scratch = new Float32Array(NUM_INPUTS).fill(9);
    const x = encodeBoard(initialBoard(), 'white', scratch);
    expect(x).toBe(scratch);
    expect(x).toEqual(encodeBoard(initialBoard(), 'white'));
  });

  it('mirror identity: encode(b, p) === encode(mirror(b), opponent(p))', () => {
    // Walk random positions to exercise bars, blots, and bear-off.
    const rng = mulberry32(7);
    let board = initialBoard();
    let player: Player = 'white';
    for (let turn = 0; turn < 200; turn++) {
      expect(encodeBoard(board, 'white')).toEqual(encodeBoard(mirrorBoard(board), 'black'));
      expect(encodeBoard(board, 'black')).toEqual(encodeBoard(mirrorBoard(board), 'white'));
      const a = rollDie(rng);
      const b = rollDie(rng);
      const outcomes = enumerateTurnOutcomes(board, player, a === b ? [a, a, a, a] : [a, b]);
      if (outcomes.length > 0) {
        board = outcomes[Math.floor(rng() * outcomes.length)].board;
        if (board.off[player] === 15) break;
      }
      player = player === 'white' ? 'black' : 'white';
    }
  });

  it('mirrorBoard is an involution', () => {
    expect(mirrorBoard(mirrorBoard(initialBoard()))).toEqual(initialBoard());
  });
});
