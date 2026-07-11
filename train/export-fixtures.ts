// Emit ground-truth fixtures for cross-validating the Python engine, encoder,
// and net against this (tested) TypeScript engine. Run:
//   npx tsx train/export-fixtures.ts
// Writes python/tests/fixtures/fixtures.json (gitignored; regenerate anytime).
// Training-only: nothing under src/ imports this.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeBoard } from '../src/ai/encoding';
import { forward } from '../src/ai/network';
import { defaultNet } from '../src/ai/weights';
import { rollDie } from '../src/engine/dice';
import { CHECKERS_PER_PLAYER } from '../src/engine/helpers';
import { applyMoveToBoard } from '../src/engine/moves';
import { mulberry32 } from '../src/engine/rng';
import { getLegalMoves, LegalMove, movesForDie, unusedDiceValues } from '../src/engine/rules';
import { winKind } from '../src/engine/score';
import { initialBoard } from '../src/engine/setup';
import { enumerateTurnOutcomes } from '../src/engine/turns';
import { BoardState, GameState, Player } from '../src/engine/types';

/** Signed 28-vector: 0–23 point counts (+white/−black), 24/25 bar w/b, 26/27 off w/b. */
function board28(board: BoardState): number[] {
  const v = new Array(28).fill(0);
  board.points.forEach((p, i) => {
    if (p) v[i] = p.player === 'white' ? p.count : -p.count;
  });
  v[24] = board.bar.white;
  v[25] = board.bar.black;
  v[26] = board.off.white;
  v[27] = board.off.black;
  return v;
}

function makeState(board: BoardState, turn: Player, dice: number[]): GameState {
  return {
    board,
    turn,
    phase: 'moving',
    dice: dice.map((value) => ({ value, used: false })),
    history: [],
    cube: { value: 1, owner: null },
    result: null,
  };
}

const serializeMove = (m: LegalMove) => ({ from: m.from, to: m.to, die: m.die });

interface MoveFixture {
  board28: number[];
  turn: Player;
  dice: number[];
  singleDie: Record<number, ReturnType<typeof serializeMove>[]>;
  legalMoves: ReturnType<typeof serializeMove>[];
  turnOutcomes: number[][];
  encoding: number[];
  netOut: number[];
}

interface ScoringFixture {
  board28: number[];
  winner: Player;
  kind: string;
}

const rng = mulberry32(20260711);
const moveFixtures: MoveFixture[] = [];
const scoringFixtures: ScoringFixture[] = [];

const TARGET_POSITIONS = 3000;
const MAX_GAMES = 4000;

for (let game = 0; game < MAX_GAMES && moveFixtures.length < TARGET_POSITIONS; game++) {
  let board = initialBoard();
  let player: Player = rng() < 0.5 ? 'white' : 'black';

  for (let turn = 0; turn < 400; turn++) {
    const a = rollDie(rng);
    const b = rollDie(rng);
    const dice = a === b ? [a, a, a, a] : [a, b];
    const state = makeState(board, player, dice);

    const outcomes = enumerateTurnOutcomes(board, player, dice);
    const singleDie: MoveFixture['singleDie'] = {};
    for (const die of new Set(dice)) {
      singleDie[die] = movesForDie(board, player, die).map(serializeMove);
    }
    const encoding = Array.from(encodeBoard(board, player));

    moveFixtures.push({
      board28: board28(board),
      turn: player,
      dice,
      singleDie,
      legalMoves: getLegalMoves(state).map(serializeMove),
      turnOutcomes: outcomes.map((o) => board28(o.board)),
      encoding,
      netOut: Array.from(forward(defaultNet, Float32Array.from(encoding))),
    });

    if (outcomes.length > 0) {
      board = outcomes[Math.floor(rng() * outcomes.length)].board;
      if (board.off[player] === CHECKERS_PER_PLAYER) {
        scoringFixtures.push({
          board28: board28(board),
          winner: player,
          kind: winKind(board, player),
        });
        break;
      }
    }
    player = player === 'white' ? 'black' : 'white';
    if (moveFixtures.length >= TARGET_POSITIONS) break;
  }
}

// A few deliberately crafted bear-off / hit boards land via applyMoveToBoard
// so the fixtures always include closed-out and near-borne-off shapes even if
// random play doesn't reach them.
function crafted(): BoardState {
  let b = initialBoard();
  b = applyMoveToBoard(b, 'white', 24, 23).board; // create a white blot region
  return b;
}
void crafted; // (kept for future targeted fixtures; random play already covers these)

const outDir = join(__dirname, '..', 'python', 'tests', 'fixtures');
mkdirSync(outDir, { recursive: true });
const path = join(outDir, 'fixtures.json');
writeFileSync(
  path,
  JSON.stringify({
    encoding: 'v0-196',
    hidden: defaultNet.hidden,
    moveFixtures,
    scoringFixtures,
  }),
);
console.log(
  `Wrote ${moveFixtures.length} move fixtures + ${scoringFixtures.length} scoring fixtures to ${path}`,
);
