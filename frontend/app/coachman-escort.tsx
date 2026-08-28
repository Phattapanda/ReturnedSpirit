import React, { useEffect, useMemo, useRef, useState } from "react";
import { useManagedTimers } from "@/src/hooks/use-managed-timers";
import { Animated, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions, type ImageSourcePropType } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import TravelHeader from "@/src/components/travel-header";
import StoryDialogOverlay, { type StoryDialogLine } from "@/src/components/story-dialog-overlay";
import PortraitBubble from "@/src/components/portrait-bubble";
import { useAudioManager } from "@/src/audio/AudioProvider";
import { calculateIncomingPhysicalDamage, consumeArmorDurability, consumeWeaponDurability, getEquippedItem } from "@/src/game/equipment-system";
import { ITEM_ATTRIBUTE, ITEM_CATALOG, PLAYER_BAG_KEY, normalizePlayerBagData, planAddToBag, type BagItem, type PlayerBagData } from "@/src/game/item-system";
import { DEFAULT_PLAYER_STATS, PLAYER_STATS_KEY, normalizePlayerStats, type PlayerStats } from "@/src/game/player-stats";
import { setCoachmanEscortPhase } from "@/src/game/coachman-escort-system";
import { unlockNextCityAfterEscort } from "@/src/game/travel-system";
import { PLAYER_AVATAR_KEY } from "@/src/game/player-avatar";

const COACHMAN = require("../assets/images/coachman.png");
const WOLF = require("../assets/images/wild_wolf.png");
const CARCASS = require("../assets/images/monster_carcass.png");
const BACKGROUND = require("../assets/images/forest_edge.png");
const WOLF_MAX_LIFE = 18;

type Phase = "journey" | "combat" | "victory" | "post" | "leaving";

function preBattleLines(playerName: string, playerPortrait: ImageSourcePropType): StoryDialogLine[] {
  return [
    { speaker: "Coachman", portrait: COACHMAN, text: "If we keep this pace, we should reach the next town soon." },
    { speaker: playerName, portrait: playerPortrait, playerPortrait: true, text: "As long as the road stays quiet. You hired me for the possibility that it doesn’t." },
    { speaker: "Coachman", portrait: COACHMAN, text: "After all those stories about monsters on this road, I’d rather pay for protection than lose my cargo." },
    { text: "Suddenly, the horses rear up and the wagon comes to a sharp stop." },
    { speaker: "Coachman", portrait: COACHMAN, text: "What the—?! Why did they stop?" },
    { text: "A low growl comes from the bushes. A moment later, a monster steps onto the road." },
    { speaker: playerName, portrait: playerPortrait, playerPortrait: true, text: "Looks like we found the reason." },
    { speaker: "Coachman", portrait: COACHMAN, text: "By the gods… The rumors are true!" },
    { speaker: playerName, portrait: playerPortrait, playerPortrait: true, text: "Stay behind me. Keep the horses calm. I’ll handle this." },
  ];
}

function postBattleLines(playerName: string, playerPortrait: ImageSourcePropType): StoryDialogLine[] {
  return [
    { speaker: "Coachman", portrait: COACHMAN, text: "That was a close one… A wild wolf this close to the road? I’ll have to report this to the Adventurers’ Guild when we reach town." },
    { speaker: playerName, portrait: playerPortrait, playerPortrait: true, text: "What about the carcass?" },
    { speaker: "Coachman", portrait: COACHMAN, text: "Keep it. You earned it." },
    { speaker: playerName, portrait: playerPortrait, playerPortrait: true, text: "The whole thing?" },
    { speaker: "Coachman", portrait: COACHMAN, text: "Of course. The Adventurers’ Guild has butchers who can process monster carcasses for you. They’ll extract whatever useful materials they can and send them to you afterward." },
    { speaker: playerName, portrait: playerPortrait, playerPortrait: true, text: "Sounds convenient." },
    { speaker: "Coachman", portrait: COACHMAN, text: "It is. Though you can always take the carcass home and butcher it yourself." },
    { speaker: "Coachman", portrait: COACHMAN, text: "You’ll need a Butchering Knife. A better knife usually means a better chance of getting more usable materials from the carcass." },
    { speaker: playerName, portrait: playerPortrait, playerPortrait: true, text: "Good to know. I’ll take it with me for now." },
    { speaker: "Coachman", portrait: COACHMAN, text: "Just don’t put it too close to my cargo." },
  ];
}

