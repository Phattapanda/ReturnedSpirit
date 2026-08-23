import React, { useCallback, useState } from "react";
import { Image, StyleSheet, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import { useAudioManager } from "@/src/audio/AudioProvider";
import { guestTutorialHasReached, loadGuestTutorialIntroStep } from "@/src/game/guest-tutorial";
import { loadTravelState } from "@/src/game/travel-system";

const LOCATIONS = [
  { id: "kitchen", image: require("../../assets/images/gotokitchen.png"), route: "/kitchen" },
  { id: "garden", image: require("../../assets/images/gotogarden.png"), route: "/garden" },
  { id: "dining", image: require("../../assets/images/gotodining.png"), route: "/dining" },
  { id: "dormitory", image: require("../../assets/images/gotodormitory.png"), route: "/dormitory" },
  { id: "mail", image: require("../../assets/images/gotomail.png"), route: null },
  { id: "explore", image: require("../../assets/images/goexplore.png"), route: "/outside-tavern" },
] as const;

type LocationId = (typeof LOCATIONS)[number]["id"];

type Props = {
  current: LocationId;
};

export default function TavernLocationBar({ current }: Props) {
  const router = useRouter();
  const audioManager = useAudioManager();
  const [coreUnlocked, setCoreUnlocked] = useState(false);
  const [exploreUnlocked, setExploreUnlocked] = useState(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    Promise.all([loadGuestTutorialIntroStep(), loadTravelState()]).then(([tutorial, travel]) => {
      if (!active) return;
      setCoreUnlocked(guestTutorialHasReached(tutorial, "service_complete"));
      setExploreUnlocked(travel.exploreUnlocked);
    }).catch(() => {});
    return () => { active = false; };
  }, []));

  return (
    <View style={styles.bar}>
      {LOCATIONS.map((location) => {
        const isCurrent = location.id === current;
        const enabled = isCurrent || (
          location.id === "explore"
            ? exploreUnlocked
            : location.id !== "mail" && coreUnlocked
        );
        return (
          <TouchableOpacity
            key={location.id}
            style={[styles.button, enabled ? styles.buttonEnabled : styles.buttonLocked, isCurrent && styles.buttonCurrent]}
            disabled={!enabled || isCurrent || !location.route}
            activeOpacity={0.8}
            onPress={() => {
              if (!location.route) return;
              audioManager.playSoundEffect(location.id === "dormitory" ? "walking-on-wood" : "footstep", { maxDurationMs: 4000 });
              router.replace(location.route);
            }}
          >
            <Image source={location.image} style={[styles.image, !enabled && styles.imageLocked]} resizeMode="contain" />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: "rgba(10,5,1,0.96)",
    borderTopWidth: 1,
    borderTopColor: "rgba(196,148,58,0.20)",
  },
  button: {
    flex: 1,
    minHeight: 54,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
  },
  buttonEnabled: { backgroundColor: "rgba(196,148,58,0.22)", borderColor: "rgba(196,148,58,0.55)" },
  buttonLocked: { backgroundColor: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" },
  buttonCurrent: { borderColor: "#FFFFFF", borderWidth: 2, backgroundColor: "rgba(196,148,58,0.22)" },
  image: { width: 42, height: 42 },
  imageLocked: { opacity: 0.2 },
});
