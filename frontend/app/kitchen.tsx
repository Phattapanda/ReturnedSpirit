import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import KitchenScreenBase from "@/src/KitchenScreenBase";
import { KitchenRuntimeContext } from "@/src/game/kitchen-runtime-context";

const CARROT_TABLE_ASSET = require("../assets/images/carrot.png");

function ensureCarrotTableAssetFallback() {
  if (Object.prototype.hasOwnProperty.call(Object.prototype, "carrot")) return;
  Object.defineProperty(Object.prototype, "carrot", {
    value: CARROT_TABLE_ASSET,
    enumerable: false,
    configurable: true,
    writable: false,
  });
}

function removeCarrotTableAssetFallback() {
  if (!Object.prototype.hasOwnProperty.call(Object.prototype, "carrot")) return;
  if ((Object.prototype as { carrot?: unknown }).carrot !== CARROT_TABLE_ASSET) return;
  delete (Object.prototype as { carrot?: unknown }).carrot;
}

/**
 * Thin Kitchen runtime wrapper.
 *
 * The proven Kitchen screen stays unchanged in src/KitchenScreenBase. The
 * wrapper only refreshes that screen after Carrot Bag unpacking and supplies the
 * carrot image to its existing item-image lookup while this route is mounted.
 */
export default function KitchenScreen() {
  const insets = useSafeAreaInsets();
  const [instanceKey, setInstanceKey] = useState(0);
  const [thought, setThought] = useState<string | null>(null);
  const thoughtTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Install before the child renders. The effect repeats installation after a
  // development Strict-Mode cleanup/setup cycle and removes only our own value.
  ensureCarrotTableAssetFallback();
  useEffect(() => {
    ensureCarrotTableAssetFallback();
    return () => {
      if (thoughtTimer.current) clearTimeout(thoughtTimer.current);
      removeCarrotTableAssetFallback();
    };
  }, []);

  function refreshKitchen() {
    setInstanceKey((current) => current + 1);
  }

  function showPlayerThought(text: string) {
    if (thoughtTimer.current) clearTimeout(thoughtTimer.current);
    setThought(text);
    thoughtTimer.current = setTimeout(() => setThought(null), 2600);
  }

  return (
    <KitchenRuntimeContext.Provider value={{ refreshKitchen, showPlayerThought }}>
      <View style={styles.root}>
        <KitchenScreenBase key={instanceKey} />
        {thought && (
          <View style={[styles.thoughtWrap, { top: insets.top + 166 }]} pointerEvents="none">
            <View style={styles.thoughtArrow} />
            <View style={styles.thoughtCard}>
              <Text style={styles.thoughtText}>{thought}</Text>
            </View>
          </View>
        )}
      </View>
    </KitchenRuntimeContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  thoughtWrap: {
    position: "absolute",
    left: 10,
    width: 250,
    zIndex: 2200,
  },
  thoughtArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "rgba(240,230,200,0.97)",
    marginLeft: 34,
  },
  thoughtCard: {
    backgroundColor: "rgba(240,230,200,0.97)",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.50)",
    paddingHorizontal: 13,
    paddingVertical: 9,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 7,
    elevation: 14,
  },
  thoughtText: {
    color: "#2A1000",
    fontSize: 12,
    lineHeight: 18,
    fontStyle: "italic",
    fontFamily: "Oldenburg",
  },
});