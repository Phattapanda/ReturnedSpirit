import React, { useCallback, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import SceneBackground from "@/src/components/SceneBackground";
import TavernLocationBar from "@/src/components/tavern-location-bar";
import TravelHeader from "@/src/components/travel-header";
import { useAudioManager } from "@/src/audio/AudioProvider";
import {
  TRAVEL_DESTINATIONS,
  discountedCarriageCost,
  getCoachmanTravelStatus,
  getEffectiveWalkingCost,
  loadTravelState,
  payForCarriage,
  spendWalkingStamina,
  type TavernReturnLocation,
  type TravelDestinationId,
} from "@/src/game/travel-system";

const BACKGROUND = require("../assets/images/outsidetavern1.png");
const COACHMAN = require("../assets/images/coachman.png");
const COIN = require("../assets/images/coin_copper.png");

type TravelMethod = "carriage" | "walk";

function normalizeReturnLocation(value: string | string[] | undefined): TavernReturnLocation {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "garden" || candidate === "dining" || candidate === "mail" ? candidate : "kitchen";
}

export default function OutsideTavernScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const audioManager = useAudioManager();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const returnTo = normalizeReturnLocation(params.returnTo);
  const [destinations, setDestinations] = useState<TravelDestinationId[]>([]);
  const [coachmanAvailable, setCoachmanAvailable] = useState(false);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [walkingCosts, setWalkingCosts] = useState<Record<TravelDestinationId, number>>({ next_city: 30, forest_entrance: 50 });
  const [selection, setSelection] = useState<{ method: TravelMethod; destinationId: TravelDestinationId } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      const [travel, rawDay, nextCityWalk, forestWalk] = await Promise.all([
        loadTravelState(),
        AsyncStorage.getItem("@game:day_index"),
        getEffectiveWalkingCost(TRAVEL_DESTINATIONS.next_city.walkingStaminaCost),
        getEffectiveWalkingCost(TRAVEL_DESTINATIONS.forest_entrance.walkingStaminaCost),
      ]);
      const day = Math.max(0, Number.parseInt(rawDay ?? "0", 10) || 0) % 7;
      const coachman = await getCoachmanTravelStatus(day);
      if (!active) return;
      setDestinations(travel.unlockedDestinations);
      setCoachmanAvailable(coachman.available);
      setDiscountPercent(coachman.discountPercent);
      setWalkingCosts({ next_city: nextCityWalk, forest_entrance: forestWalk });
      setSelection(null);
      setMessage(null);
    })().catch(() => setMessage("Travel information is unavailable."));
    return () => { active = false; };
  }, []));

  async function confirmTravel() {
    if (!selection || busy) return;
    setBusy(true);
    setMessage(null);
    const destination = TRAVEL_DESTINATIONS[selection.destinationId];
    if (selection.method === "carriage") {
      const price = discountedCarriageCost(destination.carriageCostCopper, discountPercent);
      if (!await payForCarriage(price)) {
        setMessage("I don't have enough Copper.");
        setBusy(false);
        return;
      }
    } else {
      const cost = walkingCosts[selection.destinationId];
      const result = await spendWalkingStamina(cost);
      if (!result.ok) {
        setMessage("I don't have enough Stamina.");
        setBusy(false);
        return;
      }
    }
    audioManager.playSoundEffect(selection.method === "carriage" ? "walking-on-wood" : "footstep", { maxDurationMs: 5000 });
    router.push({ pathname: destination.route, params: { returnTo } });
    setBusy(false);
  }

  function destinationButton(destinationId: TravelDestinationId, method: TravelMethod) {
    const destination = TRAVEL_DESTINATIONS[destinationId];
    const selected = selection?.method === method && selection.destinationId === destinationId;
    const cost = method === "carriage"
      ? discountedCarriageCost(destination.carriageCostCopper, discountPercent)
      : walkingCosts[destinationId];
    return (
      <TouchableOpacity
        key={`${method}-${destinationId}`}
        style={[styles.destinationButton, selected && styles.destinationButtonSelected]}
        onPress={() => setSelection({ method, destinationId })}
        activeOpacity={0.8}
      >
        <Text style={styles.destinationName}>{destination.name}</Text>
        <View style={styles.costRow}>
          <Text style={styles.costText}>{cost}</Text>
          {method === "carriage"
            ? <Image source={COIN} style={styles.costIcon} resizeMode="contain" />
            : <Ionicons name="flash" size={15} color="#D6A33B" />}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.root}>
      <SceneBackground source={BACKGROUND} topOffset={headerHeight} />
      <View style={[StyleSheet.absoluteFill, { top: headerHeight }, styles.overlay]} pointerEvents="none" />
      <TravelHeader locationName="Outside the Tavern" showPortraitRow onHeaderHeightChange={setHeaderHeight} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {coachmanAvailable && (
          <View style={styles.panel}>
            <View style={styles.coachmanRow}>
              <View style={styles.coachmanPortraitWrap}>
                <Image source={COACHMAN} style={styles.coachmanPortrait} resizeMode="cover" />
              </View>
              <View style={styles.coachmanText}>
                <Text style={styles.panelTitle}>Where would you like to go?</Text>
                <Text style={styles.panelSubtitle}>Coachman</Text>
                {discountPercent > 0 && <Text style={styles.discount}>{discountPercent}% Favor discount</Text>}
              </View>
            </View>
            <View style={styles.destinationList}>{destinations.map((id) => destinationButton(id, "carriage"))}</View>
          </View>
        )}

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Walk to your destination:</Text>
          <Text style={styles.panelHint}>Walking costs Stamina but is always available.</Text>
          <View style={styles.destinationList}>{destinations.map((id) => destinationButton(id, "walk"))}</View>
        </View>

        {message && <Text style={styles.message}>{message}</Text>}
        <TouchableOpacity
          style={[styles.confirmButton, (!selection || busy) && styles.confirmButtonDisabled]}
          disabled={!selection || busy}
          onPress={() => { void confirmTravel(); }}
          activeOpacity={0.8}
        >
          <Text style={styles.confirmText}>{busy ? "Preparing..." : "Confirm"}</Text>
        </TouchableOpacity>
      </ScrollView>
      <View style={{ paddingBottom: insets.bottom, backgroundColor: "rgba(10,5,1,0.96)" }}>
        <TavernLocationBar current="explore" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0500" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.25)" },
  scroll: { flex: 1, zIndex: 2 },
  content: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 18, gap: 14 },
  panel: {
    borderRadius: 18, borderWidth: 1.5, borderColor: "rgba(196,148,58,0.52)",
    backgroundColor: "rgba(18,9,2,0.93)", padding: 14, gap: 12,
  },
  coachmanRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  coachmanPortraitWrap: {
    width: 92, height: 112, borderRadius: 12, overflow: "hidden", borderWidth: 2,
    borderColor: "#C4943A", backgroundColor: "#2C1810",
  },
  coachmanPortrait: { width: "100%", height: "100%", transform: [{ scale: 1.06 }] },
  coachmanText: { flex: 1, gap: 5 },
  panelTitle: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 16, lineHeight: 23 },
  panelSubtitle: { color: "#C4943A", fontFamily: "Oldenburg", fontSize: 13 },
  panelHint: { color: "rgba(240,232,213,0.68)", fontSize: 12, lineHeight: 18 },
  discount: { color: "#82B96B", fontFamily: "Oldenburg", fontSize: 11 },
  destinationList: { gap: 8 },
  destinationButton: {
    minHeight: 58, borderRadius: 12, borderWidth: 1, borderColor: "rgba(196,148,58,0.28)",
    backgroundColor: "rgba(48,27,7,0.72)", paddingHorizontal: 14, paddingVertical: 10,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  destinationButtonSelected: { borderWidth: 2, borderColor: "#FFFFFF", backgroundColor: "rgba(112,73,18,0.86)" },
  destinationName: { color: "#F0E8D5", fontFamily: "Oldenburg", fontSize: 14 },
  costRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  costText: { color: "#E7C77A", fontFamily: "Oldenburg", fontSize: 13, fontVariant: ["tabular-nums"] },
  costIcon: { width: 17, height: 17 },
  message: {
    color: "#F5D2C8", backgroundColor: "rgba(100,18,10,0.82)", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, textAlign: "center", fontSize: 14,
  },
  confirmButton: {
    minHeight: 54, borderRadius: 13, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#F7E9C9", backgroundColor: "rgba(92,58,14,0.96)",
  },
  confirmButtonDisabled: { opacity: 0.38, borderColor: "rgba(196,148,58,0.45)" },
  confirmText: { color: "#FFFFFF", fontFamily: "Oldenburg", fontSize: 16 },
});
