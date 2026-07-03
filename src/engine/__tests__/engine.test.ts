import { describe, expect, it } from 'vitest';
import {
  CHECKERS_PER_PLAYER,
  destinationFor,
  pipCount,
} from '../helpers';
import { applyMove, canPlace } from '../moves';
import { initialGameState } from '../setup';
import { BoardState, Player } from '../types';

function totalCheckers(board: BoardState, player: Player): number {
  const onPoints = board.points.reduce(
    (sum, p) => (p?.player === player ? sum + p.count : sum),
    0,
  );
  return onPoints + board.bar[player] + board.off[player];
}

describe('initialGameState', () => {
  it('gives each player 15 checkers in the standard start', () => {
    const { board } = initialGameState();
    expect(totalCheckers(board, 'white')).toBe(CHECKERS_PER_PLAYER);
    expect(totalCheckers(board, 'black')).toBe(CHECKERS_PER_PLAYER);
    expect(board.points[23]).toEqual({ player: 'white', count: 2 });
    expect(board.points[0]).toEqual({ player: 'black', count: 2 });
  });

  it('starts both players at 167 pips', () => {
    const { board } = initialGameState();
    expect(pipCount(board, 'white')).toBe(167);
    expect(pipCount(board, 'black')).toBe(167);
  });
});

describe('destinationFor', () => {
  it('moves each player in their own direction', () => {
    expect(destinationFor('white', 13, 5)).toBe(8);
    expect(destinationFor('black', 12, 5)).toBe(17);
  });

  it('enters from the bar into the correct home board', () => {
    expect(destinationFor('white', 'bar', 3)).toBe(22);
    expect(destinationFor('black', 'bar', 3)).toBe(3);
  });

  it('bears off past the board edge', () => {
    expect(destinationFor('white', 2, 4)).toBe('off');
    expect(destinationFor('black', 23, 2)).toBe('off');
  });
});

describe('applyMove', () => {
  it('moves a checker between points and records history', () => {
    const state = initialGameState();
    const next = applyMove(state, { player: 'white', from: 13, to: 8 });
    expect(next.board.points[12]).toEqual({ player: 'white', count: 4 });
    expect(next.board.points[7]).toEqual({ player: 'white', count: 4 });
    expect(next.history).toHaveLength(1);
    expect(state.board.points[12]).toEqual({ player: 'white', count: 5 }); // input untouched
  });

  it('round-trips through the bar and off', () => {
    let state = initialGameState();
    state = applyMove(state, { player: 'white', from: 24, to: 'bar' });
    expect(state.board.bar.white).toBe(1);
    state = applyMove(state, { player: 'white', from: 'bar', to: 22 });
    expect(state.board.bar.white).toBe(0);
    expect(state.board.points[21]).toEqual({ player: 'white', count: 1 });
    state = applyMove(state, { player: 'white', from: 22, to: 'off' });
    expect(state.board.off.white).toBe(1);
    expect(totalCheckers(state.board, 'white')).toBe(CHECKERS_PER_PLAYER);
  });

  it('hits an opposing blot to the bar', () => {
    let state = initialGameState();
    state = applyMove(state, { player: 'black', from: 1, to: 5 });
    state = applyMove(state, { player: 'white', from: 6, to: 5 });
    expect(state.board.points[4]).toEqual({ player: 'white', count: 1 });
    expect(state.board.bar.black).toBe(1);
  });

  it('rejects landing on a closed point', () => {
    const state = initialGameState();
    expect(canPlace(state.board, 'white', 19)).toBe(false); // black owns 19 with 5
    expect(() => applyMove(state, { player: 'white', from: 24, to: 19 })).toThrow();
  });

  it('throws when the source has no checker of that player', () => {
    const state = initialGameState();
    expect(() => applyMove(state, { player: 'white', from: 'bar', to: 22 })).toThrow();
    expect(() => applyMove(state, { player: 'white', from: 2, to: 1 })).toThrow();
  });
});
