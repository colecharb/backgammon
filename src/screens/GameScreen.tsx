import React, { useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EquityBar } from "../components/analysis/EquityBar";
import { EquityPanel } from "../components/analysis/EquityPanel";
import { Board } from "../components/board/Board";
import { cubeSize } from "../components/board/geometry";
import { DoublingCube } from "../components/hud/DoublingCube";
import { GameHeader } from "../components/hud/GameHeader";
import { GameMenu } from "../components/hud/GameMenu";
import { Hud } from "../components/hud/Hud";
import { UndoButton } from "../components/hud/UndoButton";
import { useComputerPlayer } from "../hooks/useComputerPlayer";

const BOARD_ASPECT = 14.75 / 10.5;
const H_PAD = 12; // side breathing room for the bar and control row
const BOARD_GAP = 84; // gap below the control row to the safe-area bottom, kept
// generous so the bottom controls stay within easy thumb reach

/**
 * Portrait layout. The board runs edge to edge and is pinned a fixed distance
 * above the bottom safe area so it never shifts. An always-on equity bar hugs
 * its top edge (tapping it floats the per-move ranking above, absolutely
 * positioned, so nothing reflows); below sit the status line and a control row
 * of menu · undo · doubling cube. The bar and rows keep side padding while the
 * board itself does not.
 */
export function GameScreen() {
  useComputerPlayer();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [showMoves, setShowMoves] = useState(false);

  const boardWidth = width - insets.left - insets.right;
  const boardHeight = boardWidth / BOARD_ASPECT;
  const contentWidth = boardWidth - 2 * H_PAD;
  const cube = cubeSize(boardWidth);

  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      {/* Pushes the board group down so the board stays bottom-anchored. */}
      <View style={styles.spacer} />

      <View style={styles.statusLine}>
        <GameHeader />
      </View>

      <View style={[styles.bottomGroup, { width: boardWidth }]}>
        <View style={[styles.barWrap, { width: contentWidth }]}>
          {showMoves && (
            <View style={styles.movesOverlay}>
              <EquityPanel />
            </View>
          )}
          <View style={styles.barRow}>
            <Pressable
              style={styles.barPress}
              onPress={() => setShowMoves((s) => !s)}
            >
              <EquityBar />
            </Pressable>
            {/* Reserved so the bar keeps its width whether or not black's
                cube lives here. */}
            <View style={[styles.cubeSlot, { width: cube, marginLeft: 8 }]}>
              <DoublingCube at="bar" size={cube} />
            </View>
          </View>
        </View>

        <View style={{ width: boardWidth, height: boardHeight }}>
          <Board />
        </View>



        <View style={[styles.controls, { width: contentWidth }]}>
          <View style={styles.cellLeft}>
            <GameMenu />
          </View>
          <View style={styles.cellCenter}>
            <UndoButton />
          </View>
          <View style={styles.cellRight}>
            <DoublingCube at="row" size={cube} />
          </View>
        </View>

        <Hud />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#1b1b1f",
  },
  spacer: {
    flex: 1,
  },
  bottomGroup: {
    alignItems: "center",
    marginBottom: BOARD_GAP,
  },
  barWrap: {
    marginBottom: 6,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  barPress: {
    flex: 1,
  },
  cubeSlot: {
    alignItems: "center",
  },
  statusLine: {
    alignItems: "center",
    marginVertical: 12,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },
  cellLeft: {
    flex: 1,
    alignItems: "flex-start",
  },
  cellCenter: {
    flex: 1,
    alignItems: "center",
  },
  cellRight: {
    flex: 1,
    alignItems: "flex-end",
  },
  // Anchored to the top edge of the bar (bottom: "100%") and grows upward, so it
  // overlays the space above without reflowing the bar or the board.
  movesOverlay: {
    position: "absolute",
    bottom: "100%",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingBottom: 8,
  },
});
