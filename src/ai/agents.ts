import { Rng } from '../engine/dice';
import { pipCount } from '../engine/helpers';
import { enumerateTurnOutcomes, TurnOutcome } from '../engine/turns';
import { BoardState, Player } from '../engine/types';
import { chooseTurn } from './evaluate';
import { Net } from './network';

/**
 * A full-turn policy: given the position, the player on roll, and the
 * rolled die values, pick how to play the whole turn (null = dance).
 * Shared by the benchmark harness and any future in-app difficulty levels.
 */
export type MoveChooser = (
  board: BoardState,
  player: Player,
  dice: number[],
  rng: Rng,
) => TurnOutcome | null;

export const randomAgent: MoveChooser = (board, player, dice, rng) => {
  const outcomes = enumerateTurnOutcomes(board, player, dice);
  if (outcomes.length === 0) return null;
  return outcomes[Math.floor(rng() * outcomes.length)];
};

/** Maximize the pip lead: hits and races, blind to blots and structure. */
export const greedyPipAgent: MoveChooser = (board, player, dice) => {
  const outcomes = enumerateTurnOutcomes(board, player, dice);
  if (outcomes.length === 0) return null;
  let best = outcomes[0];
  let bestLead = -Infinity;
  for (const outcome of outcomes) {
    const lead =
      pipCount(outcome.board, player === 'white' ? 'black' : 'white') -
      pipCount(outcome.board, player);
    if (lead > bestLead) {
      bestLead = lead;
      best = outcome;
    }
  }
  return best;
};

export function neuralAgent(net: Net): MoveChooser {
  return (board, player, dice) => chooseTurn(net, board, player, dice);
}
