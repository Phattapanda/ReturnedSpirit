import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Image,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { useAudioManager } from "@/src/audio/AudioProvider";
import { getMusicTheme } from "@/src/audio/audioEngine";

import type { GardenPlotData } from "@/src/components/GardenPlot";
import {
  ROOM_UPGRADES_DEFAULT,
  calcSleepRecovery,
  canAfford,
  type RoomUpgrade,
} from "@/src/game/room-config";
import {
  SHARED_RESOURCE_DEFAULTS,
  RESOURCE_NAMES,
  SHARED_RESOURCES_KEY,
  type SharedResources,
  type ResourceId,
} from "@/src/game/shared-resources";

import SceneBackground from "@/src/components/SceneBackground";
import CurrencyHud from "@/src/components/CurrencyHud";
import StatusModal from "@/src/components/StatusModal";
import PortraitBubble from "@/src/components/portrait-bubble";
import { DEFAULT_PLAYER_STATS, PLAYER_STATS_KEY, normalizePlayerStats, type PlayerStats } from "@/src/game/player-stats";
import { createSnapshot, discardRuntimeAndRestore } from "@/src/game/save-manager";
import { setPlaytimePaused } from "@/src/game/playtime-tracker";
import { loadGuestTutorialIntroStep } from "@/src/game/guest-tutorial";
import {
  DEFAULT_PLAYER_AVATAR_ID,
  PLAYER_AVATAR_KEY,
  getPlayerAvatarForStamina,
  normalizePlayerAvatarId,
  type PlayerAvatarId,
} from "@/src/game/player-avatar";

