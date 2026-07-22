import { useAtomValue } from "jotai";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { CheckerLocation, Player } from "../../engine/types";
import { RankedTurn, rankedTurnsAtom } from "../../state/analysis";
import { gameStateAtom } from "../../state/game";

const MAX_ROWS = 5;

/** Point numbers in the mover's own numbering: home board = 1–6. */
function locationLabel(location: CheckerLocation, player: Player): string {
  if (location === "bar" || location === "off") return location;
  return String(player === "white" ? location : 25 - location);
}

function turnLabel(turn: RankedTurn, player: Player): string {
  return turn.outcome.moves
    .map((m) => `${locationLabel(m.from, player)}/${locationLabel(m.to, player)}`)
    .join(" ");
}

function formatEquity(equity: number): string {
  return (equity >= 0 ? "+" : "") + equity.toFixed(2);
}

/**
 * The engine's live ranking of every distinct way to play the remaining
 * dice, with cubeless equity per line. Purely derived from rankedTurnsAtom;
 * renders nothing outside the moving phase.
 */
export function EquityPanel() {
  const ranked = useAtomValue(rankedTurnsAtom);
  const game = useAtomValue(gameStateAtom);
  if (!ranked) return null;

  const rows = ranked.slice(0, MAX_ROWS);
  const best = rows[0].equity;
  const worst = rows[rows.length - 1].equity;
  const span = best - worst;
  // Worst shown row keeps a stub of bar so every line reads as a bar.
  const fill = (equity: number) =>
    span > 0 ? 12 + (88 * (equity - worst)) / span : 100;

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>
        Engine · equity if {game.turn} plays…
      </Text>
      {rows.map((row, i) => (
        <View key={row.outcome.key} style={styles.row}>
          <Text style={styles.moves} numberOfLines={1}>
            {turnLabel(row, game.turn)}
          </Text>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.bar,
                i === 0 && styles.barBest,
                { width: `${fill(row.equity)}%` },
              ]}
            />
          </View>
          <Text style={[styles.equity, i === 0 && styles.equityBest]}>
            {formatEquity(row.equity)}
          </Text>
        </View>
      ))}
      {ranked.length > rows.length && (
        <Text style={styles.more}>+{ranked.length - rows.length} more</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: "90%",
    maxWidth: 340,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#26262c",
    gap: 6,
  },
  title: {
    color: "#9a9aa3",
    fontSize: 12,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  moves: {
    flex: 1,
    color: "#f4efe3",
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
  },
  bar: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: "#8a8a93",
  },
  barBest: {
    backgroundColor: "#f5c542",
  },
  equity: {
    width: 48,
    textAlign: "right",
    color: "#9a9aa3",
    fontSize: 13,
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
});
