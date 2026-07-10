import { BoardState, CheckerLocation, Player } from "../../engine/types";

export interface CheckerPlacement {
  /** Stable per-player identity, e.g. "white-3", kept across board changes. */
  id: string;
  player: Player;
  location: CheckerLocation;
  stackIndex: number;
  stackCount: number;
}

/**
 * Where each checker id sat last render — the memory that lets a checker
 * keep its identity when it moves so it can animate to its new home.
 */
export type PlacementMemory = Map<
  string,
  { location: CheckerLocation; stackIndex: number }
>;

const CHECKERS_PER_PLAYER = 15;

function locationsFor(
  board: BoardState,
  player: Player,
): { location: CheckerLocation; count: number }[] {
  const out: { location: CheckerLocation; count: number }[] = [];
  board.points.forEach((pt, i) => {
    if (pt && pt.player === player) out.push({ location: i + 1, count: pt.count });
  });
  if (board.bar[player] > 0) out.push({ location: "bar", count: board.bar[player] });
  if (board.off[player] > 0) out.push({ location: "off", count: board.off[player] });
  return out;
}

/** Sort key so a location's checkers order bottom-of-stack first. */
function order(entry?: { location: CheckerLocation; stackIndex: number }): number {
  if (!entry) return -1;
  const loc =
    entry.location === "bar" ? 25 : entry.location === "off" ? 26 : entry.location;
  return (loc as number) * 100 + entry.stackIndex;
}

/**
 * Assign each player's 15 checker ids to the current board's slots, keeping
 * ids on the locations they already occupied and handing the ids freed from
 * shrinking locations to the ones that grew. In a normal turn exactly one id
 * changes location, so it keeps its identity and animates from its old point
 * to its new one; a hit hands the blot's id from the point to the bar, so it
 * flies there too. `next` is the memory to remember for the following render.
 */
export function placeCheckers(
  board: BoardState,
  memory: PlacementMemory,
): { placements: CheckerPlacement[]; next: PlacementMemory } {
  const placements: CheckerPlacement[] = [];
  const next: PlacementMemory = new Map();

  for (const player of ["white", "black"] as const) {
    const ids = Array.from(
      { length: CHECKERS_PER_PLAYER },
      (_, i) => `${player}-${i}`,
    );
    const need = new Map<CheckerLocation, number>();
    for (const { location, count } of locationsFor(board, player)) {
      need.set(location, count);
    }

    // Low-stack-first so that when a location shrinks the checkers left
    // behind keep the lowest ids and the top one is the id that comes free.
    const ordered = [...ids].sort((a, b) => order(memory.get(a)) - order(memory.get(b)));

    const assigned = new Map<string, CheckerLocation>();
    const freed: string[] = [];
    for (const id of ordered) {
      const loc = memory.get(id)?.location;
      if (loc !== undefined && (need.get(loc) ?? 0) > 0) {
        assigned.set(id, loc);
        need.set(loc, need.get(loc)! - 1);
      } else {
        freed.push(id);
      }
    }

    // Slots still unfilled — locations that grew, or a first render — take
    // the freed ids in order.
    const openings: CheckerLocation[] = [];
    need.forEach((count, location) => {
      for (let k = 0; k < count; k++) openings.push(location);
    });
    openings.forEach((location, i) => {
      const id = freed[i];
      if (id !== undefined) assigned.set(id, location);
    });

    // Stack ids at each location: those that stayed keep their order at the
    // bottom; arrivals land on top.
    const byLocation = new Map<CheckerLocation, string[]>();
    assigned.forEach((location, id) => {
      const list = byLocation.get(location) ?? [];
      list.push(id);
      byLocation.set(location, list);
    });
    byLocation.forEach((list, location) => {
      list.sort((a, b) => {
        const pa = memory.get(a);
        const pb = memory.get(b);
        const aStayed = pa?.location === location;
        const bStayed = pb?.location === location;
        if (aStayed && bStayed) return pa!.stackIndex - pb!.stackIndex;
        if (aStayed) return -1;
        if (bStayed) return 1;
        return a < b ? -1 : 1;
      });
      list.forEach((id, stackIndex) => {
        placements.push({ id, player, location, stackIndex, stackCount: list.length });
        next.set(id, { location, stackIndex });
      });
    });
  }

  // Paint bottom-of-stack first so higher checkers (and the one gliding onto
  // a stack) sit on top.
  placements.sort((a, b) => a.stackIndex - b.stackIndex);
  return { placements, next };
}
