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
    // backgroundColor: boardTheme.frame,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: boardTheme.pointDark,
  },
  buttonLabel: {
    color: boardTheme.pointDark,
    fontSize: 16,
    fontWeight: "700",
  },
});
