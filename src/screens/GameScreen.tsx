import React from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Board } from "../components/board/Board";
import { GameHeader } from "../components/hud/GameHeader";
import { GameMenu } from "../components/hud/GameMenu";
import { Hud } from "../components/hud/Hud";
import { useComputerPlayer } from "../hooks/useComputerPlayer";

/**
 * Adapts to orientation: landscape puts the panels beside the board and
 * insets only the notch sides so the board runs edge-to-edge vertically;
 * portrait stacks them and does the reverse.
 */
export function GameScreen() {
  useComputerPlayer();
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
        <GameMenu />
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
});
