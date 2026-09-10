import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  SHARED_RESOURCE_DEFAULTS,
  SHARED_RESOURCES_KEY,
  type SharedResources,
} from "@/src/game/shared-resources";
import {
  DEFAULT_BAG,
  KITCHEN_TABLE_KEY,
  PLAYER_BAG_KEY,
  normalizeItemId,
  normalizePlayerBagData,
  type BagItem,
  type PlayerBagData,
} from "@/src/game/item-system";
import {
  CURRENCY_KEY,
  COPPER_PER_SILVER,
  loadCurrencyCopper,
  notifyCurrencyChanged,
} from "@/src/game/currency-system";
import {
  createEmptyGardenPlot,
  gardenPlotStorageKey,
  minimumYieldForUpgradeLevel,
  normalizeGardenSeedId,
  type GardenPlotNumber,
} from "@/src/game/garden-crop-system";
import {
  DEFAULT_PLAYER_STATS,
  PLAYER_STATS_KEY,
  calcEffectiveStaminaCost,
  getActiveStaminaBuffReduction,
  normalizePlayerStats,
} from "@/src/game/player-stats";
import { loadTavernQuestState } from "@/src/game/tavern-quest-system";

export const POST_GUEST_TUTORIAL_STATE_KEY = "@tutorial:post_guest_state";
const GARDEN_INVENTORY_KEY = "@garden:inventory";

export const SECOND_PLOT_WOOD_COST = 4;
export const SECOND_PLOT_STONE_COST = 4;
export const LATER_PLOT_WOOD_COST = 8;
export const LATER_PLOT_STONE_COST = 8;
export const LATER_PLOT_NAILS_COST = 4;
export const PLOT_STANDARD_FERTILIZER_COST = 5;
export const PLOT_PREMIUM_FERTILIZER_COST = 5;
export const GUEST_AREA_CLEAN_STEPS_REQUIRED = 5;
export const GUEST_AREA_CLEAN_STAMINA_COST = 10;
export const OUTSIDE_CLEAN_STEPS_REQUIRED = 10;
export const OUTSIDE_CLEAN_STAMINA_COST = 15;

const CURRENT_STAMINA_KEY = "@game:stamina";
const STAMINA_SPENT_TODAY_KEY = "@game:stamina_spent_today";
const GUEST_STATE_KEY = "@game:guest_state";

export type PostGuestTutorialState = {
  version: 7;
  farmerGiftClaimed: boolean;
  secondPlotThoughtSeen: boolean;
  upgradeIntroSeen: boolean;
  secondPlotUnlocked: boolean;
  thirdPlotUnlocked: boolean;
  fourthPlotUnlocked: boolean;
  plotYieldUpgradeLevels: Record<string, number>;
  guestAreaCleanSteps: number;
  guestAreaCompletedDaySerial: number | null;
  outsideCleanSteps: number;
  tableAndChairsCompletedDaySerial: number | null;
  aleServiceUnlocked: boolean;
  aleServiceAvailableDaySerial: number | null;
  honeyMeadServiceUnlocked: boolean;
  kitchenTableUpgradeLevel: number;
};

export const DEFAULT_POST_GUEST_TUTORIAL_STATE: PostGuestTutorialState = {
  version: 7,
  farmerGiftClaimed: false,
  secondPlotThoughtSeen: false,
  upgradeIntroSeen: false,
  secondPlotUnlocked: false,
  thirdPlotUnlocked: false,
  fourthPlotUnlocked: false,
  plotYieldUpgradeLevels: {},
  guestAreaCleanSteps: 0,
  guestAreaCompletedDaySerial: null,
  outsideCleanSteps: 0,
  tableAndChairsCompletedDaySerial: null,
  aleServiceUnlocked: false,
  aleServiceAvailableDaySerial: null,
  honeyMeadServiceUnlocked: false,
  kitchenTableUpgradeLevel: 0,
};

type GardenInventoryItem = {
  id: string;
  itemType: string;
  name: string;
  quantity: number;
  containedItem?: string;
  containedQuantity?: number;
};

