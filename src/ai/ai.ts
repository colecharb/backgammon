import { canOfferDouble } from '../engine/cube';
import { opponent } from '../engine/helpers';
import { getLegalMoves } from '../engine/rules';
import { GameState, Player } from '../engine/types';
import { encodeBoard } from './encoding';
import { equity } from './evaluate';
import { forward, Net } from './network';

export type PlayerKind = 'human' | 'computer';
export type Players = Record<Player, PlayerKind>;

export type ComputerAction =
  | { kind: 'roll' }
  | { kind: 'playBestMove' }
  | { kind: 'endTurn' }
  | { kind: 'offerDouble' }
  | { kind: 'take' }
  | { kind: 'drop' };

export interface ScheduledAction {
  action: ComputerAction;
  /** Pacing so the human can watch the computer act. */
  delayMs: number;
}

/**
 * Crude v0 cube thresholds on cubeless equity (the net knows nothing about
 * cube ownership): take a double down to −0.5 (the classic 25% take
 * point), offer one when clearly ahead but not so far that the opponent
 * should drop and gammon value is wasted.
 */
export const TAKE_POINT = -0.5;
export const OFFER_DOUBLE_MIN = 0.55;
export const OFFER_DOUBLE_MAX = 0.9;

/** Pre-roll cubeless equity from the on-roll player's view. */
function onRollEquity(net: Net, game: GameState): number {
  return equity(forward(net, encodeBoard(game.board, game.turn)));
}

/**
 * What the computer should do next, or null when it's not a computer's
 * decision. Pure decision table over the phase machine — one action per
 * call; applying it changes the state, which schedules the next one.
 */
export function nextComputerAction(
  game: GameState,
  players: Players,
  net: Net,
): ScheduledAction | null {
  const actor = game.phase === 'doubled' ? opponent(game.turn) : game.turn;
  if (players[actor] !== 'computer') return null;

  switch (game.phase) {
    case 'rolling': {
      const wantsDouble =
        canOfferDouble(game) &&
        onRollEquity(net, game) >= OFFER_DOUBLE_MIN &&
        onRollEquity(net, game) <= OFFER_DOUBLE_MAX;
      if (wantsDouble) return { action: { kind: 'offerDouble' }, delayMs: 800 };
      return { action: { kind: 'roll' }, delayMs: 600 };
    }
    case 'doubled': {
      // The offerer (game.turn) rolls next, so their view is on-roll.
      const takerEquity = -onRollEquity(net, game);
      const kind = takerEquity >= TAKE_POINT ? 'take' : 'drop';
      return { action: { kind }, delayMs: 800 };
    }
    case 'moving': {
      if (getLegalMoves(game).length > 0) {
        return { action: { kind: 'playBestMove' }, delayMs: 450 };
      }
      return { action: { kind: 'endTurn' }, delayMs: 500 };
    }
    case 'gameOver':
      return null;
  }
}
