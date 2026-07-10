import { applyMoveToBoard } from './moves';
import { LegalMove, movesForDie } from './rules';
import { BoardState, Player } from './types';

/** One way a whole turn can play out: the sequence and where it lands. */
export interface TurnOutcome {
  /** Ordered moves; replaying them via applyMoveToBoard reproduces `board`. */
  moves: LegalMove[];
  board: BoardState;
  key: string;
}

/**
 * Canonical identity of a board position: one cell per point
 * ('.' or owner initial + count) plus bar and off counts.
 */
export function boardKey(board: BoardState): string {
  let key = '';
  for (const point of board.points) {
    key += point ? (point.player === 'white' ? 'w' : 'b') + point.count : '.';
  }
  return (
    key +
    `|${board.bar.white},${board.bar.black}` +
    `|${board.off.white},${board.off.black}`
  );
}

/**
 * Every distinct way `player` can play out `dice` from `board`, deduped by
 * resulting position. Legality and application delegate to movesForDie and
 * applyMoveToBoard, so outcomes agree with getLegalMoves move-by-move:
 * only maximal sequences are kept (a turn must use as many dice as
 * possible), and when only a single die can be played but either would do,
 * the larger is compulsory. Empty result = no legal play (a dance).
 *
 * `dice` are the unused die values, e.g. [6, 1] or [4, 4, 4, 4].
 */
export function enumerateTurnOutcomes(
  board: BoardState,
  player: Player,
  dice: number[],
): TurnOutcome[] {
  const terminals: TurnOutcome[] = [];
  let maxDepth = 0;
  // Transposition guard: identical board + remaining dice explores once.
  // Doubles reach the same position through many move orders; without this
  // the search degenerates into thousands of duplicate sequences.
  const seen = new Set<string>();

  const search = (b: BoardState, remaining: number[], moves: LegalMove[]) => {
    const node = boardKey(b) + '#' + [...remaining].sort().join('');
    if (seen.has(node)) return;
    seen.add(node);

    let extended = false;
    for (const die of new Set(remaining)) {
      for (const move of movesForDie(b, player, die)) {
        extended = true;
        search(
          applyMoveToBoard(b, player, move.from, move.to).board,
          removeOne(remaining, die),
          [...moves, move],
        );
      }
    }
    if (!extended && moves.length > 0) {
      terminals.push({ moves, board: b, key: boardKey(b) });
      maxDepth = Math.max(maxDepth, moves.length);
    }
  };
  search(board, dice, []);

  let outcomes = terminals.filter((t) => t.moves.length === maxDepth);

  // Larger-die rule, mirroring getLegalMoves: only one die playable but
  // either would do — the larger is compulsory. Must run before dedup so a
  // position reachable by both dice keeps its larger-die sequence.
  if (maxDepth === 1) {
    const values = new Set(outcomes.map((t) => t.moves[0].die));
    if (values.size > 1) {
      const larger = Math.max(...values);
      outcomes = outcomes.filter((t) => t.moves[0].die === larger);
    }
  }

  const byKey = new Map<string, TurnOutcome>();
  for (const outcome of outcomes) {
    if (!byKey.has(outcome.key)) byKey.set(outcome.key, outcome);
  }
  return [...byKey.values()];
}

function removeOne(dice: number[], value: number): number[] {
  const index = dice.indexOf(value);
  return [...dice.slice(0, index), ...dice.slice(index + 1)];
}
