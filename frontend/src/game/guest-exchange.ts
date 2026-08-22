import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  DEFAULT_BAG,
  ITEM_CATALOG,
  PLAYER_BAG_KEY,
  planAddToBag,
  type BagItem,
  type PlayerBagData,
} from "@/src/game/item-system";
import {
  GUEST_STATE_KEY,
  loadGuestState,
  normalizeGuestExchangeItemId,
  type GuestExchangeOffer,
  type GuestId,
} from "@/src/game/guest-system";
import {
  SHARED_RESOURCE_DEFAULTS,
  SHARED_RESOURCES_KEY,
  type ResourceId,
  type SharedResources,
} from "@/src/game/shared-resources";

const GARDEN_INVENTORY_KEY = "@garden:inventory";

type GardenInventoryItem = {
  id: string;
  itemType: string;
  name: string;
  quantity: number;
};

export type GuestExchangeDestination = "player_bag" | "garden_storage";

export type GuestExchangeResult =
  | {
      ok: true;
      destination: GuestExchangeDestination;
      item: BagItem;
      playerBag: PlayerBagData | null;
    }
  | {
      ok: false;
      reason: "offer_unavailable" | "bag_locked" | "bag_full" | "storage_error";
    };

const MATERIAL_IDS = new Set<ResourceId>(["wood", "nails", "stone", "cloth", "paint"]);
let exchangeQueue: Promise<void> = Promise.resolve();

function normalizeBag(raw: string | null): PlayerBagData {
  if (!raw) return { ...DEFAULT_BAG, slots: [...DEFAULT_BAG.slots] };
  try {
    const parsed = JSON.parse(raw) as Partial<PlayerBagData>;
    const slotCount = Math.max(1, Number(parsed.slotCount) || DEFAULT_BAG.slotCount);
    return {
      ...DEFAULT_BAG,
      ...parsed,
      slotCount,
      slots: Array.from({ length: slotCount }, (_, index) => parsed.slots?.[index] ?? null),
    };
  } catch {
    return { ...DEFAULT_BAG, slots: [...DEFAULT_BAG.slots] };
  }
}

function exchangeItem(offer: GuestExchangeOffer): BagItem {
  const id = normalizeGuestExchangeItemId(offer.itemId);
  const catalog = ITEM_CATALOG[id];
  const itemType = id.startsWith("seed_")
    ? "seed"
    : id.endsWith("_fertilizer")
      ? "fertilizer"
      : id;
  return {
    id,
    itemType,
    name: catalog?.name ?? offer.name,
    quantity: Math.max(1, Math.floor(offer.quantity)),
    attributes: catalog?.attributes ? [...catalog.attributes] : undefined,
    consumableCategory: catalog?.consumableCategory,
  };
}

function isGardenInventoryItem(item: BagItem): boolean {
  return item.itemType === "seed" || item.itemType === "fertilizer";
}

function isMaterialId(itemId: string): itemId is ResourceId {
  return MATERIAL_IDS.has(itemId as ResourceId);
}

function normalizeGardenInventory(raw: string | null): GardenInventoryItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is GardenInventoryItem => (
        !!item && typeof item.id === "string" && typeof item.name === "string" && Number(item.quantity) >= 0
      ))
      .map((item) => ({
        ...item,
        id: normalizeGuestExchangeItemId(item.id),
        quantity: Math.max(0, Math.floor(Number(item.quantity) || 0)),
      }));
  } catch {
    return [];
  }
}

function addToGardenInventory(inventory: GardenInventoryItem[], item: BagItem): GardenInventoryItem[] {
  const next = inventory.map((entry) => ({ ...entry }));
  const index = next.findIndex((entry) => entry.id === item.id && entry.itemType === item.itemType);
  if (index >= 0) {
    next[index] = { ...next[index], quantity: next[index].quantity + item.quantity };
  } else {
    next.push({ id: item.id, itemType: item.itemType, name: item.name, quantity: item.quantity });
  }
  return next;
}

function normalizeSharedResources(raw: string | null): SharedResources {
  if (!raw) return { ...SHARED_RESOURCE_DEFAULTS };
  try {
    const parsed = JSON.parse(raw) as Partial<SharedResources>;
    return Object.fromEntries(
      Object.keys(SHARED_RESOURCE_DEFAULTS).map((id) => [
        id,
        Math.max(0, Math.floor(Number(parsed[id as ResourceId]) || 0)),
      ]),
    ) as SharedResources;
  } catch {
    return { ...SHARED_RESOURCE_DEFAULTS };
  }
}

export function completeGuestExchange(
  guestId: GuestId,
  expectedOffer: GuestExchangeOffer,
  additionalWrites: readonly [string, string][] = [],
): Promise<GuestExchangeResult> {
  const operation = exchangeQueue.then(async (): Promise<GuestExchangeResult> => {
    try {
      const state = await loadGuestState();
      const trade = state.visitTrades[guestId];
      const expectedId = normalizeGuestExchangeItemId(expectedOffer.itemId);
      if (
        !trade ||
        trade.claimed ||
        trade.daySerial !== state.calendarDaySerial ||
        normalizeGuestExchangeItemId(trade.offer.itemId) !== expectedId ||
        trade.offer.quantity !== expectedOffer.quantity
      ) {
        return { ok: false, reason: "offer_unavailable" };
      }

      const item = exchangeItem(trade.offer);
      const nextTrades = {
        ...state.visitTrades,
        [guestId]: { ...trade, claimed: true },
      };
      const writes: [string, string][] = [
        [GUEST_STATE_KEY, JSON.stringify({ ...state, visitTrades: nextTrades })],
        ...additionalWrites,
      ];
      let destination: GuestExchangeDestination = "player_bag";
      let nextPlayerBag: PlayerBagData | null = null;

      if (isGardenInventoryItem(item)) {
        destination = "garden_storage";
        const inventory = normalizeGardenInventory(await AsyncStorage.getItem(GARDEN_INVENTORY_KEY));
        writes.push([GARDEN_INVENTORY_KEY, JSON.stringify(addToGardenInventory(inventory, item))]);
      } else if (isMaterialId(item.id)) {
        destination = "garden_storage";
        const resources = normalizeSharedResources(await AsyncStorage.getItem(SHARED_RESOURCES_KEY));
        writes.push([
          SHARED_RESOURCES_KEY,
          JSON.stringify({ ...resources, [item.id]: resources[item.id] + item.quantity }),
        ]);
      } else {
        const bag = normalizeBag(await AsyncStorage.getItem(PLAYER_BAG_KEY));
        if (!bag.unlocked) return { ok: false, reason: "bag_locked" };
        const plan = planAddToBag(item, bag);
        if (!plan.canTransfer || plan.remainderQty > 0) return { ok: false, reason: "bag_full" };
        nextPlayerBag = { ...bag, slots: plan.updatedSlots };
        writes.push([PLAYER_BAG_KEY, JSON.stringify(nextPlayerBag)]);
      }

      await AsyncStorage.multiSet(writes);
      return { ok: true, destination, item, playerBag: nextPlayerBag };
    } catch {
      return { ok: false, reason: "storage_error" };
    }
  });
  exchangeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}
