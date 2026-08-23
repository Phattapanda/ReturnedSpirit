import React from "react";
import { StyleSheet, View } from "react-native";

import GardenScreenBase from "@/src/GardenScreenBase";
import {
  GardenRuntimeContext,
  notifyGardenRuntimeRefresh,
  notifyGardenPlayerThought,
} from "@/src/game/garden-runtime-context";

/**
 * Thin Garden runtime wrapper.
 *
 * The original Garden screen stays intact in src/GardenScreenBase. The wrapper
 * coordinates the independently persistent second plot and player thoughts.
 */
export default function GardenScreen() {
  function refreshGarden() {
    // 2nd Plot actions update their own local plot state immediately. The room
    // only needs to sync shared HUD/inventory values; remounting would reset scroll.
    notifyGardenRuntimeRefresh();
  }

  function showPlayerThought(text: string) {
    notifyGardenPlayerThought(text);
  }

  return (
    <GardenRuntimeContext.Provider value={{ refreshGarden, showPlayerThought }}>
      <View style={styles.root}>
        <GardenScreenBase />

      </View>
    </GardenRuntimeContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
