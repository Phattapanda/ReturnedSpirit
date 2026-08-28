import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  getContainerStackLimit,
  normalizeBagItem,
  planAddToBag,
  type BagItem,
  type PlayerBagData,
} from "@/src/game/item-system";

export const KITCHEN_SMALL_CRATE_KEY = "@kitchen:small_crate";
export const SMALL_CRATE_SLOT_COUNT = 6;

export type SmallCrateState = {
  version: 1;
  owned: boolean;
  slots: (BagItem | null)[];
};

export const DEFAULT_SMALL_CRATE_STATE: SmallCrateState = {
  version: 1,
  owned: false,
  slots: Array(SMALL_CRATE_SLOT_COUNT).fill(null),
};

export function normalizeSmallCrateState(value: Partial<SmallCrateState> | null | undefined): SmallCrateState {
  const parsedSlots = Array.isArray(value?.slots) ? value.slots : [];
  return {
    version: 1,
    owned: value?.owned === true,
    slots: Array.from(
      { length: SMALL_CRATE_SLOT_COUNT },
      (_, index) => normalizeBagItem(parsedSlots[index] ?? null),
    ),
  };
}

export async function loadSmallCrateState(): Promise<SmallCrateState> {
  try {
    const raw = await AsyncStorage.getItem(KITCHEN_SMALL_CRATE_KEY);
    return normalizeSmallCrateState(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeSmallCrateState(null);
  }
}

export async function saveSmallCrateState(state: SmallCrateState): Promise<SmallCrateState> {
  const normalized = normalizeSmallCrateState(state);
  await AsyncStorage.setItem(KITCHEN_SMALL_CRATE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function createSmallCrateItem(): BagItem {
  return {
    id: "crate1",
    itemType: "crate1",
    name: "Small Crate",
    quantity: 1,
    attributes: ["storage"],
  };
}

export function addItemToSmallCrate(item: BagItem, state: SmallCrateState) {
  const normalized = normalizeSmallCrateState(state);
  if (!normalized.owned || item.id === "crate1") {
    return { transferred: 0, remainder: item.quantity, state: normalized };
  }
  const crateAsBag: PlayerBagData = {
    bagId: "crate1",
    level: 1,
    rows: 2,
    columns: 3,
    slotCount: SMALL_CRATE_SLOT_COUNT,
    maxStackSize: 9,
    unlocked: true,
    slots: normalized.slots,
  };
  const plan = planAddToBag(item, crateAsBag);
  return {
    transferred: plan.transferQty,
    remainder: plan.remainderQty,
    state: { ...normalized, slots: plan.updatedSlots },
  };
}

export function moveCrateSlotToKitchen(
  crateSlotIndex: number,
  state: SmallCrateState,
  kitchenSlots: (BagItem | null)[],
) {
  const normalized = normalizeSmallCrateState(state);
  const item = normalized.slots[crateSlotIndex] ?? null;
  if (!item) return { transferred: 0, state: normalized, kitchenSlots: [...kitchenSlots] };

  const kitchenAsBag: PlayerBagData = {
    bagId: "kitchen-table",
    level: 1,
    rows: 2,
    columns: 6,
    slotCount: kitchenSlots.length,
    maxStackSize: getContainerStackLimit("kitchenTable"),
    unlocked: true,
    slots: kitchenSlots,
  };
  const plan = planAddToBag(item, kitchenAsBag);
  const nextCrateSlots = [...normalized.slots];
  nextCrateSlots[crateSlotIndex] = plan.remainderQty > 0
    ? { ...item, quantity: plan.remainderQty }
    : null;
  return {
    transferred: plan.transferQty,
    state: { ...normalized, slots: nextCrateSlots },
    kitchenSlots: plan.updatedSlots,
  };
}
