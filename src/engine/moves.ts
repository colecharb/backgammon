import { getPoint, isPointIndex, opponent } from './helpers';
import { BoardState, GameState, Move, Player, PointIndex } from './types';

/**
 * Whether a checker of `player` may land on `to`.
 * Points blocked by two or more opposing checkers are closed; everything
 * else (own point, empty point, opposing blot, bar, off) is open.
 * Dice legality is a separate concern and does not live here.
 */
export function canPlace(board: BoardState, player: Player, to: Move['to']): boolean {
  if (!isPointIndex(to)) return true;
  const point = getPoint(board, to);
  return point === null || point.player === player || point.count === 1;
}

/**
 * Apply a move with no dice/turn legality checks (milestone 1: free movement).
 * Handles every location kind, hits opposing blots, and appends to history.
 * Throws if the source has no checker of the moving player or the destination
 * is a closed point — callers gate taps with canPlace.
 * Rules arrive later as getLegalMoves(state); this stays the single mutation point.
 */
export function applyMove(state: GameState, move: Move): GameState {
  if (!canPlace(state.board, move.player, move.to)) {
    throw new Error(`Point ${move.to} is closed to ${move.player}`);
  }
  let board = removeChecker(state.board, move.player, move.from);
  board = addChecker(board, move.player, move.to);
  return { ...state, board, history: [...state.history, move] };
}

function removeChecker(
  board: BoardState,
  player: Player,
  from: Move['from'],
): BoardState {
  if (from === 'bar' || from === 'off') {
    const count = board[from][player];
    if (count === 0) throw new Error(`No ${player} checker on ${from}`);
    return { ...board, [from]: { ...board[from], [player]: count - 1 } };
  }
  const point = getPoint(board, from);
  if (point?.player !== player) {
    throw new Error(`No ${player} checker on point ${from}`);
  }
  return setPoint(
    board,
    from,
    point.count === 1 ? null : { player, count: point.count - 1 },
  );
}

function addChecker(board: BoardState, player: Player, to: Move['to']): BoardState {
  if (to === 'bar' || to === 'off') {
    return { ...board, [to]: { ...board[to], [player]: board[to][player] + 1 } };
  }
  const point = getPoint(board, to);
  if (point === null) {
    return setPoint(board, to, { player, count: 1 });
  }
  if (point.player === player) {
    return setPoint(board, to, { player, count: point.count + 1 });
  }
  // Opposing blot: hit it to the bar.
  const enemy = opponent(player);
  const hit = setPoint(board, to, { player, count: 1 });
  return { ...hit, bar: { ...hit.bar, [enemy]: hit.bar[enemy] + 1 } };
}

function setPoint(
  board: BoardState,
  point: PointIndex,
  value: BoardState['points'][number],
): BoardState {
  const points = board.points.slice();
  points[point - 1] = value;
  return { ...board, points };
}
