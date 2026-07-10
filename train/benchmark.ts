// Head-to-head benchmark between two policies. Examples:
//   npm run benchmark -- --a train/checkpoints/latest.json --b random
//   npm run benchmark -- --a train/checkpoints/ckpt-200000.json --b pip --games 2000
// Training-only: nothing under src/ may import from train/.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { greedyPipAgent, MoveChooser, neuralAgent, randomAgent } from '../src/ai/agents';
import { deserializeNet } from '../src/ai/network';
import { mulberry32 } from '../src/engine/rng';
import { playSeries } from './selfplay';

const { values: args } = parseArgs({
  options: {
    a: { type: 'string', default: 'train/checkpoints/latest.json' },
    b: { type: 'string', default: 'random' },
    games: { type: 'string', default: '1000' },
    seed: { type: 'string', default: '7' },
  },
});

function chooserFor(spec: string): { chooser: MoveChooser; label: string } {
  if (spec === 'random') return { chooser: randomAgent, label: 'random' };
  if (spec === 'pip') return { chooser: greedyPipAgent, label: 'greedy-pip' };
  const { net, meta } = deserializeNet(readFileSync(spec, 'utf8'));
  return { chooser: neuralAgent(net), label: `${spec} (${meta.games} games)` };
}

const a = chooserFor(args.a!);
const b = chooserFor(args.b!);
const games = Number(args.games);

console.log(`A: ${a.label}\nB: ${b.label}\n${games} games, alternating colors…`);
const r = playSeries(a.chooser, b.chooser, games, mulberry32(Number(args.seed)));

const decided = r.aWins + r.bWins;
const winRate = r.aWins / decided;
// Binomial standard error on the win rate.
const se = Math.sqrt((winRate * (1 - winRate)) / decided);
const ppg = (r.aPoints - r.bPoints) / decided;

console.log(
  `\nA wins ${r.aWins}/${decided} = ${(100 * winRate).toFixed(1)}% ± ${(100 * se).toFixed(1)}%`,
);
console.log(`A points-per-game (cubeless): ${ppg >= 0 ? '+' : ''}${ppg.toFixed(3)}`);
console.log(
  `gammons  A ${r.aGammons}, B ${r.bGammons} | backgammons  A ${r.aBackgammons}, B ${r.bBackgammons}`,
);
console.log(
  `avg half-moves ${(r.halfMoves / r.games).toFixed(1)}` +
    (r.aborted ? ` | ABORTED ${r.aborted}` : ''),
);
