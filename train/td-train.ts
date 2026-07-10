// Self-play TD(λ) trainer. Run with: npm run train -- --games 200000
// Training-only: nothing under src/ may import from train/.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { greedyPipAgent, neuralAgent, randomAgent } from '../src/ai/agents';
import { ENCODING_ID } from '../src/ai/encoding';
import { deserializeNet, initNet, Net, NetMeta, serializeNet } from '../src/ai/network';
import { mulberry32 } from '../src/engine/rng';
import { playSeries, playTrainingGame } from './selfplay';
import { makeTdState, TdConfig } from './td';

const { values: args } = parseArgs({
  options: {
    games: { type: 'string', default: '100000' },
    hidden: { type: 'string', default: '128' },
    alpha: { type: 'string', default: '0.1' },
    lambda: { type: 'string', default: '0.7' },
    seed: { type: 'string', default: '42' },
    resume: { type: 'string' },
    out: { type: 'string', default: 'train/checkpoints' },
    'checkpoint-every': { type: 'string', default: '5000' },
    'eval-every': { type: 'string', default: '10000' },
    'eval-games': { type: 'string', default: '500' },
    'log-every': { type: 'string', default: '500' },
  },
});

const games = Number(args.games);
const cfg: TdConfig = { alpha: Number(args.alpha), lambda: Number(args.lambda) };
const seed = Number(args.seed);
const outDir = args.out!;
const checkpointEvery = Number(args['checkpoint-every']);
const evalEvery = Number(args['eval-every']);
const evalGames = Number(args['eval-games']);
const logEvery = Number(args['log-every']);

let net: Net;
let playedBefore = 0;
if (args.resume) {
  const restored = deserializeNet(readFileSync(args.resume, 'utf8'));
  net = restored.net;
  playedBefore = restored.meta.games;
  console.log(`Resumed ${args.resume} (${playedBefore} games, hidden=${net.hidden})`);
} else {
  net = initNet(Number(args.hidden), mulberry32(seed ^ 0x9e3779b9));
  console.log(`Fresh net: hidden=${net.hidden}, alpha=${cfg.alpha}, lambda=${cfg.lambda}`);
}

mkdirSync(outDir, { recursive: true });
const rng = mulberry32(seed + playedBefore);
const td = makeTdState(net);

function checkpoint(totalGames: number): void {
  const meta: NetMeta = {
    version: 1,
    encoding: ENCODING_ID,
    hidden: net.hidden,
    games: totalGames,
    trainedAt: new Date().toISOString(),
  };
  const json = serializeNet(net, meta);
  // Write-then-rename so an interrupt can't leave a truncated checkpoint
  // behind (latest.json is the documented --resume target).
  const atomicWrite = (name: string) => {
    const path = join(outDir, name);
    writeFileSync(`${path}.tmp`, json);
    renameSync(`${path}.tmp`, path);
  };
  atomicWrite(`ckpt-${totalGames}.json`);
  atomicWrite('latest.json');
}

function evaluate(totalGames: number): void {
  const evalRng = mulberry32(0xe7a1 + totalGames);
  const me = neuralAgent(net);
  const vsRandom = playSeries(me, randomAgent, evalGames, evalRng);
  const vsPip = playSeries(me, greedyPipAgent, evalGames, evalRng);
  const pct = (wins: number, n: number) => ((100 * wins) / n).toFixed(1);
  console.log(
    `  eval @${totalGames}: vs random ${pct(vsRandom.aWins, evalGames)}% ` +
      `(ppg ${((vsRandom.aPoints - vsRandom.bPoints) / evalGames).toFixed(2)}), ` +
      `vs greedy-pip ${pct(vsPip.aWins, evalGames)}% ` +
      `(ppg ${((vsPip.aPoints - vsPip.bPoints) / evalGames).toFixed(2)})`,
  );
}

let halfMoves = 0;
let aborted = 0;
let windowStart = Date.now();
console.log(`Training ${games} games (${playedBefore} played before this run)…`);

for (let g = 1; g <= games; g++) {
  const record = playTrainingGame(net, td, cfg, rng);
  halfMoves += record.halfMoves;
  if (record.aborted) aborted++;

  const total = playedBefore + g;
  if (g % logEvery === 0) {
    const secs = (Date.now() - windowStart) / 1000;
    console.log(
      `${total} games | ${(logEvery / secs).toFixed(1)} games/s | ` +
        `avg half-moves ${(halfMoves / logEvery).toFixed(1)}` +
        (aborted ? ` | ABORTED ${aborted}` : ''),
    );
    halfMoves = 0;
    aborted = 0;
    windowStart = Date.now();
  }
  if (g % checkpointEvery === 0 || g === games) checkpoint(total);
  if (g % evalEvery === 0 || g === games) evaluate(total);
}
console.log(`Done. Weights: ${join(outDir, 'latest.json')}`);
