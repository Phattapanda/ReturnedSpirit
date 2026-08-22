import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
} from "react-native-reanimated";

import {
  type BagItem,
} from "@/src/game/item-system";
import { commitHarvestBag } from "@/src/game/garden-harvest";
import { addKarmaPoints } from "@/src/game/progression";
import {
  createGardenPlotFromSeed,
  createHarvestBagForCrop,
  getCropYieldLabel,
  loadSecondGardenPlot,
  saveSecondGardenPlot,
  SECOND_GARDEN_PLOT_EMPTY,
} from "@/src/game/garden-crop-system";
import {
  guestTutorialRupertHasLeftGarden,
  loadGuestTutorialIntroStep,
} from "@/src/game/guest-tutorial";
import { useGardenRuntime } from "@/src/game/garden-runtime-context";
import SeedSelectionModal, {
  type SeedSelectionOption,
} from "@/src/components/seed-selection-modal";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GardenPlotStatus = "empty" | "growing" | "ready" | "withered";

export type GardenPlotData = {
  id: string;
  plotType: "small" | "medium" | "large";
  upgradeLevel: number;
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
  onLockedAction?: () => void;
  actionCosts?: { water: number; pullWeeds: number; fertilize: number };
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

const CROP_ASSETS: Record<string, ReturnType<typeof require>> = {
  herbbed:       require("../../assets/images/herbbed.png"),
  herbbed_young: require("../../assets/images/herbbed_young.png"),
  seed_herb:     require("../../assets/images/herbseed.png"),
  herbs:         require("../../assets/images/herbs.png"),
  seed_carrot:   require("../../assets/images/carrotseed.png"),
  carrotyoung:   require("../../assets/images/carrotyoung.png"),
  carrotbed:     require("../../assets/images/carrotbed.png"),
};

const ACTION_IMG = {
  watering:   require("../../assets/images/watering.png"),
  pullweeds:  require("../../assets/images/pullweeds.png"),
  fertilizer: require("../../assets/images/fertilizer.png"),
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
    growingStageAsset: "herbbed_young",
    readyStageAsset: "herbbed",
  },
  carrot: {
    seedStageAsset: "seed_carrot",
    growingStageAsset: "carrotyoung",
    readyStageAsset: "carrotbed",
  },
};

/**
 * Carrot visual calendar:
 * Day 1 = seed_carrot, Day 2–3 = carrotyoung, Day 4 = carrotbed.
 */
