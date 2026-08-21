import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Image,
  Modal,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import {
  ITEM_CATALOG,
  KITCHEN_TABLE_KEY,
  PLAYER_BAG_KEY,
  isConsumable,
  removeBagItem,
  type PlayerBagData,
  type BagItem,
} from "@/src/game/item-system";
import {
  PLAYER_STATS_KEY,
  activateStaminaBuff,
  hasStaminaBuff,
  normalizePlayerStats,
  type PlayerStats,
  type StaminaBuffItemId,
} from "@/src/game/player-stats";
import { useKitchenRuntime } from "@/src/game/kitchen-runtime-context";
import { useAudioManager } from "@/src/audio/AudioProvider";

const ITEM_IMAGES: Record<string, ReturnType<typeof require>> = {
  herbbag:     require("../../assets/images/herbbag.png"),
  carrotbag:   require("../../assets/images/carrotbag.png"),
  carrot:      require("../../assets/images/carrot.png"),
  bucket:      require("../../assets/images/bucket.png"),
  bucketwater: require("../../assets/images/bucketwater.png"),
  herbseed:    require("../../assets/images/herbseed.png"),
  carrotseed:  require("../../assets/images/carrotseed.png"),
  herbs:       require("../../assets/images/herbs.png"),
  herbsoup:    require("../../assets/images/herbsoup.png"),
  oldpot:      require("../../assets/images/oldpot.png"),
  bag1:        require("../../assets/images/bag1.png"),
  wood:        require("../../assets/images/wood.png"),
  stone:       require("../../assets/images/stone.png"),
  cloth:       require("../../assets/images/cloth.png"),
  nails:       require("../../assets/images/nails.png"),
  paint:       require("../../assets/images/paint.png"),
  potato:      require("../../assets/images/potato.png"),
  standardfertilizer: require("../../assets/images/fertilizer.png"),
  energydrink: require("../../assets/images/energy Drink.png"),
  energypill:  require("../../assets/images/energy Pill.png"),
  goldenapple: require("../../assets/images/golden apple.png"),
};

export type BagContext = "kitchen" | "garden" | "room" | "none";

type Props = {
  bag: PlayerBagData;
  visible: boolean;
  context: BagContext;
  dayIdx?: number;
  onClose: () => void;
  onTransferItem: (slotIdx: number, item: BagItem) => void;
  onDiscardItem?: (slotIdx: number, item: BagItem) => void;
  onShowThoughtBubble?: (text: string) => void;
  onBagUpdated?: (bag: PlayerBagData) => void;
  onStatsUpdated?: (stats: PlayerStats) => void;
  onStaminaUpdated?: (stamina: number) => void;
};

