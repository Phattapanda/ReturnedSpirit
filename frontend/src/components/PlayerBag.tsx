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
  type ImageSourcePropType,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useManagedTimers } from "@/src/hooks/use-managed-timers";
import ItemDurabilityBadge from "@/src/components/item-durability-badge";
import Animated, {
  cancelAnimation,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import {
  ITEM_CATALOG,
  ITEM_ATTRIBUTE,
  PLAYER_BAG_KEY,
  applyLifeRecovery,
  applyStaminaRecovery,
  canConsumeForStamina,
  isEdible,
  isConsumable,
  hasItemAttribute,
  getItemDurability,
  removeBagItem,
  normalizeItemId,
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
import { getEquipmentKind, saveEquippedBag, toggleEquippedItem } from "@/src/game/equipment-system";

const ITEM_IMAGES: Record<string, ImageSourcePropType> = {
  bag_herb:    require("../../assets/images/bag_herb.png"),
  bag_carrot:  require("../../assets/images/bag_carrot.png"),
  bag_onion:   require("../../assets/images/bag_onion.png"),
  bag_potato:  require("../../assets/images/bag_potato.png"),
  carrot:      require("../../assets/images/carrot.png"),
  onion:       require("../../assets/images/onion.png"),
  egg:         require("../../assets/images/egg.png"),
  white_meat:  require("../../assets/images/meat_white.png"),
  red_meat:    require("../../assets/images/meat_red.png"),
  fish:        require("../../assets/images/meat_fish.png"),
  ember_chicken_egg: require("../../assets/images/egg_ember_chicken.png"),
  ember_chicken_meat: require("../../assets/images/meat_ember_chicken.png"),
  elder_ember_comb: require("../../assets/images/elder_ember_comb.png"),
  rooster_comb: require("../../assets/images/elder_ember_comb.png"),
  ember_feather: require("../../assets/images/ember_feather.png"),
  fang: require("../../assets/images/fang.png"),
  fur: require("../../assets/images/fur.png"),
  hide: require("../../assets/images/hide.png"),
  weak_monster_core: require("../../assets/images/monster_core_weak.png"),
  mushroom: require("../../assets/images/mushroom.png"),
  mushroom_rare: require("../../assets/images/mushroom_rare.png"),
  nuts: require("../../assets/images/nuts.png"),
  slime_gel: require("../../assets/images/slime_gel.png"),
  tusk: require("../../assets/images/tusk.png"),
  wild_berries: require("../../assets/images/wild_berries.png"),
  wolf_pelt: require("../../assets/images/wolf_pelt.png"),
  bark: require("../../assets/images/bark.png"),
  charred_wood: require("../../assets/images/charred_wood.png"),
  leather: require("../../assets/images/leather.png"),
  sap: require("../../assets/images/sap.png"),
  quest_hunters_documents: require("../../assets/images/quest_bag.png"),
  malted_barley: require("../../assets/images/quest_item.png"),
  brewers_yeast: require("../../assets/images/quest_item.png"),
  dried_hop_cones: require("../../assets/images/quest_item.png"),
  raw_wildflower_honey: require("../../assets/images/quest_item.png"),
  mead_yeast: require("../../assets/images/quest_item.png"),
  grown_cinnamon_stalks_cloves: require("../../assets/images/quest_item.png"),
  yeast_nutrients: require("../../assets/images/quest_item.png"),
  tomato: require("../../assets/images/tomato.png"),
  pan_fried_eggs: require("../../assets/images/pan_fried_eggs.png"),
  pan_fishermans_fry: require("../../assets/images/pan_fishermans_fry.png"),
  pan_meat_and_carrots: require("../../assets/images/pan_meat_and_carrots.png"),
  pan_meat_skillet: require("../../assets/images/pan_meat_skillet.png"),
  pan_mushroom_skillet: require("../../assets/images/pan_mushroom_skillet.png"),
  pan_fried_potatoes: require("../../assets/images/pan_fried_potatoes.png"),
  pan_ember_chicken_skillet: require("../../assets/images/pan_ember_chicken_skillet.png"),
  pan_farmhouse: require("../../assets/images/farmhouse_pan.png"),
  snowberrysherbet: require("../../assets/images/snowberry_sherbet.png"),
  cooking_pot: require("../../assets/images/cooking_pot.png"),
  frying_pan: require("../../assets/images/frying_pan.png"),
  tool_kitchen_knife: require("../../assets/images/cooking_knife.png"),
  fine_cooking_pot: require("../../assets/images/fine_cooking_pot.png"),
  snowberry: require("../../assets/images/snowberry.png"),
  bucket:      require("../../assets/images/bucket.png"),
  bucketwater: require("../../assets/images/bucketwater.png"),
  empty_bottle: require("../../assets/images/empty_bottle.png"),
  seed_herb:   require("../../assets/images/seed_herb.png"),
  seed_carrot: require("../../assets/images/seed_carrot.png"),
  herbs:       require("../../assets/images/herbs.png"),
  soup_herb:    require("../../assets/images/soup_herb.png"),
  soup_carrot:  require("../../assets/images/soup_carrot.png"),
  soup_potato:  require("../../assets/images/soup_potato.png"),
  soup_onion:   require("../../assets/images/soup_onion.png"),
  soup_carrot_potato: require("../../assets/images/soup_carrot-potato.png"),
  stew_vegetable: require("../../assets/images/stew_vegetable.png"),
  soup_ember_egg: require("../../assets/images/soup_ember_egg.png"),
  stew_beef: require("../../assets/images/stew_beef.png"),
  stew_chicken: require("../../assets/images/stew_chicken.png"),
  stew_ember_chicken: require("../../assets/images/stew_ember_chicken.png"),
  stew_fisherman: require("../../assets/images/stew_fisherman.png"),
  oldpot:      require("../../assets/images/oldpot.png"),
  bag1:        require("../../assets/images/bag1.png"),
  bag2:        require("../../assets/images/bag2.png"),
  bag3:        require("../../assets/images/bag3.png"),
  monster_carcass: require("../../assets/images/monster_carcass.png"),
  wood:        require("../../assets/images/wood.png"),
  stone:       require("../../assets/images/stone.png"),
  cloth:       require("../../assets/images/cloth.png"),
  nails:       require("../../assets/images/nails.png"),
  paint:       require("../../assets/images/paint.png"),
  potato:      require("../../assets/images/potato.png"),
  standard_fertilizer: require("../../assets/images/fertilizer.png"),
  premium_fertilizer: require("../../assets/premiumfertilizer.png"),
  seed_onion: require("../../assets/images/seed_onion.png"),
  seed_potato: require("../../assets/images/seed_potato.png"),
  crate1: require("../../assets/images/crate1.png"),
  energydrink: require("../../assets/images/energy Drink.png"),
  energypill:  require("../../assets/images/energy Pill.png"),
  healthymuffin: require("../../assets/images/healthy muffin.png"),
  goldenapple: require("../../assets/images/golden apple.png"),
  potion_healing_low_grade: require("../../assets/images/potion_healing_low_grade.png"),
  potion_stamina_low_grade: require("../../assets/images/potion_stamina_low_grade.png"),
  antidote: require("../../assets/images/antidote.png"),
  ingot_iron: require("../../assets/images/ingot_iron.png"),
  ingot_steel: require("../../assets/images/ingot_steel.png"),
  ingot_copper: require("../../assets/images/ingot_copper.png"),
  ingot_silver: require("../../assets/images/ingot_silver.png"),
  ingot_gold: require("../../assets/images/ingot_gold.png"),
  ore_iron: require("../../assets/images/ore_iron.png"),
  ore_copper: require("../../assets/images/ore_copper.png"),
  ore_silver: require("../../assets/images/ore_silver.png"),
  ore_gold: require("../../assets/images/ore_gold.png"),
  rope: require("../../assets/images/rope.png"),
  torch: require("../../assets/images/torch_normal.png"),
  return_bell: require("../../assets/images/return_bell.png"),
  shard_mana: require("../../assets/images/shard_mana.png"),
  stone_mana: require("../../assets/images/stone_mana.png"),
  tool_rusty_butchering_knife: require("../../assets/images/tool_rusty_butchering_knife.png"),
  tool_iron_butchering_knife: require("../../assets/images/tool_iron_butchering_knife.png"),
  tool_steel_butchering_knife: require("../../assets/images/tool_steel_butchering_knife.png"),
  armor_leather_bracers: require("../../assets/images/armor_leather_bracers.png"),
  armor_leather_armor: require("../../assets/images/armor_leather_armor.png"),
  weapon_iron_dagger: require("../../assets/images/weapon_iron_dagger.png"),
  weapon_iron_shortsword: require("../../assets/images/weapon_iron_shortsword.png"),
};

export function getItemImageSource(itemId: string): ImageSourcePropType | undefined {
  return ITEM_IMAGES[normalizeItemId(itemId)];
}

export type BagContext = "kitchen" | "dining" | "garden" | "room" | "roomStorage" | "none";

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
  onLifeUpdated?: (life: number) => void;
  externalUseItemIds?: readonly string[];
  onUseItem?: (slotIdx: number, item: BagItem) => void | Promise<void>;
};

export default function PlayerBag({
  bag, visible, context, dayIdx, onClose, onTransferItem, onDiscardItem, onShowThoughtBubble,
  onBagUpdated, onStatsUpdated, onStaminaUpdated, onLifeUpdated, externalUseItemIds, onUseItem,
}: Props) {
  const { setManagedTimeout: setTimeout } = useManagedTimers();
  const { width: W } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { refreshKitchen } = useKitchenRuntime();
  const audioManager = useAudioManager();
  const [infoItem, setInfoItem] = useState<BagItem | null>(null);
  const [infoSlotIndex, setInfoSlotIndex] = useState<number | null>(null);
  const [discardTarget, setDiscardTarget] = useState<{ slotIdx: number; item: BagItem } | null>(null);
  const [actionTarget, setActionTarget] = useState<{ slotIdx: number; item: BagItem } | null>(null);
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
      setActionTarget(null);
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

  function handleSlotLongPress(slotIdx: number, item: BagItem | null) {
    if (!item) return;
    longPressDidFire.current = true;
    setInfoItem(item);
    setInfoSlotIndex(slotIdx);
  }

  async function handleToggleEquipment() {
    if (infoSlotIndex === null || !infoItem || !getEquipmentKind(infoItem)) return;
    const nextBag = await toggleEquipmentAt(infoSlotIndex);
    setCarrotBagOverride(nextBag);
    setInfoItem(nextBag.slots[infoSlotIndex]);
  }

  async function toggleEquipmentAt(slotIndex: number): Promise<PlayerBagData> {
    const nextBag = await saveEquippedBag(toggleEquippedItem(displayBag, slotIndex));
    setCarrotBagOverride(nextBag);
    onBagUpdated?.(nextBag);
    return nextBag;
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

    // Slot locations always get first refusal. Kitchen and Room Storage accept
    // Quest Items as ordinary stored items; their discard protection remains
    // enforced by the dedicated discard paths below.
    if (context === "kitchen" || context === "dining" || context === "roomStorage") {
      if (context === "dining" && hasItemAttribute(item, ITEM_ATTRIBUTE.QUEST_ITEM)) {
        setInfoItem(item);
        setInfoSlotIndex(slotIdx);
        return;
      }
      if (transferLocked.current) return;
      transferLocked.current = true;
      onTransferItem(slotIdx, item);
      setTimeout(() => { transferLocked.current = false; }, 400);
      return;
    }

    setSelectedCarrotBagSlot(null);
    setActionTarget({ slotIdx, item });
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
    const rawLife = await AsyncStorage.getItem("@game:life");
    const currentStamina = Math.max(0, Number.parseInt(rawStamina ?? "40", 10) || 0);
    const currentLife = Math.max(0, Number.parseInt(rawLife ?? String(stats.maximumLife), 10) || 0);
    let nextStats = stats;
    let nextStamina = currentStamina;
    let nextLife = currentLife;

    if (!canConsumeForStamina(item, currentStamina, stats.maximumStamina)) {
      onShowThoughtBubble?.(isEdible(item) ? '"I\'m not hungry."' : '"I don\'t need this right now."');
      return;
    }

    if (item.id === "energydrink" || item.id === "energypill") {
      nextStats = activateStaminaBuff(stats, item.id as StaminaBuffItemId);
    } else if (ITEM_CATALOG[item.id]?.staminaRecovery || ITEM_CATALOG[item.id]?.lifeRecovery) {
      nextStamina = applyStaminaRecovery(item, currentStamina, stats.maximumStamina);
      nextLife = applyLifeRecovery(item, currentLife, stats.maximumLife);
      if (nextStamina === currentStamina && nextLife === currentLife) {
        onShowThoughtBubble?.('"I don\'t need this right now."');
        return;
      }
    } else {
      return;
    }

    const nextBag = removeBagItem(sourceBag, slotIdx, 1);
    await AsyncStorage.multiSet([
      [PLAYER_BAG_KEY, JSON.stringify(nextBag)],
      [PLAYER_STATS_KEY, JSON.stringify(nextStats)],
      ["@game:stamina", String(nextStamina)],
      ["@game:life", String(nextLife)],
    ]);
    setCarrotBagOverride(nextBag);
    setBuffResetTarget(null);
    onBagUpdated?.(nextBag);
    onStatsUpdated?.(nextStats);
    onStaminaUpdated?.(nextStamina);
    onLifeUpdated?.(nextLife);
    audioManager.playSoundEffect("moveitem", { maxDurationMs: 3000 });
  }

  function handleDiscardNo() {
    setDiscardTarget(null);
  }

  async function handleDiscardYes() {
    if (!discardTarget) return;
    if (hasItemAttribute(discardTarget.item, ITEM_ATTRIBUTE.QUEST_ITEM)) {
      setDiscardTarget(null);
      onShowThoughtBubble?.("I should keep this Quest Item.");
      return;
    }
    if (discardLocked) {
      setDiscardTarget(null);
      onShowThoughtBubble?.("\"We still need it.\"");
      return;
    }
    const { slotIdx, item } = discardTarget;
    setDiscardTarget(null);
    if (onDiscardItem) {
      onDiscardItem(slotIdx, item);
      return;
    }
    const nextBag = removeBagItem(displayBag, slotIdx, item.quantity);
    await AsyncStorage.setItem(PLAYER_BAG_KEY, JSON.stringify(nextBag));
    setCarrotBagOverride(nextBag);
    onBagUpdated?.(nextBag);
  }

  const rows = displayBag.rows;
  const cols = displayBag.columns;
  const bagTitle = displayBag.bagId === "bag3" ? "Big Backpack" : displayBag.bagId === "bag2" ? "Backpack" : "Shoulder Bag";
  const SLOT_SIZE = Math.min(72, (W - 80) / cols);

  function handleOverlayPress() {
    if (discardTarget) { setDiscardTarget(null); return; }
    if (actionTarget) { setActionTarget(null); return; }
    if (infoItem) { setInfoItem(null); return; }
    closeBag();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={closeBag}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleOverlayPress}>
        <TouchableOpacity activeOpacity={1} onPress={() => { if (infoItem) setInfoItem(null); }}>
          <View style={[styles.panel, { paddingBottom: insets.bottom + 8 }]}>
            <View style={styles.header}>
              <Text style={styles.title}>{bagTitle}</Text>
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
                        selected={item?.id === "bag_carrot" && selectedCarrotBagSlot === slotIdx}
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
                  : context === "dining"
                  ? "Tap food to place it in a Meal Slot.\nLong press for details."
                  : context === "roomStorage"
                  ? "Tap item to move it to Room Storage.\nLong press for details."
                  : context === "garden"
                  ? "Tap item for actions.\nLong press for details."
                  : "Tap item for actions.\nLong press for details."}
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
                <Text style={styles.infoName}>{infoItem.id === "monster_carcass" ? infoItem.name : (ITEM_CATALOG[infoItem.id]?.name ?? infoItem.name)}</Text>
                {infoItem.containedItem && infoItem.containedQuantity != null && (
                  <Text style={styles.infoContents}>
                    Contains: {infoItem.containedQuantity} {infoItem.containedItem}
                  </Text>
                )}
                <Text style={styles.infoDesc}>{ITEM_CATALOG[infoItem.id]?.description ?? ""}</Text>
                {(() => {
                  const durability = getItemDurability(infoItem);
                  return durability ? <Text style={styles.infoContents}>Durability: {durability.current}/{durability.maximum}</Text> : null;
                })()}
                {getEquipmentKind(infoItem) && (
                  <TouchableOpacity style={styles.equipButton} onPress={() => { void handleToggleEquipment(); }} activeOpacity={0.8}>
                    <Text style={styles.equipButtonText}>{infoItem.equipped ? "Unequip" : "Equip"}</Text>
                  </TouchableOpacity>
                )}
                {(() => {
                  const attrs = ITEM_CATALOG[infoItem.id]?.attributes ?? [];
                  if (attrs.length === 0) return null;
                  return (
                    <View style={styles.attribBox}>
                      <Text style={styles.attribLabel}>Attributes</Text>
                      <View style={styles.attribRow}>
                        {attrs.map((a) => (
                          <View key={a} style={styles.attribTag}>
                            <Text style={styles.attribTagText}>{(a.charAt(0).toUpperCase() + a.slice(1)).replaceAll("_", " ")}</Text>
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

      {actionTarget && (() => {
        const { slotIdx, item } = actionTarget;
        const catalog = ITEM_CATALOG[item.id];
        const equipmentKind = getEquipmentKind(item);
        const externallyUsable = !!onUseItem && externalUseItemIds?.includes(item.id) === true;
        const usable = isConsumable(item) || isEdible(item) || externallyUsable;
        const discardable = !hasItemAttribute(item, ITEM_ATTRIBUTE.QUEST_ITEM);
        const durability = getItemDurability(item);
        const effects = [
          catalog?.staminaRecovery ? `Restores ${catalog.staminaRecovery} Stamina` : null,
          catalog?.lifeRecovery ? `Restores ${catalog.lifeRecovery} Life Points` : null,
          catalog?.grantedStatusEffectId ? `Effect: ${catalog.grantedStatusEffectId.replaceAll("_", " ")}` : null,
        ].filter((effect): effect is string => !!effect);
        const equipmentValues = equipmentKind === "weapon"
          ? [`Damage: ${catalog?.damageMin ?? 0}–${catalog?.damageMax ?? 0}`, `Basic Accuracy: ${catalog?.basicAccuracyPercent ?? 100}%`, ...(durability ? [`Durability: ${durability.current}/${durability.maximum}`] : [])]
          : equipmentKind === "armor"
          ? [`Physical Defense: ${catalog?.physicalDefense ?? 0}`, ...(durability ? [`Durability: ${durability.current}/${durability.maximum}`] : [])]
          : [];
        return <Modal visible transparent animationType="fade" onRequestClose={() => setActionTarget(null)}>
          <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setActionTarget(null)}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <View style={styles.actionPanel}>
                <TouchableOpacity style={styles.actionClose} onPress={() => setActionTarget(null)}><Text style={styles.closeText}>✕</Text></TouchableOpacity>
                {ITEM_IMAGES[item.id] ? <Image source={ITEM_IMAGES[item.id]} style={styles.actionImage} resizeMode="contain" /> : null}
                <Text selectable style={styles.actionName}>{item.id === "monster_carcass" ? item.name : (catalog?.name ?? item.name)}</Text>
                {(effects.length > 0 ? effects : equipmentValues).map((value) => <Text selectable key={value} style={styles.actionValue}>{value}</Text>)}
                {effects.length === 0 && equipmentValues.length === 0 ? <Text selectable style={styles.actionDescription}>{catalog?.description ?? "No usable effect."}</Text> : null}
                <Text style={styles.actionQuestion}>{discardable ? (usable ? "Eat or Discard?" : equipmentKind ? `${item.equipped ? "Unequip" : "Equip"} or Discard?` : "Discard this item?") : "Quest Items cannot be discarded."}</Text>
                <View style={styles.actionButtons}>
                  {usable ? <TouchableOpacity style={[styles.actionChoice, styles.useChoice]} onPress={() => { setActionTarget(null); if (externallyUsable) void onUseItem?.(slotIdx, item); else void handleConsumablePress(slotIdx, item); }}><Text style={styles.useChoiceText}>{externallyUsable ? "Use" : "Eat"}</Text></TouchableOpacity> : null}
                  {equipmentKind ? <TouchableOpacity style={[styles.actionChoice, styles.useChoice]} onPress={() => { setActionTarget(null); void toggleEquipmentAt(slotIdx); }}><Text style={styles.useChoiceText}>{item.equipped ? "Unequip" : "Equip"}</Text></TouchableOpacity> : null}
                  {discardable ? <TouchableOpacity style={[styles.actionChoice, styles.discardChoice]} onPress={() => { setActionTarget(null); setDiscardTarget({ slotIdx, item }); }}><Text style={styles.discardChoiceText}>Discard</Text></TouchableOpacity> : null}
                </View>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>;
      })()}

      {discardTarget && (
        <Modal visible transparent animationType="fade" onRequestClose={handleDiscardNo}>
          <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleDiscardNo}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <View style={styles.discardPanel}>
                <Text style={styles.discardTitle}>
                  {ITEM_CATALOG[discardTarget.item.id]?.name ?? discardTarget.item.name}
                </Text>
                <Text style={styles.discardMsg}>
                  {"Discard this item permanently?"}
                </Text>
                <View style={styles.discardBtns}>
                  <TouchableOpacity style={[styles.discardBtn, styles.discardBtnNo]} onPress={handleDiscardNo} activeOpacity={0.8}>
                    <Text style={styles.discardBtnNoText}>No</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.discardBtn, styles.discardBtnYes]} onPress={() => { void handleDiscardYes(); }} activeOpacity={0.8}>
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
  const imgSrc = item ? ITEM_IMAGES[normalizeItemId(item.id)] : null;
  return (
    <Pressable
      style={[styles.slot, { width: size, height: size }, selected && styles.slotSelected, item?.equipped && styles.slotEquipped]}
      onPressIn={onPressIn}
      onLongPress={onLongPress}
      onPress={onPress}
      delayLongPress={500}
      disabled={!item}
    >
      {item?.equipped && <Text style={styles.equippedBadge}>E</Text>}
      {imgSrc ? (
        <>
          <Image source={imgSrc} style={styles.slotImg} resizeMode="contain" resizeMethod="resize" />
          <ItemDurabilityBadge item={item} />
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
  bagId?: string;
  onPress: () => void;
  style?: object;
  pulsing?: boolean;
};

export function BagIconButton({ unlocked, bagId = "bag1", onPress, style, pulsing }: BagIconProps) {
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    if (pulsing && unlocked) {
      pulseScale.value = withRepeat(withTiming(1.12, { duration: 650 }), -1, true);
    } else {
      cancelAnimation(pulseScale);
      pulseScale.value = withTiming(1.0, { duration: 250 });
    }
    return () => cancelAnimation(pulseScale);
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
          <Image source={ITEM_IMAGES[bagId] ?? ITEM_IMAGES.bag1} style={styles.bagIconImg} resizeMode="cover" resizeMethod="resize" />
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
  slotEquipped: { borderWidth: 2.5, borderColor: "#FFFFFF", backgroundColor: "rgba(126,200,126,0.12)" },
  equippedBadge: { position: "absolute", top: 2, left: 4, zIndex: 2, color: "#FFFFFF", fontSize: 10, fontFamily: "Oldenburg" },
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
  equipButton: { marginTop: 4, minWidth: 126, alignItems: "center", paddingHorizontal: 18, paddingVertical: 9, borderRadius: 9, backgroundColor: "rgba(126,200,126,0.18)", borderWidth: 1.5, borderColor: "#7EC87E" },
  equipButtonText: { color: "#DDF5DD", fontSize: 13, fontFamily: "Oldenburg" },
  actionPanel: { minWidth: 270, maxWidth: 320, alignItems: "center", gap: 7, backgroundColor: "#1A0E05", borderRadius: 17, borderCurve: "continuous", borderWidth: 1.5, borderColor: "rgba(196,148,58,0.58)", paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20 },
  actionClose: { position: "absolute", right: 10, top: 8, padding: 5, zIndex: 2 },
  actionImage: { width: 72, height: 72 },
  actionName: { color: "#C4943A", fontFamily: "Oldenburg", fontSize: 16, lineHeight: 22, textAlign: "center" },
  actionValue: { color: "#F0E8D5", fontFamily: "Oldenburg", fontSize: 12, lineHeight: 18, textAlign: "center", fontVariant: ["tabular-nums"] },
  actionDescription: { color: "rgba(240,232,213,0.76)", fontFamily: "RobotoRegular", fontSize: 12, lineHeight: 18, textAlign: "center" },
  actionQuestion: { color: "#E7C77A", fontFamily: "Oldenburg", fontSize: 13, textAlign: "center", paddingTop: 5 },
  actionButtons: { width: "100%", flexDirection: "row", gap: 10, paddingTop: 3 },
  actionChoice: { flex: 1, minHeight: 43, alignItems: "center", justifyContent: "center", borderRadius: 9, borderWidth: 1 },
  useChoice: { backgroundColor: "rgba(76,132,72,0.25)", borderColor: "#7EC87E" },
  useChoiceText: { color: "#DDF5DD", fontFamily: "Oldenburg", fontSize: 13 },
  discardChoice: { backgroundColor: "rgba(180,50,50,0.2)", borderColor: "rgba(210,85,75,0.7)" },
  discardChoiceText: { color: "#F29A92", fontFamily: "Oldenburg", fontSize: 13 },
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
