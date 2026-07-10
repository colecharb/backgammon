# Training the backgammon engine

TD-Gammon-style self-play, entirely in TypeScript. The trainer imports the
same `src/engine/` move generation and the same `src/ai/` network forward
pass that the app uses, so a position is evaluated identically in training
and in gameplay. Nothing under `src/` may import from `train/` — that keeps
the trainer out of the Metro bundle.

## How it works

- **Model** (`src/ai/network.ts`): MLP 196 → 128 sigmoid → 5 sigmoid.
  Outputs, from the on-roll player's view: `[P(win), P(win gammon+),
  P(win backgammon), P(lose gammon+), P(lose backgammon)]`. Cubeless
  equity = `2·o₀ − 1 + o₁ + o₂ − o₃ − o₄`.
- **Features** (`src/ai/encoding.ts`): TD-Gammon-style, always from the
  on-roll player's perspective (the board is mirrored for black).
- **Learning** (`train/td.ts`): online TD(λ) with eligibility traces,
  α=0.1, λ=0.7. Because the evaluation frame alternates every half-move,
  traces are flipped between frames (head 0 negates, heads 1↔3 and 2↔4
  swap) — see the derivation comment in `td.ts`.
- **Self-play** (`train/selfplay.ts`): greedy 1-ply move selection over all
  distinct full-turn outcomes (`src/engine/turns.ts`); exploration comes
  from the dice. Training is cubeless.

## Commands

```sh
# The real run (MacBook Air M5: a few hours; games get faster as it learns)
npm run train -- --games 200000 --seed 42

# Resume after an interruption (game counter is cumulative)
npm run train -- --games 100000 --resume train/checkpoints/latest.json

# Strength check (agents: a checkpoint path, "random", or "pip")
npm run benchmark -- --a train/checkpoints/latest.json --b pip --games 2000
npm run benchmark -- --a train/checkpoints/latest.json --b train/checkpoints/ckpt-50000.json
```

Checkpoints land in `train/checkpoints/` (gitignored) every 5k games, plus
`latest.json`. Progress logs show games/sec and periodic evals vs the
random and greedy-pip baselines.

Useful flags: `--hidden 80` (faster, slightly weaker), `--lambda 0`
(plain one-step TD — the first thing to try if learning ever misbehaves),
`--alpha`, `--eval-every`, `--checkpoint-every`, `--log-every`.

## Shipping new weights

```sh
cp train/checkpoints/latest.json src/ai/weights/engine-v0.json
npm test
```

The app loads `src/ai/weights/engine-v0.json` at startup
(`src/ai/weights.ts`). The JSON carries meta (`encoding`, `hidden`,
`games`); loading refuses weights whose feature encoding doesn't match the
code, so a stale file fails loudly rather than playing garbage.

## Health bars

- A few thousand games in, the net should beat `random` >90%.
  If it hovers near 50%, suspect a perspective/sign bug first (`--lambda 0`
  isolates the trace algebra).
- A healthy long run lands ≥95% vs `random` and roughly 80–90% vs `pip`,
  with positive points-per-game against both.
