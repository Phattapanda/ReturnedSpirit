import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useHaptics } from "@/src/feedback/haptics-provider";

type Props = {
  visible: boolean;
  busy?: boolean;
  onNewRun: () => void;
  onTakeBreak: () => void;
};

export default function RunEndingOverlay({ visible, busy = false, onNewRun, onTakeBreak }: Props) {
  const { triggerHaptic } = useHaptics();
  const opacity = useRef(new Animated.Value(0)).current;
  const [showDeath, setShowDeath] = useState(false);
  const [showChoice, setShowChoice] = useState(false);

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      setShowDeath(false);
      setShowChoice(false);
      return;
    }
    Animated.timing(opacity, { toValue: 1, duration: 1000, useNativeDriver: true }).start();
    const deathTimer = setTimeout(() => setShowDeath(true), 650);
    const choiceTimer = setTimeout(() => setShowChoice(true), 1700);
    return () => { clearTimeout(deathTimer); clearTimeout(choiceTimer); };
  }, [opacity, visible]);

  if (!visible) return null;
  return (
    <Animated.View style={[styles.overlay, { opacity }]}>
      {showDeath && <Text style={styles.death}>YOU DIED.</Text>}
      {showChoice && (
        <View style={styles.choicePanel}>
          <Text style={styles.question}>Start a new run?</Text>
          <TouchableOpacity style={styles.yesButton} disabled={busy} onPress={() => { triggerHaptic("choice"); onNewRun(); }}>
            <Text style={styles.yesText}>{busy ? "Preparing..." : "YES"}</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={busy} onPress={() => { triggerHaptic("choice"); onTakeBreak(); }}>
            <Text style={styles.breakText}>Take a break.</Text>
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3000,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  death: { color: "#A20B0B", fontSize: 42, letterSpacing: 4, fontWeight: "800", marginBottom: 34 },
  choicePanel: { width: "100%", maxWidth: 360, alignItems: "center", gap: 18 },
  question: { color: "#F0E8D5", fontFamily: "Oldenburg", fontSize: 20 },
  yesButton: {
    minWidth: 170,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#C4943A",
    borderRadius: 12,
    paddingVertical: 13,
    backgroundColor: "rgba(196,148,58,0.18)",
  },
  yesText: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 18 },
  breakText: { color: "#A99B89", fontSize: 16, textDecorationLine: "underline" },
});
