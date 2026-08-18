import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Image,
  Modal,
  StyleSheet,
  ScrollView,
  TextInput,
  Platform,
  Keyboard,
  useWindowDimensions,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  cancelAnimation,
  runOnJS,
} from "react-native-reanimated";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import SceneBackground from "@/src/components/SceneBackground";
import CurrencyHud from "@/src/components/CurrencyHud";
import { useAudioManager } from "@/src/audio/AudioProvider";
import PlayerBag, { BagIconButton } from "@/src/components/PlayerBag";
import StatusModal from "@/src/components/StatusModal";
import {
  PLAYER_BAG_KEY, DEFAULT_BAG, KITCHEN_TABLE_KEY, ITEM_CATALOG,
  canStack, getContainerStackLimit,
  type PlayerBagData, type BagItem,
} from "@/src/game/item-system";
import { planKitchenItemToBag } from "@/src/game/kitchen-bag-transfer";
import { PLAYER_STATS_KEY, DEFAULT_PLAYER_STATS, type PlayerStats } from "@/src/game/player-stats";
import { loadLogbook, type LogEntry, LOGBOOK_KEY } from "@/src/game/logbook";
import { createSnapshot, discardRuntimeAndRestore } from "@/src/game/save-manager";
import { ensureAssetReady } from "@/src/assets/AssetManager";
import {
  DEFAULT_PLAYER_AVATAR_ID,
  PLAYER_AVATAR_KEY,
  getPlayerAvatarForStamina,
  normalizePlayerAvatarId,
  type PlayerAvatarId,
} from "@/src/game/player-avatar";

// ─── Storage keys ─────────────────────────────────────────────────────────────

const SK = {
  TUTORIAL_DONE: "@tutorial:kitchen_done",
  PLAYER_NAME: "@game:player_name",
  STAMINA: "@game:stamina",
  LIFE: "@game:life",
  DAY_INDEX: "@game:day_index",
  GARDEN_ENTERED: "@garden:has_entered",
  HAS_SEEN_POST_GARDEN_DLG: "@kitchen:has_seen_post_garden_dialog",
  DORMITORY_UNLOCKED: "@kitchen:dormitory_unlocked",
  TUESDAY_MORNING_SHOWN: "@kitchen:tuesday_morning_shown",
  FIRST_SLEEP_DONE: "@room:first_sleep_completed",
  CRAFTING_READY: "@garden:crafting_tutorial_ready",
  SOUP_DEMO_SEEN: "@kitchen:soup_demo_seen",
  COOKING_DONE:   "@kitchen:cooking_tutorial_done",
  COOKING_STEP:   "@kitchen:cooking_tutorial_step",
  CRAFT_INGREDIENTS: "@kitchen:craft_ingredients",
  CRAFT_TOOL_SLOT:   "@kitchen:craft_tool_slot",
  SAVE_LOCATION:     "@game:save_location",
} as const;

// ─── Sizes & durations ────────────────────────────────────────────────────────

// SOUP_FLY_SIZE removed — now driven by soupFlySize shared value (measured from slot)
const FLY_MS = 350;
const RETURN_MS = 500;
const STA_MS = 900;
const FLOAT_MS = 2200;
const FLOAT_RISE_PX = 32;
const FLOAT_FADE_IN_MS = 200;
const FLOAT_FADE_OUT_MS = 400;
const BUBBLE_INTRO_MS   = 3500;
const BUBBLE_INSPECT_MS = 4500;
const BUBBLE_REJECT_MS  = 4000;
const CONSUME_MS = 420;

type TState =
  | "LOADING" | "IDLE"
  | "INTRO_DIALOG"
  | "SOUP_FLYING" | "SOUP_AVAILABLE"
  | "SOUP_ON_TABLE" | "TOOLTIP_VISIBLE"
  | "REJECTION_DIALOG" | "SOUP_RETURNING"
  | "CONSUMING" | "STAMINA_ANIMATING"
  | "POST_DIALOG" | "QUESTION_CHOICE"
  | "WHERE_AM_I" | "WHO_ARE_YOU"
  | "NAME_INPUT"
  | "FINAL_DIALOG" | "TUTORIAL_DONE"
  | "KITCHEN_DIALOG_FINISHED"
  | "WAITING_FOR_GARDEN_LOCATION_CLICK"
  | "POST_GARDEN_DIALOG"
  | "TUESDAY_KITCHEN_GARDEN_PROMPT"
  | "CRAFTING_TUTORIAL_READY"
  | "COOKING_UNPACK_WAIT"
  | "OLDPOT_FLYING"
  | "COOKING_CRAFT_READY"
  | "COOKING_CRAFT_DONE"
  | "COOKING_SHARE_EAT"
  | "COOKING_DONE";

type DLine = {
  id?: string;
  speaker: string;
  portrait: "normal" | "sad" | "laugh" | "player";
  text: string;
};

type LRect = { x: number; y: number; w: number; h: number; cx?: number; cy?: number };
type BubblePolicy = "BLOCK_ALL" | "ALLOW_ITEM" | "LOCK_TUTORIAL" | "GARDEN_PROMPT";
interface BubbleConfig {
  text: string;
  speaker: string;
  policy: BubblePolicy;
}

const LOCS = [
  { id: "kitchen",   active: true,  locked: false },
  { id: "garden",    active: false, locked: true  },
  { id: "dining",    active: false, locked: true  },
  { id: "dormitory", active: false, locked: true  },
  { id: "mail",      active: false, locked: true  },
  { id: "explore",   active: false, locked: true  },
];

const DEV_DINING_TEST_ACCESS = true;

const IMG = {
  kitchen:     require("../assets/images/kitchen1.jpg"),
  herbsoup:    require("../assets/images/herbsoup.png"),
  rupert:      require("../assets/images/rupert.png"),
  rupertsad:   require("../assets/images/rupertsad.png"),
  rupertlaugh: require("../assets/images/rupertlaugh.png"),
  avLaugh:     require("../assets/images/avatar1_laugh.png"),
  avNormal:    require("../assets/images/avatar1_normal.png"),
  avSad:       require("../assets/images/avatar1_sad.png"),
  avTired:     require("../assets/images/avatar1_tired.png"),
  avSick:      require("../assets/images/avatar1_sick.png"),
  loc_kitchen:   require("../assets/images/gotokitchen.png"),
  loc_garden:    require("../assets/images/gotogarden.png"),
  loc_dining:    require("../assets/images/gotodining.png"),
  loc_dormitory: require("../assets/images/gotodormitory.png"),
  loc_mail:      require("../assets/images/gotomail.png"),
  loc_explore:   require("../assets/images/goexplore.png"),
  loc_storage:   require("../assets/images/gotostorage.png"),
  oldpot:        require("../assets/images/oldpot.png"),
};

const ITEM_IMAGES: Record<string, ReturnType<typeof require>> = {
  herbbag:     require("../assets/images/herbbag.png"),
  herbsoup:    require("../assets/images/herbsoup.png"),
  bucket:      require("../assets/images/bucket.png"),
  bucketwater: require("../assets/images/bucketwater.png"),
  herbseed:    require("../assets/images/herbseed.png"),
  herbs:       require("../assets/images/herbs.png"),
  oldpot:      require("../assets/images/oldpot.png"),
};

