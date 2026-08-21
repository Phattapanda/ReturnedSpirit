import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Animated as RNAnimated,
  Image,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useAudioManager } from "@/src/audio/AudioProvider";
import SceneBackground from "@/src/components/SceneBackground";
import CurrencyHud from "@/src/components/CurrencyHud";
import DiningGuestArea, { type GuestServiceAction } from "@/src/components/GuestCard";
import GuestTutorialDialog, { type GuestTutorialDialogLine } from "@/src/components/GuestTutorialDialog";
import PlayerBag, { BagIconButton } from "@/src/components/PlayerBag";
import StatusModal from "@/src/components/StatusModal";
import {
  DEFAULT_DINING_MEAL_STATE,
  DINING_MEAL_SLOT_COUNT,
  loadDiningMealState,
  planBagItemToMealSlot,
  saveDiningMealState,
  selectActiveMealSlot,
  type DiningMealState,
} from "@/src/game/dining-meal-system";
import {
  guestTutorialHasReached,
  guestTutorialKeepsRupertInDining,
  loadGuestTutorialIntroStep,
  saveGuestTutorialIntroStep,
  type GuestTutorialIntroStep,
} from "@/src/game/guest-tutorial";
import { DEFAULT_PLAYER_STATS, PLAYER_STATS_KEY, type PlayerStats } from "@/src/game/player-stats";
import { DEFAULT_BAG, PLAYER_BAG_KEY, type PlayerBagData } from "@/src/game/item-system";
import { addCurrencyCopper } from "@/src/game/currency-system";
import { setActiveGuest, type GuestVisitView } from "@/src/game/guest-system";
import {
  grantFarmerCarrotSeedOnce,
  loadPostGuestTutorialState,
  markSecondPlotThoughtSeen,
} from "@/src/game/post-guest-tutorial";
import { createSnapshot, discardRuntimeAndRestore } from "@/src/game/save-manager";
import {
  PLAYER_AVATAR_KEY,
  getPlayerAvatarForStamina,
  normalizePlayerAvatarId,
  type PlayerAvatarId,
} from "@/src/game/player-avatar";

const DSK = {
  STAMINA:       "@game:stamina",
  LIFE:          "@game:life",
  PLAYER_NAME:   "@game:player_name",
  DAY_INDEX:     "@game:day_index",
  SAVE_LOCATION: "@game:save_location",
  ACTIVE_SLOT:   "@game:active_slot",
  GAME_SLOTS:    "game_slots",
} as const;

const IMG = {
  dining:        require("../assets/images/dining.png"),
  dining_dawn:   require("../assets/images/dining_dawn.png"),
  herbsoup:      require("../assets/images/herbsoup.png"),
  rupert:        require("../assets/images/rupert.png"),
  rupertsad:     require("../assets/images/rupertsad.png"),
  rupertlaugh:   require("../assets/images/rupertlaugh.png"),
  old_farmer:    require("../assets/images/old_farmer.png"),
  coin_copper:   require("../assets/images/coin_copper.png"),
  carrotseed:    require("../assets/images/carrotseed.png"),
  loc_kitchen:   require("../assets/images/gotokitchen.png"),
  loc_garden:    require("../assets/images/gotogarden.png"),
  loc_dining:    require("../assets/images/gotodining.png"),
  loc_dormitory: require("../assets/images/gotodormitory.png"),
  loc_mail:      require("../assets/images/gotomail.png"),
  loc_explore:   require("../assets/images/goexplore.png"),
};

const MEAL_IMAGES: Record<string, ReturnType<typeof require>> = {
  herbsoup: IMG.herbsoup,
};

const DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
const OLD_FARMER_SELL_PRICE_COPPER = 8;

const LOCS = [
  { id: "kitchen",   nav: true  },
  { id: "garden",    nav: false },
  { id: "dining",    nav: false },
  { id: "dormitory", nav: false },
  { id: "mail",      nav: false },
  { id: "explore",   nav: false },
] as const;

type TutorialPortrait = "rupert" | "rupert_sad" | "rupert_laugh" | "old_farmer" | "player";
type TutorialLine = {
  speaker: string;
  text: string;
  portrait: TutorialPortrait;
};

