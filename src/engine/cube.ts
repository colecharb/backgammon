import { opponent } from './helpers';
import { GameState } from './types';

export const MAX_CUBE = 64;

/**
 * A player may double at the start of their own turn, before rolling, when
 * the cube is centered or they own it. No doubling before the opening roll
 * (nobody is on turn yet) or once the cube is maxed.
 */
export function canOfferDouble(state: GameState): boolean {
  return (
    state.phase === 'rolling' &&
    state.history.length > 0 &&
    state.cube.value < MAX_CUBE &&
    (state.cube.owner === null || state.cube.owner === state.turn)
  );
}

export function offerDouble(state: GameState): GameState {
  if (!canOfferDouble(state)) throw new Error('Cannot double now');
  return { ...state, phase: 'doubled' };
}

/** The opponent takes: stake doubles, they own the cube, offerer rolls. */
export function acceptDouble(state: GameState): GameState {
  if (state.phase !== 'doubled') throw new Error('No double to accept');
  return {
    ...state,
    phase: 'rolling',
    cube: { value: state.cube.value * 2, owner: opponent(state.turn) },
  };
}

/** The opponent drops: offerer wins the pre-double stake immediately. */
export function declineDouble(state: GameState): GameState {
  if (state.phase !== 'doubled') throw new Error('No double to decline');
  return {
    ...state,
    phase: 'gameOver',
    result: { winner: state.turn, kind: 'drop', points: state.cube.value },
  };
}
