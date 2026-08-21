import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  Platform,
  Keyboard,
  Pressable,
  Animated as RNAnimated,
  Image,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";

import GardenPlot, { GardenPlotData } from "@/src/components/GardenPlot";
import SeedSelectionModal from "@/src/components/seed-selection-modal";
import SceneBackground from "@/src/components/SceneBackground";
import CurrencyHud from "@/src/components/CurrencyHud";
import { useAudioManager } from "@/src/audio/AudioProvider";
import {
  SHARED_RESOURCE_DEFAULTS,
  RESOURCE_NAMES,
  CORE_MATERIAL_IDS,
  SHARED_RESOURCES_KEY,
  type SharedResources,
} from "@/src/game/shared-resources";
import PlayerBag, { BagIconButton } from "@/src/components/PlayerBag";
import { loadLogbook, type LogEntry, LOGBOOK_KEY } from "@/src/game/logbook";
import ActivityBar from "@/src/components/ActivityBar";
import StatusModal from "@/src/components/StatusModal";
import {
  PLAYER_BAG_KEY, DEFAULT_BAG, planAddToBag,
  BAG_INSPECTED_KEY,
  type PlayerBagData, type BagItem,
} from "@/src/game/item-system";
import {
  PLAYER_STATS_KEY, DEFAULT_PLAYER_STATS,
  calcEffectiveStaminaCost,
  type PlayerStats,
} from "@/src/game/player-stats";
import type { ActivityId } from "@/src/game/activity-config";
import { createSnapshot, discardRuntimeAndRestore } from "@/src/game/save-manager";
import {
  guestTutorialHasReached,
  guestTutorialKeepsRupertInDining,
  guestTutorialRupertHasLeftGarden,
  loadGuestTutorialIntroStep,
} from "@/src/game/guest-tutorial";
import { loadPostGuestTutorialState } from "@/src/game/post-guest-tutorial";
import { ensureAssetReady } from "@/src/assets/AssetManager";
import { subscribeGardenRuntimeRefresh } from "@/src/game/garden-runtime-context";
import { commitHarvestBag } from "@/src/game/garden-harvest";
import {
  createGardenPlotFromSeed,
  createHarvestBagForCrop,
} from "@/src/game/garden-crop-system";
import {
  DEFAULT_PLAYER_AVATAR_ID,
  PLAYER_AVATAR_KEY,
  getPlayerAvatarForStamina,
  normalizePlayerAvatarId,
  type PlayerAvatarId,
} from "@/src/game/player-avatar";

// ─── Storage keys ─────────────────────────────────────────────────────────────

