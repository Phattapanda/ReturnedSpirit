import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  type ImageSourcePropType,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  interpolateColor,
} from "react-native-reanimated";

import {
  type BagItem,
} from "@/src/game/item-system";
import { commitHarvestBag } from "@/src/game/garden-harvest";
import { addKarmaPoints } from "@/src/game/progression";
import { recordTitheHarvest } from "@/src/game/tithe-system";
import {
  createGardenPlotFromSeed,
  createEmptyGardenPlot,
  createHarvestBagForCrop,
  gardenPlotStorageKey,
  getCropYieldLabel,
  normalizeGardenSeedId,
  type GardenPlotNumber,
} from "@/src/game/garden-crop-system";
import {
  guestTutorialRupertHasLeftGarden,
  loadGuestTutorialIntroStep,
} from "@/src/game/guest-tutorial";
import { useGardenRuntime } from "@/src/game/garden-runtime-context";
import {
  getGardenFertilizerConfig,
  normalizeGardenFertilizerId,
} from "@/src/game/garden-fertilizer-system";
import SeedSelectionModal, {
  type SeedSelectionOption,
} from "@/src/components/seed-selection-modal";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GardenPlotStatus = "empty" | "growing" | "ready" | "withered";

export type GardenPlotData = {
  id: string;
  plotType: "small" | "medium" | "large";
  upgradeLevel: number;
  /** Rupert's fertilizer upgrade tier: 0 = 5, 1 = 7, 2 = 10 minimum yield. */
  yieldUpgradeLevel?: number;
  status: GardenPlotStatus;
  cropType: string | null;
  cropAsset: string | null;
  seedItemId: string | null;
  totalGrowthDays: number;
  completedGrowthDays: number;
  remainingGrowthDays: number;
  progressPercent: number;
  wateredToday: boolean;
  weedsPulledToday: boolean;
  fertilizedToday: boolean;
  fertilizerTypeUsedToday: string | null;
  consecutiveUnwateredDays: number;
  baseYield: number;
  accumulatedWeedYieldBonus: number;
  accumulatedFertilizerYieldBonus: number;
  readyToHarvest: boolean;
  withered: boolean;
};

export type GardenPlotProps = {
  data: GardenPlotData;
  interactive: boolean;
  onWater: () => void;
  onPullWeeds: () => void;
  onFertilize: () => void;
  onHarvest: () => void;
  onCropTap: () => void;
  onSpendStamina: (baseCost: number) => Promise<boolean>;
  onHarvestStored?: (item: BagItem) => void;
  onActionSuccess?: () => void;
  onLockedAction?: () => void;
  attentionPulse?: boolean;
  actionCosts?: { water: number; pullWeeds: number; fertilize: number };
  selectedFertilizerId?: string;
  fertilizerAvailable?: boolean;
};

type GardenInventoryItem = {
  id: string;
  itemType: string;
  name: string;
  quantity: number;
  containedItem?: string;
  containedQuantity?: number;
};

const GARDEN_INVENTORY_KEY = "@garden:inventory";
const SELECTED_FERTILIZER_KEY = "@garden:selected_fertilizer";

// ─── Asset map ────────────────────────────────────────────────────────────────

