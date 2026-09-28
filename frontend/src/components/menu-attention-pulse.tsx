import { useEffect, type ReactNode } from "react";
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from "react-native-reanimated";

export default function MenuAttentionPulse({ active, children }: { active: boolean; children: ReactNode }) {
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();
  useEffect(() => {
    scale.value = active && !reduced
      ? withSequence(withTiming(1.12, { duration: 320 }), withTiming(1, { duration: 400 }))
      : 1;
    return () => { cancelAnimation(scale); scale.value = 1; };
  }, [active, reduced, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