function normalizeState(raw: unknown): PostGuestTutorialState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_POST_GUEST_TUTORIAL_STATE };
  const candidate = raw as Partial<PostGuestTutorialState>;
  const cleanSteps = Math.min(
    GUEST_AREA_CLEAN_STEPS_REQUIRED,
    Math.max(0, Math.floor(Number(candidate.guestAreaCleanSteps) || 0)),
  );
  const completedDaySerial = Number(candidate.guestAreaCompletedDaySerial);
  const legacyOutsideCompletedDaySerial = Number(candidate.tableAndChairsCompletedDaySerial);
  const legacyOutsideComplete = candidate.tableAndChairsCompletedDaySerial !== null &&
    candidate.tableAndChairsCompletedDaySerial !== undefined &&
    Number.isFinite(legacyOutsideCompletedDaySerial);
  const outsideCleanSteps = legacyOutsideComplete
    ? OUTSIDE_CLEAN_STEPS_REQUIRED
    : Math.min(OUTSIDE_CLEAN_STEPS_REQUIRED, Math.max(0, Math.floor(Number(candidate.outsideCleanSteps) || 0)));
  const secondPlotUnlocked = candidate.secondPlotUnlocked === true;
  const thirdPlotUnlocked = secondPlotUnlocked && candidate.thirdPlotUnlocked === true;
  const aleServiceUnlocked = candidate.aleServiceUnlocked === true;
  const aleAvailableDaySerial = Number(candidate.aleServiceAvailableDaySerial);
  return {
    version: 7,
    farmerGiftClaimed: candidate.farmerGiftClaimed === true,
    secondPlotThoughtSeen: candidate.secondPlotThoughtSeen === true,
    upgradeIntroSeen: candidate.upgradeIntroSeen === true,
    secondPlotUnlocked,
    thirdPlotUnlocked,
    fourthPlotUnlocked: thirdPlotUnlocked && candidate.fourthPlotUnlocked === true,
    plotYieldUpgradeLevels: Object.fromEntries(
      Object.entries(candidate.plotYieldUpgradeLevels ?? {}).map(([plotId, level]) => [
        plotId,
        Math.max(0, Math.min(2, Math.floor(Number(level) || 0))),
      ]),
    ),
    guestAreaCleanSteps: cleanSteps,
    guestAreaCompletedDaySerial: cleanSteps >= GUEST_AREA_CLEAN_STEPS_REQUIRED && Number.isFinite(completedDaySerial)
      ? Math.max(0, Math.floor(completedDaySerial))
      : null,
    outsideCleanSteps,
    tableAndChairsCompletedDaySerial: outsideCleanSteps >= OUTSIDE_CLEAN_STEPS_REQUIRED && legacyOutsideComplete
      ? Math.max(0, Math.floor(legacyOutsideCompletedDaySerial))
      : null,
    aleServiceUnlocked,
    // Legacy saves already serving Ale have no activation day and remain available.
    aleServiceAvailableDaySerial: aleServiceUnlocked
      ? Number.isFinite(aleAvailableDaySerial) ? Math.max(0, Math.floor(aleAvailableDaySerial)) : 0
      : null,
    honeyMeadServiceUnlocked: aleServiceUnlocked && candidate.honeyMeadServiceUnlocked === true,
    kitchenTableUpgradeLevel: Math.max(0, Math.min(3, Math.floor(Number(candidate.kitchenTableUpgradeLevel) || 0))),
  };
}

export const KITCHEN_TABLE_COLUMNS = 6;
export const BASE_KITCHEN_TABLE_ROWS = 2;
export const MAX_KITCHEN_TABLE_UPGRADE_LEVEL = 3;
export const KITCHEN_TABLE_UPGRADE_SILVER_COSTS = [3, 10, 25] as const;

export function getKitchenTableRowCount(state: PostGuestTutorialState): number {
  return BASE_KITCHEN_TABLE_ROWS + Math.max(0, Math.min(MAX_KITCHEN_TABLE_UPGRADE_LEVEL, state.kitchenTableUpgradeLevel));
}

export function getKitchenTableSlotCount(state: PostGuestTutorialState): number {
  return getKitchenTableRowCount(state) * KITCHEN_TABLE_COLUMNS;
}

export type KitchenTableUpgradeResult =
  | { ok: true; alreadyUnlocked: boolean; state: PostGuestTutorialState; tableItems: (BagItem | null)[]; remainingCopper: number }
  | { ok: false; reason: "prerequisite_locked" | "insufficient_currency"; state: PostGuestTutorialState; tableItems: (BagItem | null)[]; remainingCopper: number };

