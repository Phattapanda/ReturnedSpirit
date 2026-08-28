import React from "react";
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ImageSourcePropType,
} from "react-native";

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
    <View style={styles.overlay} pointerEvents="auto">
      <View style={styles.figureArea} pointerEvents="none">
        <Image source={image} style={styles.figure} resizeMode="contain" resizeMethod="resize" />
      </View>
      <TouchableOpacity
        style={styles.dialog}
        activeOpacity={0.9}
        disabled={busy}
        onPress={onContinue}
        accessibilityRole="button"
        accessibilityLabel="Continue Civil Servant dialog"
      >
        <Text style={styles.speaker}>Civil Servant</Text>
        <Text style={styles.text}>{text}</Text>
        <Text style={styles.continueText}>{busy ? "..." : "Tap to continue"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1500,
    backgroundColor: "rgba(0,0,0,0.20)",
    justifyContent: "flex-end",
  },
  figureArea: {
    position: "absolute",
    top: "25%",
    left: "8%",
    right: "8%",
    bottom: 190,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  figure: { width: "92%", height: "100%" },
  dialog: {
    marginHorizontal: 18,
    marginBottom: 86,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#B88935",
    backgroundColor: "rgba(247,237,207,0.98)",
    paddingHorizontal: 22,
    paddingVertical: 18,
    minHeight: 142,
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 12,
    elevation: 18,
  },
  speaker: { color: "#6E4218", fontFamily: "Oldenburg", fontSize: 17, marginBottom: 9 },
  text: { color: "#25170E", fontSize: 17, lineHeight: 25 },
  continueText: { color: "#8A6738", fontSize: 11, textAlign: "right", marginTop: 10 },
});
