"""Vectorized, batched backgammon engine — an exact match of the TypeScript
engine (`src/engine/`), validated against it in tests/test_engine_crossval.py.

Board representation: an int64 tensor ``board[B, 28]`` in absolute coordinates
(matching the TS engine, not the hero-perspective encoder):

    index 0..23  signed point counts, +n white / -n black / 0 empty
                 (index i is board point i+1; white travels 24->1, black 1->24)
    index 24/25  bar count for white / black
    index 26/27  borne-off count for white / black

Players are a sign tensor ``player[B]``: +1 white, -1 black.

The one hard operation is enumerating every *distinct* legal full-turn
afterstate under forced max-play; see ``enumerate_turns``.
"""

from __future__ import annotations

import torch

POINTS = 24
BAR_W, BAR_B, OFF_W, OFF_B = 24, 25, 26, 27
CHECKERS = 15

def _expand_one(boards: torch.Tensor, players: torch.Tensor, die: int):
    """Every single-die placement of ``die`` from ``boards``.

    ``boards`` (M, 28), ``players`` (M,) sign. Returns:
      children (M, 25, 28)  afterstate for each source slot (0..23 = point,
                            24 = bar); garbage where the slot is illegal.
      legal    (M, 25) bool
    """
    device = boards.device
    M = boards.shape[0]
    s = players.view(M, 1)  # (M,1)
    white = players > 0  # (M,)

    pts = boards[:, :POINTS]  # (M,24)
    idx = torch.arange(POINTS, device=device).view(1, POINTS)  # (1,24)
    own = s * pts  # (M,24) player's own count at each point
    has_src = own >= 1

    bar_idx = torch.where(white, BAR_W, BAR_B)  # (M,)
    bar_count = boards.gather(1, bar_idx.view(M, 1)).view(M)  # (M,)
    on_bar = bar_count > 0

    # Destination index for a point source: white i-die, black i+die.
    dest = idx - s * die  # (M,24)
    off = (dest < 0) | (dest > POINTS - 1)
    dest_c = dest.clamp(0, POINTS - 1)
    dest_occ = boards.gather(1, dest_c)  # (M,24)
    blocked = (-s * dest_occ) >= 2  # opponent holds the point

    # Bearing off.
    dist = torch.where(white.view(M, 1), idx + 1, POINTS - idx)  # (M,24) pips to edge
    occ_dist = torch.where(has_src, dist, torch.zeros_like(dist))
    farthest = occ_dist.max(dim=1).values.view(M, 1)  # (M,1)
    outside = torch.where(white.view(M, 1), idx >= 6, idx < 18)
    has_outside = (has_src & outside).any(dim=1)
    can_bear = (bar_count == 0) & (~has_outside)  # (M,)
    bear_legal = off & can_bear.view(M, 1) & ((dist == die) | (dist == farthest))

    onboard_legal = (~off) & (~blocked)
    point_legal = has_src & (onboard_legal | bear_legal) & (~on_bar.view(M, 1))

    # Bar entry (single extra source slot).
    bar_dest = torch.where(white, 24 - die, die - 1)  # (M,)
    bar_dest_occ = boards.gather(1, bar_dest.view(M, 1)).view(M)
    bar_legal = on_bar & ((-players * bar_dest_occ) < 2)

    legal = torch.cat([point_legal, bar_legal.view(M, 1)], dim=1)  # (M,25)

    # ---- afterstates via three scatter_adds (all moves reduce to additions) ----
    children = boards.unsqueeze(1).repeat(1, 25, 1)  # (M,25,28)
    s_col = players.view(M, 1)  # (M,1)

    # Source columns and removal amounts (point: -sign; bar: -1).
    src_cols = torch.cat(
        [idx.expand(M, POINTS), bar_idx.view(M, 1)], dim=1
    )  # (M,25)
    rem = torch.cat(
        [s_col.expand(M, POINTS), torch.ones(M, 1, dtype=torch.long, device=device)],
        dim=1,
    )  # (M,25) amount to remove (sign for points, 1 for bar)
    children.scatter_add_(2, src_cols.unsqueeze(2), (-rem).unsqueeze(2))

    # Destination columns and add amounts.
    off_col = torch.where(white, OFF_W, OFF_B).view(M, 1)  # (M,1)
    pt_hit = onboard_legal & ((-s * dest_occ) == 1)  # (M,24) point move hits a blot
    # point: off -> +1 at off_col; onboard non-hit -> +sign at dest; hit -> +2*sign
    pt_dest_col = torch.where(off, off_col.expand(M, POINTS), dest_c)  # (M,24)
    pt_add = torch.where(
        off,
        torch.ones(M, POINTS, dtype=torch.long, device=device),
        torch.where(pt_hit, 2 * s_col.expand(M, POINTS), s_col.expand(M, POINTS)),
    )
    bar_hit = bar_legal & ((-players * bar_dest_occ) == 1)  # (M,)
    bar_add = torch.where(bar_hit, 2 * players, players).view(M, 1)  # (M,1)
    dest_cols = torch.cat([pt_dest_col, bar_dest.view(M, 1)], dim=1)  # (M,25)
    add_amt = torch.cat([pt_add, bar_add], dim=1)  # (M,25)
    children.scatter_add_(2, dest_cols.unsqueeze(2), add_amt.unsqueeze(2))

    # Hits send the opponent's checker to their bar.
    opp_bar_col = torch.where(white, BAR_B, BAR_W).view(M, 1).expand(M, 25)  # (M,25)
    hit = torch.cat([pt_hit, bar_hit.view(M, 1)], dim=1)  # (M,25)
    children.scatter_add_(2, opp_bar_col.unsqueeze(2), hit.long().unsqueeze(2))

    return children, legal


