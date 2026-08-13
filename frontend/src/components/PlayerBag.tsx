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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import type { PlayerBagData, BagItem } from "@/src/game/item-system";
import { ITEM_CATALOG } from "@/src/game/item-system";

// ─── Asset map ────────────────────────────────────────────────────────────────

const ITEM_IMAGES: Record<string, ReturnType<typeof require>> = {
  herbbag:     require("../../assets/images/herbbag.png"),
  bucket:      require("../../assets/images/bucket.png"),
  bucketwater: require("../../assets/images/bucketwater.png"),
  herbseed:    require("../../assets/images/herbseed.png"),
  herbs:       require("../../assets/images/herbs.png"),
  bag1:        require("../../assets/images/bag1.png"),
  wood:        require("../../assets/images/wood.png"),
  stone:       require("../../assets/images/stone.png"),
  cloth:       require("../../assets/images/cloth.png"),
  nails:       require("../../assets/images/nails.png"),
  paint:       require("../../assets/images/paint.png"),
};

export type BagContext = "kitchen" | "garden" | "room" | "none";

type Props = {
  bag: PlayerBagData;
  visible: boolean;
  context: BagContext;
  /** 0=MO, 1=TU, 2=WE, 3=TH, 4=FR … used for discard tutorial protection */
  dayIdx?: number;
  onClose: () => void;
  /** Short tap (context-aware): kitchen=unpack, room=store, garden handled internally */
  onTransferItem: (slotIdx: number, item: BagItem) => void;
  /** Called after user confirms discard (garden/other contexts, only outside protection period) */
  onDiscardItem?: (slotIdx: number, item: BagItem) => void;
  /** Called when player tries to discard during tutorial protection → show thought bubble */
  onShowThoughtBubble?: (text: string) => void;
};

// ─── PlayerBag ────────────────────────────────────────────────────────────────

