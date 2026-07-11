"""Benchmark a trained net vs baselines or another checkpoint.

    uv run python -m bgtrain.benchmark --a checkpoints/latest.json --b pip --games 1000
"""

from __future__ import annotations

import argparse
import math

import torch

from .agents import neural_chooser, pip_chooser, play_match, random_chooser
from .net import load_net


def _chooser(spec, device, gen):
    if spec == "random":
        return random_chooser(gen), "random"
    if spec == "pip":
        return pip_chooser(), "greedy-pip"
    net = load_net(spec, device=device)
    return neural_chooser(net), spec


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--a", default="checkpoints/latest.json")
    p.add_argument("--b", default="random")
    p.add_argument("--games", type=int, default=1000)
    p.add_argument("--seed", type=int, default=7)
    p.add_argument("--device", default="cpu")
    args = p.parse_args()

    gen = torch.Generator(device=args.device).manual_seed(args.seed)
    a, la = _chooser(args.a, args.device, gen)
    b, lb = _chooser(args.b, args.device, gen)
    print(f"A: {la}\nB: {lb}\n{args.games} games, alternating colors…")

    r = play_match(a, b, args.games, args.device, gen)
    decided = max(1, r["decided"])
    wr = r["a_wins"] / decided
    se = math.sqrt(wr * (1 - wr) / decided)
    ppg = (r["a_points"] - r["b_points"]) / r["games"]
    print(f"\nA wins {r['a_wins']}/{decided} = {100 * wr:.1f}% ± {100 * se:.1f}%")
    print(f"A points-per-game (cubeless): {ppg:+.3f}")


if __name__ == "__main__":
    main()
