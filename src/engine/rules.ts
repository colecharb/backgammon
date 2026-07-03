import {
  destinationFor,
  getPoint,
  isPointIndex,
  POINT_COUNT,
} from './helpers';
import { applyMoveToBoard, canPlace } from './moves';
import { BoardState, GameState, Player, PointIndex } from './types';

export interface LegalMove {
  player: Player;
  from: PointIndex | 'bar';
  to: PointIndex | 'off';
  die: number;
}

export function unusedDiceValues(state: GameState): number[] {
  return state.dice.filter((d) => !d.used).map((d) => d.value);
}

/** Pips from `from` to off the board edge for `player`. */
export function distanceToOff(player: Player, from: PointIndex): number {
  return player === 'white' ? from : POINT_COUNT + 1 - from;
}

/** Bearing off requires every checker home (within 6 pips) and none on the bar. */
export function canBearOff(board: BoardState, player: Player): boolean {
  if (board.bar[player] > 0) return false;
  return board.points.every(
    (point, i) => point?.player !== player || distanceToOff(player, i + 1) <= 6,
  );
}

/**
 * Every placement of a single die, ignoring the other dice: bar entry takes
 * absolute priority; bear-off needs an exact die or, from the farthest
 * occupied point only, a larger one.
 */
export function movesForDie(
  board: BoardState,
  player: Player,
  die: number,
): LegalMove[] {
  if (board.bar[player] > 0) {
    const to = destinationFor(player, 'bar', die);
    if (isPointIndex(to) && canPlace(board, player, to)) {
      return [{ player, from: 'bar', to, die }];
    }
    return [];
  }

  const bearing = canBearOff(board, player);
  let farthest = 0;
  if (bearing) {
    board.points.forEach((point, i) => {
      if (point?.player === player) {
        farthest = Math.max(farthest, distanceToOff(player, i + 1));
      }
    });
  }

  const moves: LegalMove[] = [];
  board.points.forEach((point, i) => {
    if (point?.player !== player) return;
    const from = i + 1;
    const to = destinationFor(player, from, die);
    if (to === 'off') {
      const distance = distanceToOff(player, from);
      if (bearing && (die === distance || distance === farthest)) {
        moves.push({ player, from, to, die });
      }
    } else if (canPlace(board, player, to)) {
      moves.push({ player, from, to, die });
    }
  });
  return moves;
}

/**
 * All moves the player may make right now, enforcing forced play: a turn
 * must use as many dice as possible, and when only one of two different
 * dice can be played, it must be the larger. Only moves that keep a
 * maximal sequence reachable are returned.
 */
export function getLegalMoves(state: GameState): LegalMove[] {
  if (state.phase !== 'moving') return [];
  const dice = unusedDiceValues(state);
  if (dice.length === 0) return [];
  const { board, turn: player } = state;

  const total = maxPlayLength(board, player, dice);
  if (total === 0) return [];

  let candidates: LegalMove[] = [];
  for (const die of new Set(dice)) {
    for (const move of movesForDie(board, player, die)) {
      const after = boardAfter(board, move);
      if (1 + maxPlayLength(after, player, removeOne(dice, die)) === total) {
        candidates.push(move);
      }
    }
  }

  // Only one die playable but either would do: the larger is compulsory.
  if (total === 1) {
    const values = new Set(candidates.map((m) => m.die));
    if (values.size > 1) {
      const larger = Math.max(...values);
      candidates = candidates.filter((m) => m.die === larger);
    }
  }
  return candidates;
}

export function hasLegalMoves(state: GameState): boolean {
  return getLegalMoves(state).length > 0;
}

/** Longest playable sequence length using `dice` (in any order). */
function maxPlayLength(board: BoardState, player: Player, dice: number[]): number {
  let best = 0;
  for (const die of new Set(dice)) {
    for (const move of movesForDie(board, player, die)) {
      const length =
        1 + maxPlayLength(boardAfter(board, move), player, removeOne(dice, die));
      best = Math.max(best, length);
      if (best === dice.length) return best;
    }
  }
  return best;
}

function boardAfter(board: BoardState, move: LegalMove): BoardState {
  return applyMoveToBoard(board, move.player, move.from, move.to).board;
}

function removeOne(dice: number[], value: number): number[] {
  const index = dice.indexOf(value);
  return [...dice.slice(0, index), ...dice.slice(index + 1)];
}
