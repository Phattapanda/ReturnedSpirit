import React, { useState } from "react";
import { useManagedTimers } from "@/src/hooks/use-managed-timers";
import { View, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { Text } from "@/src/i18n/localized-text";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Slider from "@react-native-community/slider";

import { useAudioManager } from "@/src/audio/AudioProvider";
import { useHaptics } from "@/src/feedback/haptics-provider";
import { updateGameSettings, type HapticsMode } from "@/src/settings/game-settings";
import { useLanguage } from "@/src/i18n/use-language";

const BG = require("../assets/images/mainpage_1.0.6.webp");

const HAPTICS_MODES: HapticsMode[] = ["off", "light", "medium", "strong"];
const HAPTICS_LABELS = {
  off: "Off", light: "Light", medium: "Medium", strong: "Strong",
} as const;

export default function Settings() {
  const { setManagedTimeout: setTimeout } = useManagedTimers();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { musicVolume, sfxVolume, setMusicVolume, setSfxVolume, playSoundEffect, unlockAudio } = useAudioManager();
  const { hapticsMode, setHapticsMode } = useHaptics();
  const { language, setLanguage, t } = useLanguage();
  const [languagePending, setLanguagePending] = useState(false);
  const [languageError, setLanguageError] = useState(false);

  const saveMusicVolume = (value: number) => {
    updateGameSettings({ musicVolume: Math.round(value) }).catch(() => {});
  };
  const previewAndSaveSfxVolume = (value: number) => {
    const rounded = Math.round(value);
    unlockAudio();  // ensure audio unlocked before playing
    setSfxVolume(rounded);
    setTimeout(() => playSoundEffect('level-up', { maxDurationMs: 3000 }), 120);
    updateGameSettings({ sfxVolume: rounded }).catch(() => {});
  };

  return (
    <View style={styles.root}>
      <Image source={BG} style={styles.bgImage} contentFit="cover" contentPosition="top center" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity testID="back-button" style={styles.backBtn} onPress={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/');
        }}>
          <Ionicons name="chevron-back" size={22} color="#2C1810" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("Settings")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>

        {/* Music Volume */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="music-note" size={20} color="#C4943A" />
            <Text style={styles.sectionTitle}>{t("Music Volume")}</Text>
            <Text testID="music-volume-value" style={styles.sectionValue}>{musicVolume}%</Text>
          </View>
          <Slider
            testID="music-volume-slider"
            value={musicVolume}
            minimumValue={0}
            maximumValue={100}
            step={1}
            onValueChange={setMusicVolume}
            onSlidingComplete={saveMusicVolume}
            minimumTrackTintColor="#6B7C55"
            maximumTrackTintColor="#D7CEBD"
            thumbTintColor="#C4943A"
            accessibilityLabel={t("Music Volume")}
          />
        </View>

        {/* SFX Volume */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="volume-high" size={20} color="#C4943A" />
            <Text style={styles.sectionTitle}>{t("Sound Effects")}</Text>
            <Text testID="sfx-volume-value" style={styles.sectionValue}>{sfxVolume}%</Text>
          </View>
          <Slider
            testID="sfx-volume-slider"
            value={sfxVolume}
            minimumValue={0}
            maximumValue={100}
            step={1}
            onValueChange={setSfxVolume}
            onSlidingComplete={previewAndSaveSfxVolume}
            minimumTrackTintColor="#6B7C55"
            maximumTrackTintColor="#D7CEBD"
            thumbTintColor="#C4943A"
            accessibilityLabel={t("Sound Effects")}
          />
        </View>

        {/* Haptics */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="vibrate" size={20} color="#C4943A" />
            <Text style={styles.sectionTitle}>{t("Haptics")}</Text>
            <Text testID="haptics-value" style={styles.sectionValue}>{t(HAPTICS_LABELS[hapticsMode])}</Text>
          </View>
          <View style={styles.toggleRow}>
            {HAPTICS_MODES.map((mode) => (
              <TouchableOpacity
                key={mode}
                testID={`haptics-${mode}`}
                style={[styles.toggleBtn, hapticsMode === mode && styles.toggleBtnActive]}
                onPress={() => setHapticsMode(mode)}
              >
                <Text style={[styles.toggleText, hapticsMode === mode && styles.toggleTextActive]}>
                  {t(HAPTICS_LABELS[mode])}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.settingHint}>{t("Only important actions: crafting, serving guests, level ups, and story choices.")}</Text>
        </View>

        {/* Language */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="translate" size={20} color="#C4943A" />
            <Text style={styles.sectionTitle}>{t("Language")}</Text>
            <Text testID="language-value" style={styles.sectionValue}>{language === "de" ? "Deutsch" : "English"}</Text>
          </View>
          <View style={styles.toggleRow}>
            {(["en", "de"] as const).map(code => (
              <TouchableOpacity key={code} testID={`language-${code}`} accessibilityRole="button"
                accessibilityState={{ selected: language === code, disabled: languagePending }}
                disabled={languagePending} style={[styles.toggleBtn, language === code && styles.toggleBtnActive]}
                onPress={async () => {
                  setLanguagePending(true); setLanguageError(false);
                  try { await setLanguage(code); } catch { setLanguageError(true); }
                  finally { setLanguagePending(false); }
                }}>
                <Text style={[styles.toggleText, language === code && styles.toggleTextActive]}>{code === "de" ? "Deutsch" : "English"}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {languageError && <Text accessibilityRole="alert" style={styles.settingHint}>{t("Could not save language. Please try again.")}</Text>}
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F0EDE4" },
  bgImage: { ...StyleSheet.absoluteFill, opacity: 0.10 },
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
  settingHint: { fontSize: 12, lineHeight: 17, color: "#8B7355" },
  comingSoon: { fontSize: 13, color: "#8B7355", fontStyle: "italic" },
});
