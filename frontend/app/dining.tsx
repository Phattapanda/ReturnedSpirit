import React, { useCallback, useEffect, useRef, useState } from "react";
import { useManagedTimers } from "@/src/hooks/use-managed-timers";
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
  type ImageSourcePropType,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useAudioManager } from "@/src/audio/AudioProvider";
import { useHaptics } from "@/src/feedback/haptics-provider";
import SceneBackground from "@/src/components/SceneBackground";
import CurrencyHud from "@/src/components/CurrencyHud";
import DiningGuestArea, {
  getGuestExchangeImage,
  type GuestServiceAction,
  type GuestServiceSourcePoint,
} from "@/src/components/GuestCard";
import GuestTutorialDialog, { type GuestTutorialDialogLine } from "@/src/components/GuestTutorialDialog";
import { DIALOG_CHARACTER_ASSETS, OLD_FARMER_DIALOG_SCALE, RUPERT_DIALOG_SCALE, getDialogExpressionForStamina, getPlayerDialogCharacter, getPlayerDialogScale } from "@/src/assets/dialog-character-assets";
import PlayerBag, { BagIconButton } from "@/src/components/PlayerBag";
import StatusModal from "@/src/components/StatusModal";
import QuestBookButton from "@/src/components/quest-book";
import PortraitBubble, { portraitBubbleTop } from "@/src/components/portrait-bubble";
import TavernLocationTransition from "@/src/components/tavern-location-transition";
import CivilServantDialog from "@/src/components/CivilServantDialog";
import RunEndingOverlay from "@/src/components/RunEndingOverlay";
import {
  LocationStatusBadge,
  notifyLocationStatusChanged,
  useLocationStatusBadges,
} from "@/src/components/location-status-badges";
import {
  DEFAULT_DINING_MEAL_STATE,
  DINING_MEAL_STATE_KEY,
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
import { DEFAULT_PLAYER_STATS, PLAYER_STATS_KEY, normalizePlayerStats, type PlayerStats } from "@/src/game/player-stats";
import {
  DEFAULT_BAG,
  MEAL_TAG,
  PLAYER_BAG_KEY,
  getMealBaseSellPriceCopper,
  hasMealTag,
  normalizePlayerBagData,
  type PlayerBagData,
} from "@/src/game/item-system";
import { addCurrencyCopper } from "@/src/game/currency-system";
import { recordTavernService } from "@/src/game/tavern-quest-system";
import {
  addGuestFavor,
  evaluateGuestMealFavor,
  getMerchantExchangeOffer,
  loadGuestState,
  markGuestServed as persistGuestServed,
  setActiveGuest,
  setCurrentGuestExchangeOffer,
  type GuestId,
  type GuestMealReaction,
  type GuestVisitView,
} from "@/src/game/guest-system";
import { completeGuestExchange } from "@/src/game/guest-exchange";
import {
  DEFAULT_POST_GUEST_TUTORIAL_STATE,
  areRegularGuestsUnlockedForDay,
  getTavernBeverage,
  grantFarmerCarrotSeedOnce,
  loadPostGuestTutorialState,
  markSecondPlotThoughtSeen,
  type TavernBeverage,
} from "@/src/game/post-guest-tutorial";
import { createSnapshot, discardRuntimeAndRestore } from "@/src/game/save-manager";
import { setPlaytimePaused } from "@/src/game/playtime-tracker";
import {
  PLAYER_AVATAR_KEY,
  getPlayerAvatarForStamina,
  normalizePlayerAvatarId,
  type PlayerAvatarId,
} from "@/src/game/player-avatar";
import { prepareNextRun } from "@/src/game/next-run";
import {
  loadTitheState,
  resolveCurrentTithe,
  type TitheState,
} from "@/src/game/tithe-system";
import { loadExploreNavigationUnlocked, loadTravelState, unlockExploreFromCoachman } from "@/src/game/travel-system";
import { appendLogEntry, loadLogbook } from "@/src/game/logbook";

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
  soup_herb:      require("../assets/images/soup_herb.png"),
  soup_carrot:    require("../assets/images/soup_carrot.png"),
  soup_potato:    require("../assets/images/soup_potato.png"),
  soup_onion:     require("../assets/images/soup_onion.png"),
  soup_carrot_potato: require("../assets/images/soup_carrot-potato.png"),
  stew_vegetable: require("../assets/images/stew_vegetable.png"),
  soup_ember_egg: require("../assets/images/soup_ember_egg.png"),
  stew_beef: require("../assets/images/stew_beef.png"),
  stew_chicken: require("../assets/images/stew_chicken.png"),
  stew_ember_chicken: require("../assets/images/stew_ember_chicken.png"),
  stew_fisherman: require("../assets/images/stew_fisherman.png"),
  pan_farmhouse: require("../assets/images/farmhouse_pan.png"),
  snowberrysherbet: require("../assets/images/snowberry_sherbet.png"),
  rupert:        require("../assets/images/rupert.png"),
  rupertsad:     require("../assets/images/rupertsad.png"),
  rupertlaugh:   require("../assets/images/rupertlaugh.png"),
  old_farmer:    require("../assets/images/old_farmer.png"),
  coachman:       require("../assets/images/coachman.png"),
  merchant:       require("../assets/images/merchant.png"),
  traveler:       require("../assets/images/traveler.png"),
  city_guard:     require("../assets/images/city_guard.png"),
  local_boozer:   require("../assets/images/local_boozer.png"),
  civil_servant: require("../assets/images/civil_servant.png"),
  coin_copper:   require("../assets/images/coin_copper.png"),
  seed_carrot:   require("../assets/images/seed_carrot.png"),
  bag1:          require("../assets/images/bag1.png"),
  loc_kitchen:   require("../assets/images/gotokitchen.png"),
  loc_garden:    require("../assets/images/gotogarden.png"),
  loc_dining:    require("../assets/images/gotodining.png"),
  loc_dormitory: require("../assets/images/gotodormitory.png"),
  loc_mail:      require("../assets/images/gotomail.png"),
  loc_explore:   require("../assets/images/goexplore.png"),
};

const MEAL_IMAGES: Record<string, ImageSourcePropType> = {
  soup_herb: IMG.soup_herb,
  soup_carrot: IMG.soup_carrot,
  soup_potato: IMG.soup_potato,
  soup_onion: IMG.soup_onion,
  soup_carrot_potato: IMG.soup_carrot_potato,
  stew_vegetable: IMG.stew_vegetable,
  soup_ember_egg: IMG.soup_ember_egg,
  stew_beef: IMG.stew_beef,
  stew_chicken: IMG.stew_chicken,
  stew_ember_chicken: IMG.stew_ember_chicken,
  stew_fisherman: IMG.stew_fisherman,
  pan_farmhouse: IMG.pan_farmhouse,
  snowberrysherbet: IMG.snowberrysherbet,
};

const DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
const OLD_FARMER_SELL_PRICE_COPPER = 9;

const LOCS = [
  { id: "kitchen",   nav: true  },
  { id: "garden",    nav: false },
  { id: "dining",    nav: false },
  { id: "dormitory", nav: false },
  { id: "mail",      nav: false },
  { id: "explore",   nav: false },
] as const;

