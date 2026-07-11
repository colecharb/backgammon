"""Batched self-play and the TD(λ) training step.

A batch of B games advances in lockstep; each game's full trajectory is
recorded, then one gradient step regresses the value net toward TD(λ) targets.
The engine, encoder, and net are the same ones validated against the TS code,
so training and the app evaluate positions identically.
"""

from __future__ import annotations

import torch

from .encoding import encode
from .engine import CHECKERS, OFF_B, OFF_W
from .evaluate import choose_afterstates, flip_outputs
from .td import lambda_return_targets, terminal_white_outcome

MAX_PLIES = 400  # safety cap; real games finish in well under 100


def initial_board(device="cpu") -> torch.Tensor:
    b = torch.zeros(28, dtype=torch.long, device=device)
    for point, count in [(24, 2), (13, 5), (8, 3), (6, 5)]:  # white
        b[point - 1] = count
    for point, count in [(1, 2), (12, 5), (17, 3), (19, 5)]:  # black
        b[point - 1] = -count
    return b


def _roll_pairs(B, device, gen):
    a = torch.randint(1, 7, (B,), device=device, generator=gen)
    b = torch.randint(1, 7, (B,), device=device, generator=gen)
    return a, b


def roll_turn(B, device, gen) -> torch.Tensor:
    """(B,4) dice: doubles as [a,a,a,a], else [a,b,0,0]."""
    a, b = _roll_pairs(B, device, gen)
    dbl = a == b
    dice = torch.zeros(B, 4, dtype=torch.long, device=device)
    dice[:, 0] = a
    dice[:, 1] = torch.where(dbl, a, b)
    dice[:, 2] = torch.where(dbl, a, torch.zeros_like(a))
    dice[:, 3] = torch.where(dbl, a, torch.zeros_like(a))
    return dice


def roll_opening(B, device, gen):
    """One die each, higher starts and plays both; ties reroll."""
    a, b = _roll_pairs(B, device, gen)
    tie = a == b
    while tie.any():
        ra, rb = _roll_pairs(B, device, gen)
        a = torch.where(tie, ra, a)
        b = torch.where(tie, rb, b)
        tie = a == b
    players = torch.where(a > b, 1, -1)  # white=+1 rolled a
    hi = torch.maximum(a, b)
    lo = torch.minimum(a, b)
    dice = torch.zeros(B, 4, dtype=torch.long, device=device)
    dice[:, 0] = hi
    dice[:, 1] = lo
    return players, dice


def play_batch(net, B, device, gen, cap=640):
    """Play B games to completion; return recorded trajectory tensors and the
    terminal boards. ``boards`` (T,B,28), ``players`` (T,B), ``alive`` (T,B),
    ``final`` (B,28)."""
    board = initial_board(device).unsqueeze(0).repeat(B, 1)
    players, dice = roll_opening(B, device, gen)
    done = torch.zeros(B, dtype=torch.bool, device=device)
    final = board.clone()

    tb, tp, ta = [], [], []
    for _ in range(MAX_PLIES):
        alive = ~done
        if not alive.any():
            break
        tb.append(board.clone())
        tp.append(players.clone())
        ta.append(alive.clone())

        nxt, _ = choose_afterstates(net, board, players, dice, cap=cap)
        board = torch.where(alive.view(B, 1), nxt, board)

        won = alive & ((board[:, OFF_W] == CHECKERS) | (board[:, OFF_B] == CHECKERS))
        final = torch.where(won.view(B, 1), board, final)
        done = done | won

        cont = alive & ~won
        players = torch.where(cont, -players, players)
        dice = roll_turn(B, device, gen)

    boards = torch.stack(tb)  # (T,B,28)
    return boards, torch.stack(tp), torch.stack(ta), final


class Trainer:
    def __init__(self, net, lr=0.05, lam=0.7, device="cpu"):
        self.net = net
        self.lam = lam
        self.device = device
        self.opt = torch.optim.SGD(net.parameters(), lr=lr)

    def train_step(self, B, gen, cap=640):
        boards, players, alive, final = play_batch(self.net, B, self.device, gen, cap=cap)
        T = boards.shape[0]

        flat = boards.reshape(T * B, 28)
        pflat = players.reshape(T * B)
        x = encode(flat, pflat)
        o = self.net(x).reshape(T, B, 5)
        white = (players > 0).unsqueeze(-1)
        Vw = torch.where(white, o, flip_outputs(o))  # (T,B,5) white frame

        Ow = terminal_white_outcome(final)
        with torch.no_grad():
            G = lambda_return_targets(Vw.detach(), Ow, alive, self.lam)

        mask = alive.unsqueeze(-1).float()
        diff = (Vw - G) * mask
        loss = (diff**2).sum() / mask.sum().clamp(min=1)

        self.opt.zero_grad()
        loss.backward()
        self.opt.step()

        games = B
        halfmoves = alive.sum().item()
        return {"loss": loss.item(), "games": games, "plies": T, "halfmoves": halfmoves}
