import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  UPGRADABLE_FIELDS,
  STAT_LABELS,
  STAT_DESCRIPTIONS,
  UPGRADE_GP_COST,
  applyStatUpgrade,
  type PlayerStats,
  type UpgradableField,
} from "@/src/game/player-stats";

type Props = {
  visible: boolean;
  stats: PlayerStats;
  currentStamina: number;
  currentLife: number;
  onClose: () => void;
  onStatsUpdated: (newStats: PlayerStats, newCurrentLife: number | null) => void;
};

export default function StatusModal({
  visible,
  stats,
  currentStamina,
  currentLife,
  onClose,
  onStatsUpdated,
}: Props) {
  const insets = useSafeAreaInsets();
  const [showInfo, setShowInfo] = useState(false);
  const upgradeLocked = React.useRef(false);

  function handleUpgrade(field: UpgradableField) {
    if (upgradeLocked.current) return;
    if (stats.growthPoints < UPGRADE_GP_COST) return;
    upgradeLocked.current = true;
    const { stats: updated, newCurrentLife } = applyStatUpgrade(stats, field, currentLife);
    onStatsUpdated(updated, newCurrentLife);
    setTimeout(() => { upgradeLocked.current = false; }, 300);
  }

  const statRows: { label: string; field: UpgradableField; value: string }[] = [
    { label: "Stamina",        field: "maximumStamina", value: `${currentStamina} / ${stats.maximumStamina}` },
    { label: "Life",           field: "maximumLife",    value: `${currentLife} / ${stats.maximumLife}` },
    { label: "Strength",       field: "strength",       value: String(stats.strength) },
    { label: "Endurance",      field: "endurance",      value: String(stats.endurance) },
    { label: "Perception",     field: "perception",     value: String(stats.perception) },
    { label: "Accuracy",       field: "accuracy",       value: String(stats.accuracy) },
    { label: "Luck",           field: "luck",            value: String(stats.luck) },
    { label: "Effectiveness",  field: "effectiveness",  value: String(stats.effectiveness) },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay]}>
        <View style={[styles.panel, { paddingBottom: insets.bottom + 12 }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Status</Text>
            <View style={styles.headerBtns}>
              <TouchableOpacity
                onPress={() => setShowInfo(true)}
                style={styles.infoBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.infoBtnText}>?</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Growth Points */}
          <View style={styles.gpRow}>
            <View>
              <Text style={styles.gpLabel}>Growth Points</Text>
              <Text style={styles.gpHint}>10 Growth Points needed.</Text>
            </View>
            <Text style={styles.gpValue}>{stats.growthPoints}</Text>
          </View>

          {/* Stats */}
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {statRows.map(({ label, field, value }) => {
              const canAffordUpgrade = stats.growthPoints >= UPGRADE_GP_COST;
              return (
                <View key={field} style={styles.statRow}>
                  <Text style={styles.statLabel}>{label}</Text>
                  <Text style={styles.statValue}>{value}</Text>
                  <TouchableOpacity
                    style={[styles.upgradeBtn, !canAffordUpgrade && styles.upgradeBtnDisabled]}
                    onPress={() => handleUpgrade(field)}
                    disabled={!canAffordUpgrade}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.upgradeBtnText, !canAffordUpgrade && styles.upgradeBtnTextDisabled]}>+</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        </View>

        {/* Info overlay */}
        {showInfo && (
          <Modal visible transparent animationType="fade" onRequestClose={() => setShowInfo(false)}>
            <View style={styles.overlay}>
              <View style={[styles.infoPanel, { paddingBottom: insets.bottom + 12 }]}>
                <View style={styles.infoHeader}>
                  <Text style={styles.infoTitle}>Stat Info</Text>
                  <TouchableOpacity onPress={() => setShowInfo(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.closeText}>✕</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.infoScroll} showsVerticalScrollIndicator={false}>
                  {Object.entries(STAT_DESCRIPTIONS).map(([key, desc]) => (
                    <View key={key} style={styles.infoEntry}>
                      <Text style={styles.infoEntryTitle}>{key.charAt(0) + key.slice(1).toLowerCase()}</Text>
                      <Text style={styles.infoEntryDesc}>{desc}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            </View>
          </Modal>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
  },
  panel: {
    backgroundColor: "#1A0E05",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.55)",
    paddingHorizontal: 18,
    paddingTop: 14,
    width: 310,
    maxHeight: "85%" as any,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.7,
    shadowRadius: 18,
    elevation: 22,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  headerBtns: { flexDirection: "row", gap: 8 },
  title: { color: "#C4943A", fontSize: 18, fontFamily: "Oldenburg" },
  infoBtn: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: "rgba(196,148,58,0.18)",
    borderWidth: 1, borderColor: "rgba(196,148,58,0.45)",
    alignItems: "center", justifyContent: "center",
  },
  infoBtnText: { color: "#C4943A", fontSize: 14, fontFamily: "Oldenburg" },
  closeBtn: { padding: 2 },
  closeText: { color: "#C4943A", fontSize: 18 },

  gpRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(196,148,58,0.08)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(196,148,58,0.30)",
  },
  gpHint: { color: "rgba(196,148,58,0.45)", fontSize: 10, fontFamily: "Oldenburg", marginTop: 2 },
  gpLabel: { color: "#C4943A", fontSize: 13, fontFamily: "Oldenburg" },
  gpValue: { color: "#F0E8D5", fontSize: 16, fontFamily: "Oldenburg" },

  scroll: { maxHeight: 320 },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(196,148,58,0.12)",
    gap: 8,
  },
  statLabel: { flex: 1, color: "#F0E8D5", fontSize: 13, fontFamily: "Oldenburg" },
  statValue: { color: "#C4943A", fontSize: 13, fontFamily: "Oldenburg", minWidth: 60, textAlign: "right" },
  upgradeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "rgba(196,148,58,0.22)",
    borderWidth: 1.5, borderColor: "rgba(196,148,58,0.55)",
    alignItems: "center", justifyContent: "center",
  },
  upgradeBtnDisabled: {
    backgroundColor: "rgba(60,40,15,0.18)",
    borderColor: "rgba(60,40,15,0.30)",
  },
  upgradeBtnText: { color: "#C4943A", fontSize: 17, fontFamily: "Oldenburg" },
  upgradeBtnTextDisabled: { color: "rgba(196,148,58,0.30)" },

  infoPanel: {
    backgroundColor: "#1A0E05",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.55)",
    paddingHorizontal: 18,
    paddingTop: 14,
    width: 310,
    maxHeight: "85%" as any,
  },
  infoHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  infoTitle: { color: "#C4943A", fontSize: 16, fontFamily: "Oldenburg" },
  infoScroll: { maxHeight: 380 },
  infoEntry: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(196,148,58,0.12)" },
  infoEntryTitle: { color: "#C4943A", fontSize: 13, fontFamily: "Oldenburg", marginBottom: 3 },
  infoEntryDesc: { color: "rgba(240,232,213,0.78)", fontSize: 12, fontFamily: "Oldenburg", lineHeight: 18 },
});