type TutorialPortrait = "rupert" | "rupert_sad" | "rupert_laugh" | "old_farmer" | "coachman" | "merchant" | "traveler" | "city_guard" | "local_boozer" | "player";
type TutorialLine = {
  id?: string;
  speaker: string;
  text: string;
  portrait: TutorialPortrait;
  highlightedPhrases?: readonly string[];
};

function dialogPortraitForGuest(guestId: GuestId): TutorialPortrait {
  if (guestId === "old_farmer") return "old_farmer";
  if (guestId === "coachman") return "coachman";
  if (guestId === "merchant") return "merchant";
  if (guestId === "traveler") return "traveler";
  if (guestId === "city_guard") return "city_guard";
  if (guestId === "local_boozer") return "local_boozer";
  return "rupert";
}

type CivilDialogStage = "introduction" | "amount" | "paid" | "deferred" | "warning";

function coachmanIntroduction(playerName: string): TutorialLine[] {
  return [
    { speaker: "Coachman", portrait: "coachman", text: '"Good morning. A new face?"' },
    { speaker: playerName, portrait: "player", text: '"Good morning, nice to meet you. I\'m staying here for the time being."' },
    { speaker: "Coachman", portrait: "coachman", text: '"Nice to meet you, too. I’m the local carriage driver. I currently come by here every Wednesday, Friday, and Saturday. I can take you along for a fee, but the further away the destination, the higher the fee."' },
    { speaker: playerName, portrait: "player", text: '"Thanks for the information. Then we\'ll be seeing each other more often."' },
    { speaker: "Coachman", portrait: "coachman", text: '"Yes. But first, I’d like something hot to eat. I’ll wait outside the door after I’ve eaten, in case you want to come along."' },
  ];
}

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
    { id: "dining.tutorial.carrot_gift", speaker: "Old Farmer", portrait: "old_farmer", text: '"Before I go, take these carrot seeds as a welcome gift. Please take good care of the old man over there."', highlightedPhrases: ["take these carrot seeds as a welcome gift"] },
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
    {
      id: "dining.tutorial.carry_bucket",
      speaker: "Rupert",
      portrait: "rupert",
      text: '"You have to carry the bucket in the bag to fetch fresh water from the well."',
      highlightedPhrases: ["carry the bucket in the bag to fetch fresh water"],
    },
    {
      id: "dining.tutorial.carry_meals",
      speaker: "Rupert",
      portrait: "rupert",
      text: '"You can carry meals from the kitchen to the dining hall in the bag."',
      highlightedPhrases: ["carry meals", "in the bag"],
    },
  ];
}

const RUPERT_MEAL_BAG_INSTRUCTION: TutorialLine = {
  id: "dining.tutorial.take_meal_out",
  speaker: "Rupert",
  portrait: "rupert",
  text: '"Please take the meal out of your bag and place it on the counter."',
  highlightedPhrases: ["take the meal out of your bag"],
};

async function logHighlightedDiningLine(line: TutorialLine, dayIndex: number) {
  if (!line.id || !line.highlightedPhrases?.length) return;
  const existing = await loadLogbook();
  await appendLogEntry(line.id, line.speaker, line.text, DAYS[dayIndex] ?? DAYS[0], "dining", existing);
}

