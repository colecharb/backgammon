# Plan: vectorized GPU trainer in Python (minutes-scale experiments)

## Context

The TypeScript trainer (`train/`) reuses the app's engine, which is correct
and unified but caps at ~2× parallel speedup because online TD self-play is
sequential and the engine allocates per move. To iterate on training ideas
in **minutes** — new features, architectures, reward shaping, λ/α sweeps —
we need 100–1000× the throughput. The way to get it is **vectorized batched
self-play**: advance thousands of independent games in lockstep so each ply
is one large matmul and Python's per-game overhead is amortized across the
batch, with the M5 GPU (PyTorch **MPS**) accelerating the matmuls.

This requires a **second, vectorized engine** in Python — the TS engine
can't batch. That reintroduces train/serve skew (two engines, two
languages), so the plan treats **cross-validation against the TS engine as
a first-class deliverable**, not an afterthought. The Python stack trains;
the app still plays with the exact same weight file (`engine-v0.json`) and
the exact same TS forward pass. Decisions locked with the user:

- **Framework: PyTorch with the MPS backend.** Mature, autograd, portable,
  well-documented Metal support. (MLX would likely be a bit faster on the
  M5 but is newer/Mac-only; PyTorch is the safer base and the net is tiny,
  so the framework barely affects compute — the vectorized engine is the
  real work.)
- **Engine fidelity: exact match.** The Python engine reproduces
  `movesForDie`/`getLegalMoves`/`enumerateTurnOutcomes` semantics —
  full-turn enumeration, forced max-play, larger-die rule, bear-off
  overshoot, bar priority — and is cross-validated against the TS engine on
  thousands of random positions. Training policy is identical to the app's.

Everything lands on branch **`feat/python-trainer`** (this branch), in a
top-level **`python/`** directory. Nothing under `src/` or `train/` imports
it; Metro never sees it.

## Interfaces this must match exactly (from the existing code)

These are fixed contracts — the Python side reproduces them bit-for-bit so
exported weights drop into the app unchanged.

**Board state** (`src/engine/types.ts`): 24 points, each empty or an owned
stack; `bar`/`off` per player; white travels 24→1, black 1→24. Python
batch representation: `board[B, 28] int8` — indices 0–23 signed point
counts (`+n` white, `−n` black, 0 empty), 24/25 = bar white/black, 26/27 =
off white/black. A `player[B]` sign (+1 white / −1 black) and `dice[B, 4]`
(0 = used/absent) complete a batch.

**Network** (`src/ai/network.ts`): MLP `196 → hidden(128) → 5`, **sigmoid
hidden and sigmoid outputs**. Outputs (GNU layout, on-roll view):
`[P(win), P(win gammon+), P(win bg), P(lose gammon+), P(lose bg)]`.
Weight JSON:
```
{ meta:{version:1, encoding:"v0-196", hidden, games, trainedAt},
  inputs:196, hidden, outputs:5,
  W1:[inputs*hidden]  // input-major: W1[i*hidden + j] = input i → hidden j
  b1:[hidden], W2:[outputs*hidden] /* output-major */, b2:[outputs] }
```
Forward: `h = sigmoid(x @ W1mat + b1)`, `W1mat = reshape(W1,(inputs,hidden))`;
`o = sigmoid(h @ reshape(W2,(outputs,hidden)).T + b2)`.
PyTorch↔JSON mapping (the one easy place to get transposes wrong):
`Linear1.weight` is `(hidden, inputs)` ⇒ `W1_json = Linear1.weight.T.flatten()`;
`Linear2.weight` is `(outputs, hidden)` ⇒ `W2_json = Linear2.weight.flatten()`.
`deserializeNet` rejects `meta.encoding !== "v0-196"` and wrong array
lengths — the skew guard.

**Encoding** (`src/ai/encoding.ts`, 196 inputs, hero perspective; mirror
for black — hero point `p` reads physical `p` if white, `25−p` if black):
per slot 1..24, 4 hero then 4 opponent units `[n≥1, n≥2, n≥3, max(0,n−3)/2]`
(192), then `barHero/2, barOpp/2, offHero/15, offOpp/15` (indices 192–195).