export default function PlayerBag({
  bag, visible, context, dayIdx, onClose, onTransferItem, onDiscardItem, onShowThoughtBubble,
}: Props) {
  const { width: W } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // ── Detail info modal (persistent long-press)
  const [infoItem, setInfoItem] = useState<BagItem | null>(null);

  // ── Discard dialog state (garden / no-drop contexts)
  const [discardTarget, setDiscardTarget] = useState<{ slotIdx: number; item: BagItem } | null>(null);

  // ── Gesture tracking
  // longPressDidFire: true when Pressable's onLongPress fired for the CURRENT touch
  // This prevents onPress (fired on release) from also triggering the short-tap action.
  const longPressDidFire = useRef(false);
  const transferLocked   = useRef(false);

  // Discard is locked until after TH (dayIdx > 3). MO=0, TU=1, WE=2, TH=3.
  const DISCARD_LOCK_UNTIL = 3; // inclusive — lock on MO–TH
  const discardLocked = dayIdx !== undefined && dayIdx <= DISCARD_LOCK_UNTIL;

  // ── onPressIn: reset ALL gesture state for the new touch
  function handleSlotPressIn() {
    longPressDidFire.current = false;
  }

  // ── onLongPress (fires after 500ms via Pressable's built-in delay)
  function handleSlotLongPress(_slotIdx: number, item: BagItem | null) {
    if (!item) return;
    longPressDidFire.current = true; // suppress the upcoming onPress
    setInfoItem(item);
  }

  // ── onPress: short tap action (fired on release, for BOTH short taps and after long press)
  function handleSlotPress(slotIdx: number, item: BagItem | null) {
    if (!item) return;

    // ── Rule 1: Long-press just fired → suppress this press (it's the finger-release of the long press)
    if (longPressDidFire.current) {
      longPressDidFire.current = false;
      return;
    }

    // ── Rule 2: Detail modal open → close it, no other action
    if (infoItem) {
      setInfoItem(null);
      return;
    }

    // ── Context-dependent short-tap action ────────────────────────────────────
    if (context === "garden" || context === "none") {
      // Always open discard dialog – no flags that can block repeat taps
      setDiscardTarget({ slotIdx, item });
      return;
    }

    // kitchen / room: regular transfer with debounce
    if (transferLocked.current) return;
    transferLocked.current = true;
    onTransferItem(slotIdx, item);
    setTimeout(() => { transferLocked.current = false; }, 400);
  }

  // ── Discard dialog handlers ────────────────────────────────────────────────
  function handleDiscardNo() {
    setDiscardTarget(null);
  }

  function handleDiscardYes() {
    if (!discardTarget) return;
    if (discardLocked) {
      // Tutorial protection: don't delete — show thought bubble instead
      setDiscardTarget(null);
      onShowThoughtBubble?.("\"We still need it.\"");
      return;
    }
    // Outside protection period: actually discard
    const { slotIdx, item } = discardTarget;
    setDiscardTarget(null);
    onDiscardItem?.(slotIdx, item);
  }

  const rows    = bag.rows;
  const cols    = bag.columns;
  const SLOT_SIZE = Math.min(72, (W - 80) / cols);

  // ── Overlay tap: close detail if open, else close bag
  function handleOverlayPress() {
    if (discardTarget) { setDiscardTarget(null); return; }
    if (infoItem) { setInfoItem(null); return; }
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={handleOverlayPress}
      >
        {/* Main bag panel — stop tap propagation so panel taps don't close bag */}
        <TouchableOpacity activeOpacity={1} onPress={() => { if (infoItem) setInfoItem(null); }}>
          <View style={[styles.panel, { paddingBottom: insets.bottom + 8 }]}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Shoulder Bag</Text>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Grid */}
            <View style={styles.grid}>
              {Array.from({ length: rows }, (_, r) => (
                <View key={r} style={styles.gridRow}>
                  {Array.from({ length: cols }, (_, c) => {
                    const slotIdx = r * cols + c;
                    const item    = slotIdx < bag.slots.length ? bag.slots[slotIdx] : null;
                    return (
                      <BagSlot
                        key={slotIdx}
                        slotIdx={slotIdx}
                        item={item}
                        size={SLOT_SIZE}
                        onPressIn={() => handleSlotPressIn()}
                        onLongPress={() => handleSlotLongPress(slotIdx, item)}
                        onPress={() => handleSlotPress(slotIdx, item)}
                      />
                    );
                  })}
                </View>
              ))}
            </View>

            {/* Context hint */}
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

      {/* ── Detail info modal (persistent — closes only on new tap) */}
      {infoItem && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setInfoItem(null)}>
          <TouchableOpacity
            style={styles.overlay}
            activeOpacity={1}
            onPress={() => setInfoItem(null)}
          >
            <TouchableOpacity activeOpacity={1} onPress={() => setInfoItem(null)}>
              <View style={styles.infoPanel}>
                {ITEM_IMAGES[infoItem.id] && (
                  <Image source={ITEM_IMAGES[infoItem.id]} style={styles.infoImg} resizeMode="contain" resizeMethod="resize" />
                )}
                <Text style={styles.infoName}>
                  {ITEM_CATALOG[infoItem.id]?.name ?? infoItem.name}
                </Text>
                {/* Container contents */}
                {infoItem.containedItem && infoItem.containedQuantity != null && (
                  <Text style={styles.infoContents}>
                    Contains: {infoItem.containedQuantity} {infoItem.containedItem}
                  </Text>
                )}
                {/* Description */}
                <Text style={styles.infoDesc}>
                  {ITEM_CATALOG[infoItem.id]?.description ?? ""}
                </Text>
                {/* Attributes */}
                {(() => {
                  const attrs = ITEM_CATALOG[infoItem.id]?.attributes ?? [];
                  if (attrs.length === 0) return null;
                  return (
                    <View style={styles.attribBox}>
                      <Text style={styles.attribLabel}>Attributes</Text>
                      <View style={styles.attribRow}>
                        {attrs.map((a) => (
                          <View key={a} style={styles.attribTag}>
                            <Text style={styles.attribTagText}>
                              {a.charAt(0).toUpperCase() + a.slice(1)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  );
                })()}
                <TouchableOpacity
                  onPress={() => setInfoItem(null)}
                  style={styles.infoDismiss}
                >
                  <Text style={styles.infoDismissText}>Close</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* ── Discard confirmation dialog (garden / no-drop contexts) */}
      {discardTarget && (
        <Modal visible transparent animationType="fade" onRequestClose={handleDiscardNo}>
          <TouchableOpacity
            style={styles.overlay}
            activeOpacity={1}
            onPress={handleDiscardNo}
          >
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <View style={styles.discardPanel}>
                <Text style={styles.discardTitle}>
                  {ITEM_CATALOG[discardTarget.item.id]?.name ?? discardTarget.item.name}
                </Text>
                <Text style={styles.discardMsg}>
                  {"You can't unpack anything here.\nDo you want to throw it away?"}
                </Text>
                <View style={styles.discardBtns}>
                  <TouchableOpacity
                    style={[styles.discardBtn, styles.discardBtnNo]}
                    onPress={handleDiscardNo}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.discardBtnNoText}>No</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.discardBtn, styles.discardBtnYes]}
                    onPress={handleDiscardYes}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.discardBtnYesText}>Yes</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
    </Modal>
  );
}

