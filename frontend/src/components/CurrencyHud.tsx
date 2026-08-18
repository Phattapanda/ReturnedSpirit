import { useEffect, useRef, useState } from "react";
import { Animated, Image, StyleSheet, Text, View } from "react-native";
import { usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  DEFAULT_CURRENCY_COPPER,
  copperToDenominations,
  loadCurrencyCopper,
  subscribeCurrency,
} from "@/src/game/currency-system";

const COIN_IMAGES = {
  gold: require("../../assets/images/coin_gold.png"),
  silver: require("../../assets/images/coin_silver.png"),
  copper: require("../../assets/images/coin_copper.png"),
} as const;

function isGameplayRoute(pathname: string): boolean {
  return pathname === "/kitchen" ||
    pathname === "/garden" ||
    pathname === "/dormitory" ||
    pathname === "/dining" ||
    pathname === "/dining-hall";
}

/**
 * Currency HUD aligned with the room/location-name row.
 *
 * Mounted inside each gameplay room screen (Kitchen / Garden / Dormitory / future
 * Dining) rather than at the router root, so it enters and leaves together with its
 * room during Stack transitions instead of floating as a persistent global overlay.
 * Pointer events are disabled so it never interferes with gameplay/header controls.
 */
export default function CurrencyHud() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [totalCopper, setTotalCopper] = useState(DEFAULT_CURRENCY_COPPER);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(18)).current;

  // Currency persistence/subscription is independent from navigation.
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
  }, []);

  // Follow room navigation visually instead of staying pinned during Stack transitions.
  useEffect(() => {
    opacity.stopAnimation();
    translateX.stopAnimation();
    opacity.setValue(0);
    translateX.setValue(18);

    if (!isGameplayRoute(pathname)) return;

    // Let the new Stack screen begin its slide first, then bring its HUD in with it.
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }, 120);

    return () => clearTimeout(timer);
  }, [pathname, opacity, translateX]);

  if (!isGameplayRoute(pathname)) return null;

  const balance = copperToDenominations(totalCopper);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.root,
        {
          top: insets.top + 72,
          opacity,
          transform: [{ translateX }],
        },
      ]}
    >
      <View style={styles.denomination}>
        <Image source={COIN_IMAGES.gold} style={styles.coin} resizeMode="contain" />
        <Text style={styles.amount}>{balance.gold}</Text>
      </View>
      <View style={styles.denomination}>
        <Image source={COIN_IMAGES.silver} style={styles.coin} resizeMode="contain" />
        <Text style={styles.amount}>{balance.silver}</Text>
      </View>
      <View style={styles.denomination}>
        <Image source={COIN_IMAGES.copper} style={styles.coin} resizeMode="contain" />
        <Text style={styles.amount}>{balance.copper}</Text>
      </View>
    </Animated.View>
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
    width: 18,
    height: 18,
  },
  amount: {
    color: "#F0E8D5",
    fontSize: 11,
    fontFamily: "Oldenburg",
    fontWeight: "700",
  },
});
