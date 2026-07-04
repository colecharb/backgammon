import { useAtomValue, useSetAtom } from "jotai";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  canUndoAtom,
  gameStateAtom,
  undoAtom,
  winnerAtom,
} from "../../state/game";
import { boardTheme } from "../board/theme";
import { HudButton } from "./HudButton";

/** Status badge/text with undo beneath, stacked for the left side panel.
 * The undo button keeps its space when hidden so nothing shifts. */
export function GameHeader() {
  const game = useAtomValue(gameStateAtom);
  const canUndo = useAtomValue(canUndoAtom);
  const victor = useAtomValue(winnerAtom);
  const undo = useSetAtom(undoAtom);

  const label = victor
    ? `${capitalize(victor)} wins!`
    : game.phase === "rolling"
      ? game.history.length === 0
        ? "Roll for the opening"
        : `${capitalize(game.turn)} to roll`
      : `${capitalize(game.turn)} to play`;

  const badgePlayer = victor ?? game.turn;
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