// ─── BagSlot ──────────────────────────────────────────────────────────────────

type SlotProps = {
  slotIdx: number;
  item: BagItem | null;
  size: number;
  onPressIn: () => void;
  onLongPress: () => void;
  onPress: () => void;
};

function BagSlot({ item, size, onPressIn, onLongPress, onPress }: SlotProps) {
  const imgSrc = item ? ITEM_IMAGES[item.id] : null;
  return (
    <Pressable
      style={[styles.slot, { width: size, height: size }]}
      onPressIn={onPressIn}
      onLongPress={onLongPress}
      onPress={onPress}
      delayLongPress={500}
      disabled={!item}
    >
      {imgSrc ? (
        <>
          <Image source={imgSrc} style={styles.slotImg} resizeMode="contain" resizeMethod="resize" />
          {/* Contents circle (top-right) */}
          {item?.containedQuantity != null && item.containedQuantity > 0 && (
            <View style={styles.contentsCircle}>
              <Text style={styles.contentsText}>{item.containedQuantity}</Text>
            </View>
          )}
          {/* Stack count (bottom-right) */}
          {item && item.quantity > 1 && (
            <Text style={styles.stackText}>{item.quantity}</Text>
          )}
        </>
      ) : (
        <View style={styles.slotEmpty} />
      )}
    </Pressable>
  );
}