**Equity / flip / TD** (`src/ai/evaluate.ts`, `train/td.ts`):
`equity = 2·o₀ − 1 + o₁ + o₂ − o₃ − o₄`; `flip(o) = [1−o₀, o₃, o₄, o₁, o₂]`;
afterstate value from mover's view = `−equity(V(board, opponentToMove))`.
TD(λ): α=0.1, λ=0.7, terminal targets from `winKind` (single/gammon/bg).
The frame-flip trace algebra (head 0 negates; heads 1↔3, 2↔4 swap) is
documented in `train/td.ts` and reproduced in the batched version.

## Deliverables (in `python/`)

```
python/
  pyproject.toml          # uv project; pins torch, numpy, pytest
  README.md               # setup (uv), run, export, parity story
  bgtrain/
    engine.py             # vectorized exact engine (board, dice, moves, turns, scoring)
    encoding.py           # batched 196-feature encoder + mirror
    net.py                # torch MLP 196→128→5 sigmoid; JSON import/export
    td.py                 # batched TD(λ) with frame-flip traces (+ λ=0 path)
    selfplay.py           # batched self-play loop (B games in lockstep) on MPS
    train.py              # CLI: --games --batch --hidden --alpha --lambda --seed --out --device
    benchmark.py          # net vs random/pip/checkpoint (parallels train/benchmark.ts)
    export_weights.py     # write engine-v0.json in the exact app format
  tests/
    test_engine_crossval.py   # vs TS fixtures (legal moves + turn outcomes)
    test_encoding_parity.py   # vs TS encoding on shared positions
    test_net_parity.py        # forward outputs vs TS net on shared weights
    test_td.py                # flip involution, equity negation, λ=0 update
    fixtures/                 # JSON exported from TS (gitignored if large; regen script)
train/export-fixtures.ts   # NEW tsx script: dump seeded positions + legalMoves + turnOutcomes + encodings + net outputs to python/tests/fixtures/*.json
```

## The hard part: exact vectorized full-turn enumeration

A turn is a length-2 (or length-4 for doubles) dice sequence; the engine
must return every **distinct** legal full-turn afterstate under forced
max-play. Vectorized approach (fixed-depth batched expansion + mask):

1. **Single-die legality** `single_die_moves(board, player, die) → (B, 24)
   mask` plus a batched apply: bar-entry priority (if `bar[player]>0`, only
   entry moves), `canPlace` (blocked iff opponent count ≥ 2), bear-off
   (exact die, or overshoot only from the farthest occupied point). All
   pure array ops over the `(B,28)` state — no Python per-game loop.
2. **Fixed-depth expansion.** Maintain a per-game candidate buffer
   `cand[B, MAX_CAND, 28]` with a validity mask. Expand depth-by-depth (2
   for non-doubles trying both die orders; up to 4 for doubles), applying
   single-die moves and appending resulting boards. `MAX_CAND` sized from
   the TS distribution (dedup keeps real counts in the tens–low-hundreds;
   start 256, assert no overflow in cross-val).
3. **Forced max-play** = keep only terminals at each game's maximum reached
   depth (mirrors `maxPlayLength`). **Larger-die rule**: when max depth ==
   1 and both dice were individually playable, keep only the larger-die
   afterstate (mirrors `getLegalMoves` lines 104–111).
4. **Dedup** afterstates per game by a canonical key — hash the `(28,)`
   int8 vector (e.g. a fixed dot with random int64 weights) and unique
   within each game row.
5. **Argmax selection**: encode all valid candidates `(ΣB·cand, 196)`, one
   batched net eval, `−equity(flip(·))`, segment-argmax per game → chosen
   afterstate. Greedy for training (dice supply exploration), matching the
   app.

This is the module that carries the "exact match" effort and the highest
bug risk; step 6 (cross-validation) is how we make it trustworthy.

## Cross-validation & parity (the anti-skew gates)

