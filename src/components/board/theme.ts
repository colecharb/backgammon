const checkers = {
  white: {
    fill: "#f4efe3",
    stroke: "rgba(0, 0, 0, 0.6)",
    ring: "rgba(0, 0, 0, 0.10)",
  },
  black: {
    fill: "#404040",
    stroke: "#000",
    ring: "rgba(0, 0, 0, 0.20)",
  },
} as const;

export const brownBoardTheme = {
  felt: "#fec",
  frame: "#503830",
  pointLight: "#b97",
  pointDark: "#754",
  offTray: "#754",
  checker: checkers,
  selected: "#f5c542",
} as const;

/** Green variant in the spirit of chess.com's board. */
export const greenBoardTheme = {
  felt: "#ebecd0",
  frame: "#312e2b",
  pointLight: "#86a666",
  pointDark: "#5d7a43",
  offTray: "#5d7a43",
  checker: checkers,
  selected: "#f5c542",
} as const;

export type BoardTheme = typeof brownBoardTheme | typeof greenBoardTheme;

// The active theme — swap here.
export const boardTheme: BoardTheme = greenBoardTheme;
