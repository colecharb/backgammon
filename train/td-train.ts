// Self-play TD(λ) trainer. Run with: npm run train -- --games 200000
//
// --games counts *sequential-equivalent* games (learning progress), so a
// net trained to a given --games has the same strength regardless of
// --workers; more workers just reach it faster. Parallelism is synchronous
// minibatch self-play: --workers N plays N games per round from identical
// weights and applies the mean weight delta. --workers 1 is the fully
// sequential, bit-reproducible path.
//
// Training-only: nothing under src/ may import from train/.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { Worker } from 'node:worker_threads';
import { greedyPipAgent, neuralAgent, randomAgent } from '../src/ai/agents';
import { ENCODING_ID } from '../src/ai/encoding';
import { deserializeNet, initNet, Net, NetMeta, serializeNet } from '../src/ai/network';
import { mulberry32 } from '../src/engine/rng';
import { applyDelta, ResultMessage, weightsMessage } from './parallel';
import { GameRecord, playSeries, playTrainingGame } from './selfplay';
import { makeTdState, TdConfig } from './td';

const { values: args } = parseArgs({
  options: {
    games: { type: 'string', default: '100000' },
    hidden: { type: 'string', default: '128' },
    alpha: { type: 'string', default: '0.1' },
    lambda: { type: 'string', default: '0.7' },
    seed: { type: 'string', default: '42' },
    workers: { type: 'string' },
    'step-boost': { type: 'string' },
    resume: { type: 'string' },
    out: { type: 'string', default: 'train/checkpoints' },
    'checkpoint-every': { type: 'string', default: '5000' },
    'eval-every': { type: 'string', default: '10000' },
    'eval-games': { type: 'string', default: '500' },
    'log-every': { type: 'string', default: '500' },
  },
});

const targetUnits = Number(args.games);
const cfg: TdConfig = { alpha: Number(args.alpha), lambda: Number(args.lambda) };
const seed = Number(args.seed);
// Default to 2 workers, not core count. A synchronous round applies the
// mean of W same-base deltas times `stepBoost`, advancing learning by
// stepBoost sequential-equivalent games while taking a parameter step of
// ~stepBoost single-game steps. TD self-play destabilizes past ~2 of those
// steps (boost 3 is already erratic; 4 diverges), and a bigger minibatch
// barely lifts that ceiling because bootstrapped targets move as the
// weights do. So wall-clock ≈ units / (stepBoost · per_core_rate): the
// speedup comes from stepBoost (~2), and only ~stepBoost cores are needed
// to sustain it — extra workers just replay more games for the same
// result. Both knobs are exposed for experimentation.
const workers = Math.max(
  1,
  Number(args.workers ?? (availableParallelism() >= 3 ? 2 : 1)),
);
const stepBoost = Number(args['step-boost'] ?? 2);
const outDir = args.out!;
const checkpointEvery = Number(args['checkpoint-every']);
const evalEvery = Number(args['eval-every']);
const evalGames = Number(args['eval-games']);
const logEvery = Number(args['log-every']);

let net: Net;
let unitsBefore = 0;
if (args.resume) {
  const restored = deserializeNet(readFileSync(args.resume, 'utf8'));
  net = restored.net;
  unitsBefore = restored.meta.games;
  console.log(`Resumed ${args.resume} (${unitsBefore} games, hidden=${net.hidden})`);
} else {
  net = initNet(Number(args.hidden), mulberry32(seed ^ 0x9e3779b9));
  console.log(`Fresh net: hidden=${net.hidden}, alpha=${cfg.alpha}, lambda=${cfg.lambda}`);
}

mkdirSync(outDir, { recursive: true });