# Counter of how often a row's distinct afterstates exceeded the cap and were
# truncated (only in non-strict mode). Stays 0 for well-sized caps.
_TRUNCATIONS = 0


def _dedup_compact(pool: torch.Tensor, valid: torch.Tensor, cap: int, strict: bool = False):
    """Keep one copy of each distinct valid board per row, compacted into the
    first ``cap`` slots.

    Dedup is exact — ``torch.unique`` over ``(row, board)`` rows, no hashing —
    so distinct boards can never be collapsed. If a row has more than ``cap``
    distinct boards, ``strict`` raises (used in cross-validation, where the cap
    is proven sufficient); otherwise the extras are dropped and a global
    truncation counter is bumped (a safe backstop for rare extreme doubles)."""
    global _TRUNCATIONS
    G, K, _ = pool.shape
    device = pool.device
    M = G * K
    pool_flat = pool.reshape(M, 28)
    valid_flat = valid.reshape(M)
    gidx = torch.arange(G, device=device).view(G, 1).expand(G, K).reshape(M, 1)
    # Invalid slots get a sentinel body so they never merge with a real board
    # (real counts are never -99); duplicates among them are dropped anyway.
    sentinel = torch.full((M, 28), -99, dtype=pool.dtype, device=device)
    body = torch.where(valid_flat.view(M, 1), pool_flat, sentinel)
    feat = torch.cat([gidx, body], dim=1)  # (M, 29)

    _, inv = torch.unique(feat, dim=0, return_inverse=True)
    order = torch.arange(M, device=device)
    first = torch.full((int(inv.max().item()) + 1,), M, device=device, dtype=torch.long)
    first = first.scatter_reduce(0, inv, order, reduce="amin", include_self=True)
    is_first = order == first[inv]
    keeper = (valid_flat & is_first).view(G, K)

    # Move keepers to the front of each row (stable), then slice to the actual
    # number of distinct boards (NOT the full cap) so the pool stays tight and
    # the next branch doesn't blow up by a factor of 25 per padded slot.
    sort_key = (~keeper).to(torch.int8)
    perm = torch.argsort(sort_key, dim=1, stable=True)  # (G,K) keepers first
    pool_s = torch.gather(pool, 1, perm.unsqueeze(2).expand(G, K, 28))
    keep_s = torch.gather(keeper, 1, perm)

    needed = int(keep_s.sum(dim=1).max().item())
    if needed > cap:
        if strict:
            raise ValueError(f"candidate overflow: a row has >{cap} distinct afterstates")
        _TRUNCATIONS += 1
        needed = cap
    needed = max(needed, 1)
    return pool_s[:, :needed, :].contiguous(), keep_s[:, :needed].contiguous()


def truncations() -> int:
    """How many times enumeration dropped afterstates past the cap (non-strict)."""
    return _TRUNCATIONS


def _branch(pool, valid, players, die, cap, strict=False):
    """Apply ``die`` to every valid board in ``pool`` (G,K,28); return the
    deduped, compacted (G,cap,28) child pool and its validity."""
    G, K, _ = pool.shape
    flat = pool.reshape(G * K, 28)
    fplayers = players.view(G, 1).expand(G, K).reshape(G * K)
    children, legal = _expand_one(flat, fplayers, die)  # (G*K,25,28),(G*K,25)
    child_valid = legal & valid.reshape(G * K, 1)
    cpool = children.reshape(G, K * 25, 28)
    cvalid = child_valid.reshape(G, K * 25)
    return _dedup_compact(cpool, cvalid, cap, strict)


def _reach(board, players, dice_seq, cap, strict=False):
    """Boards reachable using exactly the first d dice of ``dice_seq`` in order.
    Returns a list (one per depth 1..len) of (pool (N,cap,28), valid (N,cap))."""
    G = board.shape[0]
    pool = board.view(G, 1, 28)
    valid = torch.ones(G, 1, dtype=torch.bool, device=board.device)
    out = []
    for die in dice_seq:
        pool, valid = _branch(pool, valid, players, die, cap, strict)
        out.append((pool, valid))
    return out


