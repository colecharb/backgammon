import { GameState, Die, Player } from './types';

/** Uniform random in [0, 1) — injectable so tests and replays are deterministic. */
export type Rng = () => number;

export function rollDie(rng: Rng): number {
  return Math.floor(rng() * 6) + 1;
}

/** Doubles play four times; expand them at roll time so a Die is a Die. */
export function diceFromValues(a: number, b: number): Die[] {
  const values = a === b ? [a, a, a, a] : [a, b];
  return values.map((value) => ({ value, used: false }));
}

/**
 * The opening roll: each player rolls one die, higher goes first and plays
 * both values; ties reroll. Returns the state ready for the winner to move.
 */
export function rollOpening(state: GameState, rng: Rng): GameState {
  let white = rollDie(rng);
  let black = rollDie(rng);
  while (white === black) {
    white = rollDie(rng);
    black = rollDie(rng);
  }
  const turn: Player = white > black ? 'white' : 'black';
  return { ...state, turn, phase: 'moving', dice: diceFromValues(white, black) };
}

/** A regular turn roll for the player already on turn. */
export function rollTurn(state: GameState, rng: Rng): GameState {
  if (state.phase !== 'rolling') throw new Error(`Cannot roll during ${state.phase}`);
  return {
    ...state,
    phase: 'moving',
    dice: diceFromValues(rollDie(rng), rollDie(rng)),
  };
}

/** True until the first roll of the game has happened. */
export function isOpeningRoll(state: GameState): boolean {
  return state.history.length === 0 && state.dice.length === 0;
}
