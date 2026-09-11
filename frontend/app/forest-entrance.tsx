import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useManagedTimers } from "@/src/hooks/use-managed-timers";
import { Animated, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions, type ImageSourcePropType } from "react-native";
import Reanimated, { runOnJS, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { useEventListener } from "expo";
import { useFocusEffect, useRouter } from "expo-router";
import { VideoView, useVideoPlayer } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import SceneBackground from "@/src/components/SceneBackground";
import TravelHeader from "@/src/components/travel-header";
import DeathAngelOverlay from "@/src/components/death-angel-overlay";
import ItemDurabilityBadge from "@/src/components/item-durability-badge";
import { getItemImageSource } from "@/src/components/PlayerBag";
import { useAudioManager } from "@/src/audio/AudioProvider";
import { useHaptics } from "@/src/feedback/haptics-provider";
import {
  FOREST_FLOOR_COUNT, FOREST_FORWARD_STAMINA_COST, FOREST_MONSTERS, FOREST_REST_FLOORS,
  FOREST_SEARCH_BASE_SUCCESS, FOREST_SEARCH_PERCEPTION_BONUS,
  getForestAttackPreview,
  ambushHiddenForestMonster, attackForestMonster, bandageAtForestRestArea, defendAgainstForestMonster, escapeForestCombat,
  collectPendingForestCarcass, dismissPendingForestLoot, enterForestDungeon, forestAreaForFloor, goForwardInForest, hideFromForestMonster, leaveForestDungeon, letHiddenForestMonsterPass, searchForestArea,
  type DungeonActionResult, type ForestDungeonState, type ForestMonsterId,
} from "@/src/game/forest-dungeon-system";
import { beginChosenNextRun, repeatForestFight } from "@/src/game/death-angel-system";
import { loadProgressionState } from "@/src/game/progression";
import type { NextRunBonuses } from "@/src/game/next-run";
import { DEFAULT_PLAYER_STATS, PLAYER_STATS_KEY, normalizePlayerStats } from "@/src/game/player-stats";
import { completeDungeonDayTransition } from "@/src/game/dungeon-day-transition";
import { EMBER_ROOSTER_ENCOUNTER_SEEN_KEY } from "@/src/game/encounter-cinematics";
import { activeSupporter, discardSupporterItem, eatSupporterItem, loadSupporterBag, moveSupporterItemToPlayer, type SupporterId } from "@/src/game/city-system";
import { DEFAULT_BAG, ITEM_ATTRIBUTE, ITEM_CATALOG, PLAYER_BAG_KEY, hasItemAttribute, isConsumable, isEdible, normalizePlayerBagData, type BagItem, type PlayerBagData } from "@/src/game/item-system";
import { setGameplayBackBlocked } from "@/src/components/gameplay-back-guard";
import { PLAYER_AVATAR_KEY, type PlayerAvatarId } from "@/src/game/player-avatar";

const BACKGROUNDS: Record<ReturnType<typeof forestAreaForFloor>, ImageSourcePropType> = {
  "Forest Edge": require("../assets/images/forest_edge.png"),
  "Deeper Forest": require("../assets/images/forest_deeper.png"),
  "Forest Heart": require("../assets/images/forest_heart.png"),
  "Forest Rest Area": require("../assets/images/forest_rest_area.png"),
  "Forest Nest": require("../assets/images/forest_nest.png"),
};
const ELDER_EMBER_ROOSTER_BACKGROUND = require("../assets/images/forest_heart_boss.png");
const HUNTERS_CAMP_BACKGROUND = require("../assets/images/hunters_camp.png");
const EMBER_ROOSTER_ENCOUNTER_VIDEO = require("../assets/video/encounter_ember_rooster.mp4");
const MONSTER_IMAGES: Record<ForestMonsterId, ImageSourcePropType> = {
  forest_slime: require("../assets/images/forest_slime.png"),
  feral_rabbit: require("../assets/images/feral_rabbit.png"),
  wild_boar: require("../assets/images/wild_boar.png"),
  wild_wolf: require("../assets/images/wild_wolf.png"),
  ember_chick: require("../assets/images/ember_chick.png"),
  ember_chicken: require("../assets/images/ember_chicken.png"),
  ember_rooster: require("../assets/images/ember_rooster.png"),
  goblin_forager: require("../assets/images/goblin_forager.png"),
  elder_ember_rooster: require("../assets/images/elder_ember_rooster.png"),
};
const SUPPORTER_IMAGES: Record<SupporterId, ImageSourcePropType> = {
  normal: require("../assets/images/porter_normal.png"), healer: require("../assets/images/porter_healer.png"),
  cleric: require("../assets/images/porter_cleric.png"), botanist: require("../assets/images/porter_botanist.png"),
};
const ATTACK_IMAGES = {
  slash: require("../assets/images/slash.png"),
  critical: require("../assets/images/critical.png"),
  punch: require("../assets/images/punch.png"),
} as const;

function CombatMessage({ message }: { message: string }) {
  const sentences = message.match(/[^.!?]+[.!?]?/g) ?? [message];
  return <Text selectable style={styles.message}>{sentences.map((sentence, index) => {
    const cleanSentence = sentence.trim();
    const received = /hits me for \d+ damage|lose \d+ Life/i.test(cleanSentence);
    const dealt = /I hit .* for \d+ damage|strike critically for \d+ damage|strikes for \d+ damage/i.test(cleanSentence);
    return <Text key={`${index}-${cleanSentence}`} style={received ? styles.damageReceived : dealt ? styles.damageDealt : undefined}>{index > 0 ? " " : ""}{cleanSentence}</Text>;
  })}</Text>;
}

function LootFlightOverlay({ flights, width, height, headerHeight }: { flights: NonNullable<DungeonActionResult["lootFlights"]>; width: number; height: number; headerHeight: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: 950, useNativeDriver: true }).start();
  }, [progress]);
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>{flights.map((flight, index) => {
    const image = getItemImageSource(flight.item.id);
    if (!image) return null;
    const targetX = flight.destination === "supporter" ? width * 0.52 : width * 0.78;
    return <Animated.Image key={`${flight.item.id}-${index}`} source={image} resizeMode="contain" style={[styles.lootFlightImage, {
      left: width * 0.5 - 25 + index * 5,
      top: height * 0.40 + index * 4,
      opacity: progress.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
      transform: [
        { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, targetX - width * 0.5] }) },
        { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, headerHeight + 92 - height * 0.40] }) },
        { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }) },
      ],
    }]} />;
  })}</View>;
}

