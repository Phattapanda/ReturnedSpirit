import React from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  getEffectDefinition,
  getTraitDefinition,
  type StatusEffectState,
} from "@/src/game/status-effect-system";

type Props = {
  visible: boolean;
  effects: StatusEffectState;
  onClose: () => void;
};

export default function StatusEffectsModal({ visible, effects, onClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.panel, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Buffs & Debuffs</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionTitle}>Temporary Effects</Text>
            {effects.temporary.length === 0 ? (
              <Text style={styles.emptyText}>No temporary effects.</Text>
            ) : effects.temporary.map((active) => {
              const definition = getEffectDefinition(active.id);
              if (!definition) return null;
              const duration = `${active.remainingDays} ${active.remainingDays === 1 ? "day" : "days"}`;
              return (
                <View
                  key={active.id}
                  style={[styles.effectCard, definition.kind === "debuff" ? styles.debuffCard : styles.buffCard]}
                >
                  <View style={styles.effectHeader}>
                    <Text style={definition.kind === "debuff" ? styles.debuffName : styles.buffName}>
                      {definition.name}
                    </Text>
                    <Text style={styles.durationText}>{duration}</Text>
                  </View>
                  <Text style={styles.description}>{definition.description}</Text>
                  {active.stacks > 1 && <Text style={styles.metaText}>Stacks: {active.stacks}</Text>}
                </View>
              );
            })}

            <Text style={[styles.sectionTitle, styles.traitSection]}>Permanent Traits</Text>
            {effects.traits.length === 0 ? (
              <Text style={styles.emptyText}>No traits in this run.</Text>
            ) : effects.traits.map((active) => {
              const definition = getTraitDefinition(active.id);
              if (!definition) return null;
              const cure = definition.cureCondition;
              return (
                <View key={active.id} style={[styles.effectCard, styles.traitCard]}>
                  <View style={styles.effectHeader}>
                    <Text style={styles.traitName}>{definition.name}</Text>
                    <Text style={styles.durationText}>
                      {active.remainingRuns === 1 ? "This run" : `${active.remainingRuns} runs`}
                    </Text>
                  </View>
                  <Text style={styles.description}>{definition.description}</Text>
                  {cure && (
                    <Text style={styles.metaText}>
                      Cure: {cure.description} ({Math.min(active.cureProgress, cure.required)}/{cure.required})
                    </Text>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    alignItems: "center",
  },
  panel: {
    width: 330,
    maxHeight: "82%",
    paddingHorizontal: 18,
    paddingTop: 15,
    backgroundColor: "#1A0E05",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.55)",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 12,
  },
  title: { color: "#C4943A", fontSize: 17, fontFamily: "Oldenburg" },
  closeText: { color: "#C4943A", fontSize: 18 },
  scroll: { maxHeight: 500 },
  sectionTitle: {
    color: "#F0E8D5",
    fontSize: 13,
    fontFamily: "Oldenburg",
    paddingBottom: 7,
  },
  traitSection: { paddingTop: 16 },
  emptyText: {
    color: "rgba(240,232,213,0.46)",
    fontSize: 11,
    lineHeight: 17,
    fontFamily: "Oldenburg",
    paddingVertical: 7,
  },
  effectCard: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 9,
    marginBottom: 7,
    gap: 5,
  },
  buffCard: { backgroundColor: "rgba(87,130,68,0.12)", borderColor: "rgba(126,180,97,0.30)" },
  debuffCard: { backgroundColor: "rgba(135,54,54,0.14)", borderColor: "rgba(190,76,76,0.35)" },
  traitCard: { backgroundColor: "rgba(104,75,145,0.14)", borderColor: "rgba(155,113,204,0.34)" },
  effectHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  buffName: { flex: 1, color: "#9EC781", fontSize: 12, fontFamily: "Oldenburg" },
  debuffName: { flex: 1, color: "#E18B82", fontSize: 12, fontFamily: "Oldenburg" },
  traitName: { flex: 1, color: "#C6A1ED", fontSize: 12, fontFamily: "Oldenburg" },
  durationText: { color: "rgba(240,232,213,0.62)", fontSize: 10, fontFamily: "Oldenburg" },
  description: { color: "rgba(240,232,213,0.78)", fontSize: 11, lineHeight: 16, fontFamily: "Oldenburg" },
  metaText: { color: "rgba(196,148,58,0.72)", fontSize: 10, lineHeight: 15, fontFamily: "Oldenburg" },
});