// ─── Bag icon button (rendered inline in HUD) ─────────────────────────────────

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
      pulseScale.value = withRepeat(
        withTiming(1.12, { duration: 650 }),
        -1,
        true,
      );
    } else {
      pulseScale.value = withTiming(1.0, { duration: 250 });
    }
    // pulseScale is a stable sharedValue ref
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.62)",
    justifyContent: "center",
    alignItems: "center",
  },
  panel: {
    backgroundColor: "#1A0E05",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.55)",
    paddingHorizontal: 16,
    paddingTop: 14,
    minWidth: 260,
    maxWidth: 340,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.7,
    shadowRadius: 18,
    elevation: 22,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: { color: "#C4943A", fontSize: 17, fontFamily: "Oldenburg" },
  closeBtn: { padding: 4 },
  closeText: { color: "#C4943A", fontSize: 18 },

  grid: { gap: 8 },
  gridRow: { flexDirection: "row", gap: 8 },

  slot: {
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.4)",
    backgroundColor: "rgba(30,15,3,0.92)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    position: "relative",
  },
  slotImg: { width: "78%", height: "78%" },
  slotEmpty: { width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0)" },

  contentsCircle: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#1A3A1A",
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#4E9E2A",
    paddingHorizontal: 2,
  },
  contentsText: { color: "#7ED84F", fontSize: 10, fontFamily: "Oldenburg" },

  stackText: {
    position: "absolute",
    bottom: 2,
    right: 4,
    color: "#fff",
    fontSize: 11,
    fontFamily: "Oldenburg",
    textShadowColor: "#000",
    textShadowOffset: { width: 0.5, height: 0.5 },
    textShadowRadius: 2,
  },

  hint: {
    color: "rgba(196,148,58,0.55)",
    fontSize: 11,
    fontFamily: "Oldenburg",
    textAlign: "center",
    marginTop: 10,
    marginBottom: 4,
  },

  // ── Detail info panel
  infoPanel: {
    backgroundColor: "#1A0E05",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.55)",
    padding: 18,
    maxWidth: 300,
    alignItems: "center",
    gap: 8,
  },
  infoImg: { width: 60, height: 60 },
  infoName: { color: "#C4943A", fontSize: 15, fontFamily: "Oldenburg", textAlign: "center" },
  infoContents: { color: "#F0E8D5", fontSize: 12, fontFamily: "Oldenburg", textAlign: "center" },
  infoDesc: {
    color: "rgba(240,232,213,0.75)",
    fontSize: 12,
    fontFamily: "Oldenburg",
    textAlign: "center",
    marginBottom: 2,
  },
  attribBox: { alignItems: "center", gap: 4, marginTop: 2 },
  attribLabel: {
    color: "rgba(196,148,58,0.65)",
    fontSize: 10,
    fontFamily: "Oldenburg",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  attribRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" },
  attribTag: {
    backgroundColor: "rgba(196,148,58,0.12)",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(196,148,58,0.35)",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  attribTagText: { color: "#C4943A", fontSize: 11, fontFamily: "Oldenburg" },
  infoDismiss: {
    marginTop: 6,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(196,148,58,0.18)",
    borderWidth: 1,
    borderColor: "rgba(196,148,58,0.4)",
  },
  infoDismissText: { color: "#C4943A", fontSize: 13, fontFamily: "Oldenburg" },

  // ── Discard dialog
  discardPanel: {
    backgroundColor: "#1A0E05",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.55)",
    padding: 22,
    maxWidth: 300,
    alignItems: "center",
    gap: 10,
  },
  discardTitle: {
    color: "#C4943A",
    fontSize: 15,
    fontFamily: "Oldenburg",
    textAlign: "center",
    marginBottom: 2,
  },
  discardMsg: {
    color: "rgba(240,232,213,0.8)",
    fontSize: 12,
    fontFamily: "Oldenburg",
    textAlign: "center",
    lineHeight: 20,
  },
  discardBtns: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  discardBtn: {
    paddingHorizontal: 24,
    paddingVertical: 9,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
  },
  discardBtnNo: {
    backgroundColor: "rgba(196,148,58,0.12)",
    borderWidth: 1,
    borderColor: "rgba(196,148,58,0.35)",
  },
  discardBtnYes: {
    backgroundColor: "rgba(180,50,50,0.22)",
    borderWidth: 1,
    borderColor: "rgba(180,50,50,0.5)",
  },
  discardBtnNoText:  { color: "#C4943A",    fontSize: 13, fontFamily: "Oldenburg" },
  discardBtnYesText: { color: "#E07070",    fontSize: 13, fontFamily: "Oldenburg" },

  // ── Bag icon
  bagIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(30,18,5,0.88)",
    borderWidth: 2.5,
    borderColor: "rgba(196,148,58,0.70)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  bagIconLocked: {
    borderColor: "rgba(58,58,58,0.8)",
    backgroundColor: "rgba(25,20,15,0.70)",
    opacity: 1,
  },
  bagIconImg: { width: 96, height: 96 },
});
