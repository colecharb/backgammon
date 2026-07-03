import { POINT_COUNT } from './helpers';
import { BoardState, GameState, Player, PointIndex, PointState } from './types';

const STARTING_STACKS: Record<Player, [PointIndex, number][]> = {
  white: [
    [24, 2],
    [13, 5],
    [8, 3],
    [6, 5],
  ],
  black: [
    [1, 2],
    [12, 5],
    [17, 3],
    [19, 5],
  ],
};

export function initialBoard(): BoardState {
  const points: PointState[] = Array.from({ length: POINT_COUNT }, () => null);
  for (const player of ['white', 'black'] as const) {
    for (const [point, count] of STARTING_STACKS[player]) {
      points[point - 1] = { player, count };
    }
  }
  return {
    points,
    bar: { white: 0, black: 0 },
    off: { white: 0, black: 0 },
  };
}

export function initialGameState(): GameState {
  return {
    board: initialBoard(),
    turn: 'white',
    dice: [],
    history: [],
    cube: { value: 1, owner: null },
  };
}