export default function CoachmanEscortScreen() {
  const {
    setManagedTimeout: setTimeout,
  } = useManagedTimers();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const { crossfadeTo, stopGameplayMusic, playSoundEffect } = useAudioManager();
  const [phase, setPhase] = useState<Phase>("journey");
  const [dialogIndex, setDialogIndex] = useState(0);
  const [playerName, setPlayerName] = useState("Adventurer");
  const [playerPortrait, setPlayerPortrait] = useState(require("../assets/images/avatar1_normal.png"));
  const [stats, setStats] = useState<PlayerStats>(DEFAULT_PLAYER_STATS);
  const [life, setLife] = useState(DEFAULT_PLAYER_STATS.maximumLife);
  const [wolfLife, setWolfLife] = useState(WOLF_MAX_LIFE);
  const [turn, setTurn] = useState(0);
  const [awaitingArmor, setAwaitingArmor] = useState(false);
  const [thought, setThought] = useState<string | null>(null);
  const [bagAttention, setBagAttention] = useState(false);
  const [busy, setBusy] = useState(false);
  const [headerRefreshKey, setHeaderRefreshKey] = useState(0);
  const [carcassPending, setCarcassPending] = useState(false);
  const wolfOpacity = useRef(new Animated.Value(1)).current;
  const redFlash = useRef(new Animated.Value(0)).current;
  const blackFade = useRef(new Animated.Value(1)).current;
  const carcassAnim = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const carcassOpacity = useRef(new Animated.Value(0)).current;

  const preLines = useMemo(() => preBattleLines(playerName, playerPortrait), [playerName, playerPortrait]);
  const postLines = useMemo(() => postBattleLines(playerName, playerPortrait), [playerName, playerPortrait]);
  const activeLines = phase === "journey" ? preLines : postLines;

  useEffect(() => {
    void (async () => {
      const [rawName, rawLife, rawStats, rawAvatar] = await AsyncStorage.multiGet(["@game:player_name", "@game:life", PLAYER_STATS_KEY, PLAYER_AVATAR_KEY]);
      setPlayerName(rawName[1]?.trim() || "Adventurer");
      const loadedStats = rawStats[1] ? normalizePlayerStats(JSON.parse(rawStats[1])) : DEFAULT_PLAYER_STATS;
      setStats(loadedStats);
      setLife(Math.max(1, Number.parseInt(rawLife[1] ?? String(loadedStats.maximumLife), 10) || loadedStats.maximumLife));
      const avatarId = Math.max(1, Math.min(3, Number.parseInt(rawAvatar[1] ?? "1", 10) || 1));
      setPlayerPortrait(avatarId === 2 ? require("../assets/images/avatar2_normal.png") : avatarId === 3 ? require("../assets/images/avatar3_normal.png") : require("../assets/images/avatar1_normal.png"));
      Animated.timing(blackFade, { toValue: 0, duration: 550, useNativeDriver: true }).start();
    })();
    return () => stopGameplayMusic(600);
  }, [blackFade, stopGameplayMusic]);

  useEffect(() => {
    if (phase !== "combat" && phase !== "victory") return;
    if (phase === "victory") { stopGameplayMusic(700); return; }
    crossfadeTo(life * 2 >= stats.maximumLife ? "battle-over50" : "battle-under50", 600);
  }, [crossfadeTo, life, phase, stats.maximumLife, stopGameplayMusic]);

  useEffect(() => {
    if (phase === "journey" && dialogIndex === 5) playSoundEffect("deep-monster-growl", { maxDurationMs: 6000 });
  }, [dialogIndex, phase, playSoundEffect]);

  function showThought(text: string, pulseBag = false) {
    setThought(text);
    setBagAttention(pulseBag);
    setTimeout(() => setThought(null), 3600);
  }

  async function advanceDialog() {
    if (dialogIndex < activeLines.length - 1) { setDialogIndex((index) => index + 1); return; }
    if (phase === "journey") {
      await setCoachmanEscortPhase("combat");
      setPhase("combat"); setDialogIndex(0);
      blackFade.setValue(1);
      Animated.timing(blackFade, { toValue: 0, duration: 600, useNativeDriver: true }).start();
      return;
    }
    setPhase("leaving");
    blackFade.setValue(0);
    Animated.timing(blackFade, { toValue: 1, duration: 650, useNativeDriver: true }).start(async () => {
      await Promise.all([setCoachmanEscortPhase("complete"), unlockNextCityAfterEscort()]);
      router.replace("/next-city");
    });
  }

  async function loadBag(): Promise<PlayerBagData> {
    const raw = await AsyncStorage.getItem(PLAYER_BAG_KEY);
    return normalizePlayerBagData(raw ? JSON.parse(raw) : {});
  }

  function flashWolf() {
    wolfOpacity.setValue(1);
    Animated.sequence([
      Animated.timing(wolfOpacity, { toValue: 0.18, duration: 90, useNativeDriver: true }),
      Animated.timing(wolfOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
  }

  async function wolfAttacks(bag: PlayerBagData) {
    const armor = getEquippedItem(bag, "armor");
    if (!armor) {
      setAwaitingArmor(true); setBusy(false);
      showThought("The monster is going to attack me. Without equipment, I don't stand a chance.", true);
      return;
    }
    if (turn === 0) {
      const damage = Math.max(1, calculateIncomingPhysicalDamage(9, stats.endurance, armor));
      const nextLife = Math.max(1, life - damage);
      const nextBag = damage > 0 ? consumeArmorDurability(bag) : bag;
      await AsyncStorage.multiSet([["@game:life", String(nextLife)], [PLAYER_BAG_KEY, JSON.stringify(nextBag)]]);
      setLife(nextLife); setHeaderRefreshKey((value) => value + 1);
      playSoundEffect("combat-impact", { maxDurationMs: 3500 });
      redFlash.setValue(0.42);
      Animated.timing(redFlash, { toValue: 0, duration: 210, useNativeDriver: true }).start();
    } else playSoundEffect("attack-miss", { maxDurationMs: 3000 });
    setTurn((value) => value + 1);
    setAwaitingArmor(false); setBagAttention(false); setBusy(false);
  }

  async function playerAction() {
    if (busy || phase !== "combat") return;
    setBusy(true);
    let bag = await loadBag();
    if (awaitingArmor) {
      if (!getEquippedItem(bag, "armor")) { setBusy(false); showThought("The monster is going to attack me. Without equipment, I don't stand a chance.", true); return; }
      await wolfAttacks(bag); return;
    }
    const weapon = getEquippedItem(bag, "weapon");
    if (!weapon) {
      setBusy(false);
      showThought("I have no chance with my fist alone. I need to equip my weapon.", true);
      return;
    }
    const baseDamage = Math.max(1, (ITEM_CATALOG[weapon.id]?.damageMax ?? 1) + stats.strength - 3);
    const damage = turn === 1 ? baseDamage * 2 : baseDamage;
    const nextWolfLife = Math.max(0, wolfLife - damage);
    bag = consumeWeaponDurability(bag);
    await AsyncStorage.setItem(PLAYER_BAG_KEY, JSON.stringify(bag));
    setWolfLife(nextWolfLife); setHeaderRefreshKey((value) => value + 1);
    playSoundEffect("sword-hit", { maxDurationMs: 3000 });
    flashWolf();
    if (nextWolfLife <= 0) { setBusy(false); setTimeout(() => { void finishWolf(bag); }, 280); return; }
    setTimeout(() => { void wolfAttacks(bag); }, 520);
  }

  function runBlocked() { showThought("I can't leave him behind."); }

  async function addWolfCarcass(sourceBag?: PlayerBagData): Promise<boolean> {
    const bag = sourceBag ?? await loadBag();
    const carcass: BagItem = { id: "monster_carcass", itemType: "monster_carcass", name: "Wild Wolf Carcass", quantity: 1, monsterId: "wild_wolf", attributes: [ITEM_ATTRIBUTE.MATERIAL] };
    const plan = planAddToBag(carcass, bag);
    if (!plan.canTransfer || plan.remainderQty > 0) return false;
    await AsyncStorage.setItem(PLAYER_BAG_KEY, JSON.stringify({ ...bag, slots: plan.updatedSlots }));
    setHeaderRefreshKey((value) => value + 1);
    return true;
  }

  async function finishWolf(bag: PlayerBagData) {
    setPhase("victory");
    Animated.timing(wolfOpacity, { toValue: 0, duration: 1000, useNativeDriver: true }).start(async () => {
      carcassOpacity.setValue(1);
      const added = await addWolfCarcass(bag);
      if (!added) { setCarcassPending(true); setBagAttention(true); showThought("My bag is full. I need to make room for the Monster Carcass.", true); return; }
      Animated.parallel([
        Animated.timing(carcassAnim, { toValue: { x: 125, y: -210 }, duration: 850, useNativeDriver: true }),
        Animated.timing(carcassOpacity, { toValue: 0, duration: 850, useNativeDriver: true }),
      ]).start(() => beginPostBattle());
    });
  }

  async function collectPendingCarcass() {
    if (!await addWolfCarcass()) { showThought("I still need a free slot in my bag.", true); return; }
    setCarcassPending(false); setBagAttention(false);
    Animated.timing(carcassOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => beginPostBattle());
  }

  function beginPostBattle() {
    blackFade.setValue(0);
    Animated.timing(blackFade, { toValue: 1, duration: 600, useNativeDriver: true }).start(async () => {
      await setCoachmanEscortPhase("post_combat");
      setDialogIndex(0); setPhase("post");
    });
  }

  const dialogLine = phase === "journey" || phase === "post" ? activeLines[dialogIndex] ?? null : null;

  return <View style={styles.root}>
    {phase === "combat" || phase === "victory" ? <>
      <Image source={BACKGROUND} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <View style={styles.shade} />
      <TravelHeader locationName="Road to the Next City" showPortraitRow refreshKey={headerRefreshKey} bagAttention={bagAttention} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        <View style={styles.monsterArea}>
          <Animated.Image source={WOLF} style={[styles.wolf, { opacity: wolfOpacity }]} resizeMode="contain" />
          {phase === "victory" ? <Animated.Image source={CARCASS} style={[styles.carcass, { opacity: carcassOpacity, transform: carcassAnim.getTranslateTransform() }]} resizeMode="contain" /> : null}
          <View style={styles.lifeRow}><Text style={styles.monsterName}>Wild Wolf:</Text><View style={styles.lifeTrack}><View style={[styles.lifeFill, { width: `${wolfLife / WOLF_MAX_LIFE * 100}%` }]} /></View><Text style={styles.lifeText}>{wolfLife}/{WOLF_MAX_LIFE}</Text></View>
        </View>
        {phase === "combat" ? <View style={styles.actionPanel}>
          <View style={styles.actionRow}><Action label="Attack Head" subtitle="45% · +50% damage" onPress={() => { void playerAction(); }} disabled={busy} /><Action label="Attack Body" subtitle="75% hit chance" onPress={() => { void playerAction(); }} disabled={busy} /></View>
          <View style={styles.actionRow}><Action label="Defense" subtitle="Prepare for the attack" onPress={() => { void playerAction(); }} disabled={busy} /><Action label="Run" subtitle="Unavailable" onPress={runBlocked} disabled={busy} danger /></View>
        </View> : carcassPending ? <TouchableOpacity style={styles.collectButton} onPress={() => { void collectPendingCarcass(); }}><Text style={styles.collectText}>Collect Monster Carcass</Text></TouchableOpacity> : null}
      </ScrollView>
      {thought ? <PortraitBubble anchorX={screenWidth - 70} screenWidth={screenWidth} text={thought} top={220} variant="thought" highlightedPhrases={thought.includes("equip my weapon") ? ["equip my weapon"] : undefined} /> : null}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.redFlash, { opacity: redFlash }]} />
    </> : null}
    <Animated.View pointerEvents={phase === "journey" || phase === "post" || phase === "leaving" ? "auto" : "none"} style={[StyleSheet.absoluteFill, styles.black, { opacity: blackFade }]} />
    <StoryDialogOverlay visible={!!dialogLine} line={dialogLine} onContinue={() => { void advanceDialog(); }} />
  </View>;
}

function Action({ label, subtitle, onPress, disabled, danger = false }: { label: string; subtitle: string; onPress: () => void; disabled: boolean; danger?: boolean }) {
  return <TouchableOpacity style={[styles.action, danger && styles.danger, disabled && styles.disabled]} onPress={onPress} disabled={disabled} activeOpacity={0.8}><Text style={styles.actionLabel}>{label}</Text><Text style={styles.actionSubtitle}>{subtitle}</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" }, black: { zIndex: 600, backgroundColor: "#000" }, shade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.24)" }, scroll: { flex: 1 }, content: { flexGrow: 1, justifyContent: "flex-end", gap: 12, paddingHorizontal: 14, paddingTop: 150, paddingBottom: 24 },
  monsterArea: { minHeight: 330, alignItems: "center", justifyContent: "flex-end", gap: 10 }, wolf: { width: "76%", height: 240 }, carcass: { position: "absolute", bottom: 48, width: 120, height: 120 },
  lifeRow: { width: "100%", flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 5 }, monsterName: { width: 82, color: "#FFF2D2", fontFamily: "Oldenburg", fontSize: 12 }, lifeTrack: { flex: 1, height: 13, borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: "#E7C77A", backgroundColor: "rgba(32,5,2,0.88)" }, lifeFill: { height: "100%", backgroundColor: "#B52619" }, lifeText: { minWidth: 38, color: "#FFF2D2", fontFamily: "Oldenburg", fontSize: 11, fontVariant: ["tabular-nums"] },
  actionPanel: { gap: 8, borderRadius: 16, borderWidth: 1.5, borderColor: "rgba(196,148,58,0.58)", backgroundColor: "rgba(18,9,2,0.94)", padding: 10 }, actionRow: { flexDirection: "row", gap: 8 }, action: { flex: 1, minHeight: 58, alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 11, borderWidth: 1, borderColor: "rgba(196,148,58,0.48)", backgroundColor: "rgba(65,39,10,0.9)", padding: 8 }, danger: { borderColor: "rgba(181,73,51,0.72)", backgroundColor: "rgba(98,28,18,0.82)" }, disabled: { opacity: 0.45 }, actionLabel: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 13 }, actionSubtitle: { color: "rgba(240,232,213,0.58)", fontSize: 9, textAlign: "center" },
  collectButton: { minHeight: 58, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "rgba(80,48,12,0.95)", borderWidth: 1, borderColor: "#C4943A" }, collectText: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 14 }, redFlash: { zIndex: 550, backgroundColor: "#D0180B" },
});
