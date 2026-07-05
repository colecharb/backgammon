import { useAtomValue, useSetAtom } from "jotai";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  canUndoAtom,
  gameResultAtom,
  gameStateAtom,
  undoAtom,
} from "../../state/game";
import { GameResult } from "../../engine/types";
import { boardTheme } from "../board/theme";
import { HudButton } from "./HudButton";

/** Status badge/text with undo beneath, stacked for the left side panel.
 * The undo button keeps its space when hidden so nothing shifts. */
export function GameHeader() {
  const game = useAtomValue(gameStateAtom);
  const canUndo = useAtomValue(canUndoAtom);
  const result = useAtomValue(gameResultAtom);
  const undo = useSetAtom(undoAtom);

  const label = result
    ? resultLabel(result)
    : game.phase === "doubled"
      ? `${capitalize(game.turn)} doubles to ${game.cube.value * 2}`
      : game.phase === "rolling"
        ? game.history.length === 0
          ? "Roll for the opening"
          : `${capitalize(game.turn)} to roll`
        : `${capitalize(game.turn)} to play`;

  const badgePlayer = result?.winner ?? game.turn;
  return (
    <View style={styles.header}>
      <View style={styles.status}>
        <TurnBadge player={badgePlayer} />
        <Text style={styles.label}>{label}</Text>
      </View>
      <View
        style={!canUndo && styles.hidden}
        pointerEvents={canUndo ? "auto" : "none"}
      >
        <HudButton label="Undo" onPress={undo} />
      </View>
    </View>
  );
}

function TurnBadge({ player }: { player: "white" | "black" }) {
  const colors = boardTheme.checker[player];
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: colors.fill, borderColor: colors.stroke },
      ]}
    />
  );
}

function resultLabel({ winner, kind, points }: GameResult): string {
  const name = capitalize(winner);
  const pts = `${points} ${points === 1 ? "point" : "points"}`;
  switch (kind) {
    case "drop":
      return `${name} wins ${pts} — double dropped`;
    case "gammon":
      return `${name} wins a gammon — ${pts}`;
    case "backgammon":
      return `${name} wins a backgammon — ${pts}`;
    default:
      return `${name} wins — ${pts}`;
  }
}

function capitalize(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    gap: 16,
  },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  label: {
    color: "#e8e6e1",
    fontSize: 16,
    fontWeight: "600",
  },
  hidden: {
    opacity: 0,
  },
});
