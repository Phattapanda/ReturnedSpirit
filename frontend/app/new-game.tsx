import { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createSnapshot } from "@/src/game/save-manager";
import {
  DEFAULT_PLAYER_AVATAR_ID,
  PLAYER_AVATAR_IDS,
  PLAYER_AVATAR_KEY,
  getPlayerAvatarSource,
  type PlayerAvatarId,
} from "@/src/game/player-avatar";

const BG = require("../assets/images/bg-tavern.jpg");

type SaveSlot = {
  slot: number;
  occupied: boolean;
  name: string | null;
  savedAt: string | null;
  playtime: number;
  avatarId?: PlayerAvatarId;
};

const DEFAULT_SLOTS: SaveSlot[] = [
  { slot: 1, occupied: false, name: null, savedAt: null, playtime: 0 },
  { slot: 2, occupied: false, name: null, savedAt: null, playtime: 0 },
  { slot: 3, occupied: false, name: null, savedAt: null, playtime: 0 },
];

export default function NewGame() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [slots, setSlots] = useState<SaveSlot[]>(DEFAULT_SLOTS);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [selectedAvatarId, setSelectedAvatarId] = useState<PlayerAvatarId>(DEFAULT_PLAYER_AVATAR_ID);
  const [showModal, setShowModal] = useState(false);

  const loadSlots = async () => {
    try {
      const raw = await AsyncStorage.getItem("game_slots");
      if (raw) setSlots(JSON.parse(raw));
    } catch {}
  };

  useFocusEffect(useCallback(() => { loadSlots(); }, []));

  const handleSlotTap = (slot: SaveSlot) => {
    if (slot.occupied) return;
    setSelectedSlot(slot.slot);
    setName("");
    setSelectedAvatarId(DEFAULT_PLAYER_AVATAR_ID);
    setShowModal(true);
  };

  const handleBeginAdventure = async () => {
    if (!name.trim() || selectedSlot === null) return;
    const updated = slots.map((s) =>
      s.slot === selectedSlot
        ? { ...s, occupied: true, name: name.trim(), avatarId: selectedAvatarId, savedAt: new Date().toISOString(), playtime: 0, tutorialDone: false }
        : s
    );
    setSlots(updated);
    await AsyncStorage.setItem("game_slots", JSON.stringify(updated));
    await AsyncStorage.setItem("@game:player_name", name.trim());
    await AsyncStorage.setItem(PLAYER_AVATAR_KEY, String(selectedAvatarId));
    await AsyncStorage.setItem("@game:active_slot", String(selectedSlot));

    // ── Full game-state reset so new game always starts clean ──────────────
    await AsyncStorage.multiRemove([
      // Kitchen tutorial
      "@tutorial:kitchen_done",
      "@kitchen:soup_demo_seen",
      // Game stats
      "@game:stamina",
      "@game:life",
      "@game:day_index",
      // Garden state
      "@garden:has_entered",
      "@garden:has_seen_introduction",
      "@garden:has_watered_tutorial",
      "@garden:has_pulled_weeds_tutorial",
      "@garden:has_fertilized_tutorial",
      "@garden:minimum_task_complete",
      "@garden:tutorial_complete",
      "@garden:tutorial_state",
      "@garden:plot_01_data",
      "@garden:plot_02_data",
      "@garden:inventory",
      "@garden:selected_fertilizer",
      // Tuesday garden flags
      "@garden:inventory_bag_unlocked",
      "@game:bag_inspected",
      "@garden:has_harvested_tutorial_herbs",
      "@garden:harvested_tutorial_yield",
      "@garden:has_received_bucket",
      "@garden:activity_bar_unlocked",
      "@garden:has_fetched_tutorial_water",
      "@garden:crafting_tutorial_ready",
      // Player bag & stats
      "@game:player_bag",
      "@game:player_stats",
      // Kitchen post-garden flags
      "@kitchen:has_seen_post_garden_dialog",
      "@kitchen:dormitory_unlocked",
      "@kitchen:tuesday_morning_shown",
      // Kitchen table & cooking tutorial
      "@kitchen:table_items",
      "@kitchen:cooking_tutorial_done",
      "@kitchen:cooking_tutorial_step",
      "@kitchen:craft_ingredients",
      "@kitchen:craft_tool_slot",
      // Room / Dormitory state
      "@room:has_entered",
      "@room:has_seen_evening_thought",
      "@room:time_of_day",
      "@room:must_sleep_before_leaving",
      "@room:first_sleep_completed",
      "@room:upgrades",
      "@room:storage",
      // Daily spend tracker
      "@game:stamina_spent_today",
      // Shared resources
      "@shared:resources",
      // Logbook
      "@game:logbook",
    ]);

    // ── Create initial snapshot so Load Game restores a clean new game ─────
    await createSnapshot(selectedSlot, "new_game");

    setShowModal(false);
    // Navigate to loading screen first — preloads all gameplay assets before intro starts
    router.push({
      pathname: "/game-loading",
      params: { from: "new-game", characterName: name.trim(), slotId: String(selectedSlot) },
    });
  };

  return (
    <View style={styles.root}>
      <Image source={BG} style={styles.bgImage} resizeMode="cover" resizeMethod="resize" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity testID="back-button" style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color="#2C1810" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Game</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={styles.subtitle}>Choose an empty slot to begin your story.</Text>

      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}>
        {slots.map((slot) => (
          <TouchableOpacity
            key={slot.slot}
            testID={`slot-${slot.slot}`}
            style={[styles.card, slot.occupied && styles.cardOccupied]}
            onPress={() => handleSlotTap(slot)}
            activeOpacity={slot.occupied ? 1 : 0.7}
          >
            <View style={[styles.iconCircle, slot.occupied ? styles.iconCircleOccupied : styles.iconCircleEmpty]}>
              <MaterialCommunityIcons
                name={slot.occupied ? "lock" : "plus-circle-outline"}
                size={24}
                color={slot.occupied ? "#8B7355" : "#C4943A"}
              />
            </View>
            <View style={styles.cardInfo}>
              <Text style={[styles.slotName, slot.occupied && styles.slotNameOccupied]}>
                {slot.occupied ? slot.name! : `Slot ${slot.slot}`}
              </Text>
              <Text style={styles.slotSub}>
                {slot.occupied ? `Occupied by ${slot.name}` : "Empty — tap to begin"}
              </Text>
            </View>
            {slot.occupied ? (
              <Text style={styles.inUseLabel}>In use</Text>
            ) : (
              <Ionicons name="chevron-forward" size={18} color="#C4943A" />
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Begin Your Story</Text>
            <Text style={styles.sheetSub}>Choose your avatar</Text>
            <View style={styles.avatarRow}>
              {PLAYER_AVATAR_IDS.map((avatarId) => (
                <TouchableOpacity
                  key={avatarId}
                  testID={`avatar-choice-${avatarId}`}
                  style={[styles.avatarChoice, selectedAvatarId === avatarId && styles.avatarChoiceSelected]}
                  onPress={() => setSelectedAvatarId(avatarId)}
                  activeOpacity={0.8}
                >
                  <Image
                    source={getPlayerAvatarSource(avatarId, "normal")}
                    style={styles.avatarPreviewImage}
                    resizeMode="cover"
                    resizeMethod="resize"
                  />
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.sheetSub}>Name your character</Text>
            <TextInput
              testID="character-name-input"
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              placeholder="Character name..."
              placeholderTextColor="#A89880"
              maxLength={24}
            />
            <TouchableOpacity
              testID="begin-adventure-button"
              style={[styles.beginBtn, !name.trim() && styles.beginBtnDisabled]}
              onPress={handleBeginAdventure}
              disabled={!name.trim()}
            >
              <Text style={styles.beginBtnText}>Begin Adventure</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="cancel-modal-button" onPress={() => setShowModal(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    color: "#2C1810",
    fontFamily: "Oldenburg",
  },
  headerSpacer: { width: 40 },
  subtitle: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    fontSize: 14,
    color: "#8B7355",
  },
  list: { paddingHorizontal: 16, gap: 12 },
  card: {
    backgroundColor: "rgba(255,255,255,0.65)",
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 14,
  },
  cardOccupied: { opacity: 0.65 },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleEmpty: { backgroundColor: "rgba(196,148,58,0.15)" },
  iconCircleOccupied: { backgroundColor: "rgba(0,0,0,0.07)" },
  cardInfo: { flex: 1 },
  slotName: { fontSize: 17, color: "#2C1810", fontFamily: "Oldenburg" },
  slotNameOccupied: { color: "#8B7355" },
  slotSub: { fontSize: 13, color: "#8B7355", marginTop: 2 },
  inUseLabel: { fontSize: 13, color: "#8B7355", fontStyle: "italic" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    backgroundColor: "#F0EDE4",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 12,
    alignItems: "stretch",
  },
  sheetHandle: { width: 40, height: 4, backgroundColor: "rgba(0,0,0,0.18)", borderRadius: 2, alignSelf: "center", marginBottom: 8 },
  sheetTitle: { fontSize: 20, color: "#2C1810", fontFamily: "Oldenburg", textAlign: "center" },
  sheetSub: { fontSize: 14, color: "#8B7355", textAlign: "center" },
  avatarRow: { flexDirection: "row", justifyContent: "center", gap: 14, marginBottom: 2 },
  avatarChoice: {
    width: 78, height: 78, borderRadius: 39, overflow: "hidden",
    borderWidth: 2, borderColor: "rgba(44,24,16,0.18)", backgroundColor: "#2C1810",
  },
  avatarChoiceSelected: { borderWidth: 3, borderColor: "#C4943A" },
  avatarPreviewImage: { width: "100%", height: "100%", transform: [{ scale: 1.06 }] },
  nameInput: {
    backgroundColor: "rgba(255,255,255,0.8)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#2C1810",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  beginBtn: {
    backgroundColor: "#C4943A",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  beginBtnDisabled: { opacity: 0.45 },
  beginBtnText: { color: "#FFF", fontSize: 16, fontFamily: "Oldenburg" },
  cancelText: { textAlign: "center", color: "#8B7355", fontSize: 14, paddingVertical: 4 },
});
