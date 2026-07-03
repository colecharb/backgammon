import { atom } from 'jotai';
import { isOpeningRoll, rollOpening, rollTurn } from '../engine/dice';
import { getPoint, isPointIndex } from '../engine/helpers';
import { applyMove, endTurn, undoLastMove, winner } from '../engine/moves';
import { getLegalMoves } from '../engine/rules';
import { initialGameState } from '../engine/setup';
import { CheckerLocation, GameState, Player } from '../engine/types';

export const gameStateAtom = atom<GameState>(initialGameState());

/** UI-only: the checker stack the user has picked up, if any. */
export interface CheckerSelection {
  location: CheckerLocation;
  player: Player;
}

export const selectedAtom = atom<CheckerSelection | null>(null);

export const legalMovesAtom = atom((get) => getLegalMoves(get(gameStateAtom)));

/** Locations the current player may move a checker from right now. */
export const movableSourcesAtom = atom(
  (get) => new Set<CheckerLocation>(get(legalMovesAtom).map((m) => m.from)),
);

/** Where the selected checker may legally land. */
export const legalDestinationsAtom = atom((get) => {
  const selected = get(selectedAtom);
  if (!selected) return [] as CheckerLocation[];
  const destinations = get(legalMovesAtom)
    .filter((m) => m.from === selected.location)
    .map((m) => m.to as CheckerLocation);
  return [...new Set(destinations)];
});

/** True once the player has consumed at least one die this turn. */
export const canUndoAtom = atom((get) =>
  get(gameStateAtom).dice.some((d) => d.used),
);

export const winnerAtom = atom((get) => winner(get(gameStateAtom)));

export const rollAtom = atom(null, (get, set) => {
  const game = get(gameStateAtom);
  if (game.phase !== 'rolling') return;
  set(
    gameStateAtom,
    isOpeningRoll(game) ? rollOpening(game, Math.random) : rollTurn(game, Math.random),
  );
});

export const endTurnAtom = atom(null, (get, set) => {
  set(gameStateAtom, endTurn(get(gameStateAtom)));
  set(selectedAtom, null);
});

export const undoAtom = atom(null, (get, set) => {
  if (!get(canUndoAtom)) return;
  set(gameStateAtom, undoLastMove(get(gameStateAtom)));
  set(selectedAtom, null);
});

export const newGameAtom = atom(null, (_get, set) => {
  set(gameStateAtom, initialGameState());
  set(selectedAtom, null);
});

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
 * The whole tap-tap interaction: first tap selects a stack that has legal
 * moves, second tap plays the matching legal move (or re-selects another
 * movable stack, or deselects when re-tapping the same one).
 */
export const tapLocationAtom = atom(null, (get, set, tap: TapPayload) => {
  const game = get(gameStateAtom);
  if (game.phase !== 'moving') return;
  const selected = get(selectedAtom);
  const legal = get(legalMovesAtom);

  if (selected) {
    const sameSpot =
      selected.location === tap.location &&
      (tap.player === undefined || tap.player === selected.player);
    if (sameSpot) {
      set(selectedAtom, null);
      return;
    }
    const candidates = legal.filter(
      (m) => m.from === selected.location && m.to === tap.location,
    );
    if (candidates.length > 0) {
      // Several dice can reach the same spot only when bearing off with an
      // overshoot available; spend the smallest die that works.
      const move = candidates.reduce((a, b) => (a.die <= b.die ? a : b));
      set(gameStateAtom, applyMove(game, move));
      set(selectedAtom, null);
      return;
    }
    // Not a destination — treat as switching selection if possible.
  }

  if (legal.some((m) => m.from === tap.location) && ownsStack(game, tap)) {
    set(selectedAtom, { location: tap.location, player: game.turn });
  }
});

function ownsStack(game: GameState, tap: TapPayload): boolean {
  if (tap.player !== undefined && tap.player !== game.turn) return false;
  if (!isPointIndex(tap.location)) return true; // legality already checked the bar
  return getPoint(game.board, tap.location)?.player === game.turn;
}
