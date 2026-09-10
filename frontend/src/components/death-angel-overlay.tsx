import React, { useEffect, useRef, useState } from "react";
import { useEventListener } from "expo";
import { VideoView, useVideoPlayer } from "expo-video";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Animated, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { nextRunBonusCost, REPEAT_FIGHT_KP_COST } from "@/src/game/death-angel-system";
import { PLAYER_AVATAR_KEY, normalizePlayerAvatarId, type PlayerAvatarId } from "@/src/game/player-avatar";
import type { NextRunBonuses, NextRunFreeItem } from "@/src/game/next-run";

const MEETING_DEATH_VIDEO = require("../../assets/video/meeting_death.mp4");
const REBIRTH_VIDEO = require("../../assets/video/rebirth.mp4");
const MEETING_DEATH_BACKGROUND = require("../../assets/images/meeting_death.png");
const DEATH_AVATARS = {
  1: require("../../assets/images/avatar1_death.png"),
  2: require("../../assets/images/avatar2_death.png"),
  3: require("../../assets/images/avatar3_death.png"),
} as const;
const AVATAR_CHOICES = {
  1: require("../../assets/images/avatar1_normal.png"),
  2: require("../../assets/images/avatar2_normal.png"),
  3: require("../../assets/images/avatar3_normal.png"),
} as const;

type DeathPhase = "death" | "meeting_video" | "karma" | "rebirth_video" | "avatar";

type Props = {
  visible: boolean;
  karmaPoints: number;
  busy?: boolean;
  error?: string | null;
  onRepeatFight?: () => void;
  onStartNextRun: (bonuses: NextRunBonuses, avatarId: PlayerAvatarId) => void;
};

const FREE_ITEMS: { id: NextRunFreeItem; label: string }[] = [
  { id: "stamina_potions", label: "3× Low Grade Stamina Potions" },
  { id: "healing_potions", label: "3× Low Grade Healing Potions" },
  { id: "iron_shortswords", label: "2× Iron Shortsword" },
  { id: "leather_armor", label: "2× Leather Armor" },
  { id: "onion_bag", label: "1× Bag with Onions (15)" },
];

