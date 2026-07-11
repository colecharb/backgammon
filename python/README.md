# Fast GPU trainer (Python / PyTorch)

A vectorized, batched self-play trainer that reaches minutes-scale on the
MacBook Air M5 by advancing **thousands of games in lockstep** so each ply is
one large matmul on the GPU (MPS). It trains the *same* value network the app
plays with and exports weights in the app's exact JSON format.

It contains a **second** backgammon engine — a batched one, since the
TypeScript engine can't run games as array ops — so correctness rests on
cross-validation against the (tested) TS engine. Those checks are the point of
the test suite, not an afterthought.

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

## Why this is the fast path — and its limits

The net is tiny; the win is **vectorization**, not the GPU alone — batching
thousands of games amortizes Python overhead and turns per-turn move
enumeration into large tensor ops. On the M5's GPU (MPS) those ops run in
parallel; on a CPU (as in CI here) the same code is correct but far slower, so
the numbers to trust from this environment are the *cross-validation* results,
not wall-clock. The engine is designed for the GPU: `torch.unique`/`scatter`
enumeration is heavy on a CPU and light on MPS.

Move selection is greedy 1-ply over all distinct full-turn afterstates
(exact-match with the app); exploration comes from the dice. Training is
cubeless — the app's cube decisions use the same equity thresholds as before.
