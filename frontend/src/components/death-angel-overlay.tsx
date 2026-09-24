import React, { useEffect, useRef, useState } from "react";
import { useEventListener } from "expo";
import { VideoView, useVideoPlayer } from "expo-video";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Animated, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KARMA_TAVERN_RETURN_COST, nextRunBonusCost, REPEAT_FIGHT_KP_COST } from "@/src/game/death-angel-system";
import { PLAYER_AVATAR_KEY, normalizePlayerAvatarId, type PlayerAvatarId } from "@/src/game/player-avatar";
import type { NextRunBonuses, NextRunFreeItem } from "@/src/game/next-run";
import { PLAYER_STATS_KEY, normalizePlayerStats } from "@/src/game/player-stats";

const MEETING_DEATH_VIDEO = require("../../assets/video/meeting_death.mp4");
const REBIRTH_VIDEO = require("../../assets/video/rebirth.mp4");
const MEETING_DEATH_BACKGROUND = require("../../assets/images/meeting_death.png");
const DEATH_AVATARS = {
  1: require("../../assets/images/avatar1_death.jpeg"),
  2: require("../../assets/images/avatar2_death.jpeg"),
  3: require("../../assets/images/avatar3_death.jpeg"),
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
  onKarmaTavernReturn?: () => void;
  onStartNextRun: (bonuses: NextRunBonuses, avatarId: PlayerAvatarId) => void;
};

const FREE_ITEMS: { id: NextRunFreeItem; label: string }[] = [
  { id: "stamina_potions", label: "3× Low Grade Stamina Potions" },
  { id: "healing_potions", label: "3× Low Grade Healing Potions" },
  { id: "energy_potions", label: "3× Low Grade Energy Potions" },
  { id: "onion_bag", label: "1× Bag with 50 Onions" },
  { id: "nails", label: "10× Nails" },
  { id: "paint", label: "4× Paint" },
  { id: "seeds", label: "3× Herb Seed, 3× Carrot Seed, 3× Potato Seed" },
];

const EMPTY_CART: NextRunBonuses = {
  incomeBonusPacks: 0,
  startingSilver: 0,
  growthPointPacks: 0,
  freeItems: [],
};

