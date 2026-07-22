import { useAtomValue } from "jotai";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { positionEquityAtom } from "../../state/analysis";
import { boardTheme } from "../board/theme";

/**
 * Always-on strength bar: two segments split by each side's win chance, in the
 * checker colours. The parent makes it pressable to reveal the per-move ranking.
 * Purely derived from positionEquityAtom.
 */
export function EquityBar() {
  const { pWhiteWin } = useAtomValue(positionEquityAtom);
  const whitePct = Math.round(pWhiteWin * 100);
  const blackPct = 100 - whitePct;
  return (
    <View style={styles.bar}>
      <View style={[styles.segment, styles.white, { flex: Math.max(pWhiteWin, 1e-4) }]}>
        {whitePct >= 12 && <Text style={styles.whiteLabel}>{whitePct}%</Text>}
      </View>
      <View style={[styles.segment, styles.black, { flex: Math.max(1 - pWhiteWin, 1e-4) }]}>
        {blackPct >= 12 && <Text style={styles.blackLabel}>{blackPct}%</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    width: "100%",
    height: 22,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "#26262c",
  },
  segment: {
    justifyContent: "center",
  },
  white: {
    backgroundColor: boardTheme.checker.white.fill,
    alignItems: "flex-start",
    paddingLeft: 8,
  },
  black: {
    backgroundColor: boardTheme.checker.black.fill,
    alignItems: "flex-end",
    paddingRight: 8,
  },
  whiteLabel: {
    color: "#3a3a3a",
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  blackLabel: {
    color: "#e8e6e1",
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
});
