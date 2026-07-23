import { useAtomValue } from "jotai";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { CheckerLocation, GameState, Player } from "../../engine/types";
import { RankedTurn, rankedTurnsAtom } from "../../state/analysis";
import { gameStateAtom } from "../../state/game";

const MAX_ROWS = 5;

/** Point numbers in the mover's own numbering: home board = 1–6. */
function locationLabel(location: CheckerLocation, player: Player): string {
  if (location === "bar" || location === "off") return location;
  return String(player === "white" ? location : 25 - location);
}

function turnLabel(turn: RankedTurn, player: Player): string {
  const parts = turn.outcome.moves.map(
    (m) => `${locationLabel(m.from, player)}/${locationLabel(m.to, player)}`,
  );
  return parts.length ? parts.join(" ") : "no play";
}

function formatEquity(equity: number): string {
  return (equity >= 0 ? "+" : "") + equity.toFixed(2);
}

function capitalize(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

/** What to say when there are no moves to rank, so tapping the bar always
 * reveals something instead of an empty overlay that blinks in and out as the
 * dice come and go. */
function emptyMessage(game: GameState): string {
  switch (game.phase) {
    case "rolling":
      return game.history.length === 0
        ? "Roll for the opening to see the top moves."
        : `${capitalize(game.turn)} to roll — the top moves appear once the dice are down.`;
    case "doubled":
      return `${capitalize(game.turn)} doubled. The top moves return once the cube is answered.`;
    case "gameOver":
      return "The game is over — no moves to rank.";
    default:
      // Moving phase but nothing to play: a dance.
      return `No legal move for ${game.turn} — the turn passes.`;
  }
}

/**
 * The engine's live ranking of every distinct way to play the remaining
 * dice, with cubeless equity per line. Each row is a horizontal bar whose
 * length tracks equity, with the move on top so the label always gets the
 * full width. Purely derived from rankedTurnsAtom; when there is nothing to
 * rank it explains why rather than vanishing, so the panel is stable whether
 * or not the dice are in play.
 */
export function EquityPanel() {
  const ranked = useAtomValue(rankedTurnsAtom);
  const game = useAtomValue(gameStateAtom);
  if (!ranked) {
    return (
      <View style={styles.panel}>
        <Text style={styles.title}>Engine · top moves</Text>
        <Text style={styles.empty}>{emptyMessage(game)}</Text>
      </View>
    );
  }

  const rows = ranked.slice(0, MAX_ROWS);
  const best = rows[0].equity;
  const worst = rows[rows.length - 1].equity;
  const span = best - worst;
  // Every row keeps a visible stub even when it is the worst shown line.
  const fill = (equity: number) =>
    span > 0 ? 15 + (85 * (equity - worst)) / span : 100;

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>
        Engine · equity if {game.turn} plays…
      </Text>
      {ranked.length > rows.length && (
        <Text style={styles.more}>+{ranked.length - rows.length} more</Text>
      )}
      {/* Reversed so the best line renders at the bottom, nearest the board. */}
      {rows
        .map((row, i) => ({ row, i }))
        .reverse()
        .map(({ row, i }) => (
          <View key={row.outcome.key} style={styles.row}>
            <View
              style={[
                styles.barFill,
                i === 0 && styles.barFillBest,
                { width: `${fill(row.equity)}%` },
              ]}
            />
            <Text style={styles.moves} numberOfLines={1}>
              {turnLabel(row, game.turn)}
            </Text>
            <Text style={[styles.equity, i === 0 && styles.equityBest]}>
              {formatEquity(row.equity)}
            </Text>
          </View>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: "100%",
    maxWidth: 320,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#26262c",
    gap: 5,
  },
  title: {
    color: "#9a9aa3",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 5,
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  barFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 5,
    backgroundColor: "rgba(138, 138, 147, 0.28)",
  },
  barFillBest: {
    backgroundColor: "rgba(245, 197, 66, 0.22)",
  },
  moves: {
    flex: 1,
    color: "#f4efe3",
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  equity: {
    marginLeft: 8,
    color: "#c9c9d1",
    fontSize: 13,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  equityBest: {
    color: "#f5c542",
  },
  more: {
    color: "#6d6d76",
    fontSize: 11,
    textAlign: "right",
  },
  empty: {
    color: "#9a9aa3",
    fontSize: 13,
    lineHeight: 18,
  },
});
