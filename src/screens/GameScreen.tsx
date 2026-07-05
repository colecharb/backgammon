import { useSetAtom } from "jotai";
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Board } from "../components/board/Board";
import { GameHeader } from "../components/hud/GameHeader";
import { Hud } from "../components/hud/Hud";
import { newGameAtom } from "../state/game";

/**
 * Adapts to orientation: landscape puts the panels beside the board and
 * insets only the notch sides so the board runs edge-to-edge vertically;
 * portrait stacks them and does the reverse.
 */
export function GameScreen() {
  const reset = useSetAtom(newGameAtom);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  const orientationStyle = landscape
    ? {
        flexDirection: "row" as const,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }
    : {
        flexDirection: "column" as const,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      };

  return (
    <View style={[styles.screen, orientationStyle]}>
      <View style={styles.side}>
        <GameHeader />
      </View>
      <View style={landscape ? styles.frameLandscape : styles.framePortrait}>
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

const BOARD_ASPECT = 14.75 / 10.5;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#1b1b1f",
    alignItems: "center",
    justifyContent: "center",
  },
  frameLandscape: {
    aspectRatio: BOARD_ASPECT,
    height: "100%",
    flexShrink: 1,
  },
  framePortrait: {
    aspectRatio: BOARD_ASPECT,
    width: "100%",
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
