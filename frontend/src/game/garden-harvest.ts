import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  DEFAULT_BAG,
  PLAYER_BAG_KEY,
  planAddToNextFreeBagSlot,
  type BagItem,
  type PlayerBagData,
} from "@/src/game/item-system";

export type HarvestBagCommitResult =
  | { ok: true; bag: PlayerBagData; slotIndex: number }
  | { ok: false; reason: "bag_locked" | "bag_full"; bag: PlayerBagData };

type StorageEntry = [key: string, value: string];

// Both Garden plots can finish a harvest while the first plot's fly animation
// is still running. Serialize the read/modify/write section so neither harvest
// can persist a stale Bag snapshot over the other one.
let harvestCommitQueue: Promise<void> = Promise.resolve();

function normalizeBag(raw: string | null): PlayerBagData {
  if (!raw) {
    return { ...DEFAULT_BAG, slots: [...DEFAULT_BAG.slots] };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PlayerBagData>;
    const slotCount = Number.isInteger(parsed.slotCount) && (parsed.slotCount ?? 0) > 0
      ? parsed.slotCount!
      : DEFAULT_BAG.slotCount;
    const parsedSlots = Array.isArray(parsed.slots) ? parsed.slots : [];
    const slots = Array.from({ length: slotCount }, (_, index) => {
      const item = parsedSlots[index];
      return item && typeof item === "object" ? { ...item } : null;
    });

    return { ...DEFAULT_BAG, ...parsed, slotCount, slots };
  } catch {
    return { ...DEFAULT_BAG, slots: [...DEFAULT_BAG.slots] };
  }
}

/**
 * Put one harvested container into the next free Bag slot and persist any plot
 * reset entries in the same AsyncStorage batch. Harvest bags intentionally do
 * not stack: each harvest gets its own visible slot.
 */
export function commitHarvestBag(
  item: BagItem,
  additionalEntries: StorageEntry[],
): Promise<HarvestBagCommitResult> {
  const operation = harvestCommitQueue.then(async () => {
    const bag = normalizeBag(await AsyncStorage.getItem(PLAYER_BAG_KEY));
    const placement = planAddToNextFreeBagSlot(item, bag);
    if (!placement.ok) return { ok: false, reason: placement.reason, bag } as const;

    const nextBag: PlayerBagData = { ...bag, slots: placement.updatedSlots };

    await AsyncStorage.multiSet([
      [PLAYER_BAG_KEY, JSON.stringify(nextBag)],
      ...additionalEntries,
    ]);
    return { ok: true, bag: nextBag, slotIndex: placement.slotIndex } as const;
  });

  harvestCommitQueue = operation.then(() => undefined, () => undefined);
  return operation;
}
