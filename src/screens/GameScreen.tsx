import React from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import { Board } from '../components/board/Board';
import { boardTheme } from '../components/board/theme';
import { Hud } from '../components/hud/Hud';

export function GameScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.frame}>
        <Board />
      </View>
      <Hud />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#1b1b1f',
    justifyContent: 'center',
    padding: 12,
  },
  frame: {
    aspectRatio: 14 / 11,
    maxHeight: '100%',
    borderWidth: 8,
    borderColor: boardTheme.frame,
    borderRadius: 8,
    overflow: 'hidden',
  },
});
