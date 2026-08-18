import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  DEFAULT_CURRENCY_COPPER,
  copperToDenominations,
  loadCurrencyCopper,
  subscribeCurrency,
} from "@/src/game/currency-system";

function isGameplayRoute(pathname: string): boolean {
  return pathname === "/kitchen" ||
    pathname === "/garden" ||
    pathname === "/dormitory" ||
    pathname === "/dining" ||
    pathname === "/dining-hall";
}

/**
 * Global currency HUD aligned with the room/location-name row.
 * Pointer events are disabled so it never interferes with gameplay or header controls.
 */
export default function CurrencyHud() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [totalCopper, setTotalCopper] = useState(DEFAULT_CURRENCY_COPPER);

  useEffect(() => {
    let active = true;
    loadCurrencyCopper().then((value) => {
      if (active) setTotalCopper(value);
    });
    const unsubscribe = subscribeCurrency((value) => {
      if (active) setTotalCopper(value);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [pathname]);

  if (!isGameplayRoute(pathname)) return null;

  const balance = copperToDenominations(totalCopper);

  return (
    <View pointerEvents="none" style={[styles.root, { top: insets.top + 52 }]}>
      <View style={styles.denomination}>
        <View style={[styles.coin, styles.goldCoin]} />
        <Text style={styles.amount}>{balance.gold}</Text>
      </View>
      <View style={styles.denomination}>
        <View style={[styles.coin, styles.silverCoin]} />
        <Text style={styles.amount}>{balance.silver}</Text>
      </View>
      <View style={styles.denomination}>
        <View style={[styles.coin, styles.copperCoin]} />
        <Text style={styles.amount}>{balance.copper}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    right: 14,
    zIndex: 1000,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  denomination: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  coin: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(245,230,200,0.65)",
  },
  goldCoin: { backgroundColor: "#C4943A" },
  silverCoin: { backgroundColor: "#B8B8B0" },
  copperCoin: { backgroundColor: "#A86132" },
  amount: {
    color: "#F0E8D5",
    fontSize: 11,
    fontFamily: "Oldenburg",
    fontWeight: "700",
  },
});
