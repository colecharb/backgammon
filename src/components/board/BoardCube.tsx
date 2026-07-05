import { useAtomValue, useSetAtom } from "jotai";
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { canDoubleAtom, gameStateAtom, offerDoubleAtom } from "../../state/game";
import { BoardLayout } from "./geometry";
import { boardTheme } from "./theme";

/**
 * The doubling cube, shown on the off-tray column: centered while nobody
 * owns it, shifted toward the owner's half once taken. Tapping it is how
 * a double is offered (undo retracts a fat-thumbed offer); while an offer
 * is pending it shows the proposed value.
 */
export function BoardCube({ layout }: { layout: BoardLayout }) {
  const game = useAtomValue(gameStateAtom);
  const canDouble = useAtomValue(canDoubleAtom);
  const offerDouble = useSetAtom(offerDoubleAtom);

  const pending = game.phase === "doubled";
  const value = pending ? game.cube.value * 2 : game.cube.value;

  const size = layout.pointWidth * 0.72;
  const centerY =
    game.cube.owner === null
      ? layout.height / 2
      : game.cube.owner === "white"
        ? layout.height / 2 + size * 1.4
        : layout.height / 2 - size * 1.4;

  return (
    <Pressable
      disabled={!canDouble}
      onPress={offerDouble}
      hitSlop={10}
      style={[
        styles.cube,
        pending && styles.pending,
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
        {value === 1 ? 64 : value}
      </Text>
    </Pressable>
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
  pending: {
    borderWidth: 2,
    borderColor: boardTheme.selected,
  },
  value: {
    color: "#333",
    fontWeight: "800",
  },
});