export async function purchaseKitchenTableUpgrade(targetLevel: 1 | 2 | 3): Promise<KitchenTableUpgradeResult> {
  const state = await loadPostGuestTutorialState();
  const currentCopper = await loadCurrencyCopper();
  const rawTable = await AsyncStorage.getItem(KITCHEN_TABLE_KEY);
  let parsedTable: (BagItem | null)[] = [];
  if (rawTable) {
    try { parsedTable = JSON.parse(rawTable); } catch { /* use empty table */ }
  }
  const currentSlotCount = getKitchenTableSlotCount(state);
  let tableItems = Array.from({ length: Math.max(currentSlotCount, parsedTable.length) }, (_, index) => parsedTable[index] ?? null);
  if (state.kitchenTableUpgradeLevel >= targetLevel) {
    return { ok: true, alreadyUnlocked: true, state, tableItems, remainingCopper: currentCopper };
  }
  if (!isGuestAreaComplete(state) || targetLevel !== state.kitchenTableUpgradeLevel + 1) {
    return { ok: false, reason: "prerequisite_locked", state, tableItems, remainingCopper: currentCopper };
  }
  const costCopper = KITCHEN_TABLE_UPGRADE_SILVER_COSTS[targetLevel - 1] * COPPER_PER_SILVER;
  if (currentCopper < costCopper) {
    return { ok: false, reason: "insufficient_currency", state, tableItems, remainingCopper: currentCopper };
  }
  const nextState: PostGuestTutorialState = { ...state, kitchenTableUpgradeLevel: targetLevel };
  const nextSlotCount = getKitchenTableSlotCount(nextState);
  tableItems = Array.from({ length: Math.max(nextSlotCount, tableItems.length) }, (_, index) => tableItems[index] ?? null);
  const remainingCopper = currentCopper - costCopper;
  await AsyncStorage.multiSet([
    [POST_GUEST_TUTORIAL_STATE_KEY, JSON.stringify(nextState)],
    [KITCHEN_TABLE_KEY, JSON.stringify(tableItems)],
    [CURRENCY_KEY, String(remainingCopper)],
  ]);
  notifyCurrencyChanged(remainingCopper);
  return { ok: true, alreadyUnlocked: false, state: nextState, tableItems, remainingCopper };
}

export type TavernBeverage = {
  id: "water" | "standard_ale" | "honey_mead";
  name: "Water" | "Standard Ale" | "Honey Mead";
  priceCopper: number;
  alcoholic: boolean;
};

export function isAleServiceAvailable(state: PostGuestTutorialState, calendarDaySerial: number): boolean {
  return state.aleServiceUnlocked &&
    state.aleServiceAvailableDaySerial !== null &&
    calendarDaySerial >= state.aleServiceAvailableDaySerial;
}

export function getTavernBeverage(state: PostGuestTutorialState, calendarDaySerial: number): TavernBeverage {
  if (state.honeyMeadServiceUnlocked) {
    return { id: "honey_mead", name: "Honey Mead", priceCopper: 11, alcoholic: true };
  }
  if (isAleServiceAvailable(state, calendarDaySerial)) {
    return { id: "standard_ale", name: "Standard Ale", priceCopper: 5, alcoholic: true };
  }
  return { id: "water", name: "Water", priceCopper: 1, alcoholic: false };
}

export const ALE_QUEST_ITEMS = [
  { id: "malted_barley", name: "Malted Barley" },
  { id: "brewers_yeast", name: "Brewer's Yeast" },
  { id: "dried_hop_cones", name: "Dried Hop Cones" },
] as const;

export const HONEY_MEAD_QUEST_ITEMS = [
  { id: "raw_wildflower_honey", name: "Raw Wildflower Honey" },
  { id: "mead_yeast", name: "Mead Yeast" },
  { id: "grown_cinnamon_stalks_cloves", name: "Grown Cinnamon Stalks & Cloves" },
  { id: "yeast_nutrients", name: "Yeast Nutrients" },
] as const;

export type TavernDrinkUpgradeId = "serve_ale" | "serve_honey_mead";
export type TavernDrinkUpgradeResult =
  | { ok: true; alreadyUnlocked: boolean; state: PostGuestTutorialState; playerBag: PlayerBagData }
  | {
      ok: false;
      reason: "prerequisite_locked" | "missing_quest_items";
      missingItems: string[];
      state: PostGuestTutorialState;
      playerBag: PlayerBagData;
    };