export default function PlayerBag({
  bag, visible, context, dayIdx, onClose, onTransferItem, onDiscardItem, onShowThoughtBubble,
  onBagUpdated, onStatsUpdated, onStaminaUpdated,
}: Props) {
  const { width: W } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { refreshKitchen, showPlayerThought: showKitchenThought } = useKitchenRuntime();
  const audioManager = useAudioManager();
  const [infoItem, setInfoItem] = useState<BagItem | null>(null);
  const [discardTarget, setDiscardTarget] = useState<{ slotIdx: number; item: BagItem } | null>(null);
  const [selectedCarrotBagSlot, setSelectedCarrotBagSlot] = useState<number | null>(null);
  const [carrotBagOverride, setCarrotBagOverride] = useState<PlayerBagData | null>(null);
  const [buffResetTarget, setBuffResetTarget] = useState<{ slotIdx: number; item: BagItem } | null>(null);
  const carrotEditsPending = useRef(false);
  const longPressDidFire = useRef(false);
  const transferLocked = useRef(false);

  useEffect(() => {
    if (visible) {
      setCarrotBagOverride(null);
      setSelectedCarrotBagSlot(null);
      carrotEditsPending.current = false;
    }
  }, [visible]);

  const displayBag = carrotBagOverride ?? bag;
  const DISCARD_LOCK_UNTIL = 3;
  const discardLocked = dayIdx !== undefined && dayIdx <= DISCARD_LOCK_UNTIL;

  function closeBag() {
    onClose();
    if (context === "kitchen" && carrotEditsPending.current) {
      carrotEditsPending.current = false;
      setTimeout(refreshKitchen, 0);
    }
  }

  function handleSlotPressIn() {
    longPressDidFire.current = false;
  }

  function handleSlotLongPress(_slotIdx: number, item: BagItem | null) {
    if (!item) return;
    longPressDidFire.current = true;
    setInfoItem(item);
  }

  async function unpackOneCarrot(slotIdx: number, item: BagItem) {
    const contained = item.containedQuantity ?? 0;
    if (contained <= 0) return;

    try {
      const rawTable = await AsyncStorage.getItem(KITCHEN_TABLE_KEY);
      const table: (BagItem | null)[] = rawTable ? JSON.parse(rawTable) : Array(12).fill(null);
      const nextTable = table.map((entry) => entry ? { ...entry } : null);

      let target = nextTable.findIndex((entry) => entry?.id === "carrot" && entry.quantity < 20);
      if (target < 0) target = nextTable.findIndex((entry) => entry === null);
      if (target < 0) {
        showKitchenThought('"No free space available."');
        return;
      }

      const existing = nextTable[target];
      nextTable[target] = existing
        ? { ...existing, quantity: existing.quantity + 1 }
        : { id: "carrot", itemType: "carrot", name: "Carrot", quantity: 1, attributes: ["ingredient"] };

      const sourceBag = carrotBagOverride ?? bag;
      const nextSlots = sourceBag.slots.map((entry) => entry ? { ...entry } : null);
      const source = nextSlots[slotIdx];
      if (!source || source.id !== "carrotbag") return;
      const remaining = Math.max(0, (source.containedQuantity ?? 0) - 1);
      nextSlots[slotIdx] = remaining > 0 ? { ...source, containedQuantity: remaining } : null;
      const nextBag = { ...sourceBag, slots: nextSlots };

      await AsyncStorage.multiSet([
        [KITCHEN_TABLE_KEY, JSON.stringify(nextTable)],
        [PLAYER_BAG_KEY, JSON.stringify(nextBag)],
      ]);
      carrotEditsPending.current = true;
      setCarrotBagOverride(nextBag);
      audioManager.playSoundEffect("moveitem", { maxDurationMs: 3000 });
      if (remaining <= 0) setSelectedCarrotBagSlot(null);
    } catch {
      showKitchenThought('"I can\'t unpack this right now."');
    }
  }

  async function handleSlotPress(slotIdx: number, item: BagItem | null) {
    if (!item) return;
    if (longPressDidFire.current) {
      longPressDidFire.current = false;
      return;
    }
    if (infoItem) {
      setInfoItem(null);
      return;
    }

    if (isConsumable(item)) {
      await handleConsumablePress(slotIdx, item);
      return;
    }

    // Carrot Bag transfers to the Kitchen Table like Herb Bag; unpacking happens there.
    setSelectedCarrotBagSlot(null);
    if (context === "garden" || context === "none") {
      setDiscardTarget({ slotIdx, item });
      return;
    }
    if (transferLocked.current) return;
    transferLocked.current = true;
    onTransferItem(slotIdx, item);
    setTimeout(() => { transferLocked.current = false; }, 400);
  }

  async function handleConsumablePress(slotIdx: number, item: BagItem) {
    try {
      const rawStats = await AsyncStorage.getItem(PLAYER_STATS_KEY);
      const stats = normalizePlayerStats(rawStats ? JSON.parse(rawStats) : null);
      if ((item.id === "energydrink" || item.id === "energypill") && hasStaminaBuff(stats, item.id)) {
        setBuffResetTarget({ slotIdx, item });
        return;
      }
      await consumeItem(slotIdx, item, stats);
    } catch {
      onShowThoughtBubble?.('"I can\'t use this right now."');
    }
  }

  async function consumeItem(slotIdx: number, item: BagItem, loadedStats?: PlayerStats) {
    const sourceBag = carrotBagOverride ?? bag;
    const sourceItem = sourceBag.slots[slotIdx];
    if (!sourceItem || sourceItem.id !== item.id || sourceItem.quantity <= 0) return;

    const rawStats = loadedStats ? null : await AsyncStorage.getItem(PLAYER_STATS_KEY);
    const stats = loadedStats ?? normalizePlayerStats(rawStats ? JSON.parse(rawStats) : null);
    const rawStamina = await AsyncStorage.getItem("@game:stamina");
    const currentStamina = Math.max(0, Number.parseInt(rawStamina ?? "40", 10) || 0);
    let nextStats = stats;
    let nextStamina = currentStamina;

    if (item.id === "healthymuffin" && currentStamina >= stats.maximumStamina) {
      onShowThoughtBubble?.('"My Stamina is already full."');
      return;
    }

    if (item.id === "energydrink" || item.id === "energypill") {
      nextStats = activateStaminaBuff(stats, item.id as StaminaBuffItemId);
    } else if (item.id === "healthymuffin") {
      nextStamina = Math.min(stats.maximumStamina, currentStamina + 50);
    } else if (item.id === "goldenapple") {
      nextStamina = currentStamina + 50;
    } else {
      return;
    }

    const nextBag = removeBagItem(sourceBag, slotIdx, 1);
    await AsyncStorage.multiSet([
      [PLAYER_BAG_KEY, JSON.stringify(nextBag)],
      [PLAYER_STATS_KEY, JSON.stringify(nextStats)],
      ["@game:stamina", String(nextStamina)],
    ]);
    setCarrotBagOverride(nextBag);
    setBuffResetTarget(null);
    onBagUpdated?.(nextBag);
    onStatsUpdated?.(nextStats);
    onStaminaUpdated?.(nextStamina);
    audioManager.playSoundEffect("moveitem", { maxDurationMs: 3000 });
  }

  function handleDiscardNo() {
    setDiscardTarget(null);
  }

  function handleDiscardYes() {
    if (!discardTarget) return;
    if (discardLocked) {
      setDiscardTarget(null);
      onShowThoughtBubble?.("\"We still need it.\"");
      return;
    }
    const { slotIdx, item } = discardTarget;
    setDiscardTarget(null);
    onDiscardItem?.(slotIdx, item);
  }

  const rows = displayBag.rows;
  const cols = displayBag.columns;
  const SLOT_SIZE = Math.min(72, (W - 80) / cols);

  function handleOverlayPress() {
    if (discardTarget) { setDiscardTarget(null); return; }
    if (infoItem) { setInfoItem(null); return; }
    closeBag();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={closeBag}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleOverlayPress}>
        <TouchableOpacity activeOpacity={1} onPress={() => { if (infoItem) setInfoItem(null); }}>
          <View style={[styles.panel, { paddingBottom: insets.bottom + 8 }]}>
            <View style={styles.header}>
              <Text style={styles.title}>Shoulder Bag</Text>
              <TouchableOpacity
                onPress={closeBag}
                style={styles.closeBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.grid}>
              {Array.from({ length: rows }, (_, r) => (
                <View key={r} style={styles.gridRow}>
                  {Array.from({ length: cols }, (_, c) => {
                    const slotIdx = r * cols + c;
                    const item = slotIdx < displayBag.slots.length ? displayBag.slots[slotIdx] : null;
                    return (
                      <BagSlot
                        key={slotIdx}
                        slotIdx={slotIdx}
                        item={item}
                        size={SLOT_SIZE}
                        selected={item?.id === "carrotbag" && selectedCarrotBagSlot === slotIdx}
                        onPressIn={() => handleSlotPressIn()}
                        onLongPress={() => handleSlotLongPress(slotIdx, item)}
                        onPress={() => { void handleSlotPress(slotIdx, item); }}
                      />
                    );
                  })}
                </View>
              ))}
            </View>

            {context !== "none" && (
              <Text style={styles.hint}>
                {context === "kitchen"
                  ? "Tap item to unpack to table.\nLong press for details."
                  : context === "garden"
                  ? "Tap item to discard.\nLong press for details."
                  : "Tap item to move to storage.\nLong press for details."}
              </Text>
            )}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>

      {infoItem && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setInfoItem(null)}>
          <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setInfoItem(null)}>
            <TouchableOpacity activeOpacity={1} onPress={() => setInfoItem(null)}>
              <View style={styles.infoPanel}>
                {ITEM_IMAGES[infoItem.id] && (
                  <Image source={ITEM_IMAGES[infoItem.id]} style={styles.infoImg} resizeMode="contain" resizeMethod="resize" />
                )}
                <Text style={styles.infoName}>{ITEM_CATALOG[infoItem.id]?.name ?? infoItem.name}</Text>
                {infoItem.containedItem && infoItem.containedQuantity != null && (
                  <Text style={styles.infoContents}>
                    Contains: {infoItem.containedQuantity} {infoItem.containedItem}
                  </Text>
                )}
                <Text style={styles.infoDesc}>{ITEM_CATALOG[infoItem.id]?.description ?? ""}</Text>
                {(() => {
                  const attrs = ITEM_CATALOG[infoItem.id]?.attributes ?? [];
                  if (attrs.length === 0) return null;
                  return (
                    <View style={styles.attribBox}>
                      <Text style={styles.attribLabel}>Attributes</Text>
                      <View style={styles.attribRow}>
                        {attrs.map((a) => (
                          <View key={a} style={styles.attribTag}>
                            <Text style={styles.attribTagText}>{a.charAt(0).toUpperCase() + a.slice(1)}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  );
                })()}
                <TouchableOpacity onPress={() => setInfoItem(null)} style={styles.infoDismiss}>
                  <Text style={styles.infoDismissText}>Close</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {discardTarget && (
        <Modal visible transparent animationType="fade" onRequestClose={handleDiscardNo}>
          <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleDiscardNo}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <View style={styles.discardPanel}>
                <Text style={styles.discardTitle}>
                  {ITEM_CATALOG[discardTarget.item.id]?.name ?? discardTarget.item.name}
                </Text>
                <Text style={styles.discardMsg}>
                  {"You can't unpack anything here.\nDo you want to throw it away?"}
                </Text>
                <View style={styles.discardBtns}>
                  <TouchableOpacity style={[styles.discardBtn, styles.discardBtnNo]} onPress={handleDiscardNo} activeOpacity={0.8}>
                    <Text style={styles.discardBtnNoText}>No</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.discardBtn, styles.discardBtnYes]} onPress={handleDiscardYes} activeOpacity={0.8}>
                    <Text style={styles.discardBtnYesText}>Yes</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {buffResetTarget && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setBuffResetTarget(null)}>
          <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setBuffResetTarget(null)}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <View style={styles.discardPanel}>
                <TouchableOpacity
                  style={styles.resetCloseBtn}
                  onPress={() => setBuffResetTarget(null)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.closeText}>✕</Text>
                </TouchableOpacity>
                <Text style={styles.discardTitle}>{ITEM_CATALOG[buffResetTarget.item.id]?.name}</Text>
                <Text style={styles.discardMsg}>The effect is already present. Do you want to reset it?</Text>
                <TouchableOpacity
                  style={[styles.discardBtn, styles.confirmResetBtn]}
                  onPress={() => { void consumeItem(buffResetTarget.slotIdx, buffResetTarget.item); }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.confirmResetText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
    </Modal>
  );
}