type ActionButtonProps = { label: string; subtitle?: string; disabled?: boolean; danger?: boolean; onPress: () => void };
function ActionButton({ label, subtitle, disabled = false, danger = false, onPress }: ActionButtonProps) {
  return <TouchableOpacity style={[styles.actionButton, danger && styles.dangerButton, disabled && styles.disabledButton]} disabled={disabled} onPress={onPress} activeOpacity={0.8}>
    <Text style={[styles.actionText, danger && styles.dangerText]}>{label}</Text>
    {subtitle ? <Text style={styles.actionSubtitle}>{subtitle}</Text> : null}
  </TouchableOpacity>;
}

export default function ForestEntranceScreen() {
  const { setManagedTimeout: setTimeout } = useManagedTimers();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { crossfadeTo, stopGameplayMusic, playSoundEffect } = useAudioManager();
  const { triggerHaptic } = useHaptics();
  const [headerHeight, setHeaderHeight] = useState(0);
  const [state, setState] = useState<ForestDungeonState | null>(null);
  const [message, setMessage] = useState("The forest path stretches deeper ahead.");
  const [busy, setBusy] = useState(false);
  const [headerRefreshKey, setHeaderRefreshKey] = useState(0);
  const [currentLife, setCurrentLife] = useState(1);
  const [maximumLife, setMaximumLife] = useState(DEFAULT_PLAYER_STATS.maximumLife);
  const [combatStats, setCombatStats] = useState(DEFAULT_PLAYER_STATS);
  const [combatBag, setCombatBag] = useState<PlayerBagData>(DEFAULT_BAG);
  const [karmaPoints, setKarmaPoints] = useState(0);
  const [deathError, setDeathError] = useState<string | null>(null);
  const [entryConfirmed, setEntryConfirmed] = useState(false);
  const [returnNarrationVisible, setReturnNarrationVisible] = useState(false);
  const [emberRoosterEncounterSeen, setEmberRoosterEncounterSeen] = useState<boolean | null>(null);
  const [encounterVideoVisible, setEncounterVideoVisible] = useState(false);
  const [supporter, setSupporter] = useState<Awaited<ReturnType<typeof activeSupporter>>>(null);
  const [supporterBag, setSupporterBag] = useState<PlayerBagData | null>(null);
  const [supporterBagOpen, setSupporterBagOpen] = useState(false);
  const [contractVisible, setContractVisible] = useState(false);
  const [floorTransitionActive, setFloorTransitionActive] = useState(false);
  const [supporterAction, setSupporterAction] = useState<{ slot: number; item: BagItem } | null>(null);
  const [attackEffect, setAttackEffect] = useState<keyof typeof ATTACK_IMAGES | null>(null);
  const [defeatedMonsterVisible, setDefeatedMonsterVisible] = useState(false);
  const [lootFlights, setLootFlights] = useState<NonNullable<DungeonActionResult["lootFlights"]>>([]);
  const scrollRef = useRef<ScrollView>(null);
  const contractShown = useRef(false);
  const returnFade = useRef(new Animated.Value(0)).current;
  const monsterAttackScale = useSharedValue(1);
  const monsterAttackOffset = useSharedValue(0);
  const monsterOpacity = useSharedValue(1);
  const floorBackgroundScale = useSharedValue(1);
  const floorBlackOpacity = useSharedValue(0);
  const monsterAttackStyle = useAnimatedStyle(() => ({
    opacity: monsterOpacity.value,
    transform: [
      { translateY: monsterAttackOffset.value },
      { scale: monsterAttackScale.value },
    ],
  }));
  const floorBackgroundStyle = useAnimatedStyle(() => ({
    transform: [{ scale: floorBackgroundScale.value }],
  }));
  const floorBlackStyle = useAnimatedStyle(() => ({ opacity: floorBlackOpacity.value }));
  const encounterVideoVisibleRef = useRef(false);
  const encounterCompletionRef = useRef(false);
  const encounterVideoPlayer = useVideoPlayer(EMBER_ROOSTER_ENCOUNTER_VIDEO, (player) => {
    player.loop = false;
  });

  const finishEmberRoosterEncounter = useCallback(async () => {
    if (!encounterVideoVisibleRef.current || encounterCompletionRef.current) return;
    encounterCompletionRef.current = true;
    try {
      await AsyncStorage.setItem(EMBER_ROOSTER_ENCOUNTER_SEEN_KEY, "true");
    } finally {
      encounterVideoVisibleRef.current = false;
      setEmberRoosterEncounterSeen(true);
      setEncounterVideoVisible(false);
    }
  }, []);

  useEventListener(encounterVideoPlayer, "playToEnd", () => {
    void finishEmberRoosterEncounter();
  });

  useEventListener(encounterVideoPlayer, "statusChange", ({ status }) => {
    // A decoding error must never leave the player trapped behind the video.
    if (status === "error") void finishEmberRoosterEncounter();
  });

  useFocusEffect(useCallback(() => {
    if (!entryConfirmed) return undefined;
    let active = true;
    Promise.all([enterForestDungeon(), AsyncStorage.getItem("@game:life"), loadProgressionState(), AsyncStorage.getItem(PLAYER_STATS_KEY), AsyncStorage.getItem(EMBER_ROOSTER_ENCOUNTER_SEEN_KEY), AsyncStorage.getItem(PLAYER_BAG_KEY)]).then(([loaded, rawLife, progression, rawStats, rawEncounterSeen, rawBag]) => {
      if (!active) return;
      setState(loaded);
      setCurrentLife(Math.max(0, Number.parseInt(rawLife ?? "1", 10) || 0));
      setKarmaPoints(progression.karmaPoints);
      const loadedStats = rawStats ? normalizePlayerStats(JSON.parse(rawStats)) : DEFAULT_PLAYER_STATS;
      setCombatStats(loadedStats);
      setMaximumLife(loadedStats.maximumLife);
      setCombatBag(rawBag ? normalizePlayerBagData(JSON.parse(rawBag)) : DEFAULT_BAG);
      setEmberRoosterEncounterSeen(rawEncounterSeen === "true");
    }).catch(() => setMessage("The dungeon state could not be loaded."));
    return () => {
      active = false;
      encounterVideoVisibleRef.current = false;
      try { encounterVideoPlayer.pause(); } catch {}
      stopGameplayMusic(600);
    };
  }, [encounterVideoPlayer, entryConfirmed, stopGameplayMusic]));

  const floorNumber = state?.currentFloor ?? 1;
  const area = forestAreaForFloor(floorNumber);
  const floor = state?.floors[String(floorNumber)] ?? null;
  const monsterState = floor?.monster ?? null;
  const monster = monsterState ? FOREST_MONSTERS[monsterState.id] : null;
  const background = floor?.searchLocation === "Hunter's Camp"
    ? HUNTERS_CAMP_BACKGROUND
    : monsterState?.id === "elder_ember_rooster"
    ? ELDER_EMBER_ROOSTER_BACKGROUND
    : BACKGROUNDS[area];
  const isRestArea = FOREST_REST_FLOORS.has(floorNumber);
  const bossCleared = floorNumber === FOREST_FLOOR_COUNT && monsterState?.id === "elder_ember_rooster" && monsterState.phase === "defeated";
  const locationName = `${area} - ${floorNumber}/${FOREST_FLOOR_COUNT}`;
  const monsterLifePercent = monsterState ? Math.max(0, Math.min(1, monsterState.life / monsterState.maximumLife)) : 0;
  const isEmberRoosterEncounter = monsterState?.id === "ember_rooster" && monsterState.phase !== "defeated";

  useEffect(() => {
    setGameplayBackBlocked(currentLife <= 0);
    return () => setGameplayBackBlocked(false);
  }, [currentLife]);

  useEffect(() => {
    if (!isEmberRoosterEncounter || emberRoosterEncounterSeen !== false || encounterVideoVisibleRef.current) return;
    encounterCompletionRef.current = false;
    encounterVideoVisibleRef.current = true;
    setEncounterVideoVisible(true);
  }, [emberRoosterEncounterSeen, isEmberRoosterEncounter]);

  useEffect(() => {
    if (!encounterVideoVisible) return;
    stopGameplayMusic(0);
    try {
      encounterVideoPlayer.currentTime = 0;
      encounterVideoPlayer.play();
    } catch {
      void finishEmberRoosterEncounter();
    }
    return () => {
      try { encounterVideoPlayer.pause(); } catch {}
    };
  }, [encounterVideoPlayer, encounterVideoVisible, finishEmberRoosterEncounter, stopGameplayMusic]);

  useEffect(() => {
    if (currentLife <= 0) { stopGameplayMusic(500); return; }
    if (encounterVideoVisible || (isEmberRoosterEncounter && emberRoosterEncounterSeen !== true)) { stopGameplayMusic(0); return; }
    if (isRestArea) { crossfadeTo("rest-area", 650); return; }
    if (monsterState?.phase === "combat") {
      crossfadeTo(monster?.boss ? "boss-battle" : currentLife * 2 >= maximumLife ? "battle-over50" : "battle-under50", 600);
      return;
    }
    stopGameplayMusic(600);
  }, [crossfadeTo, currentLife, emberRoosterEncounterSeen, encounterVideoVisible, isEmberRoosterEncounter, isRestArea, maximumLife, monster?.boss, monsterState?.phase, stopGameplayMusic]);

  useEffect(() => { if (floor?.message) setMessage(floor.message); }, [floor?.message, floorNumber]);

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
  }, [floorNumber]);

  useEffect(() => {
    if (!state || contractShown.current) return;
    contractShown.current = true;
    void activeSupporter().then((loaded) => {
      setSupporter(loaded);
      if (loaded) setContractVisible(true);
    });
  }, [state]);

  async function openSupporterBag() {
    setSupporterBag(await loadSupporterBag());
    setSupporterBagOpen(true);
  }

  async function supporterItemAction(action: "switch" | "eat" | "discard") {
    if (!supporterAction) return;
    const result = action === "switch" ? await moveSupporterItemToPlayer(supporterAction.slot) : action === "eat" ? await eatSupporterItem(supporterAction.slot) : await discardSupporterItem(supporterAction.slot);
    setMessage(result.message); setSupporterAction(null); setSupporterBag(await loadSupporterBag()); setHeaderRefreshKey((value) => value + 1);
  }

  function playMonsterAttackAnimation() {
    monsterAttackScale.value = 1;
    monsterAttackOffset.value = 0;
    monsterAttackScale.value = withSequence(
      withTiming(1.16, { duration: 105 }),
      withTiming(1, { duration: 165 }),
    );
    monsterAttackOffset.value = withSequence(
      withTiming(14, { duration: 105 }),
      withTiming(0, { duration: 165 }),
    );
  }

  async function playPlayerAttackAnimation(kind: keyof typeof ATTACK_IMAGES) {
    setAttackEffect(kind);
    monsterOpacity.value = 1;
    playSoundEffect(kind === "punch" ? "combat-impact" : "sword-hit", { maxDurationMs: 2200 });
    monsterOpacity.value = withSequence(
      withTiming(0.22, { duration: 70 }), withTiming(1, { duration: 70 }),
      withTiming(0.22, { duration: 70 }), withTiming(1, { duration: 70 }),
      withTiming(0.22, { duration: 70 }), withTiming(1, { duration: 90 }),
    );
    await new Promise((resolve) => setTimeout(resolve, 510));
    setAttackEffect(null);
  }

  async function playDefeatAnimation(flights: NonNullable<DungeonActionResult["lootFlights"]>) {
    setDefeatedMonsterVisible(true);
    setLootFlights(flights);
    playSoundEffect(monster?.boss ? "victory-boss" : "victory", { maxDurationMs: 12000 });
    monsterOpacity.value = withSequence(
      withTiming(0.18, { duration: 300 }), withTiming(0.85, { duration: 260 }),
      withTiming(0, { duration: 430 }),
    );
    await new Promise((resolve) => setTimeout(resolve, 1050));
    setDefeatedMonsterVisible(false);
    setLootFlights([]);
    monsterOpacity.value = 1;
  }

  async function perform(action: () => Promise<DungeonActionResult>) {
    if (busy) return;
    setBusy(true); triggerHaptic("choice");
    try {
      const result = await action();
      if (result.playerAttack) await playPlayerAttackAnimation(result.playerAttack.kind);
      const monsterAttacked = /hits me for|I evade|cannot get through/i.test(result.message);
      if (monsterAttacked) {
        playMonsterAttackAnimation();
        await new Promise((resolve) => setTimeout(resolve, 105));
      }
      if (result.playerAttack?.defeated || (result.lootFlights?.length && result.state.floors[String(result.state.currentFloor)]?.monster?.phase === "defeated")) {
        setState({ ...result.state, floors: { ...result.state.floors } });
        setKarmaPoints((await loadProgressionState()).karmaPoints);
        await playDefeatAnimation(result.lootFlights ?? []);
      } else {
        setState({ ...result.state, floors: { ...result.state.floors } });
      }
      setMessage(result.life <= 0 ? "YOU DIED." : result.message);
      setCurrentLife(result.life);
      setCombatBag(result.bag);
      setHeaderRefreshKey((value) => value + 1);
      if (result.life > 0) {
        if (/misses/i.test(result.message)) playSoundEffect("sword-miss", { maxDurationMs: 2500 });
        else if (!result.playerAttack && /I hit|strike critically/i.test(result.message)) playSoundEffect("sword-hit", { maxDurationMs: 2500 });
        if (/hits me for/i.test(result.message)) playSoundEffect("combat-impact", { maxDurationMs: 2500 });
        else if (/evade|cannot get through/i.test(result.message)) playSoundEffect("attack-miss", { maxDurationMs: 2500 });
      }
    } catch { setMessage("The action could not be completed."); }
    finally { setBusy(false); }
  }

  function animateFloorTransitionValue(
    sharedValue: typeof floorBlackOpacity,
    value: number,
    duration: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      sharedValue.value = withTiming(value, { duration }, (finished) => {
        if (finished) runOnJS(resolve)();
      });
    });
  }

  async function goForwardWithTransition() {
    if (busy || floorTransitionActive) return;
    setBusy(true);
    triggerHaptic("choice");
    try {
      // Resolve the movement first, but keep rendering the current floor until
      // the screen is fully black so the next background never flashes early.
      const result = await goForwardInForest();
      if (!result.ok) {
        setMessage(result.message);
        setCurrentLife(result.life);
        setHeaderRefreshKey((value) => value + 1);
        return;
      }

      setFloorTransitionActive(true);
      floorBackgroundScale.value = 1;
      floorBlackOpacity.value = 0;
      await animateFloorTransitionValue(floorBackgroundScale, 1.14, 320);
      await animateFloorTransitionValue(floorBlackOpacity, 1, 190);

      setState({ ...result.state, floors: { ...result.state.floors } });
      setMessage(result.message);
      setCurrentLife(result.life);
      setHeaderRefreshKey((value) => value + 1);
      floorBackgroundScale.value = 1;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      await animateFloorTransitionValue(floorBlackOpacity, 0, 240);
    } catch {
      floorBackgroundScale.value = 1;
      floorBlackOpacity.value = 0;
      setMessage("The action could not be completed.");
    } finally {
      setFloorTransitionActive(false);
      setBusy(false);
    }
  }

  async function repeatFight() {
    if (busy) return;
    setBusy(true); setDeathError(null);
    try {
      const result = await repeatForestFight();
      const progression = await loadProgressionState();
      setKarmaPoints(progression.karmaPoints);
      if (!result) { setDeathError("The fight cannot be repeated or there are not enough KP."); return; }
      setState({ ...result.state, floors: { ...result.state.floors } });
      setCurrentLife(result.life); setCombatBag(result.bag); setMessage(result.message); setHeaderRefreshKey((value) => value + 1);
    } finally { setBusy(false); }
  }

  async function startNextRun(bonuses: NextRunBonuses, avatarId: PlayerAvatarId) {
    if (busy) return;
    setBusy(true); setDeathError(null);
    try {
      const rawSlot = await AsyncStorage.getItem("@game:active_slot");
      if (!rawSlot) { setDeathError("No active save slot was found."); return; }
      await AsyncStorage.setItem(PLAYER_AVATAR_KEY, String(avatarId));
      const result = await beginChosenNextRun(Number.parseInt(rawSlot, 10), bonuses);
      if (result !== "ok") {
        setDeathError("There are not enough KP for these blessings.");
        setKarmaPoints((await loadProgressionState()).karmaPoints);
        return;
      }
      router.replace("/intro");
    } catch { setDeathError("The next run could not be prepared."); }
    finally { setBusy(false); }
  }

  async function leaveSafely(useReturnBell = false) {
    if (busy) return;
    setBusy(true);
    let result: Awaited<ReturnType<typeof leaveForestDungeon>>;
    try {
      result = await leaveForestDungeon({ useReturnBell });
    } catch {
      setMessage(useReturnBell
        ? "I do not have a Return Bell I can use."
        : "I can only leave safely from a Rest Area or after clearing the dungeon.");
      setBusy(false);
      return;
    }

    setMessage(result.message);
    setCombatBag(result.bag);
    setHeaderRefreshKey((value) => value + 1);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1400));
      setReturnNarrationVisible(true);
      stopGameplayMusic(700);
      await new Promise<void>((resolve) => {
        Animated.timing(returnFade, { toValue: 1, duration: 850, useNativeDriver: true }).start(() => resolve());
      });
      await new Promise((resolve) => setTimeout(resolve, 900));
      await completeDungeonDayTransition();
      router.replace("/dormitory");
    } catch {
      returnFade.setValue(0);
      setReturnNarrationVisible(false);
      setMessage("The materials are safe, but the day could not be completed. Please try again.");
      setBusy(false);
    }
  }

  const attackPreviews = useMemo(() => monsterState ? {
    head: getForestAttackPreview(monsterState.id, "head", combatStats, combatBag),
    body: getForestAttackPreview(monsterState.id, "body", combatStats, combatBag),
  } : null, [combatBag, combatStats, monsterState]);
  const attackSubtitle = (target: "head" | "body") => {
    const preview = attackPreviews?.[target];
    if (!preview) return "";
    const damage = preview.minimumDamage === preview.maximumDamage
      ? `${preview.minimumDamage} dmg`
      : `${preview.minimumDamage}–${preview.maximumDamage} dmg`;
    return `${damage} · ${preview.hitChance}% hit chance`;
  };

  const actionContent = useMemo(() => {
    if (!state || !floor) return null;
    if (currentLife <= 0) return <View style={styles.deathCard}><Text style={styles.deathTitle}>YOU DIED.</Text><Text style={styles.deathText}>Death is waiting.</Text></View>;
    if (isRestArea) return <>
      <ActionButton label="Bandage Wounds" subtitle="10 Stamina · Restore 20% Maximum Life" disabled={busy} onPress={() => { void perform(() => bandageAtForestRestArea(false)); }} />
      <ActionButton label="Bandage Wounds with Herb" subtitle="10 Stamina + 1 Herb · Restore 30% Maximum Life" disabled={busy} onPress={() => { void perform(() => bandageAtForestRestArea(true)); }} />
      <ActionButton label="Continue" subtitle={`${FOREST_FORWARD_STAMINA_COST} Stamina`} disabled={busy} onPress={() => { void goForwardWithTransition(); }} />
      <ActionButton label="Leave Dungeon" disabled={busy} onPress={() => { void leaveSafely(); }} />
    </>;
    if (monsterState?.phase === "noticed") return <ActionButton label="Hide" subtitle="50% + Luck chance to remain unseen" disabled={busy} onPress={() => { void perform(hideFromForestMonster); }} />;
    if (monsterState?.phase === "hidden") return <View style={styles.combatGrid}>
      <ActionButton label="Ambush" subtitle="Critical damage · Keep the initiative" disabled={busy} onPress={() => { void perform(ambushHiddenForestMonster); }} />
      <ActionButton label="Hide" subtitle="Let the monster pass · Search the area" disabled={busy} onPress={() => { void perform(letHiddenForestMonsterPass); }} />
    </View>;
    if (monsterState?.phase === "combat") return <View style={styles.combatGrid}>
      <ActionButton label="Attack Head" subtitle={attackSubtitle("head")} disabled={busy} onPress={() => { void perform(() => attackForestMonster("head")); }} />
      <ActionButton label="Attack Body" subtitle={attackSubtitle("body")} disabled={busy} onPress={() => { void perform(() => attackForestMonster("body")); }} />
      <ActionButton label="Defend" subtitle="30% + Luck dodge" disabled={busy} onPress={() => { void perform(defendAgainstForestMonster); }} />
      <ActionButton label="Escape" subtitle="50% + Luck chance" danger disabled={busy} onPress={() => { void perform(escapeForestCombat); }} />
    </View>;
    if (floor.carcassPending) return <View style={styles.combatGrid}>
      <ActionButton label="Collect Battle Loot" subtitle="Free space in either bag is required" disabled={busy} onPress={() => { void perform(collectPendingForestCarcass); }} />
      <ActionButton label="Dismiss" subtitle="Leave the remaining loot behind" danger disabled={busy} onPress={() => { void perform(dismissPendingForestLoot); }} />
    </View>;
    if (bossCleared) return <ActionButton label="Leave Cleared Dungeon" subtitle="Return safely to the tavern" disabled={busy} onPress={() => { void leaveSafely(); }} />;
    return <>
      <ActionButton label="Search the area" subtitle={floor.searchAvailable && !floor.searched ? `${floor.searchCost} Stamina · ${FOREST_SEARCH_BASE_SUCCESS}% + ${FOREST_SEARCH_PERCEPTION_BONUS}% per Perception` : "Already searched"} disabled={busy || !floor.searchAvailable || floor.searched} onPress={() => { void perform(searchForestArea); }} />
      <ActionButton label="Go forward" subtitle={`${FOREST_FORWARD_STAMINA_COST} Stamina`} disabled={busy} onPress={() => { void goForwardWithTransition(); }} />
    </>;
  // perform is intentionally bound to current screen state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attackPreviews, bossCleared, busy, currentLife, floor, isRestArea, monsterState?.phase, router, state]);

  return <View style={styles.root}>
    <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, floorBackgroundStyle]}>
      <SceneBackground source={background} topOffset={headerHeight} />
    </Reanimated.View>
    <View style={[StyleSheet.absoluteFill, { top: headerHeight }, styles.backgroundShade]} pointerEvents="none" />
    <TravelHeader
      locationName={locationName}
      showPortraitRow
      onHeaderHeightChange={setHeaderHeight}
      refreshKey={headerRefreshKey}
      supporterImage={supporter ? SUPPORTER_IMAGES[supporter.definition.id] : undefined}
      onSupporterPress={() => { void openSupporterBag(); }}
      onBagUpdated={setCombatBag}
      onStatsUpdated={setCombatStats}
      externalUseItemIds={["return_bell"]}
      onUseItem={() => leaveSafely(true)}
    />
    <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={[styles.content, { paddingTop: 128, paddingBottom: insets.bottom + 22 }]} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}>
      {!isRestArea ? <View style={styles.monsterStage}>
        {monster && ((monsterState?.phase !== "defeated" && monsterState?.phase !== "avoided") || defeatedMonsterVisible) ? <View style={styles.monsterCard}>
          {monster.boss ? <Text style={styles.bossLabel}>BOSS</Text> : null}
          <View style={styles.monsterImageWrap}>
            <Reanimated.Image source={MONSTER_IMAGES[monster.id]} style={[styles.monsterImage, monster.id === "elder_ember_rooster" && styles.elderMonsterImage, monsterAttackStyle]} resizeMode="contain" />
            {attackEffect ? <Image source={ATTACK_IMAGES[attackEffect]} style={styles.attackEffect} resizeMode="contain" /> : null}
          </View>
          <Text style={styles.monsterName}>{monster.name}</Text>
          <View style={styles.monsterLifeRow}><View style={styles.monsterLifeTrack}><View style={[styles.monsterLifeFill, { width: `${monsterLifePercent * 100}%` }]} /></View><Text style={styles.monsterLifeText}>{monsterState!.life}/{monsterState!.maximumLife} LP</Text></View>
        </View> : null}
      </View> : null}
      {isRestArea ? <>
        <View style={[styles.actionPanel, styles.restAreaActionPanel]}>{actionContent}</View>
        <View style={styles.messageCard}><CombatMessage message={message} /></View>
      </> : <>
        <View style={styles.messageCard}><CombatMessage message={message} /></View>
        <View style={styles.actionPanel}>{actionContent}</View>
      </>}
    </ScrollView>
    {lootFlights.length > 0 ? <LootFlightOverlay flights={lootFlights} width={screenWidth} height={screenHeight} headerHeight={headerHeight} /> : null}
    <DeathAngelOverlay visible={currentLife <= 0} karmaPoints={karmaPoints} busy={busy} error={deathError} onRepeatFight={() => { void repeatFight(); }} onStartNextRun={(bonuses, avatarId) => { void startNextRun(bonuses, avatarId); }} />
    <Modal visible={contractVisible && !!supporter} transparent animationType="fade" onRequestClose={() => setContractVisible(false)}>
      <View style={styles.warningBackdrop}><View style={styles.supporterPanel}>
        {supporter ? <Image source={SUPPORTER_IMAGES[supporter.definition.id]} style={styles.contractPortrait} /> : null}
        <Text style={styles.warningTitle}>{supporter?.definition.name}</Text>
        <Text style={styles.warningText}>According to our contract, {supporter?.runsRemaining === 0 ? <Text style={styles.lastRun}>this is the last time</Text> : <Text style={styles.remainingRuns}>{supporter?.runsRemaining} more run{supporter?.runsRemaining === 1 ? "" : "s"}</Text>} I’ll be accompanying you. You can hire me again at the Adventurers’ Guild after this.</Text>
        <TouchableOpacity style={styles.warningEnter} onPress={() => setContractVisible(false)}><Text style={styles.warningButtonText}>Let’s go</Text></TouchableOpacity>
      </View></View>
    </Modal>
    <Modal visible={supporterBagOpen} transparent animationType="fade" onRequestClose={() => setSupporterBagOpen(false)}>
      <View style={styles.warningBackdrop}><View style={styles.supporterBagPanel}>
        <Text style={styles.warningTitle}>Supporter Bag</Text>
        <Text style={styles.supporterHint}>Long press an item for its description and actions.</Text>
        <View style={styles.supporterGrid}>{supporterBag?.slots.map((item, slot) => {
          const image = item ? getItemImageSource(item.id) : undefined;
          return <TouchableOpacity key={slot} style={styles.supporterSlot} disabled={!item} onLongPress={() => item && setSupporterAction({ slot, item })} delayLongPress={380}>
            {item && image ? <Image source={image} style={styles.supporterItemImage} resizeMode="contain" /> : null}
            {item && !image ? <Text numberOfLines={2} style={styles.supporterSlotText}>{item.name}</Text> : null}
            {item && item.quantity > 1 ? <Text style={styles.supporterQuantity}>{item.quantity}</Text> : null}
            <ItemDurabilityBadge item={item} />
          </TouchableOpacity>;
        })}</View>
        <TouchableOpacity style={styles.warningEnter} onPress={() => setSupporterBagOpen(false)}><Text style={styles.warningButtonText}>Close</Text></TouchableOpacity>
      </View></View>
    </Modal>
    <Modal visible={!!supporterAction} transparent animationType="fade" onRequestClose={() => setSupporterAction(null)}>
      <View style={styles.warningBackdrop}><View style={styles.supporterPanel}>
        <Text style={styles.warningTitle}>{supporterAction?.item.name}</Text>
        <Text style={styles.warningText}>{supporterAction ? ITEM_CATALOG[supporterAction.item.id]?.description ?? "No description available." : ""}</Text>
        <View style={styles.supporterActions}>
          {supporterAction && (isEdible(supporterAction.item) || isConsumable(supporterAction.item)) ? <TouchableOpacity style={styles.supporterActionButton} onPress={() => { void supporterItemAction("eat"); }}><Text style={styles.warningButtonText}>Eat</Text></TouchableOpacity> : null}
          <TouchableOpacity style={styles.supporterActionButton} onPress={() => { void supporterItemAction("switch"); }}><Text style={styles.warningButtonText}>Switch Bag</Text></TouchableOpacity>
          {supporterAction && !hasItemAttribute(supporterAction.item, ITEM_ATTRIBUTE.QUEST_ITEM) ? <TouchableOpacity style={[styles.supporterActionButton, styles.discardAction]} onPress={() => { void supporterItemAction("discard"); }}><Text style={styles.warningButtonText}>Discard</Text></TouchableOpacity> : null}
        </View>
        <TouchableOpacity onPress={() => setSupporterAction(null)}><Text style={styles.supporterHint}>Cancel</Text></TouchableOpacity>
      </View></View>
    </Modal>
    <Modal visible={!entryConfirmed} transparent animationType="fade" onRequestClose={() => router.back()}>
      <View style={styles.warningBackdrop}>
        <View style={styles.warningPanel}>
          <Text selectable style={styles.warningTitle}>Before you enter</Text>
          <Text selectable style={styles.warningText}>When you return from the Forest Entrance, the day will end.</Text>
          <View style={styles.warningButtons}>
            <TouchableOpacity style={styles.warningCancel} onPress={() => router.back()} activeOpacity={0.8}>
              <Text style={styles.warningButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.warningEnter} onPress={() => setEntryConfirmed(true)} activeOpacity={0.8}>
              <Text style={styles.warningButtonText}>Enter Dungeon</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
    {returnNarrationVisible ? (
      <Animated.View pointerEvents="auto" style={[StyleSheet.absoluteFill, styles.returnFade, { opacity: returnFade }]}>
        <Text selectable style={styles.returnNarration}>You fall into bed, dead tired.</Text>
      </Animated.View>
    ) : null}
    {encounterVideoVisible ? (
      <View style={[StyleSheet.absoluteFill, styles.encounterVideoOverlay]}>
        <VideoView
          style={StyleSheet.absoluteFill}
          player={encounterVideoPlayer}
          nativeControls={false}
          contentFit="cover"
          playsInline
        />
      </View>
    ) : null}
    {floorTransitionActive ? (
      <Reanimated.View
        pointerEvents="auto"
        style={[StyleSheet.absoluteFill, styles.floorTransitionBlack, floorBlackStyle]}
      />
    ) : null}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#071006" }, backgroundShade: { backgroundColor: "rgba(3,10,2,0.22)" }, scroll: { flex: 1 },
  floorTransitionBlack: { zIndex: 1000, backgroundColor: "#000" },
  content: { flexGrow: 1, justifyContent: "flex-start", paddingHorizontal: 14, gap: 10 },
  monsterStage: { width: "100%", height: 250, alignItems: "center", justifyContent: "flex-end" },
  monsterCard: { width: "100%", height: 250, alignItems: "center", justifyContent: "flex-end", gap: 5 },
  monsterImageWrap: { width: "100%", height: 205, alignItems: "center", justifyContent: "center" },
  monsterImage: { width: "74%", height: 205 },
  elderMonsterImage: { width: "96.2%", height: 266.5 },
  attackEffect: { position: "absolute", left: "8%", top: "8%", width: "84%", height: "84%", zIndex: 30 },
  lootFlightImage: { position: "absolute", width: 50, height: 50, zIndex: 3500 },
  bossLabel: { color: "#FFD36A", fontFamily: "Oldenburg", fontSize: 12, letterSpacing: 3, textShadowColor: "#000", textShadowRadius: 5 },
  monsterName: { color: "#FFF4D8", fontFamily: "Oldenburg", fontSize: 18, textShadowColor: "#000", textShadowRadius: 5 },
  monsterLifeRow: { width: "86%", flexDirection: "row", alignItems: "center", gap: 8 }, monsterLifeTrack: { flex: 1, height: 12, borderRadius: 7, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,225,184,0.55)", backgroundColor: "rgba(20,4,1,0.82)" },
  monsterLifeFill: { height: "100%", backgroundColor: "#A62216" }, monsterLifeText: { color: "#FFF4D8", fontFamily: "Oldenburg", fontSize: 11, fontVariant: ["tabular-nums"] },
  messageCard: { borderRadius: 12, borderWidth: 1, borderColor: "rgba(196,148,58,0.48)", backgroundColor: "rgba(14,8,2,0.86)", padding: 10 }, message: { color: "#F0E8D5", fontSize: 12, lineHeight: 18, textAlign: "center" },
  damageReceived: { color: "#FF554D", fontWeight: "800" },
  damageDealt: { color: "#65D77A", fontWeight: "800" },
  actionPanel: { marginTop: "auto", gap: 8, borderRadius: 17, borderCurve: "continuous", borderWidth: 1.5, borderColor: "rgba(196,148,58,0.58)", backgroundColor: "rgba(18,9,2,0.94)", padding: 11 }, combatGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  restAreaActionPanel: { marginTop: 0 },
  actionButton: { minHeight: 54, flexGrow: 1, flexBasis: "46%", alignItems: "center", justifyContent: "center", gap: 3, borderRadius: 11, borderCurve: "continuous", borderWidth: 1, borderColor: "rgba(196,148,58,0.48)", backgroundColor: "rgba(65,39,10,0.86)", paddingHorizontal: 10, paddingVertical: 9 },
  dangerButton: { borderColor: "rgba(181,73,51,0.72)", backgroundColor: "rgba(98,28,18,0.78)" }, disabledButton: { opacity: 0.36 }, actionText: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 14, textAlign: "center" }, dangerText: { color: "#FFE0D8" }, actionSubtitle: { color: "rgba(240,232,213,0.58)", fontSize: 9, textAlign: "center" },
  deathCard: { alignItems: "center", gap: 12, paddingVertical: 20 }, deathTitle: { color: "#B91F16", fontSize: 38, fontWeight: "800", letterSpacing: 3 }, deathText: { color: "#F0E8D5", textAlign: "center", lineHeight: 20 },
  warningBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 22, backgroundColor: "rgba(0,0,0,0.78)" },
  warningPanel: { width: "100%", maxWidth: 420, gap: 14, padding: 20, borderRadius: 17, borderCurve: "continuous", borderWidth: 1.5, borderColor: "rgba(196,148,58,0.72)", backgroundColor: "#170C03" },
  warningTitle: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 19, textAlign: "center" },
  warningText: { color: "rgba(245,230,200,0.78)", fontSize: 14, lineHeight: 21, textAlign: "center" },
  warningButtons: { flexDirection: "row", gap: 10 },
  warningCancel: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 11, borderWidth: 1, borderColor: "rgba(196,148,58,0.42)" },
  warningEnter: { flex: 1.25, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: "#7A4D16", borderWidth: 1, borderColor: "#C4943A" },
  warningButtonText: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 13, textAlign: "center" },
  supporterPanel: { width: "100%", maxWidth: 390, gap: 12, alignItems: "center", padding: 20, borderRadius: 18, borderCurve: "continuous", borderWidth: 1.5, borderColor: "#7D62C8", backgroundColor: "#130E20" },
  contractPortrait: { width: 112, height: 112, borderRadius: 56, borderWidth: 2, borderColor: "#9A82E4" },
  lastRun: { color: "#FF4E45", fontWeight: "800" }, remainingRuns: { color: "#F5E6C8", fontWeight: "800" },
  supporterBagPanel: { width: "100%", maxWidth: 430, maxHeight: "82%", gap: 12, padding: 18, borderRadius: 18, borderCurve: "continuous", borderWidth: 1.5, borderColor: "#7D62C8", backgroundColor: "#130E20" },
  supporterHint: { color: "#BEB2D8", fontSize: 11, textAlign: "center" }, supporterGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6 },
  supporterSlot: { width: 70, height: 70, borderRadius: 10, alignItems: "center", justifyContent: "center", padding: 5, backgroundColor: "rgba(63,48,96,0.76)", borderWidth: 1, borderColor: "rgba(154,130,228,0.55)" },
  supporterSlotText: { color: "#F5EFFF", fontSize: 9, lineHeight: 12, textAlign: "center" },
  supporterItemImage: { width: "78%", height: "78%" },
  supporterQuantity: { position: "absolute", right: 4, top: 2, color: "#FFF", fontSize: 10, fontWeight: "800", textShadowColor: "#000", textShadowRadius: 2 },
  supporterActions: { alignSelf: "stretch", gap: 8 }, supporterActionButton: { minHeight: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#604C92", borderWidth: 1, borderColor: "#9A82E4" }, discardAction: { backgroundColor: "#772E2A", borderColor: "#C66158" },
  returnFade: { zIndex: 5000, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, backgroundColor: "#000" },
  returnNarration: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 18, lineHeight: 27, textAlign: "center" },
  encounterVideoOverlay: { zIndex: 6000, backgroundColor: "#000" },
});
