import { atom } from 'jotai';
import {
  acceptDouble,
  canOfferDouble,
  declineDouble,
  offerDouble,
} from '../engine/cube';
import { isOpeningRoll, rollOpening, rollTurn, swapDice } from '../engine/dice';
import { getPoint, isPointIndex } from '../engine/helpers';
import { applyMove, endTurn, undoLastMove, winner } from '../engine/moves';
import { getLegalMoves } from '../engine/rules';
import { initialGameState } from '../engine/setup';
import { CheckerLocation, GameState, Player } from '../engine/types';

export const gameStateAtom = atom<GameState>(initialGameState());

export const legalMovesAtom = atom((get) => getLegalMoves(get(gameStateAtom)));

/**
 * The die a tap will play next: the first unused one in display order —
 * unless forced play leaves it with no legal moves, in which case the
 * active die skips ahead to one that has some (so the game never looks
 * stuck behind an unplayable die).
 */
export const currentDieAtom = atom((get) => {
  const unused = get(gameStateAtom).dice.filter((d) => !d.used);
  const legal = get(legalMovesAtom);
  const playable = unused.find((d) => legal.some((m) => m.die === d.value));
  return (playable ?? unused[0])?.value ?? null;
});

/** Stacks that can legally move with the current die — tap one to play it. */
export const tappableSourcesAtom = atom((get) => {
  const die = get(currentDieAtom);
  return new Set<CheckerLocation>(
    get(legalMovesAtom)
      .filter((m) => m.die === die)
      .map((m) => m.from),
  );
});

/** True once the player has consumed at least one die this turn. */
export const canUndoAtom = atom((get) =>
  get(gameStateAtom).dice.some((d) => d.used),
);

export const winnerAtom = atom((get) => winner(get(gameStateAtom)));

export const gameResultAtom = atom((get) => get(gameStateAtom).result);

export const canDoubleAtom = atom((get) => canOfferDouble(get(gameStateAtom)));

export const offerDoubleAtom = atom(null, (get, set) => {
  if (!get(canDoubleAtom)) return;
  set(gameStateAtom, offerDouble(get(gameStateAtom)));
});

export const acceptDoubleAtom = atom(null, (get, set) => {
  set(gameStateAtom, acceptDouble(get(gameStateAtom)));
});

export const declineDoubleAtom = atom(null, (get, set) => {
  set(gameStateAtom, declineDouble(get(gameStateAtom)));
});

export const rollAtom = atom(null, (get, set) => {
  const game = get(gameStateAtom);
  if (game.phase !== 'rolling') return;
  set(
    gameStateAtom,
    isOpeningRoll(game) ? rollOpening(game, Math.random) : rollTurn(game, Math.random),
  );
});

/** Tap the dice to flip which one plays first. */
export const swapDiceAtom = atom(null, (get, set) => {
  set(gameStateAtom, swapDice(get(gameStateAtom)));
});

export const endTurnAtom = atom(null, (get, set) => {
  set(gameStateAtom, endTurn(get(gameStateAtom)));
});

export const undoAtom = atom(null, (get, set) => {
  if (!get(canUndoAtom)) return;
  set(gameStateAtom, undoLastMove(get(gameStateAtom)));
});

export const newGameAtom = atom(null, (_get, set) => {
  set(gameStateAtom, initialGameState());
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
 * One-tap movement: tapping a stack plays its move with the current die,
 * provided that exact move is legal under the forced-play rules. Swap the
 * dice to play the other die first.
 */
export const tapLocationAtom = atom(null, (get, set, tap: TapPayload) => {
  const game = get(gameStateAtom);
  if (game.phase !== 'moving') return;
  if (!ownsStack(game, tap)) return;
  const die = get(currentDieAtom);
  const move = get(legalMovesAtom).find(
    (m) => m.from === tap.location && m.die === die,
  );
  if (move) set(gameStateAtom, applyMove(game, move));
});

function ownsStack(game: GameState, tap: TapPayload): boolean {
  if (tap.player !== undefined && tap.player !== game.turn) return false;
  if (!isPointIndex(tap.location)) return true; // legality already checked the bar
  return getPoint(game.board, tap.location)?.player === game.turn;
}