export default function DeathAngelOverlay({ visible, karmaPoints, busy = false, error, onRepeatFight, onStartNextRun }: Props) {
  const insets = useSafeAreaInsets();
  const deathOpacity = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<DeathPhase>("death");
  const [phase, setPhaseState] = useState<DeathPhase>("death");
  const [avatarId, setAvatarId] = useState<PlayerAvatarId>(1);
  const [avatarReady, setAvatarReady] = useState(false);
  const [showNewRun, setShowNewRun] = useState(false);
  const [avatarCommitted, setAvatarCommitted] = useState(false);
  const [bonuses, setBonuses] = useState<NextRunBonuses>({ copper: 0, freeItem: null });
  const [pendingBonuses, setPendingBonuses] = useState<NextRunBonuses>({ copper: 0, freeItem: null });
  const meetingPlayer = useVideoPlayer(MEETING_DEATH_VIDEO, (player) => { player.loop = false; });
  const rebirthPlayer = useVideoPlayer(REBIRTH_VIDEO, (player) => { player.loop = false; });

  function setPhase(next: DeathPhase) {
    phaseRef.current = next;
    setPhaseState(next);
  }

  function showKarmaOptions() {
    if (phaseRef.current !== "meeting_video") return;
    try { meetingPlayer.pause(); } catch {}
    setPhase("karma");
  }

  function showAvatarSelection() {
    if (phaseRef.current !== "rebirth_video") return;
    try { rebirthPlayer.pause(); } catch {}
    setPhase("avatar");
  }

  useEventListener(meetingPlayer, "playToEnd", showKarmaOptions);
  useEventListener(meetingPlayer, "statusChange", ({ status }) => {
    if (status === "error") showKarmaOptions();
  });
  useEventListener(rebirthPlayer, "playToEnd", showAvatarSelection);
  useEventListener(rebirthPlayer, "statusChange", ({ status }) => {
    if (status === "error") showAvatarSelection();
  });

  useEffect(() => {
    if (!visible) {
      if (timerRef.current) clearTimeout(timerRef.current);
      try { meetingPlayer.pause(); } catch {}
      try { rebirthPlayer.pause(); } catch {}
      setPhase("death");
      deathOpacity.setValue(1);
      setAvatarReady(false);
      setShowNewRun(false);
      setAvatarCommitted(false);
      setBonuses({ copper: 0, freeItem: null });
      setPendingBonuses({ copper: 0, freeItem: null });
      return;
    }

    let mounted = true;
    void AsyncStorage.getItem(PLAYER_AVATAR_KEY).then((rawAvatar) => {
      if (!mounted) return;
      setAvatarId(normalizePlayerAvatarId(rawAvatar));
      setAvatarReady(true);
      timerRef.current = setTimeout(() => {
        Animated.timing(deathOpacity, { toValue: 0, duration: 650, useNativeDriver: true }).start(({ finished }) => {
          if (!finished || !mounted) return;
          setPhase("meeting_video");
          meetingPlayer.currentTime = 0;
          meetingPlayer.play();
        });
      }, 3000);
    });
    return () => {
      mounted = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [deathOpacity, meetingPlayer, rebirthPlayer, visible]);

  if (!visible) return null;
  const cost = nextRunBonusCost(bonuses);

  function toggle(key: "betterValues" | "growthPoints" | "preserveFavor") {
    setBonuses((current) => ({ ...current, [key]: !current[key] }));
  }

  function beginRebirth() {
    if (busy || cost > karmaPoints) return;
    setPendingBonuses(bonuses);
    setPhase("rebirth_video");
    rebirthPlayer.currentTime = 0;
    rebirthPlayer.play();
  }

  function chooseAvatar(nextAvatarId: PlayerAvatarId) {
    if (busy || avatarCommitted) return;
    setAvatarCommitted(true);
    setAvatarId(nextAvatarId);
    onStartNextRun(pendingBonuses, nextAvatarId);
  }

  return <View style={styles.overlay}>
    {phase === "death" && avatarReady ? <Animated.View style={[styles.deathScene, { paddingTop: insets.top + 22, paddingBottom: insets.bottom + 22, opacity: deathOpacity }]}>
      <Text style={styles.death}>YOU DIED.</Text>
      <Image source={DEATH_AVATARS[avatarId]} style={styles.deathPortrait} resizeMode="contain" />
    </Animated.View> : null}

    {phase === "meeting_video" || phase === "karma" ? <>
      <Image source={MEETING_DEATH_BACKGROUND} style={StyleSheet.absoluteFill} resizeMode="cover" />
      {phase === "meeting_video" ? <VideoView player={meetingPlayer} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} /> : null}
      {phase === "karma" ? <View style={styles.karmaShade} /> : null}
    </> : null}

    {phase === "karma" ? <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
      <Text style={styles.kp}>Available: {karmaPoints} KP</Text>
      {error ? <Text selectable style={styles.error}>{error}</Text> : null}

      {!showNewRun ? <View style={styles.primaryChoices}>
        {onRepeatFight ? <TouchableOpacity style={[styles.mainButton, karmaPoints < REPEAT_FIGHT_KP_COST && styles.disabled]} disabled={busy || karmaPoints < REPEAT_FIGHT_KP_COST} onPress={onRepeatFight}>
          <Text style={styles.mainButtonText}>Repeat Fight</Text><Text style={styles.cost}>{REPEAT_FIGHT_KP_COST} KP · Restore fight-start state and items</Text>
        </TouchableOpacity> : null}
        <TouchableOpacity style={styles.mainButton} disabled={busy} onPress={() => setShowNewRun(true)}>
          <Text style={styles.mainButtonText}>Begin from the Start</Text><Text style={styles.cost}>Free · Choose optional blessings</Text>
        </TouchableOpacity>
      </View> : <View style={styles.optionsPanel}>
        <Text style={styles.optionsTitle}>Blessings for the next run</Text>
        <Option selected={!!bonuses.betterValues} label="Better starting values" cost="10 KP · +10 Maximum Stamina, +5 Maximum Life" onPress={() => toggle("betterValues")} />
        <Option selected={!!bonuses.growthPoints} label="30 Growth Points" cost="10 KP" onPress={() => toggle("growthPoints")} />
        <Option selected={bonuses.copper === 100} label="Start with 1 Silver Coin" cost="5 KP · 1 Silver Coin" onPress={() => setBonuses((current) => ({ ...current, copper: current.copper === 100 ? 0 : 100 }))} />
        <Option selected={bonuses.copper === 300} label="Start with 3 Silver Coins" cost="15 KP · 3 Silver Coins" onPress={() => setBonuses((current) => ({ ...current, copper: current.copper === 300 ? 0 : 300 }))} />
        <Option selected={!!bonuses.preserveFavor} label="Keep Guest Favor" cost="25 KP" onPress={() => toggle("preserveFavor")} />
        <Text style={styles.freeTitle}>Free recovered item package — choose one</Text>
        {FREE_ITEMS.map((item) => <Option key={item.id} selected={bonuses.freeItem === item.id} label={item.label} cost="Delivered to the Courier’s Chest by City Guard" onPress={() => setBonuses((current) => ({ ...current, freeItem: current.freeItem === item.id ? null : item.id }))} />)}
        <Text style={[styles.total, cost > karmaPoints && styles.totalInsufficient]}>Total: {cost} KP</Text>
        <TouchableOpacity style={[styles.confirmButton, (busy || cost > karmaPoints) && styles.disabled]} disabled={busy || cost > karmaPoints} onPress={beginRebirth}>
          <Text style={styles.confirmText}>Confirm</Text>
        </TouchableOpacity>
        <TouchableOpacity disabled={busy} onPress={() => setShowNewRun(false)}><Text style={styles.back}>Back</Text></TouchableOpacity>
      </View>}
    </ScrollView> : null}

    {phase === "rebirth_video" ? <VideoView player={rebirthPlayer} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} /> : null}

    {phase === "avatar" ? <View style={[styles.avatarScene, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 }]}>
      <Text style={styles.avatarTitle}>Choose your next life</Text>
      <View style={styles.avatarChoices}>
        {([1, 2, 3] as const).map((choice) => <TouchableOpacity key={choice} style={styles.avatarButton} disabled={busy || avatarCommitted} onPress={() => chooseAvatar(choice)} activeOpacity={0.8}>
          <Image source={AVATAR_CHOICES[choice]} style={styles.avatarImage} resizeMode="cover" />
        </TouchableOpacity>)}
      </View>
      {busy || avatarCommitted ? <Text style={styles.preparing}>Preparing your next life…</Text> : null}
      {error ? <Text selectable style={styles.error}>{error}</Text> : null}
    </View> : null}
  </View>;
}

