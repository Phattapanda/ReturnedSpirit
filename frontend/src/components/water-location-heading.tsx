import { Text, View } from "react-native";
import { Image } from "expo-image";
import { useWaterStorage } from "@/src/hooks/use-water-storage";

export default function WaterLocationHeading({ name }: { name: string }) {
  const water = useWaterStorage();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, gap: 6 }}>
      <View style={{ flex: 1 }} />
      <Text style={{ color: "#F0E8D5", fontSize: 15, fontFamily: "Oldenburg", letterSpacing: 1, textAlign: "center" }}>{name}</Text>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4 }} accessibilityLabel={`Water in Garden Storage: ${water.amount} liters`}>
        <Image source={require("../../assets/images/water.png")} style={{ width: 20, height: 22 }} contentFit="contain" />
        <Text selectable style={{ color: "#F0E8D5", fontSize: 12, fontFamily: "Oldenburg", fontVariant: ["tabular-nums"] }}>{water.amount} L</Text>
      </View>
    </View>
  );
}
