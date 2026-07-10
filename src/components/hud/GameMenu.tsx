import { useAtom, useSetAtom } from "jotai";
import React, { useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { newGameAtom, playersAtom } from "../../state/game";
import { HudButton } from "./HudButton";

/**
 * Menu trigger that opens a centered modal overlay. Destructive entries
 * (reset) confirm via an alert before acting.
 */
export function GameMenu() {
  const [open, setOpen] = useState(false);
  const reset = useSetAtom(newGameAtom);
  const [players, setPlayers] = useAtom(playersAtom);

  // The computer plays black; toggling mid-game just starts/stops it.
  const toggleOpponent = () =>
    setPlayers((p) => ({
      ...p,
      black: p.black === "computer" ? "human" : "computer",
    }));

  const confirmReset = () => {
    Alert.alert("Reset game?", "The current game will be lost.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: () => {
          reset();
          setOpen(false);
        },
      },
    ]);
  };

  return (
    <>
      <Pressable style={styles.trigger} onPress={() => setOpen(true)} hitSlop={8}>
        <Text style={styles.triggerLabel}>Menu</Text>
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {/* Swallow taps inside the card so they don't close the menu. */}
          <Pressable style={styles.card} onPress={() => {}}>
            <Text style={styles.title}>Menu</Text>
            <HudButton
              label={`Opponent: ${players.black === "computer" ? "Computer" : "Human"}`}
              onPress={toggleOpponent}
            />
            <HudButton label="Reset game" onPress={confirmReset} />
            <Pressable onPress={() => setOpen(false)} hitSlop={8}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  triggerLabel: {
    color: "#8a877f",
    fontSize: 13,
    fontWeight: "600",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    minWidth: 220,
    alignItems: "center",
    gap: 16,
    backgroundColor: "#26262b",
    borderRadius: 14,
    paddingVertical: 24,
    paddingHorizontal: 28,
  },
  title: {
    color: "#e8e6e1",
    fontSize: 18,
    fontWeight: "700",
  },
  close: {
    color: "#8a877f",
    fontSize: 14,
    fontWeight: "600",
  },
});
