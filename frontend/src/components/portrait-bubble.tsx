import React, { useState } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";

type PortraitBubbleProps = {
  anchorX: number;
  screenWidth: number;
  text: string;
  top: number;
  speaker?: string;
  variant?: "speech" | "thought";
};

const EDGE_GAP = 12;
const TAIL_HALF_WIDTH = 11;

/**
 * Content-sized bubble whose outlined tail joins the card without leaving a
 * border line across the opening. Coordinates are relative to its parent.
 */
export default function PortraitBubble({
  anchorX,
  screenWidth,
  text,
  top,
  speaker,
  variant = "thought",
}: PortraitBubbleProps) {
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const isSpeech = variant === "speech";
  const maxWidth = Math.min(screenWidth - EDGE_GAP * 2, isSpeech ? 420 : 360);
  const minWidth = isSpeech ? 156 : 112;
  const fillColor = isSpeech ? "rgba(250,242,218,0.98)" : "rgba(240,230,200,0.98)";
  const borderColor = "rgba(196,148,58,0.62)";

  const bubbleWidth = measuredWidth ?? minWidth;
  const left = Math.max(
    EDGE_GAP,
    Math.min(anchorX - bubbleWidth / 2, screenWidth - bubbleWidth - EDGE_GAP),
  );
  const tailLeft = Math.max(
    12,
    Math.min(anchorX - left - TAIL_HALF_WIDTH, bubbleWidth - TAIL_HALF_WIDTH * 2 - 12),
  );

  function handleLayout(event: LayoutChangeEvent) {
    const width = event.nativeEvent.layout.width;
    if (width > 0 && Math.abs(width - (measuredWidth ?? 0)) > 0.5) setMeasuredWidth(width);
  }

  return (
    <View
      pointerEvents="none"
      style={[
        styles.positioner,
        {
          top,
          left,
          opacity: measuredWidth === null ? 0 : 1,
        },
      ]}
    >
      <View
        onLayout={handleLayout}
        style={[
          styles.card,
          isSpeech ? styles.speechCard : styles.thoughtCard,
          { minWidth, maxWidth, backgroundColor: fillColor, borderColor },
        ]}
      >
        {speaker ? <Text style={styles.speaker}>{speaker}</Text> : null}
        <Text style={isSpeech ? styles.speechText : styles.thoughtText}>{text}</Text>
      </View>

      <View style={[styles.tailBorder, { left: tailLeft, borderBottomColor: borderColor }]} />
      <View style={[styles.tailFill, { left: tailLeft + 2, borderBottomColor: fillColor }]} />
      <View style={[styles.tailBridge, { left: tailLeft + 2, backgroundColor: fillColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  positioner: {
    position: "absolute",
    zIndex: 30,
    alignItems: "flex-start",
  },
  card: {
    borderWidth: 1.5,
    borderRadius: 14,
    borderCurve: "continuous",
    paddingHorizontal: 16,
    boxShadow: "0 4px 10px rgba(0,0,0,0.34)",
    zIndex: 1,
  },
  speechCard: {
    paddingTop: 12,
    paddingBottom: 14,
    gap: 6,
  },
  thoughtCard: {
    paddingVertical: 11,
  },
  speaker: {
    color: "#7A4800",
    fontSize: 14,
    fontFamily: "Oldenburg",
    letterSpacing: 0.8,
  },
  speechText: {
    color: "#2A1000",
    fontSize: 16,
    lineHeight: 23,
    fontFamily: "RobotoRegular",
    flexShrink: 1,
  },
  thoughtText: {
    color: "#2A1000",
    fontSize: 15,
    lineHeight: 22,
    fontFamily: "RobotoItalic",
    flexShrink: 1,
  },
  tailBorder: {
    position: "absolute",
    top: -12,
    width: 0,
    height: 0,
    borderStyle: "solid",
    borderLeftWidth: 11,
    borderRightWidth: 11,
    borderBottomWidth: 12,
    borderTopWidth: 0,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    zIndex: 2,
  },
  tailFill: {
    position: "absolute",
    top: -8,
    width: 0,
    height: 0,
    borderStyle: "solid",
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 10,
    borderTopWidth: 0,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    zIndex: 3,
  },
  tailBridge: {
    position: "absolute",
    top: -1,
    width: 18,
    height: 4,
    zIndex: 4,
  },
});
