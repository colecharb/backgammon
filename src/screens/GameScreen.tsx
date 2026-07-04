import { useSetAtom } from "jotai";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Board } from "../components/board/Board";
import { GameHeader } from "../components/hud/GameHeader";
import { Hud } from "../components/hud/Hud";
import { newGameAtom } from "../state/game";

export function GameScreen() {
  const reset = useSetAtom(newGameAtom);
  return (
    <SafeAreaView style={styles.screen}>
      <GameHeader />
      <View style={styles.frame}>
        <Board />
      </View>
      <Hud />
      {/* Debug helper: wipe back to the starting position from any state. */}
      <Pressable style={styles.reset} onPress={reset} hitSlop={8}>
        <Text style={styles.resetLabel}>Reset game</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#1b1b1f",
    justifyContent: "center",
  },
  frame: {
    aspectRatio: 14.75 / 10.5,
    maxHeight: "100%",
  },
  reset: {
    alignSelf: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  resetLabel: {
    color: "#8a877f",
    fontSize: 13,
    fontWeight: "600",
  },
});
