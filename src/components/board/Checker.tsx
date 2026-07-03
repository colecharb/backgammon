import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Player } from '../../engine/types';
import { boardTheme } from './theme';

interface Props {
  cx: number;
  cy: number;
  radius: number;
  player: Player;
  selected: boolean;
}

export function Checker({ cx, cy, radius, player, selected }: Props) {
  const colors = boardTheme.checker[player];
  return (
    <View
      pointerEvents="none"
      style={[
        styles.checker,
        {
          left: cx - radius,
          top: cy - radius,
          width: radius * 2,
          height: radius * 2,
          borderRadius: radius,
          backgroundColor: colors.fill,
          borderColor: selected ? boardTheme.selected : colors.stroke,
          borderWidth: selected ? 3 : 2,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  checker: {
    position: 'absolute',
  },
});
