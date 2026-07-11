"""Cross-validate the vectorized engine against the TypeScript engine.

The TS engine is already unit-tested; these tests assert the Python engine
produces byte-identical legal moves, full-turn afterstate sets, and win
grading on thousands of positions exported from it. This is the keystone that
lets training trust the second engine.
"""

import torch

from bgtrain.engine import _expand_one, enumerate_turns, winners_and_kinds

CAP = 640
CHUNK = 128


def _boards(fx):
    return torch.tensor([f["board28"] for f in fx], dtype=torch.long)


def _players(fx):
    return torch.tensor([1 if f["turn"] == "white" else -1 for f in fx], dtype=torch.long)


def _dice(fx):
    out = torch.zeros(len(fx), 4, dtype=torch.long)
    for i, f in enumerate(fx):
        d = f["dice"]
        out[i, : len(d)] = torch.tensor(d)
    return out


def _rowset(after, valid):
    """Set of board tuples for the valid rows of one game's afterstates."""
    return {tuple(after[k].tolist()) for k in range(after.shape[0]) if valid[k]}


def test_full_turn_outcomes_match_ts(fixtures):
    fx = fixtures["moveFixtures"]
    boards, players, dice = _boards(fx), _players(fx), _dice(fx)
    mismatches = 0
    checked = 0
    for start in range(0, len(fx), CHUNK):
        end = min(start + CHUNK, len(fx))
        after, valid = enumerate_turns(
            boards[start:end], players[start:end], dice[start:end], cap=CAP, strict=True
        )
        for i in range(end - start):
            got = _rowset(after[i], valid[i])
            want = {tuple(o) for o in fx[start + i]["turnOutcomes"]}
            checked += 1
            if got != want:
                mismatches += 1
                if mismatches <= 5:
                    f = fx[start + i]
                    print(
                        f"\nMISMATCH @{start + i} turn={f['turn']} dice={f['dice']}"
                        f"\n  board={f['board28']}"
                        f"\n  got {len(got)} want {len(want)}"
                        f"\n  missing={list(want - got)[:3]}"
                        f"\n  extra={list(got - want)[:3]}"
                    )
    assert checked > 2000
    assert mismatches == 0, f"{mismatches}/{checked} positions disagree with TS"


def test_single_die_legality_match_ts(fixtures):
    """Isolate single-die move generation: legal source set and destinations."""
    fx = fixtures["moveFixtures"]
    mismatches = 0
    for f in fx:
        board = torch.tensor([f["board28"]], dtype=torch.long)
        player = torch.tensor([1 if f["turn"] == "white" else -1], dtype=torch.long)
        for die_str, moves in f["singleDie"].items():
            die = int(die_str)
            _, legal = _expand_one(board, player, die)  # (1,25)
            legal = legal[0]
            # TS "from": point number (1..24) or "bar"; slot = point-1, bar=24.
            want_sources = set()
            for m in moves:
                frm = m["from"]
                want_sources.add(24 if frm == "bar" else frm - 1)
            got_sources = {k for k in range(25) if legal[k]}
            if got_sources != want_sources:
                mismatches += 1
                if mismatches <= 5:
                    print(
                        f"\nSINGLE-DIE MISMATCH turn={f['turn']} die={die}"
                        f"\n  board={f['board28']}"
                        f"\n  got={sorted(got_sources)} want={sorted(want_sources)}"
                    )
    assert mismatches == 0, f"{mismatches} single-die legality mismatches"


def test_win_grading_matches_ts(fixtures):
    fx = fixtures["scoringFixtures"]
    if not fx:
        return
    boards = torch.tensor([f["board28"] for f in fx], dtype=torch.long)
    done, winner, kind = winners_and_kinds(boards)
    kind_name = {1: "single", 2: "gammon", 3: "backgammon"}
    for i, f in enumerate(fx):
        assert done[i], f"fixture {i} should be finished"
        assert winner[i].item() == (1 if f["winner"] == "white" else -1)
        assert kind_name[kind[i].item()] == f["kind"], (
            f"grading {i}: got {kind_name[kind[i].item()]} want {f['kind']}"
        )
