import React, { useEffect } from "react";
import { Image, StyleSheet, Text, View, useWindowDimensions, type ImageSourcePropType } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";

export default function RecipeDiscoveryAnimation({ name, image }: { name: string; image?: ImageSourcePropType }) {
  const { width } = useWindowDimensions();
  const opacity = useSharedValue(0);
  const scale = useSharedValue(1.18);
  useEffect(() => {
    opacity.value = withTiming(1, { duration: 120 });
    scale.value = withSpring(1, { damping: 14, stiffness: 190 });
    const timer = setTimeout(() => {
      scale.value = withTiming(0.1, { duration: 240 });
      opacity.value = withTiming(0, { duration: 220 });
    }, 1700);
    return () => clearTimeout(timer);
  }, [opacity, scale]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  const size = Math.min(width * 0.48, 190);
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 850, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.20)" }]}>
    <Animated.View style={[{ alignItems: "center", gap: 8 }, animated]}>
      <Text style={{ color: "#F5E6C8", fontSize: 18, fontFamily: "Oldenburg", letterSpacing: 2 }}>NEW RECIPE</Text>
      <View style={{ width: size, height: size, borderRadius: 26, borderWidth: 2, borderColor: "rgba(245,230,200,0.85)", backgroundColor: "rgba(22,11,3,0.86)", padding: 12 }}>
        <Image source={image} resizeMode="contain" style={{ width: "100%", height: "100%" }} />
      </View>
      <Text style={{ color: "#F5E6C8", fontSize: 16, fontFamily: "Oldenburg", textAlign: "center" }}>{name}</Text>
    </Animated.View>
  </View>;
}