function countBagItem(bag: PlayerBagData, itemId: string): number {
  const canonicalId = normalizeItemId(itemId);
  return bag.slots.reduce((total, item) => (
    item && normalizeItemId(item.id) === canonicalId ? total + item.quantity : total
  ), 0);
}

function consumeBagItems(playerBag: PlayerBagData, itemIds: readonly string[]): PlayerBagData {
  const remaining = new Map<string, number>();
  for (const itemId of itemIds) remaining.set(normalizeItemId(itemId), (remaining.get(normalizeItemId(itemId)) ?? 0) + 1);
  const slots = playerBag.slots.map((item) => {
    if (!item) return null;
    const canonicalId = normalizeItemId(item.id);
    const needed = remaining.get(canonicalId) ?? 0;
    if (needed <= 0) return item;
    const consumed = Math.min(needed, item.quantity);
    remaining.set(canonicalId, needed - consumed);
    return item.quantity > consumed ? { ...item, quantity: item.quantity - consumed } : null;
  });
  return { ...playerBag, slots };
}

export async function purchaseTavernDrinkUpgrade(upgradeId: TavernDrinkUpgradeId): Promise<TavernDrinkUpgradeResult> {
  const [state, tavernQuests, rawBag, rawGuestState] = await Promise.all([
    loadPostGuestTutorialState(),
    loadTavernQuestState(),
    AsyncStorage.getItem(PLAYER_BAG_KEY),
    AsyncStorage.getItem(GUEST_STATE_KEY),
  ]);
  let playerBag = { ...DEFAULT_BAG, slots: [...DEFAULT_BAG.slots] };
  if (rawBag) {
    try { playerBag = normalizePlayerBagData(JSON.parse(rawBag)); } catch { /* use default */ }
  }
  let calendarDaySerial = 0;
  if (rawGuestState) {
    try { calendarDaySerial = Math.max(0, Math.floor(Number(JSON.parse(rawGuestState).calendarDaySerial) || 0)); } catch { /* first day */ }
  }

  const alreadyUnlocked = upgradeId === "serve_ale" ? state.aleServiceUnlocked : state.honeyMeadServiceUnlocked;
  if (alreadyUnlocked) return { ok: true, alreadyUnlocked: true, state, playerBag };

  const prerequisiteMet = upgradeId === "serve_ale"
    ? isGuestAreaComplete(state) && tavernQuests.claimed.serve_water
    : isAleServiceAvailable(state, calendarDaySerial);
  if (!prerequisiteMet) {
    return { ok: false, reason: "prerequisite_locked", missingItems: [], state, playerBag };
  }

  const requirements = upgradeId === "serve_ale" ? ALE_QUEST_ITEMS : HONEY_MEAD_QUEST_ITEMS;
  const missingItems = requirements.filter((required) => countBagItem(playerBag, required.id) < 1).map((required) => required.name);
  if (missingItems.length > 0) {
    return { ok: false, reason: "missing_quest_items", missingItems, state, playerBag };
  }

  playerBag = consumeBagItems(playerBag, requirements.map((required) => required.id));
  const nextState: PostGuestTutorialState = {
    ...state,
    aleServiceUnlocked: upgradeId === "serve_ale" ? true : state.aleServiceUnlocked,
    aleServiceAvailableDaySerial: upgradeId === "serve_ale"
      ? calendarDaySerial + 1
      : state.aleServiceAvailableDaySerial,
    honeyMeadServiceUnlocked: upgradeId === "serve_honey_mead" ? true : state.honeyMeadServiceUnlocked,
  };
  await AsyncStorage.multiSet([
    [PLAYER_BAG_KEY, JSON.stringify(playerBag)],
    [POST_GUEST_TUTORIAL_STATE_KEY, JSON.stringify(nextState)],
  ]);
  return { ok: true, alreadyUnlocked: false, state: nextState, playerBag };
}

export function isGuestAreaComplete(state: PostGuestTutorialState): boolean {
  return state.guestAreaCleanSteps >= GUEST_AREA_CLEAN_STEPS_REQUIRED;
}

/** Regular guests begin rolling on the day after the cleaning upgrade completes. */
export function areRegularGuestsUnlockedForDay(
  state: PostGuestTutorialState,
  calendarDaySerial: number,
): boolean {
  return isGuestAreaComplete(state) &&
    state.guestAreaCompletedDaySerial !== null &&
    calendarDaySerial > state.guestAreaCompletedDaySerial;
}

