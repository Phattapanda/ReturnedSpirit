// ─── Central Item & Bag System ────────────────────────────────────────────────

export type BagItem = {
  id: string;
  itemType: string;
  name: string;
  quantity: number;
  quality?: string;
  containedItem?: string;
  containedQuantity?: number;
  attributes?: string[]; // e.g. ["edible"], ["ingredient"], ["vessel"], ["material"] …
};

export type PlayerBagData = {
  bagId: string;
  level: number;
  rows: number;
  columns: number;
  slotCount: number;
  maxStackSize: number;
  unlocked: boolean;
  slots: (BagItem | null)[];
};

export type ContainerType = "playerBag" | "kitchenTable" | "roomStorage";

export const PLAYER_BAG_KEY = "@game:player_bag";
export const BAG_INSPECTED_KEY = "@game:bag_inspected";
export const KITCHEN_TABLE_KEY = "@kitchen:table_items";

export const DEFAULT_BAG: PlayerBagData = {
  bagId: "bag1",
  level: 1,
  rows: 2,
  columns: 3,
  slotCount: 6,
  maxStackSize: 9,
  unlocked: false,
  slots: Array(6).fill(null),
};

export function getContainerStackLimit(container: ContainerType): number {
  switch (container) {
    case "playerBag":   return 9;
    case "kitchenTable": return 20;
    case "roomStorage":  return 20;
  }
}

/** Returns true only when all stack-relevant properties are identical */
export function canStack(a: BagItem, b: BagItem): boolean {
  return (
    a.itemType           === b.itemType &&
    a.id                 === b.id &&
    (a.quality          ?? null) === (b.quality          ?? null) &&
    (a.containedItem    ?? null) === (b.containedItem    ?? null) &&
    (a.containedQuantity ?? null) === (b.containedQuantity ?? null)
  );
}

export type AddToBagResult = {
  canTransfer: boolean;
  transferQty: number;
  remainderQty: number;
  updatedSlots: (BagItem | null)[];
};

/** Plan + execute adding one item stack to the bag, respecting maxStackSize */
export function planAddToBag(item: BagItem, bag: PlayerBagData): AddToBagResult {
  const maxStack = bag.maxStackSize;
  const newSlots = bag.slots.map(s => s ? { ...s } : null);
  let remaining = item.quantity;

  // 1. Fill compatible partial stacks
  for (let i = 0; i < newSlots.length && remaining > 0; i++) {
    const slot = newSlots[i];
    if (slot && canStack(slot, item) && slot.quantity < maxStack) {
      const canAdd = Math.min(remaining, maxStack - slot.quantity);
      newSlots[i] = { ...slot, quantity: slot.quantity + canAdd };
      remaining -= canAdd;
    }
  }

  // 2. Fill empty slots
  for (let i = 0; i < newSlots.length && remaining > 0; i++) {
    if (newSlots[i] === null) {
      const qty = Math.min(remaining, maxStack);
      newSlots[i] = { ...item, quantity: qty };
      remaining -= qty;
    }
  }

  const transferred = item.quantity - remaining;
  return { canTransfer: transferred > 0, transferQty: transferred, remainderQty: remaining, updatedSlots: newSlots };
}

export type ContainerToBagResult = {
  canTransfer: boolean;
  transferQty: number;
  remainderQty: number;
  updatedBag: PlayerBagData;
  updatedSourceSlots: (BagItem | null)[];
};

/**
 * Move one source-container stack into the Player Bag without mutating either input.
 *
 * This is intentionally room-agnostic so Kitchen, storage and future rooms can all
 * share the exact same Bag capacity/stacking behavior. Compatible Bag stacks are
 * filled first, then empty Bag slots are used. If only part of the source stack
 * fits, the remainder stays in its original source slot. If nothing fits, both
 * source and Bag are returned unchanged.
 */
