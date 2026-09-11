import React from "react";
import { StyleSheet, Text, TouchableOpacity, View, type ImageSourcePropType } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import CharacterDialogFrame from "@/src/components/character-dialog-frame";

export type StoryDialogLine = {
  speaker?: string;
  text: string;
  portrait?: ImageSourcePropType;
  playerPortrait?: boolean;
  characterScale?: number;
  characterAspectRatio?: number;
  highlightedPhrases?: readonly string[];
};

export type StoryDialogChoice = { label: string; onPress: () => void };

type Props = {
  visible: boolean;
  line: StoryDialogLine | null;
  choices?: readonly StoryDialogChoice[];
  onContinue?: () => void;
  onSkip?: () => void;
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

export default function StoryDialogOverlay({ visible, line, choices = [], onContinue, onSkip }: Props) {
  if (!visible || !line) return null;
  const actions = choices.length > 0
    ? <View style={styles.choiceRow}>{choices.map((choice) => <TouchableOpacity key={choice.label} style={styles.choiceButton} onPress={choice.onPress} activeOpacity={0.8}><Text style={styles.choiceText}>{choice.label}</Text></TouchableOpacity>)}</View>
    : onContinue
      ? <TouchableOpacity style={styles.continueButton} onPress={onContinue} activeOpacity={0.8}><Text style={styles.continueText}>Continue</Text><Ionicons name="chevron-forward" size={16} color="#F5E6C8" style={styles.continueIcon} /></TouchableOpacity>
      : null;
  return <CharacterDialogFrame visible={visible} characterSource={line.portrait} playerCharacter={line.playerPortrait} characterScale={line.characterScale} characterAspectRatio={line.characterAspectRatio} speakerName={line.speaker} onSkip={onSkip} actions={actions}>
    <RichText line={line} />
  </CharacterDialogFrame>;
}

const styles = StyleSheet.create({
  dialogText: { color: "#F0E8D5", fontFamily: "RobotoRegular", fontSize: 16, lineHeight: 25, textAlign: "center" }, highlight: { color: "#EF4B43", fontWeight: "900" },
  continueButton: { width: "100%", minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 11, borderWidth: 1, borderColor: "rgba(196,148,58,0.42)", backgroundColor: "rgba(196,148,58,0.16)", paddingHorizontal: 18 },
  continueText: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 13 },
  continueIcon: { position: "absolute", right: 18 },
  choiceRow: { width: "100%", flexDirection: "row", gap: 10 }, choiceButton: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 11, borderWidth: 1, borderColor: "rgba(196,148,58,0.48)", backgroundColor: "rgba(83,48,10,0.9)" }, choiceText: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 14 },
});
