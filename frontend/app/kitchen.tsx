import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import KitchenScreenBase from "@/src/KitchenScreenBase";
import TavernLocationTransition from "@/src/components/tavern-location-transition";
import { KitchenRuntimeContext, notifyKitchenPlayerThought } from "@/src/game/kitchen-runtime-context";

/**
 * Thin Kitchen runtime wrapper.
 *
 * Item rendering now lives explicitly in KitchenScreenBase. The wrapper keeps
 * the lightweight runtime hooks used by PlayerBag-compatible interactions.
 */
export default function KitchenScreen() {
  const [instanceKey, setInstanceKey] = useState(0);
  const { stamina: staminaParam } = useLocalSearchParams<{ stamina?: string }>();
  const parsedStamina = staminaParam === undefined ? undefined : Number.parseInt(staminaParam, 10);
  const entryStamina = Number.isFinite(parsedStamina) ? Math.max(0, parsedStamina!) : undefined;

  function refreshKitchen() {
    setInstanceKey((current) => current + 1);
  }

  function showPlayerThought(text: string) {
    notifyKitchenPlayerThought(text);
  }

  return (
    <TavernLocationTransition location="kitchen">
      <KitchenRuntimeContext.Provider value={{ refreshKitchen, showPlayerThought }}>
        <View style={styles.root}>
          <KitchenScreenBase key={instanceKey} entryStamina={entryStamina} />

        </View>
      </KitchenRuntimeContext.Provider>
    </TavernLocationTransition>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
