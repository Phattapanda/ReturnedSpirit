import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useAudioManager } from "@/src/audio/AudioProvider";

const BG = require("../assets/images/bg-tavern.jpg");

type VibrationMode = "off" | "light" | "medium" | "strong";

const VIB_MODES: VibrationMode[] = ["off", "light", "medium", "strong"];
const VIB_LABELS: Record<VibrationMode, string> = {
  off: "Off", light: "Light", medium: "Medium", strong: "Strong",
};

const VOLUME_STEPS = [0, 25, 50, 75, 100];

export default function Settings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { musicVolume, sfxVolume, setMusicVolume, setSfxVolume, playSoundEffect, unlockAudio } = useAudioManager();

  const [vibration, setVibration] = useState<VibrationMode>("light");
  const [language] = useState("English");

  useEffect(() => {
    AsyncStorage.getItem("game_settings").then((raw) => {
      if (!raw) return;
      try {
        const s = JSON.parse(raw);
        if (s.vibration) setVibration(s.vibration);
      } catch {}
    });
  }, []);

  const persist = useCallback(async (patch: Record<string, unknown>) => {
    try {
      const raw = await AsyncStorage.getItem("game_settings");
      const s = raw ? JSON.parse(raw) : {};
      await AsyncStorage.setItem("game_settings", JSON.stringify({ ...s, ...patch }));
    } catch {}
  }, []);

  const onMusicVol = (v: number) => {
    setMusicVolume(v);
    persist({ musicVolume: v }).catch(() => {});
  };
  const onSfxVol = (v: number) => {
    unlockAudio();  // ensure audio unlocked before playing
    setSfxVolume(v);
    playSoundEffect('getwater', { maxDurationMs: 3000 });
    persist({ sfxVolume: v }).catch(() => {});
  };

  return (
    <View style={styles.root}>
      <Image source={BG} style={styles.bgImage} resizeMode="cover" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity testID="back-button" style={styles.backBtn} onPress={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/');
        }}>
          <Ionicons name="chevron-back" size={22} color="#2C1810" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>

        {/* Music Volume */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="music-note" size={20} color="#C4943A" />
            <Text style={styles.sectionTitle}>Music Volume</Text>
            <Text testID="music-volume-value" style={styles.sectionValue}>{musicVolume}%</Text>
          </View>
          <View style={styles.toggleRow}>
            {VOLUME_STEPS.map((v) => (
              <TouchableOpacity
                key={v}
                testID={`music-volume-${v}`}
                style={[styles.toggleBtn, musicVolume === v && styles.toggleBtnActive]}
                onPress={() => onMusicVol(v)}
              >
                <Text style={[styles.toggleText, musicVolume === v && styles.toggleTextActive]}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* SFX Volume */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="volume-high" size={20} color="#C4943A" />
            <Text style={styles.sectionTitle}>Sound Effects</Text>
            <Text testID="sfx-volume-value" style={styles.sectionValue}>{sfxVolume}%</Text>
          </View>
          <View style={styles.toggleRow}>
            {VOLUME_STEPS.map((v) => (
              <TouchableOpacity
                key={v}
                testID={`sfx-volume-${v}`}
                style={[styles.toggleBtn, sfxVolume === v && styles.toggleBtnActive]}
                onPress={() => onSfxVol(v)}
              >
                <Text style={[styles.toggleText, sfxVolume === v && styles.toggleTextActive]}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Vibration */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="vibrate" size={20} color="#C4943A" />
            <Text style={styles.sectionTitle}>Vibration</Text>
            <Text testID="vibration-value" style={styles.sectionValue}>{VIB_LABELS[vibration]}</Text>
          </View>
          <View style={styles.toggleRow}>
            {VIB_MODES.map((m) => (
              <TouchableOpacity
                key={m}
                testID={`vibration-${m}`}
                style={[styles.toggleBtn, vibration === m && styles.toggleBtnActive]}
                onPress={() => { setVibration(m); persist({ vibration: m }).catch(() => {}); }}
              >
                <Text style={[styles.toggleText, vibration === m && styles.toggleTextActive]}>
                  {VIB_LABELS[m]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Language */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="translate" size={20} color="#C4943A" />
            <Text style={styles.sectionTitle}>Language</Text>
            <Text testID="language-value" style={styles.sectionValue}>{language}</Text>
          </View>
          <Text style={styles.comingSoon}>More languages coming soon.</Text>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F0EDE4" },
  bgImage: { ...StyleSheet.absoluteFillObject, opacity: 0.10 },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.07)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: {
    flex: 1, textAlign: "center", fontSize: 22,
    fontWeight: "700", color: "#2C1810", fontFamily: "Oldenburg",
  },
  content: { paddingHorizontal: 16, gap: 16 },
  section: {
    backgroundColor: "rgba(255,255,255,0.65)",
    borderRadius: 16, padding: 16, gap: 12,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: {
    flex: 1, fontSize: 16, fontWeight: "700",
    color: "#2C1810", fontFamily: "Oldenburg",
  },
  sectionValue: { fontSize: 15, color: "#C4614A", fontWeight: "600" },
  toggleRow: { flexDirection: "row", gap: 8 },
  toggleBtn: {
    flex: 1, height: 38, borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(0,0,0,0.08)",
  },
  toggleBtnActive: { backgroundColor: "#6B7C55", borderColor: "#6B7C55" },
  toggleText: { fontSize: 14, color: "#2C1810", fontWeight: "500" },
  toggleTextActive: { color: "#FFF", fontWeight: "700" },
  comingSoon: { fontSize: 13, color: "#8B7355", fontStyle: "italic" },
});
