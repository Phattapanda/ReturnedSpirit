import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Animated, Image, Modal, ScrollView, StyleSheet, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { Text } from "@/src/i18n/localized-text";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import SceneBackground from "@/src/components/SceneBackground";
import TavernLocationBar from "@/src/components/tavern-location-bar";
import TavernLocationTransition from "@/src/components/tavern-location-transition";
import TravelHeader from "@/src/components/travel-header";
import CurrencyPrice from "@/src/components/currency-price";
import PortraitBubble, { portraitBubbleTop } from "@/src/components/portrait-bubble";
import StoryDialogOverlay, { type StoryDialogChoice, type StoryDialogLine } from "@/src/components/story-dialog-overlay";
import { COACHMAN_DIALOG_SCALE, DIALOG_CHARACTER_ASSETS } from "@/src/assets/dialog-character-assets";
import { useAudioManager } from "@/src/audio/AudioProvider";
import { useHaptics } from "@/src/feedback/haptics-provider";
import { getCoachmanTravelStatus, getEffectiveWalkingCost, loadTravelState, payForCarriage, spendWalkingStamina, unlockNextCityAfterEscort } from "@/src/game/travel-system";
import { DEFAULT_BAG, ITEM_CATALOG, PLAYER_BAG_KEY, normalizePlayerBagData, planAddToBag, type PlayerBagData } from "@/src/game/item-system";
import { loadGuestState } from "@/src/game/guest-system";
import { areRegularGuestsUnlockedForDay, loadPostGuestTutorialState } from "@/src/game/post-guest-tutorial";
import { MERCHANT_STOCK, prepareMerchantShop, purchaseMerchantItem, type MerchantShopState, type MerchantStockId } from "@/src/game/merchant-shop";
import { finalizeCoachmanEscortDecline, hasCompletedCityRoadEncounter, loadCoachmanEscortState, prepareCoachmanEscortDeparture, reconsiderCoachmanEscort } from "@/src/game/coachman-escort-system";
import { useManagedTimers } from "@/src/hooks/use-managed-timers";
import { QUESTS, getQuestDefinition, isQuestReadyToTurnIn, loadCityState, turnInQuest, type CityState, type QuestId } from "@/src/game/city-system";
import { loadWorkshopState } from "@/src/game/workshop-system";
import { UI_NOTIFICATION_DURATION_MS } from "@/src/ui/timings";
import { FOREST_ASSET_COUNT, preloadForestAssets } from "@/src/game/forest-assets";
import { addCurrencyCopper } from "@/src/game/currency-system";
import { createExploreAreaItem, EXPLORE_AREA_BASE_STAMINA_COST, formatExploreAreaFind, rollExploreAreaFind } from "@/src/game/outside-exploration";
import { DEFAULT_PLAYER_STATS, PLAYER_STATS_KEY, getEffectiveLuck, normalizePlayerStats } from "@/src/game/player-stats";
import { belongsInGardenStorage, storeItemDirectlyInGardenStorage } from "@/src/game/tavern-return-storage";

const BACKGROUND = require("../assets/images/outsidetavern1.png");
const COACHMAN = require("../assets/images/coachman.png");
const MERCHANT = require("../assets/images/merchant.png");
const BUCKET = require("../assets/images/water_jar.png");
const BACKPACK = require("../assets/images/bag2.png");
const SMALL_CRATE = require("../assets/images/crate1.png");
const RECEPTIONIST = require("../assets/images/receptionist.png");
const DIALOGUE_RECEPTIONIST = require("../assets/images/dialog/dialogue_receptionist.png");
const STOCK_IMAGES: Partial<Record<MerchantStockId, ReturnType<typeof require>>> = {
  water_jar: BUCKET,
  egg: require("../assets/images/egg.png"),
  white_meat: require("../assets/images/meat_white.png"),
  fish: require("../assets/images/meat_fish.png"),
  red_meat: require("../assets/images/meat_red.png"),
  mushroom: require("../assets/images/mushroom.png"),
  mushroom_rare: require("../assets/images/mushroom_rare.png"),
  bag2: BACKPACK,
  crate1: SMALL_CRATE,
  seed_herb: require("../assets/images/seed_herb.png"),
  seed_carrot: require("../assets/images/seed_carrot.png"),
  seed_potato: require("../assets/images/seed_potato.png"),
  seed_onion: require("../assets/images/seed_onion.png"),
  standard_fertilizer: require("../assets/images/fertilizer.png"),
  nails: require("../assets/images/nails.png"),
  cloth: require("../assets/images/cloth.png"),
  paint: require("../assets/images/paint.png"),
  tool_rusty_butchering_knife: require("../assets/images/tool_rusty_butchering_knife.png"),
  armor_leather_bracers: require("../assets/images/armor_leather_bracers.png"),
  weapon_iron_dagger: require("../assets/images/weapon_iron_dagger.png"),
  weapon_iron_shortsword: require("../assets/images/weapon_iron_shortsword.png"),
  mortar_and_pestle: require("../assets/images/mortar_and_pestle.png"),
};

