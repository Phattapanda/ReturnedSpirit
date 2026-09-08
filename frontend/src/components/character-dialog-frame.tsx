import React, { useEffect, useRef, type ReactNode } from "react";
import { Animated, Image as NativeImage, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions, type ImageSourcePropType, type LayoutRectangle } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  characterSource?: ImageSourcePropType;
  playerCharacter?: boolean;
  characterScale?: number;
  speakerName?: string | null;
  onSkip?: () => void;
  children?: ReactNode;
  actions?: ReactNode;
  bottomOffset?: number;
  onCharacterLayout?: (layout: LayoutRectangle) => void;
};

export default function CharacterDialogFrame({
  visible,
  characterSource,
  playerCharacter = false,
  characterScale = 0.8,
  speakerName,
  onSkip,
  children,
  actions,
  bottomOffset = 0,
  onCharacterLayout,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const dimOpacity = useRef(new Animated.Value(0)).current;
  const characterX = useRef(new Animated.Value(playerCharacter ? -width : width)).current;
  const panelOpacity = useRef(new Animated.Value(0)).current;
  const panelY = useRef(new Animated.Value(18)).current;
  const entranceRef = useRef({ playerCharacter, width });
  entranceRef.current = { playerCharacter, width };

  useEffect(() => {
    if (!visible) {
      dimOpacity.setValue(0);
      panelOpacity.setValue(0);
      panelY.setValue(18);
      return;
    }

    const entrance = entranceRef.current;
    characterX.setValue(entrance.playerCharacter ? -entrance.width : entrance.width);
    const animation = Animated.sequence([
      Animated.timing(dimOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(characterX, { toValue: 0, duration: 420, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(panelOpacity, { toValue: 1, duration: 210, useNativeDriver: true }),
        Animated.timing(panelY, { toValue: 0, duration: 210, useNativeDriver: true }),
      ]),
    ]);
    animation.start();
    return () => animation.stop();
  }, [characterX, dimOpacity, panelOpacity, panelY, visible]);

  if (!visible) return null;

  const maximumCharacterHeight = Math.min(height * 0.76, 760) * characterScale;
  const maximumCharacterWidth = Math.min(width * 0.9, 540) * characterScale;
  const resolvedCharacter = characterSource ? NativeImage.resolveAssetSource(characterSource) : null;
  const characterAspectRatio = resolvedCharacter?.width && resolvedCharacter?.height
    ? resolvedCharacter.width / resolvedCharacter.height
    : maximumCharacterWidth / maximumCharacterHeight;
  const characterWidth = Math.min(maximumCharacterWidth, maximumCharacterHeight * characterAspectRatio);
  const characterHeight = characterWidth / characterAspectRatio;
  return (
    <View style={styles.blocker}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dimmer, { opacity: dimOpacity }]} />
      {characterSource ? (
        <Animated.View
          pointerEvents="none"
          onLayout={(event) => onCharacterLayout?.(event.nativeEvent.layout)}
          style={[
            styles.characterLayer,
            playerCharacter ? styles.playerCharacter : styles.npcCharacter,
            { bottom: 0, width: characterWidth, height: characterHeight, transform: [{ translateX: characterX }] },
          ]}
        >
          <Image key={resolvedCharacter?.uri ?? String(characterSource)} source={characterSource} style={styles.characterImage} contentFit="contain" transition={0} cachePolicy="memory-disk" />
        </Animated.View>
      ) : null}
      <Animated.View
        style={[
          styles.panel,
          { paddingBottom: insets.bottom + 14, bottom: bottomOffset, opacity: panelOpacity, transform: [{ translateY: panelY }] },
        ]}
      >
        <View style={styles.metaRow}>
          <Text selectable style={styles.speaker}>{speakerName || "• • •"}</Text>
          {onSkip ? (
            <TouchableOpacity style={styles.skipButton} onPress={onSkip} activeOpacity={0.78} accessibilityRole="button" accessibilityLabel="Skip dialog">
              <Text style={styles.skipText}>Skip</Text>
              <Ionicons name="play-skip-forward" size={14} color="#E1B95F" />
            </TouchableOpacity>
          ) : <View style={styles.skipPlaceholder} />}
        </View>
        {children ? <View style={styles.textWindow}>{children}</View> : null}
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  blocker: { ...StyleSheet.absoluteFill, zIndex: 1900 },
  dimmer: { backgroundColor: "rgba(0,0,0,0.58)" },
  characterLayer: { position: "absolute", zIndex: 1 },
  playerCharacter: { left: -12 },
  npcCharacter: { right: -12 },
  characterImage: { width: "100%", height: "100%" },
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 2,
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: "#160B03",
    borderTopWidth: 1.5,
    borderTopColor: "rgba(196,148,58,0.72)",
  },
  metaRow: { minHeight: 30, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  speaker: { flex: 1, color: "#D9AA4A", fontFamily: "Oldenburg", fontSize: 15, letterSpacing: 1.1, textAlign: "left" },
  skipButton: {
    minWidth: 78,
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(196,148,58,0.52)",
    backgroundColor: "#241306",
    paddingHorizontal: 11,
  },
  skipText: { color: "#E1B95F", fontFamily: "Oldenburg", fontSize: 11 },
  skipPlaceholder: { width: 78 },
  textWindow: {
    width: "100%",
    minHeight: 72,
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(196,148,58,0.38)",
    backgroundColor: "#211105",
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  actions: { width: "100%" },
});
