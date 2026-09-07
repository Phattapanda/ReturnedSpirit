import React from "react";
import {
  Image,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { copperToDenominations } from "@/src/game/currency-system";

const COIN_IMAGES = {
  gold: require("../../assets/images/coin_gold.png"),
  silver: require("../../assets/images/coin_silver.png"),
  copper: require("../../assets/images/coin_copper.png"),
} as const;

type Props = {
  totalCopper: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  coinStyle?: StyleProp<ImageStyle>;
};

/** Displays canonical Copper as values followed by their matching coin images. */
export default function CurrencyPrice({ totalCopper, style, textStyle, coinStyle }: Props) {
  const balance = copperToDenominations(totalCopper);
  const parts = [
    { id: "gold", amount: balance.gold, source: COIN_IMAGES.gold },
    { id: "silver", amount: balance.silver, source: COIN_IMAGES.silver },
    { id: "copper", amount: balance.copper, source: COIN_IMAGES.copper },
  ].filter((part) => part.amount > 0);

  if (parts.length === 0) parts.push({ id: "copper", amount: 0, source: COIN_IMAGES.copper });

  return (
    <View style={[styles.root, style]}>
      {parts.map((part) => (
        <View key={part.id} style={styles.part}>
          <Text style={[styles.amount, textStyle]}>{part.amount}</Text>
          <Image source={part.source} style={[styles.coin, coinStyle]} resizeMode="contain" />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 5 },
  part: { flexDirection: "row", alignItems: "center", gap: 3 },
  amount: { color: "#FFF", fontFamily: "Oldenburg", fontSize: 11, fontVariant: ["tabular-nums"] },
  coin: { width: 17, height: 17 },
});