export function isPlotUnlocked(state: PostGuestTutorialState, plotNumber: GardenPlotNumber): boolean {
  if (plotNumber === 1) return true;
  if (plotNumber === 2) return state.secondPlotUnlocked;
  if (plotNumber === 3) return state.thirdPlotUnlocked;
  return state.fourthPlotUnlocked;
}

export function areExpandedGuestsUnlockedForDay(
  state: PostGuestTutorialState,
  calendarDaySerial: number,
): boolean {
  return state.tableAndChairsCompletedDaySerial !== null &&
    calendarDaySerial > state.tableAndChairsCompletedDaySerial;
}

export async function loadPostGuestTutorialState(): Promise<PostGuestTutorialState> {
  try {
    const raw = await AsyncStorage.getItem(POST_GUEST_TUTORIAL_STATE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : { ...DEFAULT_POST_GUEST_TUTORIAL_STATE };
  } catch {
    return { ...DEFAULT_POST_GUEST_TUTORIAL_STATE };
  }
}

export async function savePostGuestTutorialState(
  state: PostGuestTutorialState,
): Promise<PostGuestTutorialState> {
  const normalized = normalizeState(state);
  await AsyncStorage.setItem(POST_GUEST_TUTORIAL_STATE_KEY, JSON.stringify(normalized));
  return normalized;
}

/**
 * Give the Old Farmer's tutorial gift exactly once.
 * The seed belongs to Garden seed storage rather than the six-slot Player Bag,
 * matching the existing Garden planting/storage model.
 */
export async function grantFarmerCarrotSeedOnce(): Promise<PostGuestTutorialState> {
  const state = await loadPostGuestTutorialState();
  if (state.farmerGiftClaimed) return state;

  let inventory: GardenInventoryItem[] = [
    { id: "seed_herb", itemType: "seed", name: "Herb Seed", quantity: 5 },
    { id: "standard_fertilizer", itemType: "fertilizer", name: "Standard Fertilizer", quantity: 5 },
  ];
  try {
    const raw = await AsyncStorage.getItem(GARDEN_INVENTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        inventory = parsed.map((item) => item?.itemType === "seed"
          ? { ...item, id: normalizeGardenSeedId(item.id) ?? item.id }
          : item,
        );
      }
    }
  } catch {
    inventory = [
      { id: "seed_herb", itemType: "seed", name: "Herb Seed", quantity: 5 },
      { id: "standard_fertilizer", itemType: "fertilizer", name: "Standard Fertilizer", quantity: 5 },
    ];
  }

  const carrotIndex = inventory.findIndex((item) => item?.id === "seed_carrot" && item.itemType === "seed");
  const nextInventory = inventory.map((item) => ({ ...item }));
  if (carrotIndex >= 0) {
    const current = nextInventory[carrotIndex];
    nextInventory[carrotIndex] = { ...current, quantity: Math.max(0, current.quantity) + 1 };
  } else {
    nextInventory.push({
      id: "seed_carrot",
      itemType: "seed",
      name: "Carrot Seed",
      quantity: 1,
    });
  }

  const nextState: PostGuestTutorialState = { ...state, farmerGiftClaimed: true };
  await AsyncStorage.multiSet([
    [GARDEN_INVENTORY_KEY, JSON.stringify(nextInventory)],
    [POST_GUEST_TUTORIAL_STATE_KEY, JSON.stringify(nextState)],
  ]);
  return nextState;
}

export async function markSecondPlotThoughtSeen(): Promise<PostGuestTutorialState> {
  const state = await loadPostGuestTutorialState();
  if (state.secondPlotThoughtSeen) return state;
  return savePostGuestTutorialState({ ...state, secondPlotThoughtSeen: true });
}

export async function markUpgradeIntroSeen(): Promise<PostGuestTutorialState> {
  const state = await loadPostGuestTutorialState();
  if (state.upgradeIntroSeen) return state;
  return savePostGuestTutorialState({ ...state, upgradeIntroSeen: true });
}

export type SecondPlotPurchaseResult =
  | { ok: true; alreadyUnlocked: boolean; state: PostGuestTutorialState; resources: SharedResources }
  | { ok: false; reason: "insufficient_resources"; state: PostGuestTutorialState; resources: SharedResources };

