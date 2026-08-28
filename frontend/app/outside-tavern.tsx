import React, { useCallback, useRef, useState } from "react";
import { Animated, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import SceneBackground from "@/src/components/SceneBackground";
import TavernLocationBar from "@/src/components/tavern-location-bar";
import TavernLocationTransition from "@/src/components/tavern-location-transition";
import TravelHeader from "@/src/components/travel-header";
import PortraitBubble from "@/src/components/portrait-bubble";
import { useAudioManager } from "@/src/audio/AudioProvider";
import { useHaptics } from "@/src/feedback/haptics-provider";
import { getCoachmanTravelStatus } from "@/src/game/travel-system";
import { ITEM_CATALOG } from "@/src/game/item-system";
import { loadGuestState } from "@/src/game/guest-system";
import { areRegularGuestsUnlockedForDay, loadPostGuestTutorialState } from "@/src/game/post-guest-tutorial";
import { MERCHANT_STOCK, prepareMerchantShop, purchaseMerchantItem, type MerchantShopState, type MerchantStockId } from "@/src/game/merchant-shop";
import { loadCoachmanEscortState, prepareCoachmanEscortDeparture } from "@/src/game/coachman-escort-system";
import { useManagedTimers } from "@/src/hooks/use-managed-timers";

const BACKGROUND = require("../assets/images/outsidetavern1.png");
const COACHMAN = require("../assets/images/coachman.png");
const MERCHANT = require("../assets/images/merchant.png");
const COIN = require("../assets/images/coin_copper.png");
const BUCKET = require("../assets/images/bucket.png");
const BACKPACK = require("../assets/images/bag2.png");
const SMALL_CRATE = require("../assets/images/crate1.png");
const STOCK_IMAGES: Partial<Record<MerchantStockId, ReturnType<typeof require>>> = {
  bucket: BUCKET,
  bag2: BACKPACK,
  crate1: SMALL_CRATE,
  tool_rusty_butchering_knife: require("../assets/images/tool_rusty_butchering_knife.png"),
  armor_leather_bracers: require("../assets/images/armor_leather_bracers.png"),
  weapon_iron_dagger: require("../assets/images/weapon_iron_dagger.png"),
  weapon_iron_shortsword: require("../assets/images/weapon_iron_shortsword.png"),
};

type OutsideView = "menu" | "coachman" | "merchant" | "walk";
const COACHMAN_DESTINATIONS = [
  { name: "Next City", price: 15 }, { name: "Forest Entrance", price: 25 }, { name: "Coal Mine", price: 45 },
] as const;
const WALK_DESTINATIONS = ["Next City", "Forest Entrance"] as const;

export default function OutsideTavernScreen() {
  const {
    setManagedTimeout: setTimeout,
    clearManagedTimeout: clearTimeout,
  } = useManagedTimers();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const audioManager = useAudioManager();
  const { triggerHaptic } = useHaptics();
  const thoughtTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [view, setView] = useState<OutsideView>("menu");
  const [coachmanAvailable, setCoachmanAvailable] = useState(false);
  const [escortTutorialActive, setEscortTutorialActive] = useState(false);
  const [merchantAvailable, setMerchantAvailable] = useState(false);
  const [merchantShop, setMerchantShop] = useState<MerchantShopState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [thought, setThought] = useState<string | null>(null);
  const [busyItem, setBusyItem] = useState<MerchantStockId | null>(null);
  const [headerRefreshKey, setHeaderRefreshKey] = useState(0);
  const [crateDeliveryVisible, setCrateDeliveryVisible] = useState(false);
  const crateDelivery = useRef(new Animated.ValueXY()).current;
  const crateDeliveryOpacity = useRef(new Animated.Value(0)).current;
  const departureFade = useRef(new Animated.Value(0)).current;
  const [departing, setDeparting] = useState(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      const [rawDay, guestState, postGuestState, escortState] = await Promise.all([
        AsyncStorage.getItem("@game:day_index"),
        loadGuestState(),
        loadPostGuestTutorialState(),
        loadCoachmanEscortState(),
      ]);
      const day = Math.max(0, Number.parseInt(rawDay ?? "0", 10) || 0) % 7;
      const coachman = await getCoachmanTravelStatus(day);
      if (!active) return;
      const escortActive = escortState.phase === "accepted" || escortState.phase === "journey";
      setEscortTutorialActive(escortActive);
      setCoachmanAvailable(coachman.available || (escortActive && guestState.calendarDaySerial + 1 === 10));
      setMerchantAvailable(
        areRegularGuestsUnlockedForDay(postGuestState, guestState.calendarDaySerial) &&
        (guestState.calendarDaySerial + 1) % 4 === 0,
      );
      setView("menu");
      setMessage(null);
    })().catch(() => setMessage("Visitor information is unavailable."));
    return () => { active = false; if (thoughtTimer.current) clearTimeout(thoughtTimer.current); };
  }, [clearTimeout]));

  function chooseView(next: OutsideView) { triggerHaptic("choice"); setMessage(null); setView(next); }
  function showTravelLocked() {
    triggerHaptic("choice"); setThought("I currently have no reason to travel.");
    if (thoughtTimer.current) clearTimeout(thoughtTimer.current);
    thoughtTimer.current = setTimeout(() => setThought(null), 2600);
  }
  async function beginEscortTutorial() {
    if (departing) return;
    const preparation = await prepareCoachmanEscortDeparture();
    if (preparation === "equipment_in_kitchen") {
      setThought("I need to carry the Iron Shortsword and Leather Armor in my bag before we leave.");
      if (thoughtTimer.current) clearTimeout(thoughtTimer.current);
      thoughtTimer.current = setTimeout(() => setThought(null), 4200);
      return;
    }
    if (preparation === "bag_full") {
      setThought("The Coachman is waiting, but I need to make room in my bag for the equipment first.");
      if (thoughtTimer.current) clearTimeout(thoughtTimer.current);
      thoughtTimer.current = setTimeout(() => setThought(null), 4200);
      return;
    }
    setDeparting(true);
    departureFade.setValue(0);
    Animated.timing(departureFade, { toValue: 1, duration: 650, useNativeDriver: true }).start(() => router.replace("/coachman-escort"));
  }
  async function openMerchant() {
    chooseView("merchant");
    try { setMerchantShop(await prepareMerchantShop()); }
    catch { setMessage("The Merchant cannot show his stock right now."); }
  }
  async function buyItem(stockId: MerchantStockId) {
    if (busyItem) return;
    triggerHaptic("choice"); setBusyItem(stockId); setMessage(null);
    const result = await purchaseMerchantItem(stockId);
    setBusyItem(null);
    if (result.ok) {
      setMerchantShop(result.shop); audioManager.playSoundEffect("moveitem", { maxDurationMs: 3000 });
      setHeaderRefreshKey((value) => value + 1);
      if (result.delivery === "kitchen") {
        setMessage("Small Crate delivered to the Kitchen.");
        crateDelivery.setValue({ x: screenWidth * 0.64, y: screenHeight * 0.48 });
        crateDeliveryOpacity.setValue(1);
        setCrateDeliveryVisible(true);
        Animated.parallel([
          Animated.timing(crateDelivery, { toValue: { x: 20, y: screenHeight - insets.bottom - 78 }, duration: 900, useNativeDriver: true }),
          Animated.sequence([
            Animated.delay(650),
            Animated.timing(crateDeliveryOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
          ]),
        ]).start(() => setCrateDeliveryVisible(false));
      } else if (result.delivery === "backpack_upgrade") {
        setMessage("Shoulder Bag upgraded to Backpack. You now have 3 × 3 slots.");
      } else {
        setMessage(`${ITEM_CATALOG[stockId]?.name ?? "Item"} added to your bag.`);
      }
      return;
    }
    setMessage(result.reason === "insufficient_copper" ? "I don't have enough Copper." : result.reason === "bag_locked" ? "I need my bag first." : result.reason === "bag_full" ? "My bag is full." : result.reason === "kitchen_full" ? "There is no free Kitchen slot for the crate." : result.reason === "already_owned" ? "I already own this upgrade." : result.reason === "sold_out" ? "That item is sold out." : "The purchase could not be completed.");
  }
  function optionButton(label: string, portrait: typeof COACHMAN | null, action: () => void) {
    return <TouchableOpacity key={label} style={styles.optionButton} onPress={action} activeOpacity={0.82}>
      {portrait ? <Image source={portrait} style={styles.optionPortrait} resizeMode="cover" /> : <View style={styles.optionIcon}><Ionicons name="footsteps" size={28} color="#C4943A" /></View>}
      <Text style={styles.optionText}>{label}</Text><Ionicons name="chevron-forward" size={22} color="#C4943A" />
    </TouchableOpacity>;
  }
  function stockIcon(id: MerchantStockId) {
    const image = STOCK_IMAGES[id];
    if (image) return <Image source={image} style={styles.stockImage} resizeMode="contain" />;
    const icon = id.startsWith("weapon_") ? "flash-outline" : id.startsWith("armor_") ? "shield-outline" : id.startsWith("tool_") ? "hammer-outline" : "restaurant-outline";
    return <Ionicons name={icon} size={34} color="#D6A33B" />;
  }

  return <TavernLocationTransition location="outside"><View style={styles.root}>
    <SceneBackground source={BACKGROUND} topOffset={headerHeight} />
    <View style={[StyleSheet.absoluteFill, { top: headerHeight }, styles.overlay]} pointerEvents="none" />
    <TravelHeader locationName="Outside the Tavern" showPortraitRow onHeaderHeightChange={setHeaderHeight} refreshKey={headerRefreshKey} />
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}>
      {view === "menu" && <View style={styles.panel}>
        <Text style={styles.panelTitle}>What would you like to do?</Text>
        {coachmanAvailable && optionButton("Talk to Coachman", COACHMAN, () => chooseView("coachman"))}
        {merchantAvailable && optionButton("Talk to Merchant", MERCHANT, () => { void openMerchant(); })}
        {optionButton("Travel on foot", null, () => chooseView("walk"))}
      </View>}
      {view === "coachman" && <View style={styles.panel}>
        <View style={styles.personRow}><Image source={COACHMAN} style={styles.personPortrait} /><View style={styles.personText}><Text style={styles.panelTitle}>Where would you like to go?</Text><Text style={styles.panelSubtitle}>Coachman</Text></View></View>
        {COACHMAN_DESTINATIONS.map((destination) => {
          const tutorialDestination = escortTutorialActive && destination.name === "Next City";
          const disabledForTutorial = escortTutorialActive && !tutorialDestination;
          return <TouchableOpacity key={destination.name} style={[styles.destinationButton, disabledForTutorial && styles.disabled]} disabled={departing} onPress={tutorialDestination ? () => { void beginEscortTutorial(); } : showTravelLocked} activeOpacity={0.8}><Text style={styles.destinationName}>{destination.name}</Text><View style={styles.costRow}><Text style={styles.costText}>{tutorialDestination ? 0 : destination.price}</Text><Image source={COIN} style={styles.coin} /></View></TouchableOpacity>;
        })}
        <TouchableOpacity style={styles.backButton} onPress={() => chooseView("menu")}><Text style={styles.backText}>Go Back</Text></TouchableOpacity>
      </View>}
      {view === "walk" && <View style={styles.panel}>
        <Text style={styles.panelTitle}>Travel on foot</Text>
        {WALK_DESTINATIONS.map((name) => <TouchableOpacity key={name} style={styles.destinationButton} onPress={showTravelLocked}><Text style={styles.destinationName}>{name}</Text><Ionicons name="footsteps" size={20} color="#D6A33B" /></TouchableOpacity>)}
        <TouchableOpacity style={styles.backButton} onPress={() => chooseView("menu")}><Text style={styles.backText}>Go Back</Text></TouchableOpacity>
      </View>}
      {view === "merchant" && <View style={styles.panel}>
        <View style={styles.personRow}><Image source={MERCHANT} style={styles.personPortrait} /><View style={styles.personText}><Text style={styles.panelTitle}>My selection for today.</Text><Text style={styles.panelSubtitle}>Merchant</Text></View></View>
        {merchantShop?.stockIds.map((id) => {
          const definition = MERCHANT_STOCK[id]; const bought = merchantShop.purchased[id] ?? 0; const remaining = definition.maxPurchases - bought; const catalog = ITEM_CATALOG[id];
          return <View key={id} style={styles.stockRow}><View style={styles.stockIcon}>{stockIcon(id)}</View><View style={styles.stockText}><Text style={styles.stockName}>{catalog?.name ?? id}</Text><Text style={styles.stockDetails} numberOfLines={2}>{catalog?.description}</Text><Text style={styles.stockRemaining}>{remaining}/{definition.maxPurchases} available</Text></View><TouchableOpacity style={[styles.buyButton, remaining <= 0 && styles.disabled]} disabled={remaining <= 0 || busyItem !== null} onPress={() => { void buyItem(id); }}><Text style={styles.buyPrice}>{definition.priceCopper}</Text><Image source={COIN} style={styles.coin} /></TouchableOpacity></View>;
        })}
        <TouchableOpacity style={styles.backButton} onPress={() => chooseView("menu")}><Text style={styles.backText}>Go Back</Text></TouchableOpacity>
      </View>}
      {message && <Text style={styles.message}>{message}</Text>}
    </ScrollView>
    {thought && <PortraitBubble anchorX={70} screenWidth={screenWidth} text={thought} top={headerHeight + 112} variant="thought" />}
    {crateDeliveryVisible && (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Animated.Image
          source={SMALL_CRATE}
          resizeMode="contain"
          style={[styles.crateDelivery, { opacity: crateDeliveryOpacity, transform: crateDelivery.getTranslateTransform() }]}
        />
      </View>
    )}
    {departing && <Animated.View pointerEvents="auto" style={[StyleSheet.absoluteFill, styles.departureFade, { opacity: departureFade }]} />}
    <View style={{ paddingBottom: insets.bottom, backgroundColor: "rgba(10,5,1,0.96)" }}><TavernLocationBar current="explore" /></View>
  </View></TavernLocationTransition>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0500" }, overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.30)" }, scroll: { flex: 1, zIndex: 2 }, content: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 18, gap: 12 },
  panel: { borderRadius: 18, borderCurve: "continuous", borderWidth: 1.5, borderColor: "rgba(196,148,58,0.58)", backgroundColor: "rgba(18,9,2,0.94)", padding: 14, gap: 10 }, panelTitle: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 17, lineHeight: 24 }, panelSubtitle: { color: "#C4943A", fontFamily: "Oldenburg", fontSize: 13 },
  optionButton: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: 13, borderWidth: 1, borderColor: "rgba(196,148,58,0.34)", backgroundColor: "rgba(48,27,7,0.78)" }, optionPortrait: { width: 52, height: 52, borderRadius: 10, borderWidth: 1.5, borderColor: "#C4943A" }, optionIcon: { width: 52, height: 52, alignItems: "center", justifyContent: "center" }, optionText: { flex: 1, color: "#F0E8D5", fontFamily: "Oldenburg", fontSize: 15 },
  personRow: { flexDirection: "row", alignItems: "center", gap: 13 }, personPortrait: { width: 76, height: 88, borderRadius: 11, borderWidth: 2, borderColor: "#C4943A" }, personText: { flex: 1, gap: 4 }, destinationButton: { minHeight: 58, borderRadius: 12, borderWidth: 1, borderColor: "rgba(196,148,58,0.30)", backgroundColor: "rgba(48,27,7,0.74)", paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, destinationName: { color: "#F0E8D5", fontFamily: "Oldenburg", fontSize: 14 }, costRow: { flexDirection: "row", alignItems: "center", gap: 5 }, costText: { color: "#E7C77A", fontFamily: "Oldenburg", fontSize: 14, fontVariant: ["tabular-nums"] }, coin: { width: 18, height: 18 },
  stockRow: { flexDirection: "row", alignItems: "center", gap: 9, padding: 9, borderRadius: 12, borderWidth: 1, borderColor: "rgba(196,148,58,0.28)", backgroundColor: "rgba(48,27,7,0.72)" }, stockIcon: { width: 48, height: 48, alignItems: "center", justifyContent: "center" }, stockImage: { width: 46, height: 46 }, stockText: { flex: 1, gap: 2 }, stockName: { color: "#F0E8D5", fontFamily: "Oldenburg", fontSize: 12 }, stockDetails: { color: "rgba(240,232,213,0.65)", fontSize: 10, lineHeight: 14 }, stockRemaining: { color: "#C4943A", fontSize: 10, fontVariant: ["tabular-nums"] }, buyButton: { minWidth: 58, minHeight: 44, paddingHorizontal: 8, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderWidth: 1.5, borderColor: "#C4943A", backgroundColor: "rgba(112,73,18,0.86)" }, buyPrice: { color: "#FFF", fontFamily: "Oldenburg", fontSize: 12 }, disabled: { opacity: 0.35 },
  backButton: { alignSelf: "center", marginTop: 4, paddingHorizontal: 26, paddingVertical: 10 }, backText: { color: "#C4943A", fontFamily: "Oldenburg", fontSize: 13 }, message: { color: "#F5E6C8", backgroundColor: "rgba(54,28,6,0.94)", borderRadius: 10, padding: 11, textAlign: "center", fontSize: 13 },
  crateDelivery: { position: "absolute", left: 0, top: 0, width: 68, height: 68, zIndex: 1000 },
  departureFade: { zIndex: 2000, backgroundColor: "#000" },
});