const CROP_ASSETS: Record<string, ImageSourcePropType> = {
  bed_herb:       require("../../assets/images/bed_herb.png"),
  bed_herb_young: require("../../assets/images/bed_herb_young.png"),
  seed_herb:     require("../../assets/images/seed_herb.png"),
  herbs:         require("../../assets/images/herbs.png"),
  seed_carrot:   require("../../assets/images/seed_carrot.png"),
  bed_carrot_young: require("../../assets/images/bed_carrot_young.png"),
  bed_carrot:       require("../../assets/images/bed_carrot.png"),
  seed_onion:       require("../../assets/images/seed_onion.png"),
  bed_onion_young:  require("../../assets/images/bed_onion_young.png"),
  bed_onion:        require("../../assets/images/bed_onion.png"),
  seed_potato:      require("../../assets/images/seed_potato.png"),
  bed_potato_young: require("../../assets/images/bed_potato_young.png"),
  bed_potato:       require("../../assets/images/bed_potato.png"),
  seed_lettuce: require("../../assets/images/seed_salad.png"),
  bed_lettuce_young: require("../../assets/images/bed_lettuce_young.png"),
  bed_lettuce: require("../../assets/images/bed_lettuce.png"),
  seed_cucumber: require("../../assets/images/seed_cucumber.png"),
  bed_cucumber_young: require("../../assets/images/bed_cucumber_young.png"),
  bed_cucumber: require("../../assets/images/bed_cucumber.png"),
  seed_spinach: require("../../assets/images/seed_spinach.png"),
  bed_spinach_young: require("../../assets/images/bed_spinach_young.png"),
  bed_spinach: require("../../assets/images/bed_spinach.png"),
  seed_tomato: require("../../assets/images/seed_tomato.png"),
  bed_tomato_young: require("../../assets/images/bed_tomato_young.png"),
  bed_tomato: require("../../assets/images/bed_tomato.png"),
  seed_pumpkin: require("../../assets/images/seed_pumpkin.png"),
  bed_pumpkin_young: require("../../assets/images/bed_pumpkin_young.png"),
  bed_pumpkin: require("../../assets/images/bed_pumpkin.png"),
};

const ACTION_IMG = {
  watering:   require("../../assets/images/watering.png"),
  pullweeds:  require("../../assets/images/pullweeds.png"),
  standard_fertilizer: require("../../assets/images/fertilizer.png"),
  premium_fertilizer: require("../../assets/premiumfertilizer.png"),
  harvest:    require("../../assets/images/harvest.png"),
};

// ─── Crop stage configuration ─────────────────────────────────────────────────

type CropStageConfig = {
  seedStageAsset: string;
  growingStageAsset: string;
  readyStageAsset: string;
};

const CROP_STAGE_CONFIGS: Record<string, CropStageConfig> = {
  herb: {
    seedStageAsset: "seed_herb",
    growingStageAsset: "bed_herb_young",
    readyStageAsset: "bed_herb",
  },
  carrot: {
    seedStageAsset: "seed_carrot",
    growingStageAsset: "bed_carrot_young",
    readyStageAsset: "bed_carrot",
  },
  potato: {
    seedStageAsset: "seed_potato",
    growingStageAsset: "bed_potato_young",
    readyStageAsset: "bed_potato",
  },
  onion: {
    seedStageAsset: "seed_onion",
    growingStageAsset: "bed_onion_young",
    readyStageAsset: "bed_onion",
  },
  lettuce: { seedStageAsset: "seed_lettuce", growingStageAsset: "bed_lettuce_young", readyStageAsset: "bed_lettuce" },
  cucumber: { seedStageAsset: "seed_cucumber", growingStageAsset: "bed_cucumber_young", readyStageAsset: "bed_cucumber" },
  spinach: { seedStageAsset: "seed_spinach", growingStageAsset: "bed_spinach_young", readyStageAsset: "bed_spinach" },
  tomato: { seedStageAsset: "seed_tomato", growingStageAsset: "bed_tomato_young", readyStageAsset: "bed_tomato" },
  pumpkin: { seedStageAsset: "seed_pumpkin", growingStageAsset: "bed_pumpkin_young", readyStageAsset: "bed_pumpkin" },
};

/**
 * Visual calendar: seed on the planting day, young crop while growing, and the
 * mature bed as soon as its crop-specific growth duration is complete.
 */
export function getCropStageAsset(
  cropType: string | null,
  progressPercent: number,
  status: GardenPlotStatus,
): ImageSourcePropType | null {
  if (!cropType || status === "empty") return null;
  const cfg = CROP_STAGE_CONFIGS[cropType];
  if (!cfg) return null;
  if (status === "withered") return CROP_ASSETS[cfg.growingStageAsset];
  if (status === "ready" || progressPercent >= 100) return CROP_ASSETS[cfg.readyStageAsset];
  if (progressPercent === 0) return CROP_ASSETS[cfg.seedStageAsset];
  return CROP_ASSETS[cfg.growingStageAsset];
}

// ─── GardenPlot component ─────────────────────────────────────────────────────

