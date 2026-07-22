import { isPointIndex } from '../../engine/helpers';
import { CheckerLocation, Player, PointIndex } from '../../engine/types';

/**
 * Pure board geometry: maps game locations to pixel frames. This single
 * module drives rendering, tap targets, and (later) drag/animation, so the
 * three can never disagree about where things are.
 *
 * Column layout, left to right (14 columns of pointWidth):
 *   top row:    13 14 15 16 17 18 | bar | 19 20 21 22 23 24 | off (black)
 *   bottom row: 12 11 10  9  8  7 | bar |  6  5  4  3  2  1 | off (white)
 * White's home board is bottom-right; white owns the bottom halves of the
 * bar and off columns.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoardLayout {
  width: number;
  height: number;
  pointWidth: number;
  /** Frame strips on all four sides, a quarter of the bar's width. */
  frameThickness: number;
  checkerRadius: number;
  /** Full half-height column per point — also the tap target. */
  points: Rect[];
  /** True when the point hangs from the top edge. */
  pointIsTop: boolean[];
  bar: Record<Player, Rect>;
  off: Record<Player, Rect>;
  barColumn: Rect;
  offColumn: Rect;
}

const COLUMNS = 14; // 12 points + bar + off tray

/** A stack's maximum visual height, in checker diameters. */
const MAX_STACK_DIAMETERS = 5;

/**
 * The doubling cube's side length for a board of the given pixel width — a
 * fraction of a point's width, so every cube (on the board or in the control
 * area) is the same size for a given board.
 */
export function cubeSize(width: number): number {
  return (width / (COLUMNS + 0.75)) * 0.72;
}

/**
 * The board frame's thickness for a board of the given pixel width (a quarter
 * of a point's width). The playable area is inset by this on every side, so it
 * doubles as the alignment reference for chrome placed beside the board.
 */
export function frameThickness(width: number): number {
  return width / (COLUMNS + 0.75) / 4;
}

/**
 * The off-tray column's width for a board of the given pixel width — the
 * rightmost column, one point wide.
 */
export function offTrayWidth(width: number): number {
  return width / (COLUMNS + 0.75);
}

export function computeLayout(width: number, height: number): BoardLayout {
  // 14 columns plus quarter-width frame strips on each side and one more
  // between the felt and the off tray = 14.75 point widths.
  const pointWidth = width / (COLUMNS + 0.75);
  const frameThickness = pointWidth / 4;
  const innerX = frameThickness;
  const innerY = frameThickness;
  const innerHeight = height - 2 * frameThickness;
  const halfHeight = innerHeight / 2;
  const points: Rect[] = [];
  const pointIsTop: boolean[] = [];

  for (let p = 1; p <= 24; p++) {
    const isTop = p >= 13;
    const column = columnForPoint(p);
    points.push({
      x: innerX + column * pointWidth,
      y: isTop ? innerY : innerY + halfHeight,
      width: pointWidth,
      height: halfHeight,
    });
    pointIsTop.push(isTop);
  }

  const barX = innerX + 6 * pointWidth;
  // The off tray sits past its own divider strip.
  const offX = innerX + 13 * pointWidth + frameThickness;
  const topHalf = (x: number): Rect => ({ x, y: innerY, width: pointWidth, height: halfHeight });
  const bottomHalf = (x: number): Rect => ({ x, y: innerY + halfHeight, width: pointWidth, height: halfHeight });

  return {
    width,
    height,
    pointWidth,
    frameThickness,
    checkerRadius: pointWidth * 0.44,
    points,
    pointIsTop,
    bar: { black: topHalf(barX), white: bottomHalf(barX) },
    off: { black: topHalf(offX), white: bottomHalf(offX) },
    barColumn: { x: barX, y: innerY, width: pointWidth, height: innerHeight },
    offColumn: { x: offX, y: innerY, width: pointWidth, height: innerHeight },
  };
}

function columnForPoint(p: PointIndex): number {
  if (p >= 19) return p - 19 + 7; // 19–24 → columns 7–12
  if (p >= 13) return p - 13; // 13–18 → columns 0–5
  if (p >= 7) return 12 - p; // 7–12 → columns 5–0
  return 13 - p; // 1–6 → columns 12–7
}

/**
 * Center of the checker at `stackIndex` (0 = closest to the anchor edge) in
 * a stack of `stackCount`, compressing spacing once it would overflow the
 * column. Point and off stacks anchor at the board edge and grow toward the
 * middle; bar stacks anchor at the board's center line and grow outward so
 * hit checkers sit visibly mid-board.
 */
export function checkerCenter(
  layout: BoardLayout,
  location: CheckerLocation,
  player: Player,
  stackIndex: number,
  stackCount: number,
): { x: number; y: number } {
  const { rect, isTop } = frameFor(layout, location, player);
  const r = layout.checkerRadius;
  // Stacks never grow taller than five checkers; beyond that they compress
  // into the same span, keeping clear space toward the middle of the board.
  const maxSpan = Math.min(rect.height, MAX_STACK_DIAMETERS * 2 * r);
  const spacing =
    stackCount > 1 ? Math.min(2 * r, (maxSpan - 2 * r) / (stackCount - 1)) : 0;
  const anchorTop = location === 'bar' ? !isTop : isTop;
  const grow = anchorTop ? 1 : -1;
  const base = anchorTop ? rect.y + r : rect.y + rect.height - r;
  return {
    x: rect.x + rect.width / 2,
    y: base + grow * spacing * stackIndex,
  };
}

export function frameFor(
  layout: BoardLayout,
  location: CheckerLocation,
  player: Player,
): { rect: Rect; isTop: boolean } {
  if (isPointIndex(location)) {
    return { rect: layout.points[location - 1], isTop: layout.pointIsTop[location - 1] };
  }
  return { rect: layout[location][player], isTop: player === 'black' };
}
