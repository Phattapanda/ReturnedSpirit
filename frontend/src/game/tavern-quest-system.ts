import AsyncStorage from "@react-native-async-storage/async-storage";

import { addCurrencyCopper } from "@/src/game/currency-system";
import {
  DEFAULT_BAG,
  PLAYER_BAG_KEY,
  normalizePlayerBagData,
  planAddToBag,
  type BagItem,
} from "@/src/game/item-system";
import { GARDEN_INVENTORY_KEY, normalizeGardenInventory } from "@/src/game/tavern-return-storage";

export const TAVERN_QUEST_STATE_KEY = "@game:tavern_quests";

export type TavernQuestId = "clean_guest_area" | "build_second_plot" | "serve_food" | "serve_water";
export type BrewQuestItemId = "dried_hop_cones" | "malted_barley" | "brewers_yeast";

export type TavernQuestState = {
  version: 1;
  claimed: Record<TavernQuestId, boolean>;
  foodServed: number;
  waterServed: number;
  cleanRewardSynchronized: boolean;
  purchasedBrewItems: Partial<Record<BrewQuestItemId, boolean>>;
};

export const DEFAULT_TAVERN_QUEST_STATE: TavernQuestState = {
  version: 1,
  claimed: {
    clean_guest_area: false,
    build_second_plot: false,
    serve_food: false,
    serve_water: false,
  },
  foodServed: 0,
  waterServed: 0,
  cleanRewardSynchronized: false,
  purchasedBrewItems: {},
};

const listeners = new Set<(state: TavernQuestState) => void>();
let writeQueue: Promise<unknown> = Promise.resolve();

function normalizeState(raw: unknown): TavernQuestState {
  const value = raw && typeof raw === "object" ? raw as Partial<TavernQuestState> : {};
  const claimed: Partial<Record<TavernQuestId, boolean>> = value.claimed && typeof value.claimed === "object" ? value.claimed : {};
  return {
    version: 1,
    claimed: {
      clean_guest_area: claimed.clean_guest_area === true,
      build_second_plot: claimed.build_second_plot === true,
      serve_food: claimed.serve_food === true,
      serve_water: claimed.serve_water === true,
    },
    foodServed: Math.min(5, Math.max(0, Math.floor(Number(value.foodServed) || 0))),
    waterServed: Math.min(5, Math.max(0, Math.floor(Number(value.waterServed) || 0))),
    cleanRewardSynchronized: value.cleanRewardSynchronized === true,
    purchasedBrewItems: {
      dried_hop_cones: value.purchasedBrewItems?.dried_hop_cones === true,
      malted_barley: value.purchasedBrewItems?.malted_barley === true,
      brewers_yeast: value.purchasedBrewItems?.brewers_yeast === true,
    },
  };
}

