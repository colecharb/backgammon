# Vectorized self-play trainer (Python / PyTorch) — a validated experiment

A batched self-play trainer that advances many games in lockstep, trains the
*same* value network the app plays with, and exports weights in the app's exact
JSON format. It contains a **second**, batched backgammon engine (the TS engine
can't run games as array ops), so correctness rests on cross-validation against
the (tested) TS engine — those checks are the point of the test suite.

> **Performance finding — read this first.** The goal was minutes-scale
> training by keeping a GPU busy. It did not pan out, and the numbers say why:
> throughput is **~15 games/s and flat across batch size** (per-ply cost scales
> *linearly* with batch), i.e. **on par with the single-threaded TS trainer**
> (`train/` on `feat/engine-v0`). The reason: the cost is backgammon *move
> enumeration* (sorts/scatter over hundreds of afterstates per game), not the
> tiny net — GPUs don't accelerate that, and batching doesn't amortize it. On
> Metal (MPS) it is *slower* than CPU (~1.0 vs ~0.15 s/ply) because each of the
> many tiny ops pays a kernel-launch latency. **Recommendation: use the TS
> trainer.** This branch stands as a correct, fully cross-validated engine and
> a clean answer to "does GPU/vectorization help here" (no). If you run it, use
> `--device cpu`.

## Setup

```sh
cd python
uv sync                    # installs torch, numpy, pytest (CPU wheel here; MPS on the M5)
```

## Train

```sh
# Fast experiment (M5): thousands of games in lockstep on the GPU
uv run python -m bgtrain.train --iters 2000 --batch 1024 --device mps

# Resume
uv run python -m bgtrain.train --iters 1000 --resume checkpoints/latest.json --device mps
```

`--iters` gradient steps, each playing a `--batch` of games to completion and
regressing the net toward TD(λ) targets. Key flags: `--hidden`, `--lr`,
`--lam` (0 = one-step TD), `--cap` (max distinct afterstates per turn; 640
covers every position seen in cross-validation, with a safe truncation
backstop beyond), `--device cpu|mps|cuda`.

Checkpoints (app JSON format) land in `checkpoints/` (gitignored).

## Benchmark

```sh
uv run python -m bgtrain.benchmark --a checkpoints/latest.json --b random --games 2000 --device mps
uv run python -m bgtrain.benchmark --a checkpoints/latest.json --b pip --games 2000
```

## Ship weights to the app (with a parity check)

```sh
uv run python -m bgtrain.export_weights \
    --net checkpoints/latest.json \
    --out ../src/ai/weights/engine-v0.json \
    --probe checkpoints/parity-probe.json

# Confirm the app's own forward pass reproduces the Python net exactly:
cd .. && npx tsx train/verify-weights-parity.ts \
    src/ai/weights/engine-v0.json python/checkpoints/parity-probe.json
```

The app loads `src/ai/weights/engine-v0.json` unchanged; `deserializeNet`
rejects a mismatched feature encoding, so a stale or wrong file fails loudly.

## How the pieces map to the app

| Python (`bgtrain/`) | App (`src/`) | Cross-checked by |
|---|---|---|
| `engine.py` (batched moves, turns, scoring) | `engine/` | `test_engine_crossval.py` vs 3000 exported positions |
| `encoding.py` (196 features) | `ai/encoding.ts` | `test_encoding_parity.py` |
| `net.py` (196→128→5 sigmoid, JSON I/O) | `ai/network.ts` | `test_encoding_parity.py`, TS `verify-weights-parity.ts` |
| `td.py` / `evaluate.py` (TD(λ), equity, flip) | `train/td.ts`, `ai/evaluate.ts` | `test_td.py` |
| `selfplay.py`, `train.py`, `benchmark.py`, `agents.py` | `train/*` | learning smoke run |

## Tests

```sh
uv run pytest -q                                  # all cross-validation + math
npx tsx train/export-fixtures.ts                  # regenerate fixtures from the TS engine
```

## Why batching didn't win here

The idea was that batching many games would amortize per-game overhead and let
a GPU do the heavy lifting. Measurement disproved it: per-ply time scales
*linearly* with batch size (≈0.11 s at B=64 → ≈4.9 s at B=4096 on this CPU), so
games/s is flat at ~15 regardless of batch. The dominant cost is move
enumeration — deduped sorts and scatters over the hundreds of distinct
afterstates each turn can have — and that work is per-game; batching just does
the same total work in bigger tensors. The neural net, the one thing a GPU
accelerates well, is a rounding error next to it. So there is no batching
speedup to capture, and Metal's per-kernel launch latency over the many small
ops makes MPS slower than CPU.

Move selection is greedy 1-ply over all distinct full-turn afterstates
(exact-match with the app); exploration comes from the dice. Training is
cubeless — the app's cube decisions use the same equity thresholds as before.
