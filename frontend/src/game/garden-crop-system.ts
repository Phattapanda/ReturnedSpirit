import AsyncStorage from "@react-native-async-storage/async-storage";

import type { GardenPlotData } from "@/src/components/GardenPlot";

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

/**
 * Carrot calendar:
 * Day 1 planting = carrotseed (completedGrowthDays 1, visual progress 0)
 * Day 2 = carrotyoung
 * Day 3 = carrotyoung
 * Day 4 = carrotbed / ready to harvest
 */
export function createCarrotPlot(): GardenPlotData {
  return {
    ...SECOND_GARDEN_PLOT_EMPTY,
    status: "growing",
    cropType: "carrot",
    cropAsset: "carrotseed",
    seedItemId: "carrotseed",
    totalGrowthDays: 4,
    completedGrowthDays: 1,
    remainingGrowthDays: 3,
    progressPercent: 0,
    baseYield: 5,
  };
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
