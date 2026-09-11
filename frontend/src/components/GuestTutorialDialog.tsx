import React from "react";
import { StyleSheet, Text, TouchableOpacity, type ImageSourcePropType } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import CharacterDialogFrame from "@/src/components/character-dialog-frame";

export type GuestTutorialDialogLine = {
  speaker: string;
  text: string;
  portrait: ImageSourcePropType;
  playerPortrait?: boolean;
  characterScale?: number;
  characterAspectRatio?: number;
  highlightedPhrases?: readonly string[];
};

type Props = {
  visible: boolean;
  line: GuestTutorialDialogLine | null;
  onContinue: () => void;
  onSkip?: () => void;
};

type DialogTextSegment = {
  text: string;
  highlighted: boolean;
};

function splitHighlightedText(text: string, phrases: readonly string[] = []): DialogTextSegment[] {
  const searchablePhrases = phrases.filter((phrase) => phrase.length > 0);
  if (searchablePhrases.length === 0) return [{ text, highlighted: false }];

  const lowerText = text.toLocaleLowerCase();
  const segments: DialogTextSegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    let nextStart = -1;
    let nextPhrase = "";

    searchablePhrases.forEach((phrase) => {
      const matchStart = lowerText.indexOf(phrase.toLocaleLowerCase(), cursor);
      if (matchStart >= 0 && (nextStart < 0 || matchStart < nextStart)) {
        nextStart = matchStart;
        nextPhrase = phrase;
      }
    });

    if (nextStart < 0) {
      segments.push({ text: text.slice(cursor), highlighted: false });
      break;
    }
    if (nextStart > cursor) {
      segments.push({ text: text.slice(cursor, nextStart), highlighted: false });
    }
    segments.push({
      text: text.slice(nextStart, nextStart + nextPhrase.length),
      highlighted: true,
    });
    cursor = nextStart + nextPhrase.length;
  }

  return segments;
}

/**
 * Portrait-dialog presentation for the guest tutorial.
 * It intentionally matches the standard story-dialog portrait size and crop.
 */
export default function GuestTutorialDialog({ visible, line, onContinue, onSkip }: Props) {
  if (!visible || !line) return null;

  return (
    <CharacterDialogFrame
      visible={visible}
      characterSource={line.portrait}
      playerCharacter={line.playerPortrait}
      characterScale={line.characterScale}
      characterAspectRatio={line.characterAspectRatio}
      speakerName={line.speaker}
      onSkip={onSkip}
      actions={(
        <TouchableOpacity style={styles.continueBtn} onPress={onContinue} activeOpacity={0.8}>
          <Text style={styles.continueText}>Continue</Text>
          <Ionicons name="chevron-forward" size={16} color="#F5E6C8" style={styles.continueIcon} />
        </TouchableOpacity>
      )}
    >
      <Text style={styles.dialogText}>
            {splitHighlightedText(line.text, line.highlightedPhrases).map((segment, index) => (
              <Text key={`${index}-${segment.text}`} style={segment.highlighted ? styles.requiredStepText : undefined}>
                {segment.text}
              </Text>
            ))}
      </Text>
    </CharacterDialogFrame>
  );
}

const styles = StyleSheet.create({
  dialogText: {
    color: "#F0E8D5",
    fontFamily: "RobotoRegular",
    fontSize: 16,
    lineHeight: 25,
    textAlign: "center",
  },
  requiredStepText: {
    color: "#EF4B43",
    fontWeight: "900",
  },
  continueBtn: {
    width: "100%",
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 18,
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
  continueIcon: { position: "absolute", right: 18 },
});
