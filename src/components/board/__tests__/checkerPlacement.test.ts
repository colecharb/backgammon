import { describe, expect, it } from 'vitest';
import { applyMoveToBoard } from '../../../engine/moves';
import { initialBoard } from '../../../engine/setup';
import { BoardState, CheckerLocation, Player, PointState } from '../../../engine/types';
import { CheckerPlacement, placeCheckers } from '../checkerPlacement';

interface Stack {
  player: Player;
  point: number;
  count: number;
}

function makeBoard(stacks: Stack[]): BoardState {
  const points: PointState[] = Array.from({ length: 24 }, () => null);
  for (const { player, point, count } of stacks) {
    points[point - 1] = { player, count };
  }
  return { points, bar: { white: 0, black: 0 }, off: { white: 0, black: 0 } };
}

function locationOf(placements: CheckerPlacement[], id: string): CheckerLocation | undefined {
  return placements.find((p) => p.id === id)?.location;
}

function idsAt(placements: CheckerPlacement[], location: CheckerLocation): string[] {
  return placements.filter((p) => p.location === location).map((p) => p.id);
}

describe('placeCheckers', () => {
  it('places all 15 checkers per player with contiguous stack indices', () => {
    const { placements } = placeCheckers(initialBoard(), new Map());
    for (const player of ['white', 'black'] as const) {
      expect(placements.filter((p) => p.player === player)).toHaveLength(15);
    }
    // Every location's checkers are indexed 0..count-1 with a matching count.
    const byLocation = new Map<CheckerLocation, CheckerPlacement[]>();
    for (const p of placements) {
      byLocation.set(p.location, [...(byLocation.get(p.location) ?? []), p]);
    }
    for (const group of byLocation.values()) {
      const indices = group.map((p) => p.stackIndex).sort((a, b) => a - b);
      expect(indices).toEqual(group.map((_, i) => i));
      expect(group.every((p) => p.stackCount === group.length)).toBe(true);
    }
    // White opens with two on point 24.
    expect(idsAt(placements, 24)).toHaveLength(2);
  });

  it('keeps every identity but the one that moved, and moves the top checker', () => {
    const board0 = initialBoard();
    const r0 = placeCheckers(board0, new Map());

    // The checker on top of point 13 is the one a move should lift.
    const topOf13 = r0.placements.find((p) => p.location === 13 && p.stackIndex === 4)!;

    const { board: board1 } = applyMoveToBoard(board0, 'white', 13, 7);
    const r1 = placeCheckers(board1, r0.next);

    const moved = [...r0.next.keys()].filter(
      (id) => locationOf(r0.placements, id) !== locationOf(r1.placements, id),
    );
    expect(moved).toEqual([topOf13.id]);
    expect(locationOf(r1.placements, topOf13.id)).toBe(7);

    // The four checkers left on 13 stay put — same id, same stack index — so
    // they never animate.
    for (const p of r0.placements.filter((c) => c.location === 13 && c.id !== topOf13.id)) {
      const after = r1.placements.find((c) => c.id === p.id)!;
      expect(after.location).toBe(13);
      expect(after.stackIndex).toBe(p.stackIndex);
    }
    expect(idsAt(r1.placements, 13)).toHaveLength(4);
    expect(idsAt(r1.placements, 7)).toEqual([topOf13.id]);
  });

  it('sends a hit blot to the bar while the hitter keeps its identity', () => {
    const board0 = makeBoard([
      { player: 'white', point: 7, count: 1 }, // the blot
      { player: 'white', point: 6, count: 5 },
      { player: 'white', point: 8, count: 3 },
      { player: 'white', point: 13, count: 5 },
      { player: 'white', point: 24, count: 1 },
      { player: 'black', point: 1, count: 2 },
      { player: 'black', point: 12, count: 5 },
      { player: 'black', point: 17, count: 3 },
      { player: 'black', point: 19, count: 5 },
    ]);
    const r0 = placeCheckers(board0, new Map());
    const blotId = idsAt(r0.placements, 7)[0];

    const { board: board1, hit } = applyMoveToBoard(board0, 'black', 1, 7);
    expect(hit).toBe(true);
    const r1 = placeCheckers(board1, r0.next);

    // The hit white checker keeps its id and flies to the bar.
    expect(locationOf(r1.placements, blotId)).toBe('bar');

    // Exactly one black checker moved from point 1 onto point 7.
    const blackMoved = [...r0.next.keys()].filter(
      (id) =>
        id.startsWith('black') &&
        locationOf(r0.placements, id) === 1 &&
        locationOf(r1.placements, id) === 7,
    );
    expect(blackMoved).toHaveLength(1);
    expect(idsAt(r1.placements, 7)).toEqual(blackMoved);
  });

  it('animates an undo by handing the checker back to its origin', () => {
    const board0 = initialBoard();
    const r0 = placeCheckers(board0, new Map());
    const { board: board1 } = applyMoveToBoard(board0, 'white', 13, 7);
    const r1 = placeCheckers(board1, r0.next);
    const movedId = idsAt(r1.placements, 7)[0];

    // Reverse the move; the same id should return to point 13.
    const { board: board2 } = applyMoveToBoard(board1, 'white', 7, 13);
    const r2 = placeCheckers(board2, r1.next);
    expect(locationOf(r2.placements, movedId)).toBe(13);
    expect(idsAt(r2.placements, 7)).toHaveLength(0);
  });
});