/** Deduct 4 Wood + 4 Stone and persist the first Garden upgrade atomically. */
export async function purchaseSecondPlotUpgrade(): Promise<SecondPlotPurchaseResult> {
  const state = await loadPostGuestTutorialState();

  let resources = { ...SHARED_RESOURCE_DEFAULTS };
  try {
    const raw = await AsyncStorage.getItem(SHARED_RESOURCES_KEY);
    if (raw) resources = { ...SHARED_RESOURCE_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    resources = { ...SHARED_RESOURCE_DEFAULTS };
  }

  if (state.secondPlotUnlocked) {
    return { ok: true, alreadyUnlocked: true, state, resources };
  }

  if (resources.wood < SECOND_PLOT_WOOD_COST || resources.stone < SECOND_PLOT_STONE_COST) {
    return { ok: false, reason: "insufficient_resources", state, resources };
  }

  const nextResources: SharedResources = {
    ...resources,
    wood: resources.wood - SECOND_PLOT_WOOD_COST,
    stone: resources.stone - SECOND_PLOT_STONE_COST,
  };
  const nextState: PostGuestTutorialState = { ...state, secondPlotUnlocked: true };

  await AsyncStorage.multiSet([
    [SHARED_RESOURCES_KEY, JSON.stringify(nextResources)],
    [POST_GUEST_TUTORIAL_STATE_KEY, JSON.stringify(nextState)],
  ]);

  return { ok: true, alreadyUnlocked: false, state: nextState, resources: nextResources };
}

export type GardenPlotBuildResult =
  | { ok: true; alreadyUnlocked: boolean; state: PostGuestTutorialState; resources: SharedResources }
  | { ok: false; reason: "insufficient_resources" | "prerequisite_locked"; state: PostGuestTutorialState; resources: SharedResources };

export async function purchaseGardenPlotBuild(plotNumber: 2 | 3 | 4): Promise<GardenPlotBuildResult> {
  if (plotNumber === 2) return purchaseSecondPlotUpgrade();
  const state = await loadPostGuestTutorialState();
  let resources = { ...SHARED_RESOURCE_DEFAULTS };
  try {
    const raw = await AsyncStorage.getItem(SHARED_RESOURCES_KEY);
    if (raw) resources = { ...SHARED_RESOURCE_DEFAULTS, ...JSON.parse(raw) };
  } catch { /* keep defaults */ }

  if (isPlotUnlocked(state, plotNumber)) return { ok: true, alreadyUnlocked: true, state, resources };
  if (!isPlotUnlocked(state, (plotNumber - 1) as GardenPlotNumber)) {
    return { ok: false, reason: "prerequisite_locked", state, resources };
  }
  if (resources.wood < LATER_PLOT_WOOD_COST || resources.stone < LATER_PLOT_STONE_COST || resources.nails < LATER_PLOT_NAILS_COST) {
    return { ok: false, reason: "insufficient_resources", state, resources };
  }
  const nextResources = {
    ...resources,
    wood: resources.wood - LATER_PLOT_WOOD_COST,
    stone: resources.stone - LATER_PLOT_STONE_COST,
    nails: resources.nails - LATER_PLOT_NAILS_COST,
  };
  const nextState = {
    ...state,
    thirdPlotUnlocked: plotNumber === 3 ? true : state.thirdPlotUnlocked,
    fourthPlotUnlocked: plotNumber === 4 ? true : state.fourthPlotUnlocked,
  };
  await AsyncStorage.multiSet([
    [SHARED_RESOURCES_KEY, JSON.stringify(nextResources)],
    [POST_GUEST_TUTORIAL_STATE_KEY, JSON.stringify(nextState)],
    [gardenPlotStorageKey(plotNumber), JSON.stringify(createEmptyGardenPlot(plotNumber))],
  ]);
  return { ok: true, alreadyUnlocked: false, state: nextState, resources: nextResources };
}

export type PlotYieldUpgradeResult =
  | { ok: true; alreadyMaxed: boolean; level: number; state: PostGuestTutorialState }
  | { ok: false; reason: "plot_locked" | "insufficient_fertilizer"; level: number; state: PostGuestTutorialState };

export async function purchasePlotYieldUpgrade(plotNumber: GardenPlotNumber): Promise<PlotYieldUpgradeResult> {
  const state = await loadPostGuestTutorialState();
  const plotId = `garden_plot_0${plotNumber}`;
  const level = Math.max(0, Math.min(2, state.plotYieldUpgradeLevels[plotId] ?? 0));
  if (!isPlotUnlocked(state, plotNumber)) return { ok: false, reason: "plot_locked", level, state };
  if (level >= 2) return { ok: true, alreadyMaxed: true, level, state };

  const fertilizerId = level === 0 ? "standard_fertilizer" : "premium_fertilizer";
  const required = level === 0 ? PLOT_STANDARD_FERTILIZER_COST : PLOT_PREMIUM_FERTILIZER_COST;
  const rawInventory = await AsyncStorage.getItem(GARDEN_INVENTORY_KEY);
  const inventory: GardenInventoryItem[] = rawInventory ? JSON.parse(rawInventory) : [];
  const fertilizerIndex = inventory.findIndex((item) => item.id === fertilizerId && item.itemType === "fertilizer");
  if (fertilizerIndex < 0 || inventory[fertilizerIndex].quantity < required) {
    return { ok: false, reason: "insufficient_fertilizer", level, state };
  }

  const nextLevel = level + 1;
  const nextInventory = inventory.map((item) => ({ ...item }));
  nextInventory[fertilizerIndex] = {
    ...nextInventory[fertilizerIndex],
    quantity: nextInventory[fertilizerIndex].quantity - required,
  };
  const nextState = {
    ...state,
    plotYieldUpgradeLevels: { ...state.plotYieldUpgradeLevels, [plotId]: nextLevel },
  };
  const plotKey = gardenPlotStorageKey(plotNumber);
  let plot = createEmptyGardenPlot(plotNumber);
  const rawPlot = await AsyncStorage.getItem(plotKey);
  if (rawPlot) {
    try { plot = { ...plot, ...JSON.parse(rawPlot) }; } catch { /* use empty plot */ }
  }
  plot.yieldUpgradeLevel = nextLevel;
  if (plot.status !== "empty") plot.baseYield = Math.max(plot.baseYield, minimumYieldForUpgradeLevel(nextLevel));
  await AsyncStorage.multiSet([
    [GARDEN_INVENTORY_KEY, JSON.stringify(nextInventory)],
    [POST_GUEST_TUTORIAL_STATE_KEY, JSON.stringify(nextState)],
    [plotKey, JSON.stringify(plot)],
  ]);
  return { ok: true, alreadyMaxed: false, level: nextLevel, state: nextState };
}

export type CleanOutsideTavernResult =
  | { ok: true; alreadyComplete: boolean; completedNow: boolean; staminaCost: number; remainingStamina: number; state: PostGuestTutorialState }
  | { ok: false; reason: "not_available" | "insufficient_stamina"; staminaCost: number; remainingStamina: number; state: PostGuestTutorialState };

export function isOutsideTavernCleanComplete(state: PostGuestTutorialState): boolean {
  return state.outsideCleanSteps >= OUTSIDE_CLEAN_STEPS_REQUIRED;
}

export async function cleanOutsideTavernOnce(): Promise<CleanOutsideTavernResult> {
  const state = await loadPostGuestTutorialState();
  const [rawStamina, rawSpent, rawGuestState] = await Promise.all([
    AsyncStorage.getItem(CURRENT_STAMINA_KEY),
    AsyncStorage.getItem(STAMINA_SPENT_TODAY_KEY),
    AsyncStorage.getItem(GUEST_STATE_KEY),
  ]);
  const currentStamina = Math.max(0, Number.parseInt(rawStamina ?? "0", 10) || 0);
  const staminaCost = OUTSIDE_CLEAN_STAMINA_COST;
  if (isOutsideTavernCleanComplete(state)) {
    return { ok: true, alreadyComplete: true, completedNow: false, staminaCost, remainingStamina: currentStamina, state };
  }
  let calendarDaySerial = 0;
  if (rawGuestState) {
    try { calendarDaySerial = Math.max(0, Math.floor(Number(JSON.parse(rawGuestState).calendarDaySerial) || 0)); } catch { /* default */ }
  }
  if (!isGuestAreaComplete(state) || state.guestAreaCompletedDaySerial === null || calendarDaySerial <= state.guestAreaCompletedDaySerial) {
    return { ok: false, reason: "not_available", staminaCost, remainingStamina: currentStamina, state };
  }
  if (currentStamina < staminaCost) {
    return { ok: false, reason: "insufficient_stamina", staminaCost, remainingStamina: currentStamina, state };
  }
  const nextSteps = Math.min(OUTSIDE_CLEAN_STEPS_REQUIRED, state.outsideCleanSteps + 1);
  const completedNow = nextSteps >= OUTSIDE_CLEAN_STEPS_REQUIRED;
  const remainingStamina = currentStamina - staminaCost;
  const spentToday = Math.max(0, Number.parseInt(rawSpent ?? "0", 10) || 0) + staminaCost;
  const nextState: PostGuestTutorialState = {
    ...state,
    outsideCleanSteps: nextSteps,
    tableAndChairsCompletedDaySerial: completedNow ? calendarDaySerial : null,
  };
  await AsyncStorage.multiSet([
    [POST_GUEST_TUTORIAL_STATE_KEY, JSON.stringify(nextState)],
    [CURRENT_STAMINA_KEY, String(remainingStamina)],
    [STAMINA_SPENT_TODAY_KEY, String(spentToday)],
  ]);
  return { ok: true, alreadyComplete: false, completedNow, staminaCost, remainingStamina, state: nextState };
}

export type CleanGuestAreaResult =
  | {
      ok: true;
      alreadyComplete: boolean;
      completedNow: boolean;
      staminaCost: number;
      remainingStamina: number;
      state: PostGuestTutorialState;
    }
  | {
      ok: false;
      reason: "insufficient_stamina";
      staminaCost: number;
      remainingStamina: number;
      state: PostGuestTutorialState;
    };

/** Complete one of five cleaning actions and persist progress plus Stamina atomically. */
export async function cleanGuestAreaOnce(): Promise<CleanGuestAreaResult> {
  const state = await loadPostGuestTutorialState();
  const [rawStamina, rawSpent, rawStats, rawGuestState] = await Promise.all([
    AsyncStorage.getItem(CURRENT_STAMINA_KEY),
    AsyncStorage.getItem(STAMINA_SPENT_TODAY_KEY),
    AsyncStorage.getItem(PLAYER_STATS_KEY),
    AsyncStorage.getItem(GUEST_STATE_KEY),
  ]);
  const currentStamina = Math.max(0, Number.parseInt(rawStamina ?? "0", 10) || 0);
  let stats = DEFAULT_PLAYER_STATS;
  if (rawStats) {
    try { stats = normalizePlayerStats(JSON.parse(rawStats)); }
    catch { stats = DEFAULT_PLAYER_STATS; }
  }
  const staminaCost = calcEffectiveStaminaCost(
    GUEST_AREA_CLEAN_STAMINA_COST,
    stats.endurance,
    getActiveStaminaBuffReduction(stats),
  );

  if (isGuestAreaComplete(state)) {
    return {
      ok: true,
      alreadyComplete: true,
      completedNow: false,
      staminaCost,
      remainingStamina: currentStamina,
      state,
    };
  }
  if (currentStamina < staminaCost) {
    return {
      ok: false,
      reason: "insufficient_stamina",
      staminaCost,
      remainingStamina: currentStamina,
      state,
    };
  }

  const nextSteps = Math.min(GUEST_AREA_CLEAN_STEPS_REQUIRED, state.guestAreaCleanSteps + 1);
  const completedNow = nextSteps >= GUEST_AREA_CLEAN_STEPS_REQUIRED;
  let calendarDaySerial = 0;
  if (rawGuestState) {
    try {
      const parsed = JSON.parse(rawGuestState) as { calendarDaySerial?: unknown };
      calendarDaySerial = Math.max(0, Math.floor(Number(parsed.calendarDaySerial) || 0));
    } catch { /* default to the first game day */ }
  }
  const nextState: PostGuestTutorialState = {
    ...state,
    guestAreaCleanSteps: nextSteps,
    guestAreaCompletedDaySerial: completedNow ? calendarDaySerial : null,
  };
  const remainingStamina = currentStamina - staminaCost;
  const spentToday = Math.max(0, Number.parseInt(rawSpent ?? "0", 10) || 0) + staminaCost;

  await AsyncStorage.multiSet([
    [POST_GUEST_TUTORIAL_STATE_KEY, JSON.stringify(nextState)],
    [CURRENT_STAMINA_KEY, String(remainingStamina)],
    [STAMINA_SPENT_TODAY_KEY, String(spentToday)],
  ]);

  return {
    ok: true,
    alreadyComplete: false,
    completedNow,
    staminaCost,
    remainingStamina,
    state: nextState,
  };
}
