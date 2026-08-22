import AsyncStorage from "@react-native-async-storage/async-storage";

import type { GardenPlotData } from "@/src/components/GardenPlot";
import type { BagItem } from "@/src/game/item-system";

export const SECOND_GARDEN_PLOT_KEY = "@garden:plot_02_data";

export const SECOND_GARDEN_PLOT_EMPTY: GardenPlotData = {
  id: "garden_plot_02",
  plotType: "small",
  upgradeLevel: 1,
  status: "empty",
  cropType: null,
  cropAsset: null,
  seedItemId: null,
  totalGrowthDays: 0,
  completedGrowthDays: 0,
  remainingGrowthDays: 0,
  progressPercent: 0,
  wateredToday: false,
  weedsPulledToday: false,
  fertilizedToday: false,
  fertilizerTypeUsedToday: null,
  consecutiveUnwateredDays: 0,
  baseYield: 0,
  accumulatedWeedYieldBonus: 0,
  accumulatedFertilizerYieldBonus: 0,
  readyToHarvest: false,
  withered: false,
};

export type GardenSeedConfig = {
  seedItemId: string;
  cropType: string;
  cropAsset: string;
  totalGrowthDays: number;
  completedGrowthDaysAtPlanting: number;
  baseYield: number;
  yieldLabel: string;
  harvestBag: Omit<BagItem, "containedQuantity">;
};

const LEGACY_SEED_IDS: Record<string, string> = {
  herbseed: "seed_herb",
  carrotseed: "seed_carrot",
};

const GARDEN_SEED_CONFIGS: Record<string, GardenSeedConfig> = {
  seed_herb: {
    seedItemId: "seed_herb",
    cropType: "herb",
    cropAsset: "seed_herb",
    totalGrowthDays: 2,
    completedGrowthDaysAtPlanting: 0,
    baseYield: 5,
    yieldLabel: "herbs",
    harvestBag: {
      id: "herbbag",
      itemType: "herbbag",
      name: "Herb Bag",
      quantity: 1,
      containedItem: "herbs",
    },
  },
  seed_carrot: {
    seedItemId: "seed_carrot",
    cropType: "carrot",
    cropAsset: "seed_carrot",
    totalGrowthDays: 4,
    completedGrowthDaysAtPlanting: 1,
    baseYield: 5,
    yieldLabel: "carrots",
    harvestBag: {
      id: "carrotbag",
      itemType: "carrotbag",
      name: "Carrot Bag",
      quantity: 1,
      containedItem: "carrot",
    },
  },
};

/** Converts legacy save data to the canonical seed IDs. */
export function normalizeGardenSeedId(seedItemId: string | null): string | null {
  return seedItemId ? (LEGACY_SEED_IDS[seedItemId] ?? seedItemId) : null;
}

export function getGardenSeedConfig(seedItemId: string | null): GardenSeedConfig | null {
  const normalizedSeedId = normalizeGardenSeedId(seedItemId);
  return normalizedSeedId ? (GARDEN_SEED_CONFIGS[normalizedSeedId] ?? null) : null;
}

export function createGardenPlotFromSeed(
  basePlot: GardenPlotData,
  seedItemId: string,
): GardenPlotData | null {
  const config = getGardenSeedConfig(seedItemId);
  if (!config) return null;

  return {
    ...basePlot,
    status: "growing",
    cropType: config.cropType,
    cropAsset: config.cropAsset,
    seedItemId: config.seedItemId,
    totalGrowthDays: config.totalGrowthDays,
    completedGrowthDays: config.completedGrowthDaysAtPlanting,
    remainingGrowthDays: Math.max(0, config.totalGrowthDays - config.completedGrowthDaysAtPlanting),
    progressPercent: 0,
    wateredToday: false,
    weedsPulledToday: false,
    fertilizedToday: false,
    fertilizerTypeUsedToday: null,
    consecutiveUnwateredDays: 0,
    baseYield: config.baseYield,
    accumulatedWeedYieldBonus: 0,
    accumulatedFertilizerYieldBonus: 0,
    readyToHarvest: false,
    withered: false,
  };
}

export function createHarvestBagForCrop(
  seedItemId: string | null,
  containedQuantity: number,
): BagItem | null {
  const config = getGardenSeedConfig(seedItemId);
  return config ? { ...config.harvestBag, containedQuantity } : null;
}

export function getCropYieldLabel(seedItemId: string | null): string {
  return getGardenSeedConfig(seedItemId)?.yieldLabel ?? "items";
}

/**
 * Carrot calendar:
 * Day 1 planting = seed_carrot (completedGrowthDays 1, visual progress 0)
 * Day 2 = carrotyoung
 * Day 3 = carrotyoung
 * Day 4 = carrotbed / ready to harvest
 */
export function createCarrotPlot(): GardenPlotData {
  return createGardenPlotFromSeed(SECOND_GARDEN_PLOT_EMPTY, "seed_carrot")!;
}

export function processGardenPlotDayChange(plot: GardenPlotData): GardenPlotData {
  if (plot.status === "empty" || plot.readyToHarvest) {
    return {
      ...plot,
      wateredToday: false,
      weedsPulledToday: false,
      fertilizedToday: false,
      fertilizerTypeUsedToday: null,
    };
  }

  const next = { ...plot };
  if (!plot.withered) {
    if (plot.wateredToday) {
      next.completedGrowthDays = Math.min(plot.completedGrowthDays + 1, plot.totalGrowthDays);
      next.progressPercent = Math.round((next.completedGrowthDays / plot.totalGrowthDays) * 100);
      next.remainingGrowthDays = Math.max(0, plot.totalGrowthDays - next.completedGrowthDays);
      next.consecutiveUnwateredDays = 0;
      if (next.completedGrowthDays >= plot.totalGrowthDays) {
        next.status = "ready";
        next.readyToHarvest = true;
      }
    } else {
      next.consecutiveUnwateredDays = plot.consecutiveUnwateredDays + 1;
      if (next.consecutiveUnwateredDays >= 3) {
        next.withered = true;
        next.status = "withered";
      }
    }
  }

  next.wateredToday = false;
  next.weedsPulledToday = false;
  next.fertilizedToday = false;
  next.fertilizerTypeUsedToday = null;
  return next;
}

export async function loadSecondGardenPlot(): Promise<GardenPlotData> {
  try {
    const raw = await AsyncStorage.getItem(SECOND_GARDEN_PLOT_KEY);
    return raw ? { ...SECOND_GARDEN_PLOT_EMPTY, ...JSON.parse(raw) } : { ...SECOND_GARDEN_PLOT_EMPTY };
  } catch {
    return { ...SECOND_GARDEN_PLOT_EMPTY };
  }
}

export async function saveSecondGardenPlot(plot: GardenPlotData): Promise<void> {
  await AsyncStorage.setItem(SECOND_GARDEN_PLOT_KEY, JSON.stringify(plot));
}

export async function advanceSecondGardenPlotDay(): Promise<void> {
  const raw = await AsyncStorage.getItem(SECOND_GARDEN_PLOT_KEY);
  if (!raw) return;
  try {
    const plot = { ...SECOND_GARDEN_PLOT_EMPTY, ...JSON.parse(raw) } as GardenPlotData;
    await saveSecondGardenPlot(processGardenPlotDayChange(plot));
  } catch {
    // A malformed optional second plot must never block the main day transition.
  }
}
