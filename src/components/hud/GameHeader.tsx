import { useAtomValue, useSetAtom } from 'jotai';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { canUndoAtom, gameStateAtom, undoAtom, winnerAtom } from '../../state/game';
import { HudButton } from './HudButton';

/** Status text on the left, undo on the right, in a fixed-height row so the
 * board below never shifts. */
export function GameHeader() {
  const game = useAtomValue(gameStateAtom);
  const canUndo = useAtomValue(canUndoAtom);
  const victor = useAtomValue(winnerAtom);
  const undo = useSetAtom(undoAtom);

  const label = victor
    ? `${capitalize(victor)} wins!`
    : game.phase === 'rolling'
      ? game.history.length === 0
        ? 'Roll for the opening'
        : `${capitalize(game.turn)} to roll`
      : `${capitalize(game.turn)} to play`;

  return (
    <View style={styles.header}>
      <Text style={styles.label}>{label}</Text>
      <View style={!canUndo && styles.hidden} pointerEvents={canUndo ? 'auto' : 'none'}>
        <HudButton label="Undo" onPress={undo} />
      </View>
    </View>
  );
}

function capitalize(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
    paddingHorizontal: 4,
  },
  label: {
    color: '#e8e6e1',
    fontSize: 16,
    fontWeight: '600',
  },
  hidden: {
    opacity: 0,
  },
});
