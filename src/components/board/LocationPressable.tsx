import { useSetAtom } from 'jotai';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { tapLocationAtom, TapPayload } from '../../state/game';
import { Rect } from './geometry';

interface Props extends TapPayload {
  rect: Rect;
}

/**
 * Invisible tap target covering a whole location column — reliable to hit
 * regardless of how many checkers sit there.
 */
export function LocationPressable({ rect, location, player }: Props) {
  const tap = useSetAtom(tapLocationAtom);
  return (
    <Pressable
      style={[
        styles.target,
        { left: rect.x, top: rect.y, width: rect.width, height: rect.height },
      ]}
      onPress={() => tap({ location, player })}
    />
  );
}

const styles = StyleSheet.create({
  target: {
    position: 'absolute',
  },
});
