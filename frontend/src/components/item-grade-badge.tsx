import React from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "@/src/i18n/localized-text";
import { useLanguage } from "@/src/i18n/use-language";
import { hasItemGrade, type BagItem } from "@/src/game/item-system";
import { normalizeGrade } from "@/src/game/item-grade";

export default function ItemGradeBadge({ item }: { item?: BagItem | null }) {
  const { t } = useLanguage();
  if (!item || !hasItemGrade(item)) return null;
  const grade = normalizeGrade(item.grade);
  return <View pointerEvents="none" accessibilityLabel={`${t("Grade")} ${grade}`} style={styles.badge}>
    <Text translate={false} style={styles.text}>{grade}</Text>
  </View>;
}
const styles = StyleSheet.create({
  badge: { position: "absolute", top: 1, left: 1, minWidth: 19, height: 20, borderRadius: 4,
    backgroundColor: "#211407", borderColor: "#E8D4A2", borderWidth: 1, alignItems: "center", justifyContent: "center", zIndex: 6 },
  text: { color: "#E8D4A2", fontSize: 13, fontWeight: "bold", includeFontPadding: false },
});
