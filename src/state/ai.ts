import { atom } from 'jotai';
import { ComputerAction } from '../ai/ai';
import { chooseTurn } from '../ai/evaluate';
import { defaultNet } from '../ai/weights';
import { acceptDouble, canOfferDouble, declineDouble, offerDouble } from '../engine/cube';
import { isOpeningRoll, rollOpening, rollTurn } from '../engine/dice';
import { applyMove, endTurn } from '../engine/moves';
import { unusedDiceValues } from '../engine/rules';
import { gameStateAtom } from './game';

/**
 * The computer's single mutation point. Each dispatch performs exactly one
 * visible step (a roll, one checker move, a cube answer…) against the same
 * pure engine functions the human atoms use; the driver hook watches the
 * resulting state and schedules the next step.
 */
export const computerActionAtom = atom(null, (get, set, action: ComputerAction) => {
  const game = get(gameStateAtom);
  switch (action.kind) {
    case 'roll': {
      if (game.phase !== 'rolling') return;
      set(
        gameStateAtom,
        isOpeningRoll(game)
          ? rollOpening(game, Math.random)
          : rollTurn(game, Math.random),
      );
      return;
    }
    case 'playBestMove': {
      if (game.phase !== 'moving') return;
      // Committing only the first move of the best full turn, then
      // re-choosing from the new position, still reaches that same best
      // final board — every completion of the prefix was in the original
      // enumeration — while the human watches it land move by move.
      const outcome = chooseTurn(defaultNet, game.board, game.turn, unusedDiceValues(game));
      if (!outcome) return;
      set(gameStateAtom, applyMove(game, outcome.moves[0]));
      return;
    }
    case 'endTurn': {
      if (game.phase !== 'moving') return;
      set(gameStateAtom, endTurn(game));
      return;
    }
    case 'offerDouble': {
      if (!canOfferDouble(game)) return;
      set(gameStateAtom, offerDouble(game));
      return;
    }
    case 'take': {
      if (game.phase !== 'doubled') return;
      set(gameStateAtom, acceptDouble(game));
      return;
    }
    case 'drop': {
      if (game.phase !== 'doubled') return;
      set(gameStateAtom, declineDouble(game));
      return;
    }
  }
});
