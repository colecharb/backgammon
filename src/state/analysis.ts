import { atom } from 'jotai';
import { evaluateAfterState, makeEvalScratch } from '../ai/evaluate';
import { defaultNet } from '../ai/weights';
import { unusedDiceValues } from '../engine/rules';
import { enumerateTurnOutcomes, TurnOutcome } from '../engine/turns';
import { gameStateAtom } from './game';

export interface RankedTurn {
  outcome: TurnOutcome;
  /** Cubeless equity for the player on roll, in points (−3…+3). */
  equity: number;
}

/**
 * Every distinct way the remaining dice can be played, ranked best-first
 * by the value net — the same evaluation the computer player maximizes
 * (chooseTurn plays the top entry). Read-only analysis: derived state,
 * touches nothing. Null whenever there is no move to rank (not the
 * moving phase, or a dance).
 */
export const rankedTurnsAtom = atom<RankedTurn[] | null>((get) => {
  const game = get(gameStateAtom);
  if (game.phase !== 'moving') return null;
  const dice = unusedDiceValues(game);
  if (dice.length === 0) return null;
  const outcomes = enumerateTurnOutcomes(game.board, game.turn, dice);
  if (outcomes.length === 0) return null;
  const scratch = makeEvalScratch(defaultNet);
  return outcomes
    .map((outcome) => ({
      outcome,
      equity: evaluateAfterState(defaultNet, outcome.board, game.turn, scratch),
    }))
    .sort((a, b) => b.equity - a.equity);
});
