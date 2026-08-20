import React, { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import GardenScreenBase from "@/src/GardenScreenBase";
import {
  GardenRuntimeContext,
  notifyGardenRuntimeRefresh,
} from "@/src/game/garden-runtime-context";
import { useAudioManager } from "@/src/audio/AudioProvider";
import {
  guestTutorialHasReached,
  loadGuestTutorialIntroStep,
  subscribeGuestTutorialIntroStep,
  type GuestTutorialIntroStep,
} from "@/src/game/guest-tutorial";

/**
 * Thin Garden runtime wrapper.
 *
 * The original Garden screen stays intact in src/GardenScreenBase. The wrapper
 * coordinates the independently persistent second plot and player thoughts.
 */
export default function GardenScreen() {
  const router = useRouter();
  const audioManager = useAudioManager();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const [thought, setThought] = useState<string | null>(null);
  const [diningUnlocked, setDiningUnlocked] = useState(false);
  const thoughtTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    const applyStep = (step: GuestTutorialIntroStep) => {
      if (active) setDiningUnlocked(guestTutorialHasReached(step, "dining_prompt"));
    };

    loadGuestTutorialIntroStep().then(applyStep).catch(() => {
      if (active) setDiningUnlocked(false);
    });
    const unsubscribe = subscribeGuestTutorialIntroStep(applyStep);

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  function refreshGarden() {
    // 2nd Plot actions update their own local plot state immediately. The room
    // only needs to sync shared HUD/inventory values; remounting would reset scroll.
    notifyGardenRuntimeRefresh();
  }

  function showPlayerThought(text: string) {
    if (thoughtTimer.current) clearTimeout(thoughtTimer.current);
    setThought(text);
    thoughtTimer.current = setTimeout(() => setThought(null), 2600);
  }

  function goToDining() {
    audioManager.playSoundEffect("footstep", { maxDurationMs: 4000 });
    router.push("/dining");
  }

  // GardenScreenBase keeps Dining visually locked. Once the guest tutorial has
  // reached dining_prompt, this story-derived button replaces that single slot.
  const navButtonWidth = Math.max(0, (W - 16 - 25) / 6);
  const diningLeft = 8 + 2 * (navButtonWidth + 5);

  return (
    <GardenRuntimeContext.Provider value={{ refreshGarden, showPlayerThought }}>
      <View style={styles.root}>
        <GardenScreenBase />

        {diningUnlocked && (
          <TouchableOpacity
            style={[
              styles.diningButton,
              {
                left: diningLeft,
                width: navButtonWidth,
                bottom: insets.bottom + 4,
              },
            ]}
            onPress={goToDining}
            activeOpacity={0.8}
          >
            <Image
              source={require("../assets/images/gotodining.png")}
              style={styles.diningButtonImage}
              resizeMode="contain"
              resizeMethod="resize"
            />
          </TouchableOpacity>
        )}

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
  diningButton: {
    position: "absolute",
    height: 54,
    zIndex: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(196,148,58,0.55)",
    backgroundColor: "rgba(196,148,58,0.22)",
  },
  diningButtonImage: {
    width: 42,
    height: 42,
  },
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
