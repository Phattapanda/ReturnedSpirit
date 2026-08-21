// ─── Central Item & Bag System ────────────────────────────────────────────────

export const ITEM_ATTRIBUTE = {
  EDIBLE: "edible",
  INGREDIENT: "ingredient",
  VESSEL: "vessel",
  MATERIAL: "material",
  TOOL: "tool",
  WEAPON: "weapon",
  ARMOR: "armor",
  CONSUMABLE: "consumable",
} as const;

export type ItemAttribute = (typeof ITEM_ATTRIBUTE)[keyof typeof ITEM_ATTRIBUTE];

export const MEAL_TAG = {
  SOUP: "soup",
  VEGETARIAN: "vegetarian",
  HERBS: "herbs",
  HEALTHY: "healthy",
  MEAT: "meat",
  SWEET: "sweet",
  HEARTY: "hearty",
  WARM: "warm",
  COLD: "cold",
} as const;

export type MealTag = (typeof MEAL_TAG)[keyof typeof MEAL_TAG];

export const CONSUMABLE_CATEGORY = {
  POTION: "potion",
  PILL: "pill",
  DRINK: "drink",
  OTHER: "other",
} as const;

export type ConsumableCategory = (typeof CONSUMABLE_CATEGORY)[keyof typeof CONSUMABLE_CATEGORY];

