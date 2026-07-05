import { CHECKERS_PER_PLAYER, getPoint, isPointIndex, opponent } from './helpers';
import { winKind, WIN_MULTIPLIER } from './score';
import { BoardState, Die, GameState, Move, Player, PointIndex } from './types';

/**
 * Whether a checker of `player` may land on `to`.
 * Points blocked by two or more opposing checkers are closed; everything
 * else (own point, empty point, opposing blot, bar, off) is open.
 * Dice legality is a separate concern (see rules.ts) and does not live here.
 */
export function canPlace(board: BoardState, player: Player, to: Move['to']): boolean {
  if (!isPointIndex(to)) return true;
  const point = getPoint(board, to);
  return point === null || point.player === player || point.count === 1;
}

/**
 * Move one checker on the board with no dice/turn legality checks.
 * Handles every location kind and hits opposing blots to the bar.
 * Throws if the source has no checker of the moving player or the
 * destination is a closed point.
 */
export function applyMoveToBoard(
  board: BoardState,
  player: Player,
  from: Move['from'],
  to: Move['to'],
): { board: BoardState; hit: boolean } {
  if (!canPlace(board, player, to)) {
    throw new Error(`Point ${to} is closed to ${player}`);
  }
  const lifted = removeChecker(board, player, from);
  return addChecker(lifted, player, to);
}

/**
 * Apply a move to the game: updates the board, marks the consumed die used
 * (when `move.die` is set), appends to history, and flips to gameOver when
 * the mover's last checker bears off.
 * This stays the single mutation point as rules arrive around it.
 */
export function applyMove(state: GameState, move: Move): GameState {
  const { board, hit } = applyMoveToBoard(state.board, move.player, move.from, move.to);
  const dice = move.die === undefined ? state.dice : consumeDie(state.dice, move.die);
  const gameOver = board.off[move.player] === CHECKERS_PER_PLAYER;
  let result = state.result;
  if (gameOver) {
    const kind = winKind(board, move.player);
    result = {
      winner: move.player,
      kind,
      points: state.cube.value * WIN_MULTIPLIER[kind],
    };
  }
  return {
    ...state,
    board,
    dice,
    phase: gameOver ? 'gameOver' : state.phase,
    result,
    history: [...state.history, { ...move, hit }],
  };
}

/** Reverse the last applied move, restoring any hit blot and freeing its die. */
export function undoLastMove(state: GameState): GameState {
  const move = state.history[state.history.length - 1];
  if (!move) throw new Error('No move to undo');
  let { board } = applyMoveToBoard(state.board, move.player, move.to, move.from);
  if (move.hit && isPointIndex(move.to)) {
    ({ board } = applyMoveToBoard(board, opponent(move.player), 'bar', move.to));
  }
  return {
    ...state,
    board,
    dice: move.die === undefined ? state.dice : restoreDie(state.dice, move.die),
    phase: state.phase === 'gameOver' ? 'moving' : state.phase,
    result: state.phase === 'gameOver' ? null : state.result,
    history: state.history.slice(0, -1),
  };
}

/** Hand the turn to the opponent, ready to roll. */
export function endTurn(state: GameState): GameState {
  return { ...state, turn: opponent(state.turn), phase: 'rolling', dice: [] };
}

export function winner(state: GameState): Player | null {
  return state.result?.winner ?? null;
}

function consumeDie(dice: Die[], value: number): Die[] {
  const index = dice.findIndex((d) => !d.used && d.value === value);
  if (index === -1) throw new Error(`No unused die of value ${value}`);
  return dice.map((d, i) => (i === index ? { ...d, used: true } : d));
}

function restoreDie(dice: Die[], value: number): Die[] {
  const index = dice.findIndex((d) => d.used && d.value === value);
  if (index === -1) throw new Error(`No used die of value ${value}`);
  return dice.map((d, i) => (i === index ? { ...d, used: false } : d));
}

function removeChecker(
  board: BoardState,
  player: Player,
  from: Move['from'],
): BoardState {
  if (from === 'bar' || from === 'off') {
    const count = board[from][player];
    if (count === 0) throw new Error(`No ${player} checker on ${from}`);
    return { ...board, [from]: { ...board[from], [player]: count - 1 } };
  }
  const point = getPoint(board, from);
  if (point?.player !== player) {
    throw new Error(`No ${player} checker on point ${from}`);
  }
  return setPoint(
    board,
    from,
    point.count === 1 ? null : { player, count: point.count - 1 },
  );
}

function addChecker(
  board: BoardState,
  player: Player,
  to: Move['to'],
): { board: BoardState; hit: boolean } {
  if (to === 'bar' || to === 'off') {
    return {
      board: { ...board, [to]: { ...board[to], [player]: board[to][player] + 1 } },
      hit: false,
    };
  }
  const point = getPoint(board, to);
  if (point === null) {
    return { board: setPoint(board, to, { player, count: 1 }), hit: false };
  }
  if (point.player === player) {
    return {
      board: setPoint(board, to, { player, count: point.count + 1 }),
      hit: false,
    };
  }
  // Opposing blot: hit it to the bar.
  const enemy = opponent(player);
  const afterHit = setPoint(board, to, { player, count: 1 });
  return {
    board: { ...afterHit, bar: { ...afterHit.bar, [enemy]: afterHit.bar[enemy] + 1 } },
    hit: true,
  };
}

function setPoint(
  board: BoardState,
  point: PointIndex,
  value: BoardState['points'][number],
): BoardState {
  const points = board.points.slice();
  points[point - 1] = value;
  return { ...board, points };
}
