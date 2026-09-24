import {
  ITEM_ATTRIBUTE,
  ITEM_CATALOG,
  getItemAttributes,
  isConsumable,
  isEdible,
  type BagItem,
} from "@/src/game/item-system";

export type InventorySortMode = "type" | "alphabetical";

function itemDisplayName(item: BagItem): string {
  return (ITEM_CATALOG[item.id]?.name ?? item.name ?? item.id).trim();
}

function itemTypeRank(item: BagItem): number {
  const attributes = getItemAttributes(item);

  if (isEdible(item)) return 0;
  if (isConsumable(item)) return 1;
  if (
    item.id.endsWith("_scroll") ||
    attributes.includes(ITEM_ATTRIBUTE.WEAPON) ||
    attributes.includes(ITEM_ATTRIBUTE.ARMOR) ||
    attributes.includes(ITEM_ATTRIBUTE.TOOL)
  ) return 2;
  if (attributes.includes(ITEM_ATTRIBUTE.INGREDIENT)) return 3;
  if (item.id === "monster_carcass") return 5;
  if (attributes.includes(ITEM_ATTRIBUTE.MATERIAL)) return 4;
  if (attributes.includes(ITEM_ATTRIBUTE.QUEST_ITEM)) return 6;
  if (attributes.includes(ITEM_ATTRIBUTE.STORAGE)) return 7;
  return 8;
}

/** Sort occupied slots without merging or modifying stacks; empty slots stay at the end. */
export function sortInventorySlots(
  slots: readonly (BagItem | null)[],
  mode: InventorySortMode,
): (BagItem | null)[] {
  const occupied = slots
    .map((item, originalIndex) => ({ item, originalIndex }))
    .filter((entry): entry is { item: BagItem; originalIndex: number } => entry.item !== null);

  occupied.sort((left, right) => {
    if (mode === "type") {
      const rankDifference = itemTypeRank(left.item) - itemTypeRank(right.item);
      if (rankDifference !== 0) return rankDifference;
    }

    const nameDifference = itemDisplayName(left.item).localeCompare(
      itemDisplayName(right.item),
      "en",
      { sensitivity: "base", numeric: true },
    );
    return nameDifference || left.originalIndex - right.originalIndex;
  });

  return [
    ...occupied.map(({ item }) => item),
    ...Array<BagItem | null>(slots.length - occupied.length).fill(null),
  ];
}

export function nextInventorySortMode(mode: InventorySortMode): InventorySortMode {
  return mode === "type" ? "alphabetical" : "type";
}
