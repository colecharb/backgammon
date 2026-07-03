import { atom } from 'jotai';
import { getPoint, isPointIndex } from '../engine/helpers';
import { applyMove, canPlace } from '../engine/moves';
import { initialGameState } from '../engine/setup';
import { BoardState, CheckerLocation, GameState, Player } from '../engine/types';

export const gameStateAtom = atom<GameState>(initialGameState());

/** UI-only: the checker stack the user has picked up, if any. */
export interface CheckerSelection {
  location: CheckerLocation;
  player: Player;
}

export const selectedAtom = atom<CheckerSelection | null>(null);

export interface TapPayload {
  location: CheckerLocation;
  /**
   * Which player's checkers the tapped element belongs to. Required for
   * bar/off (both players share those regions); ignored for points, where
   * the stack owner is authoritative.
   */
  player?: Player;
}

/**
 * The whole tap-tap interaction: first tap selects a stack, second tap moves
 * its top checker there (or deselects when re-tapping the same stack).
 * Taps on closed points keep the current selection.
 */
export const tapLocationAtom = atom(null, (get, set, tap: TapPayload) => {
  const game = get(gameStateAtom);
  const selected = get(selectedAtom);

  if (selected) {
    const sameSpot =
      selected.location === tap.location &&
      (tap.player === undefined || tap.player === selected.player);
    if (sameSpot) {
      set(selectedAtom, null);
      return;
    }
    if (!canPlace(game.board, selected.player, tap.location)) return;
    set(
      gameStateAtom,
      applyMove(game, {
        player: selected.player,
        from: selected.location,
        to: tap.location,
      }),
    );
    set(selectedAtom, null);
    return;
  }

  const player =
    tap.player ??
    (isPointIndex(tap.location) ? getPoint(game.board, tap.location)?.player : undefined);
  if (player === undefined || !hasChecker(game.board, player, tap.location)) return;
  set(selectedAtom, { location: tap.location, player });
});

function hasChecker(
  board: BoardState,
  player: Player,
  location: CheckerLocation,
): boolean {
  if (!isPointIndex(location)) return board[location][player] > 0;
  return getPoint(board, location)?.player === player;
}

/**
 * Locations the current selection could move to. Today everything open is
 * fair game; once dice rules land this derives from getLegalMoves instead.
 */
export const openDestinationsAtom = atom<CheckerLocation[]>((get) => {
  const selected = get(selectedAtom);
  if (!selected) return [];
  const { board } = get(gameStateAtom);
  const points = Array.from({ length: 24 }, (_, i) => i + 1).filter((p) =>
    canPlace(board, selected.player, p),
  );
  return [...points, 'bar', 'off'];
});
