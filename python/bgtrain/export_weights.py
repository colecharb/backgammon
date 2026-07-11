"""Export a trained net to the app's weight file, and emit a parity probe the
TS side checks (train/verify-weights-parity.ts) to prove that the app's forward
pass reproduces the Python net's outputs exactly — the train/serve gate.

    uv run python -m bgtrain.export_weights --net checkpoints/latest.json \
        --out ../src/ai/weights/engine-v0.json --probe checkpoints/parity-probe.json
"""

from __future__ import annotations

import argparse
import json

import torch

from .net import ValueNet, load_net, save_net


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--net", required=True, help="trained checkpoint (app JSON format)")
    p.add_argument("--out", required=True, help="destination engine-v0.json for the app")
    p.add_argument("--probe", default=None, help="optional parity-probe JSON for the TS check")
    p.add_argument("--games", type=int, default=None)
    p.add_argument("--probe-n", type=int, default=256)
    args = p.parse_args()

    net = load_net(args.net)
    with open(args.net) as f:
        games = args.games if args.games is not None else json.load(f)["meta"]["games"]
    save_net(net, args.out, games)
    print(f"Wrote {args.out} (games={games})")

    if args.probe:
        net.eval()
        # Reload from the written file so the probe reflects exactly what ships.
        shipped = load_net(args.out)
        torch.manual_seed(0)
        x = torch.rand(args.probe_n, 196)
        with torch.no_grad():
            out = shipped(x)
        with open(args.probe, "w") as f:
            json.dump({"encodings": x.tolist(), "outputs": out.tolist()}, f)
        print(f"Wrote parity probe {args.probe} ({args.probe_n} samples)")


if __name__ == "__main__":
    main()