def enumerate_turns(boards, players, dice, cap: int = 640, strict: bool = False):
    """All distinct legal full-turn afterstates, matching enumerateTurnOutcomes.

    ``boards`` (N,28), ``players`` (N,) sign, ``dice`` (N,4) with values and 0
    padding (doubles are [a,a,a,a], non-doubles [a,b,0,0]). Returns
    ``afterstates`` (N,cap,28) and ``valid`` (N,cap); a row with no valid slot
    is a dance (no legal play). ``strict`` raises on cap overflow instead of
    truncating.
    """
    device = boards.device
    N = boards.shape[0]

    # Group rows by their dice pattern so each group shares a fixed sequence.
    d = dice.tolist()
    groups: dict[tuple, list[int]] = {}
    for i, row in enumerate(d):
        vals = tuple(v for v in row if v > 0)
        if len(vals) == 4:  # doubles: a single value, order irrelevant
            key = (vals[0], vals[0], vals[0], vals[0])
        else:
            key = tuple(sorted(vals, reverse=True))  # (hi, lo)
        groups.setdefault(key, []).append(i)

    results = []  # (ridx, after (G,w,28), valid (G,w))
    width = 1
    for key, rows in groups.items():
        ridx = torch.tensor(rows, device=device)
        after, valid = _enumerate_group(boards[ridx], players[ridx], key, cap, strict)
        width = max(width, after.shape[1])
        results.append((ridx, after, valid))

    out = boards.new_zeros((N, width, 28))
    out_valid = torch.zeros(N, width, dtype=torch.bool, device=device)
    for ridx, after, valid in results:
        w = after.shape[1]
        out[ridx.unsqueeze(1), torch.arange(w, device=device)] = after
        out_valid[ridx.unsqueeze(1), torch.arange(w, device=device)] = valid
    return out, out_valid


def _game_max_depth(per_depth):
    """Deepest depth (1-based) with any valid board per game; 0 if none.
    ``per_depth`` is a list over depth of validity masks (N, K)."""
    N = per_depth[0].shape[0]
    device = per_depth[0].device
    game_max = torch.zeros(N, dtype=torch.long, device=device)
    for d, valid in enumerate(per_depth, start=1):
        game_max = torch.where(valid.any(dim=1), d, game_max)
    return game_max


def _enumerate_group(boards, players, key, cap, strict=False):
    """Enumerate afterstates for a group sharing dice pattern ``key``."""
    N = boards.shape[0]

    if len(key) == 4:  # doubles: one chain, keep the deepest reachable boards
        a = key[0]
        reach = _reach(boards, players, [a, a, a, a], cap, strict)
        game_max = _game_max_depth([v for _, v in reach])
        pools, valids = [], []
        for d, (pool, valid) in enumerate(reach, start=1):
            pools.append(pool)
            valids.append(valid & (game_max.view(N, 1) == d))
        return _dedup_compact(torch.cat(pools, 1), torch.cat(valids, 1), cap, strict)

    a, b = key  # a > b
    ab = _reach(boards, players, [a, b], cap, strict)  # ab[0]=play a, ab[1]=a then b
    ba = _reach(boards, players, [b, a], cap, strict)  # ba[0]=play b, ba[1]=b then a

    a_moves, a_then_b = ab[0], ab[1]
    b_moves, b_then_a = ba[0], ba[1]
    a_playable = a_moves[1].any(dim=1)
    b_playable = b_moves[1].any(dim=1)
    has_d2 = a_then_b[1].any(dim=1) | b_then_a[1].any(dim=1)
    game_max = torch.where(has_d2, 2, torch.where(a_playable | b_playable, 1, 0))

    at2 = (game_max == 2).view(N, 1)
    # Larger-die rule at max depth 1: keep the larger die (a); keep the smaller
    # (b) only when a is not playable at all.
    keep_a = ((game_max == 1) & a_playable).view(N, 1)
    keep_b = ((game_max == 1) & b_playable & ~a_playable).view(N, 1)

    pools = [a_then_b[0], b_then_a[0], a_moves[0], b_moves[0]]
    valids = [
        a_then_b[1] & at2,
        b_then_a[1] & at2,
        a_moves[1] & keep_a,
        b_moves[1] & keep_b,
    ]
    return _dedup_compact(torch.cat(pools, 1), torch.cat(valids, 1), cap, strict)


def winners_and_kinds(boards):
    """For finished games (some side has borne off all 15), return
    ``done`` (N,) bool, ``winner`` (N,) sign, ``kind`` (N,) in {1 single,
    2 gammon, 3 backgammon}. Undefined where not done."""
    off_w = boards[:, OFF_W]
    off_b = boards[:, OFF_B]
    white_win = off_w == CHECKERS
    black_win = off_b == CHECKERS
    done = white_win | black_win
    winner = torch.where(white_win, 1, -1)
    loser_off = torch.where(white_win, off_b, off_w)
    # loser trapped: a checker on the bar or in the winner's home board.
    idx = torch.arange(POINTS, device=boards.device).view(1, POINTS)
    pts = boards[:, :POINTS]
    loser_on_pt = torch.where(white_win.view(-1, 1), pts < 0, pts > 0)  # loser checkers
    winner_home = torch.where(white_win.view(-1, 1), idx <= 5, idx >= 18)
    loser_bar = torch.where(white_win, boards[:, BAR_B], boards[:, BAR_W])
    trapped = (loser_bar > 0) | (loser_on_pt & winner_home).any(dim=1)
    kind = torch.where(loser_off > 0, 1, torch.where(trapped, 3, 2))
    return done, winner, kind
