import { useSetAtom } from "jotai";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Board } from "../components/board/Board";
import { GameHeader } from "../components/hud/GameHeader";
import { Hud } from "../components/hud/Hud";
import { newGameAtom } from "../state/game";

export function GameScreen() {
  const reset = useSetAtom(newGameAtom);
  // Only inset horizontally (notch sides); the board runs edge-to-edge
  // vertically.
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.screen,
        { paddingLeft: insets.left, paddingRight: insets.right },
      ]}
    >
      <View style={styles.side}>
        <GameHeader />
      </View>
      <View style={styles.frame}>
        <Board />
      </View>
      <View style={styles.side}>
        <Hud />
        {/* Debug helper: wipe back to the starting position from any state. */}
        <Pressable style={styles.reset} onPress={reset} hitSlop={8}>
          <Text style={styles.resetLabel}>Reset game</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#1b1b1f",
    alignItems: "center",
    justifyContent: "center",
  },
  frame: {
    aspectRatio: 14.75 / 10.5,
    height: "100%",
    flexShrink: 1,
  },
  side: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  reset: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  resetLabel: {
    color: "#8a877f",
    fontSize: 13,
    fontWeight: "600",
  },
});
