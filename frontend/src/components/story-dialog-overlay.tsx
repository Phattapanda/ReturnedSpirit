import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View, type ImageSourcePropType } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type StoryDialogLine = {
  speaker?: string;
  text: string;
  portrait?: ImageSourcePropType;
  playerPortrait?: boolean;
  highlightedPhrases?: readonly string[];
};

export type StoryDialogChoice = { label: string; onPress: () => void };

type Props = {
  visible: boolean;
  line: StoryDialogLine | null;
  choices?: readonly StoryDialogChoice[];
  onContinue?: () => void;
};

function RichText({ line }: { line: StoryDialogLine }) {
  const phrases = line.highlightedPhrases ?? [];
  if (!phrases.length) return <Text selectable style={styles.dialogText}>{line.text}</Text>;
  const matcher = new RegExp(`(${phrases.map((phrase) => phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return <Text selectable style={styles.dialogText}>{line.text.split(matcher).map((part, index) => {
    const highlighted = phrases.some((phrase) => phrase.toLocaleLowerCase() === part.toLocaleLowerCase());
    return <Text key={`${index}-${part}`} style={highlighted ? styles.highlight : undefined}>{part}</Text>;
  })}</Text>;
}

export default function StoryDialogOverlay({ visible, line, choices = [], onContinue }: Props) {
  const insets = useSafeAreaInsets();
  if (!visible || !line) return null;
  return <View style={styles.blocker}>
    <View style={[styles.panel, { paddingBottom: insets.bottom + 18, paddingTop: line.portrait ? 76 : 20 }]}>
      {line.portrait ? <View style={styles.portraitWrap}><Image source={line.portrait} style={[styles.portrait, line.playerPortrait && styles.playerPortrait]} resizeMode="cover" /></View> : null}
      {line.speaker ? <Text selectable style={styles.speaker}>{line.speaker}</Text> : <Text style={styles.narrationLabel}>• • •</Text>}
      <View style={styles.dialogBox}><RichText line={line} /></View>
      {choices.length > 0 ? <View style={styles.choiceRow}>{choices.map((choice) => <TouchableOpacity key={choice.label} style={styles.choiceButton} onPress={choice.onPress} activeOpacity={0.8}><Text style={styles.choiceText}>{choice.label}</Text></TouchableOpacity>)}</View> : onContinue ? <TouchableOpacity style={styles.continueButton} onPress={onContinue} activeOpacity={0.8}><Text style={styles.continueText}>Continue</Text><Ionicons name="chevron-forward" size={16} color="#F5E6C8" /></TouchableOpacity> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  blocker: { ...StyleSheet.absoluteFillObject, zIndex: 900, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "flex-end" },
  panel: { position: "relative", alignItems: "center", gap: 8, paddingHorizontal: 18, backgroundColor: "rgba(20,10,3,0.99)", borderTopWidth: 1.5, borderTopColor: "rgba(196,148,58,0.62)" },
  portraitWrap: { position: "absolute", top: -62, width: 124, height: 124, borderRadius: 62, overflow: "hidden", borderWidth: 3, borderColor: "#C4943A", backgroundColor: "#2C1810" },
  portrait: { width: "100%", height: "100%", transform: [{ scale: 1.06 }] }, playerPortrait: { transform: [{ scale: 1.1 }] },
  speaker: { color: "#C4943A", fontFamily: "Oldenburg", fontSize: 15, letterSpacing: 1.1 }, narrationLabel: { color: "#C4943A", fontSize: 16, letterSpacing: 5 },
  dialogBox: { width: "100%", minHeight: 66, justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: "rgba(196,148,58,0.3)", backgroundColor: "rgba(255,255,255,0.035)", padding: 13 },
  dialogText: { color: "#F0E8D5", fontFamily: "RobotoRegular", fontSize: 16, lineHeight: 25, textAlign: "center" }, highlight: { color: "#EF4B43", fontWeight: "900" },
  continueButton: { minWidth: 132, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 11, borderWidth: 1, borderColor: "rgba(196,148,58,0.42)", backgroundColor: "rgba(196,148,58,0.16)", paddingHorizontal: 18, paddingVertical: 10 },
  continueText: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 13 },
  choiceRow: { width: "100%", flexDirection: "row", gap: 10 }, choiceButton: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 11, borderWidth: 1, borderColor: "rgba(196,148,58,0.48)", backgroundColor: "rgba(83,48,10,0.9)" }, choiceText: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 14 },
});
