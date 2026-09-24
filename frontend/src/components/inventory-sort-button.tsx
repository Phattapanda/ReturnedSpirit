import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, type StyleProp, type ViewStyle } from "react-native";

import type { InventorySortMode } from "@/src/game/inventory-sort";

type Props = {
  mode: InventorySortMode;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function InventorySortButton({ mode, onPress, disabled = false, style }: Props) {
  const alphabetical = mode === "alphabetical";
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={alphabetical ? "Sort inventory alphabetically" : "Sort inventory by type"}
      activeOpacity={0.72}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && styles.disabled, style]}
    >
      <Ionicons name={alphabetical ? "text-outline" : "funnel-outline"} size={14} color="#F5E6C8" />
      <Text style={styles.label}>{alphabetical ? "A→Z" : "Type"}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 30,
    minWidth: 66,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(196,148,58,0.62)",
    backgroundColor: "rgba(82,49,14,0.82)",
  },
  disabled: { opacity: 0.42 },
  label: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 11 },
});
