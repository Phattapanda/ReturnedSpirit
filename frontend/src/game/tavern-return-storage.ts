import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  DEFAULT_BAG,
  ITEM_CATALOG,
  PLAYER_BAG_KEY,
  normalizePlayerBagData,
  type BagItem,
  type PlayerBagData,
} from "@/src/game/item-system";
import {
  CORE_MATERIAL_IDS,
  SHARED_RESOURCE_DEFAULTS,
  SHARED_RESOURCES_KEY,
  type ResourceId,
  type SharedResources,
} from "@/src/game/shared-resources";

export const GARDEN_INVENTORY_KEY = "@garden:inventory";

export type GardenInventoryItem = {
  id: string;
  itemType: string;
  name: string;
  quantity: number;
};

export type TavernReturnStoragePlan = {
  bag: PlayerBagData;
  gardenInventory: GardenInventoryItem[];
  sharedResources: SharedResources;
  storedQuantity: number;
};

const CORE_MATERIAL_ID_SET = new Set<ResourceId>(CORE_MATERIAL_IDS);
const GARDEN_RETURN_SEED_IDS = new Set(["seed_herb", "seed_carrot", "seed_potato", "seed_onion"]);
let storageQueue: Promise<void> = Promise.resolve();

function isCoreMaterialId(id: string): id is ResourceId {
  return CORE_MATERIAL_ID_SET.has(id as ResourceId);
}

export function normalizeSharedResources(value: unknown): SharedResources {
  let candidate = value;
  if (typeof value === "string") {
    try { candidate = JSON.parse(value); } catch { candidate = null; }
  }
  const parsed = candidate && typeof candidate === "object"
    ? candidate as Partial<SharedResources>
    : SHARED_RESOURCE_DEFAULTS;
  return Object.fromEntries(CORE_MATERIAL_IDS.map((id) => [
    id,
    Math.max(0, Math.floor(Number(parsed[id]) || 0)),
  ])) as SharedResources;
}

export function normalizeGardenInventory(value: unknown): GardenInventoryItem[] {
  let candidate = value;
  if (typeof value === "string") {
    try { candidate = JSON.parse(value); } catch { candidate = null; }
  }
  if (!Array.isArray(candidate)) return [];
  return candidate
    .filter((item): item is GardenInventoryItem => (
      !!item
      && typeof item.id === "string"
      && typeof item.itemType === "string"
      && typeof item.name === "string"
      && Number(item.quantity) > 0
    ))
    .map((item) => ({ ...item, quantity: Math.floor(Number(item.quantity)) }));
}

function addGardenItem(inventory: GardenInventoryItem[], item: BagItem): void {
  const existing = inventory.find((entry) => entry.id === item.id && entry.itemType === item.itemType);
  if (existing) {
    existing.quantity += item.quantity;
    return;
  }
  inventory.push({
    id: item.id,
    itemType: item.itemType,
    name: ITEM_CATALOG[item.id]?.name ?? item.name,
    quantity: item.quantity,
  });
}

/**
 * Moves only construction materials and seeds out of the player bag when an
 * expedition or city visit ends. Monster drops, ores, ingots, ingredients,
 * equipment, and every other item remain in the player's bag.
 */
export function planTavernReturnStorage(
  playerBag: PlayerBagData,
  currentSharedResources: SharedResources,
  currentGardenInventory: GardenInventoryItem[],
): TavernReturnStoragePlan {
  const sharedResources = { ...currentSharedResources };
  const gardenInventory: GardenInventoryItem[] = [];
  let storedQuantity = 0;

  // Older dungeon returns placed construction materials in @garden:inventory.
  // Fold those entries into the visible shared Materials counts on the next return.
  for (const item of currentGardenInventory) {
    if (isCoreMaterialId(item.id)) {
      sharedResources[item.id] += item.quantity;
      storedQuantity += item.quantity;
    } else {
      gardenInventory.push({ ...item });
    }
  }

  const slots = playerBag.slots.map((item) => {
    if (!item || item.id === "monster_carcass") return item;
    if (!isCoreMaterialId(item.id) && !GARDEN_RETURN_SEED_IDS.has(item.id)) return item;

    if (isCoreMaterialId(item.id)) sharedResources[item.id] += item.quantity;
    else addGardenItem(gardenInventory, item);
    storedQuantity += item.quantity;
    return null;
  });

  return {
    bag: { ...playerBag, slots },
    gardenInventory,
    sharedResources,
    storedQuantity,
  };
}

export function storePlayerBagMaterialsForTavernReturn(): Promise<TavernReturnStoragePlan> {
  const operation = storageQueue.then(async () => {
    const entries = await AsyncStorage.multiGet([
      PLAYER_BAG_KEY,
      SHARED_RESOURCES_KEY,
      GARDEN_INVENTORY_KEY,
    ]);
    const rawBag = entries[0][1];
    const bag = rawBag
      ? normalizePlayerBagData(JSON.parse(rawBag))
      : { ...DEFAULT_BAG, slots: [...DEFAULT_BAG.slots] };
    const plan = planTavernReturnStorage(
      bag,
      normalizeSharedResources(entries[1][1]),
      normalizeGardenInventory(entries[2][1]),
    );
    await AsyncStorage.multiSet([
      [PLAYER_BAG_KEY, JSON.stringify(plan.bag)],
      [SHARED_RESOURCES_KEY, JSON.stringify(plan.sharedResources)],
      [GARDEN_INVENTORY_KEY, JSON.stringify(plan.gardenInventory)],
    ]);
    return plan;
  });
  storageQueue = operation.then(() => undefined, () => undefined);
  return operation;
}
