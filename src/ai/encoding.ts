import { CHECKERS_PER_PLAYER, opponent, POINT_COUNT } from '../engine/helpers';
import { BoardState, Player, PointState } from '../engine/types';

/**
 * TD-Gammon-style board features, always encoded from the perspective of
 * `hero`, the player about to roll — as if hero were white (hero travels
 * toward feature slot 1, hero's home is slots 1–6). The net only ever
 * learns one orientation; black positions are read through the mirror.
 *
 * Layout:
 *   [0..191]  24 slots × (4 hero + 4 opponent) units. For a stack of n:
 *             [n≥1, n≥2, n≥3, max(0, n−3)/2]
 *   [192]     hero checkers on the bar / 2
 *   [193]     opponent checkers on the bar / 2
 *   [194]     hero checkers borne off / 15
 *   [195]     opponent checkers borne off / 15
 *
 * No side-to-move feature: hero is by definition on roll.
 */
export const NUM_INPUTS = 196;

export const ENCODING_ID = 'v0-196';

export function encodeBoard(
  board: BoardState,
  hero: Player,
  out?: Float32Array,
): Float32Array {
  const x = out ?? new Float32Array(NUM_INPUTS);
  if (out) x.fill(0);
  const villain = opponent(hero);
  for (let slot = 1; slot <= POINT_COUNT; slot++) {
    const physical = hero === 'white' ? slot : POINT_COUNT + 1 - slot;
    const point = board.points[physical - 1];
    if (!point) continue;
    const base = (slot - 1) * 8 + (point.player === hero ? 0 : 4);
    const n = point.count;
    x[base] = 1;
    if (n >= 2) x[base + 1] = 1;
    if (n >= 3) x[base + 2] = 1;
    if (n > 3) x[base + 3] = (n - 3) / 2;
  }
  x[192] = board.bar[hero] / 2;
  x[193] = board.bar[villain] / 2;
  x[194] = board.off[hero] / CHECKERS_PER_PLAYER;
  x[195] = board.off[villain] / CHECKERS_PER_PLAYER;
  return x;
}

/**
 * The same position with colors and direction swapped (point p ↔ 25−p).
 * By construction encodeBoard(b, p) === encodeBoard(mirrorBoard(b), opponent(p)).
 */
export function mirrorBoard(board: BoardState): BoardState {
  const points: PointState[] = Array.from({ length: POINT_COUNT }, () => null);
  board.points.forEach((point, i) => {
    points[POINT_COUNT - 1 - i] = point
      ? { player: opponent(point.player), count: point.count }
      : null;
  });
  return {
    points,
    bar: { white: board.bar.black, black: board.bar.white },
    off: { white: board.off.black, black: board.off.white },
  };
}
