import React from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export type SeedSelectionOption = {
  id: string;
  name: string;
  quantity: number;
};

type SeedSelectionModalProps = {
  visible: boolean;
  seeds: SeedSelectionOption[];
  selectedSeedId: string | null;
  busy?: boolean;
  onSelect: (seedId: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export default function SeedSelectionModal({
  visible,
  seeds,
  selectedSeedId,
  busy = false,
  onSelect,
  onClose,
  onConfirm,
}: SeedSelectionModalProps) {
  const canConfirm = selectedSeedId !== null && !busy;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.panel}>
          <View style={styles.header}>
            <Text style={styles.title}>Choose a seed to plant:</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close seed selection"
              onPress={onClose}
              style={styles.closeButton}
              activeOpacity={0.75}
            >
              <Text style={styles.closeText}>×</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {seeds.map((seed) => {
              const selected = seed.id === selectedSeedId;
              return (
                <TouchableOpacity
                  key={seed.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => onSelect(seed.id)}
                  style={[styles.seedRow, selected && styles.seedRowSelected]}
                  activeOpacity={0.78}
                >
                  <View style={[styles.radio, selected && styles.radioSelected]}>
                    {selected ? <View style={styles.radioDot} /> : null}
                  </View>
                  <Text style={[styles.seedName, selected && styles.seedNameSelected]}>
                    {seed.name}
                  </Text>
                  <Text style={[styles.seedQuantity, selected && styles.seedQuantitySelected]}>
                    ×{seed.quantity}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ disabled: !canConfirm }}
            disabled={!canConfirm}
            onPress={onConfirm}
            style={[styles.confirmButton, !canConfirm && styles.confirmButtonDisabled]}
            activeOpacity={0.8}
          >
            <Text style={[styles.confirmText, !canConfirm && styles.confirmTextDisabled]}>
              Plant Seed
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(0,0,0,0.76)",
  },
  panel: {
    width: "100%",
    maxWidth: 380,
    maxHeight: "76%",
    gap: 14,
    padding: 18,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.48)",
    backgroundColor: "#160B03",
  },
  header: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  title: {
    flex: 1,
    color: "#F5E6C8",
    fontSize: 16,
    lineHeight: 22,
    fontFamily: "Oldenburg",
  },
  closeButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    borderWidth: 1,
    borderColor: "rgba(196,148,58,0.34)",
    backgroundColor: "rgba(196,148,58,0.08)",
  },
  closeText: {
    color: "#F5E6C8",
    fontSize: 28,
    lineHeight: 30,
  },
  list: { flexGrow: 0 },
  listContent: { gap: 8 },
  seedRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.18)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  seedRowSelected: {
    borderColor: "#C4943A",
    backgroundColor: "rgba(196,148,58,0.18)",
  },
  radio: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "rgba(240,232,213,0.48)",
  },
  radioSelected: { borderColor: "#E4B65A" },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#E4B65A",
  },
  seedName: {
    flex: 1,
    color: "rgba(240,232,213,0.80)",
    fontSize: 14,
    lineHeight: 19,
    fontFamily: "Oldenburg",
  },
  seedNameSelected: { color: "#FFF2D2" },
  seedQuantity: {
    minWidth: 42,
    color: "rgba(196,148,58,0.78)",
    fontSize: 14,
    fontFamily: "Oldenburg",
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  seedQuantitySelected: { color: "#E4B65A" },
  confirmButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(228,182,90,0.72)",
    backgroundColor: "rgba(196,148,58,0.24)",
  },
  confirmButtonDisabled: {
    borderColor: "rgba(120,95,55,0.24)",
    backgroundColor: "rgba(70,50,25,0.16)",
  },
  confirmText: {
    color: "#FFF2D2",
    fontSize: 15,
    fontFamily: "Oldenburg",
  },
  confirmTextDisabled: { color: "rgba(240,232,213,0.32)" },
});
