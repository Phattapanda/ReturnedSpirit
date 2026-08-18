import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  isEdible,
  removeBagItem,
  type BagItem,
  type PlayerBagData,
} from "@/src/game/item-system";

export const DINING_MEAL_STATE_KEY = "@dining:meal_state";
export const DINING_MEAL_SLOT_COUNT = 6;

export type DiningMealState = {
  version: 1;
  slots: (BagItem | null)[];
  activeSlotIndex: number | null;
};

export const DEFAULT_DINING_MEAL_STATE: DiningMealState = {
  version: 1,
  slots: Array(DINING_MEAL_SLOT_COUNT).fill(null),
  activeSlotIndex: null,
};

export type BagToMealSlotResult =
  | {
      ok: true;
      mealState: DiningMealState;
      bag: PlayerBagData;
      targetSlotIndex: number;
    }
  | {
      ok: false;
      reason: "not_edible" | "no_free_slot" | "missing_item";
      mealState: DiningMealState;
      bag: PlayerBagData;
    };

function cloneItem(item: BagItem): BagItem {
  return {
    ...item,
    attributes: item.attributes ? [...item.attributes] : undefined,
    mealTags: item.mealTags ? [...item.mealTags] : undefined,
  };
}

function normalizeMealState(raw: unknown): DiningMealState {
  if (!raw || typeof raw !== "object") {
    return {
      ...DEFAULT_DINING_MEAL_STATE,
      slots: [...DEFAULT_DINING_MEAL_STATE.slots],
    };
  }

  const candidate = raw as Partial<DiningMealState>;
  const rawSlots = Array.isArray(candidate.slots) ? candidate.slots : [];
  const slots: (BagItem | null)[] = Array.from({ length: DINING_MEAL_SLOT_COUNT }, (_, index) => {
    const slot = rawSlots[index];
    if (!slot || typeof slot !== "object") return null;
    const item = slot as BagItem;
    if (!item.id || !item.name || !Number.isFinite(Number(item.quantity))) return null;
    return { ...cloneItem(item), quantity: 1 };
  });

  const hasActiveCandidate = candidate.activeSlotIndex !== null && candidate.activeSlotIndex !== undefined;
  const activeCandidate = hasActiveCandidate ? Number(candidate.activeSlotIndex) : NaN;
  const activeSlotIndex =
    Number.isInteger(activeCandidate) &&
    activeCandidate >= 0 &&
    activeCandidate < DINING_MEAL_SLOT_COUNT &&
    slots[activeCandidate] !== null
      ? activeCandidate
      : null;

  return {
    version: 1,
    slots,
    activeSlotIndex,
  };
}

export async function loadDiningMealState(): Promise<DiningMealState> {
  try {
    const raw = await AsyncStorage.getItem(DINING_MEAL_STATE_KEY);
    if (!raw) {
      return {
        ...DEFAULT_DINING_MEAL_STATE,
        slots: [...DEFAULT_DINING_MEAL_STATE.slots],
      };
    }
    return normalizeMealState(JSON.parse(raw));
  } catch {
    return {
      ...DEFAULT_DINING_MEAL_STATE,
      slots: [...DEFAULT_DINING_MEAL_STATE.slots],
    };
  }
}

export async function saveDiningMealState(state: DiningMealState): Promise<DiningMealState> {
  const normalized = normalizeMealState(state);
  await AsyncStorage.setItem(DINING_MEAL_STATE_KEY, JSON.stringify(normalized));
  return normalized;
}

/**
 * Move exactly one serving from a Player Bag stack into the first empty Meal Slot.
 * Meal slots intentionally hold individual servings rather than stacks.
 */
export function planBagItemToMealSlot(
  bag: PlayerBagData,
  bagSlotIndex: number,
  mealState: DiningMealState,
): BagToMealSlotResult {
  const item = bag.slots[bagSlotIndex] ?? null;
  if (!item) {
    return { ok: false, reason: "missing_item", mealState, bag };
  }

  if (!isEdible(item)) {
    return { ok: false, reason: "not_edible", mealState, bag };
  }

  const targetSlotIndex = mealState.slots.findIndex((slot) => slot === null);
  if (targetSlotIndex < 0) {
    return { ok: false, reason: "no_free_slot", mealState, bag };
  }

  const nextSlots = mealState.slots.map((slot) => slot ? cloneItem(slot) : null);
  nextSlots[targetSlotIndex] = { ...cloneItem(item), quantity: 1 };

  return {
    ok: true,
    targetSlotIndex,
    bag: removeBagItem(bag, bagSlotIndex, 1),
    mealState: {
      version: 1,
      slots: nextSlots,
      activeSlotIndex: targetSlotIndex,
    },
  };
}

export function selectActiveMealSlot(
  state: DiningMealState,
  slotIndex: number,
): DiningMealState {
  if (slotIndex < 0 || slotIndex >= state.slots.length || !state.slots[slotIndex]) return state;
  return { ...state, activeSlotIndex: slotIndex };
}
