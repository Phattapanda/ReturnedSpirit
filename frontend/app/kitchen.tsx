import React, { useState } from "react";
import { StyleSheet, View } from "react-native";

import KitchenScreenBase from "@/src/KitchenScreenBase";
import { KitchenRuntimeContext, notifyKitchenPlayerThought } from "@/src/game/kitchen-runtime-context";

/**
 * Thin Kitchen runtime wrapper.
 *
 * Item rendering now lives explicitly in KitchenScreenBase. The wrapper keeps
 * the lightweight runtime hooks used by PlayerBag-compatible interactions.
 */
export default function KitchenScreen() {
  const [instanceKey, setInstanceKey] = useState(0);

  function refreshKitchen() {
    setInstanceKey((current) => current + 1);
  }

  function showPlayerThought(text: string) {
    notifyKitchenPlayerThought(text);
  }

  return (
    <KitchenRuntimeContext.Provider value={{ refreshKitchen, showPlayerThought }}>
      <View style={styles.root}>
        <KitchenScreenBase key={instanceKey} />

      </View>
    </KitchenRuntimeContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