const GSK = {
  STAMINA:            "@game:stamina",
  LIFE:               "@game:life",
  PLAYER_NAME:        "@game:player_name",
  DAY_INDEX:          "@game:day_index",
  STAMINA_SPENT_TODAY:"@game:stamina_spent_today",
  HAS_ENTERED:        "@garden:has_entered",
  HAS_SEEN_INTRO:     "@garden:has_seen_introduction",
  HAS_WATERED:        "@garden:has_watered_tutorial",
  HAS_PULLED_WEEDS:   "@garden:has_pulled_weeds_tutorial",
  HAS_FERTILIZED:     "@garden:has_fertilized_tutorial",
  MIN_TASK_DONE:      "@garden:minimum_task_complete",
  TUT_COMPLETE:       "@garden:tutorial_complete",
  TUT_STATE:          "@garden:tutorial_state",
  PLOT_DATA:          "@garden:plot_01_data",
  INVENTORY:          "@garden:inventory",
  SEL_FERTILIZER:     "@garden:selected_fertilizer",
  // Tuesday flags
  BAG_UNLOCKED:       "@garden:inventory_bag_unlocked",
  HAS_HARVESTED:      "@garden:has_harvested_tutorial_herbs",
  HARVEST_YIELD:      "@garden:harvested_tutorial_yield",
  HAS_BUCKET:         "@garden:has_received_bucket",
  ACTIVITY_BAR:       "@garden:activity_bar_unlocked",
  HAS_WATER:          "@garden:has_fetched_tutorial_water",
  CRAFTING_READY:     "@garden:crafting_tutorial_ready",
  SAVE_LOCATION:      "@game:save_location",
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

type GTState =
  | "LOADING"
  | "GARDEN_PLOT_APPEARING"
  | "GARDEN_INTRO_DIALOG_1"
  | "GARDEN_INTRO_DIALOG_2"
  | "GARDEN_INTRO_DIALOG_3"
  | "GARDEN_PLOT_INTERACTIVE"
  | "GARDEN_MINIMUM_TASK_COMPLETE"
  | "GARDEN_TUTORIAL_COMPLETE"
  | "IDLE"
  // Tuesday flow
  | "INVENTORY_BAG_GIFT"
  | "WAITING_FOR_BAG_INSPECTION"
  | "TUTORIAL_HARVEST_AVAILABLE"
  | "TUTORIAL_HARVEST_IN_PROGRESS"
  | "TUTORIAL_HARVEST_COMPLETE"
  | "BUCKET_GIFT"
  | "ACTIVITY_BAR_UNLOCKED"
  | "WAITING_FOR_WELL_ACTION"
  | "TUTORIAL_WATER_FETCHED"
  | "GARDEN_REPLANTING_AVAILABLE"
  | "READY_TO_RETURN_TO_KITCHEN"
  | "RETURNING_TO_KITCHEN_FOR_CRAFTING";

type BubblePolicy = "BLOCK_ALL" | "ALLOW_ITEM" | "GARDEN_PROMPT";
interface BubbleConfig {
  text: string;
  speaker: string;
  policy: BubblePolicy;
}

type LRect = { x: number; y: number; w: number; h: number };

// ─── Garden Inventory types ────────────────────────────────────────────────────

export type InventoryItem = {
  id: string;
  itemType: string;
  name: string;
  quantity: number;
  // For herbbag type (future crafting)
  containedItem?: string;
  containedQuantity?: number;
};

// ─── Fertilizer config ────────────────────────────────────────────────────────

type FertilizerConfig = {
  id: string;
  name: string;
  yieldBonus: number;
  staminaCost: number;
};

const FERTILIZER_CONFIGS: FertilizerConfig[] = [
  { id: "standard_fertilizer", name: "Standard Fertilizer", yieldBonus: 1, staminaCost: 3 },
];

// ─── Location data ────────────────────────────────────────────────────────────

const DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

// ─── Assets ───────────────────────────────────────────────────────────────────

const IMG = {
  garden:      require("../assets/images/garden1.jpg"),
  rupert:      require("../assets/images/rupert.png"),
  rupertsad:   require("../assets/images/rupertsad.png"),
  rupertlaugh: require("../assets/images/rupertlaugh.png"),
  avLaugh:     require("../assets/images/avatar1_laugh.png"),
  avNormal:    require("../assets/images/avatar1_normal.png"),
  avSad:       require("../assets/images/avatar1_sad.png"),
  avTired:     require("../assets/images/avatar1_tired.png"),
  avSick:      require("../assets/images/avatar1_sick.png"),
  herbbag:     require("../assets/images/herbbag.png"),
  bucket:      require("../assets/images/bucket.png"),
  bucketwater: require("../assets/images/bucketwater.png"),
  getwater:    require("../assets/images/getwater.png"),
  getwood:     require("../assets/images/getwood.png"),
  getstone:    require("../assets/images/getstone.png"),
  wood:        require("../assets/images/wood.png"),
  stone:       require("../assets/images/stone.png"),
  workout1:    require("../assets/images/workout1.png"),
  workout2:    require("../assets/images/workout2.png"),
  // Location bar icons
  loc_kitchen:   require("../assets/images/gotokitchen.png"),
  loc_dining:    require("../assets/images/gotodining.png"),
  loc_dormitory: require("../assets/images/gotodormitory.png"),
  loc_mail:      require("../assets/images/gotomail.png"),
  loc_explore:   require("../assets/images/goexplore.png"),
  loc_storage:   require("../assets/images/gotostorage.png"),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avatarSrc(avatarId: PlayerAvatarId, st: number) {
  return getPlayerAvatarForStamina(avatarId, st);
}
function rupertSrc(p: "normal" | "sad" | "laugh") {
  return p === "sad" ? IMG.rupertsad : p === "laugh" ? IMG.rupertlaugh : IMG.rupert;
}

// ─── Default data ─────────────────────────────────────────────────────────────

const DEFAULT_INVENTORY: InventoryItem[] = [
  { id: "herbseed",            itemType: "seed",        name: "Herb Seed",            quantity: 5 },
  { id: "standard_fertilizer", itemType: "fertilizer",  name: "Standard Fertilizer",  quantity: 5 },
];

const SECOND_PLOT_EMPTY: GardenPlotData = {
  id: "garden_plot_02",
  plotType: "small",
  upgradeLevel: 1,
  status: "empty",
  cropType: null,
  cropAsset: null,
  seedItemId: null,
  totalGrowthDays: 0,
  completedGrowthDays: 0,
  remainingGrowthDays: 0,
  progressPercent: 0,
  wateredToday: false,
  weedsPulledToday: false,
  fertilizedToday: false,
  fertilizerTypeUsedToday: null,
  consecutiveUnwateredDays: 0,
  baseYield: 0,
  accumulatedWeedYieldBonus: 0,
  accumulatedFertilizerYieldBonus: 0,
  readyToHarvest: false,
  withered: false,
};

const TUTORIAL_PLOT_INITIAL: GardenPlotData = {
  id: "garden_plot_01",
  plotType: "small",
  upgradeLevel: 1,
  status: "growing",
  cropType: "herb",
  cropAsset: "herbbed",
  seedItemId: "herbseed",
  totalGrowthDays: 2,
  completedGrowthDays: 1,
  remainingGrowthDays: 1,
  progressPercent: 50,
  wateredToday: false,
  weedsPulledToday: false,
  fertilizedToday: false,
  fertilizerTypeUsedToday: null,
  consecutiveUnwateredDays: 0,
  baseYield: 5,
  accumulatedWeedYieldBonus: 0,
  accumulatedFertilizerYieldBonus: 0,
  readyToHarvest: false,
  withered: false,
};

// ─── Timings ──────────────────────────────────────────────────────────────────

const STA_MS         = 800;
const FLOAT_MS       = 2200;   // centralized float duration (slower/softer)
const FLOAT_RISE_PX  = 32;     // px to rise
const FLOAT_FADE_IN  = 200;    // ms fade-in
const FLOAT_FADE_OUT = 400;    // ms fade-out

// ─── Component ────────────────────────────────────────────────────────────────

export default function GardenScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ loadedFromSave?: string }>();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const [playerAvatarId, setPlayerAvatarId] = useState<PlayerAvatarId>(DEFAULT_PLAYER_AVATAR_ID);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(PLAYER_AVATAR_KEY)
      .then((raw) => { if (active) setPlayerAvatarId(normalizePlayerAvatarId(raw)); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // ── Audio
  const audioManager = useAudioManager();
  const { crossfadeTo } = audioManager;

  // Restore the Garden theme whenever this retained stack screen regains focus.
  useFocusEffect(
    React.useCallback(() => {
      crossfadeTo('garden', 3000);
    }, [crossfadeTo]),
  );

  // ── HUD state
  const [staminaCurrent, setStaminaCurrent] = useState(40);
  const [staminaDisplay, setStaminaDisplay] = useState(40);
  const staminaCurrentRef = useRef(40);
  const [barWidth, setBarWidth] = useState(0);
  const [lifeCurrent, setLifeCurrent] = useState(15);
  // Daily stamina-spend tracker (reset to 0 each new day after sleep)
  const [staminaSpentToday, setStaminaSpentToday] = useState(0);
  const staminaSpentTodayRef = useRef(0);

  // ── Day
  const [dayIdx, setDayIdx] = useState(0);

  // ── Logbook (shared with kitchen.tsx via AsyncStorage)
  const [logbook, setLogbook] = useState<LogEntry[]>([]);
  const [showLogbook, setShowLogbook] = useState(false);

  // ── Portraits
  const [rupertPortrait, setRupertPortrait] = useState<"normal" | "sad" | "laugh">("normal");
  // Guest-service restrictions end at service_complete, but Rupert never returns
  // to the Garden portrait slot after leaving to greet the first guest.
  const [rupertInDining, setRupertInDining] = useState(false);
  const [rupertAwayFromGarden, setRupertAwayFromGarden] = useState(true);
  const [secondPlotUnlocked, setSecondPlotUnlocked] = useState(false);
  const [diningUnlocked, setDiningUnlocked] = useState(false);
  const [coreTravelUnlocked, setCoreTravelUnlocked] = useState(false);

  // Guest progression refresh: Dining opens at dining_prompt;
  // Dormitory becomes normal travel after service_complete.
  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      loadGuestTutorialIntroStep()
        .then((step) => {
if (!active) return;
setDiningUnlocked(guestTutorialHasReached(step, "dining_prompt"));
setCoreTravelUnlocked(guestTutorialHasReached(step, "service_complete"));
setRupertInDining(guestTutorialKeepsRupertInDining(step));
setRupertAwayFromGarden(guestTutorialRupertHasLeftGarden(step));
        })
        .catch(() => {});
      return () => { active = false; };
    }, []),
  );

  // ── Tutorial state machine
  const [gts, setGts] = useState<GTState>("LOADING");
  const gtsRef = useRef<GTState>("LOADING");

  // ── Plot
  const [plotData, setPlotData] = useState<GardenPlotData>(TUTORIAL_PLOT_INITIAL);

  // ── Inventory + fertilizer
  const [inventory, setInventory] = useState<InventoryItem[]>(DEFAULT_INVENTORY);
  const [selectedFertilizer, setSelectedFertilizer] = useState<string>("standard_fertilizer");

  const actionLocked = useRef(false);
  const staminaCountTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Player bag ref (prevents stale closures in async gift flows)
  const playerBagRef = useRef<PlayerBagData>(DEFAULT_BAG);

  // ── Shared resources (for Materials display in storage)
  const [sharedResources, setSharedResources] = useState<SharedResources>(SHARED_RESOURCE_DEFAULTS);

  // ── Player Bag & Stats (Tuesday+)
  const [playerBag, setPlayerBag] = useState<PlayerBagData>(DEFAULT_BAG);
  const [playerStats, setPlayerStats] = useState<PlayerStats>(DEFAULT_PLAYER_STATS);
  const [bagOpen, setBagOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [activityBarVisible, setActivityBarVisible] = useState(false);
  const harvestLocked = useRef(false);
  const wellLocked = useRef(false);
  const woodLocked = useRef(false);
  const stoneLocked = useRef(false);
  const bagGiftLocked = useRef(false);
  const bucketGiftLocked = useRef(false);

  // ── Flying item overlay (harvest, bucket, well animations)
  const bagIconViewRef  = useRef<View>(null);
  const cropAreaViewRef = useRef<View>(null);
  const bagIconLayout   = useRef<{ cx: number; cy: number } | null>(null);
  const cropLayout      = useRef<{ cx: number; cy: number } | null>(null);
  const [activityBarH, setActivityBarH] = useState(70);

  // Single flying item overlay — always rendered (opacity driven by animation)
  type FlyTarget = { ex: number; ey: number; onDone?: () => void };
  const [flyImg, setFlyImg] = useState<ReturnType<typeof require> | null>(null);
  const pendingFlyRef = useRef<FlyTarget | null>(null);
  const flyX        = useSharedValue(0);
  const flyY        = useSharedValue(0);
  const flyScale    = useSharedValue(1);
  const flyOpacity  = useSharedValue(0);

  // ── Action flash overlays (getwater / getwood / getstone)
  type ActionFlash = {
    key: string;
    image: number;
    opacityAnim: RNAnimated.Value;
    translateYAnim: RNAnimated.Value;
    plusText?: string;  // optional green reward text (e.g. "+1")
  };
  const [actionFlashes, setActionFlashes] = useState<ActionFlash[]>([]);

  // ── Workout overlay state
  const [workoutState, setWorkoutState] = useState<"none" | "phase1" | "phase2">("none");
  const workoutLocked = useRef(false);

  const flyAnimStyle = useAnimatedStyle(() => ({
    position: "absolute" as const,
    left: flyX.value - 28,
    top:  flyY.value - 28,
    width: 56,
    height: 56,
    opacity:   flyOpacity.value,
    transform: [{ scale: flyScale.value }],
    zIndex: 600,
  }));

  // Seed planting modal
  const [seedModalVisible, setSeedModalVisible] = useState(false);
  const [selectedSeedId, setSelectedSeedId] = useState<string | null>(null);
  const [plantBusy, setPlantBusy] = useState(false);
  // Float anim (well/activity)
  const [floatMsg, setFloatMsg] = useState<string | null>(null);
  // Bag inspected state
  const [bagInspected, setBagInspected] = useState(false);

  // ── UI modals
  const [showMenu, setShowMenu] = useState(false);
  const [showStorage, setShowStorage] = useState(false);
  const [showTearOut, setShowTearOut] = useState(false);

  // ── Bubble (Rupert speech bubble)
  const [bubble, setBubble] = useState<BubbleConfig | null>(null);
  const bubbleDoneRef = useRef<(() => void) | null>(null);
  const bubbleTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Player thought bubble
  const [playerBubble, setPlayerBubble] = useState<string | null>(null);
  const playerBubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Header/layout heights (for bubble positioning)
  const [headerH, setHeaderH] = useState(0);
  const [locationBarH, setLocationBarH] = useState(60);

  // ── Portrait layout refs
  const playerPortraitRef  = useRef<View>(null);
  const rupertPortraitRef  = useRef<View>(null);
  const portraitLayouts = useRef<{ player: LRect | null; rupert: LRect | null }>({
    player: null, rupert: null,
  });

  // ── Animated values
  const barWidthSV   = useSharedValue(0);
  const staminaSV    = useSharedValue(40);
  const staminaMaxSV = useSharedValue(DEFAULT_PLAYER_STATS.maximumStamina);
  const plotOpacity  = useSharedValue(0);
  const staFloatY    = useSharedValue(0);
  const staFloatOp   = useSharedValue(0);
  const [floatText, setFloatText] = useState("-2");

  // ── Animated styles
  const staminaFillStyle = useAnimatedStyle(() => ({
    width: (staminaSV.value / staminaMaxSV.value) * barWidthSV.value,
  }));
  const plotOpacityStyle = useAnimatedStyle(() => ({ opacity: plotOpacity.value }));
  const staFloatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: staFloatY.value }],
    opacity: staFloatOp.value,
  }));

  // ─────────────────────────────────────────────────────────────────────────
  // Sync gtsRef
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => { gtsRef.current = gts; }, [gts]);
  useEffect(() => { staminaCurrentRef.current = staminaCurrent; }, [staminaCurrent]);
  useEffect(() => { staminaSpentTodayRef.current = staminaSpentToday; }, [staminaSpentToday]);
  useEffect(() => {
    staminaMaxSV.value = playerStats.maximumStamina;
  }, [playerStats.maximumStamina, staminaMaxSV]);
  // Keep bag ref in sync to prevent stale closures in async gift flows
  useEffect(() => { playerBagRef.current = playerBag; }, [playerBag]);

  // 2nd Plot actions persist their own plot data directly. Sync only the shared
  // Garden values they can affect so the room never needs to remount/reset scroll.
  useEffect(() => {
    let active = true;

    const syncRuntimeValues = () => {
      void (async () => {
        const [rawStats, rawSta, rawSpent, rawInv, rawBag] = await Promise.all([
          AsyncStorage.getItem(PLAYER_STATS_KEY),
          AsyncStorage.getItem(GSK.STAMINA),
          AsyncStorage.getItem(GSK.STAMINA_SPENT_TODAY),
          AsyncStorage.getItem(GSK.INVENTORY),
          AsyncStorage.getItem(PLAYER_BAG_KEY),
        ]);
        if (!active) return;

        let nextStats = DEFAULT_PLAYER_STATS;
        if (rawStats) {
          try { nextStats = { ...DEFAULT_PLAYER_STATS, ...JSON.parse(rawStats) }; } catch { /* default */ }
        }
        setPlayerStats(nextStats);
        staminaMaxSV.value = nextStats.maximumStamina;

        if (rawSta !== null) {
          const nextStamina = Math.min(Math.max(parseInt(rawSta, 10) || 0, 0), nextStats.maximumStamina);
          staminaCurrentRef.current = nextStamina;
          setStaminaCurrent(nextStamina);
          setStaminaDisplay(nextStamina);
          staminaSV.value = nextStamina;
        }

        if (rawSpent !== null) {
          const nextSpent = Math.max(0, parseInt(rawSpent, 10) || 0);
          staminaSpentTodayRef.current = nextSpent;
          setStaminaSpentToday(nextSpent);
        }

        if (rawInv) {
          try { setInventory(JSON.parse(rawInv)); } catch { /* keep current */ }
        }

        if (rawBag) {
          try {
            const nextBag: PlayerBagData = { ...DEFAULT_BAG, ...JSON.parse(rawBag) };
            playerBagRef.current = nextBag;
            setPlayerBag(nextBag);
          } catch { /* keep current */ }
        }
      })().catch(() => {});
    };

    const unsubscribe = subscribeGardenRuntimeRefresh(syncRuntimeValues);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [staminaMaxSV, staminaSV]);

  // ─────────────────────────────────────────────────────────────────────────
  // Fly animation: starts AFTER React renders the image (prevents invisible start)
  // Phases: appear → hold → fly → shrink+fade
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!flyImg || !pendingFlyRef.current) return;
    const { ex, ey, onDone } = pendingFlyRef.current;
    pendingFlyRef.current = null;

    const APPEAR_MS = 280;  // fade-in at source
    const HOLD_MS   = 200;  // hold before flight
    const FLY_MS    = 1100; // flight to destination
    const SHRINK_MS = 300;  // fade/shrink at destination

    if (__DEV__) console.log(`[FlyAnim] src=(${flyX.value},${flyY.value}) dst=(${ex},${ey})`);

    // Phase 1: Appear at source
    flyOpacity.value = 0;
    flyScale.value   = 1.0;
    flyOpacity.value = withTiming(1, { duration: APPEAR_MS });

    // Phase 2+3: Hold then fly
    const t1 = setTimeout(() => {
      flyX.value     = withTiming(ex, { duration: FLY_MS });
      flyY.value     = withTiming(ey, { duration: FLY_MS });
      flyScale.value = withTiming(0.1, { duration: FLY_MS });

      // Phase 4: Shrink/fade near end of flight
      const t2 = setTimeout(() => {
        flyOpacity.value = withTiming(0, { duration: SHRINK_MS }, (done) => {
          if (done) {
            runOnJS(setFlyImg)(null);
            if (onDone) runOnJS(onDone)();
          }
        });
      }, FLY_MS - SHRINK_MS);
      return () => clearTimeout(t2);
    }, APPEAR_MS + HOLD_MS);
    return () => clearTimeout(t1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyImg]);

  // ─────────────────────────────────────────────────────────────────────────
  // Keyboard (for any future input, consistent with kitchen)
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const s = Keyboard.addListener(showEvt, () => {});
    const h = Keyboard.addListener(hideEvt, () => {});
    return () => { s.remove(); h.remove(); };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Mount: load saved garden state
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const guestTutorialStep = await loadGuestTutorialIntroStep();
        setRupertInDining(guestTutorialKeepsRupertInDining(guestTutorialStep));
        setRupertAwayFromGarden(guestTutorialRupertHasLeftGarden(guestTutorialStep));
        const postGuestState = await loadPostGuestTutorialState();
        setSecondPlotUnlocked(postGuestState.secondPlotUnlocked);

        // Load logbook (shared with kitchen.tsx)
        const lb = await loadLogbook();
        setLogbook(lb);

        // Load player stats before current values so upgraded maxima are respected.
        let loadedStats = DEFAULT_PLAYER_STATS;
        const rawStats = await AsyncStorage.getItem(PLAYER_STATS_KEY);
        if (rawStats) {
          try { loadedStats = { ...DEFAULT_PLAYER_STATS, ...JSON.parse(rawStats) }; } catch { /* default */ }
        }
        setPlayerStats(loadedStats);
        staminaMaxSV.value = loadedStats.maximumStamina;

        // Load stamina
        const rawSta = await AsyncStorage.getItem(GSK.STAMINA);
        const sta = rawSta ? Math.min(Math.max(parseInt(rawSta, 10), 0), loadedStats.maximumStamina) : 40;
        staminaCurrentRef.current = sta;
        setStaminaCurrent(sta);
        setStaminaDisplay(sta);
        staminaSV.value = sta;

        // Load daily stamina spend tracker
        const rawSpent = await AsyncStorage.getItem(GSK.STAMINA_SPENT_TODAY);
        const spent = rawSpent ? Math.max(0, parseInt(rawSpent, 10)) : 0;
        staminaSpentTodayRef.current = spent;
        setStaminaSpentToday(spent);

        // Load life
        const rawLife = await AsyncStorage.getItem(GSK.LIFE);
        const lf = rawLife ? Math.min(Math.max(parseInt(rawLife, 10), 0), loadedStats.maximumLife) : 15;
        setLifeCurrent(lf);

        // Load shared resources (for Materials display)
        const rawRes = await AsyncStorage.getItem(SHARED_RESOURCES_KEY);
        if (rawRes) {
          try { setSharedResources({ ...SHARED_RESOURCE_DEFAULTS, ...JSON.parse(rawRes) }); } catch { /* default */ }
        }

        // Load player bag
        const rawBag = await AsyncStorage.getItem(PLAYER_BAG_KEY);
        if (rawBag) { try { setPlayerBag(JSON.parse(rawBag)); } catch { /* default */ } }

        // Bag pulse is a one-time tutorial cue. Once the bag was inspected after
        // receiving it, every later Garden visit must restore that persisted state.
        const inspectedBag = await AsyncStorage.getItem(BAG_INSPECTED_KEY);
        setBagInspected(inspectedBag === "true");

        // Load day
        const rawDay = await AsyncStorage.getItem(GSK.DAY_INDEX);
        const di = rawDay !== null ? parseInt(rawDay, 10) : 0;
        setDayIdx(di);

        // Load inventory
        const rawInv = await AsyncStorage.getItem(GSK.INVENTORY);
        if (rawInv) {
          try { setInventory(JSON.parse(rawInv)); } catch { /* use default */ }
        }

        // Load selected fertilizer
        const rawFert = await AsyncStorage.getItem(GSK.SEL_FERTILIZER);
        if (rawFert) setSelectedFertilizer(rawFert);

        // Load plot data
        const rawPlot = await AsyncStorage.getItem(GSK.PLOT_DATA);
        if (rawPlot) {
          try { setPlotData(JSON.parse(rawPlot)); } catch { /* use default */ }
        }

        // Check intro seen
        const seenIntro = await AsyncStorage.getItem(GSK.HAS_SEEN_INTRO);
        if (seenIntro !== "true") {
          // First visit: plot appears, then intro bubbles
          setGardenState("GARDEN_PLOT_APPEARING");
          plotOpacity.value = 0;
          setTimeout(() => {
            plotOpacity.value = withTiming(1, { duration: 700 }, (done) => {
              if (done) runOnJS(showIntroBubble1)();
            });
          }, 300);
        } else {
          // Returning: restore tutorial state
          const rawTutState = await AsyncStorage.getItem(GSK.TUT_STATE);
          const tutComplete  = await AsyncStorage.getItem(GSK.TUT_COMPLETE);
          plotOpacity.value = 1;

          // ── Tuesday flow detection ──────────────────────────────────────────
          const bagUnlocked = await AsyncStorage.getItem(GSK.BAG_UNLOCKED);
          const hasHarvested = await AsyncStorage.getItem(GSK.HAS_HARVESTED);
          const hasBucket = await AsyncStorage.getItem(GSK.HAS_BUCKET);
          const activityBar = await AsyncStorage.getItem(GSK.ACTIVITY_BAR);
          const hasWater = await AsyncStorage.getItem(GSK.HAS_WATER);
          const cookingDone = await AsyncStorage.getItem("@kitchen:cooking_tutorial_done");

          // Once the Cooking Tutorial is finished, every old Tuesday Garden gate is over.
          // Keep unlocked UI, but restore the room as ordinary free-play instead of
          // demanding another Bucket of Water on every later visit.
          if (cookingDone === "true") {
            setActivityBarVisible(activityBar === "true");
            if (bagUnlocked === "true") {
              setPlayerBag(prev => ({ ...prev, unlocked: true }));
            }
            setGardenState("IDLE");
          } else if (activityBar === "true") {
            setActivityBarVisible(true);
            // Restore bag unlock
            if (bagUnlocked === "true") {
              setPlayerBag(prev => ({ ...prev, unlocked: true }));
            }
            if (hasWater === "true") {
              setGardenState("TUTORIAL_WATER_FETCHED");
            } else {
              setGardenState("WAITING_FOR_WELL_ACTION");
            }
          } else if (hasBucket === "true") {
            // Has bucket but no activity bar yet? Restart bucket gift
            if (bagUnlocked === "true") {
              setPlayerBag(prev => ({ ...prev, unlocked: true }));
            }
            setActivityBarVisible(true);
            setGardenState("ACTIVITY_BAR_UNLOCKED");
          } else if (hasHarvested === "true") {
            if (bagUnlocked === "true") setPlayerBag(prev => ({ ...prev, unlocked: true }));
            setGardenState("TUTORIAL_HARVEST_COMPLETE");
            // Trigger bucket gift if not done
            setTimeout(() => startBucketGiftFlow(), 800);
          } else if (bagUnlocked === "true" || di >= 1) {
            // Either already unlocked (bag inspection pending/done) OR first Tuesday entry
            if (bagUnlocked === "true") {
              setPlayerBag(prev => ({ ...prev, unlocked: true }));
              const inspected = await AsyncStorage.getItem(BAG_INSPECTED_KEY);
              if (inspected === "true") {
                setBagInspected(true);
                setGardenState("TUTORIAL_HARVEST_AVAILABLE");
              } else {
                setGardenState("WAITING_FOR_BAG_INSPECTION");
              }
            } else {
              // First Tuesday entry – start bag gift
              setGardenState("INVENTORY_BAG_GIFT");
              // Tuesday: bag gift fires immediately on garden entry
              setTimeout(() => startBagGiftFlow(), 150);
            }
          } else if (tutComplete === "true") {
            setGardenState("IDLE");
          } else if (rawTutState === "GARDEN_MINIMUM_TASK_COMPLETE") {
            setGardenState("GARDEN_MINIMUM_TASK_COMPLETE");
          } else {
            setGardenState("GARDEN_PLOT_INTERACTIVE");
          }
        }
      } catch {
        setGardenState("GARDEN_PLOT_INTERACTIVE");
        plotOpacity.value = 1;
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
      if (playerBubbleTimer.current) clearTimeout(playerBubbleTimer.current);
      if (staminaCountTimer.current) clearInterval(staminaCountTimer.current);
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Measure portrait layouts (for bubble positioning)
  // ─────────────────────────────────────────────────────────────────────────
  function measurePortraits() {
    playerPortraitRef.current?.measureInWindow((x, y, w, h) => {
      portraitLayouts.current.player = { x, y, w, h };
    });
    rupertPortraitRef.current?.measureInWindow((x, y, w, h) => {
      portraitLayouts.current.rupert = { x, y, w, h };
    });
    bagIconViewRef.current?.measureInWindow((x, y, w, h) => {
      bagIconLayout.current = { cx: x + w / 2, cy: y + h / 2 };
    });
    cropAreaViewRef.current?.measureInWindow((x, y, w, h) => {
      cropLayout.current = { cx: x + w / 2, cy: y + h / 2 };
    });
  }

  useEffect(() => {
    const t = setTimeout(measurePortraits, 500);
    return () => clearTimeout(t);
  }, [W, H, insets.top, insets.bottom]);

  // ─────────────────────────────────────────────────────────────────────────
  // State helpers
  // ─────────────────────────────────────────────────────────────────────────
  function setGardenState(s: GTState) {
    gtsRef.current = s;
    setGts(s);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Flying item animation helper
  // Sets initial position, stores target in ref, then triggers re-render.
  // Actual animation starts in useEffect after React renders the image.
  // ─────────────────────────────────────────────────────────────────────────
  function startFlyAnim(
    image: ReturnType<typeof require>,
    sx: number, sy: number,
    ex: number, ey: number,
    onDone?: () => void,
  ) {
    // Set starting position BEFORE React re-renders (shared values update immediately on UI thread)
    flyX.value = sx;
    flyY.value = sy;
    flyScale.value = 1.2;
    flyOpacity.value = 0; // start invisible; useEffect will reveal after render

    // Store target; useEffect will pick this up after React re-renders with the new image
    pendingFlyRef.current = { ex, ey, onDone };

    // Trigger React re-render to mount the Image inside the Animated.View
    setFlyImg(image);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Action flash: centered image fades up over 1s (getwater / getwood / getstone)
  // Multiple flashes can coexist (rapid tapping supported)
  // ─────────────────────────────────────────────────────────────────────────
  function triggerActionFlash(image: number, plusText?: string) {
    const key = String(Date.now() + Math.random());
    const opacityAnim = new RNAnimated.Value(1);
    const translateYAnim = new RNAnimated.Value(0);
    setActionFlashes(prev => [...prev, { key, image, opacityAnim, translateYAnim, plusText }]);
    RNAnimated.parallel([
      RNAnimated.timing(opacityAnim,    { toValue: 0,   duration: 1000, useNativeDriver: true }),
      RNAnimated.timing(translateYAnim, { toValue: -90, duration: 1000, useNativeDriver: true }),
    ]).start(() => {
      setActionFlashes(prev => prev.filter(f => f.key !== key));
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Bubble engine (same pattern as kitchen)
  // ─────────────────────────────────────────────────────────────────────────
  function showBubble(
    text: string,
    speaker: string,
    policy: BubblePolicy,
    autoMs: number | null,
    onClose: () => void,
    logId?: string,
  ) {
    if (bubbleTimer.current) { clearTimeout(bubbleTimer.current); bubbleTimer.current = null; }
    bubbleDoneRef.current = onClose;
    setBubble({ text, speaker, policy });
    // Log to logbook
    if (logId) {
      const dayNames = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
      const day = dayNames[dayIdx] ?? "MO";
      setLogbook(prev => {
        if (prev.some(e => e.id === logId)) return prev;
        const entry: LogEntry = { id: logId, speaker, text, day, location: "garden", seq: prev.length };
        const updated = [...prev, entry];
        AsyncStorage.setItem(LOGBOOK_KEY, JSON.stringify(updated)).catch(() => {});
        return updated;
      });
    }
    if (autoMs) {
      bubbleTimer.current = setTimeout(() => {
        bubbleTimer.current = null;
        dismissBubble();
      }, autoMs);
    }
  }

  function dismissBubble() {
    if (bubbleTimer.current) { clearTimeout(bubbleTimer.current); bubbleTimer.current = null; }
    setBubble(null);
    const cb = bubbleDoneRef.current;
    bubbleDoneRef.current = null;
    if (cb) cb();
  }

  function dismissBubbleNoCallback() {
    if (bubbleTimer.current) { clearTimeout(bubbleTimer.current); bubbleTimer.current = null; }
    bubbleDoneRef.current = null;
    setBubble(null);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Player thought bubble (auto-dismiss, non-stackable)
  // ─────────────────────────────────────────────────────────────────────────
  function showPlayerBubble(text: string) {
    if (playerBubble) return; // not stackable
    if (playerBubbleTimer.current) clearTimeout(playerBubbleTimer.current);
    const thought = text.trim().replace(/^["“”]+|["“”]+$/g, "");
    setPlayerBubble(thought);
    playerBubbleTimer.current = setTimeout(() => {
      setPlayerBubble(null);
      playerBubbleTimer.current = null;
    }, 2500);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Tutorial: intro bubble sequence
  // ─────────────────────────────────────────────────────────────────────────
  function showIntroBubble1() {
    measurePortraits();
    setGardenState("GARDEN_INTRO_DIALOG_1");
    setRupertPortrait("normal");
    showBubble(
      '"This garden has seen better days. I only use one small bed, but you\'re welcome to clear more space if you can get through the weeds."',
      "Rupert",
      "BLOCK_ALL",
      null,
      showIntroBubble2,
    );
  }

  function showIntroBubble2() {
    setGardenState("GARDEN_INTRO_DIALOG_2");
    showBubble(
      '"Looks like the herbs aren\'t ready to harvest yet. One more day. We\'ll cook together tomorrow."',
      "Rupert",
      "BLOCK_ALL",
      null,
      showIntroBubble3,
    );
  }

  function showIntroBubble3() {
    setGardenState("GARDEN_INTRO_DIALOG_3");
    setRupertPortrait("sad");
    showBubble(
      '"My back is still aching from yesterday. Please help me. The herbs only need water to grow, but pulling weeds and adding fertilizer will improve the yield."',
      "Rupert",
      "BLOCK_ALL",
      null,
      onIntroBubble3Done,
    );
  }

  async function onIntroBubble3Done() {
    setRupertPortrait("normal");
    await AsyncStorage.setItem(GSK.HAS_SEEN_INTRO, "true");
    setGardenState("GARDEN_PLOT_INTERACTIVE");
    await AsyncStorage.setItem(GSK.TUT_STATE, "GARDEN_PLOT_INTERACTIVE");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Stamina helpers — centralised spend function that also tracks daily total
  // ─────────────────────────────────────────────────────────────────────────
  function deductStamina(amount: number, floatLabel: string) {
    const oldSta = staminaCurrentRef.current;
    const actualAmount = Math.min(Math.max(0, amount), oldSta);
    const newSta = oldSta - actualAmount;
    staminaCurrentRef.current = newSta;
    setStaminaCurrent(newSta);
    staminaSV.value = withTiming(newSta, { duration: STA_MS });
    AsyncStorage.setItem(GSK.STAMINA, String(newSta)).catch(() => {});

    // Track actual daily spend (only increments, never decrements)
    const newSpent = staminaSpentTodayRef.current + actualAmount;
    staminaSpentTodayRef.current = newSpent;
    setStaminaSpentToday(newSpent);
    AsyncStorage.setItem(GSK.STAMINA_SPENT_TODAY, String(newSpent)).catch(() => {});

    // Float animation — slower/softer per centralized config
    setFloatText(floatLabel);
    staFloatY.value = 0;
    staFloatOp.value = 0;
    staFloatOp.value = withTiming(1, { duration: FLOAT_FADE_IN });
    staFloatY.value = withTiming(-FLOAT_RISE_PX, { duration: FLOAT_MS });
    setTimeout(() => {
      staFloatOp.value = withTiming(0, { duration: FLOAT_FADE_OUT });
    }, FLOAT_MS - FLOAT_FADE_OUT);

    // Counter animation
    const start = oldSta;
    const end = newSta;
    const steps = 16;
    const stepMs = STA_MS / steps;
    let count = 0;
    if (staminaCountTimer.current) clearInterval(staminaCountTimer.current);
    staminaCountTimer.current = setInterval(() => {
      count++;
      const v = Math.round(start + ((end - start) * count) / steps);
      setStaminaDisplay(Math.max(v, end));
      if (count >= steps) { clearInterval(staminaCountTimer.current!); setStaminaDisplay(end); }
    }, stepMs);
  }

  async function spendSecondPlotStamina(baseCost: number): Promise<boolean> {
    const actualCost = calcEffectiveStaminaCost(baseCost, playerStats.endurance);
    if (staminaCurrentRef.current < actualCost) return false;
    deductStamina(actualCost, `-${actualCost}`);
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Garden actions
  // ─────────────────────────────────────────────────────────────────────────

  async function handleWater() {
    if (actionLocked.current) return;
    if (plotData.wateredToday) {
      showPlayerBubble('"Already watered today."');
      return;
    }
    const waterCost = calcEffectiveStaminaCost(2, playerStats.endurance);
    if (staminaCurrent < waterCost) {
      showPlayerBubble('"Not enough stamina."');
      return;
    }
    actionLocked.current = true;

    // Update plot state BEFORE animation
    const newPlot: GardenPlotData = { ...plotData, wateredToday: true };
    setPlotData(newPlot);
    await AsyncStorage.setItem(GSK.PLOT_DATA, JSON.stringify(newPlot));

    // Update tutorial state
    if (gtsRef.current === "GARDEN_PLOT_INTERACTIVE") {
      setGardenState("GARDEN_MINIMUM_TASK_COMPLETE");
      await AsyncStorage.setItem(GSK.TUT_STATE, "GARDEN_MINIMUM_TASK_COMPLETE");
      await AsyncStorage.setItem(GSK.MIN_TASK_DONE, "true");
      await AsyncStorage.setItem(GSK.HAS_WATERED, "true");
    }

    deductStamina(waterCost, `-${waterCost}`);
    actionLocked.current = false;
  }

  async function handlePullWeeds() {
    if (actionLocked.current) return;

    if (plotData.withered) {
      // Special: remove withered crop
      const clearCost = calcEffectiveStaminaCost(5, playerStats.endurance);
      if (staminaCurrent < clearCost) { showPlayerBubble('"Not enough stamina."'); return; }
      actionLocked.current = true;
      const newPlot: GardenPlotData = {
        ...TUTORIAL_PLOT_INITIAL,
        id: plotData.id,
        plotType: plotData.plotType,
        upgradeLevel: plotData.upgradeLevel,
        // Reset to empty
        status: "empty",
        cropType: null, cropAsset: null, seedItemId: null,
        progressPercent: 0, completedGrowthDays: 0, remainingGrowthDays: 0,
        totalGrowthDays: 0, wateredToday: false, weedsPulledToday: false,
        fertilizedToday: false, fertilizerTypeUsedToday: null,
        consecutiveUnwateredDays: 0, baseYield: 0,
        accumulatedWeedYieldBonus: 0, accumulatedFertilizerYieldBonus: 0,
        readyToHarvest: false, withered: false,
      };
      setPlotData(newPlot);
      await AsyncStorage.setItem(GSK.PLOT_DATA, JSON.stringify(newPlot));
      deductStamina(clearCost, `-${clearCost}`);
      actionLocked.current = false;
      return;
    }

    if (plotData.weedsPulledToday) {
      showPlayerBubble('"I already did this today."');
      return;
    }
    const pullCost = calcEffectiveStaminaCost(8, playerStats.endurance);
    if (staminaCurrent < pullCost) { showPlayerBubble('"Not enough stamina."'); return; }
    actionLocked.current = true;

    const newPlot: GardenPlotData = {
      ...plotData,
      weedsPulledToday: true,
      accumulatedWeedYieldBonus: plotData.accumulatedWeedYieldBonus + 1,
    };
    setPlotData(newPlot);
    await AsyncStorage.setItem(GSK.PLOT_DATA, JSON.stringify(newPlot));
    if (gtsRef.current === "GARDEN_PLOT_INTERACTIVE" || gtsRef.current === "GARDEN_MINIMUM_TASK_COMPLETE") {
      await AsyncStorage.setItem(GSK.HAS_PULLED_WEEDS, "true");
    }
    deductStamina(pullCost, `-${pullCost}`);
    actionLocked.current = false;
  }

  async function handleFertilize() {
    if (actionLocked.current) return;
    if (plotData.fertilizedToday) {
      showPlayerBubble('"Already fertilized today."');
      return;
    }
    if (plotData.withered) { showPlayerBubble('"Can\'t fertilize a withered plant."'); return; }

    // Find selected fertilizer in inventory
    const fertItem = inventory.find(i => i.id === selectedFertilizer && i.itemType === "fertilizer");
    if (!fertItem || fertItem.quantity <= 0) {
      showPlayerBubble('"No fertilizer available."');
      return;
    }
    const fertConfig = FERTILIZER_CONFIGS.find(f => f.id === selectedFertilizer);
    if (!fertConfig) { showPlayerBubble('"No fertilizer available."'); return; }

    const fertilizerCost = calcEffectiveStaminaCost(fertConfig.staminaCost, playerStats.endurance);
    if (staminaCurrentRef.current < fertilizerCost) {
      showPlayerBubble('"Not enough stamina."');
      return;
    }
    actionLocked.current = true;

    // Deduct fertilizer from inventory
    const newInv = inventory.map(i =>
      i.id === selectedFertilizer ? { ...i, quantity: Math.max(0, i.quantity - 1) } : i,
    );
    setInventory(newInv);
    await AsyncStorage.setItem(GSK.INVENTORY, JSON.stringify(newInv));

    const newPlot: GardenPlotData = {
      ...plotData,
      fertilizedToday: true,
      fertilizerTypeUsedToday: selectedFertilizer,
      accumulatedFertilizerYieldBonus: plotData.accumulatedFertilizerYieldBonus + fertConfig.yieldBonus,
    };
    setPlotData(newPlot);
    await AsyncStorage.setItem(GSK.PLOT_DATA, JSON.stringify(newPlot));
    if (gtsRef.current === "GARDEN_PLOT_INTERACTIVE" || gtsRef.current === "GARDEN_MINIMUM_TASK_COMPLETE") {
      await AsyncStorage.setItem(GSK.HAS_FERTILIZED, "true");
    }
    deductStamina(fertilizerCost, `-${fertilizerCost}`);
    actionLocked.current = false;
  }

  function createEmptyPrimaryPlot(): GardenPlotData {
    return {
      ...TUTORIAL_PLOT_INITIAL,
      id: plotData.id,
      plotType: plotData.plotType,
      upgradeLevel: plotData.upgradeLevel,
      status: "empty",
      cropType: null,
      cropAsset: null,
      seedItemId: null,
      progressPercent: 0,
      completedGrowthDays: 0,
      remainingGrowthDays: 0,
      totalGrowthDays: 0,
      wateredToday: false,
      weedsPulledToday: false,
      fertilizedToday: false,
      fertilizerTypeUsedToday: null,
      consecutiveUnwateredDays: 0,
      baseYield: 0,
      accumulatedWeedYieldBonus: 0,
      accumulatedFertilizerYieldBonus: 0,
      readyToHarvest: false,
      withered: false,
    };
  }

  async function handleHarvest() {
    if (actionLocked.current) return;
    if (!plotData.readyToHarvest) {
      showPlayerBubble('"Not ready yet."');
      return;
    }

    // Tuesday tutorial state: harvest into PlayerBag
    if (gtsRef.current === "TUTORIAL_HARVEST_AVAILABLE") {
      if (!playerBag.unlocked) {
        showPlayerBubble('"I need my bag first."');
        return;
      }
      if (!bagInspected) {
        showPlayerBubble('"I should check my bag first."');
        return;
      }
      if (harvestLocked.current) return;
      harvestLocked.current = true;
      setGardenState("TUTORIAL_HARVEST_IN_PROGRESS");

      const finalYield = plotData.baseYield + plotData.accumulatedWeedYieldBonus + plotData.accumulatedFertilizerYieldBonus;

      const herbbagItem: BagItem = {
        id: "herbbag",
        itemType: "herbbag",
        name: `Herb Bag`,
        quantity: 1,
        containedItem: "herbs",
        containedQuantity: finalYield,
      };

      // Measure positions for fly animation
      await new Promise<void>(res => {
        bagIconViewRef.current?.measureInWindow((x, y, w, h) => {
          bagIconLayout.current = { cx: x + w / 2, cy: y + h / 2 };
          res();
        }) ?? res();
      });
      await new Promise<void>(res => {
        cropAreaViewRef.current?.measureInWindow((x, y, w, h) => {
          cropLayout.current = { cx: x + w / 2, cy: y + h / 2 };
          res();
        }) ?? res();
      });

      const startPos = cropLayout.current ?? { cx: W / 2, cy: H * 0.45 };
      const endPos   = bagIconLayout.current ?? { cx: W * 0.75, cy: H * 0.2 };

      // Defensive: ensure herbbag asset is decoded before flying animation
      await ensureAssetReady('herbbag');

      const emptyPlot = createEmptyPrimaryPlot();
      let harvestCommit;
      try {
        harvestCommit = await commitHarvestBag(herbbagItem, [
          [GSK.PLOT_DATA, JSON.stringify(emptyPlot)],
        ]);
      } catch {
        showPlayerBubble('"I can\'t store this harvest right now."');
        setGardenState("TUTORIAL_HARVEST_AVAILABLE");
        harvestLocked.current = false;
        return;
      }
      if (!harvestCommit.ok) {
        showPlayerBubble(harvestCommit.reason === "bag_locked"
          ? '"I need my bag first."'
          : '"My bag is full."');
        setGardenState("TUTORIAL_HARVEST_AVAILABLE");
        harvestLocked.current = false;
        return;
      }

      playerBagRef.current = harvestCommit.bag;
      setPlayerBag(harvestCommit.bag);
      setPlotData(emptyPlot);
      audioManager.playSoundEffect('moveitem', { maxDurationMs: 3000 });

      // Start fly animation, then complete harvest after
      startFlyAnim(
        IMG.herbbag,
        startPos.cx, startPos.cy,
        endPos.cx, endPos.cy,
        async () => {
          await Promise.all([
            AsyncStorage.setItem(GSK.HAS_HARVESTED, "true"),
            AsyncStorage.setItem(GSK.HARVEST_YIELD, String(finalYield)),
          ]);

          setGardenState("TUTORIAL_HARVEST_COMPLETE");
          harvestLocked.current = false;

          // Show Rupert response then start bucket gift
          setTimeout(() => startBucketGiftFlow(), 800);
        },
      );
      return;
    }

    // Free-play harvest: every harvest bag gets its own next free Player Bag slot.
    const harvestCost = calcEffectiveStaminaCost(1, playerStats.endurance);
    if (staminaCurrentRef.current < harvestCost) { showPlayerBubble('"Not enough stamina."'); return; }
    actionLocked.current = true;

    const finalYield = plotData.baseYield + plotData.accumulatedWeedYieldBonus + plotData.accumulatedFertilizerYieldBonus;
    const harvestBag = createHarvestBagForCrop(plotData.seedItemId, finalYield);
    if (!harvestBag) {
      showPlayerBubble('"I can\'t harvest this crop yet."');
      actionLocked.current = false;
      return;
    }
    const emptyPlot = createEmptyPrimaryPlot();

    try {
      const harvestCommit = await commitHarvestBag(harvestBag, [
        [GSK.PLOT_DATA, JSON.stringify(emptyPlot)],
        [GSK.TUT_STATE, "IDLE"],
        [GSK.TUT_COMPLETE, "true"],
      ]);
      if (!harvestCommit.ok) {
        showPlayerBubble(harvestCommit.reason === "bag_locked"
          ? '"I need my bag first."'
          : '"My bag is full."');
        return;
      }

      playerBagRef.current = harvestCommit.bag;
      setPlayerBag(harvestCommit.bag);
      setPlotData(emptyPlot);
      setGardenState("IDLE");
      deductStamina(harvestCost, `-${harvestCost}`);
      audioManager.playSoundEffect('moveitem', { maxDurationMs: 3000 });
    } catch {
      showPlayerBubble('"I can\'t store this harvest right now."');
    } finally {
      actionLocked.current = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Crop tap / Seed planting / Tear-out
  // ─────────────────────────────────────────────────────────────────────────
  function handleCropTap() {
    if (!plotInteractive) return;

    if (plotData.status !== "empty" && rupertAwayFromGarden) {
      showPlayerBubble('"I shouldn\'t waste any seeds."');
      return;
    }

    if (plotData.status === "empty") {
      const availableSeeds = inventory.filter(i => i.itemType === "seed" && i.quantity > 0);
      if (availableSeeds.length === 0) {
        showPlayerBubble('"I have no seeds."');
        return;
      }
      setSelectedSeedId(null);
      setSeedModalVisible(true);
      return;
    }
    setShowTearOut(true);
  }

  function handleTearOutNo() {
    setShowTearOut(false);
  }

  async function handleTearOutYes() {
    setShowTearOut(false);
    // Protect tutorial plot through TH (MO=0, TU=1, WE=2, TH=3)
    const isTutorialProtected = dayIdx <= 3;
    if (isTutorialProtected) {
      setRupertPortrait("sad");
      showBubble(
        '"Wait, what are you doing? Please don\'t waste any seeds."',
        "Rupert",
        "BLOCK_ALL",
        3500,
        () => setRupertPortrait("normal"),
      );
      return;
    }
    // Post-TH: actually remove the crop
    const clearedPlot: GardenPlotData = {
      ...plotData,
      status: "empty",
      cropType: null, cropAsset: null, seedItemId: null,
      progressPercent: 0, completedGrowthDays: 0, remainingGrowthDays: 0,
      totalGrowthDays: 0, wateredToday: false, weedsPulledToday: false,
      fertilizedToday: false, fertilizerTypeUsedToday: null,
      consecutiveUnwateredDays: 0, baseYield: 0,
      accumulatedWeedYieldBonus: 0, accumulatedFertilizerYieldBonus: 0,
      readyToHarvest: false, withered: false,
    };
    setPlotData(clearedPlot);
    await AsyncStorage.setItem(GSK.PLOT_DATA, JSON.stringify(clearedPlot));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Day change (Sleep / Rest) — via menu
  // ─────────────────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function handleSleep() {
    if (actionLocked.current) return;
    setShowMenu(false);

    // Advance day
    const newDayIdx = (dayIdx + 1) % 7;
    setDayIdx(newDayIdx);
    await AsyncStorage.setItem(GSK.DAY_INDEX, String(newDayIdx));

    // Process plot growth
    const p = { ...plotData };

    if ((p.status === "growing" || p.status === "withered") && !p.readyToHarvest) {
      if (!p.withered) {
        if (p.wateredToday) {
          // Successful growth day
          p.completedGrowthDays = Math.min(p.completedGrowthDays + 1, p.totalGrowthDays);
          p.progressPercent = Math.round((p.completedGrowthDays / p.totalGrowthDays) * 100);
          p.remainingGrowthDays = Math.max(0, p.totalGrowthDays - p.completedGrowthDays);
          p.consecutiveUnwateredDays = 0;
          if (p.completedGrowthDays >= p.totalGrowthDays) {
            p.status = "ready";
            p.readyToHarvest = true;
          }
        } else {
          // Unwatered
          p.consecutiveUnwateredDays += 1;
          if (p.consecutiveUnwateredDays >= 3) {
            p.withered = true;
            p.status = "withered";
          }
        }
      }
    }

    // Reset daily flags (keep cumulative bonuses)
    p.wateredToday = false;
    p.weedsPulledToday = false;
    p.fertilizedToday = false;
    p.fertilizerTypeUsedToday = null;

    setPlotData(p);
    await AsyncStorage.setItem(GSK.PLOT_DATA, JSON.stringify(p));
  }


  // ─────────────────────────────────────────────────────────────────────────
  // Tuesday: Bag gift flow
  // ─────────────────────────────────────────────────────────────────────────
  async function startBagGiftFlow() {
    if (bagGiftLocked.current) return;
    bagGiftLocked.current = true;
    setGardenState("INVENTORY_BAG_GIFT");
    setRupertPortrait("normal");
    showBubble(
      '"Wait, take this. You can store the herbs in it."',
      "Rupert",
      "BLOCK_ALL",
      null,
      async () => {
        // Use ref to avoid stale closure
        const currentBag = playerBagRef.current;
        const unlockedBag: PlayerBagData = { ...currentBag, unlocked: true };
        setPlayerBag(unlockedBag);
        await AsyncStorage.setItem(PLAYER_BAG_KEY, JSON.stringify(unlockedBag));
        await AsyncStorage.setItem(GSK.BAG_UNLOCKED, "true");
        setGardenState("WAITING_FOR_BAG_INSPECTION");
        bagGiftLocked.current = false;
      },
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Tuesday: Bag open (inspect) handler
  // ─────────────────────────────────────────────────────────────────────────
  async function handleOpenBag() {
    if (!playerBag.unlocked) return;
    setBagOpen(true);
    if (!bagInspected) {
      setBagInspected(true);
      await AsyncStorage.setItem(BAG_INSPECTED_KEY, "true");
      if (gtsRef.current === "WAITING_FOR_BAG_INSPECTION") {
        setGardenState("TUTORIAL_HARVEST_AVAILABLE");
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Tuesday: Bucket gift flow
  // ─────────────────────────────────────────────────────────────────────────
  async function startBucketGiftFlow() {
    if (bucketGiftLocked.current) return;
    bucketGiftLocked.current = true;
    setGardenState("BUCKET_GIFT");
    setRupertPortrait("laugh");
    showBubble(
      '"Looks good. Now we need water. You can use this to fetch some from the well."',
      "Rupert",
      "BLOCK_ALL",
      null,
      async () => {
        // Use ref to get fresh bag state, avoiding stale closure
        const currentBag = playerBagRef.current;
        const alreadyHasBucket = currentBag.slots.some(s => s !== null && s.id === "bucket");
        if (!alreadyHasBucket) {
          const bucketItem: BagItem = {
            id: "bucket",
            itemType: "bucket",
            name: "Empty Bucket",
            quantity: 1,
          };
          // Ensure bag is unlocked when adding
          const bagForTransfer: PlayerBagData = { ...currentBag, unlocked: true };
          const result = planAddToBag(bucketItem, bagForTransfer);
          if (result.canTransfer) {
            const newBag: PlayerBagData = { ...bagForTransfer, slots: result.updatedSlots };
            setPlayerBag(newBag);
            audioManager.playSoundEffect('moveitem', { maxDurationMs: 3000 });
            await AsyncStorage.setItem(PLAYER_BAG_KEY, JSON.stringify(newBag));

            // Fly animation: bucket from Rupert to bag icon
            const rupertL = portraitLayouts.current.rupert;
            bagIconViewRef.current?.measureInWindow((x, y, w, h) => {
              bagIconLayout.current = { cx: x + w / 2, cy: y + h / 2 };
            });
            // Defensive: ensure bucket asset is decoded before fly; then animate
            setTimeout(async () => {
              await ensureAssetReady('bucket');
              const startX = rupertL ? rupertL.x + rupertL.w / 2 : W / 2;
              const startY = rupertL ? rupertL.y + rupertL.h / 2 : H * 0.2;
              const endX   = bagIconLayout.current?.cx ?? W * 0.75;
              const endY   = bagIconLayout.current?.cy ?? H * 0.18;
              startFlyAnim(
                IMG.bucket,
                startX, startY, endX, endY,
              );
            }, 200);
          }
        }
        await AsyncStorage.setItem(GSK.HAS_BUCKET, "true");
        setActivityBarVisible(true);
        await AsyncStorage.setItem(GSK.ACTIVITY_BAR, "true");
        setRupertPortrait("normal");
        setGardenState("ACTIVITY_BAR_UNLOCKED");
        bucketGiftLocked.current = false;
        // Brief delay then move to waiting state
        setTimeout(() => {
          setGardenState("WAITING_FOR_WELL_ACTION");
        }, 600);
      },
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Activity Bar: handle activity tap
  // ─────────────────────────────────────────────────────────────────────────
  function handleActivity(id: ActivityId) {
    if (rupertInDining && id !== "well") {
      showPlayerBubble('"I need to cook herb soup for the guest."');
      return;
    }
    if (id === "well")              handleWellAction();
    else if (id === "collectWood")  handleCollectWood();
    else if (id === "collectStone") handleCollectStone();
    else if (id === "workout")      handleWorkout();
  }

  function handleLockedActivity(_id: ActivityId) {
    showPlayerBubble('"Now is not the time for this."');
  }

  async function handleWellAction() {
    if (wellLocked.current || actionLocked.current) return;

    // Check empty bucket in bag
    const bucketSlotIdx = playerBag.slots.findIndex(s => s !== null && s.id === "bucket");
    if (bucketSlotIdx === -1) {
      showPlayerBubble('"I need an empty bucket to get water."');
      return;
    }

    const wellCost = calcEffectiveStaminaCost(3, playerStats.endurance);
    if (staminaCurrent < wellCost) {
      showPlayerBubble('"Not enough stamina."');
      return;
    }

    wellLocked.current = true;

    // Replace bucket with bucketwater in the same slot
    const newSlots = [...playerBag.slots];
    newSlots[bucketSlotIdx] = {
      id: "bucketwater",
      itemType: "bucketwater",
      name: "Bucket of Water",
      quantity: 1,
    };
    const newBag = { ...playerBag, slots: newSlots };
    setPlayerBag(newBag);
    deductStamina(wellCost, `-${wellCost}`);

    // Flash animation + sound
    triggerActionFlash(IMG.getwater);
    audioManager.playSoundEffect('getwater', { maxDurationMs: 3000 });

    await Promise.all([
      AsyncStorage.setItem(PLAYER_BAG_KEY, JSON.stringify(newBag)),
      AsyncStorage.setItem(GSK.HAS_WATER, "true"),
    ]);

    setGardenState("TUTORIAL_WATER_FETCHED");
    wellLocked.current = false;
  }

  async function handleCollectWood() {
    if (woodLocked.current || actionLocked.current) return;
    const cost = calcEffectiveStaminaCost(5, playerStats.endurance);
    if (staminaCurrent < cost) { showPlayerBubble('"Not enough stamina."'); return; }
    if (sharedResources.wood >= 999) { showPlayerBubble('"Storage is full."'); return; }

    woodLocked.current = true;
    deductStamina(cost, `-${cost}`);
    triggerActionFlash(IMG.wood, "+1");
    audioManager.playSoundEffect('getwood', { maxDurationMs: 3000 });

    const newRes = { ...sharedResources, wood: Math.min(sharedResources.wood + 1, 999) };
    setSharedResources(newRes);
    await AsyncStorage.setItem(SHARED_RESOURCES_KEY, JSON.stringify(newRes));
    woodLocked.current = false;
  }

  async function handleCollectStone() {
    if (stoneLocked.current || actionLocked.current) return;
    const cost = calcEffectiveStaminaCost(5, playerStats.endurance);
    if (staminaCurrent < cost) { showPlayerBubble('"Not enough stamina."'); return; }
    if (sharedResources.stone >= 999) { showPlayerBubble('"Storage is full."'); return; }

    stoneLocked.current = true;
    deductStamina(cost, `-${cost}`);
    triggerActionFlash(IMG.stone, "+1");
    audioManager.playSoundEffect('getstone', { maxDurationMs: 3000 });

    const newRes = { ...sharedResources, stone: Math.min(sharedResources.stone + 1, 999) };
    setSharedResources(newRes);
    await AsyncStorage.setItem(SHARED_RESOURCES_KEY, JSON.stringify(newRes));
    stoneLocked.current = false;
  }

  function handleWorkout() {
    if (workoutLocked.current || actionLocked.current) return;
    const cost = calcEffectiveStaminaCost(15, playerStats.endurance);
    if (staminaCurrent < cost) { showPlayerBubble('"Not enough stamina."'); return; }

    workoutLocked.current = true;
    deductStamina(cost, `-${cost}`);
    setWorkoutState("phase1");

    setTimeout(() => {
      setWorkoutState("phase2");
      audioManager.playSoundEffect('bling', { maxDurationMs: 2000 });
      // +5 Growth Points
      const newStats = { ...playerStats, growthPoints: playerStats.growthPoints + 5 };
      setPlayerStats(newStats);
      AsyncStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(newStats)).catch(() => {});
    }, 300);

    setTimeout(() => {
      setWorkoutState("none");
      workoutLocked.current = false;
    }, 800);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Seed planting confirm
  // ─────────────────────────────────────────────────────────────────────────
  async function handleConfirmPlant() {
    if (!selectedSeedId || plantBusy) return;
    setPlantBusy(true);
    try {
      const rawInventory = await AsyncStorage.getItem(GSK.INVENTORY);
      const latestInventory: InventoryItem[] = rawInventory ? JSON.parse(rawInventory) : [];
      const seedIdx = latestInventory.findIndex(
        i => i.id === selectedSeedId && i.itemType === "seed" && i.quantity > 0,
      );
      if (seedIdx === -1) {
        showPlayerBubble('"That seed is no longer available."');
        return;
      }

      const newPlot = createGardenPlotFromSeed(plotData, selectedSeedId);
      if (!newPlot) {
        showPlayerBubble('"I can\'t plant this seed yet."');
        return;
      }

      const newInv = latestInventory.map(item => ({ ...item }));
      newInv[seedIdx] = { ...newInv[seedIdx], quantity: newInv[seedIdx].quantity - 1 };
      await AsyncStorage.multiSet([
        [GSK.INVENTORY, JSON.stringify(newInv)],
        [GSK.PLOT_DATA, JSON.stringify(newPlot)],
      ]);
      setInventory(newInv);
      setPlotData(newPlot);
      setSeedModalVisible(false);
      setSelectedSeedId(null);
      if (gtsRef.current === "TUTORIAL_WATER_FETCHED" || gtsRef.current === "GARDEN_REPLANTING_AVAILABLE") {
        setGardenState("GARDEN_REPLANTING_AVAILABLE");
      }
    } catch {
      showPlayerBubble('"I can\'t plant this right now."');
    } finally {
      setPlantBusy(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Avatar tap → open Status modal
  // ─────────────────────────────────────────────────────────────────────────
  function handleAvatarTap() {
    setStatusOpen(true);
  }

  async function handleStatsUpdated(newStats: PlayerStats, newCurrentLife: number | null) {
    setPlayerStats(newStats);
    staminaMaxSV.value = newStats.maximumStamina;
    if (newCurrentLife !== null) setLifeCurrent(newCurrentLife);
    await AsyncStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(newStats));
    if (newCurrentLife !== null) {
      await AsyncStorage.setItem(GSK.LIFE, String(newCurrentLife));
    }
  }


  // ─────────────────────────────────────────────────────────────────────────
  // Manual Save
  // ─────────────────────────────────────────────────────────────────────────
  async function handleManualSave() {
    setShowMenu(false);
    try {
      const rawSlot  = await AsyncStorage.getItem("@game:active_slot");
      const rawSlots = await AsyncStorage.getItem("game_slots");
      if (!rawSlot || !rawSlots) return;
      const slotNum = parseInt(rawSlot, 10);
      const slots   = JSON.parse(rawSlots);
      const updated = slots.map((s: { slot: number }) =>
        s.slot === slotNum
          ? { ...s, dayIdx, stamina: staminaCurrent, life: lifeCurrent, lastSaved: new Date().toISOString() }
          : s,
      );
      await AsyncStorage.setItem("game_slots", JSON.stringify(updated));
      await AsyncStorage.setItem(GSK.SAVE_LOCATION, "garden");
      await createSnapshot(slotNum, "manual");
      setFloatMsg("Game saved.");
      setTimeout(() => setFloatMsg(null), 1800);
    } catch {
      setFloatMsg("Save failed.");
      setTimeout(() => setFloatMsg(null), 1800);
    }
  }

  // ── Main Menu — discard unsaved runtime state first
  async function handleMainMenu() {
    setShowMenu(false);
    audioManager.stopGameplayMusic(1500);
    try {
      const rawSlot = await AsyncStorage.getItem("@game:active_slot");
      if (rawSlot) {
        await discardRuntimeAndRestore(parseInt(rawSlot, 10));
      }
    } catch { /* non-critical */ }
    router.replace("/");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Navigation
  // ─────────────────────────────────────────────────────────────────────────
  function handleKitchenTap() {
    if (bubble) { dismissBubbleNoCallback(); }

    // Point 9 guest meal quest: the old Tuesday tutorial gates must no longer
    // trap the player in Garden. The empty bucket may still be back in Kitchen.
    if (rupertInDining) {
      audioManager.playSoundEffect('footstep', { maxDurationMs: 4000 });
      router.replace("/kitchen");
      return;
    }

    // Leave-lock: only during GARDEN_PLOT_INTERACTIVE (before minimum task complete)
    if (gtsRef.current === "GARDEN_PLOT_INTERACTIVE") {
      showPlayerBubble('"I still have something to do here."');
      return;
    }
    // Tuesday return gate: must have harvested AND fetched water
    const cur = gtsRef.current;
    const inTuesdayFlow =
      cur === "TUTORIAL_HARVEST_AVAILABLE" ||
      cur === "TUTORIAL_HARVEST_IN_PROGRESS" ||
      cur === "TUTORIAL_HARVEST_COMPLETE" ||
      cur === "BUCKET_GIFT" ||
      cur === "ACTIVITY_BAR_UNLOCKED" ||
      cur === "WAITING_FOR_WELL_ACTION" ||
      cur === "TUTORIAL_WATER_FETCHED" ||
      cur === "GARDEN_REPLANTING_AVAILABLE" ||
      cur === "READY_TO_RETURN_TO_KITCHEN" ||
      cur === "INVENTORY_BAG_GIFT" ||
      cur === "WAITING_FOR_BAG_INSPECTION";

    if (inTuesdayFlow) {
      // Check harvest done
      const herbsInBag = playerBag.slots.some(s => s !== null && s.id === "herbbag");
      const waterInBag = playerBag.slots.some(s => s !== null && s.id === "bucketwater");
      const needsHarvest = cur !== "TUTORIAL_HARVEST_COMPLETE" &&
        cur !== "BUCKET_GIFT" && cur !== "ACTIVITY_BAR_UNLOCKED" &&
        cur !== "WAITING_FOR_WELL_ACTION" && cur !== "TUTORIAL_WATER_FETCHED" &&
        cur !== "GARDEN_REPLANTING_AVAILABLE" && cur !== "READY_TO_RETURN_TO_KITCHEN";
      const needsWater = !waterInBag;

      if (needsHarvest && !herbsInBag) {
        showPlayerBubble('"I still need to harvest the herbs."');
        return;
      }
      if (needsHarvest && needsWater && !herbsInBag) {
        showPlayerBubble('"I still need to harvest the herbs and fetch water."');
        return;
      }
      if (needsWater && !waterInBag &&
          (cur === "WAITING_FOR_WELL_ACTION" || cur === "TUTORIAL_WATER_FETCHED" ||
           cur === "GARDEN_REPLANTING_AVAILABLE" || cur === "READY_TO_RETURN_TO_KITCHEN")) {
        showPlayerBubble('"I still need to fetch water."');
        return;
      }

      // Block specific early states
      if (cur === "INVENTORY_BAG_GIFT" || cur === "WAITING_FOR_BAG_INSPECTION") {
        showPlayerBubble('"I need to go to the garden."');
        return;
      }
      if (cur === "TUTORIAL_HARVEST_AVAILABLE" || cur === "TUTORIAL_HARVEST_IN_PROGRESS") {
        showPlayerBubble('"I still need to harvest the herbs."');
        return;
      }
      if (cur === "TUTORIAL_HARVEST_COMPLETE" || cur === "BUCKET_GIFT" || cur === "ACTIVITY_BAR_UNLOCKED") {
        showPlayerBubble('"I still need to fetch water."');
        return;
      }
      if (cur === "WAITING_FOR_WELL_ACTION" && !waterInBag) {
        showPlayerBubble('"I still need to fetch water."');
        return;
      }
    }

    // If leaving Tuesday garden with all required items, persist crafting ready
    if (inTuesdayFlow) {
      const herbsInBag = playerBag.slots.some(s => s !== null && s.id === "herbbag");
      const waterInBag = playerBag.slots.some(s => s !== null && s.id === "bucketwater");
      if (herbsInBag && waterInBag) {
        AsyncStorage.setItem(GSK.CRAFTING_READY, "true").catch(() => {});
        setGardenState("RETURNING_TO_KITCHEN_FOR_CRAFTING");
      }
    }

    // Footstep sound for outdoor → kitchen transition
    audioManager.playSoundEffect('footstep', { maxDurationMs: 4000 });
    if (params.loadedFromSave === "1") router.replace("/kitchen");
    else router.back();
  }

  function handleStorageTap() {
    setShowStorage(true);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Derived
  // ─────────────────────────────────────────────────────────────────────────
  const waterCost      = calcEffectiveStaminaCost(2, playerStats.endurance);
  const pullWeedsCost  = calcEffectiveStaminaCost(8, playerStats.endurance);
  const fertilizeCost  = calcEffectiveStaminaCost(3, playerStats.endurance);

  const plotInteractive =
    gts === "GARDEN_PLOT_INTERACTIVE" ||
    gts === "GARDEN_MINIMUM_TASK_COMPLETE" ||
    gts === "GARDEN_TUTORIAL_COMPLETE" ||
    gts === "TUTORIAL_HARVEST_AVAILABLE" ||
    gts === "WAITING_FOR_WELL_ACTION" ||
    gts === "TUTORIAL_WATER_FETCHED" ||
    gts === "GARDEN_REPLANTING_AVAILABLE" ||
    gts === "READY_TO_RETURN_TO_KITCHEN" ||
    gts === "IDLE";

  const navEnabled =
    gts === "GARDEN_MINIMUM_TASK_COMPLETE" ||
    gts === "GARDEN_TUTORIAL_COMPLETE" ||
    gts === "TUTORIAL_HARVEST_AVAILABLE" ||
    gts === "WAITING_FOR_WELL_ACTION" ||
    gts === "TUTORIAL_WATER_FETCHED" ||
    gts === "GARDEN_REPLANTING_AVAILABLE" ||
    gts === "READY_TO_RETURN_TO_KITCHEN" ||
    gts === "IDLE";

  // Kitchen button: enabled in plotInteractive states  
  const kitchenBtnEnabled = plotInteractive;

  // Activity bar is always visible when unlocked
  const showActivityBar = activityBarVisible;

  // ─────────────────────────────────────────────────────────────────────────
  // Bubble positioning (same logic as kitchen)
  // ─────────────────────────────────────────────────────────────────────────
  function renderBubble() {
    if (!bubble) return null;
    const rupertL = portraitLayouts.current.rupert;
    const bubbleTopPos = rupertL
      ? rupertL.y + rupertL.h + 8
      : (headerH > 0 ? headerH + 128 : insets.top + 190);
    const arrowCenterX = rupertL ? rupertL.x + rupertL.w / 2 : W / 2;
    const bubbleWidthTarget = Math.min(
      W - 32,
      Math.max(180, Math.min(W * 0.78, Math.max(bubble.text.length * 7.2, bubble.speaker.length * 9) + 48)),
    );
    const bubbleLeftCalc = Math.max(16, Math.min(arrowCenterX - bubbleWidthTarget / 2, W - bubbleWidthTarget - 16));
    const bubbleRightCalc = Math.max(16, W - bubbleLeftCalc - bubbleWidthTarget);
    const arrowOffset = Math.max(12, Math.min(
      arrowCenterX - bubbleLeftCalc - 10,
      W - bubbleLeftCalc - bubbleRightCalc - 32,
    ));

    const bubbleInner = (
      <TouchableOpacity
        style={{ position: "absolute", top: bubbleTopPos, left: bubbleLeftCalc, right: bubbleRightCalc }}
        onPress={dismissBubble}
        activeOpacity={0.88}
      >
        <View style={{ position: "relative" }}>
          <View style={[styles.bubbleArrowBorder, { left: arrowOffset }]} />
          <View style={[styles.bubbleArrowFill, { left: arrowOffset + 2 }]} />
          <View style={styles.bubbleCardInner}>
            <Text style={styles.bubbleSpeaker}>{bubble.speaker}</Text>
            <Text style={styles.bubbleText}>{bubble.text}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );

    // All policies: global dismiss via full-screen Pressable
    return (
      <Pressable style={[StyleSheet.absoluteFill, { zIndex: 401 }]} onPress={dismissBubble} key="bubble-global">
        {bubbleInner}
      </Pressable>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Player bubble positioning
  // ─────────────────────────────────────────────────────────────────────────
  function renderPlayerBubble() {
    if (!playerBubble) return null;
    const playerL = portraitLayouts.current.player;
    const topPos = playerL
      ? playerL.y + playerL.h + 8
      : (headerH > 0 ? headerH + 128 : insets.top + 190);
    return (
      <View style={[StyleSheet.absoluteFill, { zIndex: 410 }]} pointerEvents="none" key="player-bubble">
        <View style={{ position: "absolute", top: topPos, left: 10, right: Math.max(10, W - Math.min(W * 0.75, 420) - 10) }}>
          <View style={styles.playerBubbleArrow} />
          <View style={styles.playerBubbleCard}>
            <Text style={styles.playerBubbleText}>{playerBubble}</Text>
          </View>
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Garden inventory helpers
  // ─────────────────────────────────────────────────────────────────────────
  const seeds = inventory.filter(i => i.itemType === "seed" && i.quantity > 0);
  const fertilizers = inventory.filter(i => i.itemType === "fertilizer" && i.quantity > 0);
  const herbbags = inventory.filter(i => i.itemType === "herbbag" && i.quantity > 0);

  async function selectFertilizer(id: string) {
    setSelectedFertilizer(id);
    await AsyncStorage.setItem(GSK.SEL_FERTILIZER, id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // JSX
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <CurrencyHud />
      {/* ── Hidden portrait preload (belt-and-suspenders on top of AssetManager) ── */}
      <View style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
        <Image source={IMG.rupert}      style={{ width: 1, height: 1 }} />
        <Image source={IMG.rupertsad}   style={{ width: 1, height: 1 }} />
        <Image source={IMG.rupertlaugh} style={{ width: 1, height: 1 }} />
        <Image source={IMG.avNormal}    style={{ width: 1, height: 1 }} />
        <Image source={IMG.avLaugh}     style={{ width: 1, height: 1 }} />
        <Image source={IMG.avSad}       style={{ width: 1, height: 1 }} />
        <Image source={IMG.avTired}     style={{ width: 1, height: 1 }} />
        <Image source={IMG.avSick}      style={{ width: 1, height: 1 }} />
        <Image source={IMG.herbbag}     style={{ width: 1, height: 1 }} />
        <Image source={IMG.bucket}      style={{ width: 1, height: 1 }} />
        <Image source={IMG.bucketwater} style={{ width: 1, height: 1 }} />
      </View>

      {/* ── Background (responsive, starts below header) ── */}
      <SceneBackground source={IMG.garden} topOffset={headerH} />
      <View style={[StyleSheet.absoluteFill, { top: headerH }, styles.bgOverlay]} pointerEvents="none" />

      {/* ── Header ── */}
      <View
        style={[styles.header, { paddingTop: insets.top + 6 }]}
        onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
      >
        <View style={styles.headerTopRow}>
          <View style={styles.leftHeader}>
            {/* Stamina bar */}
            <View style={styles.statBarOuter}>
              <Ionicons name="flash" size={15} color="#C4943A" />
              <View style={styles.statBarTrackWrap}>
                <View
                  style={styles.statBarTrack}
                  onLayout={(e) => {
                    const w = e.nativeEvent.layout.width;
                    barWidthSV.value = w;
                    setBarWidth(w);
                  }}
                >
                  <Animated.View style={[styles.statBarFill, styles.staminaFill, staminaFillStyle]}>
                    <View style={styles.staminaReflex} />
                  </Animated.View>
                </View>
                {/* Always starts just below the right end of the Stamina bar. */}
                <Animated.View style={[styles.staFloat, staFloatStyle]} pointerEvents="none">
                  <Text style={styles.staFloatText}>{floatText}</Text>
                </Animated.View>
              </View>
              <Text style={styles.statBarText}>{staminaDisplay}/{playerStats.maximumStamina}</Text>
            </View>
            {/* Life bar */}
            <View style={styles.statBarOuter}>
              <Ionicons name="heart" size={13} color="#CC2200" />
              <View style={styles.statBarTrack}>
                <View style={[styles.statBarFill, styles.lifeFill, { width: (lifeCurrent / playerStats.maximumLife) * (barWidth || 0) }]} />
              </View>
              <Text style={styles.statBarText}>{lifeCurrent}/{playerStats.maximumLife}</Text>
            </View>
          </View>
          <View style={styles.rightHeader}>
            <View style={styles.dayBadge}><Text style={styles.dayText}>{DAYS[dayIdx]}</Text></View>
            <TouchableOpacity
              style={styles.menuRoundBtn}
              onPress={() => setShowMenu(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="menu" size={22} color="#F5E6C8" />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.locationName}>Garden</Text>
      </View>

      {/* ── Scrollable content ── */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={{ paddingBottom: locationBarH + insets.bottom + 16 }}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Portrait row */}
        <View style={styles.portraitRow}>
          <TouchableOpacity
            ref={playerPortraitRef as any}
            style={styles.circleWrap}
            onPress={handleAvatarTap}
            activeOpacity={0.85}
          >
            <Image source={avatarSrc(playerAvatarId, staminaCurrent)} style={[styles.circleImg, styles.playerPortraitImage]} resizeMode="cover" resizeMethod="resize" />
          </TouchableOpacity>
          <View
            ref={rupertPortraitRef}
            style={[styles.circleWrap, rupertAwayFromGarden && styles.rupertAway]}
            pointerEvents="none"
          >
            {!rupertAwayFromGarden && (
              <Image source={rupertSrc(rupertPortrait)} style={[styles.circleImg, styles.npcPortraitImage]} resizeMode="cover" resizeMethod="resize" />
            )}
          </View>
          {/* Bag icon or locked slot */}
          {playerBag.unlocked ? (
            <View ref={bagIconViewRef}>
              <BagIconButton
                unlocked={true}
                onPress={handleOpenBag}
                pulsing={!bagInspected}
              />
            </View>
          ) : (
            <View style={[styles.circleWrap, styles.circleWrapLocked]}>
              <Ionicons name="lock-closed" size={26} color="#555" />
            </View>
          )}
        </View>

        {/* Garden Plot */}
        <Animated.View ref={cropAreaViewRef} style={[{ marginHorizontal: 16, marginTop: 12 }, plotOpacityStyle]}>
          <GardenPlot
            data={plotData}
            interactive={plotInteractive}
            actionCosts={{ water: waterCost, pullWeeds: pullWeedsCost, fertilize: fertilizeCost }}
            onWater={handleWater}
            onPullWeeds={handlePullWeeds}
            onFertilize={handleFertilize}
            onHarvest={handleHarvest}
            onCropTap={handleCropTap}
            onSpendStamina={spendSecondPlotStamina}
            onLockedAction={() => showPlayerBubble('"That won\'t achieve anything."')}
          />
        </Animated.View>

        {secondPlotUnlocked && (
          <View style={styles.secondPlotWrap}>
            <Text style={styles.secondPlotLabel}>2nd Plot</Text>
            <GardenPlot
              data={SECOND_PLOT_EMPTY}
              interactive={false}
              onWater={() => {}}
              onPullWeeds={() => {}}
              onFertilize={() => {}}
              onHarvest={() => {}}
              onCropTap={() => {}}
              onSpendStamina={spendSecondPlotStamina}
              actionCosts={{ water: waterCost, pullWeeds: pullWeedsCost, fertilize: fertilizeCost }}
            />
          </View>
        )}

      </ScrollView>

      {/* ── Activity Bar ── */}
      <View onLayout={(e) => setActivityBarH(e.nativeEvent.layout.height)}>
        <ActivityBar
          visible={showActivityBar}
          enabledActivities={["well", "collectWood", "collectStone", "workout"]}
          endurance={playerStats.endurance}
          onActivity={handleActivity}
          onLockedTap={handleLockedActivity}
        />
      </View>

      {/* ── Location bar ── */}
      <View
        style={[styles.locationBar, { paddingBottom: insets.bottom + 4 }]}
        onLayout={(e) => setLocationBarH(e.nativeEvent.layout.height)}
      >
        {/* Kitchen button */}
        <TouchableOpacity
          style={[styles.locBtn, kitchenBtnEnabled ? styles.locBtnActive : styles.locBtnLocked]}
          disabled={!kitchenBtnEnabled}
          onPress={handleKitchenTap}
          activeOpacity={0.8}
        >
          <Image
            source={IMG.loc_kitchen}
            style={[styles.locBtnImg, !kitchenBtnEnabled && styles.locBtnImgLocked]}
            resizeMode="contain" resizeMethod="resize"
           
          />
        </TouchableOpacity>

        {/* Garden Storage button */}
        <TouchableOpacity
          style={[styles.locBtn, navEnabled ? styles.locBtnActive : styles.locBtnLocked]}
          disabled={!navEnabled}
          onPress={navEnabled ? handleStorageTap : undefined}
          activeOpacity={0.8}
        >
          <Image
            source={IMG.loc_storage}
            style={[styles.locBtnImg, !navEnabled && styles.locBtnImgLocked]}
            resizeMode="contain" resizeMethod="resize"
           
          />
        </TouchableOpacity>

        {/* Guest progression unlocks Dining first, then all core travel. */}
        {([
{ id: "dining",    img: IMG.loc_dining    },
{ id: "dormitory", img: IMG.loc_dormitory },
{ id: "mail",      img: IMG.loc_mail      },
{ id: "explore",   img: IMG.loc_explore   },
        ] as const).map((loc) => {
const guestDormitoryBlocked = rupertInDining && loc.id === "dormitory";
const diningAvailable = diningUnlocked && loc.id === "dining";
const dormitoryAvailable = coreTravelUnlocked && loc.id === "dormitory";
const active = guestDormitoryBlocked || diningAvailable || dormitoryAvailable;
const onPress = guestDormitoryBlocked
  ? () => showPlayerBubble('"I need to cook herb soup for the guest."')
  : diningAvailable
    ? () => {
        audioManager.playSoundEffect("footstep", { maxDurationMs: 4000 });
        router.push("/dining");
      }
    : dormitoryAvailable
      ? () => {
          audioManager.playSoundEffect("walking-on-wood", { maxDurationMs: 5000 });
          router.push("/dormitory");
        }
      : undefined;
return (
  <TouchableOpacity
    key={loc.id}
    style={[styles.locBtn, active ? styles.locBtnActive : styles.locBtnLocked]}
    disabled={!active}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <Image
      source={loc.img}
      style={[styles.locBtnImg, !active && styles.locBtnImgLocked]}
      resizeMode="contain"
      resizeMethod="resize"
    />
  </TouchableOpacity>
);
        })}
      </View>

      {/* ── Loading overlay ── */}
      {gts === "LOADING" && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(10,5,0,0.7)", zIndex: 200 }]} pointerEvents="box-only" />
      )}

      {/* ── Bubble ── */}
      {renderBubble()}

      {/* ── Player thought bubble ── */}
      {renderPlayerBubble()}

      {/* ── Tear-out Modal ── */}
      <Modal visible={showTearOut} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.tearOutPanel}>
            <Text style={styles.tearOutTitle}>Tear it out?</Text>
            <Text style={styles.tearOutDesc}>
              Do you want to tear everything out and replant?
            </Text>
            <View style={styles.tearOutBtns}>
              <TouchableOpacity style={styles.tearOutBtnNo} onPress={handleTearOutNo} activeOpacity={0.8}>
                <Text style={styles.tearOutBtnText}>No</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.tearOutBtnYes} onPress={handleTearOutYes} activeOpacity={0.8}>
                <Text style={styles.tearOutBtnText}>Yes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Garden Storage Modal ── */}
      <Modal visible={showStorage} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.storagePanel, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.storageTitleRow}>
              <Image source={IMG.loc_storage} style={{ width: 28, height: 28 }} resizeMode="contain" resizeMethod="resize" />
              <Text style={styles.panelTitle}>Garden Storage</Text>
            </View>
            <View style={styles.divider} />

            {/* Seeds */}
            {seeds.length > 0 && (
              <>
                <Text style={styles.storeCatLabel}>Seeds</Text>
                {seeds.map(item => (
                  <View key={item.id} style={styles.storeRow}>
                    <Text style={styles.storeItemName}>{item.name}</Text>
                    <Text style={styles.storeItemQty}>×{item.quantity}</Text>
                  </View>
                ))}
              </>
            )}

            {/* Fertilizers */}
            {fertilizers.length > 0 && (
              <>
                <Text style={styles.storeCatLabel}>Fertilizers</Text>
                {fertilizers.map(item => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.storeRow, selectedFertilizer === item.id && styles.storeRowSelected]}
                    onPress={() => selectFertilizer(item.id)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.storeRowLeft}>
                      {selectedFertilizer === item.id && (
                        <Ionicons name="checkmark-circle" size={16} color="#C4943A" style={{ marginRight: 6 }} />
                      )}
                      <Text style={styles.storeItemName}>{item.name}</Text>
                    </View>
                    <Text style={styles.storeItemQty}>×{item.quantity}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {/* Herb bags */}
            {herbbags.length > 0 && (
              <>
                <Text style={styles.storeCatLabel}>Harvest</Text>
                {herbbags.map((item, idx) => (
                  <View key={`${item.id}_${idx}`} style={styles.storeRow}>
                    <Text style={styles.storeItemName}>{item.name}</Text>
                    <Text style={styles.storeItemQty}>×{item.quantity}</Text>
                  </View>
                ))}
              </>
            )}

            {seeds.length === 0 && fertilizers.length === 0 && herbbags.length === 0 && (
              <Text style={styles.storeEmpty}>Storage is empty.</Text>
            )}

            {/* Materials (shared resources – informational, always visible) */}
            <Text style={styles.storeCatLabel}>Materials</Text>
            {CORE_MATERIAL_IDS.map(resId => (
              <View key={resId} style={styles.storeRow}>
                <Text style={styles.storeItemName}>{RESOURCE_NAMES[resId]}</Text>
                <Text style={[styles.storeItemQty, sharedResources[resId] === 0 && styles.storeItemQtyZero]}>
                  ×{sharedResources[resId]}
                </Text>
              </View>
            ))}

            <TouchableOpacity style={styles.closeBtn} onPress={() => setShowStorage(false)} activeOpacity={0.8}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Menu Modal ── */}
      <Modal visible={showMenu} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.menuPanel}>
            <Text style={styles.panelTitle}>Menu</Text>
            <View style={styles.divider} />
            {[
              { icon: "play" as const,         label: "Resume",    action: () => setShowMenu(false) },
              { icon: "book-outline" as const,  label: "Logbook",   action: () => { setShowMenu(false); setShowLogbook(true); } },
              { icon: "save-outline" as const,  label: "Save",      action: handleManualSave },
              { icon: "home-outline" as const,   label: "Main Menu", action: handleMainMenu },
              { icon: "settings-outline" as const, label: "Settings", action: () => { setShowMenu(false); router.push("/settings"); } },
            ].map((item) => (
              <TouchableOpacity key={item.label} style={styles.menuRow} onPress={item.action} activeOpacity={0.7}>
                <Ionicons name={item.icon} size={20} color="#C4943A" />
                <Text style={styles.menuRowText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* ── Player Bag Modal ── */}
      <PlayerBag
        bag={playerBag}
        visible={bagOpen}
        onClose={() => setBagOpen(false)}
        context="garden"
        dayIdx={dayIdx}
        onTransferItem={() => {
          // Garden context: no table, handled via discard dialog inside PlayerBag
        }}
        onDiscardItem={async (slotIdx, item) => {
          // Remove item from bag (called after user confirms discard outside protection)
          const newBag: PlayerBagData = {
            ...playerBag,
            slots: playerBag.slots.map((s, i) => {
              if (i !== slotIdx || !s) return s;
              const remaining = s.quantity - item.quantity;
              return remaining > 0 ? { ...s, quantity: remaining } : null;
            }),
          };
          setPlayerBag(newBag);
          playerBagRef.current = newBag;
          await AsyncStorage.setItem(PLAYER_BAG_KEY, JSON.stringify(newBag)).catch(() => {});
        }}
        onShowThoughtBubble={(text) => {
          // Show player thought bubble for garden discard protection
          if (!playerBubble) {
            if (playerBubbleTimer.current) clearTimeout(playerBubbleTimer.current);
            setPlayerBubble(text);
            playerBubbleTimer.current = setTimeout(() => { setPlayerBubble(null); }, 2800);
          }
        }}
      />

      {/* ── Status Modal ── */}
      <StatusModal
        visible={statusOpen}
        onClose={() => setStatusOpen(false)}
        stats={playerStats}
        currentStamina={staminaCurrent}
        currentLife={lifeCurrent}
        onStatsUpdated={handleStatsUpdated}
      />

      <SeedSelectionModal
        visible={seedModalVisible}
        seeds={seeds.map(seed => ({
          id: seed.id,
          name: seed.name,
          quantity: seed.quantity,
        }))}
        selectedSeedId={selectedSeedId}
        busy={plantBusy}
        onSelect={setSelectedSeedId}
        onClose={() => {
          setSeedModalVisible(false);
          setSelectedSeedId(null);
        }}
        onConfirm={handleConfirmPlant}
      />

      {/* ── Float message ── */}
      {floatMsg && (
        <View
          style={{ position: "absolute", alignSelf: "center", top: "45%", zIndex: 800 }}
          pointerEvents="none"
        >
          <View style={{ backgroundColor: "rgba(20,10,0,0.75)", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 }}>
            <Text style={{ color: "#C4943A", fontFamily: "Oldenburg", fontSize: 14 }}>{floatMsg}</Text>
          </View>
        </View>
      )}

      {/* ── Flying item overlay — always rendered; opacity driven by animation */}
      <Animated.View style={flyAnimStyle} pointerEvents="none">
        {flyImg && <Image source={flyImg} style={{ width: 56, height: 56 }} resizeMode="contain" resizeMethod="resize" />}
      </Animated.View>

      {/* ── Action flash overlays (getwater / getwood / getstone) ─────────── */}
      {actionFlashes.map(flash => (
        <RNAnimated.View
          key={flash.key}
          pointerEvents="none"
          style={{
            position: "absolute",
            left: W / 2 - 90,
            top: Math.max(headerH + 20, (H - locationBarH - activityBarH - insets.bottom + headerH) / 2 - 90),
            width: 180,
            height: 180,
            opacity: flash.opacityAnim,
            transform: [{ translateY: flash.translateYAnim }],
            zIndex: 500,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Image source={flash.image} style={{ width: 120, height: 120 }} resizeMode="contain" resizeMethod="resize" />
          {flash.plusText && (
            <Text style={{
              color: "#44CC44",
              fontFamily: "Oldenburg",
              fontSize: 22,
              fontWeight: "700",
              marginTop: 4,
              textShadowColor: "rgba(0,0,0,0.8)",
              textShadowOffset: { width: 1, height: 1 },
              textShadowRadius: 3,
            }}>
              {flash.plusText}
            </Text>
          )}
        </RNAnimated.View>
      ))}

      {/* ── Workout overlay ───────────────────────────────────────────────── */}
      {workoutState !== "none" && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: W / 2 - 90,
            top: Math.max(headerH + 20, (H - locationBarH - activityBarH - insets.bottom + headerH) / 2 - 90),
            width: 180,
            alignItems: "center",
            zIndex: 500,
          }}
        >
          <Image
            source={workoutState === "phase2" ? IMG.workout2 : IMG.workout1}
            style={{ width: 180, height: 180 }}
            resizeMode="contain" resizeMethod="resize"
          />
          {workoutState === "phase2" && (
            <Text style={{ color: "#44CC44", fontFamily: "Oldenburg", fontSize: 16, fontWeight: "700", marginTop: 6, textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3 }}>
              +5 Growth Points
            </Text>
          )}
        </View>
      )}

      {/* ── Logbook Modal */}
      <Modal visible={showLogbook} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "center", alignItems: "center" }}>
          <View style={{ backgroundColor: "#1A0F00", borderWidth: 1.5, borderColor: "#C4943A", borderRadius: 16, padding: 20, maxHeight: "80%", width: W * 0.88 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <Text style={{ color: "#C4943A", fontFamily: "Oldenburg", fontSize: 17 }}>Logbook</Text>
              <TouchableOpacity onPress={() => setShowLogbook(false)}>
                <Ionicons name="close" size={22} color="#C4943A" />
              </TouchableOpacity>
            </View>
            <View style={{ height: 1, backgroundColor: "rgba(196,148,58,0.22)", marginBottom: 12 }} />
            <ScrollView showsVerticalScrollIndicator={false}>
              {logbook.length === 0 ? (
                <Text style={{ color: "rgba(240,232,213,0.45)", fontFamily: "Oldenburg", fontSize: 13, textAlign: "center", marginTop: 16 }}>
                  No entries yet.
                </Text>
              ) : (
                logbook.map((entry) => (
                  <View key={entry.id} style={{ marginBottom: 14 }}>
                    <Text style={{ color: "rgba(196,148,58,0.7)", fontFamily: "Oldenburg", fontSize: 11, marginBottom: 2 }}>
                      {entry.day} · {entry.location.charAt(0).toUpperCase() + entry.location.slice(1)}
                    </Text>
                    <Text style={{ color: "#C4943A", fontFamily: "Oldenburg", fontSize: 12, marginBottom: 2 }}>
                      {entry.speaker}
                    </Text>
                    <Text style={{ color: "#F0E8D5", fontFamily: "Oldenburg", fontSize: 13, lineHeight: 19, fontStyle: "italic" }}>
                      {entry.text}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0500" },
  bgOverlay: { backgroundColor: "rgba(0,0,0,0.30)", zIndex: 0 },

  // Header
  header: {
    flexDirection: "column",
    paddingHorizontal: 12,
    paddingBottom: 6,
    backgroundColor: "rgba(14, 7, 1, 0.84)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(196, 148, 58, 0.22)",
    zIndex: 2,
  },
  headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  leftHeader: { flex: 1, gap: 5 },
  statBarOuter: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(10,5,0,0.82)", borderRadius: 18,
    borderWidth: 1.5, borderColor: "rgba(130,90,20,0.50)",
    paddingHorizontal: 10, paddingVertical: 5, gap: 7,
    overflow: "visible",
  },
  statBarTrackWrap: { flex: 1, height: 9, position: "relative", overflow: "visible" },
  statBarTrack: {
    flex: 1, height: 9, borderRadius: 5,
    backgroundColor: "#2A1800", overflow: "hidden",
  },
  statBarFill: { height: "100%", borderRadius: 5 },
  staminaFill: { backgroundColor: "#C4943A" },
  staminaReflex: {
    position: "absolute", top: 0, left: 0, right: 0, height: "45%",
    backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 4,
  },
  lifeFill: { backgroundColor: "#CC2200" },
  statBarText: { color: "#F0E8D5", fontSize: 11, fontFamily: "Oldenburg", minWidth: 40, textAlign: "right" },
  staFloat: {
    position: "absolute", right: -8, top: 12,
    backgroundColor: "rgba(200,50,20,0.90)", borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 2, zIndex: 10,
  },
  staFloatText: { color: "#FFF", fontSize: 12, fontFamily: "Oldenburg", fontWeight: "700" },
  locationName: { color: "#F0E8D5", fontSize: 13, fontFamily: "Oldenburg", letterSpacing: 1, textAlign: "center", marginTop: 4 },
  rightHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 10 },
  dayBadge: {
    width: 38, height: 38, borderRadius: 8,
    backgroundColor: "rgba(196,148,58,0.16)",
    borderWidth: 1.5, borderColor: "rgba(196,148,58,0.38)",
    alignItems: "center", justifyContent: "center",
  },
  dayText: { color: "#F5E6C8", fontSize: 13, fontFamily: "Oldenburg", letterSpacing: 0.5 },
  menuRoundBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: "rgba(196,148,58,0.16)",
    borderWidth: 1.5, borderColor: "rgba(196,148,58,0.38)",
    alignItems: "center", justifyContent: "center",
  },

  // Scroll
  scrollArea: { flex: 1, zIndex: 1 },

  // Portraits
  portraitRow: {
    flexDirection: "row", justifyContent: "center", alignItems: "center",
    gap: 22, paddingVertical: 12, backgroundColor: "rgba(14,7,1,0.65)",
  },
  circleWrap: {
    width: 96, height: 96, borderRadius: 48,
    overflow: "hidden", borderWidth: 2.5, borderColor: "#C4943A", backgroundColor: "#2C1810",
  },
  circleWrapLocked: { borderColor: "#3A3A3A", backgroundColor: "#1A1A1A", alignItems: "center", justifyContent: "center" },
  circleImg: { width: "100%", height: "100%" },
  playerPortraitImage: { transform: [{ scale: 1.06 }] },
  npcPortraitImage: { transform: [{ scale: 1.06 }] },
  rupertAway: { opacity: 0, borderColor: "transparent", backgroundColor: "transparent" },

  // Location bar
  locationBar: {
    flexDirection: "row", gap: 5, paddingVertical: 8, paddingHorizontal: 8,
    backgroundColor: "rgba(10,5,1,0.93)",
    borderTopWidth: 1, borderTopColor: "rgba(196,148,58,0.20)", zIndex: 2,
  },
  locBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 6, borderRadius: 10, borderWidth: 1, minHeight: 54 },
  locBtnActive: { backgroundColor: "rgba(196,148,58,0.22)", borderColor: "rgba(196,148,58,0.55)" },
  locBtnLocked: { backgroundColor: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" },
  locBtnImg: { width: 42, height: 42 },
  locBtnImgLocked: { opacity: 0.20 },

  secondPlotWrap: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  secondPlotLabel: {
    color: "#C4943A",
    fontSize: 13,
    fontFamily: "Oldenburg",
    letterSpacing: 0.8,
    marginBottom: 6,
  },

  // Bubbles (Rupert speech)
  bubbleArrowBorder: {
    position: "absolute", top: -11,
    width: 0, height: 0, borderStyle: "solid",
    borderLeftWidth: 11, borderRightWidth: 11, borderBottomWidth: 11, borderTopWidth: 0,
    borderLeftColor: "transparent", borderRightColor: "transparent",
    borderBottomColor: "rgba(196,148,58,0.55)",
  },
  bubbleArrowFill: {
    position: "absolute", top: -7,
    width: 0, height: 0, borderStyle: "solid",
    borderLeftWidth: 9, borderRightWidth: 9, borderBottomWidth: 9, borderTopWidth: 0,
    borderLeftColor: "transparent", borderRightColor: "transparent",
    borderBottomColor: "rgba(250, 242, 218, 0.97)",
  },
  bubbleCardInner: {
    backgroundColor: "rgba(250, 242, 218, 0.97)", borderRadius: 14,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14,
    borderWidth: 1.5, borderColor: "rgba(196,148,58,0.55)",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 8,
    elevation: 12, gap: 6,
  },
  bubbleSpeaker: { color: "#7A4800", fontSize: 13, fontFamily: "Oldenburg", letterSpacing: 1 },
  bubbleText: { color: "#2A1000", fontSize: 15, lineHeight: 22, fontFamily: "RobotoRegular" },

  // Player thought bubble
  playerBubbleCard: {
    backgroundColor: "rgba(240,230,200,0.95)", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1.5, borderColor: "rgba(196,148,58,0.50)",
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 7,
    elevation: 14,
    alignSelf: "flex-start" as const,
  },
  playerBubbleText: { color: "#2A1000", fontSize: 13, fontFamily: "RobotoItalic", lineHeight: 20 },
  playerBubbleArrow: {
    width: 0, height: 0, borderStyle: "solid",
    borderLeftWidth: 8, borderRightWidth: 8,
    borderBottomWidth: 9, borderTopWidth: 0,
    borderLeftColor: "transparent", borderRightColor: "transparent",
    borderBottomColor: "rgba(240,230,200,0.95)",
    alignSelf: "flex-start", marginLeft: 20,
  },

  // Tear-out modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.76)", alignItems: "center", justifyContent: "center" },
  tearOutPanel: {
    width: "82%", backgroundColor: "#160B03", borderRadius: 20, padding: 24,
    borderWidth: 1.5, borderColor: "rgba(196,148,58,0.38)", alignItems: "center", gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 16, elevation: 24,
  },
  tearOutTitle: { color: "#F5E6C8", fontSize: 17, fontFamily: "Oldenburg", letterSpacing: 0.8, textAlign: "center" },
  tearOutDesc: { color: "rgba(240,232,213,0.72)", fontSize: 14, lineHeight: 21, textAlign: "center", fontStyle: "italic" },
  tearOutBtns: { flexDirection: "row", gap: 14, marginTop: 8 },
  tearOutBtnNo: {
    flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12,
    backgroundColor: "rgba(196,148,58,0.12)", borderWidth: 1, borderColor: "rgba(196,148,58,0.30)",
  },
  tearOutBtnYes: {
    flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12,
    backgroundColor: "rgba(200,50,20,0.18)", borderWidth: 1, borderColor: "rgba(200,50,20,0.40)",
  },
  tearOutBtnText: { color: "#F5E6C8", fontSize: 15, fontFamily: "Oldenburg" },

  // Garden Storage modal
  storagePanel: {
    width: "88%", maxHeight: "80%", backgroundColor: "#160B03", borderRadius: 20,
    padding: 20, borderWidth: 1.5, borderColor: "rgba(196,148,58,0.38)",
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 16, elevation: 24,
  },
  storageTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  panelTitle: { color: "#F5E6C8", fontSize: 18, fontFamily: "Oldenburg", letterSpacing: 1, textAlign: "center" },
  divider: { height: 1, backgroundColor: "rgba(196,148,58,0.22)", marginVertical: 10 },
  storeCatLabel: {
    color: "#C4943A", fontSize: 12, fontFamily: "Oldenburg",
    letterSpacing: 1, marginTop: 8, marginBottom: 4, textTransform: "uppercase",
  },
  storeRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.03)", marginBottom: 4,
    borderWidth: 1, borderColor: "rgba(196,148,58,0.12)",
  },
  storeRowSelected: {
    borderColor: "rgba(196,148,58,0.50)",
    backgroundColor: "rgba(196,148,58,0.10)",
  },
  storeRowLeft: { flexDirection: "row", alignItems: "center" },
  storeItemName: { color: "#F0E8D5", fontSize: 13, fontFamily: "Oldenburg" },
  storeItemQty: { color: "#C4943A", fontSize: 13, fontFamily: "Oldenburg" },
  storeItemQtyZero: { color: "rgba(196,148,58,0.35)" },
  storeEmpty: { color: "rgba(240,232,213,0.4)", fontSize: 13, fontStyle: "italic", textAlign: "center", marginVertical: 16 },
  closeBtn: {
    backgroundColor: "rgba(196,148,58,0.16)", borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 36,
    borderWidth: 1, borderColor: "rgba(196,148,58,0.35)", marginTop: 12, alignSelf: "center",
  },
  closeBtnText: { color: "#F5E6C8", fontSize: 14, fontFamily: "Oldenburg", letterSpacing: 0.5 },

  // Menu modal
  menuPanel: {
    width: 264, backgroundColor: "#160B03", borderRadius: 20, padding: 24,
    borderWidth: 1.5, borderColor: "rgba(196,148,58,0.38)", gap: 2,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 16, elevation: 24,
  },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 13, paddingHorizontal: 6, borderRadius: 10 },
  menuRowText: { color: "#F0E8D5", fontSize: 15, fontFamily: "Oldenburg", letterSpacing: 0.4 },
});
