import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import TravelHeader from "@/src/components/travel-header";
import SceneBackground from "@/src/components/SceneBackground";
import { useAudioManager } from "@/src/audio/AudioProvider";

const BACKGROUND = require("../assets/images/forestentrance.png");

export default function ForestEntranceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const audioManager = useAudioManager();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const [message, setMessage] = useState<string | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  function goBack() {
    audioManager.playSoundEffect("footstep", { maxDurationMs: 4000 });
    router.replace({ pathname: "/outside-tavern", params: { returnTo: params.returnTo ?? "kitchen" } });
  }

  return (
    <View style={styles.root}>
      <SceneBackground source={BACKGROUND} topOffset={headerHeight} />
      <View style={[StyleSheet.absoluteFill, { top: headerHeight }, styles.overlay]} pointerEvents="none" />
      <TravelHeader locationName="Forest Entrance" showPortraitRow onHeaderHeightChange={setHeaderHeight} />

      <View style={[styles.actionArea, { paddingBottom: insets.bottom + 18 }]}>
        {message && <Text style={styles.message}>{message}</Text>}
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => setMessage("The forest itself is not available yet.")}
          activeOpacity={0.8}
        >
          <Ionicons name="leaf" size={22} color="#D5A746" />
          <Text style={styles.actionText}>Enter</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={goBack} activeOpacity={0.8}>
          <Ionicons name="return-up-back" size={22} color="#D5A746" />
          <Text style={styles.actionText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0500" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.16)" },
  actionArea: {
    position: "absolute", left: 16, right: 16, bottom: 0, gap: 10,
    borderRadius: 18, borderWidth: 1.5, borderColor: "rgba(196,148,58,0.48)",
    backgroundColor: "rgba(18,9,2,0.90)", paddingHorizontal: 14, paddingTop: 14,
  },
  actionButton: {
    minHeight: 54, borderRadius: 12, borderWidth: 1, borderColor: "rgba(196,148,58,0.38)",
    backgroundColor: "rgba(48,27,7,0.82)", flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 10,
  },
  actionText: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 16 },
  message: {
    color: "#F5E6C8", textAlign: "center", backgroundColor: "rgba(72,46,10,0.80)",
    borderRadius: 9, paddingHorizontal: 10, paddingVertical: 9,
  },
});
