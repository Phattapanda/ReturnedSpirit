import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { nextRunBonusCost, REPEAT_FIGHT_KP_COST } from "@/src/game/death-angel-system";
import type { NextRunBonuses, NextRunFreeItem } from "@/src/game/next-run";

type Props = {
  visible: boolean;
  karmaPoints: number;
  busy?: boolean;
  error?: string | null;
  onRepeatFight: () => void;
  onStartNextRun: (bonuses: NextRunBonuses) => void;
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
  const [showNewRun, setShowNewRun] = useState(false);
  const [bonuses, setBonuses] = useState<NextRunBonuses>({ copper: 0, freeItem: null });
  useEffect(() => { if (!visible) { setShowNewRun(false); setBonuses({ copper: 0, freeItem: null }); } }, [visible]);
  if (!visible) return null;
  const cost = nextRunBonusCost(bonuses);

  function toggle(key: "betterValues" | "growthPoints" | "preserveFavor") {
    setBonuses((current) => ({ ...current, [key]: !current[key] }));
  }

  return <View style={styles.overlay}>
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
      <Text style={styles.death}>YOU DIED.</Text>
      <Text style={styles.angelTitle}>The Death Angel</Text>
      <Text style={styles.angelText}>“Another path has ended. Decide whether this fight should be rewritten, or whether a new life should begin.”</Text>
      <Text style={styles.kp}>Available: {karmaPoints} KP</Text>
      {error ? <Text selectable style={styles.error}>{error}</Text> : null}

      {!showNewRun ? <View style={styles.primaryChoices}>
        <TouchableOpacity style={[styles.mainButton, karmaPoints < REPEAT_FIGHT_KP_COST && styles.disabled]} disabled={busy || karmaPoints < REPEAT_FIGHT_KP_COST} onPress={onRepeatFight}>
          <Text style={styles.mainButtonText}>Repeat Fight</Text><Text style={styles.cost}>{REPEAT_FIGHT_KP_COST} KP · Restore fight-start state and items</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.mainButton} disabled={busy} onPress={() => setShowNewRun(true)}>
          <Text style={styles.mainButtonText}>Begin from the Start</Text><Text style={styles.cost}>Free · Choose optional blessings</Text>
        </TouchableOpacity>
      </View> : <View style={styles.optionsPanel}>
        <Text style={styles.optionsTitle}>Blessings for the next run</Text>
        <Option selected={!!bonuses.betterValues} label="Better starting values" cost="10 KP · +10 Maximum Stamina, +5 Maximum Life" onPress={() => toggle("betterValues")} />
        <Option selected={!!bonuses.growthPoints} label="30 Growth Points" cost="10 KP" onPress={() => toggle("growthPoints")} />
        <Option selected={bonuses.copper === 100} label="Start with 1 Silver Coin" cost="5 KP · 100 Copper" onPress={() => setBonuses((current) => ({ ...current, copper: current.copper === 100 ? 0 : 100 }))} />
        <Option selected={bonuses.copper === 300} label="Start with 3 Silver Coins" cost="15 KP · 300 Copper" onPress={() => setBonuses((current) => ({ ...current, copper: current.copper === 300 ? 0 : 300 }))} />
        <Option selected={!!bonuses.preserveFavor} label="Keep Guest Favor" cost="25 KP" onPress={() => toggle("preserveFavor")} />
        <Text style={styles.freeTitle}>Free recovered item package — choose one</Text>
        {FREE_ITEMS.map((item) => <Option key={item.id} selected={bonuses.freeItem === item.id} label={item.label} cost="Delivered to the Mailbox by City Guard" onPress={() => setBonuses((current) => ({ ...current, freeItem: current.freeItem === item.id ? null : item.id }))} />)}
        <Text style={[styles.total, cost > karmaPoints && styles.totalInsufficient]}>Total: {cost} KP</Text>
        <TouchableOpacity style={[styles.confirmButton, (busy || cost > karmaPoints) && styles.disabled]} disabled={busy || cost > karmaPoints} onPress={() => onStartNextRun(bonuses)}>
          <Text style={styles.confirmText}>{busy ? "Preparing..." : "Start Next Run"}</Text>
        </TouchableOpacity>
        <TouchableOpacity disabled={busy} onPress={() => setShowNewRun(false)}><Text style={styles.back}>Back</Text></TouchableOpacity>
      </View>}
    </ScrollView>
  </View>;
}

