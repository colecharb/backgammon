import { useAtomValue, useSetAtom } from "jotai";
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import {
  canDoubleAtom,
  gameStateAtom,
  offerDoubleAtom,
} from "../../state/game";
import { boardTheme } from "../board/theme";

/**
 * The doubling cube once a player owns it, so it has left the centered on-board
 * spot (see BoardCube). Black's cube rides beside the equity bar above the
 * board; white's sits in the control row under it. Each spot renders its own
 * side and nothing otherwise. `size` matches the on-board cube so it stays the
 * same size everywhere. Tapping offers a double when the human may; a pending
 * offer is highlighted.
 */
export function DoublingCube({
  at,
  size,
}: {
  at: "bar" | "row";
  size: number;
}) {
  const game = useAtomValue(gameStateAtom);
  const canDouble = useAtomValue(canDoubleAtom);
  const offerDouble = useSetAtom(offerDoubleAtom);

  const owner = game.cube.owner;
  const show = at === "bar" ? owner === "black" : owner === "white";
  if (!show) return null;

  const pending = game.phase === "doubled";
  const value = pending ? game.cube.value * 2 : game.cube.value;

  return (
    <Pressable
      disabled={!canDouble}
      onPress={offerDouble}
      hitSlop={10}
      style={[
        styles.cube,
        { width: size, height: size, borderRadius: size * 0.2 },
        pending && styles.pending,
        !canDouble && !pending && styles.idle,
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
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: boardTheme.checker.white.fill,
    borderWidth: 1,
    borderColor: boardTheme.checker.white.stroke,
  },
  idle: {
    opacity: 0.5,
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
