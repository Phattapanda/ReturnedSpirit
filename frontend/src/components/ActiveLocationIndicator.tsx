import React from "react";
import { Image, StyleSheet, useWindowDimensions, View } from "react-native";
import { usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const LOCATION_ROUTES = {
  "/kitchen": {
    index: 0,
    image: require("../../assets/images/gotokitchen.png"),
  },
  "/garden": {
    index: 1,
    image: require("../../assets/images/gotogarden.png"),
  },
  "/dining": {
    index: 2,
    image: require("../../assets/images/gotodining.png"),
  },
  "/dormitory": {
    index: 3,
    image: require("../../assets/images/gotodormitory.png"),
  },
} as const;

export default function ActiveLocationIndicator() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const location = LOCATION_ROUTES[pathname as keyof typeof LOCATION_ROUTES];

  if (!location) return null;

  // All room navigation bars use 8px horizontal padding and five 5px gaps.
  const buttonWidth = Math.max(0, (width - 16 - 25) / 6);
  const left = 8 + location.index * (buttonWidth + 5);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.currentLocation,
        {
          left,
          width: buttonWidth,
          bottom: insets.bottom + 4,
        },
      ]}
    >
      <Image
        source={location.image}
        style={styles.currentLocationImage}
        resizeMode="contain"
        resizeMethod="resize"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  currentLocation: {
    position: "absolute",
    height: 54,
    zIndex: 80,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#FFF4D6",
    backgroundColor: "rgba(214, 163, 58, 0.48)",
    shadowColor: "#E8B84B",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.34,
    shadowRadius: 5,
    elevation: 7,
  },
  currentLocationImage: {
    width: 42,
    height: 42,
  },
});