type SlotProps = {
  slotIdx: number;
  item: BagItem | null;
  size: number;
  selected?: boolean;
  onPressIn: () => void;
  onLongPress: () => void;
  onPress: () => void;
};

function BagSlot({ item, size, selected, onPressIn, onLongPress, onPress }: SlotProps) {
  const imgSrc = item ? ITEM_IMAGES[item.id] : null;
  return (
    <Pressable
      style={[styles.slot, { width: size, height: size }, selected && styles.slotSelected]}
      onPressIn={onPressIn}
      onLongPress={onLongPress}
      onPress={onPress}
      delayLongPress={500}
      disabled={!item}
    >
      {imgSrc ? (
        <>
          <Image source={imgSrc} style={styles.slotImg} resizeMode="contain" resizeMethod="resize" />
          {item?.containedQuantity != null && item.containedQuantity > 0 && (
            <View style={styles.contentsCircle}>
              <Text style={styles.contentsText}>{item.containedQuantity}</Text>
            </View>
          )}
          {item && item.quantity > 1 && <Text style={styles.stackText}>{item.quantity}</Text>}
        </>
      ) : item ? (
        <Text style={styles.slotFallbackText} numberOfLines={2}>
          {ITEM_CATALOG[item.id]?.name ?? item.name}
        </Text>
      ) : (
        <View style={styles.slotEmpty} />
      )}
    </Pressable>
  );
}

