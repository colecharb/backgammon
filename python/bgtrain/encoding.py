"""Batched feature encoder — an exact match of `src/ai/encoding.ts`.

Produces 196 inputs per position from the on-roll player's (hero's)
perspective: the board is read as if hero were white (hero's home is slots
1..6), so the net only ever learns one orientation.
"""

from __future__ import annotations

import torch

from .engine import BAR_B, BAR_W, CHECKERS, OFF_B, OFF_W, POINTS

NUM_INPUTS = 196
ENCODING_ID = "v0-196"


def encode(boards: torch.Tensor, players: torch.Tensor) -> torch.Tensor:
    """``boards`` (N,28) int, ``players`` (N,) sign. Returns (N,196) float32."""
    N = boards.shape[0]
    white = (players > 0).view(N, 1)
    pts = boards[:, :POINTS]  # (N,24) signed, +white

    # Hero-oriented points: positive = hero, in hero-slot order. White reads
    # points as-is; black reverses (slot j -> physical point 25-j) and negates.
    hpts = torch.where(white, pts, -pts.flip(1))  # (N,24)
    hero = hpts.clamp(min=0)  # (N,24)
    opp = (-hpts).clamp(min=0)

    def units(c: torch.Tensor) -> torch.Tensor:  # (N,24) -> (N,24,4)
        return torch.stack(
            [
                (c >= 1).float(),
                (c >= 2).float(),
                (c >= 3).float(),
                (c - 3).clamp(min=0).float() / 2.0,
            ],
            dim=-1,
        )

    slot_feats = torch.cat([units(hero), units(opp)], dim=-1)  # (N,24,8)
    x = torch.empty(N, NUM_INPUTS, dtype=torch.float32, device=boards.device)
    x[:, :192] = slot_feats.reshape(N, 192)

    bar_hero = torch.where(white.view(N), boards[:, BAR_W], boards[:, BAR_B]).float()
    bar_opp = torch.where(white.view(N), boards[:, BAR_B], boards[:, BAR_W]).float()
    off_hero = torch.where(white.view(N), boards[:, OFF_W], boards[:, OFF_B]).float()
    off_opp = torch.where(white.view(N), boards[:, OFF_B], boards[:, OFF_W]).float()
    x[:, 192] = bar_hero / 2.0
    x[:, 193] = bar_opp / 2.0
    x[:, 194] = off_hero / CHECKERS
    x[:, 195] = off_opp / CHECKERS
    return x
