import { useAtomValue, useSetAtom } from "jotai";
import React from "react";
import { StyleSheet, View } from "react-native";
import { gameStateAtom, newGameAtom, rollAtom } from "../../state/game";
import { HudButton } from "./HudButton";

/** Side-panel controls: roll or new game. The rolled dice live on the
 * board itself (see BoardDice); fixed height keeps the panel stable. */
export function Hud() {
  const game = useAtomValue(gameStateAtom);
  const roll = useSetAtom(rollAtom);
  const newGame = useSetAtom(newGameAtom);

  return (
    <View style={styles.hud}>
      {game.phase === "gameOver" && (
        <HudButton label="New game" onPress={newGame} />
      )}
      {game.phase === "rolling" && <HudButton label="Roll" onPress={roll} />}
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
