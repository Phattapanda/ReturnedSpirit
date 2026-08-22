import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type GuestTutorialDialogLine = {
  speaker: string;
  text: string;
  portrait: ReturnType<typeof require>;
  playerPortrait?: boolean;
};

type Props = {
  visible: boolean;
  line: GuestTutorialDialogLine | null;
  onContinue: () => void;
};

/**
 * Portrait-dialog presentation for the guest tutorial.
 * It intentionally matches the standard story-dialog portrait size and crop.
 */
export default function GuestTutorialDialog({ visible, line, onContinue }: Props) {
  const insets = useSafeAreaInsets();
  if (!visible || !line) return null;

  return (
    <View style={styles.blocker}>
      <View style={[styles.panel, { paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.portraitWrap}>
          <Image
            source={line.portrait}
            style={[styles.portrait, line.playerPortrait ? styles.playerPortrait : styles.npcPortrait]}
            resizeMode="cover"
            resizeMethod="resize"
          />
        </View>
        <Text style={styles.speaker}>{line.speaker}</Text>
        <View style={styles.dialogBox}>
          <Text style={styles.dialogText}>{line.text}</Text>
        </View>
        <TouchableOpacity style={styles.continueBtn} onPress={onContinue} activeOpacity={0.8}>
          <Text style={styles.continueText}>Continue</Text>
          <Ionicons name="chevron-forward" size={16} color="#F5E6C8" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  blocker: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 500,
    backgroundColor: "rgba(0,0,0,0.48)",
    justifyContent: "flex-end",
  },
  panel: {
    position: "relative",
    backgroundColor: "rgba(20,10,3,0.98)",
    borderTopWidth: 1.5,
    borderTopColor: "rgba(196,148,58,0.55)",
    paddingHorizontal: 18,
    paddingTop: 76,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.55,
    shadowRadius: 12,
    elevation: 24,
  },
  portraitWrap: {
    position: "absolute",
    top: -62,
    width: 124,
    height: 124,
    borderRadius: 62,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "#C4943A",
    backgroundColor: "#2C1810",
  },
  portrait: { width: "100%", height: "100%" },
  playerPortrait: { transform: [{ scale: 1.06 }] },
  npcPortrait: { transform: [{ scale: 1.06 }] },
  speaker: {
    color: "#C4943A",
    fontFamily: "Oldenburg",
    fontSize: 15,
    letterSpacing: 1.2,
    marginTop: 2,
    marginBottom: 6,
  },
  dialogBox: {
    width: "100%",
    minHeight: 62,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(196,148,58,0.28)",
    backgroundColor: "rgba(255,255,255,0.035)",
    paddingHorizontal: 14,
    paddingVertical: 11,
    justifyContent: "center",
  },
  dialogText: {
    color: "#F0E8D5",
    fontFamily: "RobotoRegular",
    fontSize: 16,
    lineHeight: 25,
    textAlign: "center",
  },
  continueBtn: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minWidth: 132,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(196,148,58,0.42)",
    backgroundColor: "rgba(196,148,58,0.16)",
  },
  continueText: {
    color: "#F5E6C8",
    fontFamily: "Oldenburg",
    fontSize: 13,
  },
});
