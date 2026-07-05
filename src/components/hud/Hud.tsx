import { useAtomValue, useSetAtom } from "jotai";
import React from "react";
import { StyleSheet, View } from "react-native";
import { gameStateAtom, newGameAtom } from "../../state/game";
import { HudButton } from "./HudButton";

/** Side-panel controls: just new game. Rolling and the rolled dice live
 * on the board itself (see BoardDice); fixed height keeps the panel stable. */
export function Hud() {
  const game = useAtomValue(gameStateAtom);
  const newGame = useSetAtom(newGameAtom);

  return (
    <View style={styles.hud}>
      {game.phase === "gameOver" && (
        <HudButton label="New game" onPress={newGame} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hud: {
    alignItems: "center",
    justifyContent: "center",
    height: 88,
  },
});
