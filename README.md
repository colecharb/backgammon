# backgammon

A complete backgammon game — rules engine, mobile/web app, and a TD-Gammon-style neural net trained by self-play — written from scratch in TypeScript. No game libraries, no ML frameworks.

You can play it at https://backgammon.colecharb.com/. Best on mobile.

<img width="600" alt="IMG_8062" src="https://github.com/user-attachments/assets/13071917-bad6-4f1d-9c1a-c27aba289b90" />


## The AI

A value network in the lineage of Tesauro's TD-Gammon, implemented end-to-end in this repo:

- **Network** (`src/ai/network.ts`) — MLP, 196 → 128 sigmoid → 5 sigmoid, hand-rolled on typed arrays with a zero-allocation forward pass. The five heads, from the on-roll player's view: *P(win), P(win gammon+), P(win backgammon), P(lose gammon+), P(lose backgammon)*. Cubeless equity = `2·p₀ − 1 + p₁ + p₂ − p₃ − p₄`.
- **Features** (`src/ai/encoding.ts`) — TD-Gammon-style, 196 inputs: 24 points × 4 units per side, plus bar and borne-off counts, always encoded from the on-roll player's perspective (black reads the board through a mirror, so no side-to-move input is needed).
- **Training** (`train/`) — online TD(λ) with eligibility traces (trainer defaults: α = 0.1, λ = 0.7 [FILL: Cole confirms these were used for the shipped run]), cubeless self-play, greedy 1-ply selection over every distinct full-turn outcome; exploration comes from the dice. The evaluation perspective flips every half-move, so traces are transformed between frames — the derivation is a comment in `train/td.ts`.
- **Play** (`src/ai/evaluate.ts`, `src/ai/ai.ts`) — the app plays greedy 1-ply over the full-turn enumeration, and doubles on fixed cubeless-equity thresholds (take down to −0.5; offer between 0.4 and 0.9). Deliberately simple v0 cube handling: the net knows nothing about cube ownership, and the code says so.

The same forward pass evaluates positions in training (Node) and in the app (on-device, no native ML dependencies).

**Result.** The shipped weights (`src/ai/weights/engine-v0.json`) come from a 200,000-game self-play run. Against the repo's own baselines — seeded and reproducible via `npm run benchmark`:

| Opponent   | Win rate (2,000 games) | Points/game (cubeless) |
| ---------- | ---------------------- | ---------------------- |
| random     | 99.9% ± 0.1%           | +2.62                  |
| greedy-pip | 99.5% ± 0.2%           | +2.39                  |


## The app

React Native + Expo SDK 57, TypeScript (strict), jotai for state, react-native-svg for the board. iOS and web (and theoretically Android) from one codebase.

- Full rules for single money-style games: forced-move handling (maximal dice use, compulsory larger die), hitting, bar entry, bearing off, gammon/backgammon scoring, and a complete doubling cube (offer / take / drop, with undo as fat-finger insurance on a pending double). Match play — match scores, Crawford — is not implemented.
- The engine (`src/engine/`) is pure functions over immutable state; the UI, the computer player, and the trainer all import the same code. `enumerateTurnOutcomes` dedupes whole turns by resulting position behind a transposition guard, and a seeded property test cross-validates it against the move-by-move generator over random playouts.
- Tap-to-move gated to legal moves, dice swapping, per-move undo, animated checkers, orientation-adaptive layout.
- Human vs human or vs the engine — the computer acts through the same state atoms as the human, one paced, watchable action at a time.
- 69 unit tests (vitest) across rules, turn enumeration, the cube, encoding, the TD math, and equity ranking; `tsc --noEmit` is clean.
- A live analysis panel (`src/components/analysis/`) ranks every legal play of the current turn by net equity — the same evaluation the computer maximizes — as a bar chart beside the board.

<img width="600" height="600" alt="ScreenRecording_07-23-2026 14-55-34_1" src="https://github.com/user-attachments/assets/f3bb2745-f133-4c7d-ba81-d53e3ee72178" />

### Run it

```sh
npm ci
npm start        # Expo dev server → iOS/Android
npm run web      # in the browser
npm test
```

### Web build

```sh
npx expo export --platform web   # static site in dist/, deploy anywhere
```

### Train it

```sh
npm run train -- --games 200000 --seed 42
npm run benchmark -- --a train/checkpoints/latest.json --b pip --games 2000
```

Training notes, health bars, and the checkpoint/resume workflow are in [`train/README.md`](train/README.md).
