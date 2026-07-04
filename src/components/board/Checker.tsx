import React from "react";
import { StyleSheet, View } from "react-native";
import { Player } from "../../engine/types";
import { boardTheme } from "./theme";

interface Props {
  cx: number;
  cy: number;
  radius: number;
  player: Player;
  selected: boolean;
}

/** Ring inset as a fraction of the checker's diameter — the flat "indentation" line. */
const RING_SCALE = 0.62;

export function Checker({ cx, cy, radius, player, selected }: Props) {
  const colors = boardTheme.checker[player];
  const ringSize = radius * 2 * RING_SCALE;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.checker,
        {
          left: cx - radius,
          top: cy - radius,
          width: radius * 2,
          height: radius * 2,
          borderRadius: radius,
          backgroundColor: colors.fill,
          borderColor: selected ? boardTheme.selected : colors.stroke,
          borderWidth: selected ? 3 : 1,
        },
      ]}
    >
      <View
        style={{
          width: ringSize,
          height: ringSize,
          borderRadius: ringSize / 2,
          borderWidth: 3,
          borderColor: colors.ring,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  checker: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
});
