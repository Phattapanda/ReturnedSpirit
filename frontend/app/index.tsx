import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Modal,
  Pressable,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAudioManager } from "@/src/audio/AudioProvider";
import { audioEngine, getRandomMainMenuTheme } from "@/src/audio/audioEngine";

const BG = require("../assets/images/mainpage.png");
const STARTUP_MAIN_MENU_THEME = getRandomMainMenuTheme();
// Show once per app session, not each time the player returns to the menu.
let earlyAccessDismissed = false;

const MENU_ITEMS = [
  { id: "new-game", label: "New Game", icon: "sword-cross" as const },
  { id: "load-game", label: "Load Game", icon: "bookmark-multiple-outline" as const },
  { id: "settings", label: "Settings", icon: "cog-outline" as const },
  { id: "support", label: "Support", icon: "email-outline" as const },
];

export default function MainMenu() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [showEarlyAccess, setShowEarlyAccess] = useState(!earlyAccessDismissed);
  function dismissEarlyAccess() {
    earlyAccessDismissed = true;
    setShowEarlyAccess(false);
  }

  // Audio: play the startup's randomly selected main menu theme immediately (no crossfade)
  // We use audioEngine directly so we can await unlockAudio() before crossfadeTo.
  // On native (Expo Go / device) there are no browser autoplay restrictions, so
  // unlocking on mount is correct and starts the theme right away.
  const audioManager = useAudioManager();
  useEffect(() => {
    (async () => {
      await audioEngine.unlockAudio();
      audioEngine.crossfadeTo(STARTUP_MAIN_MENU_THEME, 0);
    })();
  }, []);

  // Unlock audio + navigate on menu item press
  function handleMenuPress(id: string) {
    audioManager.unlockAudio();
    router.push(`/${id}` as any);
  }

  return (
    <View style={styles.root}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <Image
        source={BG}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition="top center"
      />
      <View style={[styles.buttons, { paddingBottom: insets.bottom + 12 }]}>
        {MENU_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.id}
            testID={`main-menu-${item.id}`}
            style={styles.btn}
            onPress={() => handleMenuPress(item.id)}
            activeOpacity={0.75}
          >
            <MaterialCommunityIcons name={item.icon} size={22} color="#C4943A" />
            <Text style={styles.btnText}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.45)" />
          </TouchableOpacity>
        ))}
        <Text testID="version-text" style={styles.version}>
          v0.1 · local save
        </Text>
      </View>
      <Modal visible={showEarlyAccess} transparent animationType="fade" onRequestClose={dismissEarlyAccess}>
        <View style={[styles.noticeOverlay, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
          <Pressable testID="early-access-backdrop" accessibilityRole="button" accessibilityLabel="Close Early Access notice" style={StyleSheet.absoluteFill} onPress={dismissEarlyAccess} />
          <View accessibilityViewIsModal style={styles.noticePanel}>
            <View style={styles.noticeHeader}>
              <Text selectable accessibilityRole="header" style={styles.noticeTitle}>Early Access</Text>
              <Pressable testID="early-access-close" accessibilityRole="button" accessibilityLabel="Close Early Access notice" onPress={dismissEarlyAccess} style={styles.noticeClose}>
                <Text style={styles.noticeCloseText}>×</Text>
              </Pressable>
            </View>
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 16 }}>
              <Text selectable style={styles.noticeText}><Text style={{ fontStyle: "italic" }}>A Returned Spirit</Text> is still in <Text style={{ fontWeight: "700" }}>Early Access</Text> and is actively being developed.</Text>
              <Text selectable style={styles.noticeText}>New content, features and improvements will be added regularly.</Text>
              <Text selectable style={styles.noticeText}>If you encounter any bugs or problems, please let me know using the <Text style={{ fontWeight: "700" }}>Support</Text> button.</Text>
              <Text selectable style={styles.noticeText}>Thank you for playing and helping improve the game! ❤️</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#1a0d05", overflow: "hidden" },
  noticeOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  noticePanel: { width: "100%", maxWidth: 480, maxHeight: "90%", backgroundColor: "#1A0F00", borderColor: "#C4943A", borderWidth: 1.5, borderRadius: 18, padding: 24, gap: 18 },
  noticeHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  noticeTitle: { flex: 1, color: "#C4943A", fontSize: 24, fontWeight: "700", fontFamily: "Oldenburg" },
  noticeClose: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  noticeCloseText: { color: "#F5EDD8", fontSize: 32 },
  noticeText: { color: "#F5EDD8", fontSize: 16, lineHeight: 25 },
  buttons: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    gap: 10,
  },
  btn: {
    backgroundColor: "rgba(15, 8, 2, 0.82)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(180, 140, 60, 0.35)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 16,
  },
  btnText: {
    flex: 1,
    color: "#F5EDD8",
    fontSize: 17,
    fontFamily: "Oldenburg",
    letterSpacing: 0.3,
  },
  version: {
    textAlign: "center",
    color: "rgba(255,255,255,0.38)",
    fontSize: 12,
    marginTop: 2,
  },
});
