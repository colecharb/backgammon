"""Self-play TD(λ) trainer. Example:

    uv run python -m bgtrain.train --iters 400 --batch 512 --device mps

--games is expressed as training iterations × batch (each iteration plays a
full batch of games and takes one gradient step). Weights export in the app's
JSON format via bgtrain.net.save_net.
"""

from __future__ import annotations

import argparse
import time

import torch

from .agents import neural_chooser, pip_chooser, play_match, random_chooser
from .engine import DEFAULT_CAP
from .net import ValueNet, save_net
from .selfplay import Trainer


def evaluate(net, device, seed, games=400):
    gen = torch.Generator(device=device).manual_seed(seed)
    me = neural_chooser(net)
    vs_rand = play_match(me, random_chooser(gen), games, device, gen)
    vs_pip = play_match(me, pip_chooser(), games, device, gen)

    def pct(r):
        return 100.0 * r["a_wins"] / max(1, r["decided"])

    def ppg(r):
        return (r["a_points"] - r["b_points"]) / max(1, r["games"])

    print(
        f"  eval: vs random {pct(vs_rand):.1f}% (ppg {ppg(vs_rand):+.2f}), "
        f"vs pip {pct(vs_pip):.1f}% (ppg {ppg(vs_pip):+.2f})"
    )


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--iters", type=int, default=400)
    p.add_argument("--batch", type=int, default=512)
    p.add_argument("--hidden", type=int, default=128)
    p.add_argument("--lr", type=float, default=0.05)
    p.add_argument("--lam", type=float, default=0.7)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--device", default="cpu", help="cpu | mps | cuda")
    p.add_argument("--cap", type=int, default=DEFAULT_CAP)
    p.add_argument("--out", default="checkpoints/latest.json")
    p.add_argument("--resume", default=None)
    p.add_argument("--eval-every", type=int, default=50)
    p.add_argument("--eval-games", type=int, default=200)
    p.add_argument("--log-every", type=int, default=1)
    p.add_argument("--max-plies", type=int, default=200, help="per-batch horizon")
    p.add_argument(
        "--heartbeat",
        type=int,
        default=25,
        help="within-iteration progress every N plies (0 to disable)",
    )
    args = p.parse_args()

    device = args.device
    if device == "mps" and not torch.backends.mps.is_available():
        print("MPS unavailable; falling back to cpu")
        device = "cpu"
    if device == "mps":
        print(
            "NOTE: this engine is dispatch-bound (many tiny ops per ply), so on "
            "current code --device cpu is typically several× FASTER than mps. "
            "Try cpu first."
        )

    games_before = 0
    if args.resume:
        import json as _json

        from .net import load_net

        net = load_net(args.resume, device=device)
        with open(args.resume) as f:
            games_before = _json.load(f)["meta"].get("games", 0)
        print(f"Resumed {args.resume} (hidden={net.hidden}, {games_before} games)")
    else:
        net = ValueNet(args.hidden).to(device)
        print(f"Fresh net hidden={args.hidden} lr={args.lr} lam={args.lam} device={device}")

    trainer = Trainer(net, lr=args.lr, lam=args.lam, device=device)
    gen = torch.Generator(device=device).manual_seed(args.seed)

    import os

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)

    from .engine import truncations

    print(
        f"Self-play starting (batch {args.batch}). The first iterations are the "
        "slowest of the run: an untrained net plays long, meandering games until "
        "it learns to bear off, and each iteration plays a whole batch to "
        "completion. Expect games/s to climb and plies to fall as it learns."
    )

    t0 = time.time()
    games_done = 0  # this run
    for it in range(1, args.iters + 1):
        it_start = time.time()
        # Heartbeat only the first couple of iterations (the slow ones); after
        # that the per-iteration line is enough.
        hb = args.heartbeat if it <= 2 else 0
        stats = trainer.train_step(
            args.batch, gen, cap=args.cap, max_plies=args.max_plies, heartbeat=hb
        )
        games_done += stats["games"]
        total = games_before + games_done
        if it % args.log_every == 0:
            dt = time.time() - it_start
            gps = args.batch / dt
            trunc = truncations()
            print(
                f"iter {it}/{args.iters} | {total} games | {dt:.1f}s "
                f"({gps:.0f} games/s) | loss {stats['loss']:.4f} | "
                f"plies {stats['plies']} | unfinished {stats.get('unfinished', 0)}"
                + (f" | TRUNCATED {trunc}" if trunc else ""),
                flush=True,
            )
        if it % args.eval_every == 0 or it == args.iters:
            net.eval()
            evaluate(net, device, args.seed + it, games=args.eval_games)
            net.train()
            save_net(net, args.out, games_before + games_done)
    print(f"Done. Weights: {args.out} ({games_before + games_done} games)")


if __name__ == "__main__":
    main()
