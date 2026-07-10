import { useAtomValue, useSetAtom } from "jotai";
import React, { useMemo } from "react";
import { Pressable, StyleSheet, View, ViewStyle } from "react-native";
import { opponent } from "../../engine/helpers";
import {
  acceptDoubleAtom,
  currentDieAtom,
  declineDoubleAtom,
  endTurnAtom,
  gameStateAtom,
  legalMovesAtom,
  playersAtom,
  rollAtom,
  swapDiceAtom,
} from "../../state/game";
import { DieFace } from "../hud/DieFace";
import { HudButton } from "../hud/HudButton";
import { BoardLayout } from "./geometry";
import { boardTheme } from "./theme";

const DIE_GAP = 6;
/** Playful per-die tilt and nudge so a thrown pair never looks stamped-on. */
const MAX_DIE_ROTATION = 16; // degrees
const MAX_DIE_SHIFT = 0.1; // as a fraction of the die size

interface DieJitter {
  rotate: number;
  dx: number;
  dy: number;
}

function dieJitterStyle(jitter: DieJitter | undefined, size: number): ViewStyle | null {
  if (!jitter) return null;
  return {
    transform: [
      { translateX: jitter.dx * size },
      { translateY: jitter.dy * size },
      { rotate: `${jitter.rotate}deg` },
    ],
  };
}

/**
 * Dice-related controls on the felt, placed on the half of whoever must
 * act: the roll/double buttons before a roll, take/drop while a double is
 * pending, and the rolled dice while moving (tap to swap play order, or
 * to finish the turn once nothing is playable). White acts on the right
 * half, black on the left.
 */
export function BoardDice({ layout }: { layout: BoardLayout }) {
  const game = useAtomValue(gameStateAtom);
  const players = useAtomValue(playersAtom);
  const legalMoves = useAtomValue(legalMovesAtom);
  const currentDie = useAtomValue(currentDieAtom);
  const roll = useSetAtom(rollAtom);
  const swap = useSetAtom(swapDiceAtom);
  const endTurn = useSetAtom(endTurnAtom);
  const acceptDouble = useSetAtom(acceptDoubleAtom);
  const declineDouble = useSetAtom(declineDoubleAtom);

  // Fresh tilt/nudge per die, held stable for the whole turn: the multiset of
  // values plus whose turn it is only changes on the next roll.
  const rollKey = `${game.turn}:${game.dice
    .map((d) => d.value)
    .slice()
    .sort()
    .join(",")}`;
  const jitter = useMemo<DieJitter[]>(
    () =>
      game.dice.map(() => ({
        rotate: (Math.random() * 2 - 1) * MAX_DIE_ROTATION,
        dx: (Math.random() * 2 - 1) * MAX_DIE_SHIFT,
        dy: (Math.random() * 2 - 1) * MAX_DIE_SHIFT,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rollKey],
  );

  if (game.phase === "gameOver") return null;

  // Half-board centers: point columns 0–5 (left) and 7–12 (right).
  const halfCenterX = (player: "white" | "black") =>
    layout.frameThickness + (player === "white" ? 10 : 3) * layout.pointWidth;

  // Whoever must act: the turn player, except a pending double is the
  // opponent's decision.
  const actor = game.phase === "doubled" ? opponent(game.turn) : game.turn;
  const centerX = halfCenterX(actor);

  const actionArea = (children: React.ReactNode) => (
    <View
      pointerEvents="box-none"
      style={[
        styles.actionArea,
        {
          left: centerX - 3 * layout.pointWidth,
          width: 6 * layout.pointWidth,
          height: layout.height,
        },
      ]}
    >
      {children}
    </View>
  );

  // A computer actor rolls and answers doubles on its own — no buttons.
  const actorIsComputer = players[actor] === "computer";

  if (game.phase === "rolling") {
    if (actorIsComputer) return null;
    return actionArea(<HudButton label="Roll" onPress={roll} />);
  }

  if (game.phase === "doubled") {
    if (actorIsComputer) return null;
    return actionArea(
      <>
        <HudButton
          label={`Take ${game.cube.value * 2}`}
          onPress={acceptDouble}
        />
        <HudButton label="Drop" onPress={declineDouble} />
      </>,
    );
  }

  const dieSize = layout.pointWidth * 0.9;
  const turnDone = legalMoves.length === 0;

  // The opening roll is one die per player: show each on its owner's half
  // until the winner starts playing. The winner rolled the higher die.
  const openingReveal =
    game.history.length === 0 && !game.dice.some((d) => d.used);
  if (openingReveal && game.dice.length === 2) {
    const values = game.dice.map((d) => d.value);
    const hi = Math.max(...values);
    const lo = Math.min(...values);
    return (
      <>
        {(["white", "black"] as const).map((player, idx) => {
          const value = player === game.turn ? hi : lo;
          return (
            <Pressable
              key={player}
              style={[
                styles.dice,
                {
                  left: halfCenterX(player) - dieSize / 2,
                  top: layout.height / 2 - dieSize / 2,
                },
              ]}
              onPress={turnDone ? endTurn : swap}
              hitSlop={12}
            >
              <View
                style={[
                  styles.die,
                  !turnDone && value === currentDie && styles.activeDie,
                  dieJitterStyle(jitter[idx], dieSize),
                ]}
              >
                <DieFace value={value} size={dieSize} player={player} />
              </View>
            </Pressable>
          );
        })}
      </>
    );
  }

  const rowWidth =
    game.dice.length * dieSize + (game.dice.length - 1) * DIE_GAP;

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
            dieJitterStyle(jitter[i], dieSize),
          ]}
        >
          <DieFace
            value={die.value}
            size={dieSize}
            player={game.turn}
            dimmed={die.used}
          />
        </View>
      ))}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actionArea: {
    position: "absolute",
    top: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
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
