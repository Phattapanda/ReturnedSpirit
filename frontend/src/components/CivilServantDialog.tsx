import React from "react";
import { StyleSheet, Text, TouchableOpacity, type ImageSourcePropType } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import CharacterDialogFrame from "@/src/components/character-dialog-frame";

type Props = {
  visible: boolean;
  image: ImageSourcePropType;
  text: string;
  busy?: boolean;
  onContinue: () => void;
};

export default function CivilServantDialog({ visible, image, text, busy = false, onContinue }: Props) {
  if (!visible) return null;
  return (
    <CharacterDialogFrame
      visible
      characterSource={image}
      speakerName="Civil Servant"
      actions={(
        <TouchableOpacity style={[styles.continueButton, busy && styles.disabled]} disabled={busy} onPress={onContinue} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Continue Civil Servant dialog">
          <Text style={styles.continueText}>{busy ? "..." : "Continue"}</Text>
          {!busy ? <Ionicons name="chevron-forward" size={16} color="#F5E6C8" style={styles.continueIcon} /> : null}
        </TouchableOpacity>
      )}
    >
      <Text selectable style={styles.text}>{text}</Text>
    </CharacterDialogFrame>
  );
}

const styles = StyleSheet.create({
  text: { color: "#F0E8D5", fontSize: 16, lineHeight: 25, textAlign: "center" },
  continueButton: { width: "100%", minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 11, borderWidth: 1, borderColor: "rgba(196,148,58,0.42)", backgroundColor: "rgba(196,148,58,0.16)" },
  continueText: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 13 },
  continueIcon: { position: "absolute", right: 18 },
  disabled: { opacity: 0.48 },
});