export async function loadTavernQuestState(): Promise<TavernQuestState> {
  try {
    const raw = await AsyncStorage.getItem(TAVERN_QUEST_STATE_KEY);
    return normalizeState(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeState(null);
  }
}

async function saveState(state: TavernQuestState): Promise<TavernQuestState> {
  const normalized = normalizeState(state);
  await AsyncStorage.setItem(TAVERN_QUEST_STATE_KEY, JSON.stringify(normalized));
  listeners.forEach((listener) => listener(normalized));
  return normalized;
}

export function subscribeTavernQuests(listener: (state: TavernQuestState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function notifyTavernQuestPrerequisitesChanged(): Promise<void> {
  const state = await loadTavernQuestState();
  listeners.forEach((listener) => listener(state));
}

export function recordTavernService(kind: "food" | "water"): Promise<TavernQuestState> {
  const task = writeQueue.then(async () => {
    const state = await loadTavernQuestState();
    if (kind === "food" && state.claimed.clean_guest_area && !state.claimed.serve_food) {
      return saveState({ ...state, foodServed: Math.min(5, state.foodServed + 1) });
    }
    if (kind === "water" && state.claimed.serve_food && !state.claimed.serve_water) {
      return saveState({ ...state, waterServed: Math.min(5, state.waterServed + 1) });
    }
    return state;
  });
  writeQueue = task.catch(() => undefined);
  return task;
}

export type ClaimTavernQuestResult =
  | { ok: true; state: TavernQuestState; reward: "potion" | "carrot_seed" | "copper" | "ale_upgrade"; playerBag?: ReturnType<typeof normalizePlayerBagData> }
  | { ok: false; reason: "bag_full" | "not_ready"; state: TavernQuestState };

export async function claimTavernQuest(id: TavernQuestId): Promise<ClaimTavernQuestResult> {
  const state = await loadTavernQuestState();
  if (state.claimed[id]) return { ok: false, reason: "not_ready", state };

  if (id === "clean_guest_area") {
    const rawBag = await AsyncStorage.getItem(PLAYER_BAG_KEY);
    const bag = rawBag ? normalizePlayerBagData(JSON.parse(rawBag)) : { ...DEFAULT_BAG, slots: [...DEFAULT_BAG.slots] };
    const reward: BagItem = { id: "potion_stamina_low_grade", itemType: "consumable", name: "Low Grade Stamina Potion", quantity: 1 };
    const plan = planAddToBag(reward, bag);
    if (!plan.canTransfer || plan.remainderQty > 0) return { ok: false, reason: "bag_full", state };
    const next = { ...state, cleanRewardSynchronized: true, claimed: { ...state.claimed, clean_guest_area: true } };
    const nextBag = { ...bag, slots: plan.updatedSlots };
    await AsyncStorage.multiSet([
      [PLAYER_BAG_KEY, JSON.stringify(nextBag)],
      [TAVERN_QUEST_STATE_KEY, JSON.stringify(next)],
    ]);
    listeners.forEach((listener) => listener(next));
    return { ok: true, state: next, reward: "potion", playerBag: nextBag };
  }

  if (id === "build_second_plot") {
    const inventory = normalizeGardenInventory(await AsyncStorage.getItem(GARDEN_INVENTORY_KEY));
    const existing = inventory.find((item) => item.id === "seed_carrot");
    if (existing) existing.quantity += 1;
    else inventory.push({ id: "seed_carrot", itemType: "seed", name: "Carrot Seed", quantity: 1 });
    const next = { ...state, claimed: { ...state.claimed, build_second_plot: true } };
    await AsyncStorage.multiSet([
      [GARDEN_INVENTORY_KEY, JSON.stringify(inventory)],
      [TAVERN_QUEST_STATE_KEY, JSON.stringify(next)],
    ]);
    listeners.forEach((listener) => listener(next));
    return { ok: true, state: next, reward: "carrot_seed" };
  }

  if (id === "serve_food" && state.foodServed >= 5 && state.claimed.clean_guest_area) {
    const next = { ...state, claimed: { ...state.claimed, serve_food: true } };
    await saveState(next);
    await addCurrencyCopper(25);
    return { ok: true, state: next, reward: "copper" };
  }

  if (id === "serve_water" && state.waterServed >= 5 && state.claimed.serve_food) {
    const next = { ...state, claimed: { ...state.claimed, serve_water: true } };
    await saveState(next);
    return { ok: true, state: next, reward: "ale_upgrade" };
  }

  return { ok: false, reason: "not_ready", state };
}

export async function markBrewQuestItemPurchased(id: BrewQuestItemId): Promise<TavernQuestState> {
  const state = await loadTavernQuestState();
  return saveState({ ...state, purchasedBrewItems: { ...state.purchasedBrewItems, [id]: true } });
}

/** Repairs saves produced before quest rewards updated the live room inventory. */
export async function repairLegacyCleanQuestReward(): Promise<ReturnType<typeof normalizePlayerBagData> | null> {
  const state = await loadTavernQuestState();
  if (!state.claimed.clean_guest_area || state.cleanRewardSynchronized) return null;
  const rawBag = await AsyncStorage.getItem(PLAYER_BAG_KEY);
  const bag = rawBag ? normalizePlayerBagData(JSON.parse(rawBag)) : { ...DEFAULT_BAG, slots: [...DEFAULT_BAG.slots] };
  const alreadyPresent = bag.slots.some((item) => item?.id === "potion_stamina_low_grade");
  let nextBag = bag;
  if (!alreadyPresent) {
    const reward: BagItem = { id: "potion_stamina_low_grade", itemType: "consumable", name: "Low Grade Stamina Potion", quantity: 1 };
    const plan = planAddToBag(reward, bag);
    if (!plan.canTransfer || plan.remainderQty > 0) return null;
    nextBag = { ...bag, slots: plan.updatedSlots };
  }
  const nextState = { ...state, cleanRewardSynchronized: true };
  await AsyncStorage.multiSet([[PLAYER_BAG_KEY, JSON.stringify(nextBag)], [TAVERN_QUEST_STATE_KEY, JSON.stringify(nextState)]]);
  listeners.forEach((listener) => listener(nextState));
  return nextBag;
}

export function isAleUpgradeQuestUnlocked(state: TavernQuestState): boolean {
  return state.claimed.serve_water;
}
