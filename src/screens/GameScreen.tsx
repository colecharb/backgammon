import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EquityBar } from "../components/analysis/EquityBar";
import { EquityPanel } from "../components/analysis/EquityPanel";
import { Board } from "../components/board/Board";
import { cubeSize, frameThickness, offTrayWidth } from "../components/board/geometry";
import { DoublingCube } from "../components/hud/DoublingCube";
import { GameHeader } from "../components/hud/GameHeader";
import { GameMenu } from "../components/hud/GameMenu";
import { Hud } from "../components/hud/Hud";
import { UndoButton } from "../components/hud/UndoButton";
import { useComputerPlayer } from "../hooks/useComputerPlayer";

const BOARD_ASPECT = 14.75 / 10.5;
const MAX_WIDTH = 750; // cap the board on wide (web/tablet) screens
const CHROME = 220; // approx vertical room the bar, status and controls need
const BOARD_GAP = 84; // biases the centred board slightly upward
const MOBILE_WIDTH = 600; // below this, sit the board lower for thumb reach

/**
 * Portrait layout, board roughly vertically centred (a flexible spacer above
 * and below). An always-on equity bar hugs the board's top edge; tapping it
 * floats the per-move ranking above, absolutely positioned so nothing reflows —
 * and that overlay scrolls when it is taller than the space above the bar.
 * Below the board sit the status line and a control row of menu · undo ·
 * doubling cube. The bar and rows keep side padding while the board does not.
 */
export function GameScreen() {
  useComputerPlayer();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [showMoves, setShowMoves] = useState(false);
  // Space above the board group — the ceiling for the move-equity overlay.
  const [topSpace, setTopSpace] = useState(0);

  const availHeight = height - insets.top - insets.bottom;
  // Fit the board to the narrower of width and the leftover height, so it never
  // overflows a short (e.g. web) window.
  const boardWidth = Math.min(
    width - insets.left - insets.right,
    MAX_WIDTH,
    Math.max(0, availHeight - CHROME) * BOARD_ASPECT,
  );
  const boardHeight = boardWidth / BOARD_ASPECT;
  // Everything beside/below the board is sized off the board's own geometry so
  // it tracks the board at any size. The frame inset lines the bar and control
  // row up with the inside of the board's left/right frames; gaps are multiples
  // of it. Only type keeps a fixed size.
  const frame = frameThickness(boardWidth);
  const contentWidth = boardWidth;
  const offTray = offTrayWidth(boardWidth)
  const cube = cubeSize(boardWidth);
  const barHeight = frame * 3.3;
  // Right margin that centres the cube on the off-tray column: its centre sits
  // 3 frames from the board edge, i.e. 2 frames in from each (one-frame-inset)
  // row's right edge, and the cube is right-aligned there.
  const cubeInset = 2 * frame - cube / 2;
  // Centre on wide screens; on phones give the top more of the slack so the
  // board sits lower, within easier thumb reach.
  const bottomFlex = width < MOBILE_WIDTH ? 0.4 : 1;

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
      {/* Everything above the board group; its measured height caps the
          move-equity overlay so it can't run off the top of the screen. */}
      <View
        style={styles.topRegion}
        onLayout={(e) => setTopSpace(e.nativeEvent.layout.height)}
      >
        <View style={styles.spacer} />
        <View style={[styles.statusLine, { marginVertical: frame * 1.75 }]}>
          <GameHeader />
        </View>
      </View>

      <View style={[styles.bottomGroup, { width: boardWidth }]}>
        <View style={{ width: contentWidth, marginBottom: frame }}>
          {showMoves && (
            <View style={[styles.movesOverlay, { paddingBottom: frame }]}>
              <ScrollView
                style={{ maxHeight: Math.max(0, topSpace - frame) }}
                contentContainerStyle={styles.movesContent}
                showsVerticalScrollIndicator={false}
              >
                <EquityPanel />
              </ScrollView>
            </View>
          )}
          <View style={[styles.barRow, {marginLeft: frame}]}>
            <Pressable
              style={styles.barPress}
              onPress={() => setShowMoves((s) => !s)}
            >
              <EquityBar height={barHeight} />
            </Pressable>
            {/* Reserved so the bar keeps its width whether or not black's cube
                lives here; centred on the off-tray column. */}
            <View
              style={[
                styles.cubeSlot,
                { width: 2*frame + offTray},
              ]}
            >
              <DoublingCube at="bar" size={cube} />
            </View>
          </View>
        </View>

        <View style={{ width: boardWidth, height: boardHeight }}>
          <Board />
        </View>



        <View
          style={[styles.controls, { width: contentWidth, marginTop: frame }]}
        >
          <View style={styles.cellLeft}>
            <GameMenu />
          </View>
          <View style={styles.cellCenter}>
            <UndoButton />
          </View>
          <View style={styles.cellRight}>
            {/* Centred on the off-tray column, matching the bar cube. */}
            <View style={{ marginRight: cubeInset }}>
              <DoublingCube at="row" size={cube} />
            </View>
          </View>
        </View>

        <Hud />
      </View>

      <View style={[styles.spacer, { flex: bottomFlex }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#1b1b1f",
    alignItems: "center",
  },
  topRegion: {
    flex: 1,
    alignSelf: "stretch",
    alignItems: "center",
  },
  spacer: {
    flex: 1,
  },
  bottomGroup: {
    alignItems: "center",
    marginBottom: BOARD_GAP,
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
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
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
  },
  movesContent: {
    alignItems: "center",
  },
});
