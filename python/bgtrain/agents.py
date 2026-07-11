"""Baseline move choosers and a batched match harness for evaluation.

A chooser takes ``(boards, players, dice)`` and returns ``next_boards`` and a
``moved`` mask, mirroring ``choose_afterstates``.
"""

from __future__ import annotations

import torch

from .engine import BAR_B, BAR_W, POINTS, enumerate_turns
from .evaluate import choose_afterstates
from .selfplay import initial_board, roll_opening, roll_turn


def _pip(boards: torch.Tensor, player_sign: int) -> torch.Tensor:
    """Pip count for the given player across a (…,28) batch (bar counts 25)."""
    pts = boards[..., :POINTS]
    idx = torch.arange(POINTS, device=boards.device)
    # white pips = point number; black pips = 25 - point number
    dist_w = (idx + 1).view(*([1] * (pts.dim() - 1)), POINTS)
    dist_b = (POINTS + 1 - (idx + 1)).view(*([1] * (pts.dim() - 1)), POINTS)
    if player_sign > 0:
        onpoint = pts.clamp(min=0) * dist_w
        bar = boards[..., BAR_W] * (POINTS + 1)
    else:
        onpoint = (-pts).clamp(min=0) * dist_b
        bar = boards[..., BAR_B] * (POINTS + 1)
    return onpoint.sum(-1) + bar


def random_chooser(gen):
    def choose(boards, players, dice, cap=640):
        after, valid = enumerate_turns(boards, players, dice, cap=cap)
        maxc = int(valid.sum(1).max().item())
        if maxc == 0:
            return boards.clone(), torch.zeros(boards.shape[0], dtype=torch.bool, device=boards.device)
        after, valid = after[:, :maxc], valid[:, :maxc]
        noise = torch.rand(valid.shape, generator=gen, device=boards.device)
        pick = noise.masked_fill(~valid, -1).argmax(1)
        moved = valid.any(1)
        chosen = after.gather(1, pick.view(-1, 1, 1).expand(-1, 1, 28)).squeeze(1)
        return torch.where(moved.view(-1, 1), chosen, boards), moved

    return choose


def pip_chooser():
    """Greedy: maximize (opponent pips - own pips) after the move."""
    def choose(boards, players, dice, cap=640):
        after, valid = enumerate_turns(boards, players, dice, cap=cap)
        maxc = int(valid.sum(1).max().item())
        if maxc == 0:
            return boards.clone(), torch.zeros(boards.shape[0], dtype=torch.bool, device=boards.device)
        after, valid = after[:, :maxc], valid[:, :maxc]
        N, K, _ = after.shape
        # own/opp pips per candidate; player sign varies per game.
        own = torch.where(
            (players > 0).view(N, 1), _pip(after, 1), _pip(after, -1)
        )
        opp = torch.where(
            (players > 0).view(N, 1), _pip(after, -1), _pip(after, 1)
        )
        lead = (opp - own).float().masked_fill(~valid, float("-inf"))
        pick = lead.argmax(1)
        moved = valid.any(1)
        chosen = after.gather(1, pick.view(-1, 1, 1).expand(-1, 1, 28)).squeeze(1)
        return torch.where(moved.view(-1, 1), chosen, boards), moved

    return choose


def neural_chooser(net, greedy=True):
    def choose(boards, players, dice, cap=640):
        return choose_afterstates(net, boards, players, dice, cap=cap, greedy=greedy)

    return choose


@torch.no_grad()
def play_match(chooser_a, chooser_b, games, device, gen, cap=640):
    """Play ``games`` between two choosers, A as white in even games and black
    in odd games (colors alternated). Returns a stats dict from A's view."""
    B = games
    board = initial_board(device).unsqueeze(0).repeat(B, 1)
    players, dice = roll_opening(B, device, gen)
    a_is_white = torch.arange(B, device=device) % 2 == 0
    done = torch.zeros(B, dtype=torch.bool, device=device)
    from .engine import winners_and_kinds

    final = board.clone()
    for _ in range(400):
        alive = ~done
        if not alive.any():
            break
        a_to_move = (players > 0) == a_is_white  # A moves this ply
        na, _ = chooser_a(board, players, dice)
        nb, _ = chooser_b(board, players, dice)
        nxt = torch.where(a_to_move.view(B, 1), na, nb)
        board = torch.where(alive.view(B, 1), nxt, board)
        won = alive & ((board[:, 26] == 15) | (board[:, 27] == 15))
        final = torch.where(won.view(B, 1), board, final)
        done = done | won
        players = torch.where(alive & ~won, -players, players)
        dice = roll_turn(B, device, gen)

    d, winner, kind = winners_and_kinds(final)
    a_won = d & ((winner == 1) == a_is_white)
    from .evaluate import WIN_MULT

    pts = WIN_MULT.to(device)[kind]
    a_pts = torch.where(a_won, pts, torch.zeros_like(pts)).sum().item()
    b_pts = torch.where(d & ~a_won, pts, torch.zeros_like(pts)).sum().item()
    return {
        "games": B,
        "a_wins": int(a_won.sum().item()),
        "decided": int(d.sum().item()),
        "a_points": a_pts,
        "b_points": b_pts,
    }
