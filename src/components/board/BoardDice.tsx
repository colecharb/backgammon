import { useAtomValue, useSetAtom } from "jotai";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
  currentDieAtom,
  endTurnAtom,
  gameStateAtom,
  legalMovesAtom,
  swapDiceAtom,
} from "../../state/game";
import { DieFace } from "../hud/DieFace";
import { BoardLayout } from "./geometry";
import { boardTheme } from "./theme";

const DIE_GAP = 6;

/**
 * The rolled dice, sitting on the mover's half of the felt like a real
 * roll: white plays on the right half, black on the left. Tap to swap
 * play order, or to finish the turn once nothing is playable.
 */
export function BoardDice({ layout }: { layout: BoardLayout }) {
  const game = useAtomValue(gameStateAtom);
  const legalMoves = useAtomValue(legalMovesAtom);
  const currentDie = useAtomValue(currentDieAtom);
  const swap = useSetAtom(swapDiceAtom);
  const endTurn = useSetAtom(endTurnAtom);

  if (game.phase !== "moving") return null;

  const dieSize = layout.pointWidth * 0.9;
  // Half-board centers: point columns 0–5 (left) and 7–12 (right).
  const centerX =
    layout.frameThickness +
    (game.turn === "white" ? 10 : 3) * layout.pointWidth;
  const rowWidth =
    game.dice.length * dieSize + (game.dice.length - 1) * DIE_GAP;

  const turnDone = legalMoves.length === 0;
  const activeIndex = turnDone
    ? -1
    : game.dice.findIndex((d) => !d.used && d.value === currentDie);

  return (
    <Pressable
      style={[
        styles.dice,
        {
          left: centerX - rowWidth / 2,
          top: layout.height / 2 - dieSize / 2,
        },
      ]}
      onPress={turnDone ? endTurn : swap}
      hitSlop={12}
    >
      {game.dice.map((die, i) => (
        <View
          key={i}
          style={[
            styles.die,
            { marginLeft: i === 0 ? 0 : DIE_GAP },
            i === activeIndex && styles.activeDie,
          ]}
        >
          <DieFace value={die.value} size={dieSize} dimmed={die.used} />
        </View>
      ))}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dice: {
    position: "absolute",
    flexDirection: "row",
  },
  die: {
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "transparent",
  },
  activeDie: {
    borderColor: boardTheme.selected,
  },
});
