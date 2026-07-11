"""Encoding and net-forward parity against the TypeScript implementation."""

import json
from pathlib import Path

import torch

from bgtrain.encoding import encode
from bgtrain.net import ValueNet

WEIGHTS = Path(__file__).parents[2] / "src" / "ai" / "weights" / "engine-v0.json"


def _boards_players(fx):
    boards = torch.tensor([f["board28"] for f in fx], dtype=torch.long)
    players = torch.tensor([1 if f["turn"] == "white" else -1 for f in fx])
    return boards, players


def test_encoding_matches_ts(fixtures):
    fx = fixtures["moveFixtures"]
    boards, players = _boards_players(fx)
    got = encode(boards, players)  # (N,196)
    want = torch.tensor([f["encoding"] for f in fx], dtype=torch.float32)
    assert got.shape == want.shape
    max_diff = (got - want).abs().max().item()
    assert max_diff < 1e-6, f"encoding differs from TS by {max_diff}"


def test_net_forward_matches_ts(fixtures):
    """Load the app's shipped weights into the PyTorch net; outputs must match
    the TS forward pass on the same encodings (pins the JSON<->tensor mapping)."""
    if not WEIGHTS.exists():
        import pytest

        pytest.skip("engine-v0.json missing")
    with open(WEIGHTS) as f:
        data = json.load(f)
    net = ValueNet(data["hidden"]).load_json(data).eval()

    fx = fixtures["moveFixtures"][:1000]
    x = torch.tensor([f["encoding"] for f in fx], dtype=torch.float32)
    with torch.no_grad():
        got = net(x)
    want = torch.tensor([f["netOut"] for f in fx], dtype=torch.float32)
    max_diff = (got - want).abs().max().item()
    assert max_diff < 2e-5, f"net forward differs from TS by {max_diff}"


def test_json_round_trip():
    """to_json -> load_json reproduces the same forward outputs."""
    torch.manual_seed(0)
    net = ValueNet(32)
    data = net.to_json(games=0)
    net2 = ValueNet(32).load_json(data)
    x = torch.randn(16, 196)
    with torch.no_grad():
        assert torch.allclose(net(x), net2(x), atol=1e-6)
