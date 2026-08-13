import React from "react";
import { View, Image, StyleSheet, useWindowDimensions } from "react-native";
import type { ImageSourcePropType, StyleProp, ViewStyle } from "react-native";

interface Props {
  source: ImageSourcePropType;
  /** Pixels from top to start image (use measured header height). Defaults to 0. */
  topOffset?: number;
  style?: StyleProp<ViewStyle>;
}

export default function SceneBackground({ source, topOffset = 0, style }: Props) {
  const { width: W, height: H } = useWindowDimensions();

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
        style={{ width: W, height: H }}
        resizeMode="stretch" resizeMethod="resize"
      />
    </View>
  );
}