function Option({ selected, label, cost, onPress }: { selected: boolean; label: string; cost: string; onPress: () => void }) {
  return <TouchableOpacity style={[styles.option, selected && styles.optionSelected]} onPress={onPress} activeOpacity={0.8}>
    <View style={[styles.check, selected && styles.checkSelected]}><Text style={styles.checkText}>{selected ? "✓" : ""}</Text></View>
    <View style={styles.optionText}><Text style={styles.optionLabel}>{label}</Text><Text style={styles.optionCost}>{cost}</Text></View>
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 4000, backgroundColor: "#000" },
  deathScene: { flex: 1, alignItems: "center", justifyContent: "flex-start", gap: 18, paddingHorizontal: 14, backgroundColor: "#000" },
  death: { color: "#B31414", fontSize: 42, fontWeight: "900", letterSpacing: 4, textAlign: "center" },
  deathPortrait: { width: "108%", maxWidth: 430, flex: 1 },
  karmaShade: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.48)" },
  content: { minHeight: "100%", paddingHorizontal: 20, alignItems: "center", justifyContent: "center", gap: 13 },
  kp: { color: "#F0C85A", fontFamily: "Oldenburg", fontSize: 16, fontVariant: ["tabular-nums"], backgroundColor: "rgba(0,0,0,0.68)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  error: { color: "#FF9E8D", textAlign: "center", fontSize: 12, backgroundColor: "rgba(0,0,0,0.72)", padding: 8, borderRadius: 8 },
  primaryChoices: { width: "100%", maxWidth: 390, gap: 10 },
  mainButton: { borderRadius: 13, borderCurve: "continuous", borderWidth: 1.5, borderColor: "rgba(196,148,58,0.72)", backgroundColor: "rgba(32,20,8,0.88)", padding: 15, alignItems: "center", gap: 5 },
  mainButtonText: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 16 }, cost: { color: "rgba(240,232,213,0.68)", fontSize: 10, textAlign: "center" },
  optionsPanel: { width: "100%", maxWidth: 400, gap: 8, backgroundColor: "rgba(0,0,0,0.62)", borderRadius: 15, borderCurve: "continuous", padding: 12 }, optionsTitle: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 16, textAlign: "center" },
  option: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 11, borderWidth: 1, borderColor: "rgba(196,148,58,0.34)", backgroundColor: "rgba(255,255,255,0.04)", padding: 10 },
  optionSelected: { borderColor: "#C4943A", backgroundColor: "rgba(196,148,58,0.2)" }, check: { width: 23, height: 23, borderRadius: 6, borderWidth: 1, borderColor: "rgba(196,148,58,0.52)", alignItems: "center", justifyContent: "center" },
  checkSelected: { backgroundColor: "#8A5B19" }, checkText: { color: "#FFF", fontWeight: "800" }, optionText: { flex: 1, gap: 2 }, optionLabel: { color: "#F0E8D5", fontFamily: "Oldenburg", fontSize: 12 }, optionCost: { color: "rgba(240,232,213,0.62)", fontSize: 9, lineHeight: 13 },
  freeTitle: { color: "#C4943A", fontFamily: "Oldenburg", fontSize: 12, textAlign: "center", paddingTop: 5 }, total: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 14, textAlign: "center", fontVariant: ["tabular-nums"], paddingTop: 5 }, totalInsufficient: { color: "#FF8A73" },
  confirmButton: { minHeight: 52, borderRadius: 12, backgroundColor: "rgba(126,89,26,0.92)", borderWidth: 1.5, borderColor: "#C4943A", alignItems: "center", justifyContent: "center" }, confirmText: { color: "#FFF4D8", fontFamily: "Oldenburg", fontSize: 15 },
  back: { color: "#D0C2AE", textAlign: "center", textDecorationLine: "underline", paddingVertical: 8 }, disabled: { opacity: 0.35 },
  avatarScene: { flex: 1, alignItems: "center", justifyContent: "center", gap: 24, paddingHorizontal: 18, backgroundColor: "#000" },
  avatarTitle: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 22, textAlign: "center" },
  avatarChoices: { width: "100%", maxWidth: 520, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10 },
  avatarButton: { flex: 1, maxWidth: 160, aspectRatio: 0.72, borderRadius: 14, borderCurve: "continuous", overflow: "hidden", borderWidth: 1.5, borderColor: "#C4943A", backgroundColor: "#120A03" },
  avatarImage: { width: "100%", height: "100%" },
  preparing: { color: "#C4943A", fontFamily: "Oldenburg", fontSize: 13 },
});
