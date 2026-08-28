import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAudioManager } from "@/src/audio/AudioProvider";
import SceneBackground from "@/src/components/SceneBackground";

const BACKGROUND = require("../assets/images/market.png");
const CITY_LOCATIONS = [
  "Greengrocer",
  "Armor Merchant",
  "Adventurers' Guild",
  "Merchants' Guild",
  "Side Alley",
] as const;

export default function NextCityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const audioManager = useAudioManager();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const [message, setMessage] = useState<string | null>(null);

  function goBack() {
    audioManager.playSoundEffect("footstep", { maxDurationMs: 4000 });
    router.replace({ pathname: "/outside-tavern", params: { returnTo: params.returnTo ?? "kitchen" } });
  }

  return (
    <View style={styles.root}>
      <SceneBackground source={BACKGROUND} />
      <View style={styles.overlay} pointerEvents="none" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 44, paddingBottom: insets.bottom + 28 }]}
        contentInsetAdjustmentBehavior="automatic"
      >
        <Text style={styles.title}>Next City</Text>
        <View style={styles.panel}>
          <Text style={styles.prompt}>Where would you like to go?</Text>
          {CITY_LOCATIONS.map((location) => (
            <TouchableOpacity
              key={location}
              style={styles.locationButton}
              onPress={() => setMessage(`${location} is not available yet.`)}
              activeOpacity={0.8}
            >
              <Text style={styles.locationText}>{location}</Text>
              <Ionicons name="chevron-forward" size={18} color="#C4943A" />
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[styles.locationButton, styles.backButton]} onPress={goBack} activeOpacity={0.8}>
            <Text style={styles.locationText}>Go Back</Text>
            <Ionicons name="return-up-back" size={20} color="#F5E6C8" />
          </TouchableOpacity>
        </View>
        {message && <Text style={styles.message}>{message}</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0500" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.18)" },
  scroll: { flex: 1 },
  content: { flexGrow: 1, justifyContent: "flex-end", paddingHorizontal: 16, gap: 14 },
  title: {
    color: "#FFF7E5", fontFamily: "Oldenburg", fontSize: 24, textAlign: "center",
    textShadowColor: "#000", textShadowRadius: 8,
  },
  panel: {
    borderRadius: 18, borderWidth: 1.5, borderColor: "rgba(196,148,58,0.52)",
    backgroundColor: "rgba(18,9,2,0.92)", padding: 14, gap: 8,
  },
  prompt: { color: "#E4C882", fontFamily: "Oldenburg", fontSize: 15, marginBottom: 4 },
  locationButton: {
    minHeight: 52, borderRadius: 11, borderWidth: 1, borderColor: "rgba(196,148,58,0.28)",
    backgroundColor: "rgba(48,27,7,0.76)", paddingHorizontal: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  backButton: { marginTop: 4, borderColor: "rgba(245,230,200,0.58)" },
  locationText: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 14 },
  message: {
    color: "#F5E6C8", textAlign: "center", backgroundColor: "rgba(18,9,2,0.88)",
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
  },
});