const DSK = {
  STAMINA:               "@game:stamina",
  STAMINA_MAX:           "@game:stamina_max",
  LIFE:                  "@game:life",
  PLAYER_NAME:           "@game:player_name",
  DAY_INDEX:             "@game:day_index",
  STAMINA_SPENT_TODAY:   "@game:stamina_spent_today",
  PLOT_DATA:             "@garden:plot_01_data",
  UNLOCKED_LOCS:         "@game:unlocked_locs",
  HAS_ENTERED:           "@room:has_entered",
  HAS_SEEN_EVE_THOUGHT:  "@room:has_seen_evening_thought",
  TIME_OF_DAY:           "@room:time_of_day",
  MUST_SLEEP:            "@room:must_sleep_before_leaving",
  FIRST_SLEEP_DONE:      "@room:first_sleep_completed",
  UPGRADES:              "@room:upgrades",
  STORAGE:               "@room:storage",
  ACTIVE_SLOT:           "@game:active_slot",
  GAME_SLOTS:            "game_slots",
  SAVE_LOCATION:         "@game:save_location",
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

type TimeOfDay = "evening" | "morning";

type RoomState =
  | "LOADING"
  | "ENTERING_ROOM_FIRST_TIME"
  | "ROOM_EVENING_INTRO"          // thought bubble showing
  | "ROOM_EVENING_INTERACTIVE"
  | "SLEEP_CONFIRMATION_OPEN"
  | "DAY_TRANSITION_IN_PROGRESS"
  | "ROOM_MORNING"
  | "UPGRADE_MODAL"
  | "STORAGE_MODAL"
  | "LEAVING_ROOM";

// ─── Assets ───────────────────────────────────────────────────────────────────

const IMG = {
  room_evening: require("../assets/images/room1_evening.jpg"),
  room_morning: require("../assets/images/room1_morning.jpg"),
  avLaugh:      require("../assets/images/avatar1_laugh.png"),
  avNormal:     require("../assets/images/avatar1_normal.png"),
  avSad:        require("../assets/images/avatar1_sad.png"),
  avTired:      require("../assets/images/avatar1_tired.png"),
  avSick:       require("../assets/images/avatar1_sick.png"),
};

const DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

function avatarSrc(avatarId: PlayerAvatarId, st: number) {
  return getPlayerAvatarForStamina(avatarId, st);
}

// ─── Day-change helper (shared logic) ────────────────────────────────────────

function processPlotDayChange(p: GardenPlotData): GardenPlotData {
  if (p.status === "empty" || p.readyToHarvest) {
    return { ...p, wateredToday: false, weedsPulledToday: false, fertilizedToday: false, fertilizerTypeUsedToday: null };
  }
  const upd = { ...p };
  if (!p.withered) {
    if (p.wateredToday) {
      upd.completedGrowthDays = Math.min(p.completedGrowthDays + 1, p.totalGrowthDays);
      upd.progressPercent     = Math.round((upd.completedGrowthDays / p.totalGrowthDays) * 100);
      upd.remainingGrowthDays = Math.max(0, p.totalGrowthDays - upd.completedGrowthDays);
      upd.consecutiveUnwateredDays = 0;
      if (upd.completedGrowthDays >= p.totalGrowthDays) {
        upd.status = "ready";
        upd.readyToHarvest = true;
      }
    } else {
      upd.consecutiveUnwateredDays = p.consecutiveUnwateredDays + 1;
      if (upd.consecutiveUnwateredDays >= 3) {
        upd.withered = true;
        upd.status = "withered";
      }
    }
  }
  upd.wateredToday = false;
  upd.weedsPulledToday = false;
  upd.fertilizedToday = false;
  upd.fertilizerTypeUsedToday = null;
  return upd;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DormitoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const [playerAvatarId, setPlayerAvatarId] = useState<PlayerAvatarId>(DEFAULT_PLAYER_AVATAR_ID);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(PLAYER_AVATAR_KEY)
      .then((raw) => { if (active) setPlayerAvatarId(normalizePlayerAvatarId(raw)); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // ── HUD
  const [staminaCurrent, setStaminaCurrent] = useState(40);
  const [staminaDisplay, setStaminaDisplay] = useState(40);
  const [lifeCurrent, setLifeCurrent]       = useState(15);
  const [playerStats, setPlayerStats]       = useState<PlayerStats>(DEFAULT_PLAYER_STATS);
  const [dayIdx, setDayIdx]                 = useState(0);

  // ── Room state
  const [roomState, setRoomState]   = useState<RoomState>("LOADING");
  const roomStateRef = useRef<RoomState>("LOADING");
  const [timeOfDay, setTimeOfDay]   = useState<TimeOfDay>("evening");
  const [playerName, setPlayerName] = useState("Adventurer");
  const [headerH, setHeaderH]       = useState(0);
  // Daily stamina-spend tracker (used to decide morning vs. evening state on Day 3+)
  const [staminaSpentToday, setStaminaSpentToday] = useState(0);

  // ── Tutorial flags
  const [firstSleepDone, setFirstSleepDone]   = useState(false);
  const [mustSleep, setMustSleep]             = useState(true);

  // ── Upgrades + resources
  const [roomUpgrades, setRoomUpgrades]         = useState<RoomUpgrade[]>(ROOM_UPGRADES_DEFAULT);
  const [sharedResources, setSharedResources]   = useState<SharedResources>(SHARED_RESOURCE_DEFAULTS);
  const [roomStorageUnlocked, setRoomStorageUnlocked] = useState(false);
  const [roomStorage] = useState<null[]>(Array(12).fill(null));

  // ── Player thought bubble
  const [playerBubble, setPlayerBubble]   = useState<string | null>(null);
  const playerBubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playerPortraitRef = useRef<View>(null);
  const playerPortraitLayout = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  // ── Modal states
  const [sleepConfirmOpen, setSleepConfirmOpen] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal]   = useState(false);
  const [showStorageModal, setShowStorageModal]   = useState(false);
  const [statusOpen, setStatusOpen]                 = useState(false);
  const [showMenu, setShowMenu]                   = useState(false);

  useEffect(() => {
    void setPlaytimePaused(showMenu);
    return () => { void setPlaytimePaused(false); };
  }, [showMenu]);
  const [upgradeMsg, setUpgradeMsg]               = useState<string | null>(null);
  const upgradeMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Sleep transition
  const [sleepTransitioning, setSleepTransitioning] = useState(false);
  const isDayTransitionRef = useRef(false);
  const downstairsLocked   = useRef(false);

  // ── Animations
  const staminaSV    = useSharedValue(40);
  const lifeSV       = useSharedValue(15);   // for animated life bar
  const staminaMaxSV = useSharedValue(DEFAULT_PLAYER_STATS.maximumStamina);
  const lifeMaxSV    = useSharedValue(DEFAULT_PLAYER_STATS.maximumLife);
  const barWidthSV   = useSharedValue(0);
  const fadeOpacity  = useSharedValue(0);

  // ── Regen animation data (captured before sleep, used after morning fade-in)
  const regenPending = useRef<{ oldSta: number; newSta: number; oldLife: number; newLife: number } | null>(null);
  // Floating regen texts
  const [regenStaText, setRegenStaText]   = useState<string | null>(null);
  const [regenLifeText, setRegenLifeText] = useState<string | null>(null);
  const regenStaY   = useSharedValue(0);
  const regenStaOp  = useSharedValue(0);
  const regenLifeY  = useSharedValue(0);
  const regenLifeOp = useSharedValue(0);
  const regenStaStyle  = useAnimatedStyle(() => ({ transform: [{ translateY: regenStaY.value }], opacity: regenStaOp.value }));
  const regenLifeStyle = useAnimatedStyle(() => ({ transform: [{ translateY: regenLifeY.value }], opacity: regenLifeOp.value }));

  const staminaFillStyle = useAnimatedStyle(() => ({
    width: Math.min(1, staminaSV.value / staminaMaxSV.value) * barWidthSV.value,
  }));
  const lifeFillStyle = useAnimatedStyle(() => ({
    width: (lifeSV.value / lifeMaxSV.value) * barWidthSV.value,
  }));
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fadeOpacity.value }));

  // ── Audio (via central AudioManager)
  const audioManager = useAudioManager();
  const { crossfadeTo } = audioManager;
  const dormitoryThemeReady = roomState !== "LOADING";
  const dormitoryTheme = getMusicTheme('dormitory', timeOfDay);

  // Restore the time-of-day theme whenever the retained room regains focus.
  // The same callback also reacts to the morning/evening transition in-place.
  useFocusEffect(
    React.useCallback(() => {
      if (!dormitoryThemeReady) return;
      crossfadeTo(dormitoryTheme, 3000);
    }, [crossfadeTo, dormitoryTheme, dormitoryThemeReady]),
  );
  // Track morning birds per-wake so they only play once each morning transition
  const morningBirdsPlayedRef = useRef(false);

  // ─────────────────────────────────────────────────────────────────────────
  // Sync roomStateRef
  // ─────────────────────────────────────────────────────────────────────────
  function setRS(s: RoomState) { roomStateRef.current = s; setRoomState(s); }

  useEffect(() => {
    staminaMaxSV.value = playerStats.maximumStamina;
    lifeMaxSV.value = playerStats.maximumLife;
  }, [playerStats.maximumStamina, playerStats.maximumLife, staminaMaxSV, lifeMaxSV]);

  // ─────────────────────────────────────────────────────────────────────────
  // Morning birds: play once per wake cycle with music ducking
  // Max 7 s, duck music to 75%, restore after birds finish
  // ─────────────────────────────────────────────────────────────────────────
  function playMorningBirdsOnce() {
    if (morningBirdsPlayedRef.current) return;
    morningBirdsPlayedRef.current = true;
    // Duck music to 75% while birds play
    audioManager.duckMusic(0.75, 500);
    audioManager.playSoundEffect('morning-birds', { maxDurationMs: 7000 });
    // Restore music after 7 s (+ small buffer)
    setTimeout(() => {
      audioManager.duckMusic(1.0, 700);
    }, 7000);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Measure portrait layout
  // ─────────────────────────────────────────────────────────────────────────
  function measurePortrait() {
    playerPortraitRef.current?.measureInWindow((x, y, w, h) => {
      playerPortraitLayout.current = { x, y, w, h };
    });
  }

  useEffect(() => {
    const t = setTimeout(measurePortrait, 600);
    return () => clearTimeout(t);
  }, [W, insets.top]);

  // ─────────────────────────────────────────────────────────────────────────
  // Pure helper: determine dormitory time-of-day and intro flag
  //
  // Days 1 & 2 (dayIdx 0, 1): tutorial-controlled via saved flags
  // Day 3+  (dayIdx >= 2):    dynamic — staminaSpentToday >= 20 → evening
  // ─────────────────────────────────────────────────────────────────────────
  function resolveDormitoryTimeOfDay(
    di: number,
    spent: number,
    flags: {
      firstSleepDone: boolean;
      hasSeenEveThought: boolean;
      hasEntered: boolean;
      savedTimeOfDay: TimeOfDay;
    },
  ): { timeOfDay: TimeOfDay; showEveningIntro: boolean } {
    if (di <= 1) {
      // Tutorial days: respect saved time-of-day and intro flags
      if (flags.savedTimeOfDay === "morning" && flags.firstSleepDone) {
        return { timeOfDay: "morning", showEveningIntro: false };
      }
      if (!flags.hasEntered && !flags.hasSeenEveThought) {
        return { timeOfDay: "evening", showEveningIntro: true };
      }
      return { timeOfDay: "evening", showEveningIntro: false };
    }
    // Day 3+: fully dynamic
    return { timeOfDay: spent >= 20 ? "evening" : "morning", showEveningIntro: false };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Mount: load state
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        // Player stats / Growth Points must load first so current values use upgraded caps.
        let loadedStats = DEFAULT_PLAYER_STATS;
        const rawStats = await AsyncStorage.getItem(PLAYER_STATS_KEY);
        if (rawStats) {
          try { loadedStats = normalizePlayerStats(JSON.parse(rawStats)); } catch { /* default */ }
        }
        setPlayerStats(loadedStats);
        staminaMaxSV.value = loadedStats.maximumStamina;
        lifeMaxSV.value = loadedStats.maximumLife;

        // Stamina
        const rawSta = await AsyncStorage.getItem(DSK.STAMINA);
        const sta = rawSta ? Math.max(parseInt(rawSta, 10), 0) : 40;
        setStaminaCurrent(sta); setStaminaDisplay(sta); staminaSV.value = sta;

        // Life
        const rawLife = await AsyncStorage.getItem(DSK.LIFE);
        const lf = rawLife ? Math.min(Math.max(parseInt(rawLife, 10), 0), loadedStats.maximumLife) : 15;
        setLifeCurrent(lf);
        lifeSV.value = lf;

        // Day
        const rawDay = await AsyncStorage.getItem(DSK.DAY_INDEX);
        const di = rawDay !== null ? parseInt(rawDay, 10) : 0;
        setDayIdx(di);
        const guestTutorialStep = await loadGuestTutorialIntroStep();

        // Daily stamina spend (cross-screen, written by garden.tsx deductStamina)
        const rawSpent = await AsyncStorage.getItem(DSK.STAMINA_SPENT_TODAY);
        const spent = rawSpent ? Math.max(0, parseInt(rawSpent, 10)) : 0;
        setStaminaSpentToday(spent);

        // Player name
        const name = await AsyncStorage.getItem(DSK.PLAYER_NAME);
        if (name) setPlayerName(name);

        // Upgrades
        const rawUpg = await AsyncStorage.getItem(DSK.UPGRADES);
        let loadedUpgrades = ROOM_UPGRADES_DEFAULT;
        if (rawUpg) {
          try {
            const saved = JSON.parse(rawUpg) as RoomUpgrade[];
            // Merge to pick up new upgrade definitions
            loadedUpgrades = ROOM_UPGRADES_DEFAULT.map(def => {
              const found = saved.find(s => s.id === def.id);
              return found ? { ...def, completed: found.completed } : def;
            });
          } catch { /* use default */ }
        }
        setRoomUpgrades(loadedUpgrades);
        const storageUpg = loadedUpgrades.find(u => u.id === "room_storage_01");
        if (storageUpg?.completed) setRoomStorageUnlocked(true);

        // Shared resources
        const rawRes = await AsyncStorage.getItem(SHARED_RESOURCES_KEY);
        if (rawRes) {
          try { setSharedResources({ ...SHARED_RESOURCE_DEFAULTS, ...JSON.parse(rawRes) }); } catch { /* default */ }
        }

        // Time-of-day flags (used for Day 1 & 2 tutorial logic)
        const rawTod  = await AsyncStorage.getItem(DSK.TIME_OF_DAY);
        const tod     = (rawTod === "morning" || rawTod === "evening") ? rawTod : "evening";
        const rawFs   = await AsyncStorage.getItem(DSK.FIRST_SLEEP_DONE);
        const rawMs   = await AsyncStorage.getItem(DSK.MUST_SLEEP);
        const rawEvT  = await AsyncStorage.getItem(DSK.HAS_SEEN_EVE_THOUGHT);
        const rawHasEntered = await AsyncStorage.getItem(DSK.HAS_ENTERED);

        const fs  = rawFs === "true";
        const ms  = rawMs !== "false"; // default true until explicitly set false
        const evt = rawEvT === "true";

        setFirstSleepDone(fs);
        setMustSleep(ms);

        await AsyncStorage.setItem(DSK.HAS_ENTERED, "true");

        // ── Resolve room state via central helper ──────────────────────────
        const resolvedRoom = resolveDormitoryTimeOfDay(
          di, spent,
          { firstSleepDone: fs, hasSeenEveThought: evt, hasEntered: rawHasEntered === "true", savedTimeOfDay: tod },
        );
        // The first guest tutorial completes Day 2's required progression. Once it
        // is finished, the player may sleep and move on to Day 3 even though Day 2
        // originally began in the tutorial-controlled morning state.
        const postGuestDayTwoEvening = di === 1 && guestTutorialStep === "service_complete";
        const resolvedTod: TimeOfDay = postGuestDayTwoEvening ? "evening" : resolvedRoom.timeOfDay;
        const showEveningIntro = postGuestDayTwoEvening ? false : resolvedRoom.showEveningIntro;
        if (postGuestDayTwoEvening && tod !== "evening") {
          await AsyncStorage.setItem(DSK.TIME_OF_DAY, "evening");
        }
        setTimeOfDay(resolvedTod);

        if (resolvedTod === "morning") {
          setRS("ROOM_MORNING");
          // Ambient: morning birds on Day 3+ morning entry
          if (di >= 2) {
            playMorningBirdsOnce();
          }
        } else if (showEveningIntro) {
          setRS("ENTERING_ROOM_FIRST_TIME");
          setTimeout(() => {
            setRS("ROOM_EVENING_INTRO");
            showPlayerBubble('"It is already getting dark. I should get some more rest."', 3000, true);
          }, 400);
        } else {
          setRS("ROOM_EVENING_INTERACTIVE");
          // Ambient: owl on Day 3+ evening entry
          if (di >= 2) {
            audioManager.playSoundEffect('owl', { maxDurationMs: 30000 });
          }
        }
      } catch {
        setRS("ROOM_EVENING_INTERACTIVE");
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (playerBubbleTimer.current) clearTimeout(playerBubbleTimer.current);
      if (upgradeMsgTimer.current) clearTimeout(upgradeMsgTimer.current);
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Player thought bubble
  // ─────────────────────────────────────────────────────────────────────────
  function showPlayerBubble(text: string, durationMs: number, onCloseInteractive?: boolean) {
    if (playerBubble) return;
    if (playerBubbleTimer.current) clearTimeout(playerBubbleTimer.current);
    const thought = text.trim().replace(/^["“”]+|["“”]+$/g, "");
    setPlayerBubble(thought);
    playerBubbleTimer.current = setTimeout(() => {
      setPlayerBubble(null);
      playerBubbleTimer.current = null;
      if (onCloseInteractive) {
        setMustSleep(true);
        setRS("ROOM_EVENING_INTERACTIVE");
        AsyncStorage.setItem(DSK.HAS_SEEN_EVE_THOUGHT, "true").catch(() => {});
        AsyncStorage.setItem(DSK.MUST_SLEEP, "true").catch(() => {});
      }
    }, durationMs);
  }

  function dismissPlayerBubble(interactive?: boolean) {
    if (playerBubbleTimer.current) { clearTimeout(playerBubbleTimer.current); playerBubbleTimer.current = null; }
    setPlayerBubble(null);
    if (interactive) {
      setMustSleep(true);
      setRS("ROOM_EVENING_INTERACTIVE");
      AsyncStorage.setItem(DSK.HAS_SEEN_EVE_THOUGHT, "true").catch(() => {});
      AsyncStorage.setItem(DSK.MUST_SLEEP, "true").catch(() => {});
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Sleep flow
  // ─────────────────────────────────────────────────────────────────────────
  function handleGoToSleep() {
    if (timeOfDay === "morning") {
      // Day 3+: "not tired enough yet"; Day 1 & 2: "too early to sleep again"
      if (dayIdx >= 2) {
        showPlayerBubble('"I\'m not tired enough to sleep yet."', 2500);
      } else {
        showPlayerBubble('"It\'s too early to sleep again."', 2500);
      }
      return;
    }
    if (sleepConfirmOpen || isDayTransitionRef.current) return;
    setRS("SLEEP_CONFIRMATION_OPEN");
    setSleepConfirmOpen(true);
  }

  function handleSleepCancel() {
    setSleepConfirmOpen(false);
    setRS("ROOM_EVENING_INTERACTIVE");
  }

  function handleSleepConfirm() {
    if (isDayTransitionRef.current) return;
    isDayTransitionRef.current = true;
    setSleepConfirmOpen(false);
    setSleepTransitioning(true);
    setRS("DAY_TRANSITION_IN_PROGRESS");

    // Play owl SFX, start fade to black
    audioManager.playSoundEffect('owl', { maxDurationMs: 10000 });

    fadeOpacity.value = withTiming(1, { duration: 700 }, (done) => {
      if (done) runOnJS(afterFadeToBlack)();
    });
  }

  function afterFadeToBlack() {
    processDayAndWake().catch(console.error);
  }

  async function processDayAndWake() {
    try {
      // ── 1. Advance day
      const rawDay = await AsyncStorage.getItem(DSK.DAY_INDEX);
      const oldDay = rawDay !== null ? parseInt(rawDay, 10) : 0;
      const newDay = (oldDay + 1) % 7;
      await AsyncStorage.setItem(DSK.DAY_INDEX, String(newDay));
      setDayIdx(newDay);

      // ── 2. Process garden plot growth
      const rawPlot = await AsyncStorage.getItem(DSK.PLOT_DATA);
      if (rawPlot) {
        try {
          const plot = JSON.parse(rawPlot) as GardenPlotData;
          const updated = processPlotDayChange(plot);
          await AsyncStorage.setItem(DSK.PLOT_DATA, JSON.stringify(updated));
        } catch { /* non-critical */ }
      }

      // ── 3. Stamina recovery (compute only — don't update SV yet; animation does that)
      const recovery = calcSleepRecovery(roomUpgrades);
      const rawSta   = await AsyncStorage.getItem(DSK.STAMINA);
      const oldSta   = rawSta ? parseInt(rawSta, 10) : 40;
      const newSta   = Math.min(oldSta + recovery.stamina, playerStats.maximumStamina);
      await AsyncStorage.setItem(DSK.STAMINA, String(newSta));
      // Update underlying state now (for correct re-mounts after reload)
      setStaminaCurrent(newSta);

      // ── 4. Life recovery (same pattern)
      const rawLife = await AsyncStorage.getItem(DSK.LIFE);
      const oldLife = rawLife ? parseInt(rawLife, 10) : 15;
      const newLife = Math.min(oldLife + recovery.life, playerStats.maximumLife);
      await AsyncStorage.setItem(DSK.LIFE, String(newLife));
      setLifeCurrent(newLife);

      // ── 5. Store regen data for morning animation; KEEP SVs at old values
      staminaSV.value = oldSta;
      lifeSV.value    = oldLife;
      setStaminaDisplay(oldSta);   // display counter starts at old value
      regenPending.current = { oldSta, newSta, oldLife, newLife };

      // ── 6. Flags
      await AsyncStorage.setItem(DSK.FIRST_SLEEP_DONE, "true");
      await AsyncStorage.setItem(DSK.TIME_OF_DAY, "morning");
      await AsyncStorage.setItem(DSK.MUST_SLEEP, "false");
      setFirstSleepDone(true);
      setMustSleep(false);
      setTimeOfDay("morning");

      // ── 6b. Reset daily stamina spend for the new day (before snapshot!)
      await AsyncStorage.setItem(DSK.STAMINA_SPENT_TODAY, "0");
      setStaminaSpentToday(0);

      // ── 7. Save slot (with final new values) + create checkpoint snapshot
      // A day-transition checkpoint represents waking up in the Dormitory.
      await AsyncStorage.setItem(DSK.SAVE_LOCATION, "dormitory");
      const slotNum = await updateSaveSlot(newDay, newSta, newLife);
      if (slotNum > 0) {
        await createSnapshot(slotNum, "day_transition");
        const rawUpdatedStats = await AsyncStorage.getItem(PLAYER_STATS_KEY);
        if (rawUpdatedStats) setPlayerStats(normalizePlayerStats(JSON.parse(rawUpdatedStats)));
      }

      // ── 8. Switch to morning; the focus effect crossfades the music
      setRS("ROOM_MORNING");
      morningBirdsPlayedRef.current = false;

      await new Promise(res => setTimeout(res, 200));

      // ── 9. Fade from black → birds play on morning reveal
      fadeOpacity.value = withTiming(0, { duration: 700 }, (done) => {
        if (done) runOnJS(onMorningDone)();
      });
    } catch (err) {
      console.error("[Room] Day change failed:", err);
      // Recover
      setRS("ROOM_MORNING");
      fadeOpacity.value = withTiming(0, { duration: 700 }, () => {
        runOnJS(onMorningDone)();
      });
    }
  }

  function onMorningDone() {
    setSleepTransitioning(false);
    isDayTransitionRef.current = false;
    // Play morning birds once (with duck) on morning reveal
    playMorningBirdsOnce();
    // Start regen animation
    const regen = regenPending.current;
    if (regen) {
      regenPending.current = null;
      animateRegen(regen);
    }
  }

  function animateRegen({
    oldSta, newSta, oldLife, newLife,
  }: { oldSta: number; newSta: number; oldLife: number; newLife: number }) {
    const staGain  = newSta  - oldSta;
    const lifeGain = newLife - oldLife;

    // Centralized float config (matches garden/kitchen)
    const FLOAT_DUR = 2200;
    const FLOAT_RISE = 32;
    const FLOAT_FADE_IN = 200;
    const FLOAT_FADE_OUT = 400;

    if (staGain > 0) {
      staminaSV.value = withTiming(newSta, { duration: 900 });
      // Animate display counter
      const steps = 18;
      const stepVal = staGain / steps;
      for (let i = 1; i <= steps; i++) {
        setTimeout(() => {
          setStaminaDisplay(Math.min(Math.round(oldSta + stepVal * i), newSta));
        }, (900 / steps) * i);
      }
      // Floating text — slower, softer
      setRegenStaText(`+${staGain}`);
      regenStaY.value = 0;
      regenStaOp.value = 0;
      regenStaOp.value = withTiming(1, { duration: FLOAT_FADE_IN });
      regenStaY.value = withTiming(-FLOAT_RISE, { duration: FLOAT_DUR });
      setTimeout(() => {
        regenStaOp.value = withTiming(0, { duration: FLOAT_FADE_OUT }, (done) => {
          if (done) runOnJS(setRegenStaText)(null);
        });
      }, FLOAT_DUR - FLOAT_FADE_OUT);
    } else {
      staminaSV.value = newSta;
      setStaminaDisplay(newSta);
    }

    if (lifeGain > 0) {
      lifeSV.value = withTiming(newLife, { duration: 900 });
      // Floating text — slower, softer
      setRegenLifeText(`+${lifeGain}`);
      regenLifeY.value = 0;
      regenLifeOp.value = 0;
      regenLifeOp.value = withTiming(1, { duration: FLOAT_FADE_IN });
      regenLifeY.value = withTiming(-FLOAT_RISE, { duration: FLOAT_DUR });
      setTimeout(() => {
        regenLifeOp.value = withTiming(0, { duration: FLOAT_FADE_OUT }, (done) => {
          if (done) runOnJS(setRegenLifeText)(null);
        });
      }, FLOAT_DUR - FLOAT_FADE_OUT);
      // Animate life display counter
      const steps = 18;
      const stepVal = lifeGain / steps;
      for (let i = 1; i <= steps; i++) {
        setTimeout(() => {
          setLifeCurrent(Math.min(Math.round(oldLife + stepVal * i), newLife));
        }, (900 / steps) * i);
      }
    } else {
      lifeSV.value = newLife;
      setLifeCurrent(newLife);
    }
  }

  async function updateSaveSlot(day: number, stamina: number, life: number): Promise<number> {
    try {
      const rawSlot  = await AsyncStorage.getItem(DSK.ACTIVE_SLOT);
      const rawSlots = await AsyncStorage.getItem(DSK.GAME_SLOTS);
      if (!rawSlot || !rawSlots) return -1;
      const slotNum = parseInt(rawSlot, 10);
      const slots   = JSON.parse(rawSlots);
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
        await AsyncStorage.setItem(DSK.SAVE_LOCATION, "dormitory");
        await createSnapshot(slotNum, "manual");
      }
      showPlayerBubble('"Game saved."', 2000);
    } catch {
      showPlayerBubble('"Save failed."', 2000);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Main Menu — discard unsaved runtime state first
  // ─────────────────────────────────────────────────────────────────────────
  async function handleMainMenu() {
    setShowMenu(false);
    audioManager.stopGameplayMusic(1500);
    try {
      const rawSlot = await AsyncStorage.getItem(DSK.ACTIVE_SLOT);
      if (rawSlot) {
        await discardRuntimeAndRestore(parseInt(rawSlot, 10));
      }
    } catch { /* non-critical */ }
    router.replace("/");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Go downstairs
  // ─────────────────────────────────────────────────────────────────────────
  function afterDownstairsFade() {
    audioManager.stopSoundEffect('walking-on-wood');
    router.replace("/kitchen");
  }

  async function handleGoDownstairs() {
    // Day 3+: always allow going downstairs (player can check and come back)
    // Day 1 & 2: tutorial restriction (must sleep before first leaving)
    if (dayIdx <= 1 && mustSleep && !firstSleepDone) {
      showPlayerBubble('"I should go to sleep."', 2000);
      return;
    }
    if (downstairsLocked.current || isDayTransitionRef.current) return;
    downstairsLocked.current = true;
    setRS("LEAVING_ROOM");

    audioManager.playSoundEffect('walking-on-wood', { maxDurationMs: 5000 });

    // Fade to black, then navigate
    fadeOpacity.value = withTiming(1, { duration: 700 }, (done) => {
      if (done) runOnJS(afterDownstairsFade)();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Upgrades
  // ─────────────────────────────────────────────────────────────────────────
  function handleUpgradeModal() {
    if (showStorageModal || isDayTransitionRef.current) return;
    setShowUpgradeModal(true);
    setRS("UPGRADE_MODAL");
  }

  function handleUpgradeTap(upgrade: RoomUpgrade) {
    if (upgrade.completed) return;
    if (!canAfford(upgrade, sharedResources)) {
      if (upgradeMsgTimer.current) clearTimeout(upgradeMsgTimer.current);
      setUpgradeMsg("Not enough resources.");
      upgradeMsgTimer.current = setTimeout(() => setUpgradeMsg(null), 2500);
      return;
    }
    // Future: open confirmation and execute purchase
    // For now, show "not enough resources" until implementation is complete
    setUpgradeMsg("Purchase confirmed! (requires sufficient resources)");
    upgradeMsgTimer.current = setTimeout(() => setUpgradeMsg(null), 2500);
  }

  function closeUpgradeModal() {
    setShowUpgradeModal(false);
    setUpgradeMsg(null);
    setRS(timeOfDay === "morning" ? "ROOM_MORNING" : "ROOM_EVENING_INTERACTIVE");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Storage
  // ─────────────────────────────────────────────────────────────────────────
  function handleStorageModal() {
    if (showUpgradeModal || isDayTransitionRef.current || !roomStorageUnlocked) return;
    setShowStorageModal(true);
    setRS("STORAGE_MODAL");
  }

  function closeStorageModal() {
    setShowStorageModal(false);
    setRS(timeOfDay === "morning" ? "ROOM_MORNING" : "ROOM_EVENING_INTERACTIVE");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Derived
  // ─────────────────────────────────────────────────────────────────────────
  const isEvening            = timeOfDay === "evening";
  const isMorning            = timeOfDay === "morning";
  // Day 3+: always allowed to go downstairs (not-tired-enough is not a lock)
  // Day 1 & 2: tutorial restricts until first sleep
  // staminaSpentToday is kept in state so it can be displayed/used in future features
  const canGoDownstairs      = dayIdx >= 2 ? (staminaSpentToday >= 0) : (isMorning || (!mustSleep && firstSleepDone));
  const optionsInteractive   = roomState === "ROOM_EVENING_INTERACTIVE" || roomState === "ROOM_MORNING";
  const incompleteUpgrades   = roomUpgrades.filter(u => !u.completed);

  const roomDisplayName = playerName && playerName.trim().length > 0
    ? `${playerName}'s Room`
    : "Your Room";

  // Background height computed inside SceneBackground component

  // ─────────────────────────────────────────────────────────────────────────
  // Player bubble render
  // ─────────────────────────────────────────────────────────────────────────
  function renderPlayerBubble() {
    if (!playerBubble) return null;
    const L = playerPortraitLayout.current;
    const topPos = L ? L.y + L.h + 12 : (headerH > 0 ? headerH + 140 : insets.top + 212);
    const anchorX = L ? L.x + L.w / 2 : W * 0.32;
    const isEveningIntroState = roomState === "ROOM_EVENING_INTRO";
    return (
      <TouchableOpacity
        style={[StyleSheet.absoluteFill, { zIndex: 410 }]}
        onPress={() => isEveningIntroState ? dismissPlayerBubble(true) : dismissPlayerBubble(false)}
        activeOpacity={1}
      >
        <PortraitBubble anchorX={anchorX} screenWidth={W} text={playerBubble} top={topPos} />
      </TouchableOpacity>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // JSX
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <CurrencyHud />
      {/* ── Background (responsive, top-aligned, no cover zoom) ── */}
      <SceneBackground source={isEvening ? IMG.room_evening : IMG.room_morning} topOffset={headerH} />
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
                  }}
                >
                  <Animated.View style={[styles.statBarFill, styles.staminaFill, staminaFillStyle]}>
                    <View style={styles.staminaReflex} />
                  </Animated.View>
                </View>
                {regenStaText && (
                  <Animated.View style={[styles.regenFloat, regenStaStyle]} pointerEvents="none">
                    <Text style={styles.regenStaText}>{regenStaText}</Text>
                  </Animated.View>
                )}
              </View>
              <Text style={styles.statBarText}>{staminaDisplay}/{playerStats.maximumStamina}</Text>
            </View>
            {/* Life bar */}
            <View style={styles.statBarOuter}>
              <Ionicons name="heart" size={13} color="#CC2200" />
              <View style={styles.statBarTrackWrap}>
                <View style={styles.statBarTrack}>
                  <Animated.View style={[styles.statBarFill, styles.lifeFill, lifeFillStyle]} />
                </View>
                {regenLifeText && (
                  <Animated.View style={[styles.regenFloat, regenLifeStyle]} pointerEvents="none">
                    <Text style={styles.regenLifeText}>{regenLifeText}</Text>
                  </Animated.View>
                )}
              </View>
              <Text style={styles.statBarText}>{lifeCurrent}/{playerStats.maximumLife}</Text>
            </View>
          </View>

          <View style={styles.rightHeader}>
            <View style={styles.dayBadge}>
              <Text style={styles.dayText}>{DAYS[dayIdx]}</Text>
            </View>
            <TouchableOpacity style={styles.menuBtn} onPress={() => setShowMenu(true)} activeOpacity={0.8}>
              <Ionicons name="menu" size={22} color="#F5E6C8" />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.locationName}>{roomDisplayName}</Text>
      </View>

      {/* ── Scroll area ── */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
        bounces={false}
        scrollEnabled={!sleepTransitioning}
      >
        {/* Portrait row: player + locked bag (NO Rupert) */}
        <View style={styles.portraitRow}>
          <TouchableOpacity
            ref={playerPortraitRef}
            style={styles.circleWrap}
            onPress={() => setStatusOpen(true)}
            activeOpacity={0.8}
          >
            <Image source={avatarSrc(playerAvatarId, staminaCurrent)} style={[styles.circleImg, styles.playerPortraitImage]} resizeMode="cover" resizeMethod="resize" />
          </TouchableOpacity>
          <View style={[styles.circleWrap, styles.bagCircle]}>
            <Ionicons name="lock-closed" size={28} color="rgba(150,130,100,0.55)" />
          </View>
        </View>

        {/* Room options */}
        {(roomState !== "LOADING" && roomState !== "ENTERING_ROOM_FIRST_TIME") && (
          <View style={styles.optionsCard}>
            {/* Go to sleep */}
            <RoomOption
              icon="moon-outline"
              label="Go to sleep."
              onPress={optionsInteractive ? handleGoToSleep : undefined}
              dimmed={isMorning}
              disabled={!optionsInteractive || isDayTransitionRef.current}
            />

            {/* Upgrade Room */}
            <RoomOption
              icon="hammer-outline"
              label="Upgrade Room"
              onPress={optionsInteractive ? handleUpgradeModal : undefined}
              disabled={!optionsInteractive || isDayTransitionRef.current}
            />

            {/* Check Storage (only when unlocked) */}
            {roomStorageUnlocked && (
              <RoomOption
                icon="grid-outline"
                label="Check Storage"
                onPress={optionsInteractive ? handleStorageModal : undefined}
                disabled={!optionsInteractive}
              />
            )}

            {/* Go downstairs — always last */}
            <RoomOption
              icon="arrow-down-outline"
              label="Go downstairs."
              onPress={optionsInteractive ? handleGoDownstairs : undefined}
              dimmed={!canGoDownstairs}
              disabled={!optionsInteractive || isDayTransitionRef.current}
              isLast
            />
          </View>
        )}
      </ScrollView>

      {/* ── Menu Modal ── */}
      <Modal visible={showMenu} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.confirmPanel}>
            <Text style={styles.confirmTitle}>Menu</Text>
            <View style={{ height: 1, backgroundColor: "rgba(196,148,58,0.22)", marginVertical: 8 }} />
            {[
              { icon: "play" as const,          label: "Resume",    action: () => setShowMenu(false) },
              { icon: "book-outline" as const,   label: "Logbook",   action: () => { setShowMenu(false); router.push("/logbook"); } },
              { icon: "save-outline" as const,   label: "Save",      action: handleManualSave },
              { icon: "home-outline" as const,   label: "Main Menu", action: handleMainMenu },
              { icon: "settings-outline" as const, label: "Settings", action: () => { setShowMenu(false); router.push("/settings"); } },
            ].map((item) => (
              <TouchableOpacity
                key={item.label}
                style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 13, paddingHorizontal: 6, borderRadius: 10 }}
                onPress={item.action}
                activeOpacity={0.7}
              >
                <Ionicons name={item.icon} size={20} color="#C4943A" />
                <Text style={{ color: "#F0E8D5", fontSize: 15, fontFamily: "Oldenburg", letterSpacing: 0.4 }}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* ── Sleep confirmation modal ── */}
      <Modal visible={sleepConfirmOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.confirmPanel}>
            <Text style={styles.confirmTitle}>Go to sleep and end the day?</Text>
            <Text style={styles.confirmSub}>Your progress will be saved automatically.</Text>
            <View style={styles.confirmBtns}>
              <TouchableOpacity style={styles.confirmBtnCancel} onPress={handleSleepCancel} activeOpacity={0.8}>
                <Text style={styles.confirmBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtnSleep} onPress={handleSleepConfirm} activeOpacity={0.8}>
                <Ionicons name="moon" size={16} color="#F5E6C8" />
                <Text style={[styles.confirmBtnText, { marginLeft: 6 }]}>Sleep</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Upgrade Room modal ── */}
      <Modal visible={showUpgradeModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.upgradePanel, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.upgradeTitleRow}>
              <Text style={styles.panelTitle}>Upgrade Room</Text>
              <TouchableOpacity style={styles.closeBtnCircle} onPress={closeUpgradeModal} activeOpacity={0.8} hitSlop={8}>
                <Ionicons name="close" size={18} color="#F5E6C8" />
              </TouchableOpacity>
            </View>
            <View style={styles.divider} />

            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              {incompleteUpgrades.length === 0 ? (
                <Text style={styles.noUpgradesText}>No upgrades available.</Text>
              ) : (
                incompleteUpgrades.map((upg) => (
                  <UpgradeRow
                    key={upg.id}
                    upgrade={upg}
                    resources={sharedResources}
                    onTap={() => handleUpgradeTap(upg)}
                  />
                ))
              )}
              {upgradeMsg ? (
                <Text style={styles.upgradeMsg}>{upgradeMsg}</Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Room Storage modal ── */}
      <Modal visible={showStorageModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.storagePanel, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.upgradeTitleRow}>
              <Text style={styles.panelTitle}>Room Storage</Text>
              <TouchableOpacity style={styles.closeBtnCircle} onPress={closeStorageModal} activeOpacity={0.8} hitSlop={8}>
                <Ionicons name="close" size={18} color="#F5E6C8" />
              </TouchableOpacity>
            </View>
            <View style={styles.divider} />
            <Text style={styles.storageSub}>2 rows × 6 columns · 12 slots</Text>
            {/* 12-slot grid */}
            <View style={styles.storageGrid}>
              {roomStorage.map((_, idx) => (
                <View key={idx} style={styles.storageSlot}>
                  <Ionicons name="square-outline" size={22} color="rgba(196,148,58,0.18)" />
                </View>
              ))}
            </View>
            <Text style={styles.storageSub2}>Item transfer — coming soon.</Text>
          </View>
        </View>
      </Modal>

      {/* ── Player Status / Growth Points ── */}
      <StatusModal
        visible={statusOpen}
        stats={playerStats}
        currentStamina={staminaCurrent}
        currentLife={lifeCurrent}
        onClose={() => setStatusOpen(false)}
        onStatsUpdated={(newStats, newLife) => {
          setPlayerStats(newStats);
          staminaMaxSV.value = newStats.maximumStamina;
          lifeMaxSV.value = newStats.maximumLife;
          if (newLife !== null) {
            setLifeCurrent(newLife);
            lifeSV.value = newLife;
            AsyncStorage.setItem(DSK.LIFE, String(newLife)).catch(() => {});
          }
          AsyncStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(newStats)).catch(() => {});
        }}
      />

      {/* ── Transition blocking overlay ── */}
      {(sleepTransitioning || isDayTransitionRef.current) && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 900 }]} pointerEvents="box-only" />
      )}

      {/* ── Fade-to-black overlay ── */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.fadeBlack, fadeStyle, { zIndex: 1000 }]}
        pointerEvents={sleepTransitioning ? "box-only" : "none"}
      />

      {/* ── Player thought bubble ── */}
      {renderPlayerBubble()}
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type RoomOptionProps = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress?: () => void;
  dimmed?: boolean;
  disabled?: boolean;
  isLast?: boolean;
};

function RoomOption({ icon, label, onPress, dimmed, disabled, isLast }: RoomOptionProps) {
  return (
    <TouchableOpacity
      style={[styles.optionRow, isLast && styles.optionRowLast, dimmed && styles.optionRowDimmed]}
      onPress={disabled ? undefined : onPress}
      disabled={disabled && !dimmed}
      activeOpacity={0.7}
    >
      <Ionicons
        name={icon}
        size={20}
        color={dimmed ? "rgba(196,148,58,0.35)" : "#C4943A"}
        style={{ marginRight: 14 }}
      />
      <Text style={[styles.optionLabel, dimmed && styles.optionLabelDimmed]}>{label}</Text>
      {!dimmed && <Ionicons name="chevron-forward" size={16} color="rgba(196,148,58,0.4)" />}
    </TouchableOpacity>
  );
}

type UpgradeRowProps = {
  upgrade: RoomUpgrade;
  resources: SharedResources;
  onTap: () => void;
};

function UpgradeRow({ upgrade, resources, onTap }: UpgradeRowProps) {
  const affordable = canAfford(upgrade, resources);

  return (
    <TouchableOpacity style={styles.upgradeRow} onPress={onTap} activeOpacity={0.8}>
      <Text style={styles.upgradeName}>{upgrade.displayName}</Text>
      {/* Effects */}
      <View style={styles.upgradeEffects}>
        {upgrade.effects.sleepStaminaRecovery ? (
          <Text style={styles.upgradeEffect}>⚡ +{upgrade.effects.sleepStaminaRecovery} Stamina Recovery</Text>
        ) : null}
        {upgrade.effects.sleepLifeRecovery ? (
          <Text style={styles.upgradeEffect}>♥ +{upgrade.effects.sleepLifeRecovery} Life Recovery</Text>
        ) : null}
        {upgrade.effects.unlockRoomStorage ? (
          <Text style={styles.upgradeEffect}>🗄 Unlocks Room Storage</Text>
        ) : null}
      </View>
      {/* Costs */}
      <View style={styles.upgradeCosts}>
        {(Object.entries(upgrade.costs) as [ResourceId, number][]).map(([res, qty]) => {
          const have    = resources[res] ?? 0;
          const missing = have < qty;
          return (
            <Text key={res} style={[styles.upgradeCostItem, missing && styles.upgradeCostMissing]}>
              {RESOURCE_NAMES[res]} {have}/{qty}
            </Text>
          );
        })}
      </View>
      {!affordable && (
        <View style={styles.upgradeNotAffordBadge}>
          <Text style={styles.upgradeNotAffordText}>Not enough resources.</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: "#0A0500" },
  bgOverlay: { backgroundColor: "rgba(0,0,0,0.30)" },
  fadeBlack: { backgroundColor: "#000" },

  header: {
    flexDirection: "column", paddingHorizontal: 12, paddingBottom: 6,
    backgroundColor: "rgba(14,7,1,0.85)",
    borderBottomWidth: 1, borderBottomColor: "rgba(196,148,58,0.20)",
    zIndex: 2,
  },
  headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  leftHeader:   { flex: 1, gap: 5 },
  statBarOuter: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(10,5,0,0.82)", borderRadius: 18,
    borderWidth: 1.5, borderColor: "rgba(130,90,20,0.50)",
    paddingHorizontal: 10, paddingVertical: 5, gap: 7,
  },
  statBarTrackWrap: { flex: 1, height: 9, position: "relative", overflow: "visible" },
  statBarTrack: { flex: 1, height: 9, borderRadius: 5, backgroundColor: "#2A1800", overflow: "hidden" },
  statBarFill:  { height: "100%", borderRadius: 5 },
  staminaFill:  { backgroundColor: "#C4943A" },
  staminaReflex: {
    position: "absolute", top: 0, left: 0, right: 0, height: "45%",
    backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 4,
  },
  lifeFill:     { backgroundColor: "#CC2200" },
  statBarText:  { color: "#F0E8D5", fontSize: 11, fontFamily: "Oldenburg", minWidth: 40, textAlign: "right" },
  regenFloat:   { position: "absolute", right: -8, top: 12, zIndex: 500 },
  regenStaText: { color: "#C4943A", fontFamily: "Oldenburg", fontSize: 13, fontWeight: "700" },
  regenLifeText:{ color: "#CC2200", fontFamily: "Oldenburg", fontSize: 13, fontWeight: "700" },
  locationName: { color: "#F0E8D5", fontSize: 13, fontFamily: "Oldenburg", letterSpacing: 1, textAlign: "center", marginTop: 4 },
  rightHeader:  { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 10 },
  dayBadge: {
    width: 38, height: 38, borderRadius: 8,
    backgroundColor: "rgba(196,148,58,0.16)",
    borderWidth: 1.5, borderColor: "rgba(196,148,58,0.38)",
    alignItems: "center", justifyContent: "center",
  },
  dayText:  { color: "#F5E6C8", fontSize: 13, fontFamily: "Oldenburg", letterSpacing: 0.5 },
  menuBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: "rgba(196,148,58,0.16)",
    borderWidth: 1.5, borderColor: "rgba(196,148,58,0.38)",
    alignItems: "center", justifyContent: "center",
  },

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
  circleImg: { width: "100%", height: "100%" },
  playerPortraitImage: { transform: [{ scale: 1.06 }] },
  bagCircle: {
    borderColor: "#3A3A3A", backgroundColor: "#1A1A1A",
    alignItems: "center", justifyContent: "center",
  },
  lockBadge: {
    position: "absolute", bottom: 4, right: 4,
    backgroundColor: "rgba(20,12,4,0.85)", borderRadius: 8,
    padding: 2, borderWidth: 1, borderColor: "#444",
  },

  // Room options card
  optionsCard: {
    marginHorizontal: 20, marginTop: 18,
    backgroundColor: "rgba(14,8,2,0.90)",
    borderRadius: 18, borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.35)",
    overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5, shadowRadius: 12, elevation: 16,
  },
  optionRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 16, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: "rgba(196,148,58,0.14)",
    minHeight: 56,
  },
  optionRowLast:   { borderBottomWidth: 0 },
  optionRowDimmed: { opacity: 0.45 },
  optionLabel:      { flex: 1, color: "#F0E8D5", fontSize: 15, fontFamily: "Oldenburg", letterSpacing: 0.4 },
  optionLabelDimmed:{ color: "rgba(240,232,213,0.45)" },

  morningGreet: {
    textAlign: "center", color: "rgba(196,148,58,0.55)", fontStyle: "italic",
    fontFamily: "Oldenburg", fontSize: 14, marginTop: 20,
  },

  // Modals
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.76)",
    alignItems: "center", justifyContent: "center",
  },
  confirmPanel: {
    width: "82%", backgroundColor: "#160B03", borderRadius: 20, padding: 24,
    borderWidth: 1.5, borderColor: "rgba(196,148,58,0.38)",
    alignItems: "center", gap: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 16, elevation: 24,
  },
  confirmTitle: { color: "#F5E6C8", fontSize: 17, fontFamily: "Oldenburg", letterSpacing: 0.8, textAlign: "center" },
  confirmSub:   { color: "rgba(240,232,213,0.60)", fontSize: 13, fontStyle: "italic", textAlign: "center" },
  confirmBtns:  { flexDirection: "row", gap: 14, marginTop: 8 },
  confirmBtnCancel: {
    flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12,
    backgroundColor: "rgba(196,148,58,0.10)", borderWidth: 1, borderColor: "rgba(196,148,58,0.30)",
  },
  confirmBtnSleep: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 12, borderRadius: 12,
    backgroundColor: "rgba(50,50,140,0.28)", borderWidth: 1, borderColor: "rgba(100,100,220,0.35)",
  },
  confirmBtnText: { color: "#F5E6C8", fontSize: 15, fontFamily: "Oldenburg" },

  // Upgrade modal
  upgradePanel: {
    width: "88%", maxHeight: "85%", backgroundColor: "#160B03", borderRadius: 20,
    padding: 20, borderWidth: 1.5, borderColor: "rgba(196,148,58,0.38)",
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 16, elevation: 24,
  },
  upgradeTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  panelTitle:      { color: "#F5E6C8", fontSize: 18, fontFamily: "Oldenburg", letterSpacing: 1 },
  closeBtnCircle: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "rgba(196,148,58,0.16)",
    borderWidth: 1, borderColor: "rgba(196,148,58,0.30)",
    alignItems: "center", justifyContent: "center",
  },
  divider: { height: 1, backgroundColor: "rgba(196,148,58,0.22)", marginVertical: 10 },
  noUpgradesText: { color: "rgba(240,232,213,0.45)", fontStyle: "italic", fontSize: 14, textAlign: "center", marginVertical: 16 },
  upgradeMsg:     { color: "#C4943A", fontSize: 13, fontStyle: "italic", textAlign: "center", marginTop: 10 },

  upgradeRow: {
    paddingVertical: 14, paddingHorizontal: 14,
    marginBottom: 10, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1, borderColor: "rgba(196,148,58,0.18)",
  },
  upgradeName:    { color: "#F5E6C8", fontSize: 14, fontFamily: "Oldenburg", marginBottom: 4 },
  upgradeEffects: { flexDirection: "column", gap: 2, marginBottom: 6 },
  upgradeEffect:  { color: "rgba(196,148,58,0.80)", fontSize: 12 },
  upgradeCosts:   { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  upgradeCostItem: { color: "rgba(240,232,213,0.65)", fontSize: 12, fontFamily: "Oldenburg" },
  upgradeCostMissing: { color: "#CC4400", fontWeight: "700" },
  upgradeNotAffordBadge: {
    marginTop: 6, backgroundColor: "rgba(200,50,20,0.12)", borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start",
  },
  upgradeNotAffordText: { color: "#CC4400", fontSize: 11, fontFamily: "Oldenburg" },

  // Storage modal
  storagePanel: {
    width: "90%", maxHeight: "75%", backgroundColor: "#160B03", borderRadius: 20,
    padding: 20, borderWidth: 1.5, borderColor: "rgba(196,148,58,0.38)",
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 16, elevation: 24,
  },
  storageSub:  { color: "rgba(196,148,58,0.55)", fontSize: 11, fontStyle: "italic", textAlign: "center", marginBottom: 10 },
  storageSub2: { color: "rgba(196,148,58,0.35)", fontSize: 11, fontStyle: "italic", textAlign: "center", marginTop: 10 },
  storageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" },
  storageSlot: {
    width: 50, height: 50, borderRadius: 8,
    backgroundColor: "rgba(196,148,58,0.05)",
    borderWidth: 1, borderColor: "rgba(196,148,58,0.18)",
    alignItems: "center", justifyContent: "center",
  },
});
