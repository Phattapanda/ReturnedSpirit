import AsyncStorage from "@react-native-async-storage/async-storage";

import type { GardenPlotData } from "@/src/components/GardenPlot";
import type { BagItem } from "@/src/game/item-system";

export const SECOND_GARDEN_PLOT_KEY = "@garden:plot_02_data";
export const THIRD_GARDEN_PLOT_KEY = "@garden:plot_03_data";
export const FOURTH_GARDEN_PLOT_KEY = "@garden:plot_04_data";

export type GardenPlotNumber = 1 | 2 | 3 | 4;

export function gardenPlotId(plotNumber: GardenPlotNumber): string {
  return `garden_plot_0${plotNumber}`;
}

export function gardenPlotStorageKey(plotNumber: GardenPlotNumber): string {
  return `@garden:plot_0${plotNumber}_data`;
}

export function minimumYieldForUpgradeLevel(level: number | undefined): number {
  return level && level >= 2 ? 10 : level && level >= 1 ? 7 : 5;
}

export function createEmptyGardenPlot(plotNumber: GardenPlotNumber): GardenPlotData {
  return {
    id: gardenPlotId(plotNumber),
    plotType: "small",
    upgradeLevel: 1,
    yieldUpgradeLevel: 0,
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
}

export const SECOND_GARDEN_PLOT_EMPTY: GardenPlotData = {
  id: "garden_plot_02",
  plotType: "small",
  upgradeLevel: 1,
  yieldUpgradeLevel: 0,
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
  onionseed: "seed_onion",
  potatoseed: "seed_potato",
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
      id: "bag_herb",
      itemType: "bag_herb",
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
      id: "bag_carrot",
      itemType: "bag_carrot",
      name: "Carrot Bag",
      quantity: 1,
      containedItem: "carrot",
    },
  },
  seed_potato: {
    seedItemId: "seed_potato",
    cropType: "potato",
    cropAsset: "seed_potato",
    totalGrowthDays: 4,
    completedGrowthDaysAtPlanting: 1,
    baseYield: 5,
    yieldLabel: "potatoes",
    harvestBag: {
      id: "bag_potato",
      itemType: "bag_potato",
      name: "Potato Bag",
      quantity: 1,
      containedItem: "potato",
    },
  },
  seed_onion: {
    seedItemId: "seed_onion",
    cropType: "onion",
    cropAsset: "seed_onion",
    totalGrowthDays: 5,
    completedGrowthDaysAtPlanting: 1,
    baseYield: 5,
    yieldLabel: "onions",
    harvestBag: {
      id: "bag_onion",
      itemType: "bag_onion",
      name: "Onion Bag",
      quantity: 1,
      containedItem: "onion",
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
    baseYield: Math.max(config.baseYield, minimumYieldForUpgradeLevel(basePlot.yieldUpgradeLevel)),
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
 * Crops count the planting day as day 1. Watering advances them when the next
 * game day begins, so four-day crops are ready on day 4 and onions on day 5.
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
  for (const plotNumber of [2, 3, 4] as const) {
    const key = gardenPlotStorageKey(plotNumber);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) continue;
    try {
      const plot = { ...createEmptyGardenPlot(plotNumber), ...JSON.parse(raw) } as GardenPlotData;
      await AsyncStorage.setItem(key, JSON.stringify(processGardenPlotDayChange(plot)));
    } catch {
      // A malformed optional plot must never block the main day transition.
    }
  }
}
