import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet } from "react-native";
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

/** How long a checker takes to glide from its old spot to its new one. */
const MOVE_MS = 260;

/**
 * A single checker. It owns an animated position so that when the board
 * hands it a new center — because its stack moved, or it is the checker that
 * was just played — it eases from where it was to where it belongs instead
 * of teleporting. The Board keeps each checker's identity stable across
 * moves (see Board.tsx) so this animation actually tracks a piece.
 */
export function Checker({ cx, cy, radius, player, selected }: Props) {
  const colors = boardTheme.checker[player];
  const ringSize = radius * 2 * RING_SCALE;
  const targetX = cx - radius;
  const targetY = cy - radius;

  const pos = useRef(new Animated.ValueXY({ x: targetX, y: targetY })).current;
  const prev = useRef({ x: targetX, y: targetY, radius });

  useEffect(() => {
    // A radius change means the board itself was resized; snap rather than
    // slide every checker across the new geometry.
    if (prev.current.radius !== radius) {
      pos.setValue({ x: targetX, y: targetY });
    } else if (prev.current.x !== targetX || prev.current.y !== targetY) {
      Animated.timing(pos, {
        toValue: { x: targetX, y: targetY },
        duration: MOVE_MS,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start();
    }
    prev.current = { x: targetX, y: targetY, radius };
  }, [targetX, targetY, radius, pos]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.checker,
        {
          width: radius * 2,
          height: radius * 2,
          borderRadius: radius,
          backgroundColor: colors.fill,
          borderColor: selected ? boardTheme.selected : colors.stroke,
          borderWidth: selected ? 3 : 1,
          transform: pos.getTranslateTransform(),
        },
      ]}
    >
      <Animated.View
        style={{
          width: ringSize,
          height: ringSize,
          borderRadius: ringSize / 2,
          borderWidth: 3,
          borderColor: colors.ring,
        }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  checker: {
    position: "absolute",
    left: 0,
    top: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