export type BagItem = {
  id: string;
  itemType: string;
  name: string;
  quantity: number;
  quality?: string;
  containedItem?: string;
  containedQuantity?: number;
  attributes?: ItemAttribute[];
  /** Optional per-instance override. Canonical meal tags normally live in ITEM_CATALOG. */
  mealTags?: MealTag[];
  /** Metadata only. Actual consumable effects/buffs intentionally live elsewhere later. */
  consumableCategory?: ConsumableCategory;
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

function sameOptionalTagSet<T extends string>(a?: readonly T[], b?: readonly T[]): boolean {
  if (a === undefined && b === undefined) return true;
  if (!a || !b || a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every(value => bSet.has(value));
}

/** Returns true only when all stack-relevant properties are identical. */
export function canStack(a: BagItem, b: BagItem): boolean {
  return (
    a.itemType           === b.itemType &&
    a.id                 === b.id &&
    (a.quality          ?? null) === (b.quality          ?? null) &&
    (a.containedItem    ?? null) === (b.containedItem    ?? null) &&
    (a.containedQuantity ?? null) === (b.containedQuantity ?? null) &&
    sameOptionalTagSet(a.mealTags, b.mealTags) &&
    (a.consumableCategory ?? null) === (b.consumableCategory ?? null)
  );
}

export type AddToBagResult = {
  canTransfer: boolean;
  transferQty: number;
  remainderQty: number;
  updatedSlots: (BagItem | null)[];
};

export type AddToNextFreeSlotResult =
  | { ok: true; slotIndex: number; updatedSlots: (BagItem | null)[] }
  | { ok: false; reason: "bag_locked" | "bag_full"; updatedSlots: (BagItem | null)[] };

/** Add one non-stackable item instance to the first empty Player Bag slot. */
export function planAddToNextFreeBagSlot(
  item: BagItem,
  bag: PlayerBagData,
): AddToNextFreeSlotResult {
  const updatedSlots = bag.slots.map((slot) => slot ? { ...slot } : null);
  if (!bag.unlocked) return { ok: false, reason: "bag_locked", updatedSlots };

  const slotIndex = updatedSlots.findIndex((slot) => slot === null);
  if (slotIndex < 0) return { ok: false, reason: "bag_full", updatedSlots };

  updatedSlots[slotIndex] = { ...item, quantity: 1 };
  return { ok: true, slotIndex, updatedSlots };
}

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

export type ItemCatalogEntry = {
  name: string;
  description: string;
  attributes: ItemAttribute[];
  /** Used for meals/guest wishes. Keep recipe names out of preference matching. */
  mealTags?: MealTag[];
  /** Technical preparation for one-use consumables. No effects/buffs are modeled yet. */
  consumableCategory?: ConsumableCategory;
};

/**
 * Item catalog — canonical names, descriptions and gameplay metadata.
 *
 * Attribute semantics:
 *   edible      — food/meal that can be eaten; actual stat effects live elsewhere
 *   ingredient  — used in cooking or crafting recipes
 *   vessel      — a container that holds liquids
 *   material    — construction / crafting raw material
 *   tool        — a reusable usable tool
 *   weapon      — a weapon
 *   armor       — armor
 *   consumable  — one-use personal item (potions, pills, drinks), distinct from meals
 */
export const ITEM_CATALOG: Record<string, ItemCatalogEntry> = {
  herbbag:     { name: "Herb Bag",         description: "A small bag filled with harvested herbs.", attributes: [] },
  carrotbag:   { name: "Carrot Bag",       description: "A small bag filled with harvested carrots.", attributes: [] },
  herbsoup:    {
    name: "Herb Soup",
    description: "A warm soup made from fresh herbs. Restores 20 Stamina.",
    attributes: [ITEM_ATTRIBUTE.EDIBLE],
    mealTags: [MEAL_TAG.SOUP, MEAL_TAG.VEGETARIAN, MEAL_TAG.HERBS, MEAL_TAG.HEALTHY, MEAL_TAG.WARM],
  },
  herbs:       { name: "Herbs",            description: "Fresh herbs picked from the garden.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  carrot:      { name: "Carrot",           description: "A fresh carrot harvested from the garden.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  potato:      { name: "Potato",           description: "A sturdy potato used in many warm meals.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  onion:       { name: "Onion",            description: "A pungent onion used as a cooking ingredient.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  bucket:      { name: "Empty Bucket",     description: "A sturdy wooden bucket. It needs to be filled.", attributes: [ITEM_ATTRIBUTE.VESSEL] },
  bucketwater: { name: "Bucket of Water", description: "A bucket filled with fresh water from the well.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  herbseed:    { name: "Herb Seed",        description: "Seeds for growing herbs.", attributes: [] },
  carrotseed:  { name: "Carrot Seed",      description: "Seeds for growing carrots.", attributes: [] },
  potatoseed:  { name: "Potato Seed",      description: "Seeds for growing potatoes.", attributes: [] },
  onionseed:   { name: "Onion Seed",       description: "Seeds for growing onions.", attributes: [] },
  standardfertilizer: { name: "Standard Fertilizer", description: "Basic fertilizer for improving a crop.", attributes: [] },
  premiumfertilizer:  { name: "Premium Fertilizer",  description: "High-quality fertilizer for improving a crop.", attributes: [] },
  healthymuffin: {
    name: "Healthy Muffin",
    description: "Restores 50 Stamina, up to your normal maximum.",
    attributes: [ITEM_ATTRIBUTE.CONSUMABLE],
    consumableCategory: CONSUMABLE_CATEGORY.OTHER,
  },
  goldenapple: {
    name: "Golden Apple",
    description: "Restores 50 Stamina and may raise it temporarily above its normal maximum.",
    attributes: [ITEM_ATTRIBUTE.CONSUMABLE],
    consumableCategory: CONSUMABLE_CATEGORY.OTHER,
  },
  energydrink: {
    name: "Energy Drink",
    description: "Reduces Stamina costs by 1 for 5 days.",
    attributes: [ITEM_ATTRIBUTE.CONSUMABLE],
    consumableCategory: CONSUMABLE_CATEGORY.DRINK,
  },
  energypill: {
    name: "Energy Pill",
    description: "Reduces Stamina costs by 1 for 10 days.",
    attributes: [ITEM_ATTRIBUTE.CONSUMABLE],
    consumableCategory: CONSUMABLE_CATEGORY.PILL,
  },
  // Resources
  wood:        { name: "Wood",             description: "Cut timber. Useful for repairs and construction.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  stone:       { name: "Stone",            description: "A piece of solid rock. Used for building and crafting.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  cloth:       { name: "Cloth",            description: "Woven fabric. Useful for making items and decorations.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  nails:       { name: "Nails",            description: "Iron nails for woodworking and construction.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  paint:       { name: "Paint",            description: "A bucket of paint for renovating the tavern.", attributes: [] },
  oldpot:      { name: "Old Pot",          description: "An old iron pot. Perfect for brewing herbal concoctions.", attributes: [ITEM_ATTRIBUTE.TOOL] },
};

function itemId(itemOrId: BagItem | string): string {
  return typeof itemOrId === "string" ? itemOrId : itemOrId.id;
}

/** Resolve canonical attributes plus any instance-specific additions. */
export function getItemAttributes(itemOrId: BagItem | string): ItemAttribute[] {
  const id = itemId(itemOrId);
  const canonical = ITEM_CATALOG[id]?.attributes ?? [];
  if (typeof itemOrId === "string" || !itemOrId.attributes?.length) return [...canonical];
  return [...new Set<ItemAttribute>([...canonical, ...itemOrId.attributes])];
}

export function hasItemAttribute(itemOrId: BagItem | string, attribute: ItemAttribute): boolean {
  return getItemAttributes(itemOrId).includes(attribute);
}

/**
 * Resolve meal tags without requiring save migration.
 * Old saved items normally omit mealTags and automatically use ITEM_CATALOG tags.
 * A future item variant may provide mealTags on the BagItem to override the catalog.
 */
export function getItemMealTags(itemOrId: BagItem | string): MealTag[] {
  if (typeof itemOrId !== "string" && itemOrId.mealTags !== undefined) {
    return [...new Set<MealTag>(itemOrId.mealTags)];
  }
  return [...(ITEM_CATALOG[itemId(itemOrId)]?.mealTags ?? [])];
}

export function hasMealTag(itemOrId: BagItem | string, tag: MealTag): boolean {
  return getItemMealTags(itemOrId).includes(tag);
}

export function isEdible(itemOrId: BagItem | string): boolean {
  return hasItemAttribute(itemOrId, ITEM_ATTRIBUTE.EDIBLE);
}

export function isConsumable(itemOrId: BagItem | string): boolean {
  return hasItemAttribute(itemOrId, ITEM_ATTRIBUTE.CONSUMABLE);
}

export function getConsumableCategory(itemOrId: BagItem | string): ConsumableCategory | null {
  if (typeof itemOrId !== "string" && itemOrId.consumableCategory) return itemOrId.consumableCategory;
  return ITEM_CATALOG[itemId(itemOrId)]?.consumableCategory ?? null;
}
