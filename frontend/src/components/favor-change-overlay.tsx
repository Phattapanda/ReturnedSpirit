import { useEffect, useRef, useState } from "react";
import { Animated, Image, StyleSheet, View } from "react-native";

import {
  subscribeFavorChangeFeedback,
  type FavorChangeFeedback,
  type FavorChangeFeedbackKind,
} from "@/src/game/guest-system";

const FAVOR_IMAGES = {
  increase: require("../../assets/images/favor_increase.png"),
  big_increase: require("../../assets/images/favor_big_increase.png"),
  stage_increase: require("../../assets/images/favor_stage_increase.png"),
  decrease: require("../../assets/images/favor_decrease.png"),
} satisfies Record<FavorChangeFeedbackKind, number>;

type QueuedFeedback = FavorChangeFeedback & { eventId: number };

export default function FavorChangeOverlay() {
  const nextEventId = useRef(0);
  const [queue, setQueue] = useState<QueuedFeedback[]>([]);
  const [activeFeedback, setActiveFeedback] = useState<QueuedFeedback | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.72)).current;
  const translateY = useRef(new Animated.Value(14)).current;

  useEffect(() => subscribeFavorChangeFeedback((feedback) => {
    nextEventId.current += 1;
    setQueue((current) => [...current, { ...feedback, eventId: nextEventId.current }]);
  }), []);

  useEffect(() => {
    if (activeFeedback || queue.length === 0) return;
    setActiveFeedback(queue[0]);
    setQueue((current) => current.slice(1));
  }, [activeFeedback, queue]);

  useEffect(() => {
    if (!activeFeedback) return;

    opacity.setValue(0);
    scale.setValue(0.72);
    translateY.setValue(14);
    const animation = Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, damping: 12, stiffness: 190, mass: 0.7, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 160, useNativeDriver: true }),
      ]),
      Animated.delay(780),
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.9, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -12, duration: 180, useNativeDriver: true }),
      ]),
    ]);
    animation.start(({ finished }) => {
      if (finished) setActiveFeedback(null);
    });

    return () => animation.stop();
  }, [activeFeedback, opacity, scale, translateY]);

  if (!activeFeedback) return null;

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <Animated.View style={[styles.imageWrap, { opacity, transform: [{ translateY }, { scale }] }]}>
        <Image source={FAVOR_IMAGES[activeFeedback.kind]} style={styles.image} resizeMode="contain" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 5000,
    elevation: 5000,
    alignItems: "center",
    justifyContent: "center",
  },
  imageWrap: {
    width: 132,
    height: 132,
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
});
