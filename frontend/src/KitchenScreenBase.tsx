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
import {
  guestTutorialHasReached,
  guestTutorialKeepsRupertInDining,
  loadGuestTutorialIntroStep,
  saveGuestTutorialIntroStep,
} from "@/src/game/guest-tutorial";
import { ensureAssetReady } from "@/src/assets/AssetManager";
import {
  DEFAULT_POST_GUEST_TUTORIAL_STATE,
  SECOND_PLOT_STONE_COST,
  SECOND_PLOT_WOOD_COST,
  grantFarmerCarrotSeedOnce,
  loadPostGuestTutorialState,
  markSecondPlotThoughtSeen,
  markUpgradeIntroSeen,
  purchaseSecondPlotUpgrade,
  type PostGuestTutorialState,
} from "@/src/game/post-guest-tutorial";
import {
  SHARED_RESOURCE_DEFAULTS,
  SHARED_RESOURCES_KEY,
  type SharedResources,
} from "@/src/game/shared-resources";
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
  | "COOKING_DONE"
  | "WAITING_FOR_DINING_LOCATION_CLICK";

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
  carrotbag:   require("../assets/images/carrotbag.png"),
  carrot:      require("../assets/images/carrot.png"),
  herbsoup:    require("../assets/images/herbsoup.png"),
  bucket:      require("../assets/images/bucket.png"),
  bucketwater: require("../assets/images/bucketwater.png"),
  seed_herb:   require("../assets/images/herbseed.png"),
  herbs:       require("../assets/images/herbs.png"),
  oldpot:      require("../assets/images/oldpot.png"),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Dialog data (modal story only) ───────────────────────────────────────────