function Option({ selected, label, cost, onPress }: { selected: boolean; label: string; cost: string; onPress: () => void }) {
  return <TouchableOpacity style={[styles.option, selected && styles.optionSelected]} onPress={onPress} activeOpacity={0.8}>
    <View style={[styles.check, selected && styles.checkSelected]}><Text style={styles.checkText}>{selected ? "✓" : ""}</Text></View>
    <View style={styles.optionText}><Text style={styles.optionLabel}>{label}</Text><Text style={styles.optionCost}>{cost}</Text></View>
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 4000, backgroundColor: "#030101" },
  content: { minHeight: "100%", paddingHorizontal: 20, alignItems: "center", gap: 13 },
  death: { color: "#B31414", fontSize: 39, fontWeight: "900", letterSpacing: 4 },
  angelTitle: { color: "#E4D1B4", fontFamily: "Oldenburg", fontSize: 22 },
  angelText: { color: "rgba(240,232,213,0.74)", fontSize: 13, lineHeight: 20, textAlign: "center", maxWidth: 380 },
  kp: { color: "#D6A33B", fontFamily: "Oldenburg", fontSize: 14, fontVariant: ["tabular-nums"] },
  error: { color: "#FF9E8D", textAlign: "center", fontSize: 12 },
  primaryChoices: { width: "100%", maxWidth: 390, gap: 10 },
  mainButton: { borderRadius: 13, borderCurve: "continuous", borderWidth: 1.5, borderColor: "rgba(196,148,58,0.58)", backgroundColor: "rgba(74,45,12,0.52)", padding: 15, alignItems: "center", gap: 5 },
  mainButtonText: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 16 }, cost: { color: "rgba(240,232,213,0.55)", fontSize: 10, textAlign: "center" },
  optionsPanel: { width: "100%", maxWidth: 400, gap: 8 }, optionsTitle: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 16, textAlign: "center" },
  option: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 11, borderWidth: 1, borderColor: "rgba(196,148,58,0.27)", backgroundColor: "rgba(255,255,255,0.025)", padding: 10 },
  optionSelected: { borderColor: "#C4943A", backgroundColor: "rgba(196,148,58,0.16)" }, check: { width: 23, height: 23, borderRadius: 6, borderWidth: 1, borderColor: "rgba(196,148,58,0.52)", alignItems: "center", justifyContent: "center" },
  checkSelected: { backgroundColor: "#8A5B19" }, checkText: { color: "#FFF", fontWeight: "800" }, optionText: { flex: 1, gap: 2 }, optionLabel: { color: "#F0E8D5", fontFamily: "Oldenburg", fontSize: 12 }, optionCost: { color: "rgba(240,232,213,0.52)", fontSize: 9, lineHeight: 13 },
  freeTitle: { color: "#C4943A", fontFamily: "Oldenburg", fontSize: 12, textAlign: "center", paddingTop: 5 }, total: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 14, textAlign: "center", fontVariant: ["tabular-nums"], paddingTop: 5 }, totalInsufficient: { color: "#FF8A73" },
  confirmButton: { minHeight: 52, borderRadius: 12, backgroundColor: "rgba(126,89,26,0.78)", borderWidth: 1.5, borderColor: "#C4943A", alignItems: "center", justifyContent: "center" }, confirmText: { color: "#FFF4D8", fontFamily: "Oldenburg", fontSize: 15 },
  back: { color: "#BFB09B", textAlign: "center", textDecorationLine: "underline", paddingVertical: 8 }, disabled: { opacity: 0.35 },
});
