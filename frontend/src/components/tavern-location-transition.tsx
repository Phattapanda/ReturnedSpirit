import React, { useCallback, useState } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { useFocusEffect } from "expo-router";
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

export type TavernLocationId =
  | "kitchen"
  | "garden"
  | "dining"
  | "dormitory"
  | "mail"
  | "outside";

type Props = {
  children: React.ReactNode;
  location: TavernLocationId;
};

const GROUND_FLOOR_ORDER: TavernLocationId[] = [
  "kitchen",
  "garden",
  "dining",
  "mail",
  "outside",
];

const TRANSITION_DURATION_MS = 260;
let lastFocusedLocation: TavernLocationId | null = null;

function getEntryOffset(
  previous: TavernLocationId | null,
  next: TavernLocationId,
  width: number,
  height: number,
) {
  if (!previous || previous === next) return { x: 0, y: 0, animate: false };

  const horizontalDistance = Math.min(280, Math.max(120, width * 0.28));
  const verticalDistance = Math.min(320, Math.max(160, height * 0.22));

  if (next === "dormitory") {
    return { x: 0, y: -verticalDistance, animate: true };
  }

  if (previous === "dormitory") {
    return { x: 0, y: verticalDistance, animate: true };
  }

  const previousIndex = GROUND_FLOOR_ORDER.indexOf(previous);
  const nextIndex = GROUND_FLOOR_ORDER.indexOf(next);
  if (previousIndex < 0 || nextIndex < 0) return { x: 0, y: 0, animate: false };

  return {
    x: nextIndex > previousIndex ? horizontalDistance : -horizontalDistance,
    y: 0,
    animate: true,
  };
}

export default function TavernLocationTransition({ children, location }: Props) {
  const { width, height } = useWindowDimensions();
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);
  const [transitioning, setTransitioning] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const previous = lastFocusedLocation;
      lastFocusedLocation = location;
      const entry = getEntryOffset(previous, location, width, height);

      cancelAnimation(translateX);
      cancelAnimation(translateY);
      cancelAnimation(opacity);
      translateX.value = entry.x;
      translateY.value = entry.y;
      opacity.value = entry.animate ? 0 : 1;

      if (!entry.animate) {
        setTransitioning(false);
        return undefined;
      }

      setTransitioning(true);
      const timing = {
        duration: TRANSITION_DURATION_MS,
        easing: Easing.out(Easing.cubic),
      };
      translateX.value = withTiming(0, timing);
      translateY.value = withTiming(0, timing);
      opacity.value = withTiming(1, timing, (finished) => {
        if (finished) runOnJS(setTransitioning)(false);
      });

      return () => {
        cancelAnimation(translateX);
        cancelAnimation(translateY);
        cancelAnimation(opacity);
      };
    }, [height, location, opacity, translateX, translateY, width]),
  );

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  return (
    <Animated.View
      pointerEvents={transitioning ? "none" : "auto"}
      style={[styles.root, animatedStyle]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0A0500",
    overflow: "hidden",
  },
});
