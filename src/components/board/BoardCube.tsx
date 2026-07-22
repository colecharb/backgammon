import { useAtomValue, useSetAtom } from "jotai";
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import {
  canDoubleAtom,
  gameStateAtom,
  offerDoubleAtom,
} from "../../state/game";
import { BoardLayout, cubeSize } from "./geometry";
import { boardTheme } from "./theme";

/**
 * The doubling cube while it is centered (unowned): it sits on the off-tray
 * column, mid-board. Once a player owns it, it leaves the board for the control
 * area (see DoublingCube), so this renders nothing. Tapping offers a double
 * (undo retracts a fat-thumbed offer); a pending offer shows the proposed value.
 */
export function BoardCube({ layout }: { layout: BoardLayout }) {
  const game = useAtomValue(gameStateAtom);
  const canDouble = useAtomValue(canDoubleAtom);
  const offerDouble = useSetAtom(offerDoubleAtom);

  if (game.cube.owner !== null) return null;

  const pending = game.phase === "doubled";
  const value = pending ? game.cube.value * 2 : game.cube.value;

  const size = cubeSize(layout.width);
  const trayX = layout.offColumn.x + (layout.offColumn.width - size) / 2;
  const position = { left: trayX, top: (layout.height - size) / 2 };

  return (
    <Pressable
      disabled={!canDouble}
      onPress={offerDouble}
      hitSlop={10}
      style={[
        styles.cube,
        pending && styles.pending,
        {
          ...position,
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
