import {
  BoardState,
  CheckerLocation,
  Player,
  PointIndex,
  PointState,
} from './types';

export const POINT_COUNT = 24;
export const CHECKERS_PER_PLAYER = 15;

export function opponent(player: Player): Player {
  return player === 'white' ? 'black' : 'white';
}

/** White travels 24→1 (direction -1), black travels 1→24 (direction +1). */
export function direction(player: Player): 1 | -1 {
  return player === 'white' ? -1 : 1;
}

export function isPointIndex(location: CheckerLocation): location is PointIndex {
  return typeof location === 'number';
}

export function getPoint(board: BoardState, point: PointIndex): PointState {
  return board.points[point - 1] ?? null;
}

/**
 * Where a checker lands moving `die` pips from `from`;
 * 'off' if it travels past the board edge.
 */
export function destinationFor(
  player: Player,
  from: PointIndex | 'bar',
  die: number,
): PointIndex | 'off' {
  const start = from === 'bar' ? (player === 'white' ? POINT_COUNT + 1 : 0) : from;
  const dest = start + die * direction(player);
  if (dest < 1 || dest > POINT_COUNT) return 'off';
  return dest;
}

/** Pips remaining to bear off everything; a checker on the bar counts as 25. */
export function pipCount(board: BoardState, player: Player): number {
  let pips = board.bar[player] * (POINT_COUNT + 1);
  board.points.forEach((point, i) => {
    if (point?.player !== player) return;
    const index = i + 1;
    const distance = player === 'white' ? index : POINT_COUNT + 1 - index;
    pips += point.count * distance;
  });
  return pips;
}
