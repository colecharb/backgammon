import { atom } from 'jotai';
import { encodeBoard } from '../ai/encoding';
import { equity, evaluateAfterState, makeEvalScratch } from '../ai/evaluate';
import { forward } from '../ai/network';
import { defaultNet } from '../ai/weights';
import { CHECKERS_PER_PLAYER } from '../engine/helpers';
import { unusedDiceValues } from '../engine/rules';
import { enumerateTurnOutcomes, TurnOutcome } from '../engine/turns';
import { gameStateAtom } from './game';

export interface RankedTurn {
  outcome: TurnOutcome;
  /** Cubeless equity for the player on roll, in points (−3…+3). */
  equity: number;
}

export interface PositionEquity {
  /** Probability white eventually wins the game, 0…1. */
  pWhiteWin: number;
  /** Cubeless equity from white's view, in points (−3…+3). */
  equityWhite: number;
}

const positionScratch = makeEvalScratch(defaultNet);

/**
 * The live position's strength from white's fixed perspective, for the
 * always-on equity bar. The net always evaluates for the player on roll, and
 * being on roll is worth a few points — so evaluating only the current mover
 * would make the bar snap by twice that whenever the turn passes. Instead we
 * evaluate from both players' on-roll views and average them: a turn-independent
 * reading that stays continuous as the turn changes. A finished game reads as a
 * certain result.
 */
export const positionEquityAtom = atom<PositionEquity>((get) => {
  const { board } = get(gameStateAtom);
  if (board.off.white === CHECKERS_PER_PLAYER)
    return { pWhiteWin: 1, equityWhite: 3 };
  if (board.off.black === CHECKERS_PER_PLAYER)
    return { pWhiteWin: 0, equityWhite: -3 };
  // White on roll: outputs are already white's view.
  const oWhite = forward(
    defaultNet,
    encodeBoard(board, 'white', positionScratch.x),
    positionScratch.act,
  );
  const pWhiteRoll = oWhite[0];
  const eqWhiteRoll = equity(oWhite);
  // Black on roll: outputs are black's view, so flip to white (1 − p, −equity).
  const oBlack = forward(
    defaultNet,
    encodeBoard(board, 'black', positionScratch.x),
    positionScratch.act,
  );
  const pWhiteFromBlackRoll = 1 - oBlack[0];
  const eqWhiteFromBlackRoll = -equity(oBlack);
  return {
    pWhiteWin: (pWhiteRoll + pWhiteFromBlackRoll) / 2,
    equityWhite: (eqWhiteRoll + eqWhiteFromBlackRoll) / 2,
  };
});

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
