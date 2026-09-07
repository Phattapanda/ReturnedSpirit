import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { getItemDurability, type BagItem } from "@/src/game/item-system";

type Props = {
  item: BagItem | null | undefined;
  style?: StyleProp<ViewStyle>;
};

/** Compact durability readout placed directly over the bottom of an item image. */
export default function ItemDurabilityBadge({ item, style }: Props) {
  const durability = item ? getItemDurability(item) : null;
  if (!durability) return null;

  return (
    <View pointerEvents="none" style={[styles.badge, style]}>
      <Text style={styles.text}>{durability.current}/{durability.maximum}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    bottom: 2,
    left: "50%",
    minWidth: 34,
    transform: [{ translateX: -17 }],
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 5,
    backgroundColor: "rgba(15, 10, 7, 0.86)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(245, 230, 200, 0.65)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 8,
  },
  text: {
    color: "#FFF4DC",
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    textShadowColor: "#000",
    textShadowRadius: 2,
  },
});