function avatarSrc(avatarId: PlayerAvatarId, st: number) {
  return getPlayerAvatarForStamina(avatarId, st);
}
function rupertSrc(p: "normal" | "sad" | "laugh") {
  return p === "sad" ? IMG.rupertsad : p === "laugh" ? IMG.rupertlaugh : IMG.rupert;
}
function inRect(x: number, y: number, r: LRect): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
function inExpandedRect(x: number, y: number, r: LRect, pad = 14): boolean {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

const D_POST_CONSUMPTION: DLine[] = [
  { id: "d_post.0", speaker: "Old Innkeeper", portrait: "laugh",  text: '"Well, you do look a little healthier now."' },
  { id: "d_post.1", speaker: "Old Innkeeper", portrait: "sad",    text: '"Please forgive me. I wish I could offer you something better."' },
];
const D_WHERE_AM_I: DLine[] = [
  { id: "d_where.0", speaker: "Old Innkeeper", portrait: "normal", text: '"Well... you are in my tavern. The old inn by the crossroads."' },
  { id: "d_where.1", speaker: "Old Innkeeper", portrait: "sad",    text: '"I found you outside, collapsed near the door. You were barely breathing."' },
  { id: "d_where.2", speaker: "Old Innkeeper", portrait: "normal", text: '"I brought you in and gave you what little I had. You have been asleep for hours."' },
  { id: "d_where.3", speaker: "Old Innkeeper", portrait: "laugh",  text: '"Consider this a safe haven for now. You are welcome here."' },
];
const D_WHO_INTRO: DLine[] = [
  { id: "d_who.0", speaker: "Old Innkeeper", portrait: "normal", text: '"Of course. Let me introduce myself. My name is Rupert."' },
];
const D_WHO_ASK: DLine = { id: "d_who.ask", speaker: "Rupert", portrait: "normal", text: '"What is your name?"' };
const dWhoConfirm = (name: string): DLine[] => [
  { id: "d_who.confirm", speaker: "Rupert", portrait: "laugh", text: `"Nice to meet you, ${name}."` },
];
const dFinal = (name: string): DLine[] => [
  { id: "d_final.0",  speaker: name,     portrait: "player",  text: '"You saved me."' },
  { id: "d_final.1",  speaker: "Rupert", portrait: "normal",  text: '"No need to thank me. No one should be left lying in the mud."' },
  { id: "d_final.2",  speaker: name,     portrait: "player",  text: '"I was on the road for days... I can barely remember the way."' },
  { id: "d_final.3",  speaker: "Rupert", portrait: "normal",  text: '"You can rest here until you feel better. You can use the spare room upstairs."' },
  { id: "d_final.4",  speaker: "Rupert", portrait: "sad",     text: '"Though the dust has likely made itself more at home there than any guests."' },
  { id: "d_final.5",  speaker: name,     portrait: "player",  text: '"You would really let me stay?"' },
  { id: "d_final.6",  speaker: "Rupert", portrait: "normal",  text: '"Why not? The tavern is big enough for two."' },
  { id: "d_final.7",  speaker: "Rupert", portrait: "sad",     text: '"I wish I could offer more comfort, but I\'m not as strong as I used to be."' },
  { id: "d_final.8",  speaker: name,     portrait: "player",  text: '"I\'ll help you with whatever needs doing - cleaning, fetching wood, repairs..."' },
  { id: "d_final.9",  speaker: "Rupert", portrait: "normal",  text: '"You want to work? For an old bed and a thin soup?"' },
  { id: "d_final.10", speaker: name,     portrait: "player",  text: '"For a roof over my head. For your kindness."' },
  { id: "d_final.11", speaker: "Rupert", portrait: "laugh",   text: '"All right, all right. If you really want to help... I\'m an old man who\'s happy to have some company."' },
  { id: "d_final.12", speaker: name,     portrait: "player",  text: '"Thank you."' },
];

const DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

const dPostGarden = (name: string): DLine[] => [
  { id: "d_post_garden.0", speaker: "Rupert", portrait: "laugh",  text: '"Thank you for your help."' },
  { id: "d_post_garden.1", speaker: name,     portrait: "player", text: '"You\'re welcome. Let me know if anything else needs to be done."' },
  { id: "d_post_garden.2", speaker: "Rupert", portrait: "normal", text: '"Oh, no. You\'ve had a long journey, and you\'ve only just begun to recover."' },
  { id: "d_post_garden.3", speaker: "Rupert", portrait: "normal", text: '"Let\'s call it a day."' },
];

const D_OLDPOT_DELIVER: DLine[] = [
  { id: "d_oldpot.0", speaker: "Rupert", portrait: "normal", text: '"Good. You have all the ingredients we need."' },
  { id: "d_oldpot.1", speaker: "Rupert", portrait: "laugh",  text: '"Let me grab the old pot from the shelf. It has been waiting long enough."' },
];

const D_CRAFT_SUCCESS: DLine[] = [
  { id: "d_craft.0", speaker: "Rupert", portrait: "laugh", text: '"Well done! The herb soup is ready."' },
];

const HERB_SOUP_RECIPE = {
  ingredients: [
    { id: "herbs",       requiredQty: 2 },
    { id: "bucketwater", requiredQty: 1 },
  ],
  tool: "oldpot",
} as const;

export default function KitchenScreen() {
  const router = useRouter();
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

  const audioManager = useAudioManager();

  useEffect(() => {
    audioManager.crossfadeTo('kitchen', 3000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [showMenu, setShowMenu] = useState(false);
  const [showRecipes, setShowRecipes] = useState(false);
  const [barWidth, setBarWidth] = useState(0);

  const [staminaCurrent, setStaminaCurrent] = useState(20);
  const [staminaDisplay, setStaminaDisplay] = useState(20);
  const [lifeCurrent, setLifeCurrent] = useState(15);
  const [dayIdx, setDayIdx] = useState(0);
  const dayIdxRef = useRef(0);
  useEffect(() => { dayIdxRef.current = dayIdx; }, [dayIdx]);
  const [dormitoryUnlocked, setDormitoryUnlocked] = useState(false);
  const [gardenActive, setGardenActive] = useState(false);
  const playerNameRef = useRef("Adventurer");
  const [rupertPortrait, setRupertPortrait] = useState<"normal" | "sad" | "laugh">("normal");
  const focusCountRef = useRef(0);
  const [playerBag, setPlayerBag] = useState<PlayerBagData>(DEFAULT_BAG);
  const playerBagRef = useRef<PlayerBagData>(DEFAULT_BAG);
  const [playerStats, setPlayerStats] = useState<PlayerStats>(DEFAULT_PLAYER_STATS);
  const [bagOpen, setBagOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  const [tableItems, setTableItems] = useState<(BagItem | null)[]>(Array(12).fill(null));
  const tableItemsRef = useRef<(BagItem | null)[]>(Array(12).fill(null));
  const craftIngSlotsRef = useRef<(BagItem | null)[]>([null, null, null]);
  const craftToolRef     = useRef<BagItem | null>(null);
  const [kitchenDetailItem, setKitchenDetailItem] = useState<BagItem | null>(null);
  const lastUnpackedSlot = useRef<number | null>(null);
  const unpackScale = useSharedValue(0);

  const [craftIngSlots, setCraftIngSlots] = useState<(BagItem | null)[]>([null, null, null]);
  const [craftTool, setCraftTool] = useState<BagItem | null>(null);
  const [craftResult, setCraftResult] = useState<BagItem | null>(null);
  const craftingLocked = useRef(false);
  const [selectedHerbbagSlot, setSelectedHerbbagSlot] = useState<number | null>(null);
  const [selectedHerbsSlot, setSelectedHerbsSlot] = useState<number | null>(null);
  const [selectedSoupSlot, setSelectedSoupSlot] = useState<number | null>(null);
  const [bagPulseActive, setBagPulseActive] = useState(false);
  const bagOpenedOnceDuringCooking = useRef(false);
  const cookingShareDoneRef = useRef(false);
  const cookingEatDoneRef = useRef(false);
  const [flyingItemId, setFlyingItemId] = useState<string>("herbsoup");
  const cookingFlyTargetSlot = useRef<number>(-1);
  const cookingPendingTable  = useRef<(BagItem | null)[]>([]);
  const cookingDraggedSlotRef = useRef<number>(-1);
  const [cookingDragActiveSlot, setCookingDragActiveSlot] = useState<number>(-1);
  const cookingDragItemIdRef = useRef<string>("");

  const [ts, setTs] = useState<TState>("LOADING");
  const tsRef = useRef<TState>("LOADING");

  const [soupSlot, setSoupSlot] = useState<number | null>(null);
  const soupSlotRef = useRef<number | null>(null);
  const [soupDragging, setSoupDragging] = useState(false);
  const consumedOnce = useRef(false);
  const inputLocked = useRef(false);

  const [dlgActive, setDlgActive] = useState(false);
  const [dlgLines, setDlgLines] = useState<DLine[]>([]);
  const [dlgIdx, setDlgIdx] = useState(0);
  const dlgDoneRef = useRef<(() => void) | null>(null);
  const lastAdvanceTimeRef = useRef(0);

  const [bubble, setBubble] = useState<BubbleConfig | null>(null);
  const bubbleDoneRef = useRef<(() => void) | null>(null);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [logbook, setLogbook] = useState<LogEntry[]>([]);
  const [showLogbook, setShowLogbook] = useState(false);

  const [soupDemoActive, setSoupDemoActive] = useState(false);
  const soupDemoSeenRef = useRef(false);
  const demoX     = useSharedValue(0);
  const demoY     = useSharedValue(0);
  const demoVis   = useSharedValue(0);
  const demoScale = useSharedValue(1);
  const demoStyle = useAnimatedStyle(() => ({
    position: "absolute" as const,
    left: demoX.value - 28,
    top:  demoY.value - 28,
    width: 56, height: 56,
    opacity: demoVis.value,
    transform: [{ scale: demoScale.value }],
    zIndex: 402,
  }));

  const [playerBubble, setPlayerBubble] = useState<string | null>(null);
  const playerBubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showPlayerBubble(text: string) {
    if (playerBubbleTimer.current) clearTimeout(playerBubbleTimer.current);
    setPlayerBubble(text);
    playerBubbleTimer.current = setTimeout(() => setPlayerBubble(null), 2500);
  }

  async function handleBagToTable(bagSlotIdx: number, item: BagItem) {
    setBagOpen(false);
    const TABLE_STACK_LIMIT = 20;
    const currentTable = tableItems.slice();
    let transfer = item.quantity;

    for (let i = 0; i < 12; i++) {
      if (soupSlotRef.current === i) continue;
      const t = currentTable[i];
      if (
        t && t.id === item.id &&
        t.containedItem === item.containedItem &&
        t.containedQuantity === item.containedQuantity &&
        t.quantity < TABLE_STACK_LIMIT
      ) {
        const add = Math.min(transfer, TABLE_STACK_LIMIT - t.quantity);
        currentTable[i] = { ...t, quantity: t.quantity + add };
        transfer -= add;
        if (transfer <= 0) break;
      }
    }

    let firstNewSlot: number | null = null;
    if (transfer > 0) {
      for (let i = 0; i < 12; i++) {
        if (soupSlotRef.current === i) continue;
        if (!currentTable[i]) {
          const add = Math.min(transfer, TABLE_STACK_LIMIT);
          currentTable[i] = { ...item, quantity: add };
          if (firstNewSlot === null) firstNewSlot = i;
          transfer -= add;
          if (transfer <= 0) break;
        }
      }
    }

    const transferred = item.quantity - transfer;
    if (transferred <= 0) {
      showPlayerBubble('"No free space available."');
      return;
    }

    const newBag: PlayerBagData = {
      ...playerBag,
      slots: playerBag.slots.map((s, idx) => {
        if (idx !== bagSlotIdx || !s) return s;
        const remaining = s.quantity - transferred;
        return remaining > 0 ? { ...s, quantity: remaining } : null;
      }),
    };

    setTableItems(currentTable);
    setPlayerBag(newBag);
    audioManager.playSoundEffect('moveitem', { maxDurationMs: 3000 });
    await AsyncStorage.setItem(KITCHEN_TABLE_KEY, JSON.stringify(currentTable)).catch(() => {});
    await AsyncStorage.setItem(PLAYER_BAG_KEY, JSON.stringify(newBag)).catch(() => {});

    if (firstNewSlot !== null) {
      lastUnpackedSlot.current = firstNewSlot;
      unpackScale.value = 0;
      unpackScale.value = withSpring(1, { damping: 14, stiffness: 280 });
    }
    checkCookingProgress(currentTable);
  }

  async function handleManualSave() {
    setShowMenu(false);
    if (tsRef.current !== "IDLE") {
      showPlayerBubble('"I should finish this first."');
      return;
    }
    try {
      const rawSlot  = await AsyncStorage.getItem("@game:active_slot");
      const rawSlots = await AsyncStorage.getItem("game_slots");
      if (!rawSlot || !rawSlots) { showPlayerBubble('"Nothing to save yet."'); return; }
      const slotNum = parseInt(rawSlot, 10);
      const slots   = JSON.parse(rawSlots);
      const updated = slots.map((s: { slot: number }) =>
        s.slot === slotNum
          ? { ...s, dayIdx, stamina: staminaCurrent, life: lifeCurrent, lastSaved: new Date().toISOString() }
          : s,
      );
      await AsyncStorage.setItem("game_slots", JSON.stringify(updated));
      await AsyncStorage.setItem(SK.SAVE_LOCATION, "kitchen");
      await createSnapshot(slotNum, "manual");
      showPlayerBubble('"Game saved."');
    } catch {
      showPlayerBubble('"Save failed."');
    }
  }

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

  const [headerH, setHeaderH] = useState(0);

  const [askedWhere, setAskedWhere] = useState(false);
  const [askedWho, setAskedWho] = useState(false);
  const askedWhereRef = useRef(false);
  const askedWhoRef = useRef(false);
  const [rupertNamed, setRupertNamed] = useState(false);

  const [nameInputOpen, setNameInputOpen] = useState(false);
  const [nameInputVal, setNameInputVal] = useState("");
  const [keyboardH, setKeyboardH] = useState(0);

  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipItemName, setTooltipItemName] = useState("Herb Soup");
  const [tooltipItemDesc, setTooltipItemDesc] = useState("Restores 20 Stamina.");
  const cookingTooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [locationBarH, setLocationBarH] = useState(60);
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const hoveredSlotRef = useRef<number | null>(null);
  const [bagDropHovered, setBagDropHovered] = useState(false);
  const bagDropHoveredRef = useRef(false);

  const staminaCountTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasNavigatedToGardenRef = useRef(false);

  const barWidthSV   = useSharedValue(0);
  const staminaSV    = useSharedValue(20);
  const staminaMaxSV = useSharedValue(DEFAULT_PLAYER_STATS.maximumStamina);
  const plusY        = useSharedValue(0);
  const plusOp       = useSharedValue(0);
  const soupX        = useSharedValue(0);
  const soupY        = useSharedValue(0);
  const soupVis      = useSharedValue(0);
  const soupScale    = useSharedValue(1);
  const dragOffsetX  = useSharedValue(0);
  const dragOffsetY  = useSharedValue(0);
  const soupFlySize  = useSharedValue(44);
  const gardenPulse  = useSharedValue(1);

  const playerPortraitRef  = useRef<View>(null);
  const rupertPortraitRef  = useRef<View>(null);
  const bagIconRef         = useRef<View>(null);
  const tableSlotRefs      = useRef<(View | null)[]>(Array(12).fill(null));
  const craftSlotRefs = useRef<(View | null)[]>(Array(4).fill(null));
  const layouts = useRef<{
    player: LRect | null; rupert: LRect | null; bag: LRect | null;
    tableSlots: (LRect | null)[]; craftSlots: (LRect | null)[];
  }>({ player: null, rupert: null, bag: null, tableSlots: Array(12).fill(null), craftSlots: Array(4).fill(null) });

  const staminaFillStyle = useAnimatedStyle(() => ({
    width: (staminaSV.value / staminaMaxSV.value) * barWidthSV.value,
  }));
  const plusFloatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: plusY.value }],
    opacity: plusOp.value,
  }));
  const flyStyle = useAnimatedStyle(() => ({
    position: "absolute" as const,
    left: soupX.value - soupFlySize.value / 2,
    top:  soupY.value - soupFlySize.value / 2,
    width: soupFlySize.value,
    height: soupFlySize.value,
    opacity: soupVis.value,
    transform: [{ scale: soupScale.value }],
    zIndex: 300,
  }));
  const gardenPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: gardenPulse.value }],
  }));

  useEffect(() => { tsRef.current = ts; }, [ts]);
  useEffect(() => { staminaMaxSV.value = playerStats.maximumStamina; }, [playerStats.maximumStamina]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { playerBagRef.current = playerBag; }, [playerBag]);
  useEffect(() => { tableItemsRef.current = tableItems; }, [tableItems]);
  useEffect(() => { craftIngSlotsRef.current = craftIngSlots; }, [craftIngSlots]);
  useEffect(() => { craftToolRef.current = craftTool; }, [craftTool]);

  useEffect(() => {
    if (ts === "WAITING_FOR_GARDEN_LOCATION_CLICK" || ts === "TUESDAY_KITCHEN_GARDEN_PROMPT") {
      gardenPulse.value = withRepeat(withTiming(1.06, { duration: 700 }), -1, true);
    } else {
      cancelAnimation(gardenPulse);
      gardenPulse.value = withTiming(1, { duration: 200 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ts]);

  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvt, (e) => setKeyboardH(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardH(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const lb = await loadLogbook();
        setLogbook(lb);
        const demoSeen = await AsyncStorage.getItem(SK.SOUP_DEMO_SEEN);
        if (demoSeen === "true") soupDemoSeenRef.current = true;
        const done = await AsyncStorage.getItem(SK.TUTORIAL_DONE);
        const name = await AsyncStorage.getItem(SK.PLAYER_NAME);
        const storedName = name?.trim() || "Adventurer";
        playerNameRef.current = storedName;
        const rawLife = await AsyncStorage.getItem(SK.LIFE);
        const lf = rawLife ? Math.min(Math.max(parseInt(rawLife, 10), 0), 30) : 15;
        setLifeCurrent(lf);
        if (!rawLife) AsyncStorage.setItem(SK.LIFE, "15").catch(() => {});
        const rawDay = await AsyncStorage.getItem(SK.DAY_INDEX);
        if (rawDay !== null) setDayIdx(parseInt(rawDay, 10));
        const rawBag = await AsyncStorage.getItem(PLAYER_BAG_KEY);
        if (rawBag) { try { setPlayerBag(JSON.parse(rawBag)); } catch { /* default */ } }
        const rawStats = await AsyncStorage.getItem(PLAYER_STATS_KEY);
        let loadedMaxStamina = DEFAULT_PLAYER_STATS.maximumStamina;
        if (rawStats) {
          try {
            const parsedStats = JSON.parse(rawStats);
            setPlayerStats(parsedStats);
            loadedMaxStamina = parsedStats.maximumStamina ?? DEFAULT_PLAYER_STATS.maximumStamina;
            staminaMaxSV.value = loadedMaxStamina;
          } catch { /* default */ }
        }
        const rawTable = await AsyncStorage.getItem(KITCHEN_TABLE_KEY);
        if (rawTable) { try { setTableItems(JSON.parse(rawTable)); } catch { /* default */ } }
        const rawCraftIng = await AsyncStorage.getItem(SK.CRAFT_INGREDIENTS);
        if (rawCraftIng) { try { setCraftIngSlots(JSON.parse(rawCraftIng)); } catch {} }
        const rawCraftTool = await AsyncStorage.getItem(SK.CRAFT_TOOL_SLOT);
        if (rawCraftTool) { try { setCraftTool(JSON.parse(rawCraftTool)); } catch {} }

        if (done === "true") {
          const rawSta = await AsyncStorage.getItem(SK.STAMINA);
          const sta = rawSta ? Math.min(Math.max(parseInt(rawSta, 10), 0), loadedMaxStamina) : 40;
          setStaminaCurrent(sta);
          setStaminaDisplay(sta);
          staminaSV.value = sta;

          const enteredGarden = await AsyncStorage.getItem(SK.GARDEN_ENTERED);
          if (enteredGarden === "true") {
            setGardenActive(true);
            const dormUnlocked = await AsyncStorage.getItem(SK.DORMITORY_UNLOCKED);
            if (dormUnlocked === "true") setDormitoryUnlocked(true);
            const seenPostGarden = await AsyncStorage.getItem(SK.HAS_SEEN_POST_GARDEN_DLG);
            if (seenPostGarden !== "true") {
              setTutState("POST_GARDEN_DIALOG");
              setTimeout(() => {
                showDialog(dPostGarden(playerNameRef.current), onPostGardenDialogDone);
              }, 400);
            } else {
              const initCraftingReady = await AsyncStorage.getItem(SK.CRAFTING_READY);
              const initCookingDone   = await AsyncStorage.getItem(SK.COOKING_DONE);
              let initReadyToCook = initCraftingReady === "true" && initCookingDone !== "true";
              if (!initReadyToCook && initCookingDone !== "true") {
                const rawHarv2 = await AsyncStorage.getItem("@garden:has_harvested_tutorial_herbs");
                const rawWat2  = await AsyncStorage.getItem("@garden:has_fetched_tutorial_water");
                if (rawHarv2 === "true" && rawWat2 === "true" && rawBag) {
                  try {
                    const freshBag2: PlayerBagData = JSON.parse(rawBag);
                    const hHB = freshBag2.slots.some(s => s?.id === "herbbag");
                    const hBW = freshBag2.slots.some(s => s?.id === "bucketwater");
                    if (hHB && hBW) {
                      await AsyncStorage.setItem(SK.CRAFTING_READY, "true");
                      initReadyToCook = true;
                    }
                  } catch { /* ignore */ }
                }
              }
              if (initReadyToCook) {
                setTutState("CRAFTING_TUTORIAL_READY");
                setTimeout(() => {
                  showBubble(
                    '"Good work. Now let\'s begin preparing the ingredients."',
                    "Rupert", "BLOCK_ALL", null,
                    async () => {
                      const cookingDoneInit = await AsyncStorage.getItem(SK.COOKING_DONE);
                      if (cookingDoneInit !== "true") {
                        const rawIng2 = await AsyncStorage.getItem(SK.CRAFT_INGREDIENTS);
                        if (rawIng2) { try { setCraftIngSlots(JSON.parse(rawIng2)); } catch {} }
                        const rawTool2 = await AsyncStorage.getItem(SK.CRAFT_TOOL_SLOT);
                        if (rawTool2) { try { setCraftTool(JSON.parse(rawTool2)); } catch {} }
                        const rawStep2 = await AsyncStorage.getItem(SK.COOKING_STEP);
                        const step2 = rawStep2 ? parseInt(rawStep2, 10) : 0;
                        if (step2 >= 3) {
                          setTutState("COOKING_SHARE_EAT");
                          const rawTbl2 = await AsyncStorage.getItem(KITCHEN_TABLE_KEY);
                          const tbl2: (BagItem | null)[] = rawTbl2 ? JSON.parse(rawTbl2) : Array(12).fill(null);
                          const soupIdx2 = tbl2.findIndex(it => it?.id === "herbsoup");
                          if (soupIdx2 >= 0) { setSoupSlot(soupIdx2); soupSlotRef.current = soupIdx2; }
                        } else if (step2 >= 2) {
                          setTutState("COOKING_CRAFT_READY");
                          setTimeout(() => showBubble(
                            '"The recipe is very simple: you just have to boil two herbs with a bucket of water in a cooking pot."',
                            "Rupert", "ALLOW_ITEM", null, () => {}, "bubble.cooking.craft_remind",
                          ), 400);
                        } else {
                          startCookingTutorial();
                        }
                      } else {
                        setTs("IDLE");
                        tsRef.current = "IDLE";
                      }
                    },
                    "bubble.crafting.good_work",
                  );
                }, 800);
              } else {
                setTutState("IDLE");
                await maybeStartTuesdayMorningTutorial(800);
              }
            }
          } else {
            setTutState("WAITING_FOR_GARDEN_LOCATION_CLICK");
            setTimeout(() => {
              showBubble(
                '"Actually, I\'m out of herbs. Follow me to the garden. I\'ll show you the beds."',
                "Rupert",
                "GARDEN_PROMPT",
                null,
                () => {},
                "bubble.garden.follow_me",
              );
            }, 800);
          }
        } else {
          setTimeout(() => {
            if (tsRef.current === "LOADING") {
              startTutorial();
            }
          }, 600);
        }
      } catch {
        setTs("IDLE");
        tsRef.current = "IDLE";
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function maybeStartTuesdayMorningTutorial(delayMs = 600): Promise<boolean> {
    if (tsRef.current !== "IDLE") return false;

    const [tuesdayShown, rawDay2, firstSleepDone] = await Promise.all([
      AsyncStorage.getItem(SK.TUESDAY_MORNING_SHOWN),
      AsyncStorage.getItem(SK.DAY_INDEX),
      AsyncStorage.getItem(SK.FIRST_SLEEP_DONE),
    ]);
    const currentDay = rawDay2 ? parseInt(rawDay2, 10) : 0;
    if (firstSleepDone !== "true" || currentDay < 1 || tuesdayShown === "true") return false;

    await AsyncStorage.setItem(SK.TUESDAY_MORNING_SHOWN, "true");
    setGardenActive(true);
    setTutState("TUESDAY_KITCHEN_GARDEN_PROMPT");
    setTimeout(() => {
      showBubble(
        '"Good morning. Let\'s go to the garden. We also need some water."',
        "Rupert",
        "GARDEN_PROMPT",
        null,
        () => {},
        "bubble.tuesday.good_morning",
      );
    }, delayMs);
    return true;
  }

  useFocusEffect(
    React.useCallback(() => {
      focusCountRef.current += 1;
      hasNavigatedToGardenRef.current = false;
      if (focusCountRef.current <= 1) return;

      (async () => {
        try {
          const cur = tsRef.current;
          if (cur !== "IDLE") return;
          const rawSta = await AsyncStorage.getItem(SK.STAMINA);
          if (rawSta) {
            const sta = Math.min(Math.max(parseInt(rawSta, 10), 0), staminaMaxSV.value);
            setStaminaCurrent(sta);
            setStaminaDisplay(sta);
            staminaSV.value = sta;
          }
          const rawLife = await AsyncStorage.getItem(SK.LIFE);
          if (rawLife) setLifeCurrent(Math.min(Math.max(parseInt(rawLife, 10), 0), 30));
          const rawDay = await AsyncStorage.getItem(SK.DAY_INDEX);
          if (rawDay !== null) setDayIdx(parseInt(rawDay, 10));
          const rawBag = await AsyncStorage.getItem(PLAYER_BAG_KEY);
          if (rawBag) { try { setPlayerBag(JSON.parse(rawBag)); } catch { /* default */ } }
          const rawStats = await AsyncStorage.getItem(PLAYER_STATS_KEY);
          if (rawStats) {
            try {
              const parsedStats = JSON.parse(rawStats);
              setPlayerStats(parsedStats);
              staminaMaxSV.value = parsedStats.maximumStamina ?? DEFAULT_PLAYER_STATS.maximumStamina;
            } catch { /* default */ }
          }
          const dormUnlocked = await AsyncStorage.getItem(SK.DORMITORY_UNLOCKED);
          if (dormUnlocked === "true") setDormitoryUnlocked(true);
          if (await maybeStartTuesdayMorningTutorial(600)) return;
          const seenPostGarden = await AsyncStorage.getItem(SK.HAS_SEEN_POST_GARDEN_DLG);
          if (seenPostGarden !== "true") {
            const enteredGarden = await AsyncStorage.getItem(SK.GARDEN_ENTERED);
            if (enteredGarden === "true") {
              setGardenActive(true);
              setTutState("POST_GARDEN_DIALOG");
              setTimeout(() => {
                showDialog(dPostGarden(playerNameRef.current), onPostGardenDialogDone);
              }, 300);
            }
          } else {
            const enteredGarden = await AsyncStorage.getItem(SK.GARDEN_ENTERED);
            if (enteredGarden === "true") setGardenActive(true);
            let craftingReady = await AsyncStorage.getItem(SK.CRAFTING_READY);
            if (craftingReady !== "true") {
              const cookingAlreadyDone = await AsyncStorage.getItem(SK.COOKING_DONE);
              if (cookingAlreadyDone !== "true") {
                const rawHarv = await AsyncStorage.getItem("@garden:has_harvested_tutorial_herbs");
                const rawWat  = await AsyncStorage.getItem("@garden:has_fetched_tutorial_water");
                if (rawHarv === "true" && rawWat === "true") {
                  const freshRawBag = await AsyncStorage.getItem(PLAYER_BAG_KEY);
                  if (freshRawBag) {
                    try {
                      const freshBag: PlayerBagData = JSON.parse(freshRawBag);
                      const hasHB = freshBag.slots.some(s => s?.id === "herbbag");
                      const hasBW = freshBag.slots.some(s => s?.id === "bucketwater");
                      if (hasHB && hasBW) {
                        await AsyncStorage.setItem(SK.CRAFTING_READY, "true");
                        craftingReady = "true";
                      }
                    } catch { /* ignore */ }
                  }
                }
              }
            }
            if (craftingReady === "true" && tsRef.current !== "CRAFTING_TUTORIAL_READY") {
              setTutState("CRAFTING_TUTORIAL_READY");
              setTimeout(() => {
                showBubble(
                  '"Good work. Now let\'s begin preparing the ingredients."',
                  "Rupert",
                  "BLOCK_ALL",
                  null,
                  async () => {
                    const cookingDone = await AsyncStorage.getItem(SK.COOKING_DONE);
                    if (cookingDone !== "true") {
                      const rawIng = await AsyncStorage.getItem(SK.CRAFT_INGREDIENTS);
                      if (rawIng) { try { setCraftIngSlots(JSON.parse(rawIng)); } catch {} }
                      const rawTool = await AsyncStorage.getItem(SK.CRAFT_TOOL_SLOT);
                      if (rawTool) { try { setCraftTool(JSON.parse(rawTool)); } catch {} }
                      const rawStep = await AsyncStorage.getItem(SK.COOKING_STEP);
                      const step = rawStep ? parseInt(rawStep, 10) : 0;
                      if (step >= 3) {
                        setTutState("COOKING_SHARE_EAT");
                        const rawTbl = await AsyncStorage.getItem(KITCHEN_TABLE_KEY);
                        const tbl: (BagItem | null)[] = rawTbl ? JSON.parse(rawTbl) : Array(12).fill(null);
                        const soupIdx = tbl.findIndex(it => it?.id === "herbsoup");
                        if (soupIdx >= 0) { setSoupSlot(soupIdx); soupSlotRef.current = soupIdx; }
                      } else if (step >= 2) {
                        setTutState("COOKING_CRAFT_READY");
                        setTimeout(() => showBubble(
                          '"The recipe is very simple: you just have to boil two herbs with a bucket of water in a cooking pot."',
                          "Rupert", "ALLOW_ITEM", null, () => {}, "bubble.cooking.craft_remind",
                        ), 400);
                      } else {
                        startCookingTutorial();
                      }
                    } else {
                      setTutState("IDLE");
                    }
                  },
                  "bubble.crafting.good_work",
                );
              }, 500);
            }
          }
        } catch { /* ignore */ }
      })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  useEffect(() => {
    const t = setTimeout(measureAll, 500);
    return () => {
      clearTimeout(t);
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(measureAll, 0);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H, insets.top, insets.bottom]);

  function measureAll() {
    playerPortraitRef.current?.measureInWindow((x, y, w, h) => {
      layouts.current.player = { x, y, w, h };
    });
    rupertPortraitRef.current?.measureInWindow((x, y, w, h) => {
      layouts.current.rupert = { x, y, w, h };
    });
    bagIconRef.current?.measureInWindow((x, y, w, h) => {
      layouts.current.bag = { x, y, w, h };
    });
    tableSlotRefs.current.forEach((r, i) => {
      r?.measureInWindow((x, y, w, h) => {
        layouts.current.tableSlots[i] = { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
        if (i === 0 && w > 0) soupFlySize.value = w * 0.80;
      });
    });
    craftSlotRefs.current.forEach((r, i) => {
      r?.measureInWindow((x, y, w, h) => {
        layouts.current.craftSlots[i] = { x, y, w, h };
      });
    });
  }

  function setTutState(s: TState) {
    tsRef.current = s;
    setTs(s);
  }

  function startTutorial() {
    setTutState("INTRO_DIALOG");
    showBubble(
      '"Here, I made you some soup to warm you up."',
      "Old Innkeeper",
      "BLOCK_ALL",
      BUBBLE_INTRO_MS,
      onIntroDone,
      "bubble.intro.here_soup",
    );
  }

  function showDialog(lines: DLine[], onDone: () => void) {
    dlgDoneRef.current = onDone;
    setDlgLines(lines);
    setDlgIdx(0);
    const firstPortrait = lines[0]?.portrait;
    if (firstPortrait && firstPortrait !== "player") {
      setRupertPortrait(firstPortrait);
    }
    const first = lines[0];
    if (first?.id && first.speaker !== "player") {
      logDialogLine(first.id, first.speaker, first.text);
    }
    setDlgActive(true);
  }

  function finalizeDialog() {
    setDlgActive(false);
    const cb = dlgDoneRef.current;
    dlgDoneRef.current = null;
    cb?.();
  }

  function advanceDialog() {
    if (inputLocked.current) return;
    const now = Date.now();
    if (now - lastAdvanceTimeRef.current < 300) return;
    lastAdvanceTimeRef.current = now;
    const nextIdx = dlgIdx + 1;
    if (nextIdx < dlgLines.length) {
      setDlgIdx(nextIdx);
      const next = dlgLines[nextIdx];
      if (next.id && next.speaker !== "player") {
        logDialogLine(next.id, next.speaker, next.text);
      }
      if (next.portrait !== "player" && next.portrait !== rupertPortrait) {
        setRupertPortrait(next.portrait);
      }
    } else {
      finalizeDialog();
    }
  }

  function showBubble(
    text: string,
    speaker: string,
    policy: BubblePolicy,
    autoMs: number | null,
    onClose: () => void,
    logId?: string,
  ) {
    if (bubbleTimer.current) {
      clearTimeout(bubbleTimer.current);
      bubbleTimer.current = null;
    }
    bubbleDoneRef.current = onClose;
    setBubble({ text, speaker, policy });
    if (logId) {
      logDialogLine(logId, speaker, text);
    }
    if (autoMs) {
      bubbleTimer.current = setTimeout(() => {
        bubbleTimer.current = null;
        dismissBubble();
      }, autoMs);
    }
  }

  function logDialogLine(id: string, speaker: string, text: string) {
    const dayNames = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
    const day = dayNames[dayIdxRef.current] ?? "MO";
    setLogbook(prev => {
      if (prev.some(e => e.id === id)) return prev;
      const entry: LogEntry = { id, speaker, text, day, location: "kitchen", seq: prev.length };
      const updated = [...prev, entry];
      AsyncStorage.setItem(LOGBOOK_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }

  function dismissBubble() {
    if (bubbleTimer.current) {
      clearTimeout(bubbleTimer.current);
      bubbleTimer.current = null;
    }
    setBubble(null);
    const cb = bubbleDoneRef.current;
    bubbleDoneRef.current = null;
    if (cb) cb();
  }

  function dismissBubbleNoCallback() {
    if (bubbleTimer.current) {
      clearTimeout(bubbleTimer.current);
      bubbleTimer.current = null;
    }
    bubbleDoneRef.current = null;
    setBubble(null);
  }

  function onIntroDone() {
    measureAll();
    setTimeout(async () => {
      await ensureAssetReady('herbsoup');
      setTutState("SOUP_FLYING");
      flySoupToTable();
    }, 200);
  }

  function flySoupToTable() {
    const rL = layouts.current.rupert;
    const s0 = layouts.current.tableSlots[0];
    if (!rL || !s0) {
      setSoupSlot(0); soupSlotRef.current = 0;
      setTutState("SOUP_AVAILABLE");
      showBubble(
        '"Take your time. You can inspect the soup first, if you like."',
        "Old Innkeeper",
        "ALLOW_ITEM",
        BUBBLE_INSPECT_MS,
        () => setTutState("SOUP_ON_TABLE"),
      );
      return;
    }
    const fromX = rL.x + rL.w / 2;
    const fromY = rL.y + rL.h / 2;
    const toX   = s0.x + s0.w / 2;
    const toY   = s0.y + s0.h / 2;

    soupX.value = fromX;
    soupY.value = fromY;
    soupScale.value = 1;
    soupVis.value = withTiming(1, { duration: 180 });
    soupX.value = withTiming(toX, { duration: FLY_MS });
    soupY.value = withTiming(toY, { duration: FLY_MS }, (done) => {
      if (done) runOnJS(onSoupLanded)();
    });
  }

  function onSoupLanded() {
    soupVis.value = withTiming(0, { duration: 150 }, () => {
      runOnJS(afterSoupLanded)();
    });
  }

  function afterSoupLanded() {
    setSoupSlot(0); soupSlotRef.current = 0;
    setTutState("SOUP_AVAILABLE");
    showBubble(
      '"Take your time. You can inspect the soup first, if you like."',
      "Old Innkeeper",
      "ALLOW_ITEM",
      BUBBLE_INSPECT_MS,
      () => {
        showBubble(
          '"Pull it closer to you to eat."',
          "Rupert",
          "ALLOW_ITEM",
          null,
          () => setTutState("SOUP_ON_TABLE"),
          "bubble.soup.drag_hint",
        );
        startSoupDemoAnim();
      },
      "bubble.soup.take_your_time",
    );
  }

  function startSoupDemoAnim() {
    if (soupDemoSeenRef.current) return;

    const slot0 = layouts.current.tableSlots[0];
    const player = layouts.current.player;
    if (!slot0 || !player) return;

    soupDemoSeenRef.current = true;
    AsyncStorage.setItem(SK.SOUP_DEMO_SEEN, "true").catch(() => {});

    const sx = slot0.cx ?? slot0.x + (slot0.w ?? 56) / 2;
    const sy = slot0.cy ?? slot0.y + (slot0.h ?? 56) / 2;
    const ex = player.x + player.w / 2;
    const ey = player.y + player.h / 2;

    setSoupDemoActive(true);
    demoX.value = sx;
    demoY.value = sy;
    demoVis.value = 1;
    demoScale.value = 1;
    demoX.value = withTiming(ex, { duration: 700 });
    demoY.value = withTiming(ey, { duration: 700 });
    demoScale.value = withTiming(0.5, { duration: 700 });
    demoVis.value = withTiming(0, { duration: 700 }, (done) => {
      if (!done) return;
      runOnJS(setSoupDemoActive)(false);
    });
  }

  function onCookingSoupDragBegin(sourceSlot: number, absX: number, absY: number) {
    if (tsRef.current !== "COOKING_SHARE_EAT") return;
    const item = tableItemsRef.current[sourceSlot];
    if (!item || item.id !== "herbsoup") return;

    setSelectedSoupSlot(null);
    setSelectedHerbbagSlot(null);
    setSelectedHerbsSlot(null);
    setTooltipVisible(false);

    setSoupSlot(sourceSlot);
    soupSlotRef.current = sourceSlot;
    setFlyingItemId("herbsoup");

    requestAnimationFrame(() => {
      if (soupSlotRef.current !== sourceSlot || tsRef.current !== "COOKING_SHARE_EAT") return;
      setSoupDragging(true);
      soupVis.value = 1;
    });

    const slotRef = tableSlotRefs.current[sourceSlot];
    const applyOffset = (cx: number, cy: number) => {
      dragOffsetX.value = cx - absX;
      dragOffsetY.value = cy - absY;
      soupX.value = cx;
      soupY.value = cy;
    };

    if (slotRef) {
      slotRef.measureInWindow((x, y, w, h) => {
        if (w > 0) soupFlySize.value = w * 0.80;
        layouts.current.tableSlots[sourceSlot] = {
          x, y, w, h, cx: x + w / 2, cy: y + h / 2,
        };
        applyOffset(x + w / 2, y + h / 2);
      });
      return;
    }

    const cached = layouts.current.tableSlots[sourceSlot];
    applyOffset(
      cached ? (cached.cx ?? cached.x + cached.w / 2) : absX,
      cached ? (cached.cy ?? cached.y + cached.h / 2) : absY,
    );
  }

  function splitCookingSoupStack(sourceSlot: number) {
    if (tsRef.current !== "COOKING_SHARE_EAT") return;
    const currentTable = tableItemsRef.current;
    const stack = currentTable[sourceSlot];
    if (!stack || stack.id !== "herbsoup" || stack.quantity <= 1) return;

    const freeSlot = currentTable.findIndex((item, idx) => idx !== sourceSlot && item === null);
    if (freeSlot < 0) {
      showPlayerBubble('\"I need some room on the table.\"');
      return;
    }

    const newTable = currentTable.slice();
    newTable[sourceSlot] = { ...stack, quantity: stack.quantity - 1 };
    newTable[freeSlot] = { ...stack, quantity: 1 };
    tableItemsRef.current = newTable;
    setTableItems(newTable);
    setSoupSlot(sourceSlot);
    soupSlotRef.current = sourceSlot;
    AsyncStorage.setItem(KITCHEN_TABLE_KEY, JSON.stringify(newTable)).catch(() => {});
    audioManager.playSoundEffect('moveitem', { maxDurationMs: 3000 });
    setSelectedSoupSlot(null);
    setTooltipVisible(false);

    showBubble(
      '\"That smells delicious. Please pass me a bowl and dig in, too.\"',
      "Rupert", "ALLOW_ITEM", null, () => {}, "bubble.cooking.share_after_split",
    );
  }

  function handleCookingSoupTap(sourceSlot: number) {
    if (tsRef.current !== "COOKING_SHARE_EAT") return;
    const stack = tableItemsRef.current[sourceSlot];
    if (!stack || stack.id !== "herbsoup") return;

    if (selectedSoupSlot !== sourceSlot) {
      setSelectedSoupSlot(sourceSlot);
      setSelectedHerbbagSlot(null);
      setSelectedHerbsSlot(null);
      const entry = ITEM_CATALOG["herbsoup"];
      showCookingTooltip(entry?.name ?? "Herb Soup", entry?.description ?? "Restores 20 Stamina.");
      return;
    }

    if (stack.quantity <= 1) {
      setSelectedSoupSlot(null);
      setTooltipVisible(false);
      return;
    }

    splitCookingSoupStack(sourceSlot);
  }

  function createCookingSoupGesture(sourceSlot: number, quantity: number) {
    const cookingSoupTap = Gesture.Tap()
      .maxDeltaX(8).maxDeltaY(8)
      .onEnd(() => { runOnJS(handleCookingSoupTap)(sourceSlot); });

    const cookingSoupLongPress = Gesture.LongPress()
      .minDuration(500)
      .onStart(() => {
        runOnJS(setKitchenDetailItem)({
          id: "herbsoup",
          itemType: "herbsoup",
          name: "Herb Soup",
          quantity,
          attributes: ["edible"],
        });
      });

    const cookingSoupPan = Gesture.Pan()
      .minDistance(10)
      .onStart((e) => {
        cancelAnimation(soupX);
        cancelAnimation(soupY);
        cancelAnimation(soupVis);
        cancelAnimation(soupScale);
        soupVis.value = 0;
        soupScale.value = 1;
        runOnJS(onCookingSoupDragBegin)(sourceSlot, e.absoluteX, e.absoluteY);
      })
      .onUpdate((e) => {
        const itemX = e.absoluteX + dragOffsetX.value;
        const itemY = e.absoluteY + dragOffsetY.value;
        soupX.value = itemX;
        soupY.value = itemY;
        runOnJS(updateHoveredSlot)(itemX, itemY);
      })
      .onEnd((e) => {
        runOnJS(handleDrop)(
          e.absoluteX + dragOffsetX.value,
          e.absoluteY + dragOffsetY.value,
        );
      })
      .onFinalize((_, success) => {
        if (!success) {
          soupVis.value = withTiming(0, { duration: 100 });
          runOnJS(onGestureCancelled)();
        }
      });

    return Gesture.Race(cookingSoupPan, cookingSoupLongPress, cookingSoupTap);
  }

  function handleSoupTap() {
    const cur = tsRef.current;
    if (cur === "COOKING_UNPACK_WAIT" || cur === "COOKING_CRAFT_READY" || cur === "COOKING_SHARE_EAT") {
      setTooltipVisible(false);
      return;
    }
    if (cur === "SOUP_AVAILABLE") {
      dismissBubbleNoCallback();
      tsRef.current = "TOOLTIP_VISIBLE";
      setTs("TOOLTIP_VISIBLE");
      setTooltipItemName("Herb Soup");
      setTooltipItemDesc("Restores 20 Stamina.");
      setTooltipVisible(true);
      return;
    }
    if (cur === "SOUP_ON_TABLE") {
      setTooltipItemName("Herb Soup");
      setTooltipItemDesc("Restores 20 Stamina.");
      setTooltipVisible(true);
      setTutState("TOOLTIP_VISIBLE");
    } else if (cur === "TOOLTIP_VISIBLE") {
      setTooltipVisible(false);
      setTutState("SOUP_ON_TABLE");
    }
  }

  function showCookingTooltip(name: string, desc: string) {
    if (cookingTooltipTimer.current) clearTimeout(cookingTooltipTimer.current);
    setTooltipItemName(name);
    setTooltipItemDesc(desc);
    setTooltipVisible(true);
    cookingTooltipTimer.current = setTimeout(() => setTooltipVisible(false), 3500);
  }

  function onDragBegin(absX: number, absY: number) {
    const cur = tsRef.current;
    if (cur === "SOUP_AVAILABLE") {
      dismissBubbleNoCallback();
      tsRef.current = "SOUP_ON_TABLE";
      setTs("SOUP_ON_TABLE");
    } else if (cur !== "SOUP_ON_TABLE" && cur !== "TOOLTIP_VISIBLE") {
      return;
    }
    if (tsRef.current === "TOOLTIP_VISIBLE") {
      setTooltipVisible(false);
      setTutState("SOUP_ON_TABLE");
      tsRef.current = "SOUP_ON_TABLE";
    }

    const curSlot = soupSlotRef.current ?? 0;
    const slotRef = curSlot < 12
      ? tableSlotRefs.current[curSlot]
      : craftSlotRefs.current[curSlot - 12];

    const applyOffset = (itemCenterX: number, itemCenterY: number) => {
      dragOffsetX.value = itemCenterX - absX;
      dragOffsetY.value = itemCenterY - absY;
      soupX.value = itemCenterX;
      soupY.value = itemCenterY;
      if (curSlot < 12) {
        if (layouts.current.tableSlots[curSlot]) {
          const prev = layouts.current.tableSlots[curSlot]!;
          layouts.current.tableSlots[curSlot] = {
            ...prev,
            x: itemCenterX - prev.w / 2,
            y: itemCenterY - prev.h / 2,
          };
        }
      } else {
        const ci = curSlot - 12;
        if (layouts.current.craftSlots[ci]) {
          const prev = layouts.current.craftSlots[ci]!;
          layouts.current.craftSlots[ci] = {
            ...prev,
            x: itemCenterX - prev.w / 2,
            y: itemCenterY - prev.h / 2,
          };
        }
      }
    };

    if (slotRef) {
      slotRef.measureInWindow((x, y, w, h) => {
        if (curSlot < 12 && w > 0) soupFlySize.value = w * 0.80;
        applyOffset(x + w / 2, y + h / 2);
      });
    } else {
      const cached = curSlot < 12
        ? layouts.current.tableSlots[curSlot]
        : layouts.current.craftSlots[curSlot - 12];
      applyOffset(
        cached ? cached.x + cached.w / 2 : absX,
        cached ? cached.y + cached.h / 2 : absY,
      );
    }
    setSoupDragging(true);
  }

  function handleDrop(itemX: number, itemY: number) {
    hoveredSlotRef.current = null;
    setHoveredSlot(null);
    const lp = layouts.current.player;
    const lr = layouts.current.rupert;

    if (tsRef.current === "COOKING_SHARE_EAT") {
      const curSlot = soupSlotRef.current;
      const currentSoup = curSlot !== null && curSlot < 12
        ? tableItemsRef.current[curSlot]
        : null;
      const stackedSoup = currentSoup?.id === "herbsoup" && currentSoup.quantity > 1;
      const droppedOnRupert = !!lr && inRect(itemX, itemY, lr);
      const droppedOnPlayer = !!lp && inRect(itemX, itemY, lp);

      if (stackedSoup && (droppedOnRupert || droppedOnPlayer)) {
        returnDragToSlot(itemX, itemY);
        showBubble(
          '"We wanted to share."',
          "Rupert", "ALLOW_ITEM", null, () => {}, "bubble.cooking.share_stack_reject",
        );
        return;
      }
      if (droppedOnRupert) { onCookingShareWithRupert(); return; }
      if (droppedOnPlayer) { onCookingEatSoup(itemX, itemY); return; }
      endDragClean(); return;
    }

    if (tsRef.current !== "SOUP_ON_TABLE") {
      endDragClean();
      return;
    }
    const lts = layouts.current.tableSlots;
    const lcs = layouts.current.craftSlots;

    if (lp && inRect(itemX, itemY, lp)) {
      onDropOnPlayer(itemX, itemY);
    } else if (lr && inRect(itemX, itemY, lr)) {
      onDropOnRupert();
    } else {
      let target = -1;
      for (let i = 0; i < lts.length; i++) {
        if (lts[i] && inRect(itemX, itemY, lts[i]!)) { target = i; break; }
      }
      if (target === -1) {
        for (let i = 0; i < 3; i++) {
          if (lcs[i] && inRect(itemX, itemY, lcs[i]!)) { target = 12 + i; break; }
        }
      }
      if (target >= 0 && target !== soupSlotRef.current) {
        setSoupSlot(target); soupSlotRef.current = target;
        endDragClean();
      } else {
        returnDragToSlot(itemX, itemY);
      }
    }
  }

  function endDragClean() {
    soupVis.value = withTiming(0, { duration: 100 });
    setSoupDragging(false);
    hoveredSlotRef.current = null;
    setHoveredSlot(null);
  }

  function returnDragToSlot(fromX: number, fromY: number) {
    const curSlot = soupSlotRef.current ?? 0;
    const rect = curSlot < 12
      ? layouts.current.tableSlots[curSlot]
      : layouts.current.craftSlots[curSlot - 12];
    if (!rect) { endDragClean(); return; }
    const toX = rect.x + rect.w / 2;
    const toY = rect.y + rect.h / 2;
    soupX.value = fromX;
    soupY.value = fromY;
    soupX.value = withTiming(toX, { duration: RETURN_MS });
    soupY.value = withTiming(toY, { duration: RETURN_MS }, (done) => {
      if (!done) return;
      soupVis.value = withTiming(0, { duration: 120 });
      runOnJS(setSoupDragging)(false);
    });
  }

  function onDropOnRupert() {
    endDragClean();
    setTutState("REJECTION_DIALOG");
    showBubble(
      '"Thanks, but I\'ve already eaten. It\'s for you. You need it, believe me."',
      "Old Innkeeper",
      "LOCK_TUTORIAL",
      BUBBLE_REJECT_MS,
      () => {
        setTutState("SOUP_RETURNING");
        returnSoupFromRupert();
      },
    );
  }

  function returnSoupFromRupert() {
    const lr = layouts.current.rupert;
    const curSlot = soupSlotRef.current ?? 0;
    const rect = layouts.current.tableSlots[curSlot] ?? layouts.current.tableSlots[0];
    if (!lr || !rect) {
      setTutState("SOUP_ON_TABLE"); return;
    }
    setSoupDragging(true);
    const fromX = lr.x + lr.w / 2;
    const fromY = lr.y + lr.h / 2;
    const toX   = rect.x + rect.w / 2;
    const toY   = rect.y + rect.h / 2;
    soupX.value = fromX; soupY.value = fromY; soupScale.value = 1;
    soupVis.value = withTiming(1, { duration: 150 });
    soupX.value = withTiming(toX, { duration: RETURN_MS });
    soupY.value = withTiming(toY, { duration: RETURN_MS }, (done) => {
      if (done) {
        soupVis.value = withTiming(0, { duration: 150 });
        runOnJS(onSoupReturned)();
      }
    });
  }

  function onSoupReturned() {
    setSoupDragging(false);
    setTutState("SOUP_ON_TABLE");
  }

  function onDropOnPlayer(absX: number, absY: number) {
    if (consumedOnce.current) { endDragClean(); return; }
    consumedOnce.current = true;
    inputLocked.current = true;
    setSoupSlot(null); soupSlotRef.current = null;
    setSoupDragging(false);
    setTutState("CONSUMING");
    audioManager.playSoundEffect('eat', { maxDurationMs: 4000 });

    const lp = layouts.current.player;
    const toX = lp ? lp.x + lp.w / 2 : absX;
    const toY = lp ? lp.y + lp.h / 2 : absY;
    soupVis.value = 1; soupScale.value = 1;
    soupX.value = withTiming(toX, { duration: CONSUME_MS });
    soupY.value = withTiming(toY, { duration: CONSUME_MS });
    soupScale.value = withTiming(0.1, { duration: CONSUME_MS });
    soupVis.value = withTiming(0, { duration: CONSUME_MS }, (done) => {
      if (done) runOnJS(onConsumed)();
    });
  }

  function onConsumed() {
    const newSta = Math.min(staminaCurrent + 20, playerStats.maximumStamina);
    setStaminaCurrent(newSta);
    setTutState("STAMINA_ANIMATING");
    staminaSV.value = withTiming(newSta, { duration: STA_MS }, (done) => {
      if (done) runOnJS(onStaminaDone)(newSta);
    });

    plusY.value = 0;
    plusOp.value = 0;
    plusOp.value = withTiming(1, { duration: FLOAT_FADE_IN_MS });
    plusY.value = withTiming(-FLOAT_RISE_PX, { duration: FLOAT_MS });
    setTimeout(() => {
      plusOp.value = withTiming(0, { duration: FLOAT_FADE_OUT_MS });
    }, FLOAT_MS - FLOAT_FADE_OUT_MS);

    const startSta = staminaCurrent;
    const endSta   = newSta;
    const steps = 20;
    const stepMs = STA_MS / steps;
    let count = 0;
    staminaCountTimer.current = setInterval(() => {
      count++;
      const val = Math.round(startSta + ((endSta - startSta) * count) / steps);
      setStaminaDisplay(Math.min(val, endSta));
      if (count >= steps) {
        clearInterval(staminaCountTimer.current!);
        setStaminaDisplay(endSta);
      }
    }, stepMs);
  }

  function onStaminaDone(newSta: number) {
    setStaminaDisplay(newSta);
    inputLocked.current = false;
    setTimeout(() => {
      setTutState("POST_DIALOG");
      showDialog(D_POST_CONSUMPTION, () => {
        setRupertPortrait("normal");
        setTutState("QUESTION_CHOICE");
      });
    }, 350);
  }

  function selectWhereAmI() {
    if (inputLocked.current) return;
    setAskedWhere(true); askedWhereRef.current = true;
    setTutState("WHERE_AM_I");
    showDialog(D_WHERE_AM_I, () => {
      setRupertPortrait("normal");
      checkBothAnswered();
    });
  }

  function selectWhoAreYou() {
    if (inputLocked.current) return;
    setTutState("WHO_ARE_YOU");
    showDialog(D_WHO_INTRO, () => {
      setRupertNamed(true);
      setDlgLines([D_WHO_ASK]);
      setDlgIdx(0);
      setRupertPortrait("normal");
      setDlgActive(true);
      dlgDoneRef.current = () => {
        setNameInputVal(playerNameRef.current);
        setNameInputOpen(true);
        setTutState("NAME_INPUT");
      };
    });
  }

  function confirmName() {
    const trimmed = nameInputVal.trim();
    if (!trimmed) return;
    setNameInputOpen(false);
    setTutState("WHO_ARE_YOU");
    playerNameRef.current = trimmed;
    AsyncStorage.setItem(SK.PLAYER_NAME, trimmed).catch(() => {});
    (async () => {
      try {
        const rawSlot = await AsyncStorage.getItem("@game:active_slot");
        const rawSlots = await AsyncStorage.getItem("game_slots");
        if (rawSlot && rawSlots) {
          const slotNum = parseInt(rawSlot, 10);
          const slots = JSON.parse(rawSlots);
          const updated = slots.map((s: { slot: number; name: string }) =>
            s.slot === slotNum ? { ...s, name: trimmed } : s
          );
          await AsyncStorage.setItem("game_slots", JSON.stringify(updated));
        }
      } catch {}
    })();

    setAskedWho(true); askedWhoRef.current = true;
    showDialog(dWhoConfirm(trimmed), () => {
      setRupertPortrait("normal");
      checkBothAnswered();
    });
  }

  function checkBothAnswered() {
    if (askedWhereRef.current && askedWhoRef.current) {
      setTimeout(() => {
        setTutState("FINAL_DIALOG");
        showDialog(dFinal(playerNameRef.current), onFinalDialogDone);
      }, 200);
    } else {
      setTutState("QUESTION_CHOICE");
    }
  }

  function onFinalDialogDone() {
    setRupertPortrait("normal");
    setTutState("KITCHEN_DIALOG_FINISHED");
    AsyncStorage.setItem(SK.TUTORIAL_DONE, "true").catch(() => {});
    AsyncStorage.setItem(SK.STAMINA, String(staminaCurrent)).catch(() => {});
    (async () => {
      try {
        const rawSlot = await AsyncStorage.getItem("@game:active_slot");
        const rawSlots = await AsyncStorage.getItem("game_slots");
        if (rawSlot && rawSlots) {
          const slotNum = parseInt(rawSlot, 10);
          const slots = JSON.parse(rawSlots);
          const updated = slots.map((s: { slot: number }) =>
            s.slot === slotNum ? { ...s, tutorialDone: true } : s
          );
          await AsyncStorage.setItem("game_slots", JSON.stringify(updated));
        }
      } catch {}
    })();
    setTimeout(() => {
      setTutState("WAITING_FOR_GARDEN_LOCATION_CLICK");
      showBubble(
        '"Actually, I\'m out of herbs. Follow me to the garden. I\'ll show you the beds."',
        "Rupert",
        "GARDEN_PROMPT",
        null,
        () => {},
      );
    }, 400);
  }

  function handleGardenTap() {
    const cur = tsRef.current;
    if (cur !== "WAITING_FOR_GARDEN_LOCATION_CLICK" && cur !== "TUESDAY_KITCHEN_GARDEN_PROMPT") return;
    if (hasNavigatedToGardenRef.current) return;
    hasNavigatedToGardenRef.current = true;
    cancelAnimation(gardenPulse);
    gardenPulse.value = withTiming(1, { duration: 150 });
    dismissBubbleNoCallback();
    if (cur === "WAITING_FOR_GARDEN_LOCATION_CLICK") {
      AsyncStorage.setItem(SK.GARDEN_ENTERED, "true").catch(() => {});
    }
    setGardenActive(true);
    setTutState("IDLE");
    audioManager.playSoundEffect('footstep', { maxDurationMs: 4000 });
    router.push("/garden");
  }

  function onPostGardenDialogDone() {
    setRupertPortrait("normal");
    setTutState("IDLE");
    setDormitoryUnlocked(true);
    AsyncStorage.setItem(SK.HAS_SEEN_POST_GARDEN_DLG, "true").catch(() => {});
    AsyncStorage.setItem(SK.DORMITORY_UNLOCKED, "true").catch(() => {});
  }

  function startCookingTutorial() {
    const emptyTable = Array(12).fill(null) as (BagItem | null)[];
    setTableItems(emptyTable);
    AsyncStorage.setItem(KITCHEN_TABLE_KEY, JSON.stringify(emptyTable)).catch(() => {});
    setTutState("COOKING_UNPACK_WAIT");
    tsRef.current = "COOKING_UNPACK_WAIT";
    setBagPulseActive(true);
    bagOpenedOnceDuringCooking.current = false;
    cookingShareDoneRef.current = false;
    cookingEatDoneRef.current = false;
    AsyncStorage.setItem(SK.COOKING_STEP, "1").catch(() => {});
    setTimeout(() => showBubble(
      '"Please take the Herb Bag and the Bucket of Water out of your bag and put them on the table."',
      "Rupert", "ALLOW_ITEM", null, () => {}, "bubble.cooking.unpack_request",
    ), 400);
  }

  function checkCookingProgress(currentTable: (BagItem | null)[]) {
    if (tsRef.current !== "COOKING_UNPACK_WAIT") return;
    let herbQty = 0;
    let hasBucketwater = false;
    for (const item of currentTable) {
      if (!item) continue;
      if (item.id === "herbs") herbQty += item.quantity;
      if (item.id === "bucketwater") hasBucketwater = true;
    }
    if (herbQty >= 2 && hasBucketwater) {
      setTutState("OLDPOT_FLYING");
      tsRef.current = "OLDPOT_FLYING";
      if (bubbleTimer.current) { clearTimeout(bubbleTimer.current); bubbleTimer.current = null; }
      setBubble(null);
      setTimeout(() => showDialog(D_OLDPOT_DELIVER, () => flyOldpotToTable(currentTable)), 300);
    }
  }

  function flyOldpotToTable(currentTable: (BagItem | null)[]) {
    let freeSlot = -1;
    for (let i = 0; i < 12; i++) {
      if (!currentTable[i] && soupSlotRef.current !== i) { freeSlot = i; break; }
    }
    const rL = layouts.current.rupert;
    const slotL = freeSlot >= 0 ? layouts.current.tableSlots[freeSlot] : null;

    cookingFlyTargetSlot.current = freeSlot;
    cookingPendingTable.current  = currentTable;

    if (!rL || !slotL || freeSlot < 0) {
      placeOldpotOnTable();
      return;
    }
    setFlyingItemId("oldpot");
    const fromX = rL.x + rL.w / 2;
    const fromY = rL.y + rL.h / 2;
    const toX   = slotL.x + slotL.w / 2;
    const toY   = slotL.y + slotL.h / 2;
    soupX.value = fromX; soupY.value = fromY; soupScale.value = 1;
    soupVis.value = withTiming(1, { duration: 180 });
    soupX.value = withTiming(toX, { duration: FLY_MS });
    soupY.value = withTiming(toY, { duration: FLY_MS }, (done) => {
      if (done) runOnJS(onOldpotLanded)();
    });
  }

  function isKitchenItemInteractionState(state: TState) {
    return state === "IDLE" ||
      state === "COOKING_UNPACK_WAIT" ||
      state === "COOKING_CRAFT_READY" ||
      state === "COOKING_SHARE_EAT" ||
      state === "COOKING_DONE";
  }

  function getCookingItemAtSlot(slot: number): BagItem | null {
    if (slot <= 11) return tableItemsRef.current[slot] ?? null;
    if (slot <= 14) return craftIngSlotsRef.current[slot - 12] ?? null;
    if (slot === 15) return craftToolRef.current;
    return null;
  }

  function showCookingItemDetails(slot: number) {
    const item = getCookingItemAtSlot(slot);
    if (item) setKitchenDetailItem({ ...item });
  }

  function handleCookingItemTap(slot: number) {
    const item = getCookingItemAtSlot(slot);
    if (!item) return;
    const cur = tsRef.current;
    const onTable = slot <= 11;

    if (onTable && item.id === "herbbag" &&
        (cur === "COOKING_UNPACK_WAIT" || cur === "COOKING_CRAFT_READY")) {
      const remaining = item.containedQuantity ?? 0;
      if (selectedHerbbagSlot === null || selectedHerbbagSlot !== slot) {
        setSelectedHerbbagSlot(slot);
        setSelectedHerbsSlot(null);
        setSelectedSoupSlot(null);
        showCookingTooltip("Herb Bag", "Contains: " + remaining + (remaining === 1 ? " herb" : " herbs"));
      } else {
        unpackOneHerb(slot, item);
        const afterQty = remaining - 1;
        if (afterQty > 0) {
          showCookingTooltip("Herb Bag", "Contains: " + afterQty + (afterQty === 1 ? " herb" : " herbs"));
        } else {
          setTooltipVisible(false);
        }
      }
      return;
    }

    if (onTable && item.id === "herbs" && isKitchenItemInteractionState(cur)) {
      if (selectedHerbsSlot === null || selectedHerbsSlot !== slot) {
        setSelectedHerbsSlot(slot);
        setSelectedHerbbagSlot(null);
        setSelectedSoupSlot(null);
        showCookingTooltip(ITEM_CATALOG["herbs"].name, ITEM_CATALOG["herbs"].description);
      } else {
        if (item.quantity <= 1) {
          setSelectedHerbsSlot(null);
          setTooltipVisible(false);
          return;
        }
        const splitTable = tableItemsRef.current.slice();
        splitTable[slot] = { ...item, quantity: item.quantity - 1 };
        let splitPlaced = false;
        for (let si = 0; si < 12; si++) {
          if (si === slot) continue;
          if (!splitTable[si]) {
            splitTable[si] = { id: "herbs", itemType: "herbs", name: "Herbs", quantity: 1, attributes: ["ingredient"] };
            splitPlaced = true;
            break;
          }
        }
        if (!splitPlaced) { showPlayerBubble('"No free space available."'); return; }
        tableItemsRef.current = splitTable;
        setTableItems(splitTable);
        AsyncStorage.setItem(KITCHEN_TABLE_KEY, JSON.stringify(splitTable)).catch(() => {});
        audioManager.playSoundEffect('moveitem', { maxDurationMs: 3000 });
        setSelectedHerbsSlot(null);
        setTooltipVisible(false);
        if (cur === "COOKING_UNPACK_WAIT") checkCookingProgress(splitTable);
      }
      return;
    }

    const catalogEntry = ITEM_CATALOG[item.id];
    if (item.id === "herbbag") {
      const remaining = item.containedQuantity ?? 0;
      showCookingTooltip("Herb Bag", "Contains: " + remaining + (remaining === 1 ? " herb" : " herbs"));
    } else if (catalogEntry) {
      showCookingTooltip(catalogEntry.name, catalogEntry.description);
    } else {
      showCookingTooltip(item.name, "");
    }
  }

  function updateBagDropHover(next: boolean) {
    if (bagDropHoveredRef.current === next) return;
    bagDropHoveredRef.current = next;
    setBagDropHovered(next);
  }

  function updateCookingHoveredSlot(itemX: number, itemY: number) {
    const srcSlot = cookingDraggedSlotRef.current;
    const cur = tsRef.current;
    const lts = layouts.current.tableSlots;
    const lcs = layouts.current.craftSlots;
    const bagRect = layouts.current.bag;

    if (playerBagRef.current.unlocked && bagRect && inExpandedRect(itemX, itemY, bagRect)) {
      updateBagDropHover(true);
      if (hoveredSlotRef.current !== null) {
        hoveredSlotRef.current = null;
        setHoveredSlot(null);
      }
      return;
    }
    updateBagDropHover(false);

    let next: number | null = null;

    if (cur === "COOKING_CRAFT_READY") {
      for (let i = 0; i < 3; i++) {
        if (12 + i === srcSlot) continue;
        if (lcs[i] && inRect(itemX, itemY, lcs[i]!)) { next = 12 + i; break; }
      }
    }
    if (next === null && cur !== "COOKING_UNPACK_WAIT" && srcSlot !== 15 &&
        lcs[3] && inRect(itemX, itemY, lcs[3]!)) {
      next = 15;
    }
    if (next === null) {
      for (let i = 0; i < lts.length; i++) {
        if (i === srcSlot) continue;
        if (lts[i] && inRect(itemX, itemY, lts[i]!)) { next = i; break; }
      }
    }
    if (next !== hoveredSlotRef.current) {
      hoveredSlotRef.current = next;
      setHoveredSlot(next);
    }
  }

  function onCookingDragStarted(slotIdx: number, itemId: string, absX: number, absY: number) {
    const cur = tsRef.current;
    if (!isKitchenItemInteractionState(cur)) return;
    if (cur === "COOKING_UNPACK_WAIT" && slotIdx > 11) return;

    setSelectedHerbbagSlot(null);
    setSelectedHerbsSlot(null);
    setSelectedSoupSlot(null);
    setTooltipVisible(false);

    cookingDraggedSlotRef.current = slotIdx;
    cookingDragItemIdRef.current = itemId;
    setCookingDragActiveSlot(slotIdx);
    setFlyingItemId(itemId);
    updateBagDropHover(false);
    bagIconRef.current?.measureInWindow((x, y, w, h) => {
      layouts.current.bag = { x, y, w, h };
    });

    requestAnimationFrame(() => {
      if (cookingDraggedSlotRef.current !== slotIdx || !isKitchenItemInteractionState(tsRef.current)) return;
      setSoupDragging(true);
      soupVis.value = 1;
    });

    const slotRef = slotIdx <= 11
      ? tableSlotRefs.current[slotIdx]
      : craftSlotRefs.current[slotIdx === 15 ? 3 : slotIdx - 12];

    const applyOffset = (cx: number, cy: number) => {
      dragOffsetX.value = cx - absX;
      dragOffsetY.value = cy - absY;
      soupX.value = cx;
      soupY.value = cy;
    };

    if (slotRef) {
      slotRef.measureInWindow((x, y, w, h) => {
        if (w > 0) soupFlySize.value = w * 0.80;
        const rect = { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
        if (slotIdx <= 11) layouts.current.tableSlots[slotIdx] = rect;
        else layouts.current.craftSlots[slotIdx === 15 ? 3 : slotIdx - 12] = rect;
        applyOffset(rect.cx!, rect.cy!);
      });
      return;
    }

    const cached = slotIdx <= 11
      ? layouts.current.tableSlots[slotIdx]
      : layouts.current.craftSlots[slotIdx === 15 ? 3 : slotIdx - 12];
    applyOffset(
      cached ? (cached.cx ?? cached.x + cached.w / 2) : absX,
      cached ? (cached.cy ?? cached.y + cached.h / 2) : absY,
    );
  }

  function onCookingDragCancelled() {
    cookingDraggedSlotRef.current = -1;
    cookingDragItemIdRef.current = "";
    setSoupDragging(false);
    setCookingDragActiveSlot(-1);
    hoveredSlotRef.current = null;
    setHoveredSlot(null);
    updateBagDropHover(false);
  }

  function createCookingItemGesture(sourceSlot: number, itemId: string) {
    const itemTap = Gesture.Tap()
      .maxDeltaX(8).maxDeltaY(8)
      .onEnd(() => { runOnJS(handleCookingItemTap)(sourceSlot); });

    const itemLongPress = Gesture.LongPress()
      .minDuration(500)
      .onStart(() => { runOnJS(showCookingItemDetails)(sourceSlot); });

    const itemPan = Gesture.Pan()
      .minDistance(10)
      .onStart((e) => {
        cancelAnimation(soupX);
        cancelAnimation(soupY);
        cancelAnimation(soupVis);
        cancelAnimation(soupScale);
        soupVis.value = 0;
        soupScale.value = 1;
        runOnJS(onCookingDragStarted)(sourceSlot, itemId, e.absoluteX, e.absoluteY);
      })
      .onUpdate((e) => {
        const itemX = e.absoluteX + dragOffsetX.value;
        const itemY = e.absoluteY + dragOffsetY.value;
        soupX.value = itemX;
        soupY.value = itemY;
        runOnJS(updateCookingHoveredSlot)(itemX, itemY);
      })
      .onEnd((e) => {
        runOnJS(handleCookingItemDrop)(
          sourceSlot,
          e.absoluteX + dragOffsetX.value,
          e.absoluteY + dragOffsetY.value,
        );
      })
      .onFinalize((_, success) => {
        if (!success) {
          soupVis.value = withTiming(0, { duration: 100 });
          runOnJS(onCookingDragCancelled)();
        }
      });

    return Gesture.Race(itemPan, itemLongPress, itemTap);
  }

  async function returnCookingItemToBag(srcSlot: number) {
    const plan = planKitchenItemToBag(srcSlot, playerBagRef.current, {
      tableItems: tableItemsRef.current,
      craftIngredients: craftIngSlotsRef.current,
      craftTool: craftToolRef.current,
    });

    if (!plan.canTransfer) {
      showPlayerBubble('"My bag is full."');
      return;
    }

    playerBagRef.current = plan.bag;
    tableItemsRef.current = plan.tableItems;
    craftIngSlotsRef.current = plan.craftIngredients;
    craftToolRef.current = plan.craftTool;

    setPlayerBag(plan.bag);
    setTableItems(plan.tableItems);
    setCraftIngSlots(plan.craftIngredients);
    setCraftTool(plan.craftTool);
    setSelectedHerbbagSlot(null);
    setSelectedHerbsSlot(null);
    setSelectedSoupSlot(null);
    setTooltipVisible(false);

    await Promise.all([
      AsyncStorage.setItem(PLAYER_BAG_KEY, JSON.stringify(plan.bag)),
      AsyncStorage.setItem(KITCHEN_TABLE_KEY, JSON.stringify(plan.tableItems)),
      AsyncStorage.setItem(SK.CRAFT_INGREDIENTS, JSON.stringify(plan.craftIngredients)),
      AsyncStorage.setItem(SK.CRAFT_TOOL_SLOT, JSON.stringify(plan.craftTool)),
    ]).catch(() => {});

    audioManager.playSoundEffect('moveitem', { maxDurationMs: 3000 });
    if (plan.remainderQty > 0) {
      showPlayerBubble('"That is all I can fit."');
    }
    if (tsRef.current === "COOKING_CRAFT_READY") {
      setTimeout(updateCraftResultPreview, 50);
    }
  }

  function handleCookingItemDrop(srcSlot: number, absX: number, absY: number) {
    cookingDraggedSlotRef.current = -1;
    cookingDragItemIdRef.current = "";
    setSoupDragging(false);
    setCookingDragActiveSlot(-1);
    setHoveredSlot(null);
    hoveredSlotRef.current = null;
    updateBagDropHover(false);
    soupVis.value = withTiming(0, { duration: 100 });

    const cur = tsRef.current;
    if (!isKitchenItemInteractionState(cur)) return;
    if (cur === "COOKING_UNPACK_WAIT" && srcSlot > 11) return;

    const bagRect = layouts.current.bag;
    if (playerBagRef.current.unlocked && bagRect && inExpandedRect(absX, absY, bagRect)) {
      void returnCookingItemToBag(srcSlot);
      return;
    }

    const lcs = layouts.current.craftSlots;
    const lts = layouts.current.tableSlots;
    let destSlot = -1;

    if (cur === "COOKING_CRAFT_READY") {
      for (let i = 0; i < 3; i++) {
        if (lcs[i] && inRect(absX, absY, lcs[i]!)) { destSlot = 12 + i; break; }
      }
    }
    if (destSlot < 0 && cur !== "COOKING_UNPACK_WAIT" && lcs[3] && inRect(absX, absY, lcs[3]!)) {
      destSlot = 15;
    }
    if (destSlot < 0) {
      for (let i = 0; i < lts.length; i++) {
        if (lts[i] && inRect(absX, absY, lts[i]!)) { destSlot = i; break; }
      }
    }

    if (destSlot < 0 || destSlot === srcSlot) return;

    const curTable = tableItemsRef.current;
    const curIng = craftIngSlotsRef.current;
    const curTool = craftToolRef.current;
    const getItem = (slot: number): BagItem | null => {
      if (slot <= 11) return curTable[slot];
      if (slot <= 14) return curIng[slot - 12];
      if (slot === 15) return curTool;
      return null;
    };

    const srcItem = getItem(srcSlot);
    if (!srcItem) return;
    const destItem = getItem(destSlot);

    const newTable = curTable.slice();
    const newIng = curIng.slice() as (BagItem | null)[];
    let newTool = curTool;

    const setItemAtSlot = (slot: number, item: BagItem | null) => {
      if (slot <= 11) newTable[slot] = item;
      else if (slot <= 14) newIng[slot - 12] = item;
      else if (slot === 15) newTool = item;
    };

    const canMergeOnTable =
      srcSlot <= 11 &&
      destSlot <= 11 &&
      destItem !== null &&
      canStack(srcItem, destItem);

    if (canMergeOnTable) {
      const maxStack = getContainerStackLimit("kitchenTable");
      const capacity = Math.max(0, maxStack - destItem.quantity);
      if (capacity <= 0) return;

      const movedQty = Math.min(srcItem.quantity, capacity);
      const remainingQty = srcItem.quantity - movedQty;

      setItemAtSlot(destSlot, { ...destItem, quantity: destItem.quantity + movedQty });
      setItemAtSlot(srcSlot, remainingQty > 0 ? { ...srcItem, quantity: remainingQty } : null);
    } else {
      setItemAtSlot(srcSlot, destItem);
      setItemAtSlot(destSlot, srcItem);
    }

    tableItemsRef.current = newTable;
    craftIngSlotsRef.current = newIng;
    craftToolRef.current = newTool;

    setTableItems(newTable);
    setCraftIngSlots(newIng);
    setCraftTool(newTool);
    AsyncStorage.setItem(KITCHEN_TABLE_KEY, JSON.stringify(newTable)).catch(() => {});
    AsyncStorage.setItem(SK.CRAFT_INGREDIENTS, JSON.stringify(newIng)).catch(() => {});
    AsyncStorage.setItem(SK.CRAFT_TOOL_SLOT, JSON.stringify(newTool)).catch(() => {});

    audioManager.playSoundEffect('moveitem', { maxDurationMs: 3000 });
    if (cur === "COOKING_CRAFT_READY") setTimeout(updateCraftResultPreview, 50);
    if (cur === "COOKING_UNPACK_WAIT") checkCookingProgress(newTable);
  }

  function onOldpotLanded() {
    soupVis.value = withTiming(0, { duration: 150 }, () => {
      runOnJS(placeOldpotOnTable)();
    });
  }

  function placeOldpotOnTable() {
    const targetSlot   = cookingFlyTargetSlot.current;
    const currentTable = cookingPendingTable.current;
    setFlyingItemId("herbsoup");
    const newTable = [...currentTable];
    if (targetSlot >= 0 && targetSlot < 12) {
      newTable[targetSlot] = { id: "oldpot", itemType: "oldpot", name: "Old Pot", quantity: 1, attributes: ["tool"] };
    }
    setTableItems(newTable);
    AsyncStorage.setItem(KITCHEN_TABLE_KEY, JSON.stringify(newTable)).catch(() => {});
    AsyncStorage.setItem(SK.COOKING_STEP, "2").catch(() => {});
    setTutState("COOKING_CRAFT_READY");
    tsRef.current = "COOKING_CRAFT_READY";
    setTimeout(() => showBubble(
      '"The recipe is very simple: you just have to boil two herbs with a bucket of water in a cooking pot."',
      "Rupert", "ALLOW_ITEM", null, () => {}, "bubble.cooking.craft_instruction",
    ), 300);
  }

  function unpackOneHerb(herbbagSlot: number, herbbag: BagItem) {
    const qty = herbbag.containedQuantity ?? 0;
    if (qty <= 0) { showPlayerBubble('"The bag is empty."'); return; }

    const newTable = tableItems.slice();
    const newQty = qty - 1;
    if (newQty <= 0) {
      newTable[herbbagSlot] = null;
      setSelectedHerbbagSlot(null);
    } else {
      newTable[herbbagSlot] = { ...herbbag, containedQuantity: newQty };
    }

    const TABLE_STACK = 20;
    let placed = false;
    for (let i = 0; i < 12; i++) {
      if (i === herbbagSlot) continue;
      const t = newTable[i];
      if (t && t.id === "herbs" && t.quantity < TABLE_STACK) {
        newTable[i] = { ...t, quantity: t.quantity + 1 };
        placed = true; break;
      }
    }
    if (!placed) {
      for (let i = 0; i < 12; i++) {
        if (i === herbbagSlot) continue;
        if (!newTable[i]) {
          newTable[i] = { id: "herbs", itemType: "herbs", name: "Herbs", quantity: 1, attributes: ["ingredient"] };
          placed = true; break;
        }
      }
    }
    if (!placed) { showPlayerBubble('"No free space available."'); return; }

    audioManager.playSoundEffect('moveitem', { maxDurationMs: 3000 });
    setTableItems(newTable);
    AsyncStorage.setItem(KITCHEN_TABLE_KEY, JSON.stringify(newTable)).catch(() => {});
    checkCookingProgress(newTable);
  }

  function returnCraftIngToTable(ingIdx: number) {
    const item = craftIngSlots[ingIdx];
    if (!item) return;
    const newTable = tableItems.slice();
    const freeSlot = newTable.findIndex(s => s === null);
    if (freeSlot < 0) { showPlayerBubble('"No free table space."'); return; }
    newTable[freeSlot] = item;
    const newIng = craftIngSlots.slice() as (BagItem | null)[];
    newIng[ingIdx] = null;
    setCraftIngSlots(newIng);
    setTableItems(newTable);
    AsyncStorage.setItem(KITCHEN_TABLE_KEY, JSON.stringify(newTable)).catch(() => {});
    AsyncStorage.setItem(SK.CRAFT_INGREDIENTS, JSON.stringify(newIng)).catch(() => {});
    setCraftResult(null);
  }

  function returnCraftToolToTable() {
    const item = craftTool;
    if (!item) return;
    const newTable = tableItems.slice();
    const freeSlot = newTable.findIndex(s => s === null);
    if (freeSlot < 0) { showPlayerBubble('"No free table space."'); return; }
    newTable[freeSlot] = item;
    setCraftTool(null);
    setTableItems(newTable);
    AsyncStorage.setItem(KITCHEN_TABLE_KEY, JSON.stringify(newTable)).catch(() => {});
    AsyncStorage.setItem(SK.CRAFT_TOOL_SLOT, JSON.stringify(null)).catch(() => {});
    setCraftResult(null);
  }

  function updateCraftResultPreview() {
    setCraftIngSlots(prevIng => {
      setCraftTool(prevTool => {
        let herbsQty = 0;
        let bucketwaterQty = 0;
        let hasUnexpectedIngredient = false;
        for (const slot of prevIng) {
          if (!slot) continue;
          if (slot.id === "herbs") herbsQty += slot.quantity;
          else if (slot.id === "bucketwater") bucketwaterQty += slot.quantity;
          else hasUnexpectedIngredient = true;
        }
        const toolMet = prevTool?.id === HERB_SOUP_RECIPE.tool && prevTool.quantity === 1;
        const ingredientsMet = !hasUnexpectedIngredient && herbsQty === 2 && bucketwaterQty === 1;
        setCraftResult(
          (toolMet && ingredientsMet)
            ? { id: "herbsoup", itemType: "herbsoup", name: "Herb Soup", quantity: 2, attributes: ["edible"] }
            : null,
        );
        return prevTool;
      });
      return prevIng;
    });
  }

  function handleCraft() {
    if (craftingLocked.current) return;
    if (!craftResult) return;
    craftingLocked.current = true;

    let herbsQty = 0;
    let bucketwaterCount = 0;
    let hasUnexpectedIngredient = false;
    for (const slot of craftIngSlots) {
      if (!slot) continue;
      if (slot.id === "herbs") herbsQty += slot.quantity;
      else if (slot.id === "bucketwater") bucketwaterCount += slot.quantity;
      else hasUnexpectedIngredient = true;
    }
    const exactRecipe =
      !hasUnexpectedIngredient &&
      herbsQty === 2 &&
      bucketwaterCount === 1 &&
      craftTool?.id === HERB_SOUP_RECIPE.tool &&
      craftTool.quantity === 1;
    if (!exactRecipe) {
      craftingLocked.current = false;
      setCraftResult(null);
      showPlayerBubble('"There is no recipe for that."');
      return;
    }

    audioManager.playSoundEffect('cookingpot', { maxDurationMs: 6000 });

    const outputs: BagItem[] = [
      { id: "herbsoup", itemType: "herbsoup", name: "Herb Soup", quantity: 2, attributes: ["edible"] },
      { id: "bucket",   itemType: "bucket",   name: "Empty Bucket", quantity: 1, attributes: ["vessel"] },
    ];
    const newTable = tableItems.slice();
    let placed = 0;
    for (let i = 0; i < 12 && placed < outputs.length; i++) {
      if (!newTable[i] && soupSlotRef.current !== i) {
        newTable[i] = outputs[placed++];
      }
    }
    if (placed < outputs.length) {
      craftingLocked.current = false;
      showPlayerBubble('"No free space available."');
      return;
    }

    let herbsToConsume = 2;
    let waterToConsume = 1;
    const newIng = craftIngSlots.map((slot): BagItem | null => {
      if (!slot) return null;
      if (slot.id === "herbs" && herbsToConsume > 0) {
        const consumed = Math.min(slot.quantity, herbsToConsume);
        herbsToConsume -= consumed;
        const remaining = slot.quantity - consumed;
        return remaining > 0 ? { ...slot, quantity: remaining } : null;
      }
      if (slot.id === "bucketwater" && waterToConsume > 0) {
        const consumed = Math.min(slot.quantity, waterToConsume);
        waterToConsume -= consumed;
        const remaining = slot.quantity - consumed;
        return remaining > 0 ? { ...slot, quantity: remaining } : null;
      }
      return slot;
    });

    if (herbsToConsume !== 0 || waterToConsume !== 0) {
      craftingLocked.current = false;
      showPlayerBubble('"There is no recipe for that."');
      return;
    }

    tableItemsRef.current = newTable;
    craftIngSlotsRef.current = newIng;
    craftToolRef.current = craftTool;

    setCraftIngSlots(newIng);
    setCraftResult(null);
    setTableItems(newTable);
    AsyncStorage.setItem(KITCHEN_TABLE_KEY, JSON.stringify(newTable)).catch(() => {});
    AsyncStorage.setItem(SK.CRAFT_INGREDIENTS, JSON.stringify(newIng)).catch(() => {});
    AsyncStorage.setItem(SK.CRAFT_TOOL_SLOT, JSON.stringify(craftTool)).catch(() => {});
    AsyncStorage.setItem(SK.COOKING_STEP, "3").catch(() => {});

    setTutState("COOKING_CRAFT_DONE");
    tsRef.current = "COOKING_CRAFT_DONE";
    setTimeout(() => showDialog(D_CRAFT_SUCCESS, () => {
      setTutState("COOKING_SHARE_EAT");
      tsRef.current = "COOKING_SHARE_EAT";
      setFlyingItemId("herbsoup");
      const soup1 = newTable.findIndex(it => it?.id === "herbsoup");
      if (soup1 >= 0) { setSoupSlot(soup1); soupSlotRef.current = soup1; }
      showBubble(
        '"We made enough for two. Can you please split them into 2 bowls?"',
        "Rupert", "ALLOW_ITEM", null, () => {}, "bubble.cooking.split_soup_request",
      );
    }), 400);
    setTimeout(() => { craftingLocked.current = false; }, 2000);
  }

  function onCookingShareWithRupert() {
    endDragClean();
    cookingShareDoneRef.current = true;
    const curSlot = soupSlotRef.current;
    const newTable = tableItemsRef.current.slice();
    if (curSlot !== null && curSlot < 12) newTable[curSlot] = null;
    tableItemsRef.current = newTable;
    setSoupSlot(null); soupSlotRef.current = null;
    setTableItems(newTable);
    AsyncStorage.setItem(KITCHEN_TABLE_KEY, JSON.stringify(newTable)).catch(() => {});
    showBubble(
      '"Thank you."',
      "Rupert", "ALLOW_ITEM", 3000,
      () => afterOneCookingAction(newTable),
      "bubble.cooking.share_done",
    );
  }

  function onCookingEatSoup(absX: number, absY: number) {
    if (cookingEatDoneRef.current) { endDragClean(); return; }
    cookingEatDoneRef.current = true;
    const curSlot = soupSlotRef.current;
    const newTable = tableItemsRef.current.slice();
    if (curSlot !== null && curSlot < 12) newTable[curSlot] = null;
    tableItemsRef.current = newTable;
    setSoupSlot(null); soupSlotRef.current = null;
    setSoupDragging(false);
    setTableItems(newTable);
    AsyncStorage.setItem(KITCHEN_TABLE_KEY, JSON.stringify(newTable)).catch(() => {});
    cookingPendingTable.current = newTable;

    audioManager.playSoundEffect('eat', { maxDurationMs: 4000 });
    const lp = layouts.current.player;
    const toX = lp ? lp.x + lp.w / 2 : absX;
    const toY = lp ? lp.y + lp.h / 2 : absY;
    soupVis.value = 1; soupScale.value = 1;
    soupX.value = withTiming(toX, { duration: CONSUME_MS });
    soupY.value = withTiming(toY, { duration: CONSUME_MS });
    soupScale.value = withTiming(0.1, { duration: CONSUME_MS });
    soupVis.value = withTiming(0, { duration: CONSUME_MS }, (done) => {
      if (done) runOnJS(onCookingEatConsumed)();
    });

    const newSta = Math.min(staminaCurrent + 20, playerStats.maximumStamina);
    setStaminaCurrent(newSta);
    staminaSV.value = withTiming(newSta, { duration: STA_MS });
    plusY.value = 0; plusOp.value = 0;
    plusOp.value = withTiming(1, { duration: FLOAT_FADE_IN_MS });
    plusY.value = withTiming(-FLOAT_RISE_PX, { duration: FLOAT_MS });
    setTimeout(() => { plusOp.value = withTiming(0, { duration: FLOAT_FADE_OUT_MS }); }, FLOAT_MS - FLOAT_FADE_OUT_MS);
    const startSta = staminaCurrent;
    const endSta = newSta;
    const steps = 20; const stepMs = STA_MS / steps; let count = 0;
    staminaCountTimer.current = setInterval(() => {
      count++;
      setStaminaDisplay(Math.round(startSta + ((endSta - startSta) * count) / steps));
      if (count >= steps) { clearInterval(staminaCountTimer.current!); setStaminaDisplay(endSta); }
    }, stepMs);
    AsyncStorage.setItem(SK.STAMINA, String(newSta)).catch(() => {});
  }

  function onCookingEatConsumed() {
    afterOneCookingAction(cookingPendingTable.current);
  }

  function afterOneCookingAction(updatedTable: (BagItem | null)[]) {
    const shareDone = cookingShareDoneRef.current;
    const eatDone   = cookingEatDoneRef.current;
    if (shareDone && eatDone) { setTimeout(finishCookingTutorial, 500); return; }
    const remainingSlot = updatedTable.findIndex(it => it?.id === "herbsoup");
    if (remainingSlot < 0) { setTimeout(finishCookingTutorial, 500); return; }
    setSoupSlot(remainingSlot); soupSlotRef.current = remainingSlot;
    if (shareDone && !eatDone) {
      showBubble('"Now eat yours while it is still warm."', "Rupert", "ALLOW_ITEM", 6000, () => {}, "bubble.cooking.eat_instruction");
    } else {
      showBubble('"Now bring the other bowl to me."', "Rupert", "ALLOW_ITEM", 6000, () => {}, "bubble.cooking.share_instruction");
    }
  }

  function finishCookingTutorial() {
    setSoupSlot(null); soupSlotRef.current = null;
    setTutState("COOKING_DONE");
    tsRef.current = "COOKING_DONE";
    AsyncStorage.setItem(SK.COOKING_DONE, "true").catch(() => {});
    AsyncStorage.setItem(SK.COOKING_STEP, "4").catch(() => {});
    showBubble(
      '"There. That should give you some strength. You have done well today."',
      "Rupert", "BLOCK_ALL", null,
      () => { setTutState("IDLE"); tsRef.current = "IDLE"; },
      "bubble.cooking.done",
    );
  }

  function onGestureCancelled() {
    setSoupDragging(false);
    hoveredSlotRef.current = null;
    setHoveredSlot(null);
  }

  function updateHoveredSlot(itemX: number, itemY: number) {
    const lts = layouts.current.tableSlots;
    const lcs = layouts.current.craftSlots;
    let next: number | null = null;
    for (let i = 0; i < lts.length; i++) {
      if (lts[i] && inRect(itemX, itemY, lts[i]!)) {
        next = i !== soupSlotRef.current ? i : null; break;
      }
    }
    if (next === null) {
      for (let i = 0; i < 3; i++) {
        if (lcs[i] && inRect(itemX, itemY, lcs[i]!)) {
          const t = 12 + i; next = t !== soupSlotRef.current ? t : null; break;
        }
      }
    }
    if (next !== hoveredSlotRef.current) {
      hoveredSlotRef.current = next;
      setHoveredSlot(next);
    }
  }

  const tapGesture = Gesture.Tap()
    .maxDeltaX(8).maxDeltaY(8)
    .onEnd(() => { runOnJS(handleSoupTap)(); });

  const soupLongPress = Gesture.LongPress()
    .minDuration(500)
    .onStart(() => {
      runOnJS(setKitchenDetailItem)({
        id: "herbsoup",
        itemType: "herbsoup",
        name: "Herb Soup",
        quantity: 1,
      });
    });

  const panGesture = Gesture.Pan()
    .minDistance(10)
    .onStart((e) => {
      cancelAnimation(soupX);
      cancelAnimation(soupY);
      cancelAnimation(soupVis);
      cancelAnimation(soupScale);
      soupVis.value = 1;
      soupScale.value = 1;
      runOnJS(onDragBegin)(e.absoluteX, e.absoluteY);
    })
    .onUpdate((e) => {
      const itemX = e.absoluteX + dragOffsetX.value;
      const itemY = e.absoluteY + dragOffsetY.value;
      soupX.value = itemX;
      soupY.value = itemY;
      runOnJS(updateHoveredSlot)(itemX, itemY);
    })
    .onEnd((e) => {
      runOnJS(handleDrop)(
        e.absoluteX + dragOffsetX.value,
        e.absoluteY + dragOffsetY.value,
      );
    })
    .onFinalize((_, success) => {
      if (!success) {
        soupVis.value = withTiming(0, { duration: 100 });
        runOnJS(onGestureCancelled)();
      }
    });

  const soupGesture = Gesture.Race(panGesture, soupLongPress, tapGesture);

  const tutActive = ts !== "IDLE" && ts !== "LOADING" && ts !== "TUTORIAL_DONE";
  const tutInteractable = ts === "SOUP_ON_TABLE" || ts === "TOOLTIP_VISIBLE" || ts === "SOUP_AVAILABLE" || ts === "COOKING_CRAFT_READY" || ts === "COOKING_SHARE_EAT";
  const showDlgOverlay = dlgActive || ts === "QUESTION_CHOICE" || ts === "NAME_INPUT";

  const curLine = dlgActive ? dlgLines[dlgIdx] : null;
  const speakerName = curLine
    ? (rupertNamed && curLine.speaker === "Old Innkeeper" ? "Rupert" : curLine.speaker)
    : null;

  function renderSoupInSlot(slotIdx: number) {
    if (ts === "COOKING_SHARE_EAT") return null;
    const soupHere = soupSlot === slotIdx;
    if (!soupHere) return null;

    if (tutInteractable && !soupDemoActive) {
      return (
        <GestureDetector gesture={soupGesture}>
          <View style={styles.soupSlotTouch}>
            {!soupDragging && !soupDemoActive && (
              <Image source={IMG.herbsoup} style={styles.soupInSlotImg} resizeMode="contain" resizeMethod="resize" />
            )}
          </View>
        </GestureDetector>
      );
    }
    return (
      <View style={styles.soupSlotTouch} pointerEvents="none">
        {!soupDragging && !soupDemoActive && (
          <Image source={IMG.herbsoup} style={styles.soupInSlotImg} resizeMode="contain" resizeMethod="resize" />
        )}
      </View>
    );
  }

  function renderTableItemInSlot(slotIdx: number) {
    const item = tableItems[slotIdx];
    if (!item) return null;
    const imgSrc = ITEM_IMAGES[item.id] ?? null;

    const isSelectedHerbbag = selectedHerbbagSlot === slotIdx && item.id === "herbbag";
    const isSelectedHerbs   = selectedHerbsSlot === slotIdx && item.id === "herbs";
    const isSelectedSoup    = selectedSoupSlot === slotIdx && item.id === "herbsoup";
    const showHerbbagTapHint = (ts === "COOKING_UNPACK_WAIT" || ts === "COOKING_CRAFT_READY") &&
      item.id === "herbbag" && isSelectedHerbbag;

    if (ts === "COOKING_SHARE_EAT" && item.id === "herbsoup") {
      const isBeingDragged = soupDragging && soupSlot === slotIdx;
      const gesture = createCookingSoupGesture(slotIdx, item.quantity);
      return (
        <GestureDetector gesture={gesture}>
          <View
            style={[
              styles.soupSlotTouch,
              isSelectedSoup && { borderWidth: 2, borderColor: "#7EC87E", borderRadius: 6 },
            ]}
          >
            {!isBeingDragged && imgSrc && (
              <Image source={imgSrc} style={styles.soupInSlotImg} resizeMode="contain" resizeMethod="resize" />
            )}
            {!isBeingDragged && item.quantity > 1 && (
              <Text style={styles.tableItemQty}>{item.quantity}</Text>
            )}
            {!isBeingDragged && isSelectedSoup && item.quantity > 1 && (
              <View style={{ position: "absolute", bottom: 2, right: 2, backgroundColor: "#7EC87E", borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1 }}>
                <Text style={{ color: "#2C1810", fontSize: 8, fontWeight: "700" }}>SPLIT</Text>
              </View>
            )}
          </View>
        </GestureDetector>
      );
    }

    if (isKitchenItemInteractionState(ts)) {
      const isBeingDragged = soupDragging && cookingDragActiveSlot === slotIdx;
      const gesture = createCookingItemGesture(slotIdx, item.id);
      return (
        <GestureDetector gesture={gesture}>
          <View
            style={[
              styles.soupSlotTouch,
              isSelectedHerbbag && { borderWidth: 2, borderColor: "#E8B84B", borderRadius: 6 },
              isSelectedHerbs   && { borderWidth: 2, borderColor: "#7EC87E", borderRadius: 6 },
            ]}
          >
            {!isBeingDragged && imgSrc && (
              <Image source={imgSrc} style={styles.soupInSlotImg} resizeMode="contain" resizeMethod="resize" />
            )}
            {!isBeingDragged && item.quantity > 1 && (
              <Text style={styles.tableItemQty}>{item.quantity}</Text>
            )}
            {!isBeingDragged && showHerbbagTapHint && (
              <View style={{ position: "absolute", bottom: 2, right: 2, backgroundColor: "#E8B84B", borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1 }}>
                <Text style={{ color: "#2C1810", fontSize: 8, fontWeight: "700" }}>TAP</Text>
              </View>
            )}
            {!isBeingDragged && item.id === "herbs" && isSelectedHerbs && item.quantity > 1 && (
              <View style={{ position: "absolute", bottom: 2, right: 2, backgroundColor: "#7EC87E", borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1 }}>
                <Text style={{ color: "#2C1810", fontSize: 8, fontWeight: "700" }}>SPLIT</Text>
              </View>
            )}
          </View>
        </GestureDetector>
      );
    }

    return (
      <Pressable
        style={styles.soupSlotTouch}
        onPress={() => {
          const catalogEntry = ITEM_CATALOG[item.id];
          if (catalogEntry) showCookingTooltip(catalogEntry.name, catalogEntry.description);
        }}
        onLongPress={() => setKitchenDetailItem(item)}
        delayLongPress={500}
      >
        {imgSrc && (
          <Image source={imgSrc} style={styles.soupInSlotImg} resizeMode="contain" resizeMethod="resize" />
        )}
        {item.quantity > 1 && <Text style={styles.tableItemQty}>{item.quantity}</Text>}
      </Pressable>
    );
  }

  return (
    <View style={styles.root}>
      <CurrencyHud />
      <View style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
        <Image source={IMG.rupert}      style={{ width: 1, height: 1 }} />
        <Image source={IMG.rupertsad}   style={{ width: 1, height: 1 }} />
        <Image source={IMG.rupertlaugh} style={{ width: 1, height: 1 }} />
        <Image source={IMG.avNormal}    style={{ width: 1, height: 1 }} />
        <Image source={IMG.avLaugh}     style={{ width: 1, height: 1 }} />
        <Image source={IMG.avSad}       style={{ width: 1, height: 1 }} />
        <Image source={IMG.avTired}     style={{ width: 1, height: 1 }} />
        <Image source={IMG.avSick}      style={{ width: 1, height: 1 }} />
        <Image source={IMG.herbsoup}    style={{ width: 1, height: 1 }} />
        <Image source={IMG.oldpot}      style={{ width: 1, height: 1 }} />
      </View>

      <SceneBackground source={IMG.kitchen} topOffset={headerH} />
      <View style={[StyleSheet.absoluteFill, { top: headerH }, styles.bgOverlay]} />

      <View style={[styles.header, { paddingTop: insets.top + 6 }]} onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}>
        <View style={styles.headerTopRow}>
          <View style={styles.leftHeader}>
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
                <Animated.View style={[styles.plusFloat, plusFloatStyle]} pointerEvents="none">
                  <Text style={styles.plusFloatText}>+20</Text>
                </Animated.View>
              </View>
              <Text style={styles.statBarText}>{staminaDisplay}/{playerStats.maximumStamina}</Text>
            </View>
            <View style={styles.statBarOuter}>
              <Ionicons name="heart" size={13} color="#CC2200" />
              <View style={styles.statBarTrack}>
                <View style={[styles.statBarFill, styles.lifeFill, { width: (lifeCurrent / 30) * (barWidth || 0) }]} />
              </View>
              <Text style={styles.statBarText}>{lifeCurrent}/30</Text>
            </View>
          </View>
          <View style={styles.rightHeader}>
            <View style={styles.dayBadge}><Text style={styles.dayText}>{DAYS[dayIdx]}</Text></View>
            <TouchableOpacity
              style={styles.menuRoundBtn}
              onPress={() => setShowMenu(true)}
              activeOpacity={0.8}
              disabled={tutActive && !(ts === "COOKING_UNPACK_WAIT" || ts === "COOKING_CRAFT_READY" || ts === "COOKING_SHARE_EAT" || ts === "COOKING_DONE" || ts === "CRAFTING_TUTORIAL_READY" || ts === "WAITING_FOR_GARDEN_LOCATION_CLICK" || ts === "TUESDAY_KITCHEN_GARDEN_PROMPT" || ts === "POST_GARDEN_DIALOG")}
            >
              <Ionicons name="menu" size={22} color="#F5E6C8" />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.locationName}>Kitchen</Text>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={{ paddingBottom: 74 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        bounces={false}
        scrollEnabled={!tutActive}
      >
        <View style={styles.portraitRow}>
          <TouchableOpacity ref={playerPortraitRef} style={styles.circleWrap} onPress={() => setStatusOpen(true)} activeOpacity={0.8}>
            <Image source={avatarSrc(playerAvatarId, staminaCurrent)} style={[styles.circleImg, styles.playerPortraitImage]} resizeMode="cover" resizeMethod="resize" />
          </TouchableOpacity>
          <View ref={rupertPortraitRef} style={styles.circleWrap}>
            <Image source={rupertSrc(rupertPortrait)} style={styles.circleImg} resizeMode="cover" resizeMethod="resize" />
          </View>
          <View ref={bagIconRef} collapsable={false} style={styles.bagDropTarget}>
            <BagIconButton
              unlocked={playerBag.unlocked}
              onPress={() => {
                setBagOpen(true);
                if (ts === "COOKING_UNPACK_WAIT" && !bagOpenedOnceDuringCooking.current) {
                  bagOpenedOnceDuringCooking.current = true;
                  setBagPulseActive(false);
                }
              }}
              pulsing={bagPulseActive}
              style={styles.circleWrap}
            />
            {bagDropHovered && <View pointerEvents="none" style={styles.bagDropHighlight} />}
          </View>
        </View>

        {(() => {
          const craftGrid = (
            <View style={styles.gridContainer}>
              <View style={styles.gridRow}>
                {[0, 1, 2].map((i) => {
                  const craftItem = craftIngSlots[i];
                  const craftImgSrc = craftItem ? (ITEM_IMAGES[craftItem.id] ?? null) : null;
                  const craftBeingDragged = soupDragging && cookingDragActiveSlot === (12 + i);
                  return (
                    <View
                      key={i}
                      ref={(r) => { craftSlotRefs.current[i] = r; }}
                      style={[
                        styles.craftSlot,
                        hoveredSlot === (12 + i) && soupDragging && styles.slotHovered,
                      ]}
                    >
                      {craftItem ? (
                        isKitchenItemInteractionState(ts) ? (
                          <GestureDetector gesture={createCookingItemGesture(12 + i, craftItem.id)}>
                            <View style={styles.soupSlotTouch}>
                              {!craftBeingDragged && craftImgSrc && (
                                <Image source={craftImgSrc} style={styles.soupInSlotImg} resizeMode="contain" resizeMethod="resize" />
                              )}
                              {!craftBeingDragged && craftItem.quantity > 1 && (
                                <Text style={styles.tableItemQty}>{craftItem.quantity}</Text>
                              )}
                            </View>
                          </GestureDetector>
                        ) : (
                          <Pressable style={styles.soupSlotTouch} onPress={() => returnCraftIngToTable(i)}>
                            <View style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}>
                              {craftImgSrc && <Image source={craftImgSrc} style={styles.soupInSlotImg} resizeMode="contain" resizeMethod="resize" />}
                              {craftItem.quantity > 1 && <Text style={styles.tableItemQty}>{craftItem.quantity}</Text>}
                            </View>
                          </Pressable>
                        )
                      ) : (
                        renderSoupInSlot(12 + i)
                      )}
                    </View>
                  );
                })}
                <View
                  ref={(r) => { craftSlotRefs.current[3] = r; }}
                  style={[styles.craftSlot, styles.craftSlotTool, hoveredSlot === 15 && soupDragging && styles.slotHovered]}
                >
                  {!craftTool && <Ionicons name="hand-right-outline" size={26} color="#8B6914" />}
                  {craftTool && isKitchenItemInteractionState(ts) ? (
                    <GestureDetector gesture={createCookingItemGesture(15, craftTool.id)}>
                      <View style={styles.soupSlotTouch}>
                        {!(soupDragging && cookingDragActiveSlot === 15) && ITEM_IMAGES[craftTool.id] && (
                          <Image source={ITEM_IMAGES[craftTool.id]} style={styles.soupInSlotImg} resizeMode="contain" resizeMethod="resize" />
                        )}
                        {!(soupDragging && cookingDragActiveSlot === 15) && craftTool.quantity > 1 && (
                          <Text style={styles.tableItemQty}>{craftTool.quantity}</Text>
                        )}
                      </View>
                    </GestureDetector>
                  ) : craftTool ? (
                    <Pressable style={styles.soupSlotTouch} onPress={returnCraftToolToTable}>
                      {ITEM_IMAGES[craftTool.id] && (
                        <Image source={ITEM_IMAGES[craftTool.id]} style={styles.soupInSlotImg} resizeMode="contain" resizeMethod="resize" />
                      )}
                    </Pressable>
                  ) : null}
                </View>
                <TouchableOpacity
                  style={[styles.craftSlot, styles.craftSlotRecipe, craftResult ? { borderColor: "#5A9F5A", borderWidth: 1.5 } : {}]}
                  activeOpacity={0.7}
                  onPress={() => !craftResult && !tutActive && setShowRecipes(true)}
                  disabled={!!craftResult}
                >
                  {craftResult ? (
                    <View style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}>
                      {ITEM_IMAGES[craftResult.id] && (
                        <Image source={ITEM_IMAGES[craftResult.id]} style={styles.soupInSlotImg} resizeMode="contain" resizeMethod="resize" />
                      )}
                      {craftResult.quantity > 1 && <Text style={styles.tableItemQty}>{craftResult.quantity}</Text>}
                    </View>
                  ) : (
                    <Text style={styles.craftSlotText}>Recipe</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.craftSlot, styles.craftSlotCraft, !craftResult && { opacity: 0.45 }]}
                  activeOpacity={0.7}
                  onPress={handleCraft}
                  disabled={!craftResult}
                >
                  <Text style={styles.craftBoldText}>CRAFT</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
          const tableGrid = (
            <View style={[styles.gridContainer, styles.tableContainer]}>
              {[0, 1].map((row) => (
                <View key={row} style={styles.gridRow}>
                  {[0, 1, 2, 3, 4, 5].map((col) => {
                    const idx = row * 6 + col;
                    return (
                      <View
                        key={col}
                        ref={(r) => { tableSlotRefs.current[idx] = r; }}
                        style={[
                          styles.tableSlot,
                          hoveredSlot === idx && soupDragging && styles.slotHovered,
                        ]}
                      >
                        {renderSoupInSlot(idx) ?? renderTableItemInSlot(idx)}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          );
          return <View>{craftGrid}{tableGrid}</View>;
        })()}
      </ScrollView>

      <View
        style={[styles.locationBar, { paddingBottom: insets.bottom + 4 }]}
        onLayout={(e) => setLocationBarH(e.nativeEvent.layout.height)}
      >
        {LOCS.map((loc) => {
          const isGardenPrompt = ts === "WAITING_FOR_GARDEN_LOCATION_CLICK" || ts === "TUESDAY_KITCHEN_GARDEN_PROMPT";
          const isGardenBtn = loc.id === "garden";
          const isDormBtn = loc.id === "dormitory";
          const isDiningBtn = loc.id === "dining";
          const enabledInGardenPrompt = isGardenPrompt && isGardenBtn;

          const isEffectivelyActive =
            loc.active ||
            enabledInGardenPrompt ||
            (isGardenBtn && gardenActive) ||
            (isDormBtn && dormitoryUnlocked) ||
            (isDiningBtn && DEV_DINING_TEST_ACCESS);

          const locImgKey = `loc_${loc.id}` as keyof typeof IMG;
          const locImg = IMG[locImgKey] ?? null;

          const renderLocContent = (active: boolean) =>
            locImg ? (
              <Image
                source={locImg}
                style={[styles.locBtnImg, !active && styles.locBtnImgLocked]}
                resizeMode="contain" resizeMethod="resize"
              />
            ) : (
              <Ionicons name="help-outline" size={22} color={active ? "#F5E6C8" : "#3A3535"} />
            );

          if (enabledInGardenPrompt) {
            return (
              <Animated.View key={loc.id} style={[{ flex: 1 }, gardenPulseStyle]}>
                <TouchableOpacity
                  style={[styles.locBtn, styles.locBtnActive, styles.locBtnGardenHighlight, { flex: 1 }]}
                  onPress={handleGardenTap}
                  activeOpacity={0.8}
                >
                  {renderLocContent(true)}
                </TouchableOpacity>
              </Animated.View>
            );
          }

          if (ts === "TUESDAY_KITCHEN_GARDEN_PROMPT" && isDormBtn) {
            return (
              <TouchableOpacity
                key={loc.id}
                style={[styles.locBtn, styles.locBtnLocked]}
                onPress={() => showPlayerBubble('"I need to go to the garden."')}
                activeOpacity={0.8}
              >
                {renderLocContent(false)}
              </TouchableOpacity>
            );
          }

          let locOnPress: (() => void) | undefined;
          if (!tutActive && isEffectivelyActive) {
            if (isGardenBtn && gardenActive) {
              locOnPress = () => {
                audioManager.playSoundEffect('footstep', { maxDurationMs: 4000 });
                router.push("/garden");
              };
            } else if (isDormBtn && dormitoryUnlocked) {
              locOnPress = () => {
                audioManager.playSoundEffect('walking-on-wood', { maxDurationMs: 5000 });
                router.push("/dormitory");
              };
            } else if (isDiningBtn && DEV_DINING_TEST_ACCESS) {
              locOnPress = () => {
                audioManager.playSoundEffect('footstep', { maxDurationMs: 4000 });
                router.push("/dining");
              };
            }
          }

          return (
            <TouchableOpacity
              key={loc.id}
              style={[styles.locBtn, isEffectivelyActive ? styles.locBtnActive : styles.locBtnLocked]}
              disabled={!isEffectivelyActive || tutActive}
              onPress={locOnPress}
              activeOpacity={0.8}
            >
              {renderLocContent(isEffectivelyActive)}
            </TouchableOpacity>
          );
        })}
      </View>

      <Animated.View style={flyStyle} pointerEvents="none">
        <Image
          source={ITEM_IMAGES[flyingItemId] ?? IMG.herbsoup}
          style={{ width: "100%", height: "100%" }}
          resizeMode="contain"
          resizeMethod="resize"
        />
      </Animated.View>

      {tooltipVisible && (
        <View
          style={[styles.infoPanel, { bottom: locationBarH + 8 }]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={styles.infoPanelCard}
            onPress={handleSoupTap}
            activeOpacity={0.85}
          >
            <Text style={styles.infoPanelName}>{tooltipItemName}</Text>
            <Text style={styles.infoPanelDesc}>{tooltipItemDesc}</Text>
          </TouchableOpacity>
        </View>
      )}

      {tutActive && !showDlgOverlay && !tutInteractable && ts !== "WAITING_FOR_GARDEN_LOCATION_CLICK" && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-only" />
      )}
      {ts === "WAITING_FOR_GARDEN_LOCATION_CLICK" && headerH > 0 && (
        <View
          style={{
            position: "absolute",
            top: headerH,
            left: 0,
            right: 0,
            bottom: locationBarH,
            backgroundColor: "rgba(0,0,0,0.52)",
            zIndex: 50,
          }}
          pointerEvents="none"
        />
      )}

      {showDlgOverlay && (
        <View style={[StyleSheet.absoluteFill, styles.dlgBlocker]}>
          <View style={[styles.dialogPanel, { paddingBottom: insets.bottom + 18, marginBottom: ts === "NAME_INPUT" && keyboardH > 0 ? keyboardH : 0 }]}>
            <View style={styles.dlgPortraitWrap}>
              <Image
                source={
                  curLine?.portrait === "player"
                    ? avatarSrc(playerAvatarId, staminaCurrent)
                    : rupertSrc(rupertPortrait)
                }
                style={[styles.dlgPortrait, curLine?.portrait === "player" && styles.playerPortraitImage]}
                resizeMode="cover" resizeMethod="resize"
              />
            </View>

            {ts === "NAME_INPUT" && nameInputOpen && (
              <View style={{ width: "100%" }}>
                {speakerName && (
                  <Text style={styles.dlgSpeaker}>{speakerName}</Text>
                )}
                <View style={styles.dlgBox}>
                  <Text style={styles.dlgText}>{D_WHO_ASK.text}</Text>
                </View>
                <TextInput
                  style={styles.nameInput}
                  value={nameInputVal}
                  onChangeText={setNameInputVal}
                  placeholder="Your name..."
                  placeholderTextColor="#A89880"
                  maxLength={24}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={confirmName}
                />
                <TouchableOpacity
                  style={[styles.continueBtn, !nameInputVal.trim() && styles.btnDisabled]}
                  onPress={confirmName}
                  disabled={!nameInputVal.trim()}
                  activeOpacity={0.8}
                >
                  <Text style={styles.continueTxt}>Confirm</Text>
                  <Ionicons name="checkmark" size={16} color="#F5E6C8" />
                </TouchableOpacity>
              </View>
            )}

            {ts === "QUESTION_CHOICE" && !dlgActive && !nameInputOpen && (
              <>
                {!askedWhere && (
                  <TouchableOpacity style={styles.choiceBtn} onPress={selectWhereAmI} activeOpacity={0.8}>
                    <Text style={styles.choiceTxt}>Where am I?</Text>
                  </TouchableOpacity>
                )}
                {!askedWho && (
                  <TouchableOpacity style={styles.choiceBtn} onPress={selectWhoAreYou} activeOpacity={0.8}>
                    <Text style={styles.choiceTxt}>Who are you?</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {dlgActive && curLine && ts !== "NAME_INPUT" && (
              <>
                {speakerName && <Text style={styles.dlgSpeaker}>{speakerName}</Text>}
                <View style={styles.dlgBox}>
                  <Text style={styles.dlgText}>{curLine.text}</Text>
                </View>
                <TouchableOpacity
                  style={styles.continueBtn}
                  onPress={advanceDialog}
                  activeOpacity={0.8}
                >
                  <Text style={styles.continueTxt}>Continue</Text>
                  <Ionicons name="chevron-forward" size={16} color="#F5E6C8" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}

      {bubble && (() => {
        const rupertL = layouts.current.rupert;
        const bubbleTopPos = rupertL
          ? rupertL.y + rupertL.h + 8
          : (headerH > 0 ? headerH + 128 : insets.top + 190);
        const arrowCenterX = rupertL ? rupertL.x + rupertL.w / 2 : W * 0.5;
        const bubbleWidthTarget = W * 0.68;
        const bubbleLeftCalc = Math.max(16, Math.min(arrowCenterX - bubbleWidthTarget / 2, W * 0.32));
        const bubbleRightCalc = Math.max(12, W - bubbleLeftCalc - bubbleWidthTarget);
        const arrowOffset = Math.max(12, Math.min(
          arrowCenterX - bubbleLeftCalc - 10,
          W - bubbleLeftCalc - bubbleRightCalc - 32,
        ));

        const bubbleCard = (
          <View style={{ position: "relative" }}>
            <View style={[styles.bubbleArrowBorder, { left: arrowOffset }]} />
            <View style={[styles.bubbleArrowFill, { left: arrowOffset + 2 }]} />
            <View style={styles.bubbleCardInner}>
              <Text style={styles.bubbleSpeaker}>{bubble.speaker}</Text>
              <Text style={styles.bubbleText}>{bubble.text}</Text>
            </View>
          </View>
        );

        if (bubble.policy === "ALLOW_ITEM" || bubble.policy === "GARDEN_PROMPT") {
          return (
            <Pressable
              style={[StyleSheet.absoluteFill, { zIndex: 400 }]}
              onPress={dismissBubble}
              key="bubble-allow"
            >
              <TouchableOpacity
                style={{ position: "absolute", top: bubbleTopPos, left: bubbleLeftCalc, right: bubbleRightCalc }}
                onPress={dismissBubble}
                activeOpacity={0.88}
              >
                {bubbleCard}
              </TouchableOpacity>
            </Pressable>
          );
        }

        return (
          <Pressable style={[StyleSheet.absoluteFill, { zIndex: 401 }]} onPress={dismissBubble} key="bubble-block">
            <TouchableOpacity
              style={{ position: "absolute", top: bubbleTopPos, left: bubbleLeftCalc, right: bubbleRightCalc }}
              onPress={dismissBubble}
              activeOpacity={0.88}
            >
              {bubbleCard}
            </TouchableOpacity>
          </Pressable>
        );
      })()}

      {soupDemoActive && (
        <Animated.View style={demoStyle} pointerEvents="none">
          <Image source={require("../assets/images/herbsoup.png")} style={{ width: 56, height: 56 }} resizeMode="contain" resizeMethod="resize" />
        </Animated.View>
      )}

      <Modal visible={showMenu} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.menuPanel}>
            <Text style={styles.panelTitle}>Menu</Text>
            <View style={styles.divider} />
            {[
              { icon: "play" as const,          label: "Resume",    action: () => setShowMenu(false) },
              { icon: "book-outline" as const,   label: "Logbook",   action: () => { setShowMenu(false); setShowLogbook(true); } },
              { icon: "save-outline" as const,   label: "Save",      action: handleManualSave },
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

      <Modal visible={showLogbook} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.menuPanel, { maxHeight: "80%", minWidth: W * 0.88 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={styles.panelTitle}>Logbook</Text>
              <TouchableOpacity onPress={() => setShowLogbook(false)}>
                <Ionicons name="close" size={22} color="#C4943A" />
              </TouchableOpacity>
            </View>
            <View style={styles.divider} />
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
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

      <Modal visible={showRecipes} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.recipePanel}>
            <View style={styles.recipeTitleRow}>
              <Ionicons name="book-outline" size={20} color="#C4943A" />
              <Text style={styles.panelTitle}> Recipes</Text>
            </View>
            <View style={styles.divider} />
            <Text style={styles.recipeEmpty}>No recipes learned yet.{"\n"}Keep exploring the kitchen!</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setShowRecipes(false)} activeOpacity={0.8}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <PlayerBag
        bag={playerBag}
        visible={bagOpen}
        context="kitchen"
        dayIdx={dayIdx}
        onClose={() => setBagOpen(false)}
        onTransferItem={(bagSlotIdx, item) => handleBagToTable(bagSlotIdx, item)}
      />

      {kitchenDetailItem && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setKitchenDetailItem(null)}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.62)", justifyContent: "center", alignItems: "center" }}
            activeOpacity={1}
            onPress={() => setKitchenDetailItem(null)}
          >
            <TouchableOpacity activeOpacity={1} onPress={() => setKitchenDetailItem(null)}>
              <View style={styles.detailPanel}>
                <Image source={ITEM_IMAGES[kitchenDetailItem.id] ?? ITEM_IMAGES.herbsoup} style={styles.detailImg} resizeMode="contain" resizeMethod="resize" />
                <Text style={styles.detailName}>{ITEM_CATALOG[kitchenDetailItem.id]?.name ?? kitchenDetailItem.name}</Text>
                {kitchenDetailItem.containedItem && kitchenDetailItem.containedQuantity != null && (
                  <Text style={styles.detailContents}>Contains: {kitchenDetailItem.containedQuantity}× {kitchenDetailItem.containedItem}</Text>
                )}
                <Text style={styles.detailDesc}>{ITEM_CATALOG[kitchenDetailItem.id]?.description ?? ""}</Text>
                {(() => {
                  const attrs = ITEM_CATALOG[kitchenDetailItem.id]?.attributes ?? [];
                  if (!attrs.length) return null;
                  return (
                    <View style={{ alignItems: "center", gap: 4, marginTop: 4 }}>
                      <Text style={styles.detailAttrLabel}>Attributes</Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
                        {attrs.map((a) => (
                          <View key={a} style={styles.detailAttrTag}>
                            <Text style={styles.detailAttrText}>{a.charAt(0).toUpperCase() + a.slice(1)}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  );
                })()}
                <TouchableOpacity style={styles.detailClose} onPress={() => setKitchenDetailItem(null)}>
                  <Text style={styles.detailCloseText}>Close</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      <StatusModal
        visible={statusOpen}
        stats={playerStats}
        currentStamina={staminaCurrent}
        currentLife={lifeCurrent}
        onClose={() => setStatusOpen(false)}
        onStatsUpdated={(newStats, newLife) => {
          setPlayerStats(newStats);
          staminaMaxSV.value = newStats.maximumStamina;
          if (newLife !== null) setLifeCurrent(newLife);
          AsyncStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(newStats)).catch(() => {});
          if (newLife !== null) AsyncStorage.setItem(SK.LIFE, String(newLife)).catch(() => {});
        }}
      />

      {playerBubble && (() => {
        const playerL = layouts.current.player;
        const topPos = playerL
          ? playerL.y + playerL.h + 8
          : (headerH > 0 ? headerH + 128 : insets.top + 190);
        return (
          <View style={[StyleSheet.absoluteFill, { zIndex: 410 }]} pointerEvents="none">
            <View style={{ position: "absolute", top: topPos, left: 10, right: Math.max(10, W - Math.min(W * 0.75, 420) - 10) }}>
              <View style={styles.playerBubbleArrow} />
              <View style={styles.playerBubbleCard}>
                <Text style={styles.playerBubbleText}>{playerBubble}</Text>
              </View>
            </View>
          </View>
        );
      })()}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0500", position: "relative" },
  bgOverlay: { backgroundColor: "rgba(0,0,0,0.28)", zIndex: 0, pointerEvents: "none" as "none" },
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
  plusFloat: {
    position: "absolute", right: -8, top: 12,
    backgroundColor: "rgba(196,148,58,0.92)", borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 2, zIndex: 10,
  },
  plusFloatText: { color: "#FFF", fontSize: 12, fontFamily: "Oldenburg", fontWeight: "700" },
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
  scrollArea: { flex: 1, zIndex: 1 },
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
  bagDropTarget: { width: 96, height: 96, borderRadius: 48, position: "relative" },
  bagDropHighlight: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: "#F5E6C8",
    backgroundColor: "rgba(196,148,58,0.18)",
    zIndex: 5,
  },
  gridContainer: {
    marginHorizontal: 8, marginVertical: 5,
    backgroundColor: "rgba(10,6,1,0.90)", borderRadius: 12,
    borderWidth: 1, borderColor: "rgba(90,65,30,0.35)", padding: 5, overflow: "hidden",
  },
  tableContainer: { gap: 4 },
  gridRow: { flexDirection: "row", gap: 4 },
  craftSlot: {
    flex: 1, aspectRatio: 1,
    backgroundColor: "rgba(20,11,3,0.93)", borderRadius: 8,
    borderWidth: 1, borderColor: "rgba(90,65,30,0.42)",
    alignItems: "center", justifyContent: "center", minHeight: 44,
  },
  tableSlot: {
    flex: 1, aspectRatio: 1,
    backgroundColor: "rgba(20,11,3,0.93)", borderRadius: 8,
    borderWidth: 1, borderColor: "rgba(90,65,30,0.42)",
    minHeight: 44, alignItems: "center", justifyContent: "center",
  },
  craftSlotTool: { borderColor: "rgba(130,95,45,0.55)", backgroundColor: "rgba(25,14,4,0.95)" },
  craftSlotRecipe: { borderColor: "rgba(130,95,45,0.55)", backgroundColor: "rgba(25,14,4,0.95)" },
  craftSlotCraft: { borderWidth: 2, borderColor: "#C4943A", backgroundColor: "rgba(30,17,4,0.97)" },
  craftSlotText: { color: "rgba(200,165,90,0.70)", fontSize: 10, fontFamily: "Oldenburg", textAlign: "center" },
  craftBoldText: { color: "#F5E6C8", fontSize: 13, fontFamily: "Oldenburg", fontWeight: "bold", letterSpacing: 0.5, textAlign: "center" },
  tableItemQty: {
    position: "absolute", bottom: 2, right: 4,
    color: "#fff", fontSize: 10, fontFamily: "Oldenburg",
    textShadowColor: "#000", textShadowOffset: { width: 0.5, height: 0.5 }, textShadowRadius: 2,
  },
  detailPanel: {
    backgroundColor: "#1A0E05", borderRadius: 16, borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.55)", padding: 18, maxWidth: 300,
    alignItems: "center", gap: 8,
  },
  detailImg: { width: 60, height: 60 },
  detailName: { color: "#C4943A", fontSize: 15, fontFamily: "Oldenburg", textAlign: "center" },
  detailContents: { color: "#F0E8D5", fontSize: 12, fontFamily: "Oldenburg", textAlign: "center" },
  detailDesc: { color: "rgba(240,232,213,0.75)", fontSize: 12, fontFamily: "Oldenburg", textAlign: "center", marginBottom: 2 },
  detailAttrLabel: { color: "rgba(196,148,58,0.65)", fontSize: 10, fontFamily: "Oldenburg", letterSpacing: 0.8 },
  detailAttrTag: { backgroundColor: "rgba(196,148,58,0.12)", borderRadius: 6, borderWidth: 1, borderColor: "rgba(196,148,58,0.35)", paddingHorizontal: 8, paddingVertical: 3 },
  detailAttrText: { color: "#C4943A", fontSize: 11, fontFamily: "Oldenburg" },
  detailClose: { marginTop: 6, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, backgroundColor: "rgba(196,148,58,0.18)", borderWidth: 1, borderColor: "rgba(196,148,58,0.4)" },
  detailCloseText: { color: "#C4943A", fontSize: 13, fontFamily: "Oldenburg" },
  soupSlotTouch: { width: "80%", height: "80%", alignItems: "center", justifyContent: "center" },
  soupInSlotImg: { width: "100%", height: "100%" },
  locationBar: {
    flexDirection: "row", gap: 5, paddingVertical: 8, paddingHorizontal: 8,
    backgroundColor: "rgba(10,5,1,0.93)",
    borderTopWidth: 1, borderTopColor: "rgba(196,148,58,0.20)", zIndex: 2,
  },
  locBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 6, borderRadius: 10, borderWidth: 1, minHeight: 54 },
  locBtnActive: { backgroundColor: "rgba(196,148,58,0.22)", borderColor: "rgba(196,148,58,0.55)" },
  locBtnLocked: { backgroundColor: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" },
  locBtnGardenHighlight: { borderColor: "#C4943A", borderWidth: 2, backgroundColor: "rgba(196,148,58,0.30)" },
  locBtnImg: { width: 42, height: 42 },
  locBtnImgLocked: { opacity: 0.20 },
  infoPanel: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 200,
  },
  infoPanelCard: {
    backgroundColor: "rgba(240, 228, 192, 0.97)",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.70)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 8,
    alignItems: "center",
    gap: 3,
  },
  infoPanelName: {
    color: "#2A1000",
    fontSize: 15,
    fontFamily: "Oldenburg",
    letterSpacing: 0.5,
  },
  infoPanelDesc: {
    color: "rgba(42,16,0,0.65)",
    fontSize: 12,
    fontStyle: "italic",
  },
  slotHovered: {
    borderColor: "rgba(255,255,220,0.95)",
    borderWidth: 2.5,
    backgroundColor: "rgba(255,255,200,0.12)",
  },
  dlgBlocker: { zIndex: 500, justifyContent: "flex-end" },
  dialogPanel: {
    backgroundColor: "#160B03",
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 76,
    alignItems: "center", gap: 12,
    borderTopWidth: 1.5, borderTopColor: "rgba(196,148,58,0.35)",
    shadowColor: "#000", shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.7, shadowRadius: 14,
    elevation: 30, zIndex: 501,
  },
  dlgPortraitWrap: {
    position: "absolute", top: -62,
    width: 124, height: 124, borderRadius: 62,
    overflow: "hidden", borderWidth: 3, borderColor: "#C4943A", backgroundColor: "#2C1810",
  },
  dlgPortrait: { width: 124, height: 124 },
  dlgSpeaker: { color: "#C4943A", fontSize: 15, fontFamily: "Oldenburg", letterSpacing: 1.2, marginTop: 2 },
  dlgBox: {
    backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 16, width: "100%",
    borderWidth: 1, borderColor: "rgba(196,148,58,0.18)",
  },
  dlgText: { color: "#F0E8D5", fontSize: 16, lineHeight: 25, fontStyle: "italic", textAlign: "center" },
  continueBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(196,148,58,0.18)", borderRadius: 12,
    paddingVertical: 13, paddingHorizontal: 26,
    borderWidth: 1, borderColor: "rgba(196,148,58,0.35)", marginTop: 4,
  },
  continueTxt: { color: "#F5E6C8", fontSize: 15, fontFamily: "Oldenburg", letterSpacing: 0.6 },
  btnDisabled: { opacity: 0.4 },
  choiceBtn: {
    width: "100%", backgroundColor: "rgba(196,148,58,0.13)",
    borderRadius: 12, paddingVertical: 13, paddingHorizontal: 20,
    borderWidth: 1, borderColor: "rgba(196,148,58,0.30)", marginTop: 4,
    alignItems: "flex-start",
  },
  choiceTxt: { color: "#F5E6C8", fontSize: 15, fontFamily: "Oldenburg", letterSpacing: 0.4 },
  nameInput: {
    backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 13, fontSize: 16, color: "#F0E8D5",
    borderWidth: 1, borderColor: "rgba(196,148,58,0.38)",
    width: "100%", marginTop: 8, fontFamily: "Oldenburg",
  },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.76)", alignItems: "center", justifyContent: "center" },
  menuPanel: {
    width: 264, backgroundColor: "#160B03", borderRadius: 20, padding: 24,
    borderWidth: 1.5, borderColor: "rgba(196,148,58,0.38)", gap: 2,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 16, elevation: 24,
  },
  panelTitle: { color: "#F5E6C8", fontSize: 18, fontFamily: "Oldenburg", letterSpacing: 1, textAlign: "center" },
  divider: { height: 1, backgroundColor: "rgba(196,148,58,0.22)", marginVertical: 10 },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 13, paddingHorizontal: 6, borderRadius: 10 },
  menuRowText: { color: "#F0E8D5", fontSize: 15, fontFamily: "Oldenburg", letterSpacing: 0.4 },
  recipePanel: {
    width: "85%", backgroundColor: "#160B03", borderRadius: 20, padding: 24,
    borderWidth: 1.5, borderColor: "rgba(196,148,58,0.38)", alignItems: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 16, elevation: 24,
  },
  recipeTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  recipeEmpty: { color: "rgba(240,232,213,0.5)", fontSize: 14, fontStyle: "italic", textAlign: "center", lineHeight: 22, marginVertical: 20 },
  closeBtn: {
    backgroundColor: "rgba(196,148,58,0.16)", borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 36,
    borderWidth: 1, borderColor: "rgba(196,148,58,0.35)", marginTop: 4,
  },
  closeBtnText: { color: "#F5E6C8", fontSize: 14, fontFamily: "Oldenburg", letterSpacing: 0.5 },
  bubbleArrowBorder: {
    position: "absolute",
    top: -11,
    width: 0,
    height: 0,
    borderStyle: "solid",
    borderLeftWidth: 11,
    borderRightWidth: 11,
    borderBottomWidth: 11,
    borderTopWidth: 0,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "rgba(196,148,58,0.55)",
  },
  bubbleArrowFill: {
    position: "absolute",
    top: -7,
    width: 0,
    height: 0,
    borderStyle: "solid",
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 9,
    borderTopWidth: 0,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "rgba(250, 242, 218, 0.97)",
  },
  bubbleCardInner: {
    backgroundColor: "rgba(250, 242, 218, 0.97)",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.55)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 12,
    gap: 6,
  },
  bubbleSpeaker: {
    color: "#7A4800",
    fontSize: 13,
    fontFamily: "Oldenburg",
    letterSpacing: 1,
  },
  bubbleText: {
    color: "#2A1000",
    fontSize: 15,
    lineHeight: 22,
    fontStyle: "italic",
  },
  playerBubbleArrow: {
    width: 0, height: 0,
    borderLeftWidth: 8, borderRightWidth: 8, borderBottomWidth: 10,
    borderLeftColor: "transparent", borderRightColor: "transparent",
    borderBottomColor: "rgba(240,230,200,0.95)",
    marginLeft: 16,
  },
  playerBubbleCard: {
    backgroundColor: "rgba(240,230,200,0.95)",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.50)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: "flex-start" as const,
    maxWidth: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 7,
    elevation: 14,
  },
  playerBubbleText: {
    color: "#2A1000",
    fontSize: 13,
    fontStyle: "italic",
    lineHeight: 18,
  },
});