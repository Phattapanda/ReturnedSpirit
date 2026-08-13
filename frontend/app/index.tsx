import React, { useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Image,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAudioManager } from "@/src/audio/AudioProvider";
import { audioEngine } from "@/src/audio/audioEngine";

const BG = require("../assets/images/mainpage.webp");

// Original image dimensions – used to compute proportional height
const IMG_W = 923;
const IMG_H = 2000;

const MENU_ITEMS = [
  { id: "new-game", label: "New Game", icon: "sword-cross" as const },
  { id: "load-game", label: "Load Game", icon: "bookmark-multiple-outline" as const },
  { id: "settings", label: "Settings", icon: "cog-outline" as const },
  { id: "support", label: "Support", icon: "email-outline" as const },
];

export default function MainMenu() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const imgHeight = (IMG_H / IMG_W) * width;

  // Audio: play main menu theme immediately when arriving at main menu (no crossfade)
  // We use audioEngine directly so we can await unlockAudio() before crossfadeTo.
  // On native (Expo Go / device) there are no browser autoplay restrictions, so
  // unlocking on mount is correct and starts the theme right away.
  const audioManager = useAudioManager();
  useEffect(() => {
    (async () => {
      await audioEngine.unlockAudio();
      audioEngine.crossfadeTo('main-menu', 0);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        style={{ position: "absolute", top: 0, left: 0, width, height: imgHeight }}
        resizeMode="stretch" resizeMethod="resize"
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#1a0d05", overflow: "hidden" },
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
