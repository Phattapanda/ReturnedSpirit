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
import { useAudioManager } from "@/src/audio/AudioProvider";
import PlayerBag, { BagIconButton } from "@/src/components/PlayerBag";
import StatusModal from "@/src/components/StatusModal";
import {
  PLAYER_BAG_KEY, DEFAULT_BAG, KITCHEN_TABLE_KEY, ITEM_CATALOG,
  type PlayerBagData, type BagItem,
} from "@/src/game/item-system";
import { PLAYER_STATS_KEY, DEFAULT_PLAYER_STATS, type PlayerStats } from "@/src/game/player-stats";
import { loadLogbook, type LogEntry, LOGBOOK_KEY } from "@/src/game/logbook";
import { createSnapshot, discardRuntimeAndRestore } from "@/src/game/save-manager";
import { ensureAssetReady } from "@/src/assets/AssetManager";

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
} as const;

// ─── Sizes & durations ────────────────────────────────────────────────────────

// SOUP_FLY_SIZE removed — now driven by soupFlySize shared value (measured from slot)
const FLY_MS = 350;
const RETURN_MS = 500;
const STA_MS = 900;
const FLOAT_MS = 2200;       // centralized float duration (slower/softer)
const FLOAT_RISE_PX = 32;    // how far floats rise
const FLOAT_FADE_IN_MS = 200;
const FLOAT_FADE_OUT_MS = 400;
const BUBBLE_INTRO_MS   = 3500;
const BUBBLE_INSPECT_MS = 4500;
const BUBBLE_REJECT_MS  = 4000;
const CONSUME_MS = 420;

// ─── Types ────────────────────────────────────────────────────────────────────

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
  id?: string;     // stable ID for logbook deduplication
  speaker: string;
  portrait: "normal" | "sad" | "laugh" | "player";
  text: string;
};

type LRect = { x: number; y: number; w: number; h: number; cx?: number; cy?: number };

// Interaction policy for context bubbles
type BubblePolicy = "BLOCK_ALL" | "ALLOW_ITEM" | "LOCK_TUTORIAL" | "GARDEN_PROMPT";
interface BubbleConfig {
  text: string;
  speaker: string;
  policy: BubblePolicy;
}

// ─── Location data ────────────────────────────────────────────────────────────

const LOCS = [
  { id: "kitchen",   active: true,  locked: false },
  { id: "garden",    active: false, locked: true  },
  { id: "dining",    active: false, locked: true  },
  { id: "dormitory", active: false, locked: true  },
  { id: "mail",      active: false, locked: true  },
  { id: "explore",   active: false, locked: true  },
];

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
  // Location bar icons
  loc_kitchen:   require("../assets/images/gotokitchen.png"),
  loc_garden:    require("../assets/images/gotogarden.png"),
  loc_dining:    require("../assets/images/gotodining.png"),
  loc_dormitory: require("../assets/images/gotodormitory.png"),
  loc_mail:      require("../assets/images/gotomail.png"),
  loc_explore:   require("../assets/images/goexplore.png"),
  loc_storage:   require("../assets/images/gotostorage.png"),
  oldpot:        require("../assets/images/oldpot.png"),
};

