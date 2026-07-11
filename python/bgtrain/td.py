"""TD(λ) targets for batched self-play.

Every state is scored in a single fixed frame (white's), so no per-step flip
is needed inside the return recursion. Value heads in white's frame are
``[P(white win), win gammon+, win bg, lose gammon+, lose bg]``; MSE is
invariant under the perspective flip (it is a permutation plus ``x -> 1-x`` on
head 0), so the loss can be taken directly in white's frame.
"""

from __future__ import annotations

import torch

from .engine import winners_and_kinds


def terminal_white_outcome(boards: torch.Tensor) -> torch.Tensor:
    """White-frame 5-vector for finished games; zeros where not finished."""
    done, winner, kind = winners_and_kinds(boards)
    N = boards.shape[0]
    o = torch.zeros(N, 5, device=boards.device)
    white_win = done & (winner == 1)
    black_win = done & (winner == -1)
    o[:, 0] = white_win.float()
    o[:, 1] = (white_win & (kind >= 2)).float()
    o[:, 2] = (white_win & (kind == 3)).float()
    o[:, 3] = (black_win & (kind >= 2)).float()
    o[:, 4] = (black_win & (kind == 3)).float()
    return o


def lambda_return_targets(Vw, Ow, alive, lam: float):
    """Forward-view TD(λ) targets in white's frame.

    ``Vw`` (T,B,5) white-frame value of each ply's state, ``Ow`` (B,5) terminal
    white-frame outcome, ``alive`` (T,B) bool (ply is a real visited state;
    True on a contiguous prefix per game). Returns ``G`` (T,B,5), meaningful
    only where ``alive``.
    """
    T, B, _ = Vw.shape
    next_V = Ow.clone()
    next_G = Ow.clone()
    G = torch.zeros_like(Vw)
    for t in range(T - 1, -1, -1):
        g = (1 - lam) * next_V + lam * next_G  # bootstrap target for state t
        a = alive[t].view(B, 1)
        G[t] = torch.where(a, g, torch.zeros_like(g))
        next_V = torch.where(a, Vw[t], next_V)
        next_G = torch.where(a, g, next_G)
    return G