export function getCropStageAsset(
  cropType: string | null,
  progressPercent: number,
  status: GardenPlotStatus,
): ReturnType<typeof require> | null {
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
    onLockedAction,
    actionCosts = { water: 2, pullWeeds: 8, fertilize: 3 },
  } = props;

  const { refreshGarden, showPlayerThought } = useGardenRuntime();
  const isSecondPlot = data.id === "garden_plot_02";
  const [secondData, setSecondData] = useState<GardenPlotData>(SECOND_GARDEN_PLOT_EMPTY);
  const [protectSeeds, setProtectSeeds] = useState(false);
  const [plantConfirmVisible, setPlantConfirmVisible] = useState(false);
  const [availableSeeds, setAvailableSeeds] = useState<SeedSelectionOption[]>([]);
  const [selectedSeedId, setSelectedSeedId] = useState<string | null>(null);
  const [secondBusy, setSecondBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const step = await loadGuestTutorialIntroStep();
      if (active) setProtectSeeds(guestTutorialRupertHasLeftGarden(step));
      if (isSecondPlot) {
        const loaded = await loadSecondGardenPlot();
        if (active) setSecondData(loaded);
      }
    })().catch(() => {});
    return () => { active = false; };
  }, [isSecondPlot]);

  const effectiveData = isSecondPlot ? secondData : data;
  const effectiveInteractive = isSecondPlot ? true : interactive;

  const progColor = useSharedValue(effectiveData.wateredToday ? 1 : 0);
  useEffect(() => {
    progColor.value = withTiming(effectiveData.wateredToday ? 1 : 0, { duration: 450 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveData.wateredToday]);

  const progBarStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progColor.value, [0, 1], ["#CC2200", "#4E9E2A"]),
  }));

  async function persistSecond(next: GardenPlotData) {
    setSecondData(next);
    await saveSecondGardenPlot(next);
  }

  async function handleSecondPlant() {
    if (secondBusy || !selectedSeedId) return;
    setSecondBusy(true);
    try {
      const rawInventory = await AsyncStorage.getItem(GARDEN_INVENTORY_KEY);
      const inventory: GardenInventoryItem[] = rawInventory ? JSON.parse(rawInventory) : [];
      const seedIndex = inventory.findIndex(
        (item) => item.id === selectedSeedId && item.itemType === "seed" && item.quantity > 0,
      );
      if (seedIndex < 0) {
        showPlayerThought('"That seed is no longer available."');
        return;
      }
      const nextPlot = createGardenPlotFromSeed(SECOND_GARDEN_PLOT_EMPTY, selectedSeedId);
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
        ["@garden:plot_02_data", JSON.stringify(nextPlot)],
      ]);
      setSecondData(nextPlot);
      setPlantConfirmVisible(false);
      setSelectedSeedId(null);
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
      if (!(await onSpendStamina(2))) { showPlayerThought('"Not enough stamina."'); return; }
      await persistSecond({ ...secondData, wateredToday: true });
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
        if (!(await onSpendStamina(5))) { showPlayerThought('"Not enough stamina."'); return; }
        await persistSecond({ ...SECOND_GARDEN_PLOT_EMPTY });
        refreshGarden();
      } finally {
        setSecondBusy(false);
      }
      return;
    }
    if (secondData.weedsPulledToday) { showPlayerThought('"I already did this today."'); return; }
    setSecondBusy(true);
    try {
      if (!(await onSpendStamina(8))) { showPlayerThought('"Not enough stamina."'); return; }
      await persistSecond({
        ...secondData,
        weedsPulledToday: true,
        accumulatedWeedYieldBonus: secondData.accumulatedWeedYieldBonus + 1,
      });
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
      const selected = (await AsyncStorage.getItem(SELECTED_FERTILIZER_KEY)) ?? "standard_fertilizer";
      const rawInventory = await AsyncStorage.getItem(GARDEN_INVENTORY_KEY);
      const inventory: GardenInventoryItem[] = rawInventory ? JSON.parse(rawInventory) : [];
      const fertIndex = inventory.findIndex((item) => item.id === selected && item.itemType === "fertilizer" && item.quantity > 0);
      if (fertIndex < 0) { showPlayerThought('"No fertilizer available."'); return; }
      if (!(await onSpendStamina(3))) { showPlayerThought('"Not enough stamina."'); return; }

      const nextInventory = inventory.map((item) => ({ ...item }));
      nextInventory[fertIndex] = {
        ...nextInventory[fertIndex],
        quantity: nextInventory[fertIndex].quantity - 1,
      };
      const nextPlot = {
        ...secondData,
        fertilizedToday: true,
        fertilizerTypeUsedToday: selected,
        accumulatedFertilizerYieldBonus: secondData.accumulatedFertilizerYieldBonus + 1,
      };
      await AsyncStorage.multiSet([
        [GARDEN_INVENTORY_KEY, JSON.stringify(nextInventory)],
        ["@garden:plot_02_data", JSON.stringify(nextPlot)],
      ]);
      setSecondData(nextPlot);
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
        ["@garden:plot_02_data", JSON.stringify(SECOND_GARDEN_PLOT_EMPTY)],
      ]);
      if (!result.ok) {
        showPlayerThought(result.reason === "bag_locked"
          ? '"I need my bag first."'
          : '"My bag is full."');
        return;
      }

      await addKarmaPoints(1);

      setSecondData({ ...SECOND_GARDEN_PLOT_EMPTY });
      onHarvestStored?.(harvestBag);
      refreshGarden();
    } finally {
      setSecondBusy(false);
    }
  }

  async function handleCropPress() {
    const isEmpty = effectiveData.status === "empty";
    if (!isEmpty && protectSeeds) {
      showPlayerThought('"I shouldn\'t waste any seeds."');
      return;
    }
    if (isSecondPlot) {
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
      }
      return;
    }
    onCropTap();
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
  const statusLabel = effectiveData.withered
    ? "Dead"
    : effectiveData.readyToHarvest
    ? "Ready"
    : effectiveData.status === "empty"
    ? "Empty"
    : "Growing";
  const yieldName = getCropYieldLabel(effectiveData.seedItemId);
  const isEmpty = effectiveData.status === "empty";

  const harvestLocked = effectiveData.readyToHarvest;
  const waterDisabled = !effectiveInteractive || effectiveData.withered || isEmpty;
  const weedsDisabled = !effectiveInteractive || isEmpty;
  const fertilizeDisabled = !effectiveInteractive || effectiveData.withered || isEmpty;
  const waterLocked = harvestLocked && !isEmpty && !effectiveData.withered;
  const weedsLocked = harvestLocked && !isEmpty;
  const fertilizeLocked = harvestLocked && !isEmpty && !effectiveData.withered;
  const harvestDisabled = !effectiveInteractive;
  const harvestNotReady = !effectiveData.readyToHarvest;

  const effectiveWater = isSecondPlot ? handleSecondWater : onWater;
  const effectiveWeeds = isSecondPlot ? handleSecondWeeds : onPullWeeds;
  const effectiveFertilize = isSecondPlot ? handleSecondFertilize : onFertilize;
  const effectiveHarvest = isSecondPlot ? handleSecondHarvest : onHarvest;
  const lockedAction = isSecondPlot
    ? () => showPlayerThought('"That won\'t achieve anything."')
    : (onLockedAction ?? onWater);

  return (
    <>
      <View style={styles.card}>
        <View style={styles.topRow}>
          <TouchableOpacity
            style={styles.cropWrap}
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

          <View style={styles.infoCol}>
            <Text style={styles.statusLabel}>{statusLabel}</Text>
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

        <View style={styles.divider} />
        <View style={styles.actionsRow}>
          <ActionBtn img={ACTION_IMG.watering} label="Water" cost={isEmpty ? "" : `-${actionCosts.water}`} done={effectiveData.wateredToday} disabled={waterDisabled} locked={!waterDisabled && waterLocked} onPress={waterLocked ? lockedAction : effectiveWater} />
          <ActionBtn img={ACTION_IMG.pullweeds} label="Weeds" cost={isEmpty ? "" : `-${actionCosts.pullWeeds}`} done={effectiveData.weedsPulledToday && !effectiveData.withered} disabled={weedsDisabled} locked={!weedsDisabled && weedsLocked} onPress={weedsLocked ? lockedAction : effectiveWeeds} />
          <ActionBtn img={ACTION_IMG.fertilizer} label="Fertilize" cost={isEmpty ? "" : `-${actionCosts.fertilize}`} done={effectiveData.fertilizedToday} disabled={fertilizeDisabled} locked={!fertilizeDisabled && fertilizeLocked} onPress={fertilizeLocked ? lockedAction : effectiveFertilize} />
          <ActionBtn img={ACTION_IMG.harvest} label="Harvest" cost="" done={false} disabled={harvestDisabled} locked={harvestNotReady && effectiveInteractive} onPress={effectiveHarvest} isHarvest />
        </View>
      </View>

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
  img: ReturnType<typeof require>;
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
      {cost ? <Text style={[styles.actionCost, (disabled || locked) && styles.labelDimmed]}>{cost}⚡</Text> : null}
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
  divider: { height: 1, backgroundColor: "rgba(196,148,58,0.18)", marginHorizontal: 10 },
  actionsRow: { flexDirection: "row", gap: 6, padding: 10 },
  actionBtn: {
    flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 9,
    borderRadius: 10, borderWidth: 1, borderColor: "rgba(90,65,30,0.45)",
    backgroundColor: "rgba(25,14,4,0.90)", gap: 3, minHeight: 70,
  },
  actionBtnDone: { borderColor: "rgba(78,158,42,0.55)", backgroundColor: "rgba(78,158,42,0.12)" },
  actionBtnLocked: { borderColor: "rgba(60,40,20,0.40)", backgroundColor: "rgba(15,8,2,0.85)", opacity: 0.5 },
  actionBtnDisabled: { opacity: 0.35 },
  actionBtnHarvest: { borderColor: "rgba(196,148,58,0.65)", backgroundColor: "rgba(196,148,58,0.14)" },
  actionIcon: { width: 28, height: 28 },
  iconDimmed: { opacity: 0.45 },
  actionLabel: { color: "#F0E8D5", fontSize: 10, fontFamily: "Oldenburg", textAlign: "center", letterSpacing: 0.3 },
  actionCost: { color: "rgba(240,232,213,0.55)", fontSize: 9, fontFamily: "Oldenburg", textAlign: "center" },
  labelDimmed: { opacity: 0.45 },
});