export function planContainerItemToBag(
  sourceSlots: (BagItem | null)[],
  sourceSlotIdx: number,
  bag: PlayerBagData,
): ContainerToBagResult {
  const sourceItem = sourceSlots[sourceSlotIdx] ?? null;
  const unchangedSource = sourceSlots.map(slot => slot ? { ...slot } : null);
  const unchangedBag: PlayerBagData = {
    ...bag,
    slots: bag.slots.map(slot => slot ? { ...slot } : null),
  };

  if (!sourceItem || !bag.unlocked || sourceSlotIdx < 0 || sourceSlotIdx >= sourceSlots.length) {
    return {
      canTransfer: false,
      transferQty: 0,
      remainderQty: sourceItem?.quantity ?? 0,
      updatedBag: unchangedBag,
      updatedSourceSlots: unchangedSource,
    };
  }

  const addPlan = planAddToBag(sourceItem, bag);
  if (!addPlan.canTransfer) {
    return {
      canTransfer: false,
      transferQty: 0,
      remainderQty: sourceItem.quantity,
      updatedBag: unchangedBag,
      updatedSourceSlots: unchangedSource,
    };
  }

  const updatedSourceSlots = unchangedSource;
  updatedSourceSlots[sourceSlotIdx] = addPlan.remainderQty > 0
    ? { ...sourceItem, quantity: addPlan.remainderQty }
    : null;

  return {
    canTransfer: true,
    transferQty: addPlan.transferQty,
    remainderQty: addPlan.remainderQty,
    updatedBag: { ...bag, slots: addPlan.updatedSlots },
    updatedSourceSlots,
  };
}

export function hasBagItem(bag: PlayerBagData, itemId: string): boolean {
  return bag.slots.some(s => s !== null && s.id === itemId);
}

export function findBagItemSlotIdx(bag: PlayerBagData, itemId: string): number {
  return bag.slots.findIndex(s => s !== null && s.id === itemId);
}

export function replaceBagSlot(bag: PlayerBagData, slotIdx: number, newItem: BagItem | null): PlayerBagData {
  const newSlots = [...bag.slots];
  newSlots[slotIdx] = newItem;
  return { ...bag, slots: newSlots };
}

export function removeBagItem(bag: PlayerBagData, slotIdx: number, qty: number): PlayerBagData {
  const newSlots = [...bag.slots];
  const slot = newSlots[slotIdx];
  if (!slot) return bag;
  const newQty = slot.quantity - qty;
  newSlots[slotIdx] = newQty > 0 ? { ...slot, quantity: newQty } : null;
  return { ...bag, slots: newSlots };
}

/**
 * Item catalog — canonical names, descriptions, and attributes.
 *
 * Supported attribute values (future-ready):
 *   edible      — player can eat/drink this to restore stats
 *   ingredient  — used in cooking or crafting recipes
 *   vessel      — a container that holds liquids
 *   material    — construction / crafting raw material
 *   tool        — a usable tool
 *   weapon      — a weapon
 *   armor       — armor
 *   consumable  — personal-use consumable (potions, pills) — distinct from "edible"
 */
export const ITEM_CATALOG: Record<string, { name: string; description: string; attributes: string[] }> = {
  herbbag:     { name: "Herb Bag",         description: "A small bag filled with harvested herbs.", attributes: [] },
  herbsoup:    { name: "Herb Soup",         description: "A warm soup made from fresh herbs. Restores 20 Stamina.", attributes: ["edible"] },
  herbs:       { name: "Herbs",             description: "Fresh herbs picked from the garden.", attributes: ["ingredient"] },
  bucket:      { name: "Empty Bucket",      description: "A sturdy wooden bucket. It needs to be filled.", attributes: ["vessel"] },
  bucketwater: { name: "Bucket of Water",  description: "A bucket filled with fresh water from the well.", attributes: ["ingredient"] },
  herbseed:    { name: "Herb Seed",         description: "Seeds for growing herbs.", attributes: [] },
  // Resources
  wood:        { name: "Wood",              description: "Cut timber. Useful for repairs and construction.", attributes: ["material"] },
  stone:       { name: "Stone",             description: "A piece of solid rock. Used for building and crafting.", attributes: ["material"] },
  cloth:       { name: "Cloth",             description: "Woven fabric. Useful for making items and decorations.", attributes: ["material"] },
  nails:       { name: "Nails",             description: "Iron nails for woodworking and construction.", attributes: ["material"] },
  paint:       { name: "Paint",             description: "A bucket of paint for renovating the tavern.", attributes: [] },
  oldpot:      { name: "Old Pot",           description: "An old iron pot. Perfect for brewing herbal concoctions.", attributes: ["tool"] },
};