export default function DeathAngelOverlay({ visible, karmaPoints, busy = false, error, onRepeatFight, onKarmaTavernReturn, onStartNextRun }: Props) {
  const insets = useSafeAreaInsets();
  const deathOpacity = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<DeathPhase>("death");
  const [phase, setPhaseState] = useState<DeathPhase>("death");
  const [avatarId, setAvatarId] = useState<PlayerAvatarId>(1);
  const [avatarReady, setAvatarReady] = useState(false);
  const [runBaseUpgrades, setRunBaseUpgrades] = useState(0);
  const [showNewRun, setShowNewRun] = useState(false);
  const [avatarCommitted, setAvatarCommitted] = useState(false);
  const [bonuses, setBonuses] = useState<NextRunBonuses>(EMPTY_CART);
  const [pendingBonuses, setPendingBonuses] = useState<NextRunBonuses>(EMPTY_CART);
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
      setBonuses(EMPTY_CART);
      setPendingBonuses(EMPTY_CART);
      return;
    }

    let mounted = true;
    void Promise.all([AsyncStorage.getItem(PLAYER_AVATAR_KEY), AsyncStorage.getItem(PLAYER_STATS_KEY)]).then(([rawAvatar, rawStats]) => {
      if (!mounted) return;
      setRunBaseUpgrades(normalizePlayerStats(rawStats ? JSON.parse(rawStats) : null).runBaseUpgrades);
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

  function changeQuantity(key: "incomeBonusPacks" | "startingSilver" | "growthPointPacks", delta: number) {
    setBonuses((current) => ({ ...current, [key]: Math.max(0, Math.floor(current[key] ?? 0) + delta) }));
  }

  function toggleSingle(key: "betterValues" | "preserveFavor" | "skipRupertTutorials") {
    setBonuses((current) => ({ ...current, [key]: !current[key] }));
  }

  function toggleFreeItem(id: NextRunFreeItem) {
    setBonuses((current) => {
      const selected = current.freeItems ?? [];
      return { ...current, freeItems: selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id] };
    });
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
      <Image source={DEATH_AVATARS[avatarId]} style={StyleSheet.absoluteFill} resizeMode="contain" />
      <Text style={[styles.death, { position: "absolute", bottom: insets.bottom + 28, left: 14, right: 14, textShadowColor: "#000", textShadowRadius: 8 }]}>YOU DIED</Text>
    </Animated.View> : null}

    {phase === "meeting_video" || phase === "karma" ? <>
      <Image source={MEETING_DEATH_BACKGROUND} style={StyleSheet.absoluteFill} resizeMode="contain" />
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
        {onKarmaTavernReturn ? <TouchableOpacity style={[styles.mainButton, karmaPoints < KARMA_TAVERN_RETURN_COST && styles.disabled]} disabled={busy || karmaPoints < KARMA_TAVERN_RETURN_COST} onPress={onKarmaTavernReturn}>
          <Text style={styles.mainButtonText}>Return to Tavern</Text><Text style={styles.cost}>{KARMA_TAVERN_RETURN_COST} KP · Return with 1 Stamina and 1 Life, keep your items</Text>
        </TouchableOpacity> : null}
        <TouchableOpacity style={styles.mainButton} disabled={busy} onPress={() => setShowNewRun(true)}>
          <Text style={styles.mainButtonText}>Begin from the Start</Text><Text style={styles.cost}>Free · Open the next-run shop</Text>
        </TouchableOpacity>
      </View> : <View style={styles.optionsPanel}>
        <Text style={styles.optionsTitle}>Next-Run Shop</Text>
        <View style={styles.cartHeader}><Text style={styles.cartHeaderBonus}>Bonus</Text><Text style={styles.cartHeaderCost}>Cost</Text><Text style={styles.cartHeaderAdd}>Add</Text></View>
        <CartRow
          label="Permanent better starting values"
          detail={runBaseUpgrades >= 10 ? "Maximum reached" : `${100 + (runBaseUpgrades + 1) * 10} Maximum Stamina · ${30 + (runBaseUpgrades + 1) * 5} Maximum Life`}
          cost="10 KP"
          quantity={bonuses.betterValues ? 1 : 0}
          onAdd={() => toggleSingle("betterValues")}
          onRemove={() => toggleSingle("betterValues")}
          addDisabled={runBaseUpgrades >= 10 || !!bonuses.betterValues}
        />
        <CartRow label="+10% income next run" detail={`${Math.max(0, bonuses.incomeBonusPacks ?? 0) * 10}% selected`} cost="10 KP" quantity={bonuses.incomeBonusPacks ?? 0} onAdd={() => changeQuantity("incomeBonusPacks", 1)} onRemove={() => changeQuantity("incomeBonusPacks", -1)} />
        <CartRow label="Starting Silver" detail="1 Silver Coin per purchase" cost="3 KP" quantity={bonuses.startingSilver ?? 0} onAdd={() => changeQuantity("startingSilver", 1)} onRemove={() => changeQuantity("startingSilver", -1)} />
        <CartRow label="10 Growth Points" detail="10 Growth Points per purchase" cost="3 KP" quantity={bonuses.growthPointPacks ?? 0} onAdd={() => changeQuantity("growthPointPacks", 1)} onRemove={() => changeQuantity("growthPointPacks", -1)} />
        <CartRow label="Keep Guest Favor" detail="Only applies to the next run" cost="20 KP" quantity={bonuses.preserveFavor ? 1 : 0} onAdd={() => toggleSingle("preserveFavor")} onRemove={() => toggleSingle("preserveFavor")} addDisabled={!!bonuses.preserveFavor} />
        <CartRow label="Skip Rupert’s Tutorial" detail="Unlock basic tavern features from Day 1" cost="2 KP" quantity={bonuses.skipRupertTutorials ? 1 : 0} onAdd={() => toggleSingle("skipRupertTutorials")} onRemove={() => toggleSingle("skipRupertTutorials")} addDisabled={!!bonuses.skipRupertTutorials} />
        <Text style={styles.freeTitle}>Free one-time supplies</Text>
        {FREE_ITEMS.map((item) => {
          const selected = bonuses.freeItems?.includes(item.id) ?? false;
          return <CartRow key={item.id} label={item.label} detail="Delivered to the Courier’s Chest" cost="Free" quantity={selected ? 1 : 0} onAdd={() => toggleFreeItem(item.id)} onRemove={() => toggleFreeItem(item.id)} addDisabled={selected} />;
        })}
        <Text style={[styles.total, cost > karmaPoints && styles.totalInsufficient]}>Total: {cost} KP</Text>
        <Text style={styles.savedKarmaNote}>Unused Karma Points are saved and will not be lost.</Text>
        <TouchableOpacity style={[styles.confirmButton, (busy || cost > karmaPoints) && styles.disabled]} disabled={busy || cost > karmaPoints} onPress={beginRebirth}>
          <Text style={styles.confirmText}>Confirm Cart</Text>
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

function CartRow({ label, detail, cost, quantity, onAdd, onRemove, addDisabled = false }: { label: string; detail: string; cost: string; quantity: number; onAdd: () => void; onRemove: () => void; addDisabled?: boolean }) {
  return <View style={styles.cartRow}>
    <View style={styles.cartBonus}><Text style={styles.optionLabel}>{label}</Text><Text style={styles.optionCost}>{detail}</Text></View>
    <Text style={styles.cartCost}>{cost}</Text>
    <View style={styles.cartControls}>
      {quantity > 0 ? <TouchableOpacity accessibilityLabel={`Remove ${label}`} style={styles.cartButton} onPress={onRemove}><Text style={styles.cartButtonText}>−</Text></TouchableOpacity> : null}
      {quantity > 0 ? <Text style={styles.cartQuantity}>{quantity}</Text> : null}
      <TouchableOpacity accessibilityLabel={`Add ${label}`} style={[styles.cartButton, addDisabled && styles.cartButtonDisabled]} disabled={addDisabled} onPress={onAdd}><Text style={styles.cartButtonText}>+</Text></TouchableOpacity>
    </View>
  </View>;
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
  cartHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingBottom: 2 },
  cartHeaderBonus: { flex: 1, color: "rgba(240,232,213,0.62)", fontFamily: "Oldenburg", fontSize: 9, textTransform: "uppercase" },
  cartHeaderCost: { width: 50, color: "rgba(240,232,213,0.62)", fontFamily: "Oldenburg", fontSize: 9, textAlign: "center", textTransform: "uppercase" },
  cartHeaderAdd: { width: 84, color: "rgba(240,232,213,0.62)", fontFamily: "Oldenburg", fontSize: 9, textAlign: "center", textTransform: "uppercase" },
  cartRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 11, borderCurve: "continuous", borderWidth: 1, borderColor: "rgba(196,148,58,0.34)", backgroundColor: "rgba(255,255,255,0.04)", padding: 9 },
  cartBonus: { flex: 1, gap: 2 },
  cartCost: { width: 50, color: "#E4C882", fontFamily: "Oldenburg", fontSize: 10, textAlign: "center", fontVariant: ["tabular-nums"] },
  cartControls: { width: 84, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4 },
  cartButton: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: "#C4943A", backgroundColor: "rgba(126,89,26,0.72)", alignItems: "center", justifyContent: "center" },
  cartButtonDisabled: { opacity: 0.28 },
  cartButtonText: { color: "#FFF4D8", fontSize: 20, fontWeight: "700", lineHeight: 23 },
  cartQuantity: { minWidth: 14, color: "#FFF4D8", fontFamily: "Oldenburg", fontSize: 11, textAlign: "center", fontVariant: ["tabular-nums"] },
  option: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 11, borderWidth: 1, borderColor: "rgba(196,148,58,0.34)", backgroundColor: "rgba(255,255,255,0.04)", padding: 10 },
  optionSelected: { borderColor: "#C4943A", backgroundColor: "rgba(196,148,58,0.2)" }, check: { width: 23, height: 23, borderRadius: 6, borderWidth: 1, borderColor: "rgba(196,148,58,0.52)", alignItems: "center", justifyContent: "center" },
  checkSelected: { backgroundColor: "#8A5B19" }, checkText: { color: "#FFF", fontWeight: "800" }, optionText: { flex: 1, gap: 2 }, optionLabel: { color: "#F0E8D5", fontFamily: "Oldenburg", fontSize: 12 }, optionCost: { color: "rgba(240,232,213,0.62)", fontSize: 9, lineHeight: 13 },
  freeTitle: { color: "#C4943A", fontFamily: "Oldenburg", fontSize: 12, textAlign: "center", paddingTop: 5 }, total: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 14, textAlign: "center", fontVariant: ["tabular-nums"], paddingTop: 5 }, totalInsufficient: { color: "#FF8A73" }, savedKarmaNote: { color: "rgba(240,232,213,0.72)", fontSize: 10, lineHeight: 15, textAlign: "center" },
  confirmButton: { minHeight: 52, borderRadius: 12, backgroundColor: "rgba(126,89,26,0.92)", borderWidth: 1.5, borderColor: "#C4943A", alignItems: "center", justifyContent: "center" }, confirmText: { color: "#FFF4D8", fontFamily: "Oldenburg", fontSize: 15 },
  back: { color: "#D0C2AE", textAlign: "center", textDecorationLine: "underline", paddingVertical: 8 }, disabled: { opacity: 0.35 },
  avatarScene: { flex: 1, alignItems: "center", justifyContent: "center", gap: 24, paddingHorizontal: 18, backgroundColor: "#000" },
  avatarTitle: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 22, textAlign: "center" },
  avatarChoices: { width: "100%", maxWidth: 520, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10 },
  avatarButton: { flex: 1, maxWidth: 160, aspectRatio: 0.72, borderRadius: 14, borderCurve: "continuous", overflow: "hidden", borderWidth: 1.5, borderColor: "#C4943A", backgroundColor: "#120A03" },
  avatarImage: { width: "100%", height: "100%" },
  preparing: { color: "#C4943A", fontFamily: "Oldenburg", fontSize: 13 },
});
