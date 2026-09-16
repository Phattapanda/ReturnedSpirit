import React, { useEffect, useRef } from "react";
import { Animated, Image, StyleSheet, View } from "react-native";

const ACTIVATION_IMAGE = require("../../assets/images/activate_scroll.png");

type Props = { activationKey: number };

/** Brief, non-interactive flourish shown whenever an equipped scroll spends a use. */
export default function ScrollActivationOverlay({ activationKey }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.72)).current;

  useEffect(() => {
    if (activationKey <= 0) return;
    opacity.stopAnimation();
    scale.stopAnimation();
    opacity.setValue(0);
    scale.setValue(0.72);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 130, useNativeDriver: true }),
        Animated.delay(390),
        Animated.timing(opacity, { toValue: 0, duration: 210, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.spring(scale, { toValue: 1, speed: 22, bounciness: 7, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1.06, duration: 380, useNativeDriver: true }),
      ]),
    ]).start();
    return () => { opacity.stopAnimation(); scale.stopAnimation(); };
  }, [activationKey, opacity, scale]);

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <Animated.View style={[styles.imageWrap, { opacity, transform: [{ scale }] }]}>
        <Image source={ACTIVATION_IMAGE} style={styles.image} resizeMode="contain" resizeMethod="resize" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 850,
    alignItems: "center",
    justifyContent: "center",
  },
  imageWrap: {
    width: "92%",
    maxWidth: 520,
    aspectRatio: 500 / 449,
  },
  image: { width: "100%", height: "100%" },
});
