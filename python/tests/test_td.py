import torch

from bgtrain.evaluate import equity, flip_outputs
from bgtrain.td import lambda_return_targets, terminal_white_outcome


def test_flip_is_involution():
    o = torch.tensor([[0.62, 0.2, 0.05, 0.14, 0.03], [0.1, 0.0, 0.0, 0.5, 0.2]])
    assert torch.allclose(flip_outputs(flip_outputs(o)), o, atol=1e-6)


def test_equity_negates_under_flip():
    o = torch.tensor([[0.62, 0.2, 0.05, 0.14, 0.03]])
    assert torch.allclose(equity(flip_outputs(o)), -equity(o), atol=1e-6)


def test_mse_invariant_under_flip():
    a = torch.rand(8, 5)
    b = torch.rand(8, 5)
    m1 = ((a - b) ** 2).sum(-1)
    m2 = ((flip_outputs(a) - flip_outputs(b)) ** 2).sum(-1)
    assert torch.allclose(m1, m2, atol=1e-6)


def test_lambda0_is_one_step_bootstrap():
    # With lam=0, target for a state = value of the next state (or terminal).
    T, B = 3, 1
    Vw = torch.zeros(T, B, 5)
    Vw[0, 0] = torch.tensor([0.1, 0, 0, 0, 0])
    Vw[1, 0] = torch.tensor([0.7, 0, 0, 0, 0])
    Vw[2, 0] = torch.tensor([0.4, 0, 0, 0, 0])
    Ow = torch.tensor([[1.0, 0, 0, 0, 0]])  # white wins single
    alive = torch.ones(T, B, dtype=torch.bool)
    G = lambda_return_targets(Vw, Ow, alive, lam=0.0)
    # state2's next is terminal -> Ow; state1's next is state2 -> Vw[2]; etc.
    assert torch.allclose(G[2, 0], Ow[0], atol=1e-6)
    assert torch.allclose(G[1, 0], Vw[2, 0], atol=1e-6)
    assert torch.allclose(G[0, 0], Vw[1, 0], atol=1e-6)


def test_lambda1_is_monte_carlo():
    # With lam=1, every state's target is the terminal outcome.
    T, B = 4, 1
    Vw = torch.rand(T, B, 5)
    Ow = torch.tensor([[0.0, 0, 0, 1.0, 1.0]])  # black wins backgammon
    alive = torch.ones(T, B, dtype=torch.bool)
    G = lambda_return_targets(Vw, Ow, alive, lam=1.0)
    for t in range(T):
        assert torch.allclose(G[t, 0], Ow[0], atol=1e-6)


def test_terminal_outcome_grading():
    from bgtrain.engine import CHECKERS

    # White borne off all 15, black borne off some -> white single win.
    b = torch.zeros(1, 28, dtype=torch.long)
    b[0, 26] = CHECKERS
    b[0, 27] = 3
    o = terminal_white_outcome(b)
    assert torch.allclose(o[0], torch.tensor([1.0, 0, 0, 0, 0]))

    # White wins, black borne off none and has a checker in white's home (idx3)
    # and one on the bar -> backgammon.
    b2 = torch.zeros(1, 28, dtype=torch.long)
    b2[0, 26] = CHECKERS
    b2[0, 3] = -1
    b2[0, 25] = 1
    o2 = terminal_white_outcome(b2)
    assert torch.allclose(o2[0], torch.tensor([1.0, 1.0, 1.0, 0, 0]))
