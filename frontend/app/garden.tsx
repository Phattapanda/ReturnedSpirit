import React, { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import GardenScreenBase from "@/src/GardenScreenBase";
import { GardenRuntimeContext } from "@/src/game/garden-runtime-context";

/**
 * Thin Garden runtime wrapper.
 *
 * The original Garden screen stays intact in src/GardenScreenBase. The wrapper
 * only coordinates the independently persistent second plot and player thoughts
 * raised from shared GardenPlot components.
 */
export default function GardenScreen() {
  const insets = useSafeAreaInsets();
  const [instanceKey, setInstanceKey] = useState(0);
  const [thought, setThought] = useState<string | null>(null);
  const thoughtTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function refreshGarden() {
    setInstanceKey((current) => current + 1);
  }

  function showPlayerThought(text: string) {
    if (thoughtTimer.current) clearTimeout(thoughtTimer.current);
    setThought(text);
    thoughtTimer.current = setTimeout(() => setThought(null), 2600);
  }

  return (
    <GardenRuntimeContext.Provider value={{ refreshGarden, showPlayerThought }}>
      <View style={styles.root}>
        <GardenScreenBase key={instanceKey} />
        {thought && (
          <View style={[styles.thoughtWrap, { top: insets.top + 166 }]} pointerEvents="none">
            <View style={styles.thoughtArrow} />
            <View style={styles.thoughtCard}>
              <Text style={styles.thoughtText}>{thought}</Text>
            </View>
          </View>
        )}
      </View>
    </GardenRuntimeContext.Provider>
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