function farmerIntroduction(playerName: string): TutorialLine[] {
  return [
    { speaker: "Rupert", portrait: "rupert", text: '"Hello, who\'s there?"' },
    { speaker: "Old Farmer", portrait: "old_farmer", text: '"What - who\'s here?"' },
    { speaker: "Old Farmer", portrait: "old_farmer", text: '"You\'re actually asking that? Who else would come here besides me?"' },
    { speaker: "Rupert", portrait: "rupert_laugh", text: '"Oh, it\'s you. I\'m sorry - I kind of forgot about you."' },
    { speaker: "Old Farmer", portrait: "old_farmer", text: '"Oh, how lovely. We’ve been seeing each other almost every day for 50 years, and this is the recognition for it."' },
    { speaker: "Rupert", portrait: "rupert", text: '"Don\'t be like that. I\'m sorry."' },
    { speaker: "Old Farmer", portrait: "old_farmer", text: '"I forgive you for forgetting me if you give me something to eat."' },
    { speaker: "Old Farmer", portrait: "old_farmer", text: '"Who is this young pal behind you?"' },
    { speaker: playerName, portrait: "player", text: `"Nice to meet you, my name is ${playerName}."` },
    { speaker: "Rupert", portrait: "rupert", text: `"${playerName} will be staying here for the time being."` },
    { speaker: "Old Farmer", portrait: "old_farmer", text: '"If you\'re really sure about that... Hey, it smells delicious and I\'m hungry."' },
  ];
}

function serviceReaction(): TutorialLine[] {
  return [
    { speaker: "Old Farmer", portrait: "old_farmer", text: '"That hit the spot. I\'ll come back soon."' },
    { speaker: "Old Farmer", portrait: "old_farmer", text: '"Before I go, take this carrot seed. Maybe you can find some space for it."' },
    { speaker: "Rupert", portrait: "rupert_laugh", text: '"Not bad for your first guest."' },
  ];
}

function rupertServingExplanation(playerName: string): TutorialLine[] {
  return [
    { speaker: "Rupert", portrait: "rupert", text: '"We already ate all of the soup."' },
    { speaker: "Rupert", portrait: "rupert_laugh", text: '"Sit down, I will be quick and make a new batch of soup for my favorite guest."' },
    { speaker: "Rupert", portrait: "rupert_sad", text: '"Ouch, my back."' },
    { speaker: playerName, portrait: "player", text: '"Please, sit down, too. I will prepare the soup."' },
    { speaker: "Rupert", portrait: "rupert_sad", text: '"Are you sure?"' },
    { speaker: playerName, portrait: "player", text: '"Yes, I learned the process and I told you, I want to work here."' },
    { speaker: "Rupert", portrait: "rupert", text: '"Thank you."' },
    { speaker: "Rupert", portrait: "rupert", text: '"You would need to carry the bucket from the kitchen back to the garden in the bag to fetch fresh water."' },
    { speaker: "Rupert", portrait: "rupert", text: '"The bag is also a safe way to transport the herb soup to the dining hall."' },
  ];
}

