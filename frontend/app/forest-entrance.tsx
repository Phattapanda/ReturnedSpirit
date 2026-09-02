import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useManagedTimers } from "@/src/hooks/use-managed-timers";
import { Animated, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, type ImageSourcePropType } from "react-native";
import { useEventListener } from "expo";
import { useFocusEffect, useRouter } from "expo-router";
import { VideoView, useVideoPlayer } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import SceneBackground from "@/src/components/SceneBackground";
import TravelHeader from "@/src/components/travel-header";
import DeathAngelOverlay from "@/src/components/death-angel-overlay";
import { useAudioManager } from "@/src/audio/AudioProvider";
import { useHaptics } from "@/src/feedback/haptics-provider";
import {
  FOREST_FLOOR_COUNT, FOREST_FORWARD_STAMINA_COST, FOREST_MONSTERS, FOREST_REST_FLOORS,
  FOREST_SEARCH_BASE_SUCCESS, FOREST_SEARCH_PERCEPTION_BONUS,
  attackForestMonster, bandageAtForestRestArea, defendAgainstForestMonster, escapeForestCombat,
  collectPendingForestCarcass, enterForestDungeon, forestAreaForFloor, goForwardInForest, hideFromForestMonster, leaveForestDungeon, searchForestArea,
  type DungeonActionResult, type ForestDungeonState, type ForestMonsterId,
} from "@/src/game/forest-dungeon-system";
import { beginChosenNextRun, repeatForestFight } from "@/src/game/death-angel-system";
import { loadProgressionState } from "@/src/game/progression";
import type { NextRunBonuses } from "@/src/game/next-run";
import { DEFAULT_PLAYER_STATS, PLAYER_STATS_KEY, normalizePlayerStats } from "@/src/game/player-stats";
import { completeDungeonDayTransition } from "@/src/game/dungeon-day-transition";
import { EMBER_ROOSTER_ENCOUNTER_SEEN_KEY } from "@/src/game/encounter-cinematics";

