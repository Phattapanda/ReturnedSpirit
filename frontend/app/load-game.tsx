import { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { clearSlotSnapshot } from "@/src/game/save-manager";

const BG = require("../assets/images/bg-tavern.jpg");

type SaveSlot = {
  slot: number;
  occupied: boolean;
  name: string | null;
  savedAt: string | null;
  playtime: number;
  tutorialDone?: boolean;
};

const DEFAULT_SLOTS: SaveSlot[] = [
  { slot: 1, occupied: false, name: null, savedAt: null, playtime: 0 },
  { slot: 2, occupied: false, name: null, savedAt: null, playtime: 0 },
  { slot: 3, occupied: false, name: null, savedAt: null, playtime: 0 },
];

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "long" }) + " · " +
    d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export default function LoadGame() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [slots, setSlots] = useState<SaveSlot[]>(DEFAULT_SLOTS);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const loadSlots = async () => {
    try {
      const raw = await AsyncStorage.getItem("game_slots");
      if (raw) setSlots(JSON.parse(raw));
    } catch {}
  };

  useFocusEffect(useCallback(() => { loadSlots(); }, []));

  const handleDelete = async (slotNum: number) => {
    const updated = slots.map((s) =>
      s.slot === slotNum
        ? { ...s, occupied: false, name: null, savedAt: null, playtime: 0 }
        : s
    );
    setSlots(updated);
    setConfirmDelete(null);
    await AsyncStorage.setItem("game_slots", JSON.stringify(updated));
    // Also clear the gameplay snapshot for the deleted slot
    await clearSlotSnapshot(slotNum);
  };

  const handleLoad = async (slot: SaveSlot) => {
    if (!slot.occupied) return;
    try {
      await AsyncStorage.setItem("@game:active_slot", String(slot.slot));
      if (slot.name) {
        await AsyncStorage.setItem("@game:player_name", slot.name);
      }
      // NOTE: restoreFromSnapshot is called inside game-loading.tsx, NOT here.
      // This keeps the loading screen responsible for all pre-gameplay setup.
      // Legacy tutorial flag is also restored by restoreFromSnapshot.
    } catch {}
    router.push({
      pathname: "/game-loading",
      params: { from: "load-game", slotId: String(slot.slot) },
    });
  };

  return (
    <View style={styles.root}>
      <Image source={BG} style={styles.bgImage} resizeMode="cover" resizeMethod="resize" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity testID="back-button" style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color="#2C1810" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Load Game</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}>
        {slots.map((slot) => (
          <View key={slot.slot} style={styles.card}>
            <View style={[styles.iconCircle, slot.occupied ? styles.iconOccupied : styles.iconEmpty]}>
              <MaterialCommunityIcons
                name={slot.occupied ? "book-open-variant" : "bookmark-outline"}
                size={24}
                color={slot.occupied ? "#C4614A" : "#8B7355"}
              />
            </View>
            <TouchableOpacity
              testID={`load-slot-${slot.slot}`}
              style={styles.cardContent}
              onPress={() => handleLoad(slot)}
              activeOpacity={slot.occupied ? 0.7 : 1}
              disabled={!slot.occupied}
            >
              <Text style={[styles.slotName, !slot.occupied && styles.slotNameEmpty]}>
                {slot.occupied ? slot.name! : `Slot ${slot.slot} · empty`}
              </Text>
              {slot.occupied ? (
                <>
                  <Text style={styles.slotSub}>Saved · {formatDate(slot.savedAt)}</Text>
                  <Text style={styles.slotSub}>Playtime · {slot.playtime}m</Text>
                </>
              ) : (
                <Text style={styles.slotSub}>Start a new game to fill this slot.</Text>
              )}
            </TouchableOpacity>
            {slot.occupied && confirmDelete !== slot.slot && (
              <TouchableOpacity
                testID={`delete-slot-${slot.slot}`}
                style={styles.deleteBtn}
                onPress={() => setConfirmDelete(slot.slot)}
              >
                <MaterialCommunityIcons name="delete-outline" size={22} color="#C4614A" />
              </TouchableOpacity>
            )}
            {slot.occupied && confirmDelete === slot.slot && (
              <View style={styles.confirmRow}>
                <TouchableOpacity testID={`confirm-delete-${slot.slot}`} style={styles.confirmYes} onPress={() => handleDelete(slot.slot)}>
                  <Text style={styles.confirmYesText}>Delete</Text>
                </TouchableOpacity>
                <TouchableOpacity testID={`cancel-delete-${slot.slot}`} style={styles.confirmNo} onPress={() => setConfirmDelete(null)}>
                  <Text style={styles.confirmNoText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}
            {slot.occupied && confirmDelete !== slot.slot && (
              <Ionicons name="chevron-forward" size={18} color="#C4943A" style={styles.chevron} />
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F0EDE4" },
  bgImage: { ...StyleSheet.absoluteFillObject, opacity: 0.10 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "700",
    color: "#2C1810",
    fontFamily: "Oldenburg",
  },
  headerSpacer: { width: 40 },
  list: { paddingHorizontal: 16, gap: 12 },
  card: {
    backgroundColor: "rgba(255,255,255,0.65)",
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  iconOccupied: { backgroundColor: "rgba(196,97,74,0.15)" },
  iconEmpty: { backgroundColor: "rgba(0,0,0,0.06)" },
  cardContent: { flex: 1 },
  slotName: { fontSize: 17, fontWeight: "700", color: "#2C1810", fontFamily: "Oldenburg" },
  slotNameEmpty: { color: "#8B7355" },
  slotSub: { fontSize: 13, color: "#8B7355", marginTop: 2 },
  deleteBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  chevron: { marginLeft: -4 },
  confirmRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  confirmYes: {
    backgroundColor: "#C4614A",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  confirmYesText: { color: "#FFF", fontSize: 12, fontWeight: "700" },
  confirmNo: {
    backgroundColor: "rgba(0,0,0,0.07)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  confirmNoText: { color: "#2C1810", fontSize: 12 },
});
