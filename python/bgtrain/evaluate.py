"""Equity, perspective flip, and 1-ply move selection — matching
`src/ai/evaluate.ts`. Move selection enumerates all distinct full-turn
afterstates and picks the one with the best equity from the mover's view.
"""

from __future__ import annotations

import torch

from .encoding import encode
from .engine import CHECKERS, DEFAULT_CAP, OFF_B, OFF_W, enumerate_turns

# Win-kind point multipliers, indexed by kind code (1 single, 2 gammon, 3 bg).
WIN_MULT = torch.tensor([0.0, 1.0, 2.0, 3.0])


def flip_outputs(o: torch.Tensor) -> torch.Tensor:
    """Same position from the other player: win<->lose, gammon/bg heads swap."""
    return torch.stack([1 - o[..., 0], o[..., 3], o[..., 4], o[..., 1], o[..., 2]], dim=-1)


def equity(o: torch.Tensor) -> torch.Tensor:
    """Cubeless expected points for the player whose view ``o`` is."""
    return 2 * o[..., 0] - 1 + o[..., 1] + o[..., 2] - o[..., 3] - o[..., 4]


def _terminal_equity(boards: torch.Tensor, mover: torch.Tensor) -> torch.Tensor:
    """Exact points if ``boards`` is already won by ``mover`` (else 0-ish)."""
    from .engine import winners_and_kinds

    done, winner, kind = winners_and_kinds(boards)
    pts = WIN_MULT.to(boards.device)[kind]
    signed = torch.where(winner == mover, pts, -pts)
    return torch.where(done, signed, torch.zeros_like(signed))


def evaluate_afterstates(net, after, mover, valid):
    """Equity of each afterstate from ``mover``'s view (opponent rolls next).

    ``after`` (N,K,28), ``mover`` (N,) sign, ``valid`` (N,K). Won afterstates
    score exactly; the rest via ``-equity`` of the opponent-perspective net
    output. Invalid slots get -inf so they never win an argmax.
    """
    N, K, _ = after.shape
    flat = after.reshape(N * K, 28)
    opp = (-mover).view(N, 1).expand(N, K).reshape(N * K)
    x = encode(flat, opp)
    o = net(x)
    eq = -equity(o).reshape(N, K)

    done = (flat[:, OFF_W] == CHECKERS) | (flat[:, OFF_B] == CHECKERS)
    term = _terminal_equity(flat, mover.view(N, 1).expand(N, K).reshape(N * K))
    eq = torch.where(done.reshape(N, K), term.reshape(N, K), eq)
    return eq.masked_fill(~valid, float("-inf"))


def choose_afterstates(net, boards, players, dice, cap: int = DEFAULT_CAP, greedy: bool = True):
    """Pick each game's best full-turn afterstate.

    Returns ``next_boards`` (N,28) and ``moved`` (N,) — False where the game
    danced (no legal play), in which case the board is unchanged.
    """
    after, valid = enumerate_turns(boards, players, dice, cap=cap)
    # Trim padding columns to the batch's worst case to cut net evaluations.
    maxcols = int(valid.sum(dim=1).max().item())
    if maxcols == 0:
        return boards.clone(), torch.zeros(boards.shape[0], dtype=torch.bool, device=boards.device)
    after, valid = after[:, :maxcols], valid[:, :maxcols]

    with torch.no_grad():
        eq = evaluate_afterstates(net, after, players, valid)
    moved = valid.any(dim=1)
    if greedy:
        choice = eq.argmax(dim=1)
    else:
        # A dancing row (no valid slot) is all -inf; softmax would be all-NaN and
        # multinomial would reject it. Give such rows a dummy mass on slot 0 —
        # their choice is discarded by `moved` anyway.
        eq_safe = eq.clone()
        eq_safe[~moved, 0] = 0.0
        choice = torch.multinomial(torch.softmax(eq_safe, dim=1), 1).squeeze(1)

    idx = choice.view(-1, 1, 1).expand(-1, 1, 28)
    chosen = after.gather(1, idx).squeeze(1)
    next_boards = torch.where(moved.view(-1, 1), chosen, boards)
    return next_boards, moved