export default function DiningScreen() {
  const {
    setManagedTimeout: setTimeout,
    clearManagedTimeout: clearTimeout,
  } = useManagedTimers();
  const router = useRouter();
  const { harvestReady, merchantPresent, receptionistPresent, sleepReady } = useLocationStatusBadges();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const audioManager = useAudioManager();
  const { triggerHaptic } = useHaptics();
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
  const [rupertMealInstructionVisible, setRupertMealInstructionVisible] = useState(false);
  const thoughtTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [tutorialStep, setTutorialStep] = useState<GuestTutorialIntroStep>("not_started");
  const [tutorialLines, setTutorialLines] = useState<TutorialLine[]>([]);
  const [tutorialLineIndex, setTutorialLineIndex] = useState(0);
  const [serviceDialogLine, setServiceDialogLine] = useState<TutorialLine | null>(null);
  const [favorDialogLine, setFavorDialogLine] = useState<TutorialLine | null>(null);
  const serviceDialogNextStep = useRef<GuestTutorialIntroStep | null>(null);
  const serviceDialogDoneRef = useRef<(() => void) | null>(null);
  const [coachmanIntroLines, setCoachmanIntroLines] = useState<TutorialLine[]>([]);
  const [coachmanIntroIndex, setCoachmanIntroIndex] = useState(0);
  const [exploreUnlocked, setExploreUnlocked] = useState(false);
  const [serviceBusy, setServiceBusy] = useState(false);
  const [departingGuestId, setDepartingGuestId] = useState<GuestId | null>(null);
  const [hiddenGuestIds, setHiddenGuestIds] = useState<GuestId[]>([]);
  const [tavernBeverage, setTavernBeverage] = useState<TavernBeverage>(() => getTavernBeverage(DEFAULT_POST_GUEST_TUTORIAL_STATE));

  const [transferImage, setTransferImage] = useState<ImageSourcePropType | null>(null);
  const transferX = useRef(new RNAnimated.Value(0)).current;
  const transferY = useRef(new RNAnimated.Value(0)).current;
  const transferScale = useRef(new RNAnimated.Value(1)).current;
  const transferOpacity = useRef(new RNAnimated.Value(0)).current;
  const [transferAboveDialog, setTransferAboveDialog] = useState(false);
  const bagButtonRef = useRef<View>(null);
  const gardenNavButtonRef = useRef<View>(null);
  const currencyTargetRef = useRef<View>(null);
  const civilServantAnchorRef = useRef<GuestServiceSourcePoint | null>(null);
  const [portraitRowWidth, setPortraitRowWidth] = useState(W);
  const [playerPortraitFrame, setPlayerPortraitFrame] = useState({ x: 0, y: 0, width: 96, height: 96 });
  const [rupertPortraitFrame, setRupertPortraitFrame] = useState({ x: W / 2 - 48, y: 0, width: 96, height: 96 });

  const [statusOpen, setStatusOpen] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    void setPlaytimePaused(showMenu);
    return () => { void setPlaytimePaused(false); };
  }, [showMenu]);
  const [bagOpen, setBagOpen] = useState(false);
  const [titheState, setTitheState] = useState<TitheState | null>(null);
  const [civilDialogStage, setCivilDialogStage] = useState<CivilDialogStage | null>(null);
  const [titheBusy, setTitheBusy] = useState(false);
  const [runTransitionBusy, setRunTransitionBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        let loadedStats = DEFAULT_PLAYER_STATS;
        const rawStats = await AsyncStorage.getItem(PLAYER_STATS_KEY);
        if (rawStats) {
          try { loadedStats = normalizePlayerStats(JSON.parse(rawStats)); } catch { /* default */ }
        }

        const rawSta = await AsyncStorage.getItem(DSK.STAMINA);
        const rawLife = await AsyncStorage.getItem(DSK.LIFE);
        const rawDay = await AsyncStorage.getItem(DSK.DAY_INDEX);
        const rawName = await AsyncStorage.getItem(DSK.PLAYER_NAME);
        const rawAv = await AsyncStorage.getItem(PLAYER_AVATAR_KEY);
        const rawBag = await AsyncStorage.getItem(PLAYER_BAG_KEY);
        const loadedMeals = await loadDiningMealState();
        const loadedTutorialStep = await loadGuestTutorialIntroStep();
        const loadedTithe = await loadTitheState();
        const loadedTravel = await loadTravelState();
        const loadedExploreNavigation = await loadExploreNavigationUnlocked();
        const loadedPostGuestState = await loadPostGuestTutorialState();
        const resolvedName = rawName?.trim() || "Adventurer";

        if (!active) return;

        setPlayerStats(loadedStats);
        setStaminaCurrent(rawSta ? Math.max(parseInt(rawSta, 10), 0) : 40);
        setLifeCurrent(rawLife ? Math.min(Math.max(parseInt(rawLife, 10), 0), loadedStats.maximumLife) : 15);
        setDayIdx(rawDay !== null ? parseInt(rawDay, 10) : 0);
        setPlayerName(resolvedName);
        setPlayerAvatarId(normalizePlayerAvatarId(rawAv));
        setMealState(loadedMeals);
        setTitheState(loadedTithe);
        setExploreUnlocked(loadedExploreNavigation);
        setTavernBeverage(getTavernBeverage(loadedPostGuestState));
        if (loadedTithe.phase === "in_dining") setCivilDialogStage("introduction");
        let loadedBag = DEFAULT_BAG;
        if (rawBag) {
          try { loadedBag = normalizePlayerBagData(JSON.parse(rawBag)); } catch { /* default */ }
        }
        setPlayerBag(loadedBag);
        if (loadedTutorialStep === "ready_for_water" && loadedBag.slots.some((item) => item?.id === "soup_herb")) {
          setRupertMealInstructionVisible(true);
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
          const loadedDay = rawDay !== null ? parseInt(rawDay, 10) : 0;
          const guestState = await loadGuestState();
          if (
            !loadedTravel.exploreUnlocked &&
            areRegularGuestsUnlockedForDay(postState, guestState.calendarDaySerial) &&
            (loadedDay === 2 || loadedDay === 4 || loadedDay === 5)
          ) {
            setCoachmanIntroLines(coachmanIntroduction(resolvedName));
            setCoachmanIntroIndex(0);
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
  // This boot sequence intentionally runs only once per Dining screen instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (thoughtTimer.current) clearTimeout(thoughtTimer.current);
    };
  }, [clearTimeout]);

  function showPlayerThought(text: string) {
    if (thoughtTimer.current) clearTimeout(thoughtTimer.current);
    const thought = text.trim().replace(/^["“”]+|["“”]+$/g, "");
    setPlayerThought(thought);
    thoughtTimer.current = setTimeout(() => setPlayerThought(null), 2600);
  }

  const showFavorRewardDialog = useCallback((guest: GuestVisitView, text: string) => {
    setFavorDialogLine({
      speaker: guest.profile.name,
      portrait: dialogPortraitForGuest(guest.profile.id),
      text: `"${text}"`,
    });
    AsyncStorage.getItem(PLAYER_BAG_KEY).then((rawBag) => {
      if (rawBag) setPlayerBag(normalizePlayerBagData(JSON.parse(rawBag)));
    }).catch(() => {});
    if (text.includes("Here, take this.")) {
      audioManager.playSoundEffect("moveitem", { maxDurationMs: 3000 });
    }
  }, [audioManager]);

  function runTransfer(
    image: ImageSourcePropType,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    onDone: () => void,
    aboveDialog = false,
  ) {
    setTransferAboveDialog(aboveDialog);
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
      setTransferAboveDialog(false);
      onDone();
    });
  }

  function measureViewCenter(
    ref: React.RefObject<View | null>,
    fallback: GuestServiceSourcePoint,
  ): Promise<GuestServiceSourcePoint> {
    return new Promise((resolve) => {
      const view = ref.current;
      if (!view) {
        resolve(fallback);
        return;
      }
      view.measureInWindow((x, y, width, height) => {
        resolve(width > 0 && height > 0 ? { x: x + width / 2, y: y + height / 2 } : fallback);
      });
    });
  }

  async function runCoinTransfer(fromX: number, fromY: number, onDone: () => void) {
    const target = await measureViewCenter(currencyTargetRef, {
      x: W - 70,
      y: insets.top + 58,
    });
    runTransfer(IMG.coin_copper, fromX, fromY, target.x - 14, target.y - 14, onDone);
  }

  async function runTitheCoinTransfer(): Promise<void> {
    const source = await measureViewCenter(currencyTargetRef, {
      x: W - 70,
      y: insets.top + 58,
    });
    const target = civilServantAnchorRef.current ?? {
      x: W * 0.72,
      y: H * 0.42,
    };
    await new Promise<void>((resolve) => {
      runTransfer(
        IMG.coin_copper,
        source.x - 18,
        source.y - 18,
        target.x - 18,
        target.y - 18,
        resolve,
        true,
      );
    });
  }

  function showServiceDialog(line: TutorialLine, nextStep: GuestTutorialIntroStep) {
    serviceDialogNextStep.current = nextStep;
    serviceDialogDoneRef.current = null;
    setServiceDialogLine(line);
  }

  function showStandaloneServiceDialog(line: TutorialLine, onClose?: () => void) {
    serviceDialogNextStep.current = null;
    serviceDialogDoneRef.current = onClose ?? null;
    setServiceDialogLine(line);
  }

  async function closeServiceDialog() {
    const next = serviceDialogNextStep.current;
    const done = serviceDialogDoneRef.current;
    serviceDialogNextStep.current = null;
    serviceDialogDoneRef.current = null;
    setServiceDialogLine(null);
    if (!next) {
      done?.();
      return;
    }
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

  function skipCurrentTutorialDialog() {
    if (favorDialogLine) { setFavorDialogLine(null); return; }
    if (serviceDialogLine) { void closeServiceDialog(); return; }
    if (coachmanIntroLine && coachmanIntroIndex < coachmanIntroLines.length - 1) {
      setCoachmanIntroIndex(coachmanIntroLines.length - 1);
      return;
    }
    if (coachmanIntroLine) { void advanceCoachmanIntroduction(); return; }
    if (!coachmanIntroLine && tutorialLineIndex < tutorialLines.length - 1) {
      setTutorialLineIndex(tutorialLines.length - 1);
      return;
    }
    void advanceTutorialDialog();
  }

  function tutorialPortraitSource(portrait: TutorialPortrait): ImageSourcePropType {
    if (portrait === "player") return getPlayerDialogCharacter(playerAvatarId, getDialogExpressionForStamina(staminaCurrent), getPlayerAvatarForStamina(playerAvatarId, staminaCurrent));
    if (portrait === "old_farmer") return DIALOG_CHARACTER_ASSETS.oldFarmer;
    if (portrait === "coachman") return DIALOG_CHARACTER_ASSETS.coachman;
    if (portrait === "merchant") return DIALOG_CHARACTER_ASSETS.merchant;
    if (portrait === "traveler") return DIALOG_CHARACTER_ASSETS.traveller;
    if (portrait === "city_guard") return DIALOG_CHARACTER_ASSETS.cityGuard;
    if (portrait === "local_boozer") return DIALOG_CHARACTER_ASSETS.localBoozer;
    if (portrait === "rupert_sad") return DIALOG_CHARACTER_ASSETS.rupert.sad;
    if (portrait === "rupert_laugh") return DIALOG_CHARACTER_ASSETS.rupert.laugh;
    if (portrait === "rupert") return DIALOG_CHARACTER_ASSETS.rupert.normal;
    return IMG.rupert;
  }

  const coachmanIntroLine = coachmanIntroLines[coachmanIntroIndex] ?? null;
  const currentTutorialLine = favorDialogLine ?? serviceDialogLine ?? coachmanIntroLine ?? tutorialLines[tutorialLineIndex] ?? null;
  const dialogLine: GuestTutorialDialogLine | null = currentTutorialLine ? {
    speaker: currentTutorialLine.speaker,
    text: currentTutorialLine.text,
    portrait: tutorialPortraitSource(currentTutorialLine.portrait),
    playerPortrait: currentTutorialLine.portrait === "player",
    characterScale: currentTutorialLine.portrait === "old_farmer"
      ? OLD_FARMER_DIALOG_SCALE
      : currentTutorialLine.portrait === "player"
        ? getPlayerDialogScale(playerAvatarId)
        : currentTutorialLine.portrait === "rupert" || currentTutorialLine.portrait === "rupert_laugh" || currentTutorialLine.portrait === "rupert_sad"
          ? RUPERT_DIALOG_SCALE
        : 0.8,
    highlightedPhrases: currentTutorialLine.highlightedPhrases,
  } : null;

  useEffect(() => {
    if (currentTutorialLine) void logHighlightedDiningLine(currentTutorialLine, dayIdx);
  }, [currentTutorialLine, dayIdx]);

  useEffect(() => {
    if (rupertMealInstructionVisible) void logHighlightedDiningLine(RUPERT_MEAL_BAG_INSTRUCTION, dayIdx);
  }, [rupertMealInstructionVisible, dayIdx]);

  const tutorialInDining = guestTutorialHasReached(tutorialStep, "dining_intro");
  const titheEventActive = titheState?.phase === "in_dining" || titheState?.phase === "bad_ending";
  // Do not mount the guest list against the temporary default tutorial state.
  // Otherwise a persisted, completed tutorial can briefly render today's guest
  // before the stored step is loaded and its visibility rules take effect.
  const showDiningServiceUi = diningLoaded && !titheEventActive &&
    (!tutorialInDining || guestTutorialHasReached(tutorialStep, "meal_reveal"));
  const showRupertInDining = titheEventActive || tutorialStep === "meal_reveal" || guestTutorialKeepsRupertInDining(tutorialStep);
  const useDawnBackground = titheEventActive || (tutorialInDining && tutorialStep !== "service_complete");
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

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      Promise.all([
        loadPostGuestTutorialState(),
        loadGuestTutorialIntroStep(),
        AsyncStorage.getItem(PLAYER_BAG_KEY),
      ]).then(([state, step, rawBag]) => {
        if (!active) return;
        setTavernBeverage(getTavernBeverage(state));
        if (!rawBag) {
          setRupertMealInstructionVisible(false);
          return;
        }
        const refreshedBag = normalizePlayerBagData(JSON.parse(rawBag));
        setPlayerBag(refreshedBag);
        setRupertMealInstructionVisible(
          step === "ready_for_water" && refreshedBag.slots.some((item) => item?.id === "soup_herb"),
        );
      }).catch(() => {});
      return () => { active = false; };
    }, []),
  );

  useFocusEffect(
    React.useCallback(() => {
      if (!diningLoaded || !guestTutorialHasReached(tutorialStep, "service_complete")) return;
      let active = true;
      (async () => {
        const [travel, exploreNavigation, rawDay, postState, guestState] = await Promise.all([
          loadTravelState(),
          loadExploreNavigationUnlocked(),
          AsyncStorage.getItem(DSK.DAY_INDEX),
          loadPostGuestTutorialState(),
          loadGuestState(),
        ]);
        if (!active) return;
        setExploreUnlocked(exploreNavigation);
        const currentDay = Math.max(0, Number.parseInt(rawDay ?? "0", 10) || 0) % 7;
        if (
          !travel.exploreUnlocked &&
          areRegularGuestsUnlockedForDay(postState, guestState.calendarDaySerial) &&
          (currentDay === 2 || currentDay === 4 || currentDay === 5)
        ) {
          setCoachmanIntroLines((current) => current.length > 0 ? current : coachmanIntroduction(playerName));
          setCoachmanIntroIndex(0);
        }
      })().catch(() => {});
      return () => { active = false; };
    }, [diningLoaded, playerName, tutorialStep]),
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

    if (tutorialStep === "ready_for_water" && plan.mealState.slots[plan.targetSlotIndex]?.id === "soup_herb") {
      setRupertMealInstructionVisible(false);
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

  function coachmanMealReaction(reaction: GuestMealReaction): string {
    if (reaction === "favorite") return '"Red Stew. Now that is exactly what a long day on the road calls for."';
    if (reaction === "favored") return '"Hot and filling. You know how to welcome a tired traveller."';
    if (reaction === "disliked") return '"A cold meal after a day outside? Not quite what I was hoping for."';
    if (reaction === "least_favorite") return '"Snowberry Sherbet? I’ll be honest, this really is not for me."';
    return '"Thank you. That will keep me going for the road ahead."';
  }

  function coachmanTalkLine(favor: number): string {
    if (favor >= 75) return '"There are roads I only recommend to people I trust. You’re getting close."';
    if (favor >= 50) return '"The farther the destination, the more carefully you should prepare for the journey."';
    if (favor >= 25) return '"I don’t have a sweet tooth, but I do eat sweets occasionally."';
    return '"Nothing beats a hot meal after a long day of work."';
  }

  function farmerMealReaction(reaction: GuestMealReaction): string {
    if (reaction === "favorite") return '"Carrot Soup. You remembered my favorite."';
    if (reaction === "favored") return '"That was a fine meal. Thank you."';
    if (reaction === "disliked" || reaction === "least_favorite") return '"Not quite to my taste, but I appreciate the effort."';
    return '"That hit the spot. Thank you."';
  }

  function farmerTalkLine(favor: number): string {
    if (favor >= 75) return '"You have turned this old place into a welcoming tavern again."';
    if (favor >= 50) return '"Good soil and patience—that is what makes a harvest."';
    if (favor >= 25) return '"Carrots make an excellent soup, if you ask me."';
    return '"The fields have kept me busy today."';
  }

  function departGuest(guestId: GuestId) {
    setDepartingGuestId(guestId);
    setTimeout(() => {
      setDepartingGuestId(null);
      setHiddenGuestIds((current) => current.includes(guestId) ? current : [...current, guestId]);
    }, 720);
  }

  async function markGuestServed(guestId: GuestId, kind?: "food" | "water") {
    const state = await persistGuestServed(guestId);
    if (kind) await recordTavernService(kind);
    notifyLocationStatusChanged();
    triggerHaptic("guest-served");
    return state;
  }

  function beveragePriceForGuest(guestId: GuestId): number {
    return guestId === "local_boozer" && tavernBeverage.alcoholic
      ? tavernBeverage.priceCopper * 2
      : tavernBeverage.priceCopper;
  }

  function beverageDepartureLine(guestId: GuestId): string {
    if (guestId === "local_boozer" && tavernBeverage.alcoholic) {
      return `"Now that is a proper ${tavernBeverage.name}. I will gladly pay double."`;
    }
    if (tavernBeverage.id === "water") return '"Nothing to eat today? Then I\'ll go to the next place."';
    return `"A ${tavernBeverage.name} sounds good. Thank you."`;
  }

  async function handleGuestService(
    guest: GuestVisitView,
    action: GuestServiceAction,
    source?: GuestServiceSourcePoint,
  ): Promise<boolean | void> {
    if (serviceBusy) return;

    if ((guest.profile.id === "merchant" || guest.profile.id === "traveler" || guest.profile.id === "city_guard") && guestTutorialHasReached(tutorialStep, "service_complete")) {
      const guestId = guest.profile.id;
      const portrait: TutorialPortrait = guestId === "merchant" ? "merchant" : guestId === "city_guard" ? "city_guard" : "traveler";
      const speaker = guest.profile.name;

      if (action === "talk") {
        showStandaloneServiceDialog({
          speaker,
          portrait,
          text: guestId === "merchant"
            ? '"Bring me a good meal and I will make you a fair trade."'
            : guestId === "city_guard"
              ? '"A warm meal makes a long watch easier."'
              : '"The road is long. A warm meal would be welcome."',
        });
        return;
      }

      if (action === "water") {
        setServiceBusy(true);
        await markGuestServed(guestId, "water");
        await addCurrencyCopper(beveragePriceForGuest(guestId));
        setServiceBusy(false);
        showStandaloneServiceDialog(
          { speaker, portrait, text: beverageDepartureLine(guestId) },
          () => departGuest(guestId),
        );
        return;
      }

      const activeIndex = mealState.activeSlotIndex;
      const activeMeal = activeIndex !== null ? mealState.slots[activeIndex] : null;
      if (activeIndex === null || !activeMeal) {
        showPlayerThought("I need to select a meal first.");
        return action === "exchange" ? false : undefined;
      }
      const price = getMealBaseSellPriceCopper(activeMeal);
      if (price === null) {
        showPlayerThought("This meal does not have a price yet.");
        return action === "exchange" ? false : undefined;
      }

      const nextSlots = [...mealState.slots];
      nextSlots[activeIndex] = null;
      const nextMealState: DiningMealState = { ...mealState, slots: nextSlots, activeSlotIndex: null };
      const start = source ?? { x: W * 0.3, y: headerH + 350 };

      if (action === "exchange") {
        const offer = guestId === "merchant" ? getMerchantExchangeOffer(price) : guest.exchangeOffer;
        if (!offer) {
          showPlayerThought(guestId === "merchant"
            ? "The Merchant has no trade for a meal of this value."
            : "That offer is no longer available.");
          return false;
        }

        setServiceBusy(true);
        if (guestId === "merchant") await setCurrentGuestExchangeOffer(guestId, offer);
        const result = await completeGuestExchange(guestId, offer, [
          [DINING_MEAL_STATE_KEY, JSON.stringify(nextMealState)],
        ]);
        if (!result.ok) {
          setServiceBusy(false);
          showPlayerThought(
            result.reason === "bag_locked" ? "I need my bag first." :
            result.reason === "bag_full" ? "My bag is full." :
            result.reason === "offer_unavailable" ? "That offer is no longer available." :
            "I can't complete this exchange right now.",
          );
          return false;
        }

        setMealState(nextMealState);
        if (result.playerBag) setPlayerBag(result.playerBag);
        await markGuestServed(guestId, "food");
        const target = result.destination === "garden_storage"
          ? await measureViewCenter(gardenNavButtonRef, { x: W * 0.25, y: H - insets.bottom - 42 })
          : await measureViewCenter(bagButtonRef, { x: W - 54, y: insets.top + 150 });
        const image = getGuestExchangeImage(result.item.id) ?? IMG.bag1;
        runTransfer(image, start.x - 18, start.y - 18, target.x - 18, target.y - 18, () => {
          audioManager.playSoundEffect("moveitem", { maxDurationMs: 3000 });
          setServiceBusy(false);
          showStandaloneServiceDialog(
            { speaker, portrait, text: guestId === "merchant" ? '"A fair trade. Until next time."' : '"Thank you. Safe travels to you."' },
            () => departGuest(guestId),
          );
        });
        return true;
      }

      if (action === "sell") {
        setServiceBusy(true);
        setMealState(nextMealState);
        await saveDiningMealState(nextMealState);
        await markGuestServed(guestId, "food");
        const mealImage = MEAL_IMAGES[activeMeal.id] ?? IMG.soup_herb;
        runTransfer(mealImage, W * 0.5 - 18, headerH + 165, start.x - 18, start.y - 18, () => {
          audioManager.playSoundEffect("bling", { maxDurationMs: 2000 });
          void runCoinTransfer(start.x - 14, start.y - 14, async () => {
            await addCurrencyCopper(price);
            setServiceBusy(false);
            showStandaloneServiceDialog(
              { speaker, portrait, text: '"Thank you. That was just what I needed."' },
              () => departGuest(guestId),
            );
          });
        });
        return;
      }
      return;
    }

    if (guest.profile.id === "local_boozer" && guestTutorialHasReached(tutorialStep, "service_complete")) {
      if (action === "talk") {
        showStandaloneServiceDialog({
          speaker: "Local Boozer",
          portrait: "local_boozer",
          text: '"Food is fine, but a proper drink is what brings me back to a tavern."',
        });
        return;
      }
      if (action === "water") {
        setServiceBusy(true);
        if (tavernBeverage.alcoholic) await addGuestFavor("local_boozer", 1);
        await markGuestServed("local_boozer", "water");
        await addCurrencyCopper(beveragePriceForGuest("local_boozer"));
        setServiceBusy(false);
        showStandaloneServiceDialog(
          {
            speaker: "Local Boozer",
            portrait: "local_boozer",
            text: tavernBeverage.alcoholic
              ? beverageDepartureLine("local_boozer")
              : '"Water? I suppose it will have to do today."',
          },
          () => departGuest("local_boozer"),
        );
        return;
      }
      if (action !== "sell") return;

      const activeIndex = mealState.activeSlotIndex;
      const activeMeal = activeIndex !== null ? mealState.slots[activeIndex] : null;
      if (activeIndex === null || !activeMeal) {
        showPlayerThought("I need to select a meal first.");
        return;
      }
      const basePrice = getMealBaseSellPriceCopper(activeMeal);
      if (basePrice === null) {
        showPlayerThought("This meal does not have a price yet.");
        return;
      }

      const alcoholic = hasMealTag(activeMeal, MEAL_TAG.ALCOHOLIC);
      const price = alcoholic ? basePrice * 2 : basePrice;
      const nextSlots = [...mealState.slots];
      nextSlots[activeIndex] = null;
      const nextMealState: DiningMealState = { ...mealState, slots: nextSlots, activeSlotIndex: null };
      setServiceBusy(true);
      setMealState(nextMealState);
      await saveDiningMealState(nextMealState);
      if (alcoholic) await addGuestFavor("local_boozer", 1);
      await markGuestServed("local_boozer", "food");

      const start = source ?? { x: W * 0.3, y: headerH + 350 };
      const mealImage = MEAL_IMAGES[activeMeal.id] ?? IMG.soup_herb;
      runTransfer(mealImage, W * 0.5 - 18, headerH + 165, start.x - 18, start.y - 18, () => {
        audioManager.playSoundEffect("bling", { maxDurationMs: 2000 });
        void runCoinTransfer(start.x - 14, start.y - 14, async () => {
          await addCurrencyCopper(price);
          setServiceBusy(false);
          showStandaloneServiceDialog(
            {
              speaker: "Local Boozer",
              portrait: "local_boozer",
              text: alcoholic ? '"Now that is a proper drink. I will gladly pay double."' : '"Not a drink, but it will do."',
            },
            () => departGuest("local_boozer"),
          );
        });
      });
      return;
    }

    if (guest.profile.id === "coachman" && guestTutorialHasReached(tutorialStep, "service_complete")) {
      if (action === "talk") {
        showStandaloneServiceDialog({ speaker: "Coachman", portrait: "coachman", text: coachmanTalkLine(guest.favor) });
        return;
      }

      if (action === "water") {
        setServiceBusy(true);
        await markGuestServed("coachman", "water");
        await addCurrencyCopper(beveragePriceForGuest("coachman"));
        setServiceBusy(false);
        showStandaloneServiceDialog(
          { speaker: "Coachman", portrait: "coachman", text: beverageDepartureLine("coachman") },
          () => departGuest("coachman"),
        );
        return;
      }

      if (action === "sell") {
        const activeIndex = mealState.activeSlotIndex;
        const activeMeal = activeIndex !== null ? mealState.slots[activeIndex] : null;
        if (activeIndex === null || !activeMeal) {
          showPlayerThought("I need to select a meal first.");
          return;
        }
        const price = getMealBaseSellPriceCopper(activeMeal);
        if (price === null) {
          showPlayerThought("This meal does not have a price yet.");
          return;
        }

        setServiceBusy(true);
        const reaction = evaluateGuestMealFavor(guest.profile, activeMeal);
        const nextSlots = [...mealState.slots];
        nextSlots[activeIndex] = null;
        const nextMealState: DiningMealState = { ...mealState, slots: nextSlots, activeSlotIndex: null };
        setMealState(nextMealState);
        await saveDiningMealState(nextMealState);
        if (reaction.favorDelta !== 0) await addGuestFavor("coachman", reaction.favorDelta);
        await markGuestServed("coachman", "food");

        const start = source ?? { x: W * 0.3, y: headerH + 350 };
        const mealImage = MEAL_IMAGES[activeMeal.id] ?? IMG.soup_herb;
        runTransfer(mealImage, W * 0.5 - 18, headerH + 165, start.x - 18, start.y - 18, () => {
          audioManager.playSoundEffect("bling", { maxDurationMs: 2000 });
          void runCoinTransfer(start.x - 14, start.y - 14, async () => {
            await addCurrencyCopper(price);
            setServiceBusy(false);
            showStandaloneServiceDialog(
              { speaker: "Coachman", portrait: "coachman", text: coachmanMealReaction(reaction.reaction) },
              () => departGuest("coachman"),
            );
          });
        });
        return;
      }
      return;
    }

    if (guest.profile.id !== "old_farmer") return;

    if (tutorialStep === "service_sell" && action === "sell") {
      const activeIndex = mealState.activeSlotIndex;
      const activeMeal = activeIndex !== null ? mealState.slots[activeIndex] : null;
      if (activeIndex === null || activeMeal?.id !== "soup_herb") {
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
        IMG.soup_herb,
        W * 0.5 - 18,
        headerH + 165,
        W * 0.42 - 18,
        headerH + 330,
        () => {
          audioManager.playSoundEffect("bling", { maxDurationMs: 2000 });
          void runCoinTransfer(
            W * 0.42 - 14,
            headerH + 330,
            async () => {
              await addCurrencyCopper(OLD_FARMER_SELL_PRICE_COPPER);
              setServiceBusy(false);
              showServiceDialog(
                { speaker: "Old Farmer", portrait: "old_farmer", text: '"Delicious. Here are 9 Copper."' },
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
      return;
    }

    if (guestTutorialHasReached(tutorialStep, "service_complete") && action === "exchange") {
      const offer = guest.exchangeOffer;
      if (!offer) {
        showPlayerThought("That offer is no longer available.");
        return false;
      }

      const activeIndex = mealState.activeSlotIndex;
      const activeMeal = activeIndex !== null ? mealState.slots[activeIndex] : null;
      if (activeIndex === null || !activeMeal) {
        showPlayerThought("I need to select a meal first.");
        return false;
      }

      setServiceBusy(true);
      const reaction = evaluateGuestMealFavor(guest.profile, activeMeal);
      const nextSlots = [...mealState.slots];
      nextSlots[activeIndex] = null;
      const nextMealState: DiningMealState = {
        ...mealState,
        slots: nextSlots,
        activeSlotIndex: null,
      };
      const result = await completeGuestExchange(guest.profile.id, offer, [
        [DINING_MEAL_STATE_KEY, JSON.stringify(nextMealState)],
      ]);

      if (!result.ok) {
        setServiceBusy(false);
        showPlayerThought(
          result.reason === "bag_locked"
            ? "I need my bag first."
            : result.reason === "bag_full"
              ? "My bag is full."
              : result.reason === "offer_unavailable"
                ? "That offer is no longer available."
                : "I can't complete this exchange right now.",
        );
        return false;
      }

      setMealState(nextMealState);
      if (result.playerBag) setPlayerBag(result.playerBag);
      if (reaction.favorDelta !== 0) await addGuestFavor("old_farmer", reaction.favorDelta);
      await markGuestServed("old_farmer", "food");

      const start = source ?? { x: W * 0.5, y: headerH + 360 };
      const target = result.destination === "garden_storage"
        ? await measureViewCenter(gardenNavButtonRef, { x: W * 0.25, y: H - insets.bottom - 42 })
        : await measureViewCenter(bagButtonRef, { x: W - 54, y: insets.top + 150 });
      const image = getGuestExchangeImage(result.item.id) ?? IMG.bag1;

      runTransfer(
        image,
        start.x - 18,
        start.y - 18,
        target.x - 18,
        target.y - 18,
        () => {
          audioManager.playSoundEffect("moveitem", { maxDurationMs: 3000 });
          setServiceBusy(false);
          showStandaloneServiceDialog(
            { speaker: "Old Farmer", portrait: "old_farmer", text: farmerMealReaction(reaction.reaction) },
            () => departGuest("old_farmer"),
          );
        },
      );
      return true;
    }

    if (guestTutorialHasReached(tutorialStep, "service_complete") && action === "talk") {
      showStandaloneServiceDialog({ speaker: "Old Farmer", portrait: "old_farmer", text: farmerTalkLine(guest.favor) });
      return;
    }

    if (guestTutorialHasReached(tutorialStep, "service_complete") && action === "water") {
      setServiceBusy(true);
      await markGuestServed("old_farmer", "water");
      await addCurrencyCopper(beveragePriceForGuest("old_farmer"));
      setServiceBusy(false);
      showStandaloneServiceDialog(
        { speaker: "Old Farmer", portrait: "old_farmer", text: beverageDepartureLine("old_farmer") },
        () => departGuest("old_farmer"),
      );
      return;
    }

    if (guestTutorialHasReached(tutorialStep, "service_complete") && action === "sell") {
      const activeIndex = mealState.activeSlotIndex;
      const activeMeal = activeIndex !== null ? mealState.slots[activeIndex] : null;
      if (activeIndex === null || !activeMeal) {
        showPlayerThought("I need to select a meal first.");
        return;
      }
      const price = getMealBaseSellPriceCopper(activeMeal);
      if (price === null) {
        showPlayerThought("This meal does not have a price yet.");
        return;
      }

      setServiceBusy(true);
      const reaction = evaluateGuestMealFavor(guest.profile, activeMeal);
      const nextSlots = [...mealState.slots];
      nextSlots[activeIndex] = null;
      const nextMealState: DiningMealState = { ...mealState, slots: nextSlots, activeSlotIndex: null };
      setMealState(nextMealState);
      await saveDiningMealState(nextMealState);
      if (reaction.favorDelta !== 0) await addGuestFavor("old_farmer", reaction.favorDelta);
      await markGuestServed("old_farmer", "food");

      const start = source ?? { x: W * 0.3, y: headerH + 350 };
      const mealImage = MEAL_IMAGES[activeMeal.id] ?? IMG.soup_herb;
      runTransfer(mealImage, W * 0.5 - 18, headerH + 165, start.x - 18, start.y - 18, () => {
        audioManager.playSoundEffect("bling", { maxDurationMs: 2000 });
        void runCoinTransfer(start.x - 14, start.y - 14, async () => {
          await addCurrencyCopper(price);
          setServiceBusy(false);
          showStandaloneServiceDialog(
            { speaker: "Old Farmer", portrait: "old_farmer", text: farmerMealReaction(reaction.reaction) },
            () => departGuest("old_farmer"),
          );
        });
      });
      return;
    }
  }

  async function advanceCoachmanIntroduction() {
    if (coachmanIntroIndex < coachmanIntroLines.length - 1) {
      setCoachmanIntroIndex((current) => current + 1);
      return;
    }
    const travel = await unlockExploreFromCoachman();
    setExploreUnlocked(travel.exploreUnlocked);
    setCoachmanIntroLines([]);
    setCoachmanIntroIndex(0);
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
    if (router.canGoBack()) router.dismissAll();
    else router.replace("/");
  }

  function goToKitchen() {
    audioManager.playSoundEffect("footstep", { maxDurationMs: 4000 });
    router.replace({ pathname: "/kitchen", params: { stamina: String(staminaCurrent) } });
  }

  function civilDialogText(): string {
    if (!titheState) return "";
    if (civilDialogStage === "introduction") {
      return "Good day, I am here to collect the tithe. Each harvest costs 10 copper coins. Let's see how many times you have harvested.";
    }
    if (civilDialogStage === "amount") {
      const count = titheState.currentHarvestCount;
      const harvestCharge = count * 10;
      const countLine = `${count} ${count === 1 ? "time" : "times"}. That makes ${harvestCharge} copper coins.`;
      return titheState.currentHadDeferredDebt
        ? `${countLine} Including the deferred tithe, you owe ${titheState.currentChargeCopper} copper coins in total.`
        : countLine;
    }
    if (civilDialogStage === "paid") {
      return "Thank you. See you in two weeks.";
    }
    if (civilDialogStage === "deferred") {
      return "You don't have enough? I can defer the payment this one time, but next time you'd have to pay me the tithe for today as well as for the next visit.";
    }
    return "Prepare yourself well for this. I do not want to have to resort to harsher measures.";
  }

  async function continueCivilServantDialog() {
    if (!titheState || titheBusy) return;
    if (civilDialogStage === "introduction") {
      setCivilDialogStage("amount");
      return;
    }
    if (civilDialogStage === "amount") {
      setTitheBusy(true);
      const original = titheState;
      try {
        const result = await resolveCurrentTithe();
        setTitheState(result.resolution === "death" ? result.state : original);
        if (result.resolution === "paid") {
          if (original.currentChargeCopper > 0) await runTitheCoinTransfer();
          setCivilDialogStage("paid");
        } else if (result.resolution === "deferred") {
          setCivilDialogStage("deferred");
        } else {
          setCivilDialogStage(null);
        }
      } finally {
        setTitheBusy(false);
      }
      return;
    }
    if (civilDialogStage === "deferred") {
      setCivilDialogStage("warning");
      return;
    }
    setCivilDialogStage(null);
    setTitheState(await loadTitheState());
  }

  async function startFollowingRun(takeBreak: boolean) {
    if (runTransitionBusy) return;
    setRunTransitionBusy(true);
    try {
      const rawSlot = await AsyncStorage.getItem(DSK.ACTIVE_SLOT);
      const slotNumber = Math.max(1, Number.parseInt(rawSlot ?? "1", 10) || 1);
      const next = await prepareNextRun(slotNumber);
      audioManager.stopGameplayMusic(1000);
      if (takeBreak) {
        if (router.canGoBack()) router.dismissAll();
        else router.replace("/");
      } else {
        router.replace({
          pathname: "/intro",
          params: { characterName: next.playerName, slotId: String(slotNumber) },
        });
      }
    } catch (error) {
      if (__DEV__) console.error("[Dining] next-run transition failed:", error);
      setRunTransitionBusy(false);
    }
  }

  const staminaPct = Math.max(0, Math.min(1, staminaCurrent / (playerStats.maximumStamina || 1)));
  const lifePct = Math.max(0, Math.min(1, lifeCurrent / (playerStats.maximumLife || 1)));
  const selectedMeal = mealState.activeSlotIndex !== null ? mealState.slots[mealState.activeSlotIndex] : null;
  const selectedMealPrice = selectedMeal ? getMealBaseSellPriceCopper(selectedMeal) : null;
  const selectedMealIsAlcoholic = selectedMeal ? hasMealTag(selectedMeal, MEAL_TAG.ALCOHOLIC) : false;

  return (
    <TavernLocationTransition location="dining">
    <View style={styles.root}>
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

          <QuestBookButton onBagUpdated={setPlayerBag} />
          <View style={styles.rightHeaderColumn}>
            <View style={styles.rightHeader}>
              <View style={styles.dayBadge}>
                <Text style={styles.dayText}>{DAYS[dayIdx] ?? DAYS[0]}</Text>
              </View>
              <TouchableOpacity style={styles.menuBtn} onPress={() => setShowMenu(true)} activeOpacity={0.8}>
                <Ionicons name="menu" size={22} color="#F5E6C8" />
              </TouchableOpacity>
            </View>
            <View ref={currencyTargetRef} collapsable={false}>
              <CurrencyHud inline compact />
            </View>
          </View>
        </View>
        <Text style={styles.locationName}>Dining Hall</Text>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
        bounces={false}
        scrollEnabled={!dialogLine && !titheEventActive}
      >
        <View
          style={styles.portraitRow}
          onLayout={(event) => setPortraitRowWidth(event.nativeEvent.layout.width)}
        >
          <TouchableOpacity
            style={styles.circleWrap}
            onPress={() => setStatusOpen(true)}
            onLayout={(event) => setPlayerPortraitFrame(event.nativeEvent.layout)}
            activeOpacity={0.8}
          >
            <Image
              source={getPlayerAvatarForStamina(playerAvatarId, staminaCurrent)}
              style={[styles.circleImg, styles.playerPortraitImage]}
              resizeMode="cover"
              resizeMethod="resize"
            />
          </TouchableOpacity>

          <View
            style={[styles.circleWrap, !showRupertInDining && styles.rupertReserve]}
            pointerEvents="none"
            onLayout={(event) => setRupertPortraitFrame(event.nativeEvent.layout)}
          >
            {showRupertInDining && (
              <Image source={IMG.rupert} style={[styles.circleImg, styles.npcPortraitImage]} resizeMode="cover" resizeMethod="resize" />
            )}
          </View>

          <View ref={bagButtonRef} collapsable={false}>
            <BagIconButton
              unlocked={playerBag.unlocked}
              bagId={playerBag.bagId}
              onPress={() => setBagOpen(true)}
            />
          </View>

          {playerThought && (
            <PortraitBubble
              anchorX={playerPortraitFrame.x + playerPortraitFrame.width / 2}
              screenWidth={portraitRowWidth}
              text={playerThought}
              top={portraitBubbleTop(playerPortraitFrame.y + playerPortraitFrame.height)}
            />
          )}
          {rupertMealInstructionVisible && showRupertInDining && !dialogLine ? (
            <PortraitBubble
              anchorX={rupertPortraitFrame.x + rupertPortraitFrame.width / 2}
              screenWidth={portraitRowWidth}
              speaker={RUPERT_MEAL_BAG_INSTRUCTION.speaker}
              text={RUPERT_MEAL_BAG_INSTRUCTION.text}
              top={portraitBubbleTop(rupertPortraitFrame.y + rupertPortraitFrame.height, "speech")}
              variant="speech"
              highlightedPhrases={RUPERT_MEAL_BAG_INSTRUCTION.highlightedPhrases}
            />
          ) : null}
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
                tutorialStep === "service_talk" ? "talk" :
                guestTutorialHasReached(tutorialStep, "service_complete") ? "exchange" : null
              }
              enabledServicesForGuest={(guest) => {
                if (serviceBusy) return [];
                if (!guestTutorialHasReached(tutorialStep, "service_complete")) return null;
                return guest.profile.id === "coachman"
                  ? ["sell", "water", "talk"]
                  : ["sell", "exchange", "water", "talk"];
              }}
              sellPriceCopper={guestTutorialHasReached(tutorialStep, "service_complete")
                ? selectedMealPrice
                : OLD_FARMER_SELL_PRICE_COPPER}
              selectedMealIsAlcoholic={selectedMealIsAlcoholic}
              beverageName={tavernBeverage.name}
              beverageId={tavernBeverage.id}
              beveragePriceCopper={tavernBeverage.priceCopper}
              beverageIsAlcoholic={tavernBeverage.alcoholic}
              departingGuestId={departingGuestId}
              hiddenGuestIds={[
                ...(tutorialStep === "service_complete" && dayIdx === 1 ? ["old_farmer" as const] : []),
                ...hiddenGuestIds,
              ]}
              onService={handleGuestService}
              onFavorRewardDialog={showFavorRewardDialog}
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
  (loc.id === "kitchen" || loc.id === "garden" || loc.id === "dormitory" || loc.id === "mail");
const locImg = IMG[`loc_${loc.id}` as keyof typeof IMG] as number | undefined;
const active = loc.id === "kitchen" || isCurrent || coreDestination || guestDormitoryBlocked || (loc.id === "explore" && exploreUnlocked);

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
        : loc.id === "mail" && coreDestination
          ? () => {
              audioManager.playSoundEffect("footstep", { maxDurationMs: 4000 });
              router.replace("/mail");
            }
        : loc.id === "explore" && exploreUnlocked
          ? () => {
              audioManager.playSoundEffect("footstep", { maxDurationMs: 4000 });
          router.replace({ pathname: "/outside-tavern", params: { returnTo: "dining" } });
            }
        : undefined;

          return (
            <TouchableOpacity
              ref={loc.id === "garden" ? gardenNavButtonRef : undefined}
              key={loc.id}
              style={[
                styles.locBtn,
                isCurrent ? styles.locBtnCurrent : (active ? styles.locBtnActive : styles.locBtnLocked),
              ]}
              disabled={!locationAction || !!dialogLine || titheEventActive}
              onPress={locationAction}
              activeOpacity={0.8}
            >
              {content}
              {loc.id === "garden" && harvestReady && <LocationStatusBadge kind="harvest" />}
              {loc.id === "dormitory" && sleepReady && <LocationStatusBadge kind="sleep" />}
              {loc.id === "explore" && (receptionistPresent ? <LocationStatusBadge kind="receptionist" /> : merchantPresent ? <LocationStatusBadge kind="merchant" /> : null)}
            </TouchableOpacity>
          );
        })}
      </View>

      <GuestTutorialDialog
        visible={!!dialogLine}
        line={dialogLine}
        onContinue={favorDialogLine
          ? () => setFavorDialogLine(null)
          : serviceDialogLine
            ? closeServiceDialog
            : coachmanIntroLine
              ? () => { void advanceCoachmanIntroduction(); }
              : advanceTutorialDialog}
        onSkip={dialogLine ? skipCurrentTutorialDialog : undefined}
      />

      <CivilServantDialog
        visible={titheEventActive && titheState?.phase === "in_dining" && civilDialogStage !== null}
        image={IMG.civil_servant}
        text={civilDialogText()}
        busy={titheBusy}
        onCharacterAnchorChange={(point) => { civilServantAnchorRef.current = point; }}
        onContinue={() => { void continueCivilServantDialog(); }}
      />

      <RunEndingOverlay
        visible={titheState?.phase === "bad_ending"}
        busy={runTransitionBusy}
        onNewRun={() => { void startFollowingRun(false); }}
        onTakeBreak={() => { void startFollowingRun(true); }}
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
            zIndex: transferAboveDialog ? 2100 : 1200,
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
        context="dining"
        dayIdx={dayIdx}
        onClose={() => setBagOpen(false)}
        onTransferItem={(slotIdx) => handleBagToMealSlot(slotIdx)}
        onBagUpdated={setPlayerBag}
        onStatsUpdated={setPlayerStats}
        onStaminaUpdated={setStaminaCurrent}
        onLifeUpdated={setLifeCurrent}
        onShowThoughtBubble={showPlayerThought}
      />

      <StatusModal
        visible={statusOpen}
        stats={playerStats}
        currentStamina={staminaCurrent}
        currentLife={lifeCurrent}
        onClose={() => setStatusOpen(false)}
        onStatsUpdated={(newStats, newLife) => {
          setPlayerStats(newStats);
          AsyncStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(newStats)).catch(() => {});
          if (newLife !== null) {
            setLifeCurrent(newLife);
            AsyncStorage.setItem(DSK.LIFE, String(newLife)).catch(() => {});
          }
        }}
      />
    </View>
    </TavernLocationTransition>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0500" },
  bgOverlay: { backgroundColor: "rgba(0,0,0,0.30)" },

  header: {
    flexDirection: "column",
    paddingLeft: 4,
    paddingRight: 12,
    paddingBottom: 6,
    backgroundColor: "rgba(14,7,1,0.85)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(196,148,58,0.20)",
    zIndex: 2,
  },
  headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  leftHeader: { flex: 1, gap: 4, zIndex: 20 },
  statBarOuter: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(10,5,0,0.82)",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(130,90,20,0.50)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    gap: 4,
    overflow: "visible",
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
  rightHeaderColumn: { alignItems: "flex-end", alignSelf: "flex-start", gap: 4, marginLeft: 2, transform: [{ translateY: -2 }] },
  rightHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
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
  locBtnCurrent: { backgroundColor: "rgba(196,148,58,0.22)", borderColor: "#FFFFFF", borderWidth: 2 },
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
