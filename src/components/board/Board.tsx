import { useAtomValue } from 'jotai';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Polygon, Rect as SvgRect } from 'react-native-svg';
import { CheckerLocation, Player } from '../../engine/types';
import { gameStateAtom } from '../../state/game';
import { BoardDice } from './BoardDice';
import { Checker } from './Checker';
import { BoardLayout, checkerCenter, computeLayout } from './geometry';
import { LocationPressable } from './LocationPressable';
import { boardTheme } from './theme';

export function Board() {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  return (
    <View
      style={styles.container}
      onLayout={(e) => setSize({
        width: e.nativeEvent.layout.width,
        height: e.nativeEvent.layout.height,
      })}
    >
      {size && size.width > 0 && (
        <BoardInner layout={computeLayout(size.width, size.height)} />
      )}
    </View>
  );
}

function BoardInner({ layout }: { layout: BoardLayout }) {
  const game = useAtomValue(gameStateAtom);

  interface RenderedChecker {
    key: string;
    location: CheckerLocation;
    player: Player;
    stackIndex: number;
    stackCount: number;
  }
  const checkers: RenderedChecker[] = [];
  const pushStack = (location: CheckerLocation, player: Player, count: number) => {
    for (let i = 0; i < count; i++) {
      checkers.push({
        key: `${location}-${player}-${i}`,
        location,
        player,
        stackIndex: i,
        stackCount: count,
      });
    }
  };
  game.board.points.forEach((point, i) => {
    if (point) pushStack(i + 1, point.player, point.count);
  });
  for (const player of ['white', 'black'] as const) {
    pushStack('bar', player, game.board.bar[player]);
    pushStack('off', player, game.board.off[player]);
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <BoardBackground layout={layout} />
      {checkers.map(({ key, location, player, stackIndex, stackCount }) => {
        const { x, y } = checkerCenter(layout, location, player, stackIndex, stackCount);
        return (
          <Checker
            key={key}
            cx={x}
            cy={y}
            radius={layout.checkerRadius}
            player={player}
            selected={false}
          />
        );
      })}
      {layout.points.map((rect, i) => (
        <LocationPressable key={`point-${i + 1}`} rect={rect} location={i + 1} />
      ))}
      {(['white', 'black'] as const).map((player) => (
        <React.Fragment key={player}>
          <LocationPressable rect={layout.bar[player]} location="bar" player={player} />
          <LocationPressable rect={layout.off[player]} location="off" player={player} />
        </React.Fragment>
      ))}
      <BoardDice layout={layout} />
    </View>
  );
}

function BoardBackground({ layout }: { layout: BoardLayout }) {
  const { width, height, frameThickness, barColumn, offColumn } = layout;
  const triangleHeight = layout.points[0].height * 0.9;
  return (
    <Svg width={width} height={height}>
      <SvgRect x={0} y={0} width={width} height={height} fill={boardTheme.felt} />
      {/* Bar and tray run full height; the frame strips below overlap their
          ends so no sub-pixel seam can show between them. */}
      <SvgRect x={offColumn.x} y={0} width={offColumn.width} height={height} fill={boardTheme.offTray} />
      <SvgRect x={barColumn.x} y={0} width={barColumn.width} height={height} fill={boardTheme.frame} />
      <SvgRect x={0} y={0} width={width} height={frameThickness} fill={boardTheme.frame} />
      <SvgRect x={0} y={height - frameThickness} width={width} height={frameThickness} fill={boardTheme.frame} />
      <SvgRect x={0} y={0} width={frameThickness} height={height} fill={boardTheme.frame} />
      <SvgRect x={width - frameThickness} y={0} width={frameThickness} height={height} fill={boardTheme.frame} />
      <SvgRect
        x={offColumn.x - frameThickness}
        y={0}
        width={frameThickness}
        height={height}
        fill={boardTheme.frame}
      />
      {layout.points.map((rect, i) => {
        const isTop = layout.pointIsTop[i];
        const baseY = isTop ? rect.y : rect.y + rect.height;
        const apexY = isTop ? rect.y + triangleHeight : rect.y + rect.height - triangleHeight;
        const fill = (i + 1) % 2 === 0 ? boardTheme.pointLight : boardTheme.pointDark;
        return (
          <Polygon
            key={i}
            points={`${rect.x},${baseY} ${rect.x + rect.width},${baseY} ${rect.x + rect.width / 2},${apexY}`}
            fill={fill}
          />
        );
      })}
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
