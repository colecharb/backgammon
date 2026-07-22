import { useAtomValue, useSetAtom } from "jotai";
import React from "react";
import { StyleSheet, View } from "react-native";
import { gameStateAtom, newGameAtom } from "../../state/game";
import { HudButton } from "./HudButton";

/** Side-panel controls: just new game at game over. Rolling and the rolled dice
 * live on the board itself (see BoardDice). Renders nothing during play so it
 * takes no space and leaves no gap between the equity panel and the menu. */
export function Hud() {
  const game = useAtomValue(gameStateAtom);
  const newGame = useSetAtom(newGameAtom);

  if (game.phase !== "gameOver") return null;

  return (
    <View style={styles.hud}>
      <HudButton label="New game" onPress={newGame} />
    </View>
  );
}

const styles = StyleSheet.create({
  hud: {
    alignItems: "center",
    justifyContent: "center",
  },
});