type BagIconProps = {
  unlocked: boolean;
  onPress: () => void;
  style?: object;
  pulsing?: boolean;
};

export function BagIconButton({ unlocked, onPress, style, pulsing }: BagIconProps) {
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    if (pulsing && unlocked) {
      pulseScale.value = withRepeat(withTiming(1.12, { duration: 650 }), -1, true);
    } else {
      pulseScale.value = withTiming(1.0, { duration: 250 });
    }
  }, [pulsing, unlocked]); // eslint-disable-line react-hooks/exhaustive-deps

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  return (
    <Animated.View style={pulseStyle}>
      <TouchableOpacity
        style={[styles.bagIconWrap, !unlocked && styles.bagIconLocked, style]}
        onPress={unlocked ? onPress : undefined}
        disabled={!unlocked}
        activeOpacity={0.8}
      >
        {unlocked ? (
          <Image source={ITEM_IMAGES.bag1} style={styles.bagIconImg} resizeMode="cover" resizeMethod="resize" />
        ) : (
          <Ionicons name="lock-closed" size={26} color="#555" />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.62)", justifyContent: "center", alignItems: "center" },
  panel: {
    backgroundColor: "#1A0E05", borderRadius: 18, borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.55)", paddingHorizontal: 16, paddingTop: 14,
    minWidth: 260, maxWidth: 340, shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.7, shadowRadius: 18, elevation: 22,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title: { color: "#C4943A", fontSize: 17, fontFamily: "Oldenburg" },
  closeBtn: { padding: 4 },
  closeText: { color: "#C4943A", fontSize: 18 },
  grid: { gap: 8 },
  gridRow: { flexDirection: "row", gap: 8 },
  slot: {
    borderRadius: 10, borderWidth: 1.5, borderColor: "rgba(196,148,58,0.4)",
    backgroundColor: "rgba(30,15,3,0.92)", alignItems: "center", justifyContent: "center",
    overflow: "visible", position: "relative",
  },
  slotSelected: { borderWidth: 2, borderColor: "#7EC87E" },
  slotImg: { width: "78%", height: "78%" },
  slotEmpty: { width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0)" },
  slotFallbackText: { color: "#C4943A", fontSize: 9, lineHeight: 11, fontFamily: "Oldenburg", textAlign: "center", paddingHorizontal: 3 },
  contentsCircle: {
    position: "absolute", top: -4, right: -4, backgroundColor: "#1A3A1A", borderRadius: 9,
    minWidth: 18, height: 18, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#4E9E2A", paddingHorizontal: 2,
  },
  contentsText: { color: "#7ED84F", fontSize: 10, fontFamily: "Oldenburg" },
  stackText: {
    position: "absolute", bottom: 2, right: 4, color: "#fff", fontSize: 11,
    fontFamily: "Oldenburg", textShadowColor: "#000", textShadowOffset: { width: 0.5, height: 0.5 }, textShadowRadius: 2,
  },
  hint: { color: "rgba(196,148,58,0.55)", fontSize: 11, fontFamily: "Oldenburg", textAlign: "center", marginTop: 10, marginBottom: 4 },
  infoPanel: {
    backgroundColor: "#1A0E05", borderRadius: 16, borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.55)", padding: 18, maxWidth: 300, alignItems: "center", gap: 8,
  },
  infoImg: { width: 60, height: 60 },
  infoName: { color: "#C4943A", fontSize: 15, fontFamily: "Oldenburg", textAlign: "center" },
  infoContents: { color: "#F0E8D5", fontSize: 12, fontFamily: "Oldenburg", textAlign: "center" },
  infoDesc: { color: "rgba(240,232,213,0.75)", fontSize: 12, fontFamily: "Oldenburg", textAlign: "center", marginBottom: 2 },
  attribBox: { alignItems: "center", gap: 4, marginTop: 2 },
  attribLabel: { color: "rgba(196,148,58,0.65)", fontSize: 10, fontFamily: "Oldenburg", letterSpacing: 0.8, textTransform: "uppercase" },
  attribRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" },
  attribTag: { backgroundColor: "rgba(196,148,58,0.12)", borderRadius: 6, borderWidth: 1, borderColor: "rgba(196,148,58,0.35)", paddingHorizontal: 8, paddingVertical: 3 },
  attribTagText: { color: "#C4943A", fontSize: 11, fontFamily: "Oldenburg" },
  infoDismiss: { marginTop: 6, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, backgroundColor: "rgba(196,148,58,0.18)", borderWidth: 1, borderColor: "rgba(196,148,58,0.4)" },
  infoDismissText: { color: "#C4943A", fontSize: 13, fontFamily: "Oldenburg" },
  discardPanel: { backgroundColor: "#1A0E05", borderRadius: 16, borderWidth: 1.5, borderColor: "rgba(196,148,58,0.55)", padding: 22, maxWidth: 300, alignItems: "center", gap: 10 },
  resetCloseBtn: { position: "absolute", right: 10, top: 8, padding: 4, zIndex: 2 },
  confirmResetBtn: { backgroundColor: "rgba(196,148,58,0.22)", borderWidth: 1, borderColor: "rgba(196,148,58,0.55)", marginTop: 4 },
  confirmResetText: { color: "#F0E8D5", fontSize: 13, fontFamily: "Oldenburg" },
  discardTitle: { color: "#C4943A", fontSize: 15, fontFamily: "Oldenburg", textAlign: "center", marginBottom: 2 },
  discardMsg: { color: "rgba(240,232,213,0.8)", fontSize: 12, fontFamily: "Oldenburg", textAlign: "center", lineHeight: 20 },
  discardBtns: { flexDirection: "row", gap: 12, marginTop: 4 },
  discardBtn: { paddingHorizontal: 24, paddingVertical: 9, borderRadius: 8, minWidth: 80, alignItems: "center" },
  discardBtnNo: { backgroundColor: "rgba(196,148,58,0.12)", borderWidth: 1, borderColor: "rgba(196,148,58,0.35)" },
  discardBtnYes: { backgroundColor: "rgba(180,50,50,0.22)", borderWidth: 1, borderColor: "rgba(180,50,50,0.5)" },
  discardBtnNoText: { color: "#C4943A", fontSize: 13, fontFamily: "Oldenburg" },
  discardBtnYesText: { color: "#E07070", fontSize: 13, fontFamily: "Oldenburg" },
  bagIconWrap: { width: 96, height: 96, borderRadius: 48, backgroundColor: "rgba(30,18,5,0.88)", borderWidth: 2.5, borderColor: "rgba(196,148,58,0.70)", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  bagIconLocked: { borderColor: "rgba(58,58,58,0.8)", backgroundColor: "rgba(25,20,15,0.70)", opacity: 1 },
  bagIconImg: { width: 96, height: 96 },
});
