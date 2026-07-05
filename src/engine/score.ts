import { isInHomeBoard, opponent } from './helpers';
import { BoardState, Player } from './types';

export const WIN_MULTIPLIER = { single: 1, gammon: 2, backgammon: 3 } as const;

/**
 * Grade a bear-off win: gammon if the loser has borne off nothing,
 * backgammon if additionally they still have a checker on the bar or in
 * the winner's home board.
 */
export function winKind(
  board: BoardState,
  winner: Player,
): 'single' | 'gammon' | 'backgammon' {
  const loser = opponent(winner);
  if (board.off[loser] > 0) return 'single';
  const trapped =
    board.bar[loser] > 0 ||
    board.points.some(
      (point, i) => point?.player === loser && isInHomeBoard(winner, i + 1),
    );
  return trapped ? 'backgammon' : 'gammon';
}
