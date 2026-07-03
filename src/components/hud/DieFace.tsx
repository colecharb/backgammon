import React from 'react';
import Svg, { Circle, Rect } from 'react-native-svg';
import { boardTheme } from '../board/theme';

const PIP_GRID: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

interface Props {
  value: number;
  size: number;
  dimmed?: boolean;
}

export function DieFace({ value, size, dimmed = false }: Props) {
  const pipR = size * 0.09;
  const cell = size / 4;
  return (
    <Svg width={size} height={size} opacity={dimmed ? 0.3 : 1}>
      <Rect
        x={1}
        y={1}
        width={size - 2}
        height={size - 2}
        rx={size * 0.18}
        fill={boardTheme.checker.white.fill}
        stroke={boardTheme.checker.white.stroke}
        strokeWidth={1.5}
      />
      {(PIP_GRID[value] ?? []).map(([col, row], i) => (
        <Circle
          key={i}
          cx={cell + col * cell}
          cy={cell + row * cell}
          r={pipR}
          fill={boardTheme.checker.black.fill}
        />
      ))}
    </Svg>
  );
}