// Item image map for kitchen table items (non-soup items unpacked from bag)
const ITEM_IMAGES: Record<string, ReturnType<typeof require>> = {
  herbbag:     require("../assets/images/herbbag.png"),
  herbsoup:    require("../assets/images/herbsoup.png"),
  bucket:      require("../assets/images/bucket.png"),
  bucketwater: require("../assets/images/bucketwater.png"),
  herbseed:    require("../assets/images/herbseed.png"),
  herbs:       require("../assets/images/herbs.png"),
  oldpot:      require("../assets/images/oldpot.png"),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avatarSrc(st: number) {
  if (st >= 90) return IMG.avLaugh;
  if (st >= 60) return IMG.avNormal;
  if (st >= 30) return IMG.avSad;
  if (st >= 10) return IMG.avTired;
  return IMG.avSick;
}
function rupertSrc(p: "normal" | "sad" | "laugh") {
  return p === "sad" ? IMG.rupertsad : p === "laugh" ? IMG.rupertlaugh : IMG.rupert;
}
function inRect(x: number, y: number, r: LRect): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

// ─── Dialog data (modal story only) ───────────────────────────────────────────

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

// ─── Cooking Recipe ───────────────────────────────────────────────────────────

const HERB_SOUP_RECIPE = {
  ingredients: [
    { id: "herbs",       requiredQty: 2 },
    { id: "bucketwater", requiredQty: 1 },
  ],
  tool: "oldpot",
} as const;

// ─── Component ────────────────────────────────────────────────────────────────

export default function KitchenScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();

  // ── Audio
  const audioManager = useAudioManager();

  // Crossfade to kitchen theme on mount (no-op if already playing kitchen)
  useEffect(() => {
    audioManager.crossfadeTo('kitchen', 3000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Menu modals
  const [showMenu, setShowMenu] = useState(false);
  const [showRecipes, setShowRecipes] = useState(false);
  const [barWidth, setBarWidth] = useState(0);

  // ── Game state
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
  // ── Bag & Stats
  const [playerBag, setPlayerBag] = useState<PlayerBagData>(DEFAULT_BAG);
  const [playerStats, setPlayerStats] = useState<PlayerStats>(DEFAULT_PLAYER_STATS);
  const [bagOpen, setBagOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  // ── Kitchen table items (items unpacked from bag; separate from soupSlot)
  const [tableItems, setTableItems] = useState<(BagItem | null)[]>(Array(12).fill(null));
  // Mirror for stable gesture closure (refs always reflect latest value)
  const tableItemsRef = useRef<(BagItem | null)[]>(Array(12).fill(null));
  // Refs for craft state — read by the stable cooking pan gesture (avoids stale closures)
  const craftIngSlotsRef = useRef<(BagItem | null)[]>([null, null, null]);
  const craftToolRef     = useRef<BagItem | null>(null);
  const [kitchenDetailItem, setKitchenDetailItem] = useState<BagItem | null>(null);
  // Unpack animation: last unpacked slot + scale SV
  const lastUnpackedSlot = useRef<number | null>(null);
  const unpackScale = useSharedValue(0);

  // ── Cooking tutorial state
  const [craftIngSlots, setCraftIngSlots] = useState<(BagItem | null)[]>([null, null, null]);
  const [craftTool, setCraftTool] = useState<BagItem | null>(null);
  const [craftResult, setCraftResult] = useState<BagItem | null>(null);
  const craftingLocked = useRef(false);
  const [selectedHerbbagSlot, setSelectedHerbbagSlot] = useState<number | null>(null);
  const [selectedHerbsSlot, setSelectedHerbsSlot] = useState<number | null>(null);
  const [bagPulseActive, setBagPulseActive] = useState(false);
  const bagOpenedOnceDuringCooking = useRef(false);
  const cookingShareDoneRef = useRef(false);
  const cookingEatDoneRef = useRef(false);
  const [flyingItemId, setFlyingItemId] = useState<string>("herbsoup");
  // Refs to pass table state safely into Reanimated worklet callbacks
  const cookingFlyTargetSlot = useRef<number>(-1);
  const cookingPendingTable  = useRef<(BagItem | null)[]>([]);
  // Cooking drag-and-drop: each occupied input slot owns its GestureDetector,
  // mirroring the reliable Day-1 soup pattern. The source slot is therefore known
  // before the gesture starts; no global hit-test/source discovery is needed.
  const cookingDraggedSlotRef = useRef<number>(-1);
  const [cookingDragActiveSlot, setCookingDragActiveSlot] = useState<number>(-1);
  const cookingDragItemIdRef = useRef<string>("");

  // ── Tutorial state
  const [ts, setTs] = useState<TState>("LOADING");
  const tsRef = useRef<TState>("LOADING");

  // ── Soup
  const [soupSlot, setSoupSlot] = useState<number | null>(null);
  const soupSlotRef = useRef<number | null>(null);
  const [soupDragging, setSoupDragging] = useState(false);
  const consumedOnce = useRef(false);
  const inputLocked = useRef(false);

  // ── Dialog
  const [dlgActive, setDlgActive] = useState(false);
  const [dlgLines, setDlgLines] = useState<DLine[]>([]);
  const [dlgIdx, setDlgIdx] = useState(0);
  const dlgDoneRef = useRef<(() => void) | null>(null);
  const lastAdvanceTimeRef = useRef(0); // anti-rapid-tap debounce

  // ── Context Speech Bubble
  const [bubble, setBubble] = useState<BubbleConfig | null>(null);
  const bubbleDoneRef = useRef<(() => void) | null>(null);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Logbook
  const [logbook, setLogbook] = useState<LogEntry[]>([]);
  const [showLogbook, setShowLogbook] = useState(false);

  // ── Soup demo animation (visual-only, one-time)
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

  // ── Player thought bubble
  const [playerBubble, setPlayerBubble] = useState<string | null>(null);
  const playerBubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showPlayerBubble(text: string) {
    if (playerBubbleTimer.current) clearTimeout(playerBubbleTimer.current);
    setPlayerBubble(text);
    playerBubbleTimer.current = setTimeout(() => setPlayerBubble(null), 2500);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Bag → Table unpack (tap on bag item in kitchen context)
  // ─────────────────────────────────────────────────────────────────────────
  async function handleBagToTable(bagSlotIdx: number, item: BagItem) {
    setBagOpen(false);
    const TABLE_STACK_LIMIT = 20;
    const currentTable = tableItems.slice();
    let transfer = item.quantity;

    // Fill compatible existing stacks first
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

    // Then use empty slots
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

    // Update bag (remove transferred qty)
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

    // Bounce animation on target slot
    if (firstNewSlot !== null) {
      lastUnpackedSlot.current = firstNewSlot;
      unpackScale.value = 0;
      unpackScale.value = withSpring(1, { damping: 14, stiffness: 280 });
    }
    // Check cooking tutorial progress after successful transfer
    checkCookingProgress(currentTable);
  }

  async function handleManualSave() {
    setShowMenu(false);
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
      await createSnapshot(slotNum, "manual");
      showPlayerBubble('"Game saved."');
    } catch {
      showPlayerBubble('"Save failed."');
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

  // ── Header height (for bubble positioning)
  const [headerH, setHeaderH] = useState(0);

  // ── Questions
  const [askedWhere, setAskedWhere] = useState(false);
  const [askedWho, setAskedWho] = useState(false);
  const askedWhereRef = useRef(false);
  const askedWhoRef = useRef(false);
  const [rupertNamed, setRupertNamed] = useState(false);

  // ── Name input
  const [nameInputOpen, setNameInputOpen] = useState(false);
  const [nameInputVal, setNameInputVal] = useState("");
  const [keyboardH, setKeyboardH] = useState(0);

  // ── Tooltip
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipItemName, setTooltipItemName] = useState("Herb Soup");
  const [tooltipItemDesc, setTooltipItemDesc] = useState("Restores 20 Stamina.");
  const cookingTooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Height of location bar for info panel positioning
  const [locationBarH, setLocationBarH] = useState(60);
  // Slot index currently under the dragging soup (for drop-zone highlight)
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const hoveredSlotRef = useRef<number | null>(null);

  // ── Stamina animation counter timer
  const staminaCountTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasNavigatedToGardenRef = useRef(false);

  // ── Shared animation values
  const barWidthSV   = useSharedValue(0);
  const staminaSV    = useSharedValue(20);    // drives bar width (0-max)
  const staminaMaxSV = useSharedValue(DEFAULT_PLAYER_STATS.maximumStamina); // drives bar denominator
  const plusY        = useSharedValue(0);
  const plusOp       = useSharedValue(0);
  const soupX        = useSharedValue(0);     // flying / dragging soup center X
  const soupY        = useSharedValue(0);     // flying / dragging soup center Y
  const soupVis      = useSharedValue(0);     // 0=hidden, 1=visible
  const soupScale    = useSharedValue(1);     // shrinks during consume
  // Drag offset: keeps item under same relative finger position (no jump on pickup)
  const dragOffsetX  = useSharedValue(0);
  const dragOffsetY  = useSharedValue(0);
  // Responsive fly size — updated from measured slot width in measureAll
  const soupFlySize  = useSharedValue(44);
  const gardenPulse  = useSharedValue(1);

  // ── Layout measurement refs (declared early: used in cookingTablePanGesture worklet below) ──
  const playerPortraitRef  = useRef<View>(null);
  const rupertPortraitRef  = useRef<View>(null);
  const tableSlotRefs      = useRef<(View | null)[]>(Array(12).fill(null));
  const craftSlotRefs = useRef<(View | null)[]>(Array(4).fill(null));  // 0-2 ingredients, 3 = tool
  const layouts = useRef<{
    player: LRect | null; rupert: LRect | null;
    tableSlots: (LRect | null)[]; craftSlots: (LRect | null)[];
  }>({ player: null, rupert: null, tableSlots: Array(12).fill(null), craftSlots: Array(4).fill(null) });

  // Cooking item gestures are created per occupied slot further below, next to
  // the existing Day-1 soup gesture helpers.

  // ── Animated styles
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

  // ─────────────────────────────────────────────────────────────────────────
  // Sync tsRef with state
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => { tsRef.current = ts; }, [ts]);
  // Sync staminaMaxSV when playerStats.maximumStamina changes (e.g. after Status upgrade)
  useEffect(() => { staminaMaxSV.value = playerStats.maximumStamina; }, [playerStats.maximumStamina]); // eslint-disable-line react-hooks/exhaustive-deps
  // Sync tableItemsRef so the stable cooking gesture always reads current items
  useEffect(() => { tableItemsRef.current = tableItems; }, [tableItems]);
  // Sync craft refs so the stable gesture always reads current craft state
  useEffect(() => { craftIngSlotsRef.current = craftIngSlots; }, [craftIngSlots]);
  useEffect(() => { craftToolRef.current = craftTool; }, [craftTool]);

  // Pulse garden button when waiting for garden location click (both initial visit and Tuesday morning)
  useEffect(() => {
    if (ts === "WAITING_FOR_GARDEN_LOCATION_CLICK" || ts === "TUESDAY_KITCHEN_GARDEN_PROMPT") {
      gardenPulse.value = withRepeat(withTiming(1.06, { duration: 700 }), -1, true);
    } else {
      cancelAnimation(gardenPulse);
      gardenPulse.value = withTiming(1, { duration: 200 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ts]);

  // ─────────────────────────────────────────────────────────────────────────
  // Keyboard tracking — push name-input dialog above keyboard
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvt, (e) => setKeyboardH(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardH(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Initial load
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        // Load logbook
        const lb = await loadLogbook();
        setLogbook(lb);

        // Load soup demo seen flag
        const demoSeen = await AsyncStorage.getItem(SK.SOUP_DEMO_SEEN);
        if (demoSeen === "true") soupDemoSeenRef.current = true;

        const done = await AsyncStorage.getItem(SK.TUTORIAL_DONE);
        const name = await AsyncStorage.getItem(SK.PLAYER_NAME);
        const storedName = name?.trim() || "Adventurer";
        playerNameRef.current = storedName;

        // Load life (persist initial value if absent)
        const rawLife = await AsyncStorage.getItem(SK.LIFE);
        const lf = rawLife ? Math.min(Math.max(parseInt(rawLife, 10), 0), 30) : 15;
        setLifeCurrent(lf);
        if (!rawLife) AsyncStorage.setItem(SK.LIFE, "15").catch(() => {});

        // Load day
        const rawDay = await AsyncStorage.getItem(SK.DAY_INDEX);
        if (rawDay !== null) setDayIdx(parseInt(rawDay, 10));

        // Load bag
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
        // Load kitchen table items (items unpacked from bag)
        const rawTable = await AsyncStorage.getItem(KITCHEN_TABLE_KEY);
        if (rawTable) { try { setTableItems(JSON.parse(rawTable)); } catch { /* default */ } }

        // Load craft slot state (cooking tutorial persistence)
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
            // Restore dormitory unlock
            const dormUnlocked = await AsyncStorage.getItem(SK.DORMITORY_UNLOCKED);
            if (dormUnlocked === "true") setDormitoryUnlocked(true);
            // Check if post-garden dialog still needs to be shown
            const seenPostGarden = await AsyncStorage.getItem(SK.HAS_SEEN_POST_GARDEN_DLG);
            if (seenPostGarden !== "true") {
              setTutState("POST_GARDEN_DIALOG");
              setTimeout(() => {
                showDialog(dPostGarden(playerNameRef.current), onPostGardenDialogDone);
              }, 400);
            } else {
              // Check if cooking tutorial should start (initial load after app restart)
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
                setTs("IDLE");
                tsRef.current = "IDLE";
              }
            }
          } else {
            // Show garden prompt bubble
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

  // Return-from-screen: refresh stats and detect post-garden dialog
  useFocusEffect(
    React.useCallback(() => {
      focusCountRef.current += 1;
      // Reset navigation guard so garden can be re-entered after returning
      hasNavigatedToGardenRef.current = false;
      if (focusCountRef.current <= 1) return; // Skip initial mount (handled by useEffect above)

      (async () => {
        try {
          const cur = tsRef.current;
          if (cur !== "IDLE") return; // Don't interfere with active tutorial/dialog

          // Refresh stats (may have changed in dormitory after sleep)
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

          // Refresh bag/stats
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

          // Check dormitory unlock (might have changed)
          const dormUnlocked = await AsyncStorage.getItem(SK.DORMITORY_UNLOCKED);
          if (dormUnlocked === "true") setDormitoryUnlocked(true);

          // Tuesday morning prompt: day=1, first sleep done, not yet shown
          const tuesdayShown = await AsyncStorage.getItem(SK.TUESDAY_MORNING_SHOWN);
          const rawDay2 = await AsyncStorage.getItem(SK.DAY_INDEX);
          const firstSleepDone = await AsyncStorage.getItem(SK.FIRST_SLEEP_DONE);
          if (firstSleepDone === "true" && (rawDay2 ? parseInt(rawDay2, 10) : 0) >= 1 && tuesdayShown !== "true") {
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
            }, 600);
            return;
          }

          // Check post-garden dialog needs to show (first return from garden)
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
            // Ensure garden button is active after garden entered
            const enteredGarden = await AsyncStorage.getItem(SK.GARDEN_ENTERED);
            if (enteredGarden === "true") setGardenActive(true);

            // Check if returning from Tuesday garden ready for crafting
            let craftingReady = await AsyncStorage.getItem(SK.CRAFTING_READY);
            // Fallback: auto-detect readiness directly from inventory
            // (handles Android back button, stale garden state, any navigation path)
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
                      // Load craft state if restoring mid-tutorial
                      const rawIng = await AsyncStorage.getItem(SK.CRAFT_INGREDIENTS);
                      if (rawIng) { try { setCraftIngSlots(JSON.parse(rawIng)); } catch {} }
                      const rawTool = await AsyncStorage.getItem(SK.CRAFT_TOOL_SLOT);
                      if (rawTool) { try { setCraftTool(JSON.parse(rawTool)); } catch {} }
                      // Check saved tutorial step for restore
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

  // Measure layouts 500ms after mount (before tutorial needs them at 600ms)
  useEffect(() => {
    const t = setTimeout(measureAll, 500);
    return () => {
      clearTimeout(t);
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-measure after screen-size changes (foldable/orientation)
  useEffect(() => {
    const t = setTimeout(measureAll, 0);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H, insets.top, insets.bottom]);

  // ─────────────────────────────────────────────────────────────────────────
  // Layout measurement
  // ─────────────────────────────────────────────────────────────────────────
  function measureAll() {
    playerPortraitRef.current?.measureInWindow((x, y, w, h) => {
      layouts.current.player = { x, y, w, h };
    });
    rupertPortraitRef.current?.measureInWindow((x, y, w, h) => {
      layouts.current.rupert = { x, y, w, h };
    });
    tableSlotRefs.current.forEach((r, i) => {
      r?.measureInWindow((x, y, w, h) => {
        layouts.current.tableSlots[i] = { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
        // Derive responsive fly-size from first slot width (matches in-slot 80%)
        if (i === 0 && w > 0) soupFlySize.value = w * 0.80;
      });
    });
    craftSlotRefs.current.forEach((r, i) => {
      r?.measureInWindow((x, y, w, h) => {
        layouts.current.craftSlots[i] = { x, y, w, h };
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Tutorial helpers
  // ─────────────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────
  // Dialog engine
  // ─────────────────────────────────────────────────────────────────────────
  function showDialog(lines: DLine[], onDone: () => void) {
    dlgDoneRef.current = onDone;
    setDlgLines(lines);
    setDlgIdx(0);
    const firstPortrait = lines[0]?.portrait;
    if (firstPortrait && firstPortrait !== "player") {
      setRupertPortrait(firstPortrait);
    }
    // Log first line immediately
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
    if (now - lastAdvanceTimeRef.current < 300) return; // prevent rapid-tap line skip
    lastAdvanceTimeRef.current = now;
    const nextIdx = dlgIdx + 1;
    if (nextIdx < dlgLines.length) {
      setDlgIdx(nextIdx);
      const next = dlgLines[nextIdx];
      // Log next line to logbook
      if (next.id && next.speaker !== "player") {
        logDialogLine(next.id, next.speaker, next.text);
      }
      // Only update portrait state when it actually changes (avoid unnecessary image reload)
      if (next.portrait !== "player" && next.portrait !== rupertPortrait) {
        setRupertPortrait(next.portrait);
      }
    } else {
      finalizeDialog();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Context Speech Bubble engine
  // ─────────────────────────────────────────────────────────────────────────
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
    // Log to logbook (only non-player speakers)
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

  /** Log a dialog or bubble line to the logbook (dedup by ID) */
  function logDialogLine(id: string, speaker: string, text: string) {
    const dayNames = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
    const day = dayNames[dayIdxRef.current] ?? "MO";
    setLogbook(prev => {
      if (prev.some(e => e.id === id)) return prev; // already logged
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

  /** Close bubble without firing the onClose callback (used when soup interaction overrides) */
  function dismissBubbleNoCallback() {
    if (bubbleTimer.current) {
      clearTimeout(bubbleTimer.current);
      bubbleTimer.current = null;
    }
    bubbleDoneRef.current = null;
    setBubble(null);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Tutorial flow
  // ─────────────────────────────────────────────────────────────────────────
  function onIntroDone() {
    measureAll();
    setTimeout(async () => {
      // Defensive: ensure herbsoup is decoded before fly animation starts
      await ensureAssetReady('herbsoup');
      setTutState("SOUP_FLYING");
      flySoupToTable();
    }, 200);
  }

  function flySoupToTable() {
    const rL = layouts.current.rupert;
    const s0 = layouts.current.tableSlots[0];
    if (!rL || !s0) {
      // Fallback: skip animation
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
        // Second bubble: "Pull it closer to you to eat."
        showBubble(
          '"Pull it closer to you to eat."',
          "Rupert",
          "ALLOW_ITEM",
          null,
          () => setTutState("SOUP_ON_TABLE"),
          "bubble.soup.drag_hint",
        );
        // Start demo animation simultaneously (only once)
        startSoupDemoAnim();
      },
      "bubble.soup.take_your_time",
    );
  }

  /** Visual-only soup eating demo animation (one-time, does not consume item). */
  function startSoupDemoAnim() {
    if (soupDemoSeenRef.current) return;

    const slot0 = layouts.current.tableSlots[0];
    const player = layouts.current.player;
    if (!slot0 || !player) {
      // Layout info not available: skip animation silently (flag stays false)
      return;
    }

    // Only set flag AFTER confirming layout is available (animation will actually play)
    soupDemoSeenRef.current = true;
    AsyncStorage.setItem(SK.SOUP_DEMO_SEEN, "true").catch(() => {});

    const sx = slot0.cx ?? slot0.x + (slot0.w ?? 56) / 2;
    const sy = slot0.cy ?? slot0.y + (slot0.h ?? 56) / 2;
    const ex = player.x + player.w / 2;
    const ey = player.y + player.h / 2;

    setSoupDemoActive(true); // hide real soup in slot during demo
    demoX.value = sx;
    demoY.value = sy;
    demoVis.value = 1;
    demoScale.value = 1;
    // Fly soup from slot 0 to player portrait
    demoX.value = withTiming(ex, { duration: 700 });
    demoY.value = withTiming(ey, { duration: 700 });
    demoScale.value = withTiming(0.5, { duration: 700 });
    demoVis.value = withTiming(0, { duration: 700 }, (done) => {
      if (!done) return;
      // Reset visible soup back to slot 0 (real soup reappears)
      runOnJS(setSoupDemoActive)(false);
    });
  }

  /**
   * Post-craft tutorial soup interaction. This is intentionally separate from the
   * Day-1 soup gesture so the proven Day-1 behavior remains untouched.
   */
  function onCookingSoupDragBegin(sourceSlot: number, absX: number, absY: number) {
    if (tsRef.current !== "COOKING_SHARE_EAT") return;
    const item = tableItemsRef.current[sourceSlot];
    if (!item || item.id !== "herbsoup") return;

    setSoupSlot(sourceSlot);
    soupSlotRef.current = sourceSlot;
    setFlyingItemId("herbsoup");

    // Same anti-flicker handoff as the generic Cooking drag: leave the source
    // bowl visible until the Herb Soup overlay image has been committed.
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
    setTooltipVisible(false);

    showBubble(
      '\"That smells delicious. Please pass me a bowl and dig in, too.\"',
      "Rupert", "ALLOW_ITEM", null, () => {}, "bubble.cooking.share_after_split",
    );
  }

  function createCookingSoupGesture(sourceSlot: number, quantity: number) {
    const cookingSoupTap = Gesture.Tap()
      .maxDeltaX(8).maxDeltaY(8)
      .onEnd(() => { runOnJS(splitCookingSoupStack)(sourceSlot); });

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
        // Do not reveal the shared overlay with the previous item's React source.
        // onCookingSoupDragBegin switches it to Herb Soup, then reveals next frame.
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

  // ── Soup tap (tooltip)
  function handleSoupTap() {
    const cur = tsRef.current;
    // Cooking tutorial states: tooltip tap just dismisses
    if (cur === "COOKING_UNPACK_WAIT" || cur === "COOKING_CRAFT_READY" || cur === "COOKING_SHARE_EAT") {
      setTooltipVisible(false);
      return;
    }
    if (cur === "SOUP_AVAILABLE") {
      // Close ALLOW_ITEM bubble without callback → open tooltip immediately
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

  /** Show a compact item tooltip that auto-dismisses after 3.5 s. */
  function showCookingTooltip(name: string, desc: string) {
    if (cookingTooltipTimer.current) clearTimeout(cookingTooltipTimer.current);
    setTooltipItemName(name);
    setTooltipItemDesc(desc);
    setTooltipVisible(true);
    cookingTooltipTimer.current = setTimeout(() => setTooltipVisible(false), 3500);
  }

  // ── Drag start (called from gesture onStart via runOnJS)
  function onDragBegin(absX: number, absY: number) {
    const cur = tsRef.current;
    if (cur === "SOUP_AVAILABLE") {
      // Close ALLOW_ITEM bubble without callback → continue drag as SOUP_ON_TABLE
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

    // NOTE: cancelAnimation already done in the panGesture.onStart worklet on UI thread
    // Here we only do JS-thread work: state updates + offset calculation

    // Identify current slot ref
    const curSlot = soupSlotRef.current ?? 0;
    const slotRef = curSlot < 12
      ? tableSlotRefs.current[curSlot]
      : craftSlotRefs.current[curSlot - 12];

    // Measure the slot LIVE at the moment of drag-start for up-to-date window coordinates
    // (handles foldables, orientation changes, screen-resize)
    const applyOffset = (itemCenterX: number, itemCenterY: number) => {
      dragOffsetX.value = itemCenterX - absX;
      dragOffsetY.value = itemCenterY - absY;
      soupX.value = itemCenterX;
      soupY.value = itemCenterY;
      // Also cache the fresh measurement
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
        // Also update soupFlySize in case screen changed
        if (curSlot < 12 && w > 0) soupFlySize.value = w * 0.80;
        applyOffset(x + w / 2, y + h / 2);
      });
    } else {
      // Fallback: use cached layout or touch position
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

  // ── Drag end
  function handleDrop(itemX: number, itemY: number) {
    // Clear drop-zone highlight immediately
    hoveredSlotRef.current = null;
    setHoveredSlot(null);
    const lp = layouts.current.player;
    const lr = layouts.current.rupert;

    // Cooking tutorial share/eat path
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
      // Consume!
      onDropOnPlayer(itemX, itemY);
    } else if (lr && inRect(itemX, itemY, lr)) {
      // Rejection
      onDropOnRupert();
    } else {
      // Check valid table slot
      let target = -1;
      for (let i = 0; i < lts.length; i++) {
        if (lts[i] && inRect(itemX, itemY, lts[i]!)) { target = i; break; }
      }
      // Check valid craft slot (0-2 only)
      if (target === -1) {
        for (let i = 0; i < lcs.length; i++) {
          if (lcs[i] && inRect(itemX, itemY, lcs[i]!)) { target = 12 + i; break; }
        }
      }
      if (target >= 0 && target !== soupSlotRef.current) {
        // Move to new slot
        setSoupSlot(target); soupSlotRef.current = target;
        endDragClean();
      } else {
        // Return to current slot
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
      if (!done) return; // animation cancelled by new drag — do not touch dragging state
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
    // Hide the slot image during fly-back to prevent double-soup (slot + flying)
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
    setSoupDragging(false);  // Show soup in slot again after fly-back
    setTutState("SOUP_ON_TABLE");
  }

  function onDropOnPlayer(absX: number, absY: number) {
    if (consumedOnce.current) { endDragClean(); return; }
    consumedOnce.current = true;
    inputLocked.current = true;
    setSoupSlot(null); soupSlotRef.current = null;
    setSoupDragging(false);
    setTutState("CONSUMING");

    // Play eat sound
    audioManager.playSoundEffect('eat', { maxDurationMs: 4000 });

    // Animate soup to player portrait center, shrinking
    const lp = layouts.current.player;
    const toX = lp ? lp.x + lp.w / 2 : absX;
    const toY = lp ? lp.y + lp.h / 2 : absY;
    // soupX/soupY are already at item visual center from pan gesture update — no override needed
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
    // Update portrait immediately (tired → sad) before animation
    setStaminaCurrent(newSta);
    setTutState("STAMINA_ANIMATING");

    // Animate stamina bar
    staminaSV.value = withTiming(newSta, { duration: STA_MS }, (done) => {
      if (done) runOnJS(onStaminaDone)(newSta);
    });

    // +20 float — slower/softer
    plusY.value = 0;
    plusOp.value = 0;
    plusOp.value = withTiming(1, { duration: FLOAT_FADE_IN_MS });
    plusY.value = withTiming(-FLOAT_RISE_PX, { duration: FLOAT_MS });
    setTimeout(() => {
      plusOp.value = withTiming(0, { duration: FLOAT_FADE_OUT_MS });
    }, FLOAT_MS - FLOAT_FADE_OUT_MS);

    // Animate stamina display text counter
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
    // staminaCurrent already set in onConsumed for immediate portrait change
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

  // ── Question choices
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
      // Show "What is your name?" + name input
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
    setTutState("WHO_ARE_YOU"); // leave NAME_INPUT so normal dialog can render
    playerNameRef.current = trimmed;
    // Save name
    AsyncStorage.setItem(SK.PLAYER_NAME, trimmed).catch(() => {});
    // Also update game_slots if possible
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
    // Persist tutorial completion
    AsyncStorage.setItem(SK.TUTORIAL_DONE, "true").catch(() => {});
    AsyncStorage.setItem(SK.STAMINA, String(staminaCurrent)).catch(() => {});
    // Mark save slot as tutorial-done so load-game restores it correctly
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
    // Transition to garden prompt after short pause
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
    // Both initial garden visit and Tuesday morning prompt navigate to garden
    if (cur !== "WAITING_FOR_GARDEN_LOCATION_CLICK" && cur !== "TUESDAY_KITCHEN_GARDEN_PROMPT") return;
    if (hasNavigatedToGardenRef.current) return;
    hasNavigatedToGardenRef.current = true;
    cancelAnimation(gardenPulse);
    gardenPulse.value = withTiming(1, { duration: 150 });
    dismissBubbleNoCallback();
    // Only mark GARDEN_ENTERED on first visit
    if (cur === "WAITING_FOR_GARDEN_LOCATION_CLICK") {
      AsyncStorage.setItem(SK.GARDEN_ENTERED, "true").catch(() => {});
    }
    setGardenActive(true);
    // Set kitchen to IDLE so it's clean when user returns
    setTutState("IDLE");
    // Footstep sound for outdoor transition
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

  // ─────────────────────────────────────────────────────────────────────────
  // Cooking Tutorial
  // ─────────────────────────────────────────────────────────────────────────

  function startCookingTutorial() {
    // Clear any stale table items before tutorial begins
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

  /** Called after any table change during COOKING_UNPACK_WAIT with the updated table. */
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
    // Find free table slot
    let freeSlot = -1;
    for (let i = 0; i < 12; i++) {
      if (!currentTable[i] && soupSlotRef.current !== i) { freeSlot = i; break; }
    }
    const rL = layouts.current.rupert;
    const slotL = freeSlot >= 0 ? layouts.current.tableSlots[freeSlot] : null;

    // Store state in refs for worklet callback safety
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

  /** Update hovered slot during cooking drag. Every Table/Craft/Tool input is valid. */
  function updateCookingHoveredSlot(itemX: number, itemY: number) {
    const srcSlot = cookingDraggedSlotRef.current;
    const lts = layouts.current.tableSlots;
    const lcs = layouts.current.craftSlots;
    let next: number | null = null;

    for (let i = 0; i < 3; i++) {
      if (12 + i === srcSlot) continue;
      if (lcs[i] && inRect(itemX, itemY, lcs[i]!)) { next = 12 + i; break; }
    }
    if (next === null && srcSlot !== 15 && lcs[3] && inRect(itemX, itemY, lcs[3]!)) {
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

  /** Begin a cooking drag whose source slot is already known by its GestureDetector. */
  function onCookingDragStarted(slotIdx: number, itemId: string, absX: number, absY: number) {
    if (tsRef.current !== "COOKING_CRAFT_READY") return;
    cookingDraggedSlotRef.current = slotIdx;
    cookingDragItemIdRef.current = itemId;
    setCookingDragActiveSlot(slotIdx);
    setFlyingItemId(itemId);

    // Keep the source visible until React has committed the new overlay image.
    // Showing the Reanimated overlay before setFlyingItemId() renders causes a
    // one-frame flash of the previously dragged item.
    requestAnimationFrame(() => {
      if (cookingDraggedSlotRef.current !== slotIdx || tsRef.current !== "COOKING_CRAFT_READY") return;
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
  }

  /**
   * Per-item cooking pan gesture, intentionally mirroring the reliable Day-1 soup gesture:
   * movement/animation stays on the UI thread; React state and slot logic cross via runOnJS.
   */
  function createCookingItemGesture(sourceSlot: number, itemId: string) {
    return Gesture.Pan()
      .minDistance(10)
      .onStart((e) => {
        cancelAnimation(soupX);
        cancelAnimation(soupY);
        cancelAnimation(soupVis);
        cancelAnimation(soupScale);
        // Keep the shared overlay hidden until JS has switched the React image
        // to this exact item. onCookingDragStarted reveals it next frame.
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
  }

  /** Drop a cooking item. Source is supplied by the item's own GestureDetector. */
  function handleCookingItemDrop(srcSlot: number, absX: number, absY: number) {
    cookingDraggedSlotRef.current = -1;
    cookingDragItemIdRef.current = "";
    setSoupDragging(false);
    setCookingDragActiveSlot(-1);
    setHoveredSlot(null);
    hoveredSlotRef.current = null;
    soupVis.value = withTiming(0, { duration: 100 });
    if (tsRef.current !== "COOKING_CRAFT_READY") return;

    const lcs = layouts.current.craftSlots;
    const lts = layouts.current.tableSlots;
    let destSlot = -1;

    for (let i = 0; i < 3; i++) {
      if (lcs[i] && inRect(absX, absY, lcs[i]!)) { destSlot = 12 + i; break; }
    }
    if (destSlot < 0 && lcs[3] && inRect(absX, absY, lcs[3]!)) destSlot = 15;
    if (destSlot < 0) {
      for (let i = 0; i < lts.length; i++) {
        if (lts[i] && inRect(absX, absY, lts[i]!)) { destSlot = i; break; }
      }
    }

    // Invalid/same-slot drop: nothing in data moves; source image simply reappears.
    if (destSlot < 0 || destSlot === srcSlot) return;

    // Read from refs so rapid repeated drags always see the latest slot contents.
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

    if (srcSlot <= 11) newTable[srcSlot] = destItem;
    else if (srcSlot <= 14) newIng[srcSlot - 12] = destItem;
    else if (srcSlot === 15) newTool = destItem;

    if (destSlot <= 11) newTable[destSlot] = srcItem;
    else if (destSlot <= 14) newIng[destSlot - 12] = srcItem;
    else if (destSlot === 15) newTool = srcItem;

    // Keep refs in sync immediately, before React effects run, so the next drag is reliable.
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
    setTimeout(updateCraftResultPreview, 50);
  }

  /** Called from worklet on oldpot landing. */
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

  /** Unpack one herb from herbbag on the table. */
  function unpackOneHerb(herbbagSlot: number, herbbag: BagItem) {
    const qty = herbbag.containedQuantity ?? 0;
    if (qty <= 0) { showPlayerBubble('"The bag is empty."'); return; }

    const newTable = tableItems.slice();
    // Decrement contained qty on herbbag
    const newQty = qty - 1;
    if (newQty <= 0) {
      // Remove empty herbbag from table
      newTable[herbbagSlot] = null;
      setSelectedHerbbagSlot(null);
    } else {
      newTable[herbbagSlot] = { ...herbbag, containedQuantity: newQty };
    }

    // Find free slot for 1×herbs (merge with existing stack first)
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

  /** Return an ingredient slot item back to the table. */
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

  /** Return the tool slot item back to the table. */
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

  /** Recompute the recipe result preview from current craft state. */
  function updateCraftResultPreview() {
    // Need current refs - use immediate state via functional setter
    setCraftIngSlots(prevIng => {
      setCraftTool(prevTool => {
        // Herb Soup is an exact recipe: 2 herbs + 1 bucket of water + 1 old pot.
        // Any additional ingredient item makes the recipe invalid.
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

    // Defensive execution-time validation so a stale preview can never consume
    // unrelated items or craft a recipe that is no longer exact.
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

    // Output: 2 herb soups + the emptied bucket. The old pot is reusable and stays.
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

    // Consume only recipe ingredients. Never blanket-clear input slots.
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

    // Keep refs synchronous with state so the next interaction sees the new contents.
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
      // Track the first soup for compatibility with the existing tutorial flow.
      // In COOKING_SHARE_EAT every soup stack gets its own GestureDetector below.
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
    // Store for worklet callback
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
    // counter
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

  // ─────────────────────────────────────────────────────────────────────────
  // Pan + Tap gesture for soup
  // ─────────────────────────────────────────────────────────────────────────

  // Called when gesture is cancelled/failed (success=false in onFinalize)
  // Only for cases where the drag was interrupted mid-flight (no onEnd called)
  function onGestureCancelled() {
    setSoupDragging(false);
    hoveredSlotRef.current = null;
    setHoveredSlot(null);
  }

  // Update highlighted slot under dragging soup (only when slot actually changes → minimal re-renders)
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
      for (let i = 0; i < lcs.length; i++) {
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
      // Show detailed item info for herb soup
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
      // Run cancelAnimation on UI thread (worklet) for reliable native behavior
      cancelAnimation(soupX);
      cancelAnimation(soupY);
      cancelAnimation(soupVis);
      cancelAnimation(soupScale);
      // Show flying item immediately at touch point (offset corrected by onDragBegin via runOnJS)
      soupVis.value = 1;
      soupScale.value = 1;
      runOnJS(onDragBegin)(e.absoluteX, e.absoluteY);
    })
    .onUpdate((e) => {
      // Compute item center (touch + pickup offset) for smooth no-jump drag
      const itemX = e.absoluteX + dragOffsetX.value;
      const itemY = e.absoluteY + dragOffsetY.value;
      soupX.value = itemX;
      soupY.value = itemY;
      // Update drop-zone highlight (only when hovered slot changes — minimal re-renders)
      runOnJS(updateHoveredSlot)(itemX, itemY);
    })
    .onEnd((e) => {
      // Pass item center (not raw touch) so drop detection uses visual position
      runOnJS(handleDrop)(
        e.absoluteX + dragOffsetX.value,
        e.absoluteY + dragOffsetY.value,
      );
    })
    .onFinalize((_, success) => {
      // Only clean up if gesture was cancelled (not a normal end via onEnd)
      // success=false: finger was yanked away, parent scroll took over, etc.
      if (!success) {
        soupVis.value = withTiming(0, { duration: 100 });
        runOnJS(onGestureCancelled)();
      }
    });

  const soupGesture = Gesture.Race(panGesture, soupLongPress, tapGesture);

  // ─────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────
  const tutActive = ts !== "IDLE" && ts !== "LOADING" && ts !== "TUTORIAL_DONE";
  const tutInteractable = ts === "SOUP_ON_TABLE" || ts === "TOOLTIP_VISIBLE" || ts === "SOUP_AVAILABLE" || ts === "COOKING_CRAFT_READY" || ts === "COOKING_SHARE_EAT";
  const showDlgOverlay = dlgActive || ts === "QUESTION_CHOICE" || ts === "NAME_INPUT";

  // Current dialog line
  const curLine = dlgActive ? dlgLines[dlgIdx] : null;
  const speakerName = curLine
    ? (rupertNamed && curLine.speaker === "Old Innkeeper" ? "Rupert" : curLine.speaker)
    : null;

  function renderSoupInSlot(slotIdx: number) {
    // Post-craft soup stacks are rendered from tableItems so every bowl can own
    // its own gesture. Keep the original renderer exclusively for the Day-1 flow.
    if (ts === "COOKING_SHARE_EAT") return null;

    // Check only if this slot owns the soup — NOT !soupDragging.
    // The GestureDetector must stay mounted throughout the entire drag lifecycle.
    // If we unmount it when soupDragging=true, RNGH loses the gesture mid-drag
    // and onUpdate/onEnd never fire → soup freezes.
    const soupHere = soupSlot === slotIdx;
    if (!soupHere) return null;

    if (tutInteractable && !soupDemoActive) {
      return (
        <GestureDetector gesture={soupGesture}>
          <View style={styles.soupSlotTouch}>
            {/* Image hidden while dragging or during demo — flying overlay takes over visually.
                The GestureDetector wrapper stays mounted so onUpdate/onEnd complete. */}
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

  /** Render a non-soup item that was unpacked from the bag into this slot. */
  function renderTableItemInSlot(slotIdx: number) {
    const item = tableItems[slotIdx];
    if (!item) return null;
    const imgSrc = ITEM_IMAGES[item.id] ?? null;

    const inCookingPhase = ts === "COOKING_UNPACK_WAIT" || ts === "COOKING_CRAFT_READY";
    const isSelectedHerbbag = selectedHerbbagSlot === slotIdx;
    const isSelectedHerbs   = selectedHerbsSlot === slotIdx && item.id === "herbs";
    const isCookingHerbbag  = inCookingPhase && item.id === "herbbag";

    // ── Post-craft soup tutorial ─────────────────────────────────────────────
    // Every bowl/stack is independently draggable. A stack can be split with a tap.
    if (ts === "COOKING_SHARE_EAT" && item.id === "herbsoup") {
      const isBeingDragged = soupDragging && soupSlot === slotIdx;
      const gesture = createCookingSoupGesture(slotIdx, item.quantity);
      return (
        <GestureDetector gesture={gesture}>
          <View style={styles.soupSlotTouch}>
            {!isBeingDragged && imgSrc && (
              <Image source={imgSrc} style={styles.soupInSlotImg} resizeMode="contain" resizeMethod="resize" />
            )}
            {!isBeingDragged && item.quantity > 1 && (
              <Text style={styles.tableItemQty}>{item.quantity}</Text>
            )}
          </View>
        </GestureDetector>
      );
    }

    // ── Craft-phase draggable items ─────────────────────────────────────────
    // Each occupied slot owns its GestureDetector, just like the Day-1 soup.
    // The wrapper remains mounted while the image is hidden during drag.
    const isDraggable = ts === "COOKING_CRAFT_READY";

    if (isDraggable) {
      const isBeingDragged = soupDragging && cookingDragActiveSlot === slotIdx;
      const gesture = createCookingItemGesture(slotIdx, item.id);
      return (
        <GestureDetector gesture={gesture}>
          <View style={styles.soupSlotTouch}>
            {!isBeingDragged && imgSrc && (
              <Image source={imgSrc} style={styles.soupInSlotImg} resizeMode="contain" resizeMethod="resize" />
            )}
            {!isBeingDragged && item.quantity > 1 && (
              <Text style={styles.tableItemQty}>{item.quantity}</Text>
            )}
          </View>
        </GestureDetector>
      );
    }

    // ── Normal / herbbag / herbs tap handler ────────────────────────────────
    function handleCookingTableTap() {
      if (!inCookingPhase) return;
      if (item.id === "herbbag") {
        const remaining = item.containedQuantity ?? 0;
        if (selectedHerbbagSlot === null || selectedHerbbagSlot !== slotIdx) {
          setSelectedHerbbagSlot(slotIdx);
          showCookingTooltip("Herb Bag", "Contains: " + remaining + (remaining === 1 ? " herb" : " herbs"));
        } else {
          unpackOneHerb(slotIdx, item);
          const afterQty = remaining - 1;
          if (afterQty > 0) {
            showCookingTooltip("Herb Bag", "Contains: " + afterQty + (afterQty === 1 ? " herb" : " herbs"));
          } else {
            setTooltipVisible(false);
          }
        }
        return;
      }
      if (item.id === "herbs") {
        if (selectedHerbsSlot === null || selectedHerbsSlot !== slotIdx) {
          // First tap: select and show tooltip
          setSelectedHerbsSlot(slotIdx);
          setSelectedHerbbagSlot(null);
          showCookingTooltip(ITEM_CATALOG["herbs"].name, ITEM_CATALOG["herbs"].description);
        } else {
          // Second tap: split one herb from stack to a free slot
          if (item.quantity <= 1) {
            setSelectedHerbsSlot(null);
            setTooltipVisible(false);
            return;
          }
          const splitTable = tableItems.slice();
          splitTable[slotIdx] = { ...item, quantity: item.quantity - 1 };
          let splitPlaced = false;
          for (let si = 0; si < 12; si++) {
            if (si === slotIdx) continue;
            if (!splitTable[si]) {
              splitTable[si] = { id: "herbs", itemType: "herbs", name: "Herbs", quantity: 1, attributes: ["ingredient"] };
              splitPlaced = true;
              break;
            }
          }
          if (!splitPlaced) { showPlayerBubble('"No free space available."'); return; }
          audioManager.playSoundEffect('moveitem', { maxDurationMs: 3000 });
          setTableItems(splitTable);
          AsyncStorage.setItem(KITCHEN_TABLE_KEY, JSON.stringify(splitTable)).catch(() => {});
          setSelectedHerbsSlot(null);
          setTooltipVisible(false);
          checkCookingProgress(splitTable);
        }
        return;
      }
      // All other table items: show brief tooltip from catalog
      const catalogEntry = ITEM_CATALOG[item.id];
      if (catalogEntry) {
        showCookingTooltip(catalogEntry.name, catalogEntry.description);
      }
    }

    return (
      <Pressable
        style={[
          styles.soupSlotTouch,
          isSelectedHerbbag && { borderWidth: 2, borderColor: "#E8B84B", borderRadius: 6 },
          isSelectedHerbs   && { borderWidth: 2, borderColor: "#7EC87E", borderRadius: 6 },
        ]}
        onPress={inCookingPhase ? handleCookingTableTap : undefined}
        onLongPress={() => setKitchenDetailItem(item)}
        delayLongPress={500}
      >
        <View style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}>
          {imgSrc && (
            <Image source={imgSrc} style={styles.soupInSlotImg} resizeMode="contain" resizeMethod="resize" />
          )}
          {item.quantity > 1 && (
            <Text style={styles.tableItemQty}>{item.quantity}</Text>
          )}
          {isCookingHerbbag && isSelectedHerbbag && (
            <View style={{ position: "absolute", bottom: 2, right: 2, backgroundColor: "#E8B84B", borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1 }}>
              <Text style={{ color: "#2C1810", fontSize: 8, fontWeight: "700" }}>TAP</Text>
            </View>
          )}
          {inCookingPhase && item.id === "herbs" && isSelectedHerbs && item.quantity > 1 && (
            <View style={{ position: "absolute", bottom: 2, right: 2, backgroundColor: "#7EC87E", borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1 }}>
              <Text style={{ color: "#2C1810", fontSize: 8, fontWeight: "700" }}>SPLIT</Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  }


  return (
    <View style={styles.root}>
      {/* ── Hidden portrait preload – forces RN/browser to decode all portrait images
           immediately on mount. Combined with AssetManager preload in game-loading.tsx
           this guarantees zero-delay portrait display. ── */}
      {/* ── Hidden portrait preload – forces RN/browser to decode all portrait images
          and the main item image so that they are in the GPU cache before being
          actually displayed (circle, dialog, detail-modal). */}
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

      {/* ── Background (responsive, no cover zoom) ── */}
      <SceneBackground source={IMG.kitchen} topOffset={headerH} />
      <View style={[StyleSheet.absoluteFill, { top: headerH }, styles.bgOverlay]} />

      {/* ── Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]} onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}>
        <View style={styles.headerTopRow}>
          <View style={styles.leftHeader}>
            {/* Stamina bar */}
            <View style={styles.statBarOuter}>
              <Ionicons name="flash" size={15} color="#C4943A" />
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
              <Text style={styles.statBarText}>{staminaDisplay}/{playerStats.maximumStamina}</Text>
              {/* +20 float */}
              <Animated.View style={[styles.plusFloat, plusFloatStyle]} pointerEvents="none">
                <Text style={styles.plusFloatText}>+20</Text>
              </Animated.View>
            </View>
            {/* Life bar */}
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

      {/* ── Scrollable content */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={{ paddingBottom: 74 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        bounces={false}
        scrollEnabled={!tutActive}
      >
        {/* Portrait row */}
        <View style={styles.portraitRow}>
          <TouchableOpacity ref={playerPortraitRef} style={styles.circleWrap} onPress={() => setStatusOpen(true)} activeOpacity={0.8}>
            <Image source={avatarSrc(staminaCurrent)} style={styles.circleImg} resizeMode="cover" resizeMethod="resize" />
          </TouchableOpacity>
          <View ref={rupertPortraitRef} style={styles.circleWrap}>
            <Image source={rupertSrc(rupertPortrait)} style={styles.circleImg} resizeMode="cover" resizeMethod="resize" />
          </View>
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
        </View>

        {/* Craft grid + Table grid. During COOKING_CRAFT_READY each occupied input slot
             owns its own Pan gesture, matching the reliable Day-1 soup architecture. */}
        {(() => {
          const craftGrid = (
            <View style={styles.gridContainer}>
              <View style={styles.gridRow}>
                {/* Ingredient slots 0-2 */}
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
                        ts === "COOKING_CRAFT_READY" ? (
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
                {/* Tool slot */}
                <View
                  ref={(r) => { craftSlotRefs.current[3] = r; }}
                  style={[styles.craftSlot, styles.craftSlotTool, hoveredSlot === 15 && soupDragging && styles.slotHovered]}
                >
                  {!craftTool && <Ionicons name="hand-right-outline" size={26} color="#8B6914" />}
                  {craftTool && ts === "COOKING_CRAFT_READY" ? (
                    <GestureDetector gesture={createCookingItemGesture(15, craftTool.id)}>
                      <View style={styles.soupSlotTouch}>
                        {!(soupDragging && cookingDragActiveSlot === 15) && ITEM_IMAGES[craftTool.id] && (
                          <Image source={ITEM_IMAGES[craftTool.id]} style={styles.soupInSlotImg} resizeMode="contain" resizeMethod="resize" />
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
                {/* Result / Recipe slot — output only, never a drag target */}
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
                {/* CRAFT button */}
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

      {/* ── Location bar */}
      <View
        style={[styles.locationBar, { paddingBottom: insets.bottom + 4 }]}
        onLayout={(e) => setLocationBarH(e.nativeEvent.layout.height)}
      >
        {LOCS.map((loc) => {
          const isGardenPrompt = ts === "WAITING_FOR_GARDEN_LOCATION_CLICK" || ts === "TUESDAY_KITCHEN_GARDEN_PROMPT";
          const isGardenBtn = loc.id === "garden";
          const isDormBtn = loc.id === "dormitory";
          const enabledInGardenPrompt = isGardenPrompt && isGardenBtn;

          const isEffectivelyActive =
            loc.active ||
            enabledInGardenPrompt ||
            (isGardenBtn && gardenActive) ||
            (isDormBtn && dormitoryUnlocked);

          // Resolve location image (mail has no custom PNG → fallback icon)
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

          // In Tuesday kitchen state, dormitory tap shows thought bubble
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

      {/* ── Flying / dragging item (absolute, always rendered) */}
      <Animated.View style={flyStyle} pointerEvents="none">
        <Image
          source={ITEM_IMAGES[flyingItemId] ?? IMG.herbsoup}
          style={{ width: "100%", height: "100%" }}
          resizeMode="contain"
          resizeMethod="resize"
        />
      </Animated.View>

      {/* ── Item Info Panel (compact, non-modal, above location bar) */}
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

      {/* ── Tutorial blocking overlay (non-interactive states) */}
      {tutActive && !showDlgOverlay && !tutInteractable && ts !== "WAITING_FOR_GARDEN_LOCATION_CLICK" && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-only" />
      )}
      {/* ── Garden prompt dim overlay — visual only, no touch blocking */}
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

      {/* ── Dialog / Question / Name-Input overlay */}
      {showDlgOverlay && (
        <View style={[StyleSheet.absoluteFill, styles.dlgBlocker]}>
          {/* Bottom dialog panel */}
          <View style={[styles.dialogPanel, { paddingBottom: insets.bottom + 18, marginBottom: ts === "NAME_INPUT" && keyboardH > 0 ? keyboardH : 0 }]}>
            {/* Portrait */}
            <View style={styles.dlgPortraitWrap}>
              <Image
                source={
                  curLine?.portrait === "player"
                    ? avatarSrc(staminaCurrent)
                    : rupertSrc(rupertPortrait)
                }
                style={styles.dlgPortrait}
                resizeMode="cover" resizeMethod="resize"
               
              />
            </View>

            {/* NAME INPUT state */}
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

            {/* QUESTION CHOICE state */}
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

            {/* Normal dialog lines */}
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

      {/* ── Context Speech Bubble */}
      {bubble && (() => {
        const rupertL = layouts.current.rupert;
        // Position just below portraits (rupertL.y + rupertL.h gives portrait bottom in window)
        const bubbleTopPos = rupertL
          ? rupertL.y + rupertL.h + 8
          : (headerH > 0 ? headerH + 128 : insets.top + 190);
        const arrowCenterX = rupertL ? rupertL.x + rupertL.w / 2 : W * 0.5;
        // Width: ~68% of screen, right-biased so it doesn't overlap left table slots
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
            // Fullscreen dismiss backdrop (behind bubble, but global dismiss via Pressable)
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

        // BLOCK_ALL or LOCK_TUTORIAL — absorb all touches, global tap dismisses
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

      {/* ── Demo soup animation overlay (above bubble, zIndex 402) */}
      {soupDemoActive && (
        <Animated.View style={demoStyle} pointerEvents="none">
          <Image source={require("../assets/images/herbsoup.png")} style={{ width: 56, height: 56 }} resizeMode="contain" resizeMethod="resize" />
        </Animated.View>
      )}

      {/* ── Menu Modal */}
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

      {/* ── Logbook Modal */}
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

      {/* ── Recipes Modal */}
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

      {/* ── Player Bag */}
      <PlayerBag
        bag={playerBag}
        visible={bagOpen}
        context="kitchen"
        dayIdx={dayIdx}
        onClose={() => setBagOpen(false)}
        onTransferItem={(bagSlotIdx, item) => handleBagToTable(bagSlotIdx, item)}
      />

      {/* ── Kitchen detail modal (long press on table items) */}
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

      {/* ── Status Modal */}
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

      {/* ── Player thought bubble */}
      {playerBubble && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 410 }]} pointerEvents="none">
          <View style={{ position: "absolute", top: headerH + 130, left: 10, right: Math.max(10, W - Math.min(W * 0.75, 420) - 10) }}>
            <View style={styles.playerBubbleArrow} />
            <View style={styles.playerBubbleCard}>
              <Text style={styles.playerBubbleText}>{playerBubble}</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0500", position: "relative" },
  bgOverlay: { backgroundColor: "rgba(0,0,0,0.28)", zIndex: 0, pointerEvents: "none" as "none" },

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
    position: "absolute", right: -8, top: -20,
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

  // Grid
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

  // Detail modal
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

  // Soup in slot
  soupSlotTouch: { width: "80%", height: "80%", alignItems: "center", justifyContent: "center" },
  soupInSlotImg: { width: "100%", height: "100%" },

  // Location bar
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

  // Item Info Panel (non-modal, compact, above location bar)
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

  // Drop-zone highlight: bright border + subtle glow when dragging item over valid slot
  slotHovered: {
    borderColor: "rgba(255,255,220,0.95)",
    borderWidth: 2.5,
    backgroundColor: "rgba(255,255,200,0.12)",
  },

  // Dialog overlay
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

  // Modals
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

  // Context Speech Bubble
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
  // Player thought bubble
  playerBubbleArrow: {
    width: 0, height: 0,
    borderLeftWidth: 8, borderRightWidth: 8, borderBottomWidth: 10,
    borderLeftColor: "transparent", borderRightColor: "transparent",
    borderBottomColor: "rgba(30,18,5,0.9)",
    marginLeft: 16,
  },
  playerBubbleCard: {
    backgroundColor: "rgba(30,18,5,0.9)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(196,148,58,0.4)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: "flex-start" as const,
    maxWidth: "100%",
  },
  playerBubbleText: {
    color: "#F0E8D5",
    fontSize: 13,
    fontStyle: "italic",
    lineHeight: 18,
  },
});
