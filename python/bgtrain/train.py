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
    p.add_argument("--cap", type=int, default=640)
    p.add_argument("--out", default="checkpoints/latest.json")
    p.add_argument("--resume", default=None)
    p.add_argument("--eval-every", type=int, default=50)
    p.add_argument("--log-every", type=int, default=10)
    args = p.parse_args()

    device = args.device
    if device == "mps" and not torch.backends.mps.is_available():
        print("MPS unavailable; falling back to cpu")
        device = "cpu"

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

    t0 = time.time()
    games_done = 0  # this run
    for it in range(1, args.iters + 1):
        stats = trainer.train_step(args.batch, gen, cap=args.cap)
        games_done += stats["games"]
        total = games_before + games_done
        if it % args.log_every == 0:
            gps = games_done / (time.time() - t0)
            trunc = truncations()
            print(
                f"iter {it}/{args.iters} | {total} games | {gps:.0f} games/s | "
                f"loss {stats['loss']:.4f} | plies {stats['plies']}"
                + (f" | TRUNCATED {trunc}" if trunc else "")
            )
        if it % args.eval_every == 0 or it == args.iters:
            net.eval()
            evaluate(net, device, args.seed + it)
            net.train()
            save_net(net, args.out, games_before + games_done)
    print(f"Done. Weights: {args.out} ({games_before + games_done} games)")


if __name__ == "__main__":
    main()