1. **Engine cross-val** (`test_engine_crossval.py`): `train/export-fixtures.ts`
   plays seeded random games and dumps, for thousands of positions, the
   board + dice + `getLegalMoves` (as `{from,to,die}` sets) + the full
   `enumerateTurnOutcomes` afterstate-key set. Python asserts identical
   legal single-die moves **and** identical set of full-turn afterstate
   keys. This is the correctness keystone — the Python engine is only
   trusted where it provably agrees with the tested TS engine.
2. **Encoding parity**: for the same positions, compare Python's 196-vector
   to the TS `encodeBoard` output (exported), elementwise.
3. **Net-forward parity**: load `src/ai/weights/engine-v0.json` into the
   PyTorch net; compare its 5 outputs to TS `forward` outputs (exported)
   on sample positions — pins the JSON↔tensor weight mapping.
4. **Export round-trip**: after training, `export_weights.py` writes
   `engine-v0.json`; a tsx check loads it via `deserializeNet` and compares
   TS `forward` to the Python net on held-out positions (train==serve).
5. **End-to-end**: run the Python-trained net through the **existing TS
   benchmark** (`npm run benchmark`) vs random/pip and vs the current
   50k-game TS net — the ultimate "did it actually learn, and does it play
   the same in the app" check.

## Training loop & performance

Batched self-play: `B` games (e.g. 1024–4096) in one `(B,28)` tensor on
MPS; per ply — roll dice (vectorized), enumerate + pick afterstate, batched
TD(λ) update, detect finished games (`off==15`), grade with `winKind`,
reset finished slots and keep the batch full (a rolling population so the
GPU never idles). Checkpoints every N games; same JSON format so the TS
tooling reads them.

**Projection (to be measured on the M5 — no Apple GPU here to benchmark):**
the net eval is trivial; the batched enumeration ops dominate. A working
version should reach ~10k–100k games/s, i.e. a strong net (~100k–300k
games) in **~1–10 min**, vs ~1–2 h for the TS trainer. First version may be
slower until enumeration is tuned; `--device cpu` stays a correct fallback,
and pure-NumPy vectorization alone (no GPU) is already a big win.

## Milestones (suggested order; each independently verifiable)

1. Scaffold `python/` (uv project, deps, CI-free pytest), `.gitignore` for
   `python/.venv`, `python/**/__pycache__`, large fixtures.
2. `train/export-fixtures.ts` + fixture generation.
3. `engine.py` single-die moves + `test_engine_crossval.py` (single-die) —
   green before turns.
4. `engine.py` full-turn enumeration + dice + scoring; extend cross-val to
   turn-outcome sets. **Correctness keystone.**
5. `encoding.py` + `net.py` (import/export) + encoding & net-forward parity
   tests.
6. `td.py` batched TD(λ) + `test_td.py` (flip involution, equity negation,
   λ=0 numeric check).
7. `selfplay.py` + `train.py`; small run on CPU proves it learns
   (>90% vs random), then MPS.
8. `benchmark.py`; `export_weights.py` + round-trip parity; run the TS
   benchmark on a Python-trained net.
9. `README.md`; if it meets the strength bar, export and ship
   `engine-v0.json` (same as the TS flow).

## Risks / mitigations

- **Two engines drift** → cross-val (steps 1–5 above) gates every layer;
  the encoding-id guard in `deserializeNet` blocks mismatched weights at
  load.
- **Vectorized enumeration is intricate** (forced-play, doubles) → build
  single-die first, expand depth-by-depth, and lean on the TS
  turn-outcome fixtures to catch any divergence before training.
- **MPS op gaps / dtype quirks** → keep the model in float32, guard with
  `--device cpu` fallback, and unit-test forward parity on both devices.
- **Overclaiming speed** → projections are explicitly unmeasured (no Apple
  GPU in this environment); the plan verifies *correctness* here and leaves
  the wall-clock numbers to be confirmed on the M5.

## Verification summary

`uv run pytest` green (engine cross-val, encoding/net parity, TD math);
`python -m bgtrain.train --games … --device cpu` learns to >90% vs random;
export round-trip parity passes in TS; `npm run benchmark` on the exported
net matches or beats the current TS net. Then the same file ships to the
app unchanged.
