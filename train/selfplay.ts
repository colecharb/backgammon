// Training-only: nothing under src/ may import from train/.
import { MoveChooser } from '../src/ai/agents';
import { encodeBoard } from '../src/ai/encoding';
import { chooseTurn } from '../src/ai/evaluate';
import { forward, makeActivations, Net } from '../src/ai/network';
import { rollDie, Rng } from '../src/engine/dice';
import { CHECKERS_PER_PLAYER, opponent } from '../src/engine/helpers';
import { WIN_MULTIPLIER, winKind } from '../src/engine/score';
import { initialBoard } from '../src/engine/setup';
import { BoardState, Player } from '../src/engine/types';
import { resetTraces, TdConfig, TdState, tdStep } from './td';

export interface GameRecord {
  winner: Player;
  kind: 'single' | 'gammon' | 'backgammon';
  halfMoves: number;
  aborted: boolean;
}

/** Typical games run well under 100 half-moves; this only guards pathology. */
export const HALF_MOVE_CAP = 1000;

/** Opening: one die each, ties reroll, higher goes first playing both values. */
function rollOpeningDice(rng: Rng): { player: Player; dice: number[] } {
  let white = rollDie(rng);
  let black = rollDie(rng);
  while (white === black) {
    white = rollDie(rng);
    black = rollDie(rng);
  }
  return { player: white > black ? 'white' : 'black', dice: [white, black] };
}

function rollTurnDice(rng: Rng): number[] {
  const a = rollDie(rng);
  const b = rollDie(rng);
  return a === b ? [a, a, a, a] : [a, b];
}

/**
 * One cubeless self-play game with online TD(λ) updates after every
 * half-move (including dances). The sequence of evaluated states is
 * "board + player about to roll"; the game mechanics are the app's own
 * engine functions via enumerateTurnOutcomes/chooseTurn.
 */
export function playTrainingGame(
  net: Net,
  td: TdState,
  cfg: TdConfig,
  rng: Rng,
): GameRecord {
  resetTraces(td);
  let board = initialBoard();
  const opening = rollOpeningDice(rng);
  let player = opening.player;
  let dice: number[] | null = opening.dice;

  // Buffers pinned to s_t for the TD step; chooseTurn uses its own.
  const x = new Float32Array(net.inputs);
  const act = makeActivations(net);
  const nextX = new Float32Array(net.inputs);
  const nextAct = makeActivations(net);
  const delta = new Float32Array(net.outputs);

  for (let halfMove = 1; halfMove <= HALF_MOVE_CAP; halfMove++) {
    // V(s_t) under the current weights, from the on-roll player's view.
    encodeBoard(board, player, x);
    const o = forward(net, x, act);

    const outcome = chooseTurn(net, board, player, dice ?? rollTurnDice(rng));
    if (outcome) board = outcome.board;
    dice = null;

    if (board.off[player] === CHECKERS_PER_PLAYER) {
      const kind = winKind(board, player);
      delta[0] = 1 - o[0];
      delta[1] = (kind !== 'single' ? 1 : 0) - o[1];
      delta[2] = (kind === 'backgammon' ? 1 : 0) - o[2];
      delta[3] = 0 - o[3];
      delta[4] = 0 - o[4];
      tdStep(net, td, cfg, x, act.h, o, delta);
      return { winner: player, kind, halfMoves: halfMove, aborted: false };
    }

    // δ = flip(V(s_t+1)) − V(s_t), both under the pre-update weights.
    const next = opponent(player);
    encodeBoard(board, next, nextX);
    const oNext = forward(net, nextX, nextAct);
    delta[0] = 1 - oNext[0] - o[0];
    delta[1] = oNext[3] - o[1];
    delta[2] = oNext[4] - o[2];
    delta[3] = oNext[1] - o[3];
    delta[4] = oNext[2] - o[4];
    tdStep(net, td, cfg, x, act.h, o, delta);
    player = next;
  }
  return { winner: player, kind: 'single', halfMoves: HALF_MOVE_CAP, aborted: true };
}

export interface MatchRecord {
  winner: Player;
  kind: 'single' | 'gammon' | 'backgammon';
  /** Cubeless points won by the winner. */
  points: number;
  halfMoves: number;
  aborted: boolean;
}

/** One cubeless game between two full-turn policies (no learning). */
export function playMatchGame(
  choosers: Record<Player, MoveChooser>,
  rng: Rng,
): MatchRecord {
  let board: BoardState = initialBoard();
  const opening = rollOpeningDice(rng);
  let player = opening.player;
  let dice: number[] | null = opening.dice;

  for (let halfMove = 1; halfMove <= HALF_MOVE_CAP; halfMove++) {
    const outcome = choosers[player](board, player, dice ?? rollTurnDice(rng), rng);
    if (outcome) board = outcome.board;
    dice = null;
    if (board.off[player] === CHECKERS_PER_PLAYER) {
      const kind = winKind(board, player);
      return {
        winner: player,
        kind,
        points: WIN_MULTIPLIER[kind],
        halfMoves: halfMove,
        aborted: false,
      };
    }
    player = opponent(player);
  }
  return { winner: player, kind: 'single', points: 0, halfMoves: HALF_MOVE_CAP, aborted: true };
}

export interface SeriesResult {
  games: number;
  aWins: number;
  bWins: number;
  aPoints: number;
  bPoints: number;
  aGammons: number;
  bGammons: number;
  aBackgammons: number;
  bBackgammons: number;
  halfMoves: number;
  aborted: number;
}

/** A series between two policies, alternating who plays white each game. */
export function playSeries(
  a: MoveChooser,
  b: MoveChooser,
  games: number,
  rng: Rng,
): SeriesResult {
  const result: SeriesResult = {
    games,
    aWins: 0,
    bWins: 0,
    aPoints: 0,
    bPoints: 0,
    aGammons: 0,
    bGammons: 0,
    aBackgammons: 0,
    bBackgammons: 0,
    halfMoves: 0,
    aborted: 0,
  };
  for (let i = 0; i < games; i++) {
    const aPlays: Player = i % 2 === 0 ? 'white' : 'black';
    const record = playMatchGame(
      aPlays === 'white' ? { white: a, black: b } : { white: b, black: a },
      rng,
    );
    result.halfMoves += record.halfMoves;
    if (record.aborted) {
      result.aborted++;
      continue;
    }
    const aWon = record.winner === aPlays;
    if (aWon) {
      result.aWins++;
      result.aPoints += record.points;
      if (record.kind === 'gammon') result.aGammons++;
      if (record.kind === 'backgammon') result.aBackgammons++;
    } else {
      result.bWins++;
      result.bPoints += record.points;
      if (record.kind === 'gammon') result.bGammons++;
      if (record.kind === 'backgammon') result.bBackgammons++;
    }
  }
  return result;
}