export default function GardenPlot(props: GardenPlotProps) {
  const {
    data,
    interactive,
    onWater,
    onPullWeeds,
    onFertilize,
    onHarvest,
    onCropTap,
    onSpendStamina,
    onHarvestStored,
    onActionSuccess,
    onLockedAction,
    attentionPulse = false,
    actionCosts = { water: 2, pullWeeds: 5, fertilize: 3 },
    selectedFertilizerId = "standard_fertilizer",
    fertilizerAvailable = true,
  } = props;

  const { refreshGarden, showPlayerThought } = useGardenRuntime();
  const parsedPlotNumber = Number.parseInt(data.id.slice(-2), 10);
  const auxiliaryPlotNumber = Math.max(2, Math.min(4, parsedPlotNumber || 2)) as GardenPlotNumber;
  const isAuxiliaryPlot = data.id !== "garden_plot_01";
  const emptyAuxiliaryPlot = useMemo(() => ({
    ...createEmptyGardenPlot(auxiliaryPlotNumber),
    yieldUpgradeLevel: data.yieldUpgradeLevel ?? 0,
  }), [auxiliaryPlotNumber, data.yieldUpgradeLevel]);
  const [secondData, setSecondData] = useState<GardenPlotData>(emptyAuxiliaryPlot);
  const [protectSeeds, setProtectSeeds] = useState(false);
  const [plantConfirmVisible, setPlantConfirmVisible] = useState(false);
  const [availableSeeds, setAvailableSeeds] = useState<SeedSelectionOption[]>([]);
  const [selectedSeedId, setSelectedSeedId] = useState<string | null>(null);
  const [secondBusy, setSecondBusy] = useState(false);
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const [tearOutConfirmVisible, setTearOutConfirmVisible] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const step = await loadGuestTutorialIntroStep();
      if (active) setProtectSeeds(guestTutorialRupertHasLeftGarden(step));
      if (isAuxiliaryPlot) {
        const raw = await AsyncStorage.getItem(gardenPlotStorageKey(auxiliaryPlotNumber));
        if (active) setSecondData(raw ? { ...emptyAuxiliaryPlot, ...JSON.parse(raw) } : emptyAuxiliaryPlot);
      }
    })().catch(() => {});
    return () => { active = false; };
  }, [auxiliaryPlotNumber, emptyAuxiliaryPlot, isAuxiliaryPlot]);

  const effectiveData = isAuxiliaryPlot ? secondData : data;
  const effectiveInteractive = isAuxiliaryPlot ? true : interactive;

  const progColor = useSharedValue(effectiveData.wateredToday ? 1 : 0);
  useEffect(() => {
    progColor.value = withTiming(effectiveData.wateredToday ? 1 : 0, { duration: 450 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveData.wateredToday]);

  const progBarStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progColor.value, [0, 1], ["#CC2200", "#4E9E2A"]),
  }));

  const attentionScale = useSharedValue(1);
  useEffect(() => {
    if (attentionPulse && !actionMenuVisible) {
      attentionScale.value = withRepeat(withTiming(1.07, { duration: 650 }), -1, true);
    } else {
      attentionScale.value = withTiming(1, { duration: 180 });
    }
  }, [actionMenuVisible, attentionPulse, attentionScale]);
  const attentionStyle = useAnimatedStyle(() => ({
    transform: [{ scale: attentionScale.value }],
  }));

  async function persistSecond(next: GardenPlotData) {
    setSecondData(next);
    await AsyncStorage.setItem(gardenPlotStorageKey(auxiliaryPlotNumber), JSON.stringify(next));
  }

  async function handleSecondPlant() {
    if (secondBusy || !selectedSeedId) return;
    setSecondBusy(true);
    try {
      const rawInventory = await AsyncStorage.getItem(GARDEN_INVENTORY_KEY);
      const inventory: GardenInventoryItem[] = (rawInventory ? JSON.parse(rawInventory) as GardenInventoryItem[] : [])
        .map((item) => item.itemType === "seed" ? { ...item, id: normalizeGardenSeedId(item.id) ?? item.id } : item);
      const seedIndex = inventory.findIndex(
        (item) => item.id === selectedSeedId && item.itemType === "seed" && item.quantity > 0,
      );
      if (seedIndex < 0) {
        showPlayerThought('"That seed is no longer available."');
        return;
      }
      const nextPlot = createGardenPlotFromSeed(secondData, selectedSeedId);
      if (!nextPlot) {
        showPlayerThought('"I can\'t plant this seed yet."');
        return;
      }
      const nextInventory = inventory.map((item) => ({ ...item }));
      nextInventory[seedIndex] = {
        ...nextInventory[seedIndex],
        quantity: nextInventory[seedIndex].quantity - 1,
      };
      await AsyncStorage.multiSet([
        [GARDEN_INVENTORY_KEY, JSON.stringify(nextInventory)],
        [gardenPlotStorageKey(auxiliaryPlotNumber), JSON.stringify(nextPlot)],
      ]);
      setSecondData(nextPlot);
      setPlantConfirmVisible(false);
      setSelectedSeedId(null);
      onActionSuccess?.();
      refreshGarden();
    } catch {
      showPlayerThought('"I can\'t plant this right now."');
    } finally {
      setSecondBusy(false);
    }
  }

  async function handleSecondWater() {
    if (secondBusy) return;
    if (secondData.status === "empty") return;
    if (secondData.readyToHarvest) { showPlayerThought('"That won\'t achieve anything."'); return; }
    if (secondData.wateredToday) { showPlayerThought('"Already watered today."'); return; }
    setSecondBusy(true);
    try {
      if (!(await onSpendStamina(actionCosts.water))) { showPlayerThought('"Not enough stamina."'); return; }
      await persistSecond({ ...secondData, wateredToday: true });
      onActionSuccess?.();
      refreshGarden();
    } finally {
      setSecondBusy(false);
    }
  }

  async function handleSecondWeeds() {
    if (secondBusy) return;
    if (secondData.status === "empty") return;
    if (secondData.readyToHarvest) { showPlayerThought('"That won\'t achieve anything."'); return; }
    if (secondData.withered) {
      setSecondBusy(true);
      try {
        if (!(await onSpendStamina(actionCosts.pullWeeds))) { showPlayerThought('"Not enough stamina."'); return; }
        await persistSecond({ ...emptyAuxiliaryPlot, yieldUpgradeLevel: secondData.yieldUpgradeLevel ?? 0 });
        onActionSuccess?.();
        refreshGarden();
      } finally {
        setSecondBusy(false);
      }
      return;
    }
    if (secondData.weedsPulledToday) { showPlayerThought('"I already did this today."'); return; }
    setSecondBusy(true);
    try {
      if (!(await onSpendStamina(actionCosts.pullWeeds))) { showPlayerThought('"Not enough stamina."'); return; }
      await persistSecond({
        ...secondData,
        weedsPulledToday: true,
        accumulatedWeedYieldBonus: secondData.accumulatedWeedYieldBonus + 1,
      });
      onActionSuccess?.();
      refreshGarden();
    } finally {
      setSecondBusy(false);
    }
  }

  async function handleSecondFertilize() {
    if (secondBusy) return;
    if (secondData.status === "empty") return;
    if (secondData.readyToHarvest) { showPlayerThought('"That won\'t achieve anything."'); return; }
    if (secondData.withered) { showPlayerThought('"Can\'t fertilize a withered plant."'); return; }
    if (secondData.fertilizedToday) { showPlayerThought('"Already fertilized today."'); return; }

    setSecondBusy(true);
    try {
      const storedSelection = (await AsyncStorage.getItem(SELECTED_FERTILIZER_KEY)) ?? selectedFertilizerId;
      const selected = normalizeGardenFertilizerId(storedSelection) ?? "standard_fertilizer";
      const fertilizerConfig = getGardenFertilizerConfig(selected);
      if (!fertilizerConfig) { showPlayerThought('"No fertilizer available."'); return; }
      const rawInventory = await AsyncStorage.getItem(GARDEN_INVENTORY_KEY);
      const inventory: GardenInventoryItem[] = rawInventory ? JSON.parse(rawInventory) : [];
      const fertIndex = inventory.findIndex((item) => item.id === selected && item.itemType === "fertilizer" && item.quantity > 0);
      if (fertIndex < 0) { showPlayerThought('"No fertilizer available."'); return; }
      if (!(await onSpendStamina(actionCosts.fertilize))) { showPlayerThought('"Not enough stamina."'); return; }

      const nextInventory = inventory.map((item) => ({ ...item }));
      nextInventory[fertIndex] = {
        ...nextInventory[fertIndex],
        quantity: nextInventory[fertIndex].quantity - 1,
      };
      const nextPlot = {
        ...secondData,
        fertilizedToday: true,
        fertilizerTypeUsedToday: selected,
        accumulatedFertilizerYieldBonus:
          secondData.accumulatedFertilizerYieldBonus + fertilizerConfig.yieldBonus,
      };
      await AsyncStorage.multiSet([
        [GARDEN_INVENTORY_KEY, JSON.stringify(nextInventory)],
        [gardenPlotStorageKey(auxiliaryPlotNumber), JSON.stringify(nextPlot)],
      ]);
      setSecondData(nextPlot);
      onActionSuccess?.();
      refreshGarden();
    } finally {
      setSecondBusy(false);
    }
  }

  async function handleSecondHarvest() {
    if (secondBusy) return;
    if (!secondData.readyToHarvest) { showPlayerThought('"Not ready yet."'); return; }
    setSecondBusy(true);
    try {
      const finalYield = secondData.baseYield + secondData.accumulatedWeedYieldBonus + secondData.accumulatedFertilizerYieldBonus;
      const harvestBag: BagItem | null = createHarvestBagForCrop(secondData.seedItemId, finalYield);
      if (!harvestBag) {
        showPlayerThought('"I can\'t harvest this crop yet."');
        return;
      }
      const result = await commitHarvestBag(harvestBag, [
        [gardenPlotStorageKey(auxiliaryPlotNumber), JSON.stringify({ ...emptyAuxiliaryPlot, yieldUpgradeLevel: secondData.yieldUpgradeLevel ?? 0 })],
      ]);
      if (!result.ok) {
        showPlayerThought(result.reason === "bag_locked"
          ? '"I need my bag first."'
          : '"My bag is full."');
        return;
      }

      await addKarmaPoints(1);
      await recordTitheHarvest();

      setSecondData({ ...emptyAuxiliaryPlot, yieldUpgradeLevel: secondData.yieldUpgradeLevel ?? 0 });
      onActionSuccess?.();
      onHarvestStored?.(harvestBag);
      refreshGarden();
    } finally {
      setSecondBusy(false);
    }
  }

  async function handleSecondTearOut() {
    if (secondBusy || secondData.status === "empty") return;
    if (protectSeeds) {
      showPlayerThought('"I shouldn\'t waste any seeds."');
      return;
    }
    setSecondBusy(true);
    try {
      await persistSecond({
        ...emptyAuxiliaryPlot,
        yieldUpgradeLevel: secondData.yieldUpgradeLevel ?? 0,
      });
      onActionSuccess?.();
      refreshGarden();
    } finally {
      setSecondBusy(false);
      setTearOutConfirmVisible(false);
    }
  }

  async function handleCropPress() {
    const isEmpty = effectiveData.status === "empty";
    if (isAuxiliaryPlot) {
      if (isEmpty) {
        const rawInventory = await AsyncStorage.getItem(GARDEN_INVENTORY_KEY);
        const inventory: GardenInventoryItem[] = rawInventory ? JSON.parse(rawInventory) : [];
        const seeds = inventory
          .filter((item) => item.itemType === "seed" && item.quantity > 0)
          .map((item) => ({ id: item.id, name: item.name, quantity: item.quantity }));
        if (seeds.length === 0) {
          showPlayerThought('"I have no seeds."');
          return;
        }
        setAvailableSeeds(seeds);
        setSelectedSeedId(null);
        setPlantConfirmVisible(true);
      } else {
        setActionMenuVisible(true);
      }
      return;
    }
    if (isEmpty) onCropTap();
    else setActionMenuVisible(true);
  }

  const cropImg = getCropStageAsset(effectiveData.cropType, effectiveData.progressPercent, effectiveData.status);
  const progressLabel = effectiveData.withered
    ? "Withered"
    : effectiveData.readyToHarvest
    ? "Ready to harvest!"
    : effectiveData.remainingGrowthDays === 1
    ? "1 day left"
    : effectiveData.remainingGrowthDays > 1
    ? `${effectiveData.remainingGrowthDays} days left`
    : effectiveData.status === "empty"
    ? ""
    : "Growing...";
  const yieldName = getCropYieldLabel(effectiveData.seedItemId);
  const isEmpty = effectiveData.status === "empty";
  const plotTitle = isEmpty
    ? "Empty"
    : yieldName.charAt(0).toUpperCase() + yieldName.slice(1);

  const harvestLocked = effectiveData.readyToHarvest;
  const waterDisabled = !effectiveInteractive || effectiveData.withered || isEmpty;
  const weedsDisabled = !effectiveInteractive || isEmpty;
  const fertilizeDisabled = !effectiveInteractive || effectiveData.withered || isEmpty;
  const waterLocked = harvestLocked && !isEmpty && !effectiveData.withered;
  const weedsLocked = harvestLocked && !isEmpty;
  const fertilizeLocked = harvestLocked && !isEmpty && !effectiveData.withered;
  const fertilizeUnavailable = !fertilizeDisabled && !fertilizerAvailable;
  const harvestDisabled = !effectiveInteractive;

  const effectiveWater = isAuxiliaryPlot ? handleSecondWater : onWater;
  const effectiveWeeds = isAuxiliaryPlot ? handleSecondWeeds : onPullWeeds;
  const effectiveFertilize = isAuxiliaryPlot ? handleSecondFertilize : onFertilize;
  const effectiveHarvest = isAuxiliaryPlot ? handleSecondHarvest : onHarvest;
  const lockedAction = isAuxiliaryPlot
    ? () => showPlayerThought('"That won\'t achieve anything."')
    : (onLockedAction ?? onWater);
  const fertilizerImage = normalizeGardenFertilizerId(selectedFertilizerId) === "premium_fertilizer"
    ? ACTION_IMG.premium_fertilizer
    : ACTION_IMG.standard_fertilizer;

  function runAction(action: () => void, closeMenu = false) {
    if (closeMenu) setActionMenuVisible(false);
    action();
  }

  function handleTearOutPress() {
    setActionMenuVisible(false);
    if (isAuxiliaryPlot) {
      if (protectSeeds) {
        showPlayerThought('"I shouldn\'t waste any seeds."');
        return;
      }
      setTearOutConfirmVisible(true);
      return;
    }
    onCropTap();
  }

  return (
    <>
      <View style={[styles.card, effectiveData.wateredToday && styles.cardWatered]}>
        <View style={styles.topRow}>
          <Animated.View style={attentionStyle}>
            <TouchableOpacity
              style={[styles.cropWrap, attentionPulse && styles.cropWrapAttention]}
              onPress={effectiveInteractive ? handleCropPress : undefined}
              disabled={!effectiveInteractive}
              activeOpacity={0.82}
            >
              {cropImg ? (
                <Image source={cropImg} style={styles.cropImg} resizeMode="contain" resizeMethod="resize" />
              ) : (
                <View style={styles.cropEmpty}>
                  <Text
                    style={styles.cropEmptyText}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {effectiveInteractive ? "Tap to\nplant" : "Empty\nbed"}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </Animated.View>

          <View style={styles.infoCol}>
            <Text style={styles.statusLabel}>{plotTitle}</Text>
            {progressLabel ? <Text style={styles.progressLabel}>{progressLabel}</Text> : null}
            {!isEmpty && (
              <>
                <View style={styles.progressTrack}>
                  <Animated.View style={[styles.progressFill, progBarStyle, { width: `${effectiveData.progressPercent}%` as any }]} />
                </View>
                <Text style={styles.percentText}>{effectiveData.progressPercent}%</Text>
              </>
            )}
            {!effectiveData.withered && !isEmpty && (
              <Text style={styles.yieldHint}>
                Est. yield: {effectiveData.baseYield + effectiveData.accumulatedWeedYieldBonus + effectiveData.accumulatedFertilizerYieldBonus} {yieldName}
              </Text>
            )}
          </View>
        </View>

      </View>

      <Modal
        visible={actionMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setActionMenuVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setActionMenuVisible(false)}>
          <Pressable style={styles.actionPanel} onPress={(event) => event.stopPropagation()}>
            <View style={styles.actionPanelHeader}>
              <Text style={styles.actionPanelTitle}>{effectiveData.readyToHarvest ? "Harvest" : "Tend plant"}</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setActionMenuVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>

            {effectiveData.readyToHarvest ? (
              <ActionBtn
                img={ACTION_IMG.harvest}
                label="Harvest"
                cost=""
                done={false}
                disabled={harvestDisabled}
                onPress={() => runAction(effectiveHarvest, true)}
                isHarvest
              />
            ) : (
              <View style={styles.actionList}>
                <ActionBtn
                  img={ACTION_IMG.watering}
                  label="Watering"
                  cost={`-${actionCosts.water}`}
                  done={effectiveData.wateredToday}
                  disabled={waterDisabled}
                  locked={!waterDisabled && waterLocked}
                  onPress={() => runAction(waterLocked ? lockedAction : effectiveWater)}
                />
                <ActionBtn
                  img={ACTION_IMG.pullweeds}
                  label="Weeding"
                  cost={`-${actionCosts.pullWeeds}`}
                  done={effectiveData.weedsPulledToday && !effectiveData.withered}
                  disabled={weedsDisabled}
                  locked={!weedsDisabled && weedsLocked}
                  onPress={() => runAction(weedsLocked ? lockedAction : effectiveWeeds)}
                />
                <ActionBtn
                  img={fertilizerImage}
                  label="Fertilize"
                  cost={`-${actionCosts.fertilize}`}
                  done={effectiveData.fertilizedToday}
                  disabled={fertilizeDisabled}
                  locked={!fertilizeDisabled && (fertilizeLocked || fertilizeUnavailable)}
                  onPress={() => runAction(fertilizeUnavailable
                    ? () => showPlayerThought('"No fertilizer available."')
                    : fertilizeLocked
                      ? lockedAction
                      : effectiveFertilize)}
                />
                <TouchableOpacity style={styles.tearOutAction} onPress={handleTearOutPress} activeOpacity={0.75}>
                  <Text style={styles.tearOutActionText}>Tear out</Text>
                </TouchableOpacity>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={tearOutConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTearOutConfirmVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setTearOutConfirmVisible(false)}>
          <Pressable style={styles.confirmPanel} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.actionPanelTitle}>Tear it out?</Text>
            <Text style={styles.confirmText}>Do you want to tear everything out and replant?</Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity style={styles.confirmCancel} onPress={() => setTearOutConfirmVisible(false)}>
                <Text style={styles.confirmButtonText}>No</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmDestructive} onPress={() => { void handleSecondTearOut(); }}>
                <Text style={styles.confirmButtonText}>Yes</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <SeedSelectionModal
        visible={plantConfirmVisible}
        seeds={availableSeeds}
        selectedSeedId={selectedSeedId}
        busy={secondBusy}
        onSelect={setSelectedSeedId}
        onClose={() => {
          setPlantConfirmVisible(false);
          setSelectedSeedId(null);
        }}
        onConfirm={handleSecondPlant}
      />
    </>
  );
}

type ActionBtnProps = {
  img: ImageSourcePropType;
  label: string;
  cost: string;
  done: boolean;
  disabled: boolean;
  locked?: boolean;
  isHarvest?: boolean;
  onPress: () => void;
};

function ActionBtn({ img, label, cost, done, disabled, locked, isHarvest, onPress }: ActionBtnProps) {
  return (
    <TouchableOpacity
      style={[
        styles.actionBtn,
        done && styles.actionBtnDone,
        locked && styles.actionBtnLocked,
        isHarvest && !locked && !disabled && styles.actionBtnHarvest,
        disabled && !locked && styles.actionBtnDisabled,
      ]}
      onPress={disabled ? undefined : onPress}
      disabled={disabled && !locked}
      activeOpacity={0.75}
    >
      <Image source={img} style={[styles.actionIcon, (disabled || locked) && styles.iconDimmed]} resizeMode="contain" resizeMethod="resize" />
      <Text style={[styles.actionLabel, (disabled || locked) && styles.labelDimmed]}>{label}</Text>
      {cost ? <Text style={[styles.actionCost, (disabled || locked) && styles.labelDimmed]}>{cost} Stamina</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(14, 8, 2, 0.92)",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(196, 148, 58, 0.38)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 18,
  },
  cardWatered: { borderColor: "#4A9FE8" },
  topRow: { flexDirection: "row", padding: 14, gap: 14, alignItems: "center" },
  cropWrap: {
    width: 90, height: 90, borderRadius: 12, overflow: "hidden", borderWidth: 2,
    borderColor: "rgba(196,148,58,0.45)", backgroundColor: "rgba(30,18,5,0.95)",
    alignItems: "center", justifyContent: "center",
  },
  cropImg: { width: "100%", height: "100%" },
  cropEmpty: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(20,12,4,0.8)" },
  cropEmptyText: {
    width: "100%",
    paddingHorizontal: 6,
    color: "rgba(225,182,96,0.82)",
    fontSize: 12,
    lineHeight: 17,
    fontFamily: "Oldenburg",
    textAlign: "center",
  },
  infoCol: { flex: 1, gap: 5 },
  statusLabel: { color: "#C4943A", fontSize: 13, fontFamily: "Oldenburg", letterSpacing: 0.8 },
  progressLabel: { color: "#F0E8D5", fontSize: 12, fontFamily: "Oldenburg", opacity: 0.85 },
  progressTrack: { height: 10, borderRadius: 5, backgroundColor: "#2A1800", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 5 },
  percentText: { color: "rgba(240,232,213,0.6)", fontSize: 11, fontFamily: "Oldenburg" },
  yieldHint: { color: "rgba(196,148,58,0.65)", fontSize: 10, fontFamily: "Oldenburg", marginTop: 2 },
  actionBtn: {
    width: "100%", flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 11,
    borderRadius: 10, borderWidth: 1, borderColor: "rgba(90,65,30,0.45)",
    backgroundColor: "rgba(25,14,4,0.90)", gap: 10, minHeight: 54,
  },
  actionBtnDone: { borderColor: "rgba(78,158,42,0.55)", backgroundColor: "rgba(78,158,42,0.12)" },
  actionBtnLocked: { borderColor: "rgba(60,40,20,0.40)", backgroundColor: "rgba(15,8,2,0.85)", opacity: 0.5 },
  actionBtnDisabled: { opacity: 0.35 },
  actionBtnHarvest: { borderColor: "rgba(196,148,58,0.65)", backgroundColor: "rgba(196,148,58,0.14)" },
  actionIcon: { width: 32, height: 32 },
  iconDimmed: { opacity: 0.45 },
  actionLabel: { flex: 1, color: "#F0E8D5", fontSize: 14, fontFamily: "Oldenburg", letterSpacing: 0.3 },
  actionCost: { color: "rgba(240,232,213,0.72)", fontSize: 12, fontFamily: "Oldenburg", fontVariant: ["tabular-nums"] },
  labelDimmed: { opacity: 0.45 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.68)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  cropWrapAttention: {
    borderColor: "#F0C862",
  },
  actionPanel: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.65)",
    backgroundColor: "rgba(18,10,3,0.98)",
    padding: 14,
    gap: 12,
  },
  actionPanelHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  actionPanelTitle: { flex: 1, color: "#E8C978", fontSize: 18, fontFamily: "Oldenburg" },
  closeButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 19 },
  closeButtonText: { color: "#F0E8D5", fontSize: 30, lineHeight: 32 },
  actionList: { gap: 8 },
  tearOutAction: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(186,64,49,0.65)",
    backgroundColor: "rgba(112,28,20,0.35)",
  },
  tearOutActionText: { color: "#F0B3A8", fontSize: 14, fontFamily: "Oldenburg" },
  confirmPanel: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.65)",
    backgroundColor: "rgba(18,10,3,0.98)",
    padding: 18,
    gap: 16,
  },
  confirmText: { color: "#F0E8D5", fontSize: 13, lineHeight: 20, fontFamily: "Oldenburg" },
  confirmButtons: { flexDirection: "row", gap: 10 },
  confirmCancel: { flex: 1, padding: 12, borderRadius: 10, alignItems: "center", backgroundColor: "rgba(90,65,30,0.45)" },
  confirmDestructive: { flex: 1, padding: 12, borderRadius: 10, alignItems: "center", backgroundColor: "rgba(140,40,28,0.72)" },
  confirmButtonText: { color: "#F0E8D5", fontSize: 13, fontFamily: "Oldenburg" },
});
