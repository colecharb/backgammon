import { useAtomValue, useSetAtom } from "jotai";
import React from "react";
import { View } from "react-native";
import { canUndoAtom, undoAtom } from "../../state/game";
import { HudButton } from "./HudButton";

/**
 * Undo the last move (or retract a pending double). Keeps its footprint when
 * unavailable so the control row underneath the board never jumps.
 */
export function UndoButton() {
  const canUndo = useAtomValue(canUndoAtom);
  const undo = useSetAtom(undoAtom);
  return (
    <View
      style={!canUndo && { opacity: 0 }}
      pointerEvents={canUndo ? "auto" : "none"}
    >
      <HudButton label="Undo" onPress={undo} />
    </View>
  );
}