export default function DiningScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const audioManager = useAudioManager();
  const { crossfadeTo } = audioManager;

  const [staminaCurrent, setStaminaCurrent] = useState(40);
  const [lifeCurrent, setLifeCurrent] = useState(15);
  const [playerStats, setPlayerStats] = useState<PlayerStats>(DEFAULT_PLAYER_STATS);
  const [dayIdx, setDayIdx] = useState(0);
  const [playerName, setPlayerName] = useState("Adventurer");
  const [playerAvatarId, setPlayerAvatarId] = useState<PlayerAvatarId>(1);
  const [diningLoaded, setDiningLoaded] = useState(false);
  const [headerH, setHeaderH] = useState(0);
  const [playerBag, setPlayerBag] = useState<PlayerBagData>(DEFAULT_BAG);
  const [mealState, setMealState] = useState<DiningMealState>(DEFAULT_DINING_MEAL_STATE);
  const [playerThought, setPlayerThought] = useState<string | null>(null);
  const thoughtTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [tutorialStep, setTutorialStep] = useState<GuestTutorialIntroStep>("not_started");
  const [tutorialLines, setTutorialLines] = useState<TutorialLine[]>([]);
  const [tutorialLineIndex, setTutorialLineIndex] = useState(0);
  const [serviceDialogLine, setServiceDialogLine] = useState<TutorialLine | null>(null);
  const serviceDialogNextStep = useRef<GuestTutorialIntroStep | null>(null);
  const [serviceBusy, setServiceBusy] = useState(false);
  const [departingGuestId, setDepartingGuestId] = useState<"old_farmer" | null>(null);

  const [transferImage, setTransferImage] = useState<ReturnType<typeof require> | null>(null);
  const transferX = useRef(new RNAnimated.Value(0)).current;
  const transferY = useRef(new RNAnimated.Value(0)).current;
  const transferScale = useRef(new RNAnimated.Value(1)).current;
  const transferOpacity = useRef(new RNAnimated.Value(0)).current;

  const [statusOpen, setStatusOpen] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        let loadedStats = DEFAULT_PLAYER_STATS;
        const rawStats = await AsyncStorage.getItem(PLAYER_STATS_KEY);
        if (rawStats) {
          try { loadedStats = { ...DEFAULT_PLAYER_STATS, ...JSON.parse(rawStats) }; } catch { /* default */ }
        }

        const rawSta = await AsyncStorage.getItem(DSK.STAMINA);
        const rawLife = await AsyncStorage.getItem(DSK.LIFE);
        const rawDay = await AsyncStorage.getItem(DSK.DAY_INDEX);
        const rawName = await AsyncStorage.getItem(DSK.PLAYER_NAME);
        const rawAv = await AsyncStorage.getItem(PLAYER_AVATAR_KEY);
        const rawBag = await AsyncStorage.getItem(PLAYER_BAG_KEY);
        const loadedMeals = await loadDiningMealState();
        const loadedTutorialStep = await loadGuestTutorialIntroStep();
        const resolvedName = rawName?.trim() || "Adventurer";

        if (!active) return;

        setPlayerStats(loadedStats);
        setStaminaCurrent(rawSta ? Math.min(Math.max(parseInt(rawSta, 10), 0), loadedStats.maximumStamina) : 40);
        setLifeCurrent(rawLife ? Math.min(Math.max(parseInt(rawLife, 10), 0), loadedStats.maximumLife) : 15);
        setDayIdx(rawDay !== null ? parseInt(rawDay, 10) : 0);
        setPlayerName(resolvedName);
        setPlayerAvatarId(normalizePlayerAvatarId(rawAv));
        setMealState(loadedMeals);
        if (rawBag) {
          try { setPlayerBag(JSON.parse(rawBag)); } catch { /* default */ }
        }

        if (loadedTutorialStep === "dining_intro" || loadedTutorialStep === "farmer_intro") {
          await saveGuestTutorialIntroStep("farmer_intro");
          if (!active) return;
          setTutorialStep("farmer_intro");
          setTutorialLines(farmerIntroduction(resolvedName));
          setTutorialLineIndex(0);
        } else if (loadedTutorialStep === "meal_reveal") {
          setTutorialStep("meal_reveal");
          setTutorialLines(rupertServingExplanation(resolvedName));
          setTutorialLineIndex(0);
        } else if (loadedTutorialStep === "service_reaction") {
          setTutorialStep("service_reaction");
          setTutorialLines(serviceReaction());
          setTutorialLineIndex(0);
        } else if (loadedTutorialStep === "service_departing") {
          await grantFarmerCarrotSeedOnce();
          setTutorialStep("service_departing");
          setDepartingGuestId("old_farmer");
          setTimeout(async () => {
            await setActiveGuest(null);
            await saveGuestTutorialIntroStep("service_complete");
            const postState = await loadPostGuestTutorialState();
            if (active) {
              setTutorialStep("service_complete");
              setDepartingGuestId(null);
              if (!postState.secondPlotThoughtSeen) {
                setTimeout(() => showPlayerThought("I could use a second garden bed for the carrot seed."), 250);
                await markSecondPlotThoughtSeen();
              }
            }
          }, 720);
        } else if (loadedTutorialStep === "service_complete") {
          // Save migration: Part 10 may already have been completed before the
          // Farmer gift existed. Grant it once without forcing a replay.
          await grantFarmerCarrotSeedOnce();
          const postState = await loadPostGuestTutorialState();
          setTutorialStep("service_complete");
          if (!postState.secondPlotThoughtSeen) {
            setTimeout(() => showPlayerThought("I could use a second garden bed for the carrot seed."), 450);
            await markSecondPlotThoughtSeen();
          }
        } else {
          setTutorialStep(loadedTutorialStep);
        }

        await AsyncStorage.setItem(DSK.SAVE_LOCATION, "dining");
      } catch (e) {
        if (__DEV__) console.error("[Dining] load failed:", e);
      } finally {
        if (active) setDiningLoaded(true);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    return () => {
      if (thoughtTimer.current) clearTimeout(thoughtTimer.current);
    };
  }, []);

  function showPlayerThought(text: string) {
    if (thoughtTimer.current) clearTimeout(thoughtTimer.current);
    const thought = text.trim().replace(/^["“”]+|["“”]+$/g, "");
    setPlayerThought(thought);
    thoughtTimer.current = setTimeout(() => setPlayerThought(null), 2600);
  }

  function runTransfer(
    image: ReturnType<typeof require>,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    onDone: () => void,
  ) {
    setTransferImage(image);
    transferX.setValue(fromX);
    transferY.setValue(fromY);
    transferScale.setValue(1);
    transferOpacity.setValue(1);
    RNAnimated.parallel([
      RNAnimated.timing(transferX, { toValue: toX, duration: 700, useNativeDriver: true }),
      RNAnimated.timing(transferY, { toValue: toY, duration: 700, useNativeDriver: true }),
      RNAnimated.timing(transferScale, { toValue: 0.35, duration: 700, useNativeDriver: true }),
    ]).start(() => {
      transferOpacity.setValue(0);
      setTransferImage(null);
      onDone();
    });
  }

  function showServiceDialog(line: TutorialLine, nextStep: GuestTutorialIntroStep) {
    serviceDialogNextStep.current = nextStep;
    setServiceDialogLine(line);
  }

  async function closeServiceDialog() {
    const next = serviceDialogNextStep.current;
    serviceDialogNextStep.current = null;
    setServiceDialogLine(null);
    if (!next) return;
    await saveGuestTutorialIntroStep(next);
    setTutorialStep(next);
  }

  async function advanceTutorialDialog() {
    if (tutorialLineIndex < tutorialLines.length - 1) {
      setTutorialLineIndex((current) => current + 1);
      return;
    }

    if (tutorialStep === "farmer_intro") {
      await saveGuestTutorialIntroStep("meal_reveal");
      setTutorialStep("meal_reveal");
      setTutorialLines(rupertServingExplanation(playerName));
      setTutorialLineIndex(0);
      return;
    }

    if (tutorialStep === "meal_reveal") {
      await saveGuestTutorialIntroStep("ready_for_water");
      setTutorialStep("ready_for_water");
      setTutorialLines([]);
      setTutorialLineIndex(0);
      return;
    }

    if (tutorialStep === "service_reaction") {
      await grantFarmerCarrotSeedOnce();
      await saveGuestTutorialIntroStep("service_departing");
      setTutorialStep("service_departing");
      setTutorialLines([]);
      setTutorialLineIndex(0);
      setDepartingGuestId("old_farmer");
      setTimeout(async () => {
        await setActiveGuest(null);
        await saveGuestTutorialIntroStep("service_complete");
        setTutorialStep("service_complete");
        setDepartingGuestId(null);
        const postState = await loadPostGuestTutorialState();
        if (!postState.secondPlotThoughtSeen) {
          showPlayerThought("I could use a second garden bed for the carrot seed.");
          await markSecondPlotThoughtSeen();
        }
      }, 720);
    }
  }

  function tutorialPortraitSource(portrait: TutorialPortrait): ReturnType<typeof require> {
    if (portrait === "player") return getPlayerAvatarForStamina(playerAvatarId, staminaCurrent);
    if (portrait === "old_farmer") return IMG.old_farmer;
    if (portrait === "rupert_sad") return IMG.rupertsad;
    if (portrait === "rupert_laugh") return IMG.rupertlaugh;
    return IMG.rupert;
  }

  const currentTutorialLine = serviceDialogLine ?? tutorialLines[tutorialLineIndex] ?? null;
  const dialogLine: GuestTutorialDialogLine | null = currentTutorialLine ? {
    speaker: currentTutorialLine.speaker,
    text: currentTutorialLine.text,
    portrait: tutorialPortraitSource(currentTutorialLine.portrait),
    playerPortrait: currentTutorialLine.portrait === "player",
  } : null;

  const tutorialInDining = guestTutorialHasReached(tutorialStep, "dining_intro");
  const showDiningServiceUi = !tutorialInDining || guestTutorialHasReached(tutorialStep, "meal_reveal");
  const showRupertInDining = tutorialStep === "meal_reveal" || guestTutorialKeepsRupertInDining(tutorialStep);
  const useDawnBackground = tutorialInDining && tutorialStep !== "service_complete";
  const diningTheme = useDawnBackground ? "dining-dawn" : "dining";

  // Keep the room music tied to the same mode that selects the background.
  // Focus-based playback also restores the correct theme when returning from
  // another screen that remained mounted in the navigation stack.
  useFocusEffect(
    React.useCallback(() => {
      if (!diningLoaded) return;
      crossfadeTo(diningTheme, 3000);
    }, [crossfadeTo, diningLoaded, diningTheme]),
  );

  async function handleBagToMealSlot(bagSlotIndex: number) {
    const plan = planBagItemToMealSlot(playerBag, bagSlotIndex, mealState);

    if (!plan.ok) {
      if (plan.reason === "missing_item") return;
      setBagOpen(false);
      if (plan.reason === "not_edible") {
        showPlayerThought("I can't serve this.");
      } else {
        showPlayerThought("There is no free meal slot.");
      }
      return;
    }

    setPlayerBag(plan.bag);
    setMealState(plan.mealState);
    audioManager.playSoundEffect("moveitem", { maxDurationMs: 3000 });

    if (tutorialStep === "ready_for_water" && plan.mealState.slots[plan.targetSlotIndex]?.id === "herbsoup") {
      await setActiveGuest("old_farmer");
      await saveGuestTutorialIntroStep("service_sell");
      setTutorialStep("service_sell");
    }

    try {
      await Promise.all([
        AsyncStorage.setItem(PLAYER_BAG_KEY, JSON.stringify(plan.bag)),
        saveDiningMealState(plan.mealState),
      ]);
    } catch (e) {
      if (__DEV__) console.error("[Dining] meal transfer save failed:", e);
    }
  }

  async function handleGuestService(guest: GuestVisitView, action: GuestServiceAction) {
    if (serviceBusy || guest.profile.id !== "old_farmer") return;

    if (tutorialStep === "service_sell" && action === "sell") {
      const activeIndex = mealState.activeSlotIndex;
      const activeMeal = activeIndex !== null ? mealState.slots[activeIndex] : null;
      if (activeIndex === null || activeMeal?.id !== "herbsoup") {
        showPlayerThought("I need to select the Herb Soup first.");
        return;
      }

      setServiceBusy(true);
      const nextSlots = [...mealState.slots];
      nextSlots[activeIndex] = null;
      const nextMealState: DiningMealState = { ...mealState, slots: nextSlots, activeSlotIndex: null };
      setMealState(nextMealState);
      await saveDiningMealState(nextMealState);
      audioManager.playSoundEffect("moveitem", { maxDurationMs: 3000 });

      runTransfer(
        IMG.herbsoup,
        W * 0.5 - 18,
        headerH + 165,
        W * 0.42 - 18,
        headerH + 330,
        () => {
          audioManager.playSoundEffect("bling", { maxDurationMs: 2000 });
          runTransfer(
            IMG.coin_copper,
            W * 0.42 - 14,
            headerH + 330,
            W - 70,
            insets.top + 68,
            async () => {
              await addCurrencyCopper(OLD_FARMER_SELL_PRICE_COPPER);
              setServiceBusy(false);
              showServiceDialog(
                { speaker: "Old Farmer", portrait: "old_farmer", text: '"Delicious. Here are 8 Copper."' },
                "service_exchange",
              );
            },
          );
        },
      );
      return;
    }

    if (tutorialStep === "service_exchange" && action === "exchange") {
      showServiceDialog(
        { speaker: "Rupert", portrait: "rupert", text: '"Some guests may offer an item instead of Copper. That is what Exchange is for."' },
        "service_water",
      );
      return;
    }

    if (tutorialStep === "service_water" && action === "water") {
      showServiceDialog(
        { speaker: "Old Farmer", portrait: "old_farmer", text: '"Water? No, thank you. I came here for something to eat."' },
        "service_talk",
      );
      return;
    }

    if (tutorialStep === "service_talk" && action === "talk") {
      await saveGuestTutorialIntroStep("service_reaction");
      setTutorialStep("service_reaction");
      setTutorialLines(serviceReaction());
      setTutorialLineIndex(0);
    }
  }

  async function handleMealSlotTap(slotIndex: number) {
    if (!mealState.slots[slotIndex]) return;
    const next = selectActiveMealSlot(mealState, slotIndex);
    if (next.activeSlotIndex === mealState.activeSlotIndex) return;
    setMealState(next);
    try {
      await saveDiningMealState(next);
    } catch (e) {
      if (__DEV__) console.error("[Dining] active meal save failed:", e);
    }
  }

  async function updateSaveSlot(day: number, stamina: number, life: number): Promise<number> {
    try {
      const rawSlot = await AsyncStorage.getItem(DSK.ACTIVE_SLOT);
      const rawSlots = await AsyncStorage.getItem(DSK.GAME_SLOTS);
      if (!rawSlot || !rawSlots) return -1;
      const slotNum = parseInt(rawSlot, 10);
      const slots = JSON.parse(rawSlots);
      const updated = slots.map((s: { slot: number }) =>
        s.slot === slotNum
          ? { ...s, dayIdx: day, stamina, life, lastSaved: new Date().toISOString() }
          : s,
      );
      await AsyncStorage.setItem(DSK.GAME_SLOTS, JSON.stringify(updated));
      return slotNum;
    } catch { return -1; }
  }

  async function handleManualSave() {
    setShowMenu(false);
    try {
      const slotNum = await updateSaveSlot(dayIdx, staminaCurrent, lifeCurrent);
      if (slotNum > 0) {
        await AsyncStorage.setItem(DSK.SAVE_LOCATION, "dining");
        await createSnapshot(slotNum, "manual");
      }
    } catch (e) {
      if (__DEV__) console.error("[Dining] manual save failed:", e);
    }
  }

  async function handleMainMenu() {
    setShowMenu(false);
    audioManager.stopGameplayMusic(1500);
    try {
      const rawSlot = await AsyncStorage.getItem(DSK.ACTIVE_SLOT);
      if (rawSlot) await discardRuntimeAndRestore(parseInt(rawSlot, 10));
    } catch { /* non-critical */ }
    router.replace("/");
  }

  function goToKitchen() {
    audioManager.playSoundEffect("footstep", { maxDurationMs: 4000 });
    router.replace("/kitchen");
  }

  const staminaPct = Math.max(0, Math.min(1, staminaCurrent / (playerStats.maximumStamina || 1)));
  const lifePct = Math.max(0, Math.min(1, lifeCurrent / (playerStats.maximumLife || 1)));

  return (
    <View style={styles.root}>
      <CurrencyHud />

      <SceneBackground source={useDawnBackground ? IMG.dining_dawn : IMG.dining} topOffset={headerH} />
      <View style={[StyleSheet.absoluteFill, { top: headerH }, styles.bgOverlay]} pointerEvents="none" />

      <View
        style={[styles.header, { paddingTop: insets.top + 6 }]}
        onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
      >
        <View style={styles.headerTopRow}>
          <View style={styles.leftHeader}>
            <View style={styles.statBarOuter}>
              <Ionicons name="flash" size={15} color="#C4943A" />
              <View style={styles.statBarTrack}>
                <View style={[styles.statBarFill, styles.staminaFill, { width: `${staminaPct * 100}%` }]}> 
                  <View style={styles.staminaReflex} />
                </View>
              </View>
              <Text style={styles.statBarText}>{staminaCurrent}/{playerStats.maximumStamina}</Text>
            </View>
            <View style={styles.statBarOuter}>
              <Ionicons name="heart" size={13} color="#CC2200" />
              <View style={styles.statBarTrack}>
                <View style={[styles.statBarFill, styles.lifeFill, { width: `${lifePct * 100}%` }]} />
              </View>
              <Text style={styles.statBarText}>{lifeCurrent}/{playerStats.maximumLife}</Text>
            </View>
          </View>

          <View style={styles.rightHeader}>
            <View style={styles.dayBadge}>
              <Text style={styles.dayText}>{DAYS[dayIdx] ?? DAYS[0]}</Text>
            </View>
            <TouchableOpacity style={styles.menuBtn} onPress={() => setShowMenu(true)} activeOpacity={0.8}>
              <Ionicons name="menu" size={22} color="#F5E6C8" />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.locationName}>Dining Hall</Text>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
        bounces={false}
        scrollEnabled={!dialogLine}
      >
        <View style={styles.portraitRow}>
          <TouchableOpacity
            style={styles.circleWrap}
            onPress={() => setStatusOpen(true)}
            activeOpacity={0.8}
          >
            <Image
              source={getPlayerAvatarForStamina(playerAvatarId, staminaCurrent)}
              style={[styles.circleImg, styles.playerPortraitImage]}
              resizeMode="cover"
              resizeMethod="resize"
            />
          </TouchableOpacity>

          <View style={[styles.circleWrap, !showRupertInDining && styles.rupertReserve]} pointerEvents="none">
            {showRupertInDining && (
              <Image source={IMG.rupert} style={[styles.circleImg, styles.npcPortraitImage]} resizeMode="cover" resizeMethod="resize" />
            )}
          </View>

          <BagIconButton
            unlocked={playerBag.unlocked}
            onPress={() => setBagOpen(true)}
          />

          {playerThought && (
            <View
              style={[styles.playerThoughtWrap, { width: Math.min(W * 0.72, Math.max(150, playerThought.length * 6.6 + 32)) }]}
              pointerEvents="none"
            >
              <View style={styles.playerThoughtArrow} />
              <View style={styles.playerThoughtCard}>
                <Text style={styles.playerThoughtText}>{playerThought}</Text>
              </View>
            </View>
          )}
        </View>

        {showDiningServiceUi && (
          <>
            <View style={styles.mealBar}>
              {Array.from({ length: DINING_MEAL_SLOT_COUNT }).map((_, i) => {
                const meal = mealState.slots[i];
                const isActive = mealState.activeSlotIndex === i && !!meal;
                const mealImage = meal ? MEAL_IMAGES[meal.id] : null;

                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.mealSlot, isActive && styles.mealSlotActive]}
                    activeOpacity={meal ? 0.78 : 1}
                    disabled={!meal || !!dialogLine}
                    onPress={() => handleMealSlotTap(i)}
                  >
                    {meal ? (
                      mealImage ? (
                        <Image source={mealImage} style={styles.mealImage} resizeMode="contain" resizeMethod="resize" />
                      ) : (
                        <Text style={styles.mealFallbackText} numberOfLines={2}>{meal.name}</Text>
                      )
                    ) : (
                      <Ionicons name="restaurant-outline" size={22} color="rgba(196,148,58,0.34)" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <DiningGuestArea
              dayIndex={dayIdx}
              forcedActiveGuestId={tutorialStep.startsWith("service_") && tutorialStep !== "service_complete" ? "old_farmer" : null}
              enabledService={
                serviceBusy ? null :
                tutorialStep === "service_sell" ? "sell" :
                tutorialStep === "service_exchange" ? "exchange" :
                tutorialStep === "service_water" ? "water" :
                tutorialStep === "service_talk" ? "talk" : null
              }
              sellPriceCopper={OLD_FARMER_SELL_PRICE_COPPER}
              departingGuestId={departingGuestId}
              hiddenGuestIds={tutorialStep === "service_complete" ? ["old_farmer"] : []}
              onService={handleGuestService}
            />
          </>
        )}
      </ScrollView>

      <View style={[styles.locationBar, { paddingBottom: insets.bottom + 4 }]}>
        {LOCS.map((loc) => {
          const isCurrent = loc.id === "dining";
const coreTravelUnlocked = guestTutorialHasReached(tutorialStep, "service_complete");
const guestDormitoryBlocked = guestTutorialKeepsRupertInDining(tutorialStep) && loc.id === "dormitory";
const coreDestination = coreTravelUnlocked &&
  (loc.id === "kitchen" || loc.id === "garden" || loc.id === "dormitory");
const locImg = IMG[`loc_${loc.id}` as keyof typeof IMG] as number | undefined;
const active = loc.id === "kitchen" || isCurrent || coreDestination || guestDormitoryBlocked;

const content = locImg ? (
  <Image
    source={locImg}
    style={[styles.locBtnImg, !active && styles.locBtnImgLocked]}
    resizeMode="contain"
    resizeMethod="resize"
  />
) : (
  <Ionicons name="help-outline" size={22} color={active ? "#F5E6C8" : "#3A3535"} />
);

const locationAction = guestDormitoryBlocked
  ? () => showPlayerThought("I need to cook herb soup for the guest.")
  : loc.id === "kitchen"
    ? goToKitchen
    : loc.id === "garden" && coreDestination
      ? () => {
          audioManager.playSoundEffect("footstep", { maxDurationMs: 4000 });
          router.replace("/garden");
        }
      : loc.id === "dormitory" && coreDestination
        ? () => {
            audioManager.playSoundEffect("walking-on-wood", { maxDurationMs: 5000 });
            router.replace("/dormitory");
          }
        : undefined;

          return (
            <TouchableOpacity
              key={loc.id}
              style={[
                styles.locBtn,
                isCurrent ? styles.locBtnCurrent : (active ? styles.locBtnActive : styles.locBtnLocked),
              ]}
              disabled={!locationAction || !!dialogLine}
              onPress={locationAction}
              activeOpacity={0.8}
            >
              {content}
            </TouchableOpacity>
          );
        })}
      </View>

      <GuestTutorialDialog
        visible={!!dialogLine}
        line={dialogLine}
        onContinue={serviceDialogLine ? closeServiceDialog : advanceTutorialDialog}
      />

      {transferImage && (
        <RNAnimated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 36,
            height: 36,
            zIndex: 1200,
            opacity: transferOpacity,
            transform: [
              { translateX: transferX },
              { translateY: transferY },
              { scale: transferScale },
            ],
          }}
        >
          <Image source={transferImage} style={{ width: 36, height: 36 }} resizeMode="contain" />
        </RNAnimated.View>
      )}

      <Modal visible={showMenu} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.confirmPanel}>
            <Text style={styles.confirmTitle}>Menu</Text>
            <View style={{ height: 1, backgroundColor: "rgba(196,148,58,0.22)", marginVertical: 8, alignSelf: "stretch" }} />
            {[
              { icon: "play" as const, label: "Resume", action: () => setShowMenu(false) },
              { icon: "book-outline" as const, label: "Logbook", action: () => { setShowMenu(false); router.push("/logbook"); } },
              { icon: "save-outline" as const, label: "Save", action: handleManualSave },
              { icon: "home-outline" as const, label: "Main Menu", action: handleMainMenu },
              { icon: "settings-outline" as const, label: "Settings", action: () => { setShowMenu(false); router.push("/settings"); } },
            ].map((item) => (
              <TouchableOpacity
                key={item.label}
                style={styles.menuRow}
                onPress={item.action}
                activeOpacity={0.7}
              >
                <Ionicons name={item.icon} size={20} color="#C4943A" />
                <Text style={styles.menuRowText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      <PlayerBag
        bag={playerBag}
        visible={bagOpen}
        context="room"
        dayIdx={dayIdx}
        onClose={() => setBagOpen(false)}
        onTransferItem={(slotIdx) => handleBagToMealSlot(slotIdx)}
      />

      <StatusModal
        visible={statusOpen}
        stats={playerStats}
        currentStamina={staminaCurrent}
        currentLife={lifeCurrent}
        onClose={() => setStatusOpen(false)}
        onStatsUpdated={(newStats, newLife) => {
          setPlayerStats(newStats);
          if (newLife !== null) setLifeCurrent(newLife);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0500" },
  bgOverlay: { backgroundColor: "rgba(0,0,0,0.30)" },

  header: {
    flexDirection: "column",
    paddingHorizontal: 12,
    paddingBottom: 6,
    backgroundColor: "rgba(14,7,1,0.85)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(196,148,58,0.20)",
    zIndex: 2,
  },
  headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  leftHeader: { flex: 1, gap: 5 },
  statBarOuter: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(10,5,0,0.82)",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(130,90,20,0.50)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 7,
  },
  statBarTrack: { flex: 1, height: 9, borderRadius: 5, backgroundColor: "#2A1800", overflow: "hidden" },
  statBarFill: { height: "100%", borderRadius: 5 },
  staminaFill: { backgroundColor: "#C4943A" },
  staminaReflex: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "45%",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 4,
  },
  lifeFill: { backgroundColor: "#CC2200" },
  statBarText: { color: "#F0E8D5", fontSize: 11, fontFamily: "Oldenburg", minWidth: 40, textAlign: "right" },
  locationName: { color: "#F0E8D5", fontSize: 13, fontFamily: "Oldenburg", letterSpacing: 1, textAlign: "center", marginTop: 4 },
  rightHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 10 },
  dayBadge: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: "rgba(196,148,58,0.16)",
    borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.38)",
    alignItems: "center",
    justifyContent: "center",
  },
  dayText: { color: "#F5E6C8", fontSize: 13, fontFamily: "Oldenburg", letterSpacing: 0.5 },
  menuBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(196,148,58,0.16)",
    borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.38)",
    alignItems: "center",
    justifyContent: "center",
  },

  scrollArea: { flex: 1, zIndex: 1 },

  portraitRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 22,
    paddingVertical: 12,
    backgroundColor: "rgba(14,7,1,0.65)",
    position: "relative",
    zIndex: 4,
  },
  circleWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: "hidden",
    borderWidth: 2.5,
    borderColor: "#C4943A",
    backgroundColor: "#2C1810",
  },
  circleImg: { width: "100%", height: "100%" },
  playerPortraitImage: { transform: [{ scale: 1.06 }] },
  npcPortraitImage: { transform: [{ scale: 1.06 }] },
  rupertReserve: {
    opacity: 0,
    borderColor: "transparent",
    backgroundColor: "transparent",
  },
  playerThoughtWrap: {
    position: "absolute",
    left: 14,
    top: 104,
    maxWidth: 280,
    zIndex: 30,
  },
  playerThoughtArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "rgba(240,230,200,0.97)",
    marginLeft: 34,
  },
  playerThoughtCard: {
    backgroundColor: "rgba(240,230,200,0.97)",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.50)",
    paddingHorizontal: 13,
    paddingVertical: 9,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 7,
    elevation: 14,
  },
  playerThoughtText: {
    color: "#2A1000",
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "RobotoItalic",
  },

  mealBar: {
    marginHorizontal: 8,
    marginVertical: 5,
    flexDirection: "row",
    gap: 4,
    backgroundColor: "rgba(10,6,1,0.90)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(90,65,30,0.35)",
    padding: 5,
    overflow: "hidden",
  },
  mealSlot: {
    flex: 1,
    aspectRatio: 1,
    minHeight: 44,
    backgroundColor: "rgba(20,11,3,0.93)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(90,65,30,0.42)",
    alignItems: "center",
    justifyContent: "center",
  },
  mealSlotActive: {
    borderWidth: 2,
    borderColor: "#D8A64A",
    backgroundColor: "rgba(47,25,6,0.97)",
  },
  mealImage: {
    width: "82%",
    height: "82%",
  },
  mealFallbackText: {
    color: "#F0E8D5",
    fontSize: 8,
    lineHeight: 10,
    textAlign: "center",
    fontFamily: "Oldenburg",
    paddingHorizontal: 2,
  },

  locationBar: {
    flexDirection: "row",
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: "rgba(10,5,1,0.93)",
    borderTopWidth: 1,
    borderTopColor: "rgba(196,148,58,0.20)",
    zIndex: 2,
  },
  locBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 54,
  },
  locBtnActive: { backgroundColor: "rgba(196,148,58,0.22)", borderColor: "rgba(196,148,58,0.55)" },
  locBtnCurrent: { backgroundColor: "rgba(196,148,58,0.26)", borderColor: "rgba(196,148,58,0.65)" },
  locBtnLocked: { backgroundColor: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" },
  locBtnImg: { width: 42, height: 42 },
  locBtnImgLocked: { opacity: 0.20 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.76)",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmPanel: {
    width: "82%",
    backgroundColor: "#160B03",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.38)",
    alignItems: "center",
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 24,
  },
  confirmTitle: { color: "#F5E6C8", fontSize: 17, fontFamily: "Oldenburg", letterSpacing: 0.8, textAlign: "center" },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 13,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignSelf: "stretch",
  },
  menuRowText: { color: "#F0E8D5", fontSize: 15, fontFamily: "Oldenburg", letterSpacing: 0.4 },
});
