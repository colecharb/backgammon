import { useAtomValue } from "jotai";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { gameStateAtom } from "../../state/game";
import { BoardLayout } from "./geometry";
import { boardTheme } from "./theme";

/**
 * The doubling cube, shown on the off-tray column: centered while nobody
 * owns it, shifted toward the owner's half once taken.
 */
export function BoardCube({ layout }: { layout: BoardLayout }) {
  const game = useAtomValue(gameStateAtom);

  const size = layout.pointWidth * 0.72;
  const centerY =
    game.cube.owner === null
      ? layout.height / 2
      : game.cube.owner === "white"
        ? layout.height / 2 + size * 1.4
        : layout.height / 2 - size * 1.4;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.cube,
        {
          left: layout.offColumn.x + (layout.offColumn.width - size) / 2,
          top: centerY - size / 2,
          width: size,
          height: size,
          borderRadius: size * 0.2,
        },
      ]}
    >
      <Text style={[styles.value, { fontSize: size * 0.45 }]}>
        {game.cube.value === 1 ? 64 : game.cube.value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cube: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: boardTheme.checker.white.fill,
    borderWidth: 1,
    borderColor: boardTheme.checker.white.stroke,
  },
  value: {
    color: "#333",
    fontWeight: "800",
  },
});
