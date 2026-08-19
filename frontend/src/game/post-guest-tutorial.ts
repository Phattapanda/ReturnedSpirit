import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  SHARED_RESOURCE_DEFAULTS,
  SHARED_RESOURCES_KEY,
  type SharedResources,
} from "@/src/game/shared-resources";

export const POST_GUEST_TUTORIAL_STATE_KEY = "@tutorial:post_guest_state";
const GARDEN_INVENTORY_KEY = "@garden:inventory";

export const SECOND_PLOT_WOOD_COST = 4;
export const SECOND_PLOT_STONE_COST = 4;

export type PostGuestTutorialState = {
  version: 1;
  farmerGiftClaimed: boolean;
  secondPlotThoughtSeen: boolean;
  upgradeIntroSeen: boolean;
  secondPlotUnlocked: boolean;
};

export const DEFAULT_POST_GUEST_TUTORIAL_STATE: PostGuestTutorialState = {
  version: 1,
  farmerGiftClaimed: false,
  secondPlotThoughtSeen: false,
  upgradeIntroSeen: false,
  secondPlotUnlocked: false,
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
  return {
    version: 1,
    farmerGiftClaimed: candidate.farmerGiftClaimed === true,
    secondPlotThoughtSeen: candidate.secondPlotThoughtSeen === true,
    upgradeIntroSeen: candidate.upgradeIntroSeen === true,
    secondPlotUnlocked: candidate.secondPlotUnlocked === true,
  };
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

  let inventory: GardenInventoryItem[] = [];
  try {
    const raw = await AsyncStorage.getItem(GARDEN_INVENTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) inventory = parsed;
    }
  } catch {
    inventory = [];
  }

  const carrotIndex = inventory.findIndex((item) => item?.id === "carrotseed" && item.itemType === "seed");
  const nextInventory = inventory.map((item) => ({ ...item }));
  if (carrotIndex >= 0) {
    const current = nextInventory[carrotIndex];
    nextInventory[carrotIndex] = { ...current, quantity: Math.max(0, current.quantity) + 1 };
  } else {
    nextInventory.push({
      id: "carrotseed",
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
