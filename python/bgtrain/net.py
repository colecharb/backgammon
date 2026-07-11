"""The value network — a PyTorch MLP matching `src/ai/network.ts`
(196 -> hidden -> 5, sigmoid throughout) with import/export in the app's
exact JSON format so trained weights drop into the app unchanged.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import torch
import torch.nn as nn

from .encoding import ENCODING_ID, NUM_INPUTS

NUM_OUTPUTS = 5


class ValueNet(nn.Module):
    def __init__(self, hidden: int = 128):
        super().__init__()
        self.hidden = hidden
        self.l1 = nn.Linear(NUM_INPUTS, hidden)
        self.l2 = nn.Linear(hidden, NUM_OUTPUTS)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = torch.sigmoid(self.l1(x))
        return torch.sigmoid(self.l2(h))

    # ---- app-compatible JSON weights ----
    # TS forward: h = sigmoid(x @ W1mat + b1), W1mat = reshape(W1,(inputs,hidden));
    #             o = sigmoid(h @ reshape(W2,(outputs,hidden)).T + b2).
    # torch Linear does x @ weight.T + bias, so:
    #   l1.weight = W1mat.T = reshape(W1,(inputs,hidden)).T ;  W1_json = l1.weight.T.flatten()
    #   l2.weight = reshape(W2,(outputs,hidden))            ;  W2_json = l2.weight.flatten()
    def load_json(self, data: dict) -> "ValueNet":
        if data["meta"]["encoding"] != ENCODING_ID:
            raise ValueError(
                f"weights encode features as {data['meta']['encoding']!r}, "
                f"expected {ENCODING_ID!r}"
            )
        hidden = data["hidden"]
        if hidden != self.hidden:
            self.__init__(hidden)
        with torch.no_grad():
            w1 = torch.tensor(data["W1"], dtype=torch.float32).reshape(NUM_INPUTS, hidden)
            self.l1.weight.copy_(w1.T)
            self.l1.bias.copy_(torch.tensor(data["b1"], dtype=torch.float32))
            w2 = torch.tensor(data["W2"], dtype=torch.float32).reshape(NUM_OUTPUTS, hidden)
            self.l2.weight.copy_(w2)
            self.l2.bias.copy_(torch.tensor(data["b2"], dtype=torch.float32))
        return self

    def to_json(self, games: int) -> dict:
        with torch.no_grad():
            w1 = self.l1.weight.detach().cpu().t().reshape(-1)  # input-major
            b1 = self.l1.bias.detach().cpu().reshape(-1)
            w2 = self.l2.weight.detach().cpu().reshape(-1)  # output-major
            b2 = self.l2.bias.detach().cpu().reshape(-1)
        rnd = lambda t: [float(f"{v:.7g}") for v in t.tolist()]
        return {
            "meta": {
                "version": 1,
                "encoding": ENCODING_ID,
                "hidden": self.hidden,
                "games": int(games),
                "trainedAt": datetime.now(timezone.utc).isoformat(),
            },
            "inputs": NUM_INPUTS,
            "hidden": self.hidden,
            "outputs": NUM_OUTPUTS,
            "W1": rnd(w1),
            "b1": rnd(b1),
            "W2": rnd(w2),
            "b2": rnd(b2),
        }


def load_net(path: str, device="cpu") -> ValueNet:
    with open(path) as f:
        data = json.load(f)
    net = ValueNet(data["hidden"]).load_json(data)
    return net.to(device)


def save_net(net: ValueNet, path: str, games: int) -> None:
    # Write-then-rename so an interrupted save can't corrupt the file (which is
    # also the --resume source). os.replace is atomic on the same filesystem.
    import os

    tmp = f"{path}.tmp"
    with open(tmp, "w") as f:
        json.dump(net.to_json(games), f)
    os.replace(tmp, path)
