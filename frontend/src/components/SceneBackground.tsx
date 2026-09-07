import React from "react";
import { View, StyleSheet } from "react-native";
import type { ImageSourcePropType, StyleProp, ViewStyle } from "react-native";
import { Image } from "expo-image";

interface Props {
  source: ImageSourcePropType;
  /** Pixels from top to start image (use measured header height). Defaults to 0. */
  topOffset?: number;
  style?: StyleProp<ViewStyle>;
}

export default function SceneBackground({ source, topOffset = 0, style }: Props) {
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { top: topOffset, overflow: "hidden" },
        style,
      ]}
      pointerEvents="none"
    >
      <Image
        source={source}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition="top center"
        transition={0}
      />
    </View>
  );
}
