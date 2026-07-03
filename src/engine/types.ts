export type Player = 'white' | 'black';

/** Absolute board point, 1–24. White travels 24→1, black travels 1→24. */
export type PointIndex = number;

export type CheckerLocation = PointIndex | 'bar' | 'off';

/** A point is empty or an owned stack — a point never holds both colors. */
export type PointState = { player: Player; count: number } | null;

export interface BoardState {
  /** Length 24; index i holds point i+1. Access via getPoint/setPoint helpers. */
  points: PointState[];
  bar: Record<Player, number>;
  off: Record<Player, number>;
}

export interface Move {
  player: Player;
  from: CheckerLocation;
  to: CheckerLocation;
  /** Which die this move consumes; absent for free (rules-off) movement. */
  die?: number;
  /** Whether this move sent an opposing blot to the bar (set on applied moves). */
  hit?: boolean;
}

export interface Die {
  value: number;
  used: boolean;
}

export interface DoublingCube {
  value: number;
  /** null = cube is centered, available to both players. */
  owner: Player | null;
}

export type GamePhase = 'rolling' | 'moving' | 'gameOver';

export interface GameState {
  board: BoardState;
  turn: Player;
  phase: GamePhase;
  /** Empty until rolled; four entries on doubles. */
  dice: Die[];
  /** Append-only log of applied moves — the undo/replay/sync primitive. */
  history: Move[];
  cube: DoublingCube;
}
