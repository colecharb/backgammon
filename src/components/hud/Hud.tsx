import { useAtomValue, useSetAtom } from 'jotai';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  canUndoAtom,
  endTurnAtom,
  gameStateAtom,
  legalMovesAtom,
  newGameAtom,
  rollAtom,
  undoAtom,
  winnerAtom,
} from '../../state/game';
import { boardTheme } from '../board/theme';
import { DieFace } from './DieFace';

const NO_MOVES_DISPLAY_MS = 1200;

export function Hud() {
  const game = useAtomValue(gameStateAtom);
  const legalMoves = useAtomValue(legalMovesAtom);
  const canUndo = useAtomValue(canUndoAtom);
  const victor = useAtomValue(winnerAtom);
  const roll = useSetAtom(rollAtom);
  const endTurn = useSetAtom(endTurnAtom);
  const undo = useSetAtom(undoAtom);
  const newGame = useSetAtom(newGameAtom);

  const stuck = game.phase === 'moving' && legalMoves.length === 0;

  // The turn ends itself once no legal move remains — after a beat, so the
  // player sees their dice (and the "no moves" notice) before it passes.
  useEffect(() => {
    if (!stuck) return;
    const timer = setTimeout(endTurn, NO_MOVES_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [stuck, endTurn]);

  if (game.phase === 'gameOver' && victor) {
    return (
      <View style={styles.hud}>
        <Text style={styles.label}>{capitalize(victor)} wins!</Text>
        <HudButton label="New game" onPress={newGame} />
      </View>
    );
  }

  if (game.phase === 'rolling') {
    return (
      <View style={styles.hud}>
        <TurnBadge player={game.turn} />
        <Text style={styles.label}>
          {game.history.length === 0 ? 'Roll for the opening' : `${capitalize(game.turn)} to roll`}
        </Text>
        <HudButton label="Roll" onPress={roll} />
      </View>
    );
  }

  const allUsed = game.dice.every((d) => d.used);
  return (
    <View style={styles.hud}>
      <TurnBadge player={game.turn} />
      <View style={styles.dice}>
        {game.dice.map((die, i) => (
          <DieFace key={i} value={die.value} size={36} dimmed={die.used} />
        ))}
      </View>
      {stuck && !allUsed && <Text style={styles.notice}>No moves</Text>}
      {canUndo && <HudButton label="Undo" onPress={undo} />}
    </View>
  );
}

function TurnBadge({ player }: { player: 'white' | 'black' }) {
  const colors = boardTheme.checker[player];
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: colors.fill, borderColor: colors.stroke },
      ]}
    />
  );
}

function HudButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.button} onPress={onPress}>
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

function capitalize(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  hud: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    minHeight: 72,
  },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
  },
  dice: {
    flexDirection: 'row',
    gap: 6,
  },
  label: {
    color: '#e8e6e1',
    fontSize: 16,
    fontWeight: '600',
  },
  notice: {
    color: boardTheme.selected,
    fontSize: 16,
    fontWeight: '700',
  },
  button: {
    backgroundColor: boardTheme.pointDark,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
  },
  buttonLabel: {
    color: '#f1eadb',
    fontSize: 16,
    fontWeight: '700',
  },
});
