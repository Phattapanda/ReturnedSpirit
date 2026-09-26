import { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";

/** Decorative only: never intercepts the purchase button's touches. */
export default function PurchaseIconShine({ delay = 1000 }: { delay?: number }) {
  const progress = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  useFocusEffect(useCallback(() => {
    progress.value = 0;
    if (!reduceMotion) {
      progress.value = withDelay(delay, withRepeat(withSequence(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 0 }),
        withDelay(4100, withTiming(0, { duration: 0 })),
      ), -1));
    }
    return () => { cancelAnimation(progress); progress.value = 0; };
  }, [delay, progress, reduceMotion]));
  const movingStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -45 + progress.value * 145 }, { rotate: "-24deg" }],
    opacity: Math.sin(progress.value * Math.PI) * 0.65,
  }));
  return (
    <View pointerEvents="none" accessible={false} style={styles.clip}>
      <Animated.View style={[styles.streak, movingStyle]}>
        <LinearGradient
          colors={["rgba(255,231,177,0)", "rgba(255,231,177,0.24)", "rgba(255,255,255,0.85)", "rgba(255,241,211,0.24)", "rgba(255,231,177,0)"]}
          locations={[0, 0.28, 0.5, 0.72, 1]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, borderRadius: 30, overflow: "hidden" },
  streak: { position: "absolute", left: 0, top: -20, width: 25, height: 104 },
});
