import React from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "@/src/i18n/localized-text";
import { useLanguage } from "@/src/i18n/use-language";
import { hasItemGrade, type BagItem } from "@/src/game/item-system";
import { normalizeGrade } from "@/src/game/item-grade";

export default function ItemGradeBadge({ item, fontSize = 10 }: { item?: BagItem | null; fontSize?: number }) {
  const { t } = useLanguage();
  if (!item || !hasItemGrade(item)) return null;
  const grade = normalizeGrade(item.grade);
  return <View pointerEvents="none" accessibilityLabel={`${t("Grade")} ${grade}`} style={styles.badge}>
    <Text translate={false} style={[styles.text, { fontSize, lineHeight: fontSize + 2 }]}>{grade}</Text>
  </View>;
}
const styles = StyleSheet.create({
  badge: { position: "absolute", top: 1, left: 2, zIndex: 6 },
  text: { color: "#E8D4A2", fontSize: 10, lineHeight: 12, fontWeight: "bold", includeFontPadding: false,
    textShadowColor: "#211407", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
});
