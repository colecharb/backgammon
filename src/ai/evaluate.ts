import { CHECKERS_PER_PLAYER, opponent } from '../engine/helpers';
import { WIN_MULTIPLIER, winKind } from '../engine/score';
import { enumerateTurnOutcomes, TurnOutcome } from '../engine/turns';
import { BoardState, Player } from '../engine/types';
import { encodeBoard } from './encoding';
import { Activations, forward, makeActivations, Net } from './network';

/** [P(win), P(win gammon+), P(win bg), P(lose gammon+), P(lose bg)] */
export type Outputs = Float32Array;

/**
 * The same position seen from the other player: win↔lose, and the
 * gammon/backgammon heads change sides. An involution.
 */
export function flipOutputs(o: Outputs): Outputs {
  return Float32Array.from([1 - o[0], o[3], o[4], o[1], o[2]]);
}

/** Cubeless expected points for the player whose view `o` is. */
export function equity(o: ArrayLike<number>): number {
  return 2 * o[0] - 1 + o[1] + o[2] - o[3] - o[4];
}

/** Reusable buffers so evaluating many candidate boards allocates nothing. */
export interface EvalScratch {
  x: Float32Array;
  act: Activations;
}

export function makeEvalScratch(net: Net): EvalScratch {
  return { x: new Float32Array(net.inputs), act: makeActivations(net) };
}

/**
 * Cubeless equity of `board` from `mover`'s view once their turn is over,
 * i.e. with the opponent on roll. The net always evaluates for the player
 * on roll, so the opponent's outputs are flipped back to the mover
 * (equity(flip(o)) === -equity(o)). A won game scores exactly.
 */
export function evaluateAfterState(
  net: Net,
  board: BoardState,
  mover: Player,
  scratch?: EvalScratch,
): number {
  if (board.off[mover] === CHECKERS_PER_PLAYER) {
    return WIN_MULTIPLIER[winKind(board, mover)];
  }
  const x = encodeBoard(board, opponent(mover), scratch?.x);
  return -equity(forward(net, x, scratch?.act));
}

/**
 * 1-ply move selection: play out every distinct full turn, evaluate each
 * resulting position with the net, keep the best. Null = no legal play.
 */
export function chooseTurn(
  net: Net,
  board: BoardState,
  player: Player,
  dice: number[],
): TurnOutcome | null {
  const outcomes = enumerateTurnOutcomes(board, player, dice);
  if (outcomes.length === 0) return null;
  const scratch = makeEvalScratch(net);
  let best = outcomes[0];
  let bestEquity = -Infinity;
  for (const outcome of outcomes) {
    const e = evaluateAfterState(net, outcome.board, player, scratch);
    if (e > bestEquity) {
      bestEquity = e;
      best = outcome;
    }
  }
  return best;
}
