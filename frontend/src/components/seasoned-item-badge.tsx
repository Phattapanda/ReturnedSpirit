import React from "react";
import { StyleSheet, Text, View } from "react-native";

type Props = { visible?: boolean; size?: number };

/** Small persistent marker shown on a dish after it has been seasoned. */
export default function SeasonedItemBadge({ visible = true, size = 17 }: Props) {
  if (!visible) return null;
  return (
    <View pointerEvents="none" style={[styles.badge, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.plus, { fontSize: size - 4, lineHeight: size - 2 }]}>+</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: 1,
    right: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2FAE55",
    borderWidth: 1,
    borderColor: "#BDF4C9",
    zIndex: 5,
  },
  plus: {
    color: "#FFFFFF",
    fontWeight: "900",
    textAlign: "center",
    includeFontPadding: false,
  },
});
