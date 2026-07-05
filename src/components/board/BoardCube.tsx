import { useAtomValue, useSetAtom } from "jotai";
import React from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions } from "react-native";
import {
  canDoubleAtom,
  gameStateAtom,
  offerDoubleAtom,
} from "../../state/game";
import { BoardLayout } from "./geometry";
import { boardTheme } from "./theme";

const EDGE_GAP = 8;

/**
 * The doubling cube. Unowned it sits centered on the off-tray column;
 * once owned it moves just outside the board on its owner's side —
 * beyond the right edge in landscape (black top, white bottom), past the
 * top/bottom edge in portrait, aligned with the tray column. Tapping it
 * is how a double is offered (undo retracts a fat-thumbed offer); while
 * an offer is pending it shows the proposed value.
 */
export function BoardCube({ layout }: { layout: BoardLayout }) {
  const game = useAtomValue(gameStateAtom);
  const canDouble = useAtomValue(canDoubleAtom);
  const offerDouble = useSetAtom(offerDoubleAtom);
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  const pending = game.phase === "doubled";
  const value = pending ? game.cube.value * 2 : game.cube.value;

  const size = layout.pointWidth * 0.72;
  const trayX = layout.offColumn.x + (layout.offColumn.width - size) / 2;
  const { owner } = game.cube;
  const position =
    owner === null
      ? { left: trayX, top: (layout.height - size) / 2 }
      : landscape
        ? {
            left: layout.width + EDGE_GAP,
            top: owner === "black" ? 8 : layout.height - size - 8,
          }
        : {
            left: trayX,
            top:
              owner === "black" ? -(size + EDGE_GAP) : layout.height + EDGE_GAP,
          };

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