function checkpoint(totalUnits: number): void {
  const meta: NetMeta = {
    version: 1,
    encoding: ENCODING_ID,
    hidden: net.hidden,
    games: Math.round(totalUnits),
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
  atomicWrite(`ckpt-${Math.round(totalUnits)}.json`);
  atomicWrite('latest.json');
}

function evaluate(totalUnits: number): void {
  const evalRng = mulberry32(0xe7a1 + Math.round(totalUnits));
  const me = neuralAgent(net);
  const vsRandom = playSeries(me, randomAgent, evalGames, evalRng);
  const vsPip = playSeries(me, greedyPipAgent, evalGames, evalRng);
  const pct = (wins: number, n: number) => ((100 * wins) / n).toFixed(1);
  console.log(
    `  eval @${Math.round(totalUnits)}: vs random ${pct(vsRandom.aWins, evalGames)}% ` +
      `(ppg ${((vsRandom.aPoints - vsRandom.bPoints) / evalGames).toFixed(2)}), ` +
      `vs greedy-pip ${pct(vsPip.aWins, evalGames)}% ` +
      `(ppg ${((vsPip.aPoints - vsPip.bPoints) / evalGames).toFixed(2)})`,
  );
}

let halfMoves = 0;
let aborted = 0;
let actualGames = 0;
let windowStart = Date.now();
let lastMilestone = 0;

/**
 * `progress` is cumulative sequential-equivalent games this run. Fold in
 * the actual `records` (for length/throughput stats), then fire logging,
 * checkpoint, and eval as milestones are crossed. Progress is measured in
 * units so cadence and meta.games are identical across worker counts.
 */
function recordProgress(progress: number, records: GameRecord[]): void {
  for (const record of records) {
    halfMoves += record.halfMoves;
    if (record.aborted) aborted++;
    actualGames++;
  }

  const crossed = (every: number) =>
    Math.floor(progress / every) > Math.floor(lastMilestone / every);

  if (crossed(logEvery)) {
    const secs = (Date.now() - windowStart) / 1000;
    console.log(
      `${Math.round(unitsBefore + progress)} games | ` +
        `${(actualGames / secs).toFixed(1)} games/s | ` +
        `avg half-moves ${(halfMoves / Math.max(1, actualGames)).toFixed(1)}` +
        (aborted ? ` | ABORTED ${aborted}` : ''),
    );
    halfMoves = 0;
    aborted = 0;
    actualGames = 0;
    windowStart = Date.now();
  }
  const done = progress >= targetUnits;
  if (crossed(checkpointEvery) || done) checkpoint(unitsBefore + progress);
  if (crossed(evalEvery) || done) evaluate(unitsBefore + progress);
  lastMilestone = progress;
}

function runSequential(): void {
  const rng = mulberry32(seed + unitsBefore);
  const td = makeTdState(net);
  for (let g = 1; g <= targetUnits; g++) {
    recordProgress(g, [playTrainingGame(net, td, cfg, rng)]);
  }
}

/**
 * Synchronous minibatch self-play. Each round every worker trains one game
 * from the identical broadcast weights and returns its delta; the master
 * applies the mean delta times stepBoost and starts the next round.
 * Staleness is exactly zero — all deltas share a base — so it is stable at
 * any worker count. One round = stepBoost units of progress.
 */
async function runParallel(): Promise<void> {
  // Boot each worker in CJS mode with tsx's loader so its extensionless
  // TypeScript imports resolve exactly as they do in the main process.
  // (--import tsx loads the worker as ESM, which rejects those imports.)
  const workerFile = join(__dirname, 'selfplay-worker.ts');
  const bootstrap = `require('tsx/cjs');require(${JSON.stringify(workerFile)});`;

  const pool = Array.from({ length: workers }, (_, id) =>
    new Worker(bootstrap, {
      eval: true,
      workerData: {
        hidden: net.hidden,
        cfg,
        seed: seed + unitsBefore + 7919 * (id + 1),
      },
    }),
  );

  const nextDelta = (worker: Worker) =>
    new Promise<ResultMessage>((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
    });

  let progress = 0;
  while (progress < targetUnits) {
    for (const worker of pool) worker.postMessage(weightsMessage(net));
    const replies = await Promise.all(pool.map(nextDelta));

    const scale = stepBoost / replies.length;
    for (const reply of replies) applyDelta(net, reply.delta, scale);
    progress += stepBoost;
    recordProgress(progress, replies.map((r) => r.record));
  }

  await Promise.all(
    pool.map(
      (worker) =>
        new Promise<void>((resolve) => {
          worker.once('exit', () => resolve());
          worker.postMessage({ type: 'stop' });
        }),
    ),
  );
}

const parallel = workers > 1;
console.log(
  `Training ${targetUnits} games (${unitsBefore} before this run)` +
    (parallel
      ? `, ${workers} workers × step-boost ${stepBoost} (synchronous minibatch)…`
      : ' (sequential)…'),
);

(parallel ? runParallel() : (runSequential(), Promise.resolve())).then(() => {
  console.log(`Done. Weights: ${join(outDir, 'latest.json')}`);
});
