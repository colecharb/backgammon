import { useAtomValue, useSetAtom } from 'jotai';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  currentDieAtom,
  endTurnAtom,
  gameStateAtom,
  legalMovesAtom,
  newGameAtom,
  rollAtom,
  swapDiceAtom,
} from '../../state/game';
import { boardTheme } from '../board/theme';
import { DieFace } from './DieFace';
import { HudButton } from './HudButton';

/** Controls below the board: roll, the dice (tap to swap order, tap to
 * finish once nothing is playable), or new game. Fixed height so the
 * centered board never shifts between phases. */
export function Hud() {
  const game = useAtomValue(gameStateAtom);
  const legalMoves = useAtomValue(legalMovesAtom);
  const currentDie = useAtomValue(currentDieAtom);
  const roll = useSetAtom(rollAtom);
  const swap = useSetAtom(swapDiceAtom);
  const endTurn = useSetAtom(endTurnAtom);
  const newGame = useSetAtom(newGameAtom);

  if (game.phase === 'gameOver') {
    return (
      <View style={styles.hud}>
        <HudButton label="New game" onPress={newGame} />
      </View>
    );
  }

  if (game.phase === 'rolling') {
    return (
      <View style={styles.hud}>
        <HudButton label="Roll" onPress={roll} />
      </View>
    );
  }

  // Once no legal move remains, tapping the dice hands the turn over;
  // until then the same tap swaps their play order.
  const turnDone = legalMoves.length === 0;
  const activeIndex = turnDone
    ? -1
    : game.dice.findIndex((d) => !d.used && d.value === currentDie);
  return (
    <View style={styles.hud}>
      <Pressable style={styles.dice} onPress={turnDone ? endTurn : swap} hitSlop={12}>
        {game.dice.map((die, i) => (
          <View key={i} style={[styles.die, i === activeIndex && styles.activeDie]}>
            <DieFace value={die.value} size={36} dimmed={die.used} />
          </View>
        ))}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  hud: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 88,
  },
  dice: {
    flexDirection: 'row',
    gap: 6,
  },
  die: {
    borderRadius: 9,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  activeDie: {
    borderColor: boardTheme.selected,
  },
});
