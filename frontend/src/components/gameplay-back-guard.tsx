import React, { useCallback, useEffect, useState } from "react";
import { BackHandler, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useAudioManager } from "@/src/audio/AudioProvider";
import { discardRuntimeAndRestore } from "@/src/game/save-manager";

const GUARDED_GAMEPLAY_ROUTES = new Set([
  "/intro",
  "/kitchen",
  "/garden",
  "/dining",
  "/dormitory",
  "/mail",
  "/outside-tavern",
  "/next-city",
  "/coachman-escort",
  "/forest-entrance",
]);

let gameplayBackBlocked = false;

/** Blocks the physical Back button during a flow that must not be left. */
export function setGameplayBackBlocked(blocked: boolean): void {
  gameplayBackBlocked = blocked;
}

export default function GameplayBackGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const audioManager = useAudioManager();
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [returning, setReturning] = useState(false);
  const guarded = GUARDED_GAMEPLAY_ROUTES.has(pathname);

  useEffect(() => {
    setConfirmationVisible(false);
    setReturning(false);
  }, [pathname]);

  useEffect(() => {
    if (!guarded || process.env.EXPO_OS === "web") return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (gameplayBackBlocked) return true;
      setConfirmationVisible(true);
      return true;
    });
    return () => subscription.remove();
  }, [guarded]);

  const returnToMainMenu = useCallback(async () => {
    if (returning || gameplayBackBlocked) return;
    setReturning(true);
    audioManager.stopGameplayMusic(700);
    try {
      const rawSlot = await AsyncStorage.getItem("@game:active_slot");
      if (rawSlot) await discardRuntimeAndRestore(Number.parseInt(rawSlot, 10));
    } catch {
      // Returning to the menu must remain possible even if restoring fails.
    }
    setConfirmationVisible(false);
    if (router.canGoBack()) router.dismissAll();
    else router.replace("/");
  }, [audioManager, returning, router]);

  return (
    <Modal
      visible={confirmationVisible && guarded && !gameplayBackBlocked}
      transparent
      animationType="fade"
      onRequestClose={() => { if (!returning) setConfirmationVisible(false); }}
    >
      <View style={styles.backdrop}>
        <View style={styles.panel}>
          <Text selectable style={styles.title}>Do you want to return to the main menu?</Text>
          <Text selectable style={styles.warning}>Unsaved changes will be lost.</Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.noButton]}
              disabled={returning}
              onPress={() => setConfirmationVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>No</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.yesButton, returning && styles.disabled]}
              disabled={returning}
              onPress={() => { void returnToMainMenu(); }}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>Yes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.78)",
  },
  panel: {
    width: "100%",
    maxWidth: 380,
    gap: 14,
    padding: 22,
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.58)",
    backgroundColor: "#160B03",
  },
  title: {
    color: "#F5E6C8",
    fontFamily: "Oldenburg",
    fontSize: 18,
    lineHeight: 26,
    textAlign: "center",
  },
  warning: {
    color: "rgba(240,232,213,0.72)",
    fontFamily: "RobotoRegular",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  actions: { flexDirection: "row", gap: 10, paddingTop: 4 },
  button: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  noButton: { borderColor: "rgba(196,148,58,0.42)", backgroundColor: "rgba(196,148,58,0.12)" },
  yesButton: { borderColor: "rgba(181,73,51,0.82)", backgroundColor: "rgba(98,28,18,0.88)" },
  buttonText: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 14 },
  disabled: { opacity: 0.5 },
});