type OutsideView = "menu" | "coachman" | "merchant" | "walk" | "receptionist";
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
  const { storedQuantity } = useLocalSearchParams<{ storedQuantity?: string }>();
  const storageNoticeShown = useRef(false);
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const audioManager = useAudioManager();
  const { triggerHaptic } = useHaptics();
  const thoughtTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const floatingMessageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [portraitBottom, setPortraitBottom] = useState(0);
  const [view, setView] = useState<OutsideView>("menu");
  const [coachmanAvailable, setCoachmanAvailable] = useState(false);
  const [escortTutorialActive, setEscortTutorialActive] = useState(false);
  const [merchantAvailable, setMerchantAvailable] = useState(false);
  const [merchantShop, setMerchantShop] = useState<MerchantShopState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  React.useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), UI_NOTIFICATION_DURATION_MS);
    return () => clearTimeout(timer);
  }, [message, setTimeout, clearTimeout]);
  const [floatingMessage, setFloatingMessage] = useState<string | null>(null);
  const [floatingMessageHighlight, setFloatingMessageHighlight] = useState<string | null>(null);
  React.useEffect(() => {
    if (storageNoticeShown.current || !(Number(storedQuantity) > 0)) return;
    storageNoticeShown.current = true;
    setFloatingMessage(`${storedQuantity} materials and garden supplies stored in Garden Storage.`);
    floatingMessageTimer.current = setTimeout(() => setFloatingMessage(null), UI_NOTIFICATION_DURATION_MS);
    router.setParams({ storedQuantity: undefined });
  }, [storedQuantity, router, setTimeout]);
  const [thought, setThought] = useState<string | null>(null);
  const [headerRefreshKey, setHeaderRefreshKey] = useState(0);
  const [crateDeliveryVisible, setCrateDeliveryVisible] = useState(false);
  const crateDelivery = useRef(new Animated.ValueXY()).current;
  const crateDeliveryOpacity = useRef(new Animated.Value(0)).current;
  const departureFade = useRef(new Animated.Value(0)).current;
  const [departing, setDeparting] = useState(false);
  const [receptionistPresent, setReceptionistPresent] = useState(false);
  const [cityState, setCityState] = useState<CityState | null>(null);
  const [playerBag, setPlayerBag] = useState<PlayerBagData>({ ...DEFAULT_BAG, slots: [...DEFAULT_BAG.slots] });
  const [cityUnlocked, setCityUnlocked] = useState(false);
  const [forestEntranceUnlocked, setForestEntranceUnlocked] = useState(false);
  const [forestTravelConfirmationMode, setForestTravelConfirmationMode] = useState<"coachman" | "walk" | null>(null);
  const [forestTravelBusy, setForestTravelBusy] = useState(false);
  const [forestLoadProgress, setForestLoadProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [coachmanReoffer, setCoachmanReoffer] = useState<"question" | "accepted" | "declined" | null>(null);
  const [workshopComplete, setWorkshopComplete] = useState(false);
  const [exploreAreaBusy, setExploreAreaBusy] = useState(false);
  const [activityCosts, setActivityCosts] = useState({ explore: 10, city: 30, forest: 50 });

  useFocusEffect(useCallback(() => {
    let active = true;
    void Promise.all([getEffectiveWalkingCost(EXPLORE_AREA_BASE_STAMINA_COST), getEffectiveWalkingCost(30), getEffectiveWalkingCost(50)])
      .then(([explore, city, forest]) => { if (active) setActivityCosts({ explore, city, forest }); });
    return () => { active = false; };
  }, []));

  useFocusEffect(useCallback(() => {
    let active = true;
    setForestTravelConfirmationMode(null);
    setForestTravelBusy(false);
    setForestLoadProgress(null);
    (async () => {
      const [rawDay, guestState, postGuestState, escortState, travelState, workshopState] = await Promise.all([
        AsyncStorage.getItem("@game:day_index"),
        loadGuestState(),
        loadPostGuestTutorialState(),
        loadCoachmanEscortState(),
        loadTravelState(),
        loadWorkshopState(),
      ]);
      const day = Math.max(0, Number.parseInt(rawDay ?? "0", 10) || 0) % 7;
      const coachman = await getCoachmanTravelStatus(day);
      if (!active) return;
      const escortActive = escortState.phase === "accepted" || escortState.phase === "journey";
      setEscortTutorialActive(escortActive);
      const declinedReofferReady = escortState.phase !== "declined"
        || escortState.declinedDaySerial === null
        || guestState.calendarDaySerial > escortState.declinedDaySerial;
      setCoachmanAvailable((coachman.available && declinedReofferReady) || (escortActive && guestState.calendarDaySerial + 1 === 10));
      setMerchantAvailable(
        areRegularGuestsUnlockedForDay(postGuestState, guestState.calendarDaySerial) &&
        (guestState.calendarDaySerial + 1) % 4 === 0,
      );
      setReceptionistPresent(escortState.phase === "complete" && day === 6);
      setCityUnlocked(travelState.unlockedDestinations.includes("next_city"));
      setForestEntranceUnlocked(
        escortState.phase === "complete" && travelState.unlockedDestinations.includes("forest_entrance"),
      );
      setWorkshopComplete(workshopState.phase === "complete");
      const [loadedCityState, rawBag] = await Promise.all([
        loadCityState(),
        AsyncStorage.getItem(PLAYER_BAG_KEY),
      ]);
      if (!active) return;
      setCityState(loadedCityState);
      setPlayerBag(rawBag ? normalizePlayerBagData(JSON.parse(rawBag)) : { ...DEFAULT_BAG, slots: [...DEFAULT_BAG.slots] });
      setView("menu");
      setMessage(null);
    })().catch(() => setMessage("Visitor information is unavailable."));
    return () => { active = false; if (thoughtTimer.current) clearTimeout(thoughtTimer.current); if (floatingMessageTimer.current) clearTimeout(floatingMessageTimer.current); };
  }, [clearTimeout]));

  function showFloatingMessage(text: string, highlightedFind: string | null = null) {
    setFloatingMessage(text);
    setFloatingMessageHighlight(highlightedFind);
    if (floatingMessageTimer.current) clearTimeout(floatingMessageTimer.current);
    floatingMessageTimer.current = setTimeout(() => {
      setFloatingMessage(null);
      setFloatingMessageHighlight(null);
    }, UI_NOTIFICATION_DURATION_MS);
  }

  async function chooseCoachmanView() {
    triggerHaptic("choice"); setMessage(null); setView("coachman");
    const escort = await loadCoachmanEscortState();
    if (escort.phase === "declined") setCoachmanReoffer("question");
  }
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
    triggerHaptic("choice"); setMessage(null);
    const result = await purchaseMerchantItem(stockId);
    if (result.ok) {
      setMerchantShop(result.shop);
      audioManager.playSoundEffect("moveitem", { maxDurationMs: 3000 });
      setHeaderRefreshKey((value) => value + 1);
      if (result.delivery === "kitchen") {
        showFloatingMessage("Small Crate delivered to the Kitchen.");
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
        showFloatingMessage("Shoulder Bag upgraded to Backpack. General Goods are now open in the city.");
      } else if (result.delivery === "garden") {
        showFloatingMessage(`${ITEM_CATALOG[stockId]?.name ?? "Item"} added to Garden Storage.`);
      } else if (result.delivery === "materials") {
        showFloatingMessage(`${ITEM_CATALOG[stockId]?.name ?? "Material"} added to Materials.`);
      } else {
        showFloatingMessage(`${ITEM_CATALOG[stockId]?.name ?? "Item"} added to your bag.`);
      }
      return;
    }
    showFloatingMessage(result.reason === "insufficient_copper" ? "I don't have enough Copper." : result.reason === "bag_locked" ? "I need my bag first." : result.reason === "bag_full" ? "My bag is full." : result.reason === "kitchen_full" ? "There is no free Kitchen slot for the crate." : result.reason === "already_owned" ? "I already own this upgrade." : result.reason === "sold_out" ? "That item is sold out." : "The purchase could not be completed.");
  }
  async function receptionistTurnIn(id: QuestId) {
    const result = await turnInQuest(id);
    setMessage(result.ok ? `Thank you. ${result.message}` : result.message);
    const [updatedCityState, rawBag] = await Promise.all([loadCityState(), AsyncStorage.getItem(PLAYER_BAG_KEY)]);
    setCityState(updatedCityState);
    setPlayerBag(rawBag ? normalizePlayerBagData(JSON.parse(rawBag)) : { ...DEFAULT_BAG, slots: [...DEFAULT_BAG.slots] });
    setHeaderRefreshKey((value) => value + 1);
  }
  async function travelToCity(mode: "coachman" | "walk") {
    if (!cityUnlocked) { showTravelLocked(); return; }
    const escortState = mode === "walk" ? await loadCoachmanEscortState() : null;
    const requiresRoadBattle = mode === "walk" && escortState !== null && !hasCompletedCityRoadEncounter(escortState);
    if (requiresRoadBattle) {
      const rawBag = await AsyncStorage.getItem(PLAYER_BAG_KEY);
      const currentBag = normalizePlayerBagData(rawBag ? JSON.parse(rawBag) : {});
      if (!currentBag.unlocked || !currentBag.slots.some((slot) => slot === null)) {
        setMessage("I need a free slot in my bag before walking to the city.");
        return;
      }
    }
    const walkingCost = mode === "walk" ? await getEffectiveWalkingCost(30) : 30;
    const paid = mode === "coachman" ? await payForCarriage(15) : (await spendWalkingStamina(walkingCost)).ok;
    if (!paid) { setMessage(mode === "coachman" ? "I need 15 Copper for the trip." : `I need ${walkingCost} Stamina to walk to the city.`); return; }
    audioManager.playSoundEffect("footstep", { maxDurationMs: 2200 });
    if (requiresRoadBattle) router.push({ pathname: "/coachman-escort", params: { mode: "walk" } });
    else router.push({ pathname: "/next-city", params: { returnTo: "outside" } });
  }
  async function acceptCoachmanReoffer() {
    await reconsiderCoachmanEscort();
    setEscortTutorialActive(true);
    setCoachmanReoffer("accepted");
  }
  async function declineCoachmanReoffer() {
    await finalizeCoachmanEscortDecline();
    const travel = await unlockNextCityAfterEscort();
    setCityUnlocked(travel.unlockedDestinations.includes("next_city"));
    setEscortTutorialActive(false);
    setCoachmanReoffer("declined");
  }
  const coachmanReofferLine: StoryDialogLine | null = coachmanReoffer === "question"
    ? { speaker: "Coachman", portrait: DIALOG_CHARACTER_ASSETS.coachman, characterScale: COACHMAN_DIALOG_SCALE, text: "Good morning, I just wanted to ask if you’ve changed your mind?" }
    : coachmanReoffer === "accepted"
      ? { speaker: "Coachman", portrait: DIALOG_CHARACTER_ASSETS.coachman, characterScale: COACHMAN_DIALOG_SCALE, text: "Thank you. Talk to me when you’re ready to leave." }
      : coachmanReoffer === "declined"
        ? { speaker: "Coachman", portrait: DIALOG_CHARACTER_ASSETS.coachman, characterScale: COACHMAN_DIALOG_SCALE, text: "A real shame." }
        : null;
  const coachmanReofferChoices: readonly StoryDialogChoice[] = coachmanReoffer === "question" ? [
    { label: "YES", onPress: () => { void acceptCoachmanReoffer(); } },
    { label: "NO", onPress: () => { void declineCoachmanReoffer(); } },
  ] : [];
  async function travelToForestEntrance(mode: "coachman" | "walk") {
    if (!forestEntranceUnlocked || forestTravelBusy) { if (!forestEntranceUnlocked) showTravelLocked(); return; }
    setForestTravelBusy(true);
    setForestLoadProgress({ loaded: 0, total: FOREST_ASSET_COUNT });
    try {
      await preloadForestAssets((loaded, total) => setForestLoadProgress({ loaded, total }));
    } catch {
      setForestTravelConfirmationMode(null);
      setForestTravelBusy(false);
      setForestLoadProgress(null);
      setMessage("The Forest files could not be loaded. Please try again.");
      return;
    }
    const walkingCost = mode === "walk" ? await getEffectiveWalkingCost(50) : 50;
    const paid = mode === "coachman" ? await payForCarriage(25) : (await spendWalkingStamina(walkingCost)).ok;
    if (!paid) {
      setForestTravelConfirmationMode(null);
      setForestTravelBusy(false);
      setForestLoadProgress(null);
      setMessage(mode === "coachman"
        ? "I need 25 Copper for the trip."
        : `I need ${walkingCost} Stamina to walk to the Forest Entrance.`);
      return;
    }
    setForestTravelConfirmationMode(null);
    audioManager.playSoundEffect("footstep", { maxDurationMs: 2200 });
    router.push("/forest-entrance");
  }
  function requestForestEntranceTravel(mode: "coachman" | "walk") {
    if (!forestEntranceUnlocked) { showTravelLocked(); return; }
    setForestTravelConfirmationMode(mode);
  }
  async function exploreArea() {
    if (exploreAreaBusy) return;
    setExploreAreaBusy(true);
    setMessage(null);
    try {
      const rawStats = await AsyncStorage.getItem(PLAYER_STATS_KEY);
      const stats = rawStats ? normalizePlayerStats(JSON.parse(rawStats)) : DEFAULT_PLAYER_STATS;
      const find = rollExploreAreaFind(getEffectiveLuck(stats));
      const item = createExploreAreaItem(find);
      const sendToGardenStorage = item ? belongsInGardenStorage(item) : false;
      let currentBag: PlayerBagData | null = null;
      let updatedBag: PlayerBagData | null = null;

      if (item && !sendToGardenStorage) {
        const rawBag = await AsyncStorage.getItem(PLAYER_BAG_KEY);
        currentBag = normalizePlayerBagData(rawBag ? JSON.parse(rawBag) : {});
        if (!currentBag.unlocked) {
          showFloatingMessage("I need my bag before I can carry anything I find.");
          return;
        }
        const plan = planAddToBag(item, currentBag);
        if (plan.remainderQty > 0) {
          showFloatingMessage(`You discover ${item.name}, but there is not enough room in your bag.`);
          return;
        }
        updatedBag = { ...currentBag, slots: plan.updatedSlots };
      }

      const staminaCost = await getEffectiveWalkingCost(EXPLORE_AREA_BASE_STAMINA_COST);
      const staminaResult = await spendWalkingStamina(staminaCost);
      if (!staminaResult.ok) {
        showFloatingMessage(`I need ${staminaCost} Stamina to explore the area.`);
        return;
      }

      if (find.kind === "copper") {
        await addCurrencyCopper(find.quantity);
      } else if (item && sendToGardenStorage) {
        const stored = await storeItemDirectlyInGardenStorage(item);
        if (!stored) throw new Error("Unexpected Garden Storage destination");
      } else if (updatedBag) {
        await AsyncStorage.setItem(PLAYER_BAG_KEY, JSON.stringify(updatedBag));
        setPlayerBag(updatedBag);
      }

      audioManager.playSoundEffect("moveitem", { maxDurationMs: 2200 });
      setHeaderRefreshKey((value) => value + 1);
      const formattedFind = formatExploreAreaFind(find);
      const [description, foundText = ""] = formattedFind.split("\nFound: ");
      showFloatingMessage(
        sendToGardenStorage ? `${description}\nSent to Garden Storage:` : description,
        foundText,
      );
    } catch {
      showFloatingMessage("You search the area, but something prevents you from collecting the find.");
    } finally {
      setExploreAreaBusy(false);
    }
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
    <TravelHeader locationName="Outside the Tavern" showPortraitRow onHeaderHeightChange={setHeaderHeight} onPortraitBottomChange={setPortraitBottom} refreshKey={headerRefreshKey} />
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}>
      {view === "menu" && <View style={styles.panel}>
        <Text style={styles.panelTitle}>What would you like to do?</Text>
        {receptionistPresent && optionButton("Talk to Guild Receptionist", RECEPTIONIST, () => chooseView("receptionist"))}
        {coachmanAvailable && optionButton("Talk to Coachman", COACHMAN, () => { void chooseCoachmanView(); })}
        {merchantAvailable && optionButton("Talk to Merchant", MERCHANT, () => { void openMerchant(); })}
        {workshopComplete && optionButton("Enter the Workshop", null, () => router.push("/workshop"))}
        {optionButton("Travel on foot", null, () => chooseView("walk"))}
      </View>}
      {view === "receptionist" && <View style={styles.panel}>
        <View style={styles.personRow}><Image source={DIALOGUE_RECEPTIONIST} style={styles.receptionistPortrait} resizeMode="contain" /><View style={styles.personText}><Text style={styles.panelTitle}>Adventurers’ Guild Quests</Text><Text style={styles.panelSubtitle}>Guild Receptionist</Text></View></View>
        <Text style={styles.receptionistText}>I can review your accepted quests and receive completed work here on Sundays.</Text>
        {(Object.keys(QUESTS) as QuestId[]).filter((id) => cityState?.quests[id].status === "accepted" || cityState?.quests[id].status === "ready").map((id) => { const readyToTurnIn = !!cityState && isQuestReadyToTurnIn(id, cityState, playerBag); const definition = cityState ? getQuestDefinition(id, cityState) : QUESTS[id]; return <View key={id} style={styles.receptionistQuest}><View style={styles.stockText}><Text style={styles.stockName}>{definition.title}</Text><Text style={styles.stockDetails}>{definition.detail}</Text></View><TouchableOpacity style={[styles.buyButton, readyToTurnIn && styles.turnInReady]} onPress={() => { void receptionistTurnIn(id); }}><Text style={styles.buyPrice}>Turn In</Text></TouchableOpacity></View>; })}
        {!cityState || !(Object.keys(QUESTS) as QuestId[]).some((id) => cityState.quests[id].status === "accepted" || cityState.quests[id].status === "ready") ? <Text style={styles.receptionistText}>You have no active Guild quests.</Text> : null}
        <TouchableOpacity style={styles.backButton} onPress={() => chooseView("menu")}><Text style={styles.backText}>Go Back</Text></TouchableOpacity>
      </View>}
      {view === "coachman" && <View style={styles.panel}>
        <View style={styles.personRow}><Image source={COACHMAN} style={styles.personPortrait} /><View style={styles.personText}><Text style={styles.panelTitle}>Where would you like to go?</Text><Text style={styles.panelSubtitle}>Coachman</Text></View></View>
        {COACHMAN_DESTINATIONS.map((destination) => {
          const tutorialDestination = escortTutorialActive && destination.name === "Next City";
          const disabledForTutorial = escortTutorialActive && !tutorialDestination;
          const forestLocked = destination.name === "Forest Entrance" && !forestEntranceUnlocked;
          const permanentlyLocked = destination.name === "Coal Mine";
          const onPress = tutorialDestination
            ? () => { void beginEscortTutorial(); }
            : destination.name === "Next City"
              ? () => { void travelToCity("coachman"); }
              : destination.name === "Forest Entrance"
                ? () => requestForestEntranceTravel("coachman")
                : showTravelLocked;
          return <TouchableOpacity key={destination.name} style={[styles.destinationButton, (disabledForTutorial || forestLocked || permanentlyLocked) && styles.disabled]} disabled={departing || disabledForTutorial} onPress={onPress} activeOpacity={0.8}><Text style={styles.destinationName}>{destination.name}</Text><View style={styles.costRow}>{tutorialDestination ? <Text style={styles.costText}>Free</Text> : <CurrencyPrice totalCopper={destination.price} textStyle={styles.costText} />}</View></TouchableOpacity>;
        })}
        <TouchableOpacity style={styles.backButton} onPress={() => chooseView("menu")}><Text style={styles.backText}>Go Back</Text></TouchableOpacity>
      </View>}
      {view === "walk" && <View style={styles.panel}>
        <Text style={styles.panelTitle}>Travel on foot</Text>
        <TouchableOpacity style={[styles.destinationButton, exploreAreaBusy && styles.disabled]} disabled={exploreAreaBusy} onPress={() => { void exploreArea(); }} activeOpacity={0.8}>
          <View style={styles.exploreAreaLabel}>
            <Text style={styles.destinationName}>Explore the Area</Text>
            <Text style={styles.destinationHint}>Find a random item nearby</Text>
          </View>
          <View style={styles.costRow}><Text style={styles.costText}>{activityCosts.explore} Stamina</Text><Ionicons name="search" size={20} color="#D6A33B" /></View>
        </TouchableOpacity>
        {WALK_DESTINATIONS.map((name) => {
          const forestLocked = name === "Forest Entrance" && !forestEntranceUnlocked;
          return <TouchableOpacity key={name} style={[styles.destinationButton, forestLocked && styles.disabled]} onPress={name === "Next City" ? () => { void travelToCity("walk"); } : () => requestForestEntranceTravel("walk")}><Text style={styles.destinationName}>{name}</Text><View style={styles.costRow}><Text style={styles.costText}>{name === "Next City" ? activityCosts.city : activityCosts.forest} Stamina</Text><Ionicons name="footsteps" size={20} color="#D6A33B" /></View></TouchableOpacity>;
        })}
        <TouchableOpacity style={styles.backButton} onPress={() => chooseView("menu")}><Text style={styles.backText}>Go Back</Text></TouchableOpacity>
      </View>}
      {view === "merchant" && <View style={styles.panel}>
        <View style={styles.personRow}><Image source={MERCHANT} style={styles.personPortrait} /><View style={styles.personText}><Text style={styles.panelTitle}>My selection for today.</Text><Text style={styles.panelSubtitle}>Merchant</Text></View></View>
        {merchantShop?.stockIds.map((id) => {
          const definition = MERCHANT_STOCK[id]; const bought = merchantShop.purchased[id] ?? 0; const remaining = definition.maxPurchases - bought; const catalog = ITEM_CATALOG[id];
          return <View key={id} style={styles.stockRow}><View style={styles.stockIcon}>{stockIcon(id)}</View><View style={styles.stockText}><Text style={styles.stockName}>{catalog?.name ?? id}</Text><Text style={styles.stockDetails} numberOfLines={2}>{catalog?.description}</Text><Text style={styles.stockRemaining}>{remaining}/{definition.maxPurchases} available</Text></View><TouchableOpacity style={[styles.buyButton, remaining <= 0 && styles.disabled]} disabled={remaining <= 0} onPress={() => { void buyItem(id); }}><CurrencyPrice totalCopper={definition.priceCopper} textStyle={styles.buyPrice} /></TouchableOpacity></View>;
        })}
        <TouchableOpacity style={styles.backButton} onPress={() => chooseView("menu")}><Text style={styles.backText}>Go Back</Text></TouchableOpacity>
      </View>}
    </ScrollView>
    <Modal visible={forestTravelConfirmationMode !== null} transparent animationType="fade" onRequestClose={() => { if (!forestTravelBusy) setForestTravelConfirmationMode(null); }}>
      <View style={styles.warningBackdrop}>
        <View style={styles.warningPanel}>
          {forestTravelBusy ? <>
            <ActivityIndicator size="large" color="#C4943A" />
            <Text selectable style={styles.warningTitle}>Preparing the Forest…</Text>
            <Text selectable style={styles.warningText}>Loading Forest files {forestLoadProgress?.loaded ?? 0}/{forestLoadProgress?.total ?? FOREST_ASSET_COUNT}</Text>
          </> : <>
            <Text selectable style={styles.warningTitle}>Travel to Forest Entrance?</Text>
            <Text selectable style={styles.warningText}>When you return from the Forest Entrance, the day will end.</Text>
            <View style={styles.warningButtons}>
              <TouchableOpacity style={styles.warningCancel} onPress={() => setForestTravelConfirmationMode(null)} activeOpacity={0.8}>
                <Text style={styles.warningButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.warningConfirm} onPress={() => { if (forestTravelConfirmationMode) void travelToForestEntrance(forestTravelConfirmationMode); }} activeOpacity={0.8}>
                <Text style={styles.warningButtonText}>Travel</Text>
              </TouchableOpacity>
            </View>
          </>}
        </View>
      </View>
    </Modal>
    {thought && <PortraitBubble anchorX={70} screenWidth={screenWidth} text={thought} top={portraitBubbleTop(portraitBottom || headerHeight + 108)} variant="thought" />}
    {(floatingMessage || message) && <View pointerEvents="none" style={styles.floatingMessageWrap}><Text style={styles.floatingMessage}>{floatingMessage || message}{floatingMessageHighlight ? <><Text>{"\n"}</Text><Text style={styles.floatingMessageHighlight}>{floatingMessageHighlight}</Text></> : null}</Text></View>}
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
    <StoryDialogOverlay
      visible={coachmanReoffer !== null}
      line={coachmanReofferLine}
      choices={coachmanReofferChoices}
      onContinue={() => { if (coachmanReoffer !== "question") setCoachmanReoffer(null); }}
      onSkip={() => { if (coachmanReoffer !== "question") setCoachmanReoffer(null); }}
    />
    <View style={{ paddingBottom: insets.bottom, backgroundColor: "rgba(10,5,1,0.96)" }}><TavernLocationBar current="explore" /></View>
  </View></TavernLocationTransition>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0500" }, overlay: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.30)" }, scroll: { flex: 1, zIndex: 2 }, content: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 18, gap: 12 },
  panel: { borderRadius: 18, borderCurve: "continuous", borderWidth: 1.5, borderColor: "rgba(196,148,58,0.58)", backgroundColor: "rgba(18,9,2,0.94)", padding: 14, gap: 10 }, panelTitle: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 17, lineHeight: 24 }, panelSubtitle: { color: "#C4943A", fontFamily: "Oldenburg", fontSize: 13 },
  optionButton: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: 13, borderWidth: 1, borderColor: "rgba(196,148,58,0.34)", backgroundColor: "rgba(48,27,7,0.78)" }, optionPortrait: { width: 52, height: 52, borderRadius: 10, borderWidth: 1.5, borderColor: "#C4943A" }, optionIcon: { width: 52, height: 52, alignItems: "center", justifyContent: "center" }, optionText: { flex: 1, color: "#F0E8D5", fontFamily: "Oldenburg", fontSize: 15 },
  personRow: { flexDirection: "row", alignItems: "center", gap: 13 }, personPortrait: { width: 76, height: 88, borderRadius: 11, borderWidth: 2, borderColor: "#C4943A" }, personText: { flex: 1, gap: 4 }, destinationButton: { minHeight: 58, borderRadius: 12, borderWidth: 1, borderColor: "rgba(196,148,58,0.30)", backgroundColor: "rgba(48,27,7,0.74)", paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, destinationName: { color: "#F0E8D5", fontFamily: "Oldenburg", fontSize: 14 }, costRow: { flexDirection: "row", alignItems: "center", gap: 5 }, costText: { color: "#E7C77A", fontFamily: "Oldenburg", fontSize: 14, fontVariant: ["tabular-nums"] }, coin: { width: 18, height: 18 },
  exploreAreaLabel: { flex: 1, gap: 3, paddingVertical: 9 }, destinationHint: { color: "rgba(240,232,213,0.58)", fontSize: 10 },
  receptionistPortrait: { width: 115, height: 156, borderRadius: 12 }, receptionistText: { color: "rgba(240,232,213,0.72)", fontSize: 12, lineHeight: 18 }, receptionistQuest: { flexDirection: "row", alignItems: "center", gap: 9, padding: 10, borderRadius: 12, backgroundColor: "rgba(48,27,7,0.74)", borderWidth: 1, borderColor: "rgba(196,148,58,0.3)" },
  stockRow: { flexDirection: "row", alignItems: "center", gap: 9, padding: 9, borderRadius: 12, borderWidth: 1, borderColor: "rgba(196,148,58,0.28)", backgroundColor: "rgba(48,27,7,0.72)" }, stockIcon: { width: 48, height: 48, alignItems: "center", justifyContent: "center" }, stockImage: { width: 46, height: 46 }, stockText: { flex: 1, gap: 2 }, stockName: { color: "#F0E8D5", fontFamily: "Oldenburg", fontSize: 12 }, stockDetails: { color: "rgba(240,232,213,0.65)", fontSize: 10, lineHeight: 14 }, stockRemaining: { color: "#C4943A", fontSize: 10, fontVariant: ["tabular-nums"] }, buyButton: { minWidth: 58, minHeight: 44, paddingHorizontal: 8, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderWidth: 1.5, borderColor: "#C4943A", backgroundColor: "rgba(112,73,18,0.86)" }, buyPrice: { color: "#FFF", fontFamily: "Oldenburg", fontSize: 12 }, disabled: { opacity: 0.35 },
  turnInReady: { backgroundColor: "#237A3B", borderColor: "#70D98A" },
  backButton: { alignSelf: "center", marginTop: 4, paddingHorizontal: 26, paddingVertical: 10 }, backText: { color: "#C4943A", fontFamily: "Oldenburg", fontSize: 13 }, message: { color: "#F5E6C8", backgroundColor: "rgba(54,28,6,0.94)", borderRadius: 10, padding: 11, textAlign: "center", fontSize: 13 },
  crateDelivery: { position: "absolute", left: 0, top: 0, width: 68, height: 68, zIndex: 1000 },
  departureFade: { zIndex: 2000, backgroundColor: "#000" },
  floatingMessageWrap: { ...StyleSheet.absoluteFill, zIndex: 1800, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  floatingMessage: { color: "#FFF4DC", fontFamily: "Oldenburg", fontSize: 14, textAlign: "center", backgroundColor: "rgba(18,9,2,0.94)", borderWidth: 1, borderColor: "#C4943A", borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  floatingMessageHighlight: { color: "#FF4B4B", fontFamily: "Oldenburg", fontWeight: "900" },
  warningBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 22, backgroundColor: "rgba(0,0,0,0.78)" },
  warningPanel: { width: "100%", maxWidth: 420, gap: 14, padding: 20, borderRadius: 17, borderCurve: "continuous", borderWidth: 1.5, borderColor: "rgba(196,148,58,0.72)", backgroundColor: "#170C03" },
  warningTitle: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 19, textAlign: "center" },
  warningText: { color: "rgba(245,230,200,0.78)", fontSize: 14, lineHeight: 21, textAlign: "center" },
  warningButtons: { flexDirection: "row", gap: 10 },
  warningCancel: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 11, borderWidth: 1, borderColor: "rgba(196,148,58,0.42)" },
  warningConfirm: { flex: 1.25, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: "#7A4D16", borderWidth: 1, borderColor: "#C4943A" },
  warningButtonText: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 13, textAlign: "center" },
});
