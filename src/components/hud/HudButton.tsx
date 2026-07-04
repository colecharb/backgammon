import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { boardTheme } from "../board/theme";

export function HudButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.button} onPress={onPress}>
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: boardTheme.frame,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
  },
  buttonLabel: {
    color: "#f1eadb",
    fontSize: 16,
    fontWeight: "700",
  },
});