const D_UPGRADE_INTRO: DLine[] = [
  { id: "d_upgrade.0", speaker: "Rupert", portrait: "laugh", text: '"You handled your first guest well."' },
  { id: "d_upgrade.1", speaker: "Rupert", portrait: "normal", text: '"You can always talk to me if you want to change something."' },
  { id: "d_upgrade.2", speaker: "Rupert", portrait: "normal", text: '"If we have more mouths to feed, we need a second garden bed."' },
];

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

  // Restore the Kitchen theme whenever this retained stack screen regains focus.
  useFocusEffect(
    React.useCallback(() => {
      crossfadeTo('kitchen', 3000);
    }, [crossfadeTo]),
  );

  // ── Menu modals
  const [showMenu, setShowMenu] = useState(false);
  const [showRecipes, setShowRecipes] = useState(false);
  const [showUpgrades, setShowUpgrades] = useState(false);
  const [upgradeBusy, setUpgradeBusy] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null);
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
  const [diningUnlocked, setDiningUnlocked] = useState(false);
  const [coreTravelUnlocked, setCoreTravelUnlocked] = useState(false);
  const playerNameRef = useRef("Adventurer");
  const [rupertPortrait, setRupertPortrait] = useState<"normal" | "sad" | "laugh">("normal");
  // Start hidden until persisted placement is resolved. This prevents a one-frame
  // Rupert flash when Kitchen regains focus during the guest-service sequence.
  const [rupertInDining, setRupertInDining] = useState(true);
  const [postGuestState, setPostGuestState] = useState<PostGuestTutorialState>(DEFAULT_POST_GUEST_TUTORIAL_STATE);
  const [sharedResources, setSharedResources] = useState<SharedResources>({ ...SHARED_RESOURCE_DEFAULTS });
  const postGuestIntroStartedRef = useRef(false);
  const focusCountRef = useRef(0);
  // ── Bag & Stats
  const [playerBag, setPlayerBag] = useState<PlayerBagData>(DEFAULT_BAG);
  const playerBagRef = useRef<PlayerBagData>(DEFAULT_BAG);
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
  const cookingTutorialCompletedRef = useRef(false);
  const [selectedHerbbagSlot, setSelectedHerbbagSlot] = useState<number | null>(null);
  const [selectedCarrotbagSlot, setSelectedCarrotbagSlot] = useState<number | null>(null);
  const [selectedHerbsSlot, setSelectedHerbsSlot] = useState<number | null>(null);
  const [selectedSoupSlot, setSelectedSoupSlot] = useState<number | null>(null);
  const [bagPulseActive, setBagPulseActive] = useState(false);
  const bagOpenedOnceDuringCooking = useRef(false);
  const cookingShareDoneRef = useRef(false);
  const cookingEatDoneRef = useRef(false);
  const [flyingItemId, setFlyingItemId] = useState<string>("herbsoup");
  // Refs to pass table state safely into Reanimated worklet callbacks
  const cookingFlyTargetSlot = useRef<number>(-1);
  const cookingPendingTable  = useRef<(BagItem | null)[]>([]);
  const craftFlightOutputs = useRef<BagItem[]>([]);
  const craftFlightTargetSlots = useRef<number[]>([]);
  const craftFlightTable = useRef<(BagItem | null)[]>([]);
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
  const soupReturnTargetSlotRef = useRef(0);
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
    const thought = text.trim().replace(/^["“”]+|["“”]+$/g, "");
    setPlayerBubble(thought);
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
  const [bagDropHovered, setBagDropHovered] = useState(false);
  const bagDropHoveredRef = useRef(false);

  // ── Stamina animation counter timer
  const staminaCountTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasNavigatedToGardenRef = useRef(false);
  const hasNavigatedToDiningRef = useRef(false);

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
  const diningPulse  = useSharedValue(1);

  // ── Layout measurement refs (declared early: used in cookingTablePanGesture worklet below) ──
  const rootRef            = useRef<View>(null);
  const playerPortraitRef  = useRef<View>(null);
  const rupertPortraitRef  = useRef<View>(null);
  const bagIconRef         = useRef<View>(null);
  const tableSlotRefs      = useRef<(View | null)[]>(Array(12).fill(null));
  const craftSlotRefs = useRef<(View | null)[]>(Array(4).fill(null));  // 0-2 ingredients, 3 = tool
  const craftResultSlotRef = useRef<View>(null);
  const layouts = useRef<{
    player: LRect | null; rupert: LRect | null; bag: LRect | null;
    tableSlots: (LRect | null)[]; craftSlots: (LRect | null)[];
  }>({ player: null, rupert: null, bag: null, tableSlots: Array(12).fill(null), craftSlots: Array(4).fill(null) });

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
  const diningPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: diningPulse.value }],
  }));

  // ─────────────────────────────────────────────────────────────────────────
  // Sync tsRef with state
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => { tsRef.current = ts; }, [ts]);
  // Sync staminaMaxSV when playerStats.maximumStamina changes (e.g. after Status upgrade)
  useEffect(() => { staminaMaxSV.value = playerStats.maximumStamina; }, [playerStats.maximumStamina]); // eslint-disable-line react-hooks/exhaustive-deps
  // Sync bag/table refs so drag callbacks always read current contents
  useEffect(() => { playerBagRef.current = playerBag; }, [playerBag]);
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

  // Dining gets its own story pulse after the knock/Rupert prompt.
  useEffect(() => {
    if (ts === "WAITING_FOR_DINING_LOCATION_CLICK") {
      diningPulse.value = withRepeat(withTiming(1.06, { duration: 700 }), -1, true);
    } else {
      cancelAnimation(diningPulse);
      diningPulse.value = withTiming(1, { duration: 200 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ts]);

  // Resume the small Kitchen side of the guest intro after an app restart.
  useEffect(() => {
    if (ts !== "IDLE") return;
    let active = true;
    (async () => {
      const cookingDone = await AsyncStorage.getItem(SK.COOKING_DONE);
      cookingTutorialCompletedRef.current = cookingDone === "true";
      if (cookingDone !== "true") {
        if (active) setRupertInDining(false);
        return;
      }
      const step = await loadGuestTutorialIntroStep();
      if (!active || tsRef.current !== "IDLE") return;
      setDiningUnlocked(guestTutorialHasReached(step, "dining_prompt"));
      setCoreTravelUnlocked(guestTutorialHasReached(step, "service_complete"));
      setRupertInDining(guestTutorialKeepsRupertInDining(step));
      if (step === "service_complete") {
        void maybeStartPostGuestUpgradeIntro(300);
      }
      if (step === "not_started" || step === "knock") {
        void startGuestTutorialIntro();
      } else if (step === "dining_prompt") {
        setTutState("WAITING_FOR_DINING_LOCATION_CLICK");
      }
    })().catch(() => {});
    return () => { active = false; };
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
        const initialCookingDone = await AsyncStorage.getItem(SK.COOKING_DONE);
        cookingTutorialCompletedRef.current = initialCookingDone === "true";
        if (initialCookingDone === "true") {
          const initialGuestStep = await loadGuestTutorialIntroStep();
          setDiningUnlocked(guestTutorialHasReached(initialGuestStep, "dining_prompt"));
          setCoreTravelUnlocked(guestTutorialHasReached(initialGuestStep, "service_complete"));
          setRupertInDining(guestTutorialKeepsRupertInDining(initialGuestStep));
        } else {
          setRupertInDining(false);
        }
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
              cookingTutorialCompletedRef.current = initCookingDone === "true";
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

  async function refreshPostGuestResources() {
    const state = await loadPostGuestTutorialState();
    setPostGuestState(state);
    const rawResources = await AsyncStorage.getItem(SHARED_RESOURCES_KEY);
    if (rawResources) {
      try { setSharedResources({ ...SHARED_RESOURCE_DEFAULTS, ...JSON.parse(rawResources) }); }
      catch { setSharedResources({ ...SHARED_RESOURCE_DEFAULTS }); }
    } else {
      setSharedResources({ ...SHARED_RESOURCE_DEFAULTS });
    }
    return state;
  }

  async function maybeStartPostGuestUpgradeIntro(delayMs = 300): Promise<boolean> {
    if (tsRef.current !== "IDLE" || postGuestIntroStartedRef.current) return false;
    const guestStep = await loadGuestTutorialIntroStep();
    if (guestStep !== "service_complete") return false;

    // Migration-safe: an already completed Part 10 save still receives the gift once.
    await grantFarmerCarrotSeedOnce();
    let state = await refreshPostGuestResources();
    if (!state.secondPlotThoughtSeen) {
      showPlayerBubble('"I could use a second garden bed for the carrot seed."');
      state = await markSecondPlotThoughtSeen();
      setPostGuestState(state);
      delayMs = Math.max(delayMs, 2900);
    }
    if (state.upgradeIntroSeen) return false;

    postGuestIntroStartedRef.current = true;
    setTimeout(() => {
      if (tsRef.current !== "IDLE") {
        postGuestIntroStartedRef.current = false;
        return;
      }
      showDialog(D_UPGRADE_INTRO, async () => {
        const next = await markUpgradeIntroSeen();
        setPostGuestState(next);
        postGuestIntroStartedRef.current = false;
      });
    }, delayMs);
    return true;
  }

  async function handleRupertUpgradeTap() {
    if (rupertInDining || !postGuestState.upgradeIntroSeen || dlgActive) return;
    await refreshPostGuestResources();
    setUpgradeMessage(null);
    setShowUpgrades(true);
  }

  async function handleSecondPlotUpgrade() {
    if (upgradeBusy || postGuestState.secondPlotUnlocked) return;
    setUpgradeBusy(true);
    setUpgradeMessage(null);
    try {
      const result = await purchaseSecondPlotUpgrade();
      setPostGuestState(result.state);
      setSharedResources(result.resources);
      if (!result.ok) {
        setUpgradeMessage("Need 4 Wood and 4 Stone.");
      } else if (result.alreadyUnlocked) {
        setUpgradeMessage("Already unlocked.");
      } else {
        setUpgradeMessage("2nd Plot unlocked.");
        audioManager.playSoundEffect("bling", { maxDurationMs: 2000 });
      }
    } finally {
      setUpgradeBusy(false);
    }
  }

  /** Start the Day-2 Kitchen prompt once the Kitchen is in a stable IDLE state. */
  async function maybeStartTuesdayMorningTutorial(delayMs = 600): Promise<boolean> {
    if (tsRef.current !== "IDLE") return false;

    const [tuesdayShown, rawDay2, firstSleepDone] = await Promise.all([
      AsyncStorage.getItem(SK.TUESDAY_MORNING_SHOWN),
      AsyncStorage.getItem(SK.DAY_INDEX),
      AsyncStorage.getItem(SK.FIRST_SLEEP_DONE),
    ]);
    const currentDay = rawDay2 ? parseInt(rawDay2, 10) : 0;
    if (firstSleepDone !== "true" || currentDay < 1 || tuesdayShown === "true") return false;

    // Persist before presenting the prompt so a second focus cannot start it twice.
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

  // Return-from-screen: refresh stats and detect post-garden dialog
  useFocusEffect(
    React.useCallback(() => {
      focusCountRef.current += 1;
      // Reset navigation guards so rooms can be re-entered after returning.
      hasNavigatedToGardenRef.current = false;
      hasNavigatedToDiningRef.current = false;
      if (focusCountRef.current <= 1) return; // Skip initial mount (handled by useEffect above)

      (async () => {
        try {
          const guestStep = await loadGuestTutorialIntroStep();
setDiningUnlocked(guestTutorialHasReached(guestStep, "dining_prompt"));
setCoreTravelUnlocked(guestTutorialHasReached(guestStep, "service_complete"));
setRupertInDining(guestTutorialKeepsRupertInDining(guestStep));

const cur = tsRef.current;
if (cur !== "IDLE") return; // Navigation was refreshed; leave active gameplay state untouched.

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

          if (guestStep === "service_complete") {
            if (await maybeStartPostGuestUpgradeIntro(250)) return;
          }

          // Tuesday morning prompt also runs on the initial Kitchen mount via the same helper.
          if (await maybeStartTuesdayMorningTutorial(600)) return;

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
            const cookingAlreadyDone = await AsyncStorage.getItem(SK.COOKING_DONE);
            cookingTutorialCompletedRef.current = cookingAlreadyDone === "true";
            // Fallback: auto-detect readiness directly from inventory
            // (handles Android back button, stale garden state, any navigation path)
            if (craftingReady !== "true" && cookingAlreadyDone !== "true") {
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
            if (craftingReady === "true" && cookingAlreadyDone !== "true" && tsRef.current !== "CRAFTING_TUTORIAL_READY") {
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
    bagIconRef.current?.measureInWindow((x, y, w, h) => {
      layouts.current.bag = { x, y, w, h };
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

  type RootCenter = { x: number; y: number; w: number; h: number };

  /**
   * The shared flying overlay is positioned relative to the Kitchen root.
   * measureInWindow values are still cached for pointer hit-testing, while
   * automatic flights use this root-local center to avoid safe-area offsets.
   */
  function measureCenterInRoot(
    view: View | null,
    fallback: LRect | null,
    onMeasured: (center: RootCenter | null) => void,
  ) {
    const root = rootRef.current;
    const fallbackToCachedRect = () => {
      if (!fallback) {
        onMeasured(null);
        return;
      }
      const finish = (rootX: number, rootY: number) => {
        onMeasured({
          x: fallback.x + fallback.w / 2 - rootX,
          y: fallback.y + fallback.h / 2 - rootY,
          w: fallback.w,
          h: fallback.h,
        });
      };
      if (root) root.measureInWindow((rootX, rootY) => finish(rootX, rootY));
      else finish(0, 0);
    };

    if (!view || !root) {
      fallbackToCachedRect();
      return;
    }

    view.measureLayout(
      root,
      (x, y, w, h) => onMeasured({ x: x + w / 2, y: y + h / 2, w, h }),
      fallbackToCachedRect,
    );
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
    measureCenterInRoot(
      rupertPortraitRef.current,
      layouts.current.rupert,
      (from) => {
        measureCenterInRoot(
          tableSlotRefs.current[0],
          layouts.current.tableSlots[0],
          (to) => {
            if (!from || !to) {
              onSoupLanded();
              return;
            }

            if (to.w > 0) soupFlySize.value = to.w * 0.80;
            soupX.value = from.x;
            soupY.value = from.y;
            soupScale.value = 1;
            soupVis.value = withTiming(1, { duration: 180 });
            soupX.value = withTiming(to.x, { duration: FLY_MS });
            soupY.value = withTiming(to.y, { duration: FLY_MS }, (done) => {
              if (done) runOnJS(onSoupLanded)();
            });
          },
        );
      },
    );
  }

  function onSoupLanded() {
    // Commit the centered slot image first, then fade the overlay above it.
    // This avoids the empty frame and visible jump seen on Android/Expo Go.
    setSoupSlot(0);
    soupSlotRef.current = 0;
    setTutState("SOUP_AVAILABLE");
    requestAnimationFrame(() => {
      soupVis.value = withTiming(0, { duration: 120 });
    });
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

    // Selection belongs to the item, never to the physical slot it used to occupy.
    setSelectedSoupSlot(null);
    setSelectedHerbbagSlot(null);
    setSelectedHerbsSlot(null);
    setTooltipVisible(false);

    setSoupSlot(sourceSlot);
    soupSlotRef.current = sourceSlot;
    setCookingDragActiveSlot(-1);
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
    if (!isKitchenItemInteractionState(tsRef.current)) return;
    const shareTutorial = tsRef.current === "COOKING_SHARE_EAT";
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
    if (shareTutorial) {
      setSoupSlot(sourceSlot);
      soupSlotRef.current = sourceSlot;
    }
    AsyncStorage.setItem(KITCHEN_TABLE_KEY, JSON.stringify(newTable)).catch(() => {});
    audioManager.playSoundEffect('moveitem', { maxDurationMs: 3000 });
    setSelectedSoupSlot(null);
    setTooltipVisible(false);

    if (shareTutorial) {
      showBubble(
        '\"That smells delicious. Please pass me a bowl and dig in, too.\"',
        "Rupert", "ALLOW_ITEM", null, () => {}, "bubble.cooking.share_after_split",
      );
    }
  }

  function handleCookingSoupTap(sourceSlot: number) {
    if (!isKitchenItemInteractionState(tsRef.current)) return;
    const stack = tableItemsRef.current[sourceSlot];
    if (!stack || stack.id !== "herbsoup") return;

    if (selectedSoupSlot !== sourceSlot) {
      setSelectedSoupSlot(sourceSlot);
      setSelectedHerbbagSlot(null);
      setSelectedHerbsSlot(null);
      const catalogEntry = ITEM_CATALOG["herbsoup"];
      showCookingTooltip(catalogEntry?.name ?? "Herb Soup", catalogEntry?.description ?? "Restores 20 Stamina.");
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
        // Day-1 Herb Soup may be moved into ingredient slots 0-2 only.
        // The Tool slot is not a valid destination for this tutorial item.
        for (let i = 0; i < 3; i++) {
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

  function firstFreeTableSlotForReturnedSoup() {
    const freeSlot = tableItemsRef.current.findIndex((item) => item === null);
    if (freeSlot >= 0) return freeSlot;
    const currentSlot = soupSlotRef.current;
    return currentSlot !== null && currentSlot < 12 ? currentSlot : 0;
  }

  function holdSoupAtRupert() {
    measureCenterInRoot(
      rupertPortraitRef.current,
      layouts.current.rupert,
      (center) => {
        if (!center) return;
        soupX.value = center.x;
        soupY.value = center.y;
        soupScale.value = 1;
        soupVis.value = withTiming(1, { duration: 120 });
      },
    );
  }

  function onDropOnRupert() {
    // Keep the source slot hidden for the complete rejection/return sequence.
    // endDragClean() would set soupDragging=false and create the duplicate bowl.
    setSoupDragging(true);
    hoveredSlotRef.current = null;
    setHoveredSlot(null);
    soupVis.value = withTiming(0, { duration: 100 }, (done) => {
      if (done) runOnJS(holdSoupAtRupert)();
    });

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
    const targetSlot = firstFreeTableSlotForReturnedSoup();
    soupReturnTargetSlotRef.current = targetSlot;
    setSoupDragging(true);

    measureCenterInRoot(
      rupertPortraitRef.current,
      layouts.current.rupert,
      (from) => {
        measureCenterInRoot(
          tableSlotRefs.current[targetSlot],
          layouts.current.tableSlots[targetSlot],
          (to) => {
            if (!from || !to) {
              onSoupReturned(targetSlot);
              return;
            }

            if (to.w > 0) soupFlySize.value = to.w * 0.80;
            soupX.value = from.x;
            soupY.value = from.y;
            soupScale.value = 1;
            soupVis.value = 1;
            soupX.value = withTiming(to.x, { duration: RETURN_MS });
            soupY.value = withTiming(to.y, { duration: RETURN_MS }, (done) => {
              if (done) runOnJS(onSoupReturned)(targetSlot);
            });
          },
        );
      },
    );
  }

  function onSoupReturned(targetSlot = soupReturnTargetSlotRef.current) {
    // Restore exactly one centered slot image before removing the fly overlay.
    setSoupSlot(targetSlot);
    soupSlotRef.current = targetSlot;
    setSoupDragging(false);
    setTutState("SOUP_ON_TABLE");
    requestAnimationFrame(() => {
      soupVis.value = withTiming(0, { duration: 120 });
    });
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

  async function handleDiningTap() {
    if (tsRef.current !== "WAITING_FOR_DINING_LOCATION_CLICK") return;
    if (hasNavigatedToDiningRef.current) return;
    hasNavigatedToDiningRef.current = true;
    cancelAnimation(diningPulse);
    diningPulse.value = withTiming(1, { duration: 150 });
    dismissBubbleNoCallback();
    await saveGuestTutorialIntroStep("dining_intro").catch(() => {});
    setTutState("IDLE");
    audioManager.playSoundEffect('footstep', { maxDurationMs: 4000 });
    router.push("/dining");
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
    // The Player Bag pulse belongs only to the original bag-receiving tutorial.
    // Cooking may ask the player to open it, but must not reintroduce that pulse.
    setBagPulseActive(false);
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

  function isKitchenItemInteractionState(state: TState) {
    return state === "IDLE" ||
      state === "COOKING_UNPACK_WAIT" ||
      state === "COOKING_CRAFT_READY" ||
      state === "COOKING_SHARE_EAT" ||
      state === "COOKING_DONE";
  }

  function canUseRecipeSlots(state: TState) {
    return state === "COOKING_CRAFT_READY" ||
      (cookingTutorialCompletedRef.current && (state === "IDLE" || state === "COOKING_DONE"));
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

  /** Split one harvested bag from a compatible stack before it can be unpacked. */
  function splitHarvestBag(slot: number, bag: BagItem) {
    if (bag.quantity <= 1) return;
    const splitTable = tableItemsRef.current.slice();
    const splitSlot = splitTable.findIndex((entry, index) => index !== slot && entry === null);
    if (splitSlot < 0) {
      showPlayerBubble('"No free space available."');
      return;
    }

    splitTable[slot] = { ...bag, quantity: bag.quantity - 1 };
    splitTable[splitSlot] = { ...bag, quantity: 1 };
    tableItemsRef.current = splitTable;
    setTableItems(splitTable);
    AsyncStorage.setItem(KITCHEN_TABLE_KEY, JSON.stringify(splitTable)).catch(() => {});
    audioManager.playSoundEffect('moveitem', { maxDurationMs: 3000 });

    const contents = bag.containedQuantity ?? 0;
    const itemName = bag.id === "herbbag" ? "Herb Bag" : "Carrot Bag";
    const itemLabel = bag.id === "herbbag" ? "herb" : "carrot";
    if (bag.id === "herbbag") {
      setSelectedHerbbagSlot(splitSlot);
      setSelectedCarrotbagSlot(null);
    } else {
      setSelectedCarrotbagSlot(splitSlot);
      setSelectedHerbbagSlot(null);
    }
    showCookingTooltip(itemName, "Contains: " + contents + (contents === 1 ? " " + itemLabel : " " + itemLabel + "s"));
  }

  function handleCookingItemTap(slot: number) {
    const item = getCookingItemAtSlot(slot);
    if (!item) return;
    const cur = tsRef.current;
    const onTable = slot <= 11;

    // Herb Bag stays a usable container after the tutorial: first tap selects it,
    // every following tap unpacks one herb while normal Kitchen interaction is allowed.
    if (onTable && item.id === "herbbag" && isKitchenItemInteractionState(cur)) {
      const remaining = item.containedQuantity ?? 0;
      if (selectedHerbbagSlot === null || selectedHerbbagSlot !== slot) {
        setSelectedHerbbagSlot(slot);
        setSelectedCarrotbagSlot(null);
        setSelectedHerbsSlot(null);
        setSelectedSoupSlot(null);
        showCookingTooltip("Herb Bag", "Contains: " + remaining + (remaining === 1 ? " herb" : " herbs"));
      } else {
        if (item.quantity > 1) {
          splitHarvestBag(slot, item);
          return;
        }
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

    // Carrot Bag mirrors Herb Bag exactly: select first, then unpack one carrot per tap.
    if (onTable && item.id === "carrotbag" && isKitchenItemInteractionState(cur)) {
      const remaining = item.containedQuantity ?? 0;
      if (selectedCarrotbagSlot === null || selectedCarrotbagSlot !== slot) {
        setSelectedCarrotbagSlot(slot);
        setSelectedHerbbagSlot(null);
        setSelectedHerbsSlot(null);
        setSelectedSoupSlot(null);
        showCookingTooltip("Carrot Bag", "Contains: " + remaining + (remaining === 1 ? " carrot" : " carrots"));
      } else {
        if (item.quantity > 1) {
          splitHarvestBag(slot, item);
          return;
        }
        unpackOneCarrot(slot, item);
        const afterQty = remaining - 1;
        if (afterQty > 0) {
          showCookingTooltip("Carrot Bag", "Contains: " + afterQty + (afterQty === 1 ? " carrot" : " carrots"));
        } else {
          setTooltipVisible(false);
        }
      }
      return;
    }

    // Herb Soup follows the same select-then-split interaction as Herbs.
    if (onTable && item.id === "herbsoup" && isKitchenItemInteractionState(cur)) {
      handleCookingSoupTap(slot);
      return;
    }

    // Herbs use the same select-then-split interaction whenever they are on the Table.
    if (onTable && item.id === "herbs" && isKitchenItemInteractionState(cur)) {
      if (selectedHerbsSlot === null || selectedHerbsSlot !== slot) {
        setSelectedHerbsSlot(slot);
        setSelectedHerbbagSlot(null);
        setSelectedCarrotbagSlot(null);
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

  /** Update hovered slot during a generic kitchen item drag. */
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

    // Ingredient slots stay available for normal cooking after the tutorial.
    if (canUseRecipeSlots(cur)) {
      for (let i = 0; i < 3; i++) {
        if (12 + i === srcSlot) continue;
        if (lcs[i] && inRect(itemX, itemY, lcs[i]!)) { next = 12 + i; break; }
      }
    }
    // Once crafting is finished (and in normal Kitchen IDLE), the Tool slot remains a
    // normal movable slot, but ingredient slots do not silently re-enable crafting.
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

  /** Begin a generic kitchen drag whose source slot is already known. */
  function onCookingDragStarted(slotIdx: number, itemId: string, absX: number, absY: number) {
    const cur = tsRef.current;
    if (!isKitchenItemInteractionState(cur)) return;
    if (cur === "COOKING_UNPACK_WAIT" && slotIdx > 11) return;

    // Tap-selection is transient. Once an item moves, no later occupant of that
    // physical slot may inherit the old yellow/green selection frame.
    setSelectedHerbbagSlot(null);
    setSelectedCarrotbagSlot(null);
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

    // Keep the source visible until React has committed the new overlay image.
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

  /**
   * Every generic Kitchen item uses the same interaction contract:
   * drag, long-press details, and short-tap item action/info.
   */
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
        // Keep the shared overlay hidden until JS has switched to this exact item.
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
    if (canUseRecipeSlots(tsRef.current)) {
      setTimeout(updateCraftResultPreview, 50);
    }
  }

  /** Consume exactly one Herb Soup serving during normal post-tutorial play. */
  async function consumeHerbSoupNormally(srcSlot: number, absX: number, absY: number) {
    if (inputLocked.current) return;
    const item = getCookingItemAtSlot(srcSlot);
    if (!item || item.id !== "herbsoup") return;

    inputLocked.current = true;
    const remainingQty = Math.max(0, item.quantity - 1);
    const replacement: BagItem | null = remainingQty > 0 ? { ...item, quantity: remainingQty } : null;

    const nextTable = tableItemsRef.current.slice();
    const nextIngredients = craftIngSlotsRef.current.slice() as (BagItem | null)[];
    let nextTool = craftToolRef.current;

    if (srcSlot <= 11) nextTable[srcSlot] = replacement;
    else if (srcSlot <= 14) nextIngredients[srcSlot - 12] = replacement;
    else if (srcSlot === 15) nextTool = replacement;
    else {
      inputLocked.current = false;
      return;
    }

    tableItemsRef.current = nextTable;
    craftIngSlotsRef.current = nextIngredients;
    craftToolRef.current = nextTool;
    setTableItems(nextTable);
    setCraftIngSlots(nextIngredients);
    setCraftTool(nextTool);
    setSelectedSoupSlot(null);
    setTooltipVisible(false);

    await Promise.all([
      AsyncStorage.setItem(KITCHEN_TABLE_KEY, JSON.stringify(nextTable)),
      AsyncStorage.setItem(SK.CRAFT_INGREDIENTS, JSON.stringify(nextIngredients)),
      AsyncStorage.setItem(SK.CRAFT_TOOL_SLOT, JSON.stringify(nextTool)),
    ]).catch(() => {});

    audioManager.playSoundEffect('eat', { maxDurationMs: 4000 });
    setFlyingItemId("herbsoup");
    const player = layouts.current.player;
    const toX = player ? player.x + player.w / 2 : absX;
    const toY = player ? player.y + player.h / 2 : absY;
    soupX.value = absX;
    soupY.value = absY;
    soupScale.value = 1;
    soupVis.value = 1;
    soupX.value = withTiming(toX, { duration: CONSUME_MS });
    soupY.value = withTiming(toY, { duration: CONSUME_MS });
    soupScale.value = withTiming(0.1, { duration: CONSUME_MS });
    soupVis.value = withTiming(0, { duration: CONSUME_MS }, (done) => {
      if (done) runOnJS(onNormalSoupConsumed)();
    });

    const oldSta = staminaCurrent;
    const newSta = Math.min(oldSta + 20, playerStats.maximumStamina);
    setStaminaCurrent(newSta);
    staminaSV.value = withTiming(newSta, { duration: STA_MS });
    AsyncStorage.setItem(SK.STAMINA, String(newSta)).catch(() => {});

    const gained = Math.max(0, newSta - oldSta);
    if (gained > 0) {
      plusY.value = 0;
      plusOp.value = 0;
      plusOp.value = withTiming(1, { duration: FLOAT_FADE_IN_MS });
      plusY.value = withTiming(-FLOAT_RISE_PX, { duration: FLOAT_MS });
      setTimeout(() => {
        plusOp.value = withTiming(0, { duration: FLOAT_FADE_OUT_MS });
      }, FLOAT_MS - FLOAT_FADE_OUT_MS);

      const steps = 20;
      const stepMs = STA_MS / steps;
      let count = 0;
      staminaCountTimer.current = setInterval(() => {
        count++;
        const value = Math.round(oldSta + ((newSta - oldSta) * count) / steps);
        setStaminaDisplay(Math.min(value, newSta));
        if (count >= steps) {
          clearInterval(staminaCountTimer.current!);
          setStaminaDisplay(newSta);
        }
      }, stepMs);
    } else {
      setStaminaDisplay(newSta);
    }

    if (canUseRecipeSlots(tsRef.current)) setTimeout(updateCraftResultPreview, 50);
  }

  function onNormalSoupConsumed() {
    inputLocked.current = false;
    setSoupDragging(false);
  }

  /** Drop a generic Kitchen item. Source is supplied by the item's own GestureDetector. */
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

    const draggedItem = getCookingItemAtSlot(srcSlot);
    const playerRect = layouts.current.player;
    if (rupertInDining && draggedItem?.id === "herbsoup" && playerRect && inRect(absX, absY, playerRect)) {
      showPlayerBubble('"I need to cook herb soup for the guest."');
      return;
    }
    if (!rupertInDining && draggedItem?.id === "herbsoup" && playerRect && inRect(absX, absY, playerRect)) {
      void consumeHerbSoupNormally(srcSlot, absX, absY);
      return;
    }

    const bagRect = layouts.current.bag;
    if (playerBagRef.current.unlocked && bagRect && inExpandedRect(absX, absY, bagRect)) {
      void returnCookingItemToBag(srcSlot);
      return;
    }

    const lcs = layouts.current.craftSlots;
    const lts = layouts.current.tableSlots;
    let destSlot = -1;

    // Ingredient slots remain valid destinations after the tutorial for normal cooking.
    if (canUseRecipeSlots(cur)) {
      for (let i = 0; i < 3; i++) {
        if (lcs[i] && inRect(absX, absY, lcs[i]!)) { destSlot = 12 + i; break; }
      }
    }
    // Tool is available after Rupert introduces it, including after crafting / normal IDLE.
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

    // Kitchen Table stacks merge when the dragged item is dropped onto a
    // compatible table stack. Recipe Ingredient/Tool slots intentionally keep
    // their existing swap behavior so crafting semantics do not change here.
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
      // Non-compatible items keep the established drag-and-drop swap behavior.
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
    if (canUseRecipeSlots(cur)) setTimeout(updateCraftResultPreview, 50);
    if (cur === "COOKING_UNPACK_WAIT") checkCookingProgress(newTable);
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

  /** Unpack one carrot from carrotbag on the table. */
  function unpackOneCarrot(carrotbagSlot: number, carrotbag: BagItem) {
    const qty = carrotbag.containedQuantity ?? 0;
    if (qty <= 0) { showPlayerBubble('"The bag is empty."'); return; }

    const newTable = tableItems.slice();
    const newQty = qty - 1;
    if (newQty <= 0) {
      newTable[carrotbagSlot] = null;
      setSelectedCarrotbagSlot(null);
    } else {
      newTable[carrotbagSlot] = { ...carrotbag, containedQuantity: newQty };
    }

    const TABLE_STACK = 20;
    let placed = false;
    for (let i = 0; i < 12; i++) {
      if (i === carrotbagSlot) continue;
      const t = newTable[i];
      if (t && t.id === "carrot" && t.quantity < TABLE_STACK) {
        newTable[i] = { ...t, quantity: t.quantity + 1 };
        placed = true;
        break;
      }
    }
    if (!placed) {
      for (let i = 0; i < 12; i++) {
        if (i === carrotbagSlot) continue;
        if (!newTable[i]) {
          newTable[i] = { id: "carrot", itemType: "carrot", name: "Carrot", quantity: 1, attributes: ["ingredient"] };
          placed = true;
          break;
        }
      }
    }
    if (!placed) { showPlayerBubble('"No free space available."'); return; }

    tableItemsRef.current = newTable;
    audioManager.playSoundEffect('moveitem', { maxDurationMs: 3000 });
    setTableItems(newTable);
    AsyncStorage.setItem(KITCHEN_TABLE_KEY, JSON.stringify(newTable)).catch(() => {});
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

  function finishCraft(tutorialCraft: boolean, completedTable: (BagItem | null)[]) {
    if (!tutorialCraft) {
      setTutState("IDLE");
      tsRef.current = "IDLE";
      setTimeout(() => { craftingLocked.current = false; }, 350);
      return;
    }

    AsyncStorage.setItem(SK.COOKING_STEP, "3").catch(() => {});
    setTutState("COOKING_CRAFT_DONE");
    tsRef.current = "COOKING_CRAFT_DONE";
    setTimeout(() => showDialog(D_CRAFT_SUCCESS, () => {
      setTutState("COOKING_SHARE_EAT");
      tsRef.current = "COOKING_SHARE_EAT";
      setFlyingItemId("herbsoup");
      // Track the first soup for compatibility with the existing tutorial flow.
      // In COOKING_SHARE_EAT every soup stack gets its own GestureDetector below.
      const soup1 = completedTable.findIndex(it => it?.id === "herbsoup");
      if (soup1 >= 0) { setSoupSlot(soup1); soupSlotRef.current = soup1; }
      showBubble(
        '"We made enough for two. Can you please split them into 2 bowls?"',
        "Rupert", "ALLOW_ITEM", null, () => {}, "bubble.cooking.split_soup_request",
      );
    }), 400);
    setTimeout(() => { craftingLocked.current = false; }, 2000);
  }

  function flyNextCraftOutput(outputIndex: number, tutorialCraft: boolean) {
    const output = craftFlightOutputs.current[outputIndex];
    const targetSlot = craftFlightTargetSlots.current[outputIndex];
    if (!output || targetSlot === undefined) {
      finishCraft(tutorialCraft, craftFlightTable.current);
      return;
    }

    const landOutput = () => {
      const landedTable = craftFlightTable.current.slice();
      landedTable[targetSlot] = output;
      craftFlightTable.current = landedTable;
      tableItemsRef.current = landedTable;
      setTableItems(landedTable);
      AsyncStorage.setItem(KITCHEN_TABLE_KEY, JSON.stringify(landedTable)).catch(() => {});

      // Keep the flying image above the newly-rendered slot for one frame, then
      // fade it out before dispatching the next crafted item.
      soupVis.value = withTiming(0, { duration: 120 }, (done) => {
        if (!done) return;
        if (outputIndex + 1 < craftFlightOutputs.current.length) {
          runOnJS(flyNextCraftOutput)(outputIndex + 1, tutorialCraft);
        } else {
          runOnJS(finishCraft)(tutorialCraft, landedTable);
        }
      });
    };

    measureCenterInRoot(craftResultSlotRef.current, null, (from) => {
      measureCenterInRoot(
        tableSlotRefs.current[targetSlot],
        layouts.current.tableSlots[targetSlot],
        (to) => {
          if (!from || !to) {
            landOutput();
            return;
          }

          setFlyingItemId(output.id);
          if (to.w > 0) soupFlySize.value = to.w * 0.80;
          soupX.value = from.x;
          soupY.value = from.y;
          soupScale.value = 1;
          soupVis.value = 1;
          soupX.value = withTiming(to.x, { duration: FLY_MS });
          soupY.value = withTiming(to.y, { duration: FLY_MS }, (done) => {
            if (done) runOnJS(landOutput)();
          });
        },
      );
    });
  }

  function startCraftOutputFlight(
    outputs: BagItem[],
    targetSlots: number[],
    initialTable: (BagItem | null)[],
    tutorialCraft: boolean,
  ) {
    craftFlightOutputs.current = outputs;
    craftFlightTargetSlots.current = targetSlots;
    craftFlightTable.current = initialTable;
    // The result remains visible until the overlay has been positioned over it.
    requestAnimationFrame(() => {
      setCraftResult(null);
      flyNextCraftOutput(0, tutorialCraft);
    });
  }

  function handleCraft() {
    if (craftingLocked.current) return;
    if (!craftResult) return;
    craftingLocked.current = true;
    const tutorialCraft = !cookingTutorialCompletedRef.current;

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
    const targetSlots: number[] = [];
    for (let i = 0; i < 12 && targetSlots.length < outputs.length; i++) {
      if (!newTable[i] && soupSlotRef.current !== i) targetSlots.push(i);
    }
    if (targetSlots.length < outputs.length) {
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
    craftIngSlotsRef.current = newIng;
    craftToolRef.current = craftTool;

    setCraftIngSlots(newIng);
    AsyncStorage.setItem(SK.CRAFT_INGREDIENTS, JSON.stringify(newIng)).catch(() => {});
    AsyncStorage.setItem(SK.CRAFT_TOOL_SLOT, JSON.stringify(craftTool)).catch(() => {});
    startCraftOutputFlight(outputs, targetSlots, newTable, tutorialCraft);
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

  async function startGuestTutorialIntro() {
    setTutState("COOKING_DONE");
    tsRef.current = "COOKING_DONE";
    await saveGuestTutorialIntroStep("knock").catch(() => {});
    audioManager.playSoundEffect('knock', { maxDurationMs: 4000 });
    setTimeout(() => {
      showBubble(
        '"Oh, who is knocking here so early in the morning?"',
        "Rupert", "BLOCK_ALL", null,
        () => {
          showBubble(
            '"Let’s check out the front door in the dining hall."',
            "Rupert", "BLOCK_ALL", null,
            () => {
              saveGuestTutorialIntroStep("dining_prompt").catch(() => {});
              setDiningUnlocked(true);
              setTutState("WAITING_FOR_DINING_LOCATION_CLICK");
            },
            "bubble.guest.dining_prompt",
          );
        },
        "bubble.guest.knock",
      );
    }, 350);
  }

  function finishCookingTutorial() {
    setSoupSlot(null); soupSlotRef.current = null;
    setTutState("COOKING_DONE");
    tsRef.current = "COOKING_DONE";
    cookingTutorialCompletedRef.current = true;
    AsyncStorage.setItem(SK.COOKING_DONE, "true").catch(() => {});
    AsyncStorage.setItem(SK.COOKING_STEP, "4").catch(() => {});
    showBubble(
      '"There. That should give you some strength. You have done well today."',
      "Rupert", "BLOCK_ALL", null,
      () => { void startGuestTutorialIntro(); },
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
      // Day-1 Herb Soup may use ingredient slots 0-2, but never the Tool slot (index 3).
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

  /** Render a normal Kitchen table item with consistent interactions. */
  function renderTableItemInSlot(slotIdx: number) {
    const item = tableItems[slotIdx];
    if (!item) return null;
    const imgSrc = ITEM_IMAGES[item.id] ?? null;

    const isSelectedHerbbag   = selectedHerbbagSlot === slotIdx && item.id === "herbbag";
    const isSelectedCarrotbag = selectedCarrotbagSlot === slotIdx && item.id === "carrotbag";
    const isSelectedHerbs     = selectedHerbsSlot === slotIdx && item.id === "herbs";
    const isSelectedSoup      = selectedSoupSlot === slotIdx && item.id === "herbsoup";
    const showHerbbagTapHint = isKitchenItemInteractionState(ts) && item.id === "herbbag" && isSelectedHerbbag;
    const showCarrotbagTapHint = isKitchenItemInteractionState(ts) && item.id === "carrotbag" && isSelectedCarrotbag;

    // Herb Soup keeps its dedicated share/eat tutorial behavior after crafting.
    if (ts === "COOKING_SHARE_EAT" && item.id === "herbsoup") {
      const isBeingDragged =
        soupDragging && cookingDragActiveSlot < 0 && soupSlot === slotIdx;
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
              isSelectedHerbbag   && { borderWidth: 2, borderColor: "#E8B84B", borderRadius: 6 },
              isSelectedCarrotbag && { borderWidth: 2, borderColor: "#E8B84B", borderRadius: 6 },
              isSelectedHerbs     && { borderWidth: 2, borderColor: "#7EC87E", borderRadius: 6 },
              isSelectedSoup    && { borderWidth: 2, borderColor: "#7EC87E", borderRadius: 6 },
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
                <Text style={{ color: "#2C1810", fontSize: 8, fontWeight: "700" }}>{item.quantity > 1 ? "SPLIT" : "TAP"}</Text>
              </View>
            )}
            {!isBeingDragged && showCarrotbagTapHint && (
              <View style={{ position: "absolute", bottom: 2, right: 2, backgroundColor: "#E8B84B", borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1 }}>
                <Text style={{ color: "#2C1810", fontSize: 8, fontWeight: "700" }}>{item.quantity > 1 ? "SPLIT" : "TAP"}</Text>
              </View>
            )}
            {!isBeingDragged && item.id === "herbs" && isSelectedHerbs && item.quantity > 1 && (
              <View style={{ position: "absolute", bottom: 2, right: 2, backgroundColor: "#7EC87E", borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1 }}>
                <Text style={{ color: "#2C1810", fontSize: 8, fontWeight: "700" }}>SPLIT</Text>
              </View>
            )}
            {!isBeingDragged && item.id === "herbsoup" && isSelectedSoup && item.quantity > 1 && (
              <View style={{ position: "absolute", bottom: 2, right: 2, backgroundColor: "#7EC87E", borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1 }}>
                <Text style={{ color: "#2C1810", fontSize: 8, fontWeight: "700" }}>SPLIT</Text>
              </View>
            )}
          </View>
        </GestureDetector>
      );
    }

    // Other story states stay non-draggable, but inspection never disappears.
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
    <View ref={rootRef} style={styles.root}>
      <CurrencyHud />
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
                <Animated.View style={[styles.plusFloat, plusFloatStyle]} pointerEvents="none">
                  <Text style={styles.plusFloatText}>+20</Text>
                </Animated.View>
              </View>
              <Text style={styles.statBarText}>{staminaDisplay}/{playerStats.maximumStamina}</Text>
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
              disabled={tutActive && !(ts === "COOKING_UNPACK_WAIT" || ts === "COOKING_CRAFT_READY" || ts === "COOKING_SHARE_EAT" || ts === "COOKING_DONE" || ts === "CRAFTING_TUTORIAL_READY" || ts === "WAITING_FOR_GARDEN_LOCATION_CLICK" || ts === "TUESDAY_KITCHEN_GARDEN_PROMPT" || ts === "POST_GARDEN_DIALOG" || ts === "WAITING_FOR_DINING_LOCATION_CLICK")}
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
            <Image source={avatarSrc(playerAvatarId, staminaCurrent)} style={[styles.circleImg, styles.playerPortraitImage]} resizeMode="cover" resizeMethod="resize" />
          </TouchableOpacity>
          <TouchableOpacity
            ref={rupertPortraitRef as any}
            style={[styles.circleWrap, rupertInDining && styles.rupertAway]}
            disabled={rupertInDining || !postGuestState.upgradeIntroSeen || dlgActive}
            onPress={handleRupertUpgradeTap}
            activeOpacity={postGuestState.upgradeIntroSeen ? 0.78 : 1}
          >
            {!rupertInDining && (
              <Image source={rupertSrc(rupertPortrait)} style={[styles.circleImg, styles.npcPortraitImage]} resizeMode="cover" resizeMethod="resize" />
            )}
          </TouchableOpacity>
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
                {/* Tool slot */}
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
                {/* Result / Recipe slot — output only, never a drag target */}
                <View ref={craftResultSlotRef} collapsable={false}>
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
                </View>
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
          const isDiningPrompt = ts === "WAITING_FOR_DINING_LOCATION_CLICK";
          const isCurrent = loc.id === "kitchen";
          const isGardenBtn = loc.id === "garden";
          const isDormBtn = loc.id === "dormitory";
          const isDiningBtn = loc.id === "dining";
          const enabledInGardenPrompt = isGardenPrompt && isGardenBtn;
          const enabledInDiningPrompt = isDiningPrompt && isDiningBtn;

          const isEffectivelyActive =
            loc.active ||
            enabledInGardenPrompt ||
            enabledInDiningPrompt ||
            (coreTravelUnlocked && (isGardenBtn || isDormBtn || isDiningBtn)) ||
            (isGardenBtn && gardenActive) ||
            (isDormBtn && dormitoryUnlocked) ||
            (isDiningBtn && diningUnlocked);

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
    <TouchableOpacity
      key={loc.id}
      style={[styles.locBtn, styles.locBtnActive, styles.locBtnGardenHighlight]}
      onPress={handleGardenTap}
      activeOpacity={0.8}
    >
      <Animated.View style={gardenPulseStyle}>{renderLocContent(true)}</Animated.View>
    </TouchableOpacity>
  );
}

if (enabledInDiningPrompt) {
  return (
    <TouchableOpacity
      key={loc.id}
      style={[styles.locBtn, styles.locBtnActive]}
      onPress={() => { void handleDiningTap(); }}
      activeOpacity={0.8}
    >
      <Animated.View style={diningPulseStyle}>{renderLocContent(true)}</Animated.View>
    </TouchableOpacity>
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
if (isDiningBtn && diningUnlocked) {
  // Dining stays reachable throughout the guest tutorial, including
  // the return trip with Herb Soup.
  locOnPress = () => {
    audioManager.playSoundEffect('footstep', { maxDurationMs: 4000 });
    router.push("/dining");
  };
} else if (!tutActive && isEffectivelyActive) {
  if (isGardenBtn && (gardenActive || coreTravelUnlocked)) {
    locOnPress = () => {
      audioManager.playSoundEffect('footstep', { maxDurationMs: 4000 });
      router.push("/garden");
    };
  } else if (isDormBtn && (dormitoryUnlocked || coreTravelUnlocked)) {
    locOnPress = rupertInDining
      ? () => showPlayerBubble('"I need to cook herb soup for the guest."')
      : () => {
          audioManager.playSoundEffect('walking-on-wood', { maxDurationMs: 5000 });
          router.push("/dormitory");
        };
  }
}

const blockedByTutorial = tutActive && !(isDiningBtn && diningUnlocked);
          return (
            <TouchableOpacity
              key={loc.id}
              style={[
                styles.locBtn,
                isCurrent
                  ? styles.locBtnCurrent
                  : (isEffectivelyActive ? styles.locBtnActive : styles.locBtnLocked),
              ]}
              disabled={!isEffectivelyActive || blockedByTutorial}
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
      {tutActive && !showDlgOverlay && !tutInteractable && ts !== "WAITING_FOR_GARDEN_LOCATION_CLICK" && ts !== "WAITING_FOR_DINING_LOCATION_CLICK" && (
        <View
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: locationBarH }}
          pointerEvents="box-only"
        />
      )}
      {/* ── Story prompt dim overlay — visual only, no touch blocking */}
      {(ts === "WAITING_FOR_GARDEN_LOCATION_CLICK" || ts === "WAITING_FOR_DINING_LOCATION_CLICK") && headerH > 0 && (
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
                    ? avatarSrc(playerAvatarId, staminaCurrent)
                    : rupertSrc(rupertPortrait)
                }
                style={[styles.dlgPortrait, curLine?.portrait === "player" ? styles.playerPortraitImage : styles.npcPortraitImage]}
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
                  style={[styles.continueBtn, styles.confirmBtn, !nameInputVal.trim() && styles.btnDisabled]}
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
        // Size to the current content, then cap it for comfortable mobile wrapping.
        const bubbleWidthTarget = Math.min(
          W * 0.78,
          Math.max(180, Math.min(420, Math.max(bubble.text.length * 7.2, bubble.speaker.length * 9) + 48)),
        );
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

      {/* ── Rupert Upgrades Modal */}
      <Modal visible={showUpgrades} transparent animationType="fade" onRequestClose={() => setShowUpgrades(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.upgradePanel}>
            <View style={styles.upgradeTitleRow}>
              <Image source={IMG.rupert} style={styles.upgradeRupert} resizeMode="cover" resizeMethod="resize" />
              <View style={{ flex: 1 }}>
                <Text style={styles.panelTitle}>Rupert · Upgrades</Text>
                <Text style={styles.upgradeSubtitle}>Tavern & Garden</Text>
              </View>
            </View>
            <View style={styles.divider} />

            <View style={styles.upgradeCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.upgradeName}>2nd Plot</Text>
                <Text style={styles.upgradeCost}>4 Wood + 4 Stone</Text>
                <Text style={styles.upgradeOwned}>
                  You have {sharedResources.wood} Wood · {sharedResources.stone} Stone
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.upgradeBuildBtn, postGuestState.secondPlotUnlocked && styles.upgradeBuildBtnDone]}
                disabled={upgradeBusy || postGuestState.secondPlotUnlocked}
                onPress={handleSecondPlotUpgrade}
                activeOpacity={0.8}
              >
                <Text style={styles.upgradeBuildText}>
                  {postGuestState.secondPlotUnlocked ? "Unlocked" : upgradeBusy ? "..." : "Build"}
                </Text>
              </TouchableOpacity>
            </View>

            {upgradeMessage && <Text style={styles.upgradeMessage}>{upgradeMessage}</Text>}

            <TouchableOpacity style={styles.closeBtn} onPress={() => setShowUpgrades(false)} activeOpacity={0.8}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
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
  bagDropTarget: { width: 96, height: 96, borderRadius: 48, position: "relative" },
  bagDropHighlight: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: "#F5E6C8",
    backgroundColor: "rgba(196,148,58,0.18)",
    zIndex: 5,
  },

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
  locBtnCurrent: { backgroundColor: "rgba(196,148,58,0.22)", borderColor: "#FFFFFF", borderWidth: 2 },
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
    paddingVertical: 9,
    paddingHorizontal: 14,
    maxWidth: "78%",
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
  dlgText: { color: "#F0E8D5", fontSize: 16, lineHeight: 25, fontFamily: "RobotoRegular", textAlign: "center" },
  continueBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(196,148,58,0.18)", borderRadius: 12,
    paddingVertical: 13, paddingHorizontal: 26,
    borderWidth: 1, borderColor: "rgba(196,148,58,0.35)", marginTop: 4,
  },
  confirmBtn: {
    alignSelf: "center",
    justifyContent: "center",
    minWidth: 150,
    paddingHorizontal: 24,
    marginTop: 12,
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
  upgradePanel: {
    width: "88%", backgroundColor: "#160B03", borderRadius: 20, padding: 20,
    borderWidth: 1.5, borderColor: "rgba(196,148,58,0.38)",
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 16, elevation: 24,
  },
  upgradeTitleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  upgradeRupert: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: "#C4943A" },
  upgradeSubtitle: { color: "rgba(240,232,213,0.48)", fontSize: 11, fontFamily: "Oldenburg", textAlign: "center", marginTop: 2 },
  upgradeCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: "rgba(196,148,58,0.24)",
  },
  upgradeName: { color: "#C4943A", fontSize: 14, fontFamily: "Oldenburg", marginBottom: 5 },
  upgradeCost: { color: "#F0E8D5", fontSize: 12, fontFamily: "Oldenburg" },
  upgradeOwned: { color: "rgba(240,232,213,0.52)", fontSize: 10, fontFamily: "Oldenburg", marginTop: 5 },
  upgradeBuildBtn: {
    minWidth: 82, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: "rgba(196,148,58,0.20)", borderWidth: 1, borderColor: "rgba(196,148,58,0.48)",
    alignItems: "center",
  },
  upgradeBuildBtnDone: { opacity: 0.55 },
  upgradeBuildText: { color: "#F5E6C8", fontSize: 12, fontFamily: "Oldenburg" },
  upgradeMessage: { color: "#C4943A", fontSize: 11, fontFamily: "Oldenburg", textAlign: "center", marginTop: 10 },

  recipePanel: {
    width: "85%", backgroundColor: "#160B03", borderRadius: 20, padding: 24,
    borderWidth: 1.5, borderColor: "rgba(196,148,58,0.38)", alignItems: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 16, elevation: 24,
  },
  recipeTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  recipeEmpty: { color: "rgba(240,232,213,0.5)", fontSize: 14, fontStyle: "italic", textAlign: "center", lineHeight: 22, marginVertical: 20 },
  closeBtn: {
    alignSelf: "center",
    alignItems: "center",
    minWidth: 132,
    backgroundColor: "rgba(196,148,58,0.16)", borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 24,
    borderWidth: 1, borderColor: "rgba(196,148,58,0.35)", marginTop: 12,
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
    fontFamily: "RobotoRegular",
  },
  // Player thought bubble — match the standard light player-thought style used in Garden.
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
    fontFamily: "RobotoItalic",
    lineHeight: 18,
  },
});
