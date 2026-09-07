import React from "react";
import { StyleSheet, View } from "react-native";

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

export default function TavernLocationTransition({ children, location: _location }: Props) {
  return <View style={styles.root}>{children}</View>;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0A0500",
    overflow: "hidden",
  },
});