const BACKGROUNDS: Record<ReturnType<typeof forestAreaForFloor>, ImageSourcePropType> = {
  "Forest Edge": require("../assets/images/forest_edge.png"),
  "Deeper Forest": require("../assets/images/forest_deeper.png"),
  "Forest Heart": require("../assets/images/forest_heart.png"),
  "Forest Rest Area": require("../assets/images/forest_rest_area.png"),
  "Forest Nest": require("../assets/images/forest_nest.png"),
};
const ELDER_EMBER_ROOSTER_BACKGROUND = require("../assets/images/forest_heart_boss.png");
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
  const { crossfadeTo, stopGameplayMusic, playSoundEffect } = useAudioManager();
  const { triggerHaptic } = useHaptics();
  const [headerHeight, setHeaderHeight] = useState(0);
  const [state, setState] = useState<ForestDungeonState | null>(null);
  const [message, setMessage] = useState("The forest path stretches deeper ahead.");
  const [busy, setBusy] = useState(false);
  const [headerRefreshKey, setHeaderRefreshKey] = useState(0);
  const [currentLife, setCurrentLife] = useState(1);
  const [maximumLife, setMaximumLife] = useState(DEFAULT_PLAYER_STATS.maximumLife);
  const [karmaPoints, setKarmaPoints] = useState(0);
  const [deathError, setDeathError] = useState<string | null>(null);
  const [entryConfirmed, setEntryConfirmed] = useState(false);
  const [returnNarrationVisible, setReturnNarrationVisible] = useState(false);
  const [emberRoosterEncounterSeen, setEmberRoosterEncounterSeen] = useState<boolean | null>(null);
  const [encounterVideoVisible, setEncounterVideoVisible] = useState(false);
  const returnFade = useRef(new Animated.Value(0)).current;
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
    Promise.all([enterForestDungeon(), AsyncStorage.getItem("@game:life"), loadProgressionState(), AsyncStorage.getItem(PLAYER_STATS_KEY), AsyncStorage.getItem(EMBER_ROOSTER_ENCOUNTER_SEEN_KEY)]).then(([loaded, rawLife, progression, rawStats, rawEncounterSeen]) => {
      if (!active) return;
      setState(loaded);
      setCurrentLife(Math.max(0, Number.parseInt(rawLife ?? "1", 10) || 0));
      setKarmaPoints(progression.karmaPoints);
      setMaximumLife(rawStats ? normalizePlayerStats(JSON.parse(rawStats)).maximumLife : DEFAULT_PLAYER_STATS.maximumLife);
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
  const background = monsterState?.id === "elder_ember_rooster"
    ? ELDER_EMBER_ROOSTER_BACKGROUND
    : BACKGROUNDS[area];
  const isRestArea = FOREST_REST_FLOORS.has(floorNumber);
  const bossCleared = floorNumber === FOREST_FLOOR_COUNT && monsterState?.id === "elder_ember_rooster" && monsterState.phase === "defeated";
  const locationName = `${area} - ${floorNumber}/${FOREST_FLOOR_COUNT}`;
  const monsterLifePercent = monsterState ? Math.max(0, Math.min(1, monsterState.life / monsterState.maximumLife)) : 0;
  const isEmberRoosterEncounter = monsterState?.id === "ember_rooster" && monsterState.phase !== "defeated";

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

  async function perform(action: () => Promise<DungeonActionResult>) {
    if (busy) return;
    setBusy(true); triggerHaptic("choice");
    try {
      const result = await action();
      setState({ ...result.state, floors: { ...result.state.floors } });
      setMessage(result.life <= 0 ? "YOU DIED." : result.message);
      setCurrentLife(result.life);
      setHeaderRefreshKey((value) => value + 1);
      if (result.life > 0) {
        if (/misses/i.test(result.message)) playSoundEffect("sword-miss", { maxDurationMs: 2500 });
        else if (/I hit|strike critically/i.test(result.message)) playSoundEffect("sword-hit", { maxDurationMs: 2500 });
        if (/hits me for/i.test(result.message)) playSoundEffect("combat-impact", { maxDurationMs: 2500 });
        else if (/evade|cannot get through/i.test(result.message)) playSoundEffect("attack-miss", { maxDurationMs: 2500 });
      }
    } catch { setMessage("The action could not be completed."); }
    finally { setBusy(false); }
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
      setCurrentLife(result.life); setMessage(result.message); setHeaderRefreshKey((value) => value + 1);
    } finally { setBusy(false); }
  }

  async function startNextRun(bonuses: NextRunBonuses) {
    if (busy) return;
    setBusy(true); setDeathError(null);
    try {
      const rawSlot = await AsyncStorage.getItem("@game:active_slot");
      if (!rawSlot) { setDeathError("No active save slot was found."); return; }
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

  async function leaveSafely() {
    if (busy) return;
    setBusy(true);
    let result: Awaited<ReturnType<typeof leaveForestDungeon>>;
    try {
      result = await leaveForestDungeon();
    } catch {
      setMessage("I can only leave safely from a Rest Area or after clearing the dungeon.");
      setBusy(false);
      return;
    }

    setMessage(result.message);
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

  const actionContent = useMemo(() => {
    if (!state || !floor) return null;
    if (currentLife <= 0) return <View style={styles.deathCard}><Text style={styles.deathTitle}>YOU DIED.</Text><Text style={styles.deathText}>The Death Angel is waiting.</Text></View>;
    if (isRestArea) return <>
      <ActionButton label="Bandage Wounds" subtitle="10 Stamina · Restore 20% Maximum Life" disabled={busy} onPress={() => { void perform(() => bandageAtForestRestArea(false)); }} />
      <ActionButton label="Bandage Wounds with Herb" subtitle="10 Stamina + 1 Herb · Restore 30% Maximum Life" disabled={busy} onPress={() => { void perform(() => bandageAtForestRestArea(true)); }} />
      <ActionButton label="Continue" subtitle={`${FOREST_FORWARD_STAMINA_COST} Stamina`} disabled={busy} onPress={() => { void perform(goForwardInForest); }} />
      <ActionButton label="Leave Dungeon" disabled={busy} onPress={() => { void leaveSafely(); }} />
    </>;
    if (monsterState?.phase === "noticed") return <ActionButton label="Hide" subtitle="50% + Luck chance to remain unseen" disabled={busy} onPress={() => { void perform(hideFromForestMonster); }} />;
    if (monsterState?.phase === "combat") return <View style={styles.combatGrid}>
      <ActionButton label="Attack Head" subtitle="-30% hit · +50% damage" disabled={busy} onPress={() => { void perform(() => attackForestMonster("head")); }} />
      <ActionButton label="Attack Body" subtitle="Normal hit chance" disabled={busy} onPress={() => { void perform(() => attackForestMonster("body")); }} />
      <ActionButton label="Defend" subtitle="30% + Luck dodge" disabled={busy} onPress={() => { void perform(defendAgainstForestMonster); }} />
      <ActionButton label="Escape" subtitle="50% + Luck chance" danger disabled={busy} onPress={() => { void perform(escapeForestCombat); }} />
    </View>;
    if (floor.carcassPending) return <ActionButton label="Collect Monster Carcass" subtitle="A free Player Inventory slot is required" disabled={busy} onPress={() => { void perform(collectPendingForestCarcass); }} />;
    if (bossCleared) return <ActionButton label="Leave Cleared Dungeon" subtitle="Return safely to the tavern" disabled={busy} onPress={() => { void leaveSafely(); }} />;
    return <>
      <ActionButton label="Search the area" subtitle={floor.searchAvailable && !floor.searched ? `${floor.searchCost} Stamina · ${FOREST_SEARCH_BASE_SUCCESS}% + ${FOREST_SEARCH_PERCEPTION_BONUS}% per Perception` : "Already searched"} disabled={busy || !floor.searchAvailable || floor.searched} onPress={() => { void perform(searchForestArea); }} />
      <ActionButton label="Go forward" subtitle={`${FOREST_FORWARD_STAMINA_COST} Stamina`} disabled={busy} onPress={() => { void perform(goForwardInForest); }} />
    </>;
  // perform is intentionally bound to current screen state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bossCleared, busy, currentLife, floor, isRestArea, monsterState?.phase, router, state]);

  return <View style={styles.root}>
    <SceneBackground source={background} topOffset={headerHeight} />
    <View style={[StyleSheet.absoluteFill, { top: headerHeight }, styles.backgroundShade]} pointerEvents="none" />
    <TravelHeader locationName={locationName} showPortraitRow onHeaderHeightChange={setHeaderHeight} refreshKey={headerRefreshKey} />
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingTop: 128, paddingBottom: insets.bottom + 22 }]} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}>
      {monster && monsterState?.phase !== "defeated" ? <View style={styles.monsterCard}>
        {monster.boss ? <Text style={styles.bossLabel}>BOSS</Text> : null}
        <Image source={MONSTER_IMAGES[monster.id]} style={styles.monsterImage} resizeMode="contain" />
        <Text style={styles.monsterName}>{monster.name}</Text>
        <View style={styles.monsterLifeRow}><View style={styles.monsterLifeTrack}><View style={[styles.monsterLifeFill, { width: `${monsterLifePercent * 100}%` }]} /></View><Text style={styles.monsterLifeText}>{monsterState!.life}/{monsterState!.maximumLife} LP</Text></View>
      </View> : <View style={styles.openSpace} />}
      <View style={styles.messageCard}><Text selectable style={styles.message}>{message}</Text></View>
      <View style={styles.actionPanel}>{actionContent}</View>
    </ScrollView>
    <DeathAngelOverlay visible={currentLife <= 0} karmaPoints={karmaPoints} busy={busy} error={deathError} onRepeatFight={() => { void repeatFight(); }} onStartNextRun={(bonuses) => { void startNextRun(bonuses); }} />
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
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#071006" }, backgroundShade: { backgroundColor: "rgba(3,10,2,0.22)" }, scroll: { flex: 1 },
  content: { flexGrow: 1, justifyContent: "flex-end", paddingHorizontal: 14, gap: 10 }, openSpace: { minHeight: 170 },
  monsterCard: { alignItems: "center", justifyContent: "flex-end", minHeight: 250, gap: 5 }, monsterImage: { width: "74%", height: 205 },
  bossLabel: { color: "#FFD36A", fontFamily: "Oldenburg", fontSize: 12, letterSpacing: 3, textShadowColor: "#000", textShadowRadius: 5 },
  monsterName: { color: "#FFF4D8", fontFamily: "Oldenburg", fontSize: 18, textShadowColor: "#000", textShadowRadius: 5 },
  monsterLifeRow: { width: "86%", flexDirection: "row", alignItems: "center", gap: 8 }, monsterLifeTrack: { flex: 1, height: 12, borderRadius: 7, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,225,184,0.55)", backgroundColor: "rgba(20,4,1,0.82)" },
  monsterLifeFill: { height: "100%", backgroundColor: "#A62216" }, monsterLifeText: { color: "#FFF4D8", fontFamily: "Oldenburg", fontSize: 11, fontVariant: ["tabular-nums"] },
  messageCard: { borderRadius: 12, borderWidth: 1, borderColor: "rgba(196,148,58,0.48)", backgroundColor: "rgba(14,8,2,0.86)", padding: 10 }, message: { color: "#F0E8D5", fontSize: 12, lineHeight: 18, textAlign: "center" },
  actionPanel: { gap: 8, borderRadius: 17, borderCurve: "continuous", borderWidth: 1.5, borderColor: "rgba(196,148,58,0.58)", backgroundColor: "rgba(18,9,2,0.94)", padding: 11 }, combatGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
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
  returnFade: { zIndex: 5000, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, backgroundColor: "#000" },
  returnNarration: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 18, lineHeight: 27, textAlign: "center" },
  encounterVideoOverlay: { zIndex: 6000, backgroundColor: "#000" },
});
