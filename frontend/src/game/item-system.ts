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
  STORAGE: "storage",
  QUEST_ITEM: "quest_item",
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
  ALCOHOLIC: "alcoholic",
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
  durability?: number;
  maxDurability?: number;
  equipped?: boolean;
  /** Identifies which monster produced a stackable generic carcass. */
  monsterId?: string;
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

export const BACKPACK_BAG: Omit<PlayerBagData, "unlocked" | "slots"> = {
  bagId: "bag2",
  level: 2,
  rows: 3,
  columns: 3,
  slotCount: 9,
  maxStackSize: 9,
};

/** Legacy IDs are accepted only while reading old saves; all new writes use type_variant IDs. */
const LEGACY_ITEM_IDS: Readonly<Record<string, string>> = {
  herbbag: "bag_herb",
  carrotbag: "bag_carrot",
  herbsoup: "soup_herb",
  carrotsoup: "soup_carrot",
  carrotpotatosoup: "soup_carrot_potato",
  beefstew: "stew_beef",
};

export function normalizeItemId(id: string): string {
  return LEGACY_ITEM_IDS[id] ?? id;
}

export function normalizeBagItem(item: BagItem | null): BagItem | null {
  if (!item) return null;
  const id = normalizeItemId(item.id);
  const itemType = normalizeItemId(item.itemType);
  return id === item.id && itemType === item.itemType ? item : { ...item, id, itemType };
}

export function normalizePlayerBagData(bag: Partial<PlayerBagData>): PlayerBagData {
  const parsedSlots = Array.isArray(bag.slots) ? bag.slots : [];
  const backpack = bag.bagId === BACKPACK_BAG.bagId;
  const columns = backpack ? BACKPACK_BAG.columns : Math.max(1, Number(bag.columns) || DEFAULT_BAG.columns);
  const minimumSlots = backpack ? BACKPACK_BAG.slotCount : DEFAULT_BAG.slotCount;
  const slotCount = Math.max(minimumSlots, Number(bag.slotCount) || 0, parsedSlots.length);
  const rows = Math.max(backpack ? BACKPACK_BAG.rows : DEFAULT_BAG.rows, Math.ceil(slotCount / columns));
  return {
    ...DEFAULT_BAG,
    ...bag,
    ...(backpack ? BACKPACK_BAG : {}),
    rows,
    columns,
    slotCount,
    slots: Array.from({ length: slotCount }, (_, index) => normalizeBagItem(parsedSlots[index] ?? null)),
  };
}

/** Upgrade Shoulder Bag to Backpack while preserving every existing slot verbatim. */
export function upgradeToBackpack(bag: PlayerBagData): PlayerBagData {
  const normalized = normalizePlayerBagData(bag);
  if (normalized.bagId === "bag2" || normalized.bagId === "bag3") return normalized;
  return normalizePlayerBagData({
    ...normalized,
    ...BACKPACK_BAG,
    unlocked: normalized.unlocked,
    slots: [...normalized.slots, ...Array(Math.max(0, BACKPACK_BAG.slotCount - normalized.slots.length)).fill(null)],
  });
}

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
    normalizeItemId(a.itemType) === normalizeItemId(b.itemType) &&
    normalizeItemId(a.id)       === normalizeItemId(b.id) &&
    (a.quality          ?? null) === (b.quality          ?? null) &&
    (a.containedItem    ?? null) === (b.containedItem    ?? null) &&
    (a.containedQuantity ?? null) === (b.containedQuantity ?? null) &&
    sameOptionalTagSet(a.mealTags, b.mealTags) &&
    (a.consumableCategory ?? null) === (b.consumableCategory ?? null) &&
    (a.monsterId ?? null) === (b.monsterId ?? null) &&
    a.durability === undefined && b.durability === undefined &&
    !getItemAttributes(a).includes(ITEM_ATTRIBUTE.STORAGE) &&
    !getItemAttributes(b).includes(ITEM_ATTRIBUTE.STORAGE) &&
    !getItemAttributes(a).some((attribute) => attribute === ITEM_ATTRIBUTE.WEAPON || attribute === ITEM_ATTRIBUTE.ARMOR) &&
    !getItemAttributes(b).some((attribute) => attribute === ITEM_ATTRIBUTE.WEAPON || attribute === ITEM_ATTRIBUTE.ARMOR)
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
  const canonicalItem = normalizeBagItem(item)!;
  const updatedSlots = bag.slots.map(normalizeBagItem);
  if (!bag.unlocked) return { ok: false, reason: "bag_locked", updatedSlots };

  const slotIndex = updatedSlots.findIndex((slot) => slot === null);
  if (slotIndex < 0) return { ok: false, reason: "bag_full", updatedSlots };

  updatedSlots[slotIndex] = { ...canonicalItem, quantity: 1 };
  return { ok: true, slotIndex, updatedSlots };
}

/** Plan + execute adding one item stack to the bag, respecting maxStackSize */
export function planAddToBag(item: BagItem, bag: PlayerBagData): AddToBagResult {
  const canonicalItem = normalizeBagItem(item)!;
  const maxStack = bag.maxStackSize;
  const newSlots = bag.slots.map(normalizeBagItem);
  let remaining = canonicalItem.quantity;

  // 1. Fill compatible partial stacks
  for (let i = 0; i < newSlots.length && remaining > 0; i++) {
    const slot = newSlots[i];
    if (slot && canStack(slot, canonicalItem) && slot.quantity < maxStack) {
      const canAdd = Math.min(remaining, maxStack - slot.quantity);
      newSlots[i] = { ...slot, quantity: slot.quantity + canAdd };
      remaining -= canAdd;
    }
  }

  // 2. Fill empty slots
  for (let i = 0; i < newSlots.length && remaining > 0; i++) {
    if (newSlots[i] === null) {
      const qty = Math.min(remaining, maxStack);
      newSlots[i] = { ...canonicalItem, quantity: qty };
      remaining -= qty;
    }
  }

  const transferred = canonicalItem.quantity - remaining;
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
  const canonicalId = normalizeItemId(itemId);
  return bag.slots.some(s => s !== null && normalizeItemId(s.id) === canonicalId);
}

export function findBagItemSlotIdx(bag: PlayerBagData, itemId: string): number {
  const canonicalId = normalizeItemId(itemId);
  return bag.slots.findIndex(s => s !== null && normalizeItemId(s.id) === canonicalId);
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
  /** Category for one-use consumables; temporary buffs are applied by player-stats. */
  consumableCategory?: ConsumableCategory;
  /** Stamina restored when eaten or consumed. Normal recovery is capped at maximum Stamina. */
  staminaRecovery?: number;
  /** Life restored when eaten or consumed, capped at maximum Life. */
  lifeRecovery?: number;
  /** Exceptional food such as the Golden Apple may temporarily exceed maximum Stamina. */
  allowsStaminaOverflow?: boolean;
  /** Canonical tavern sale price before upgrades, traits, buffs, or NPC modifiers. */
  baseSellPriceCopper?: number;
  /** Temporary status effect applied after the food is consumed. */
  grantedStatusEffectId?: string;
  damageMin?: number;
  damageMax?: number;
  basicAccuracyPercent?: number;
  physicalDefense?: number;
  maxDurability?: number;
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
 *   quest_item  — a progression item consumed by a quest or upgrade
 */
export const ITEM_CATALOG: Record<string, ItemCatalogEntry> = {
  bag2: { name: "Backpack", description: "A roomy 3 × 3 upgrade for the Shoulder Bag.", attributes: [ITEM_ATTRIBUTE.STORAGE] },
  bag3: { name: "Big Backpack", description: "A larger backpack that will be unlocked in the city later.", attributes: [ITEM_ATTRIBUTE.STORAGE] },
  crate1: { name: "Small Crate", description: "A finished 2 × 3 Kitchen storage crate.", attributes: [ITEM_ATTRIBUTE.STORAGE] },
  monster_carcass: { name: "Monster Carcass", description: "A defeated monster. Process it in the Kitchen with a Butchering Knife.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  malted_barley: { name: "Malted Barley", description: "A brewing ingredient obtained in the city. Required to unlock Standard Ale.", attributes: [ITEM_ATTRIBUTE.QUEST_ITEM] },
  brewers_yeast: { name: "Brewer's Yeast", description: "A brewing culture obtained in the city. Required to unlock Standard Ale.", attributes: [ITEM_ATTRIBUTE.QUEST_ITEM] },
  dried_hop_cones: { name: "Dried Hop Cones", description: "Dried hops obtained in the city. Required to unlock Standard Ale.", attributes: [ITEM_ATTRIBUTE.QUEST_ITEM] },
  raw_wildflower_honey: { name: "Raw Wildflower Honey", description: "Fragrant wildflower honey required to unlock Honey Mead.", attributes: [ITEM_ATTRIBUTE.QUEST_ITEM] },
  mead_yeast: { name: "Mead Yeast", description: "A special yeast culture required to unlock Honey Mead.", attributes: [ITEM_ATTRIBUTE.QUEST_ITEM] },
  grown_cinnamon_stalks_cloves: { name: "Grown Cinnamon Stalks & Cloves", description: "Aromatic quest ingredients gathered for Honey Mead.", attributes: [ITEM_ATTRIBUTE.QUEST_ITEM] },
  yeast_nutrients: { name: "Yeast Nutrients", description: "Brewing nutrients required to unlock Honey Mead.", attributes: [ITEM_ATTRIBUTE.QUEST_ITEM] },
  wild_berries: { name: "Wild Berries", description: "Forest berries. Restores 5 Stamina and can be used as an ingredient.", attributes: [ITEM_ATTRIBUTE.EDIBLE, ITEM_ATTRIBUTE.INGREDIENT], staminaRecovery: 5 },
  white_meat: { name: "White Meat", description: "Light meat obtained from small game.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  red_meat: { name: "Red Meat", description: "Meat obtained from forest animals.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  fur: { name: "Fur", description: "Animal fur used in crafting.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  hide: { name: "Hide", description: "A tough animal hide used in crafting.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  tusk: { name: "Tusk", description: "A sturdy boar tusk.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  wolf_pelt: { name: "Wolf Pelt", description: "A thick pelt from a forest wolf.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  fang: { name: "Fang", description: "A sharp monster fang.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  slime_gel: { name: "Slime Gel", description: "Gel gathered from a defeated slime.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  weak_monster_core: { name: "Weak Monster Core", description: "A faintly glowing monster core.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  ember_feather: { name: "Ember Feather", description: "A warm feather from an Ember creature.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  bag_herb:    { name: "Herb Bag",         description: "A small bag filled with harvested herbs.", attributes: [] },
  bag_carrot:  { name: "Carrot Bag",       description: "A small bag filled with harvested carrots.", attributes: [] },
  bag_onion:   { name: "Onion Bag",        description: "A small bag filled with harvested onions.", attributes: [] },
  bag_potato:  { name: "Potato Bag",       description: "A small bag filled with harvested potatoes.", attributes: [] },
  soup_herb: {
    name: "Herb Soup",
    description: "A warm soup made from fresh herbs. Restores 15 Stamina.",
    attributes: [ITEM_ATTRIBUTE.EDIBLE],
    mealTags: [MEAL_TAG.SOUP, MEAL_TAG.VEGETARIAN, MEAL_TAG.HERBS, MEAL_TAG.HEALTHY, MEAL_TAG.WARM],
    staminaRecovery: 15,
    baseSellPriceCopper: 9,
  },
  soup_carrot: {
    name: "Carrot Soup",
    description: "A light, healthy soup. Restores 20 Stamina.",
    attributes: [ITEM_ATTRIBUTE.EDIBLE],
    mealTags: [MEAL_TAG.SOUP, MEAL_TAG.VEGETARIAN, MEAL_TAG.HEALTHY, MEAL_TAG.WARM],
    staminaRecovery: 20,
    baseSellPriceCopper: 13,
  },
  soup_potato: {
    name: "Potato Soup",
    description: "A hearty potato soup. Restores 30 Stamina.",
    attributes: [ITEM_ATTRIBUTE.EDIBLE],
    mealTags: [MEAL_TAG.SOUP, MEAL_TAG.VEGETARIAN, MEAL_TAG.HEARTY, MEAL_TAG.WARM],
    staminaRecovery: 30,
    baseSellPriceCopper: 17,
  },
  soup_onion: {
    name: "Onion Soup",
    description: "A restorative onion soup. Restores 20 Stamina and 10 Life.",
    attributes: [ITEM_ATTRIBUTE.EDIBLE],
    mealTags: [MEAL_TAG.SOUP, MEAL_TAG.VEGETARIAN, MEAL_TAG.HEALTHY, MEAL_TAG.WARM],
    staminaRecovery: 20,
    lifeRecovery: 10,
    baseSellPriceCopper: 21,
  },
  soup_carrot_potato: {
    name: "Carrot-Potato Soup",
    description: "A hearty vegetable soup. Restores 25 Stamina and 10 Life.",
    attributes: [ITEM_ATTRIBUTE.EDIBLE],
    mealTags: [MEAL_TAG.SOUP, MEAL_TAG.VEGETARIAN, MEAL_TAG.HEALTHY, MEAL_TAG.HEARTY, MEAL_TAG.WARM],
    staminaRecovery: 25,
    lifeRecovery: 10,
    baseSellPriceCopper: 15,
  },
  stew_vegetable: {
    name: "Vegetable Stew",
    description: "A substantial vegetable stew. Restores 35 Stamina and 20 Life.",
    attributes: [ITEM_ATTRIBUTE.EDIBLE],
    mealTags: [MEAL_TAG.VEGETARIAN, MEAL_TAG.HEALTHY, MEAL_TAG.HEARTY, MEAL_TAG.WARM],
    staminaRecovery: 35,
    lifeRecovery: 20,
    baseSellPriceCopper: 24,
  },
  stew_chicken: {
    name: "Chicken Stew", description: "Restores 45 Stamina and 25 Life.", attributes: [ITEM_ATTRIBUTE.EDIBLE],
    mealTags: [MEAL_TAG.MEAT, MEAL_TAG.HEALTHY, MEAL_TAG.HEARTY, MEAL_TAG.WARM, MEAL_TAG.HERBS],
    staminaRecovery: 45, lifeRecovery: 25, baseSellPriceCopper: 44,
  },
  stew_beef: {
    name: "Beef Stew",
    description: "A hearty, warming beef stew. Restores 40 Stamina and 40 Life.",
    attributes: [ITEM_ATTRIBUTE.EDIBLE],
    mealTags: [MEAL_TAG.MEAT, MEAL_TAG.HEARTY, MEAL_TAG.WARM, MEAL_TAG.HERBS],
    staminaRecovery: 40, lifeRecovery: 40, baseSellPriceCopper: 49,
  },
  stew_fisherman: {
    name: "Fisherman Stew", description: "Restores 40 Stamina and 25 Life.", attributes: [ITEM_ATTRIBUTE.EDIBLE],
    mealTags: [MEAL_TAG.HEALTHY, MEAL_TAG.HEARTY, MEAL_TAG.WARM, MEAL_TAG.HERBS],
    staminaRecovery: 40, lifeRecovery: 25, baseSellPriceCopper: 48,
  },
  pan_farmhouse: {
    name: "Farmhouse Pan", description: "A hearty potato, egg, and onion dish. Restores 45 Stamina and 15 Life.",
    attributes: [ITEM_ATTRIBUTE.EDIBLE],
    mealTags: [MEAL_TAG.VEGETARIAN, MEAL_TAG.HEALTHY, MEAL_TAG.HEARTY, MEAL_TAG.WARM],
    staminaRecovery: 45, lifeRecovery: 15, baseSellPriceCopper: 35,
  },
  stew_ember_chicken: {
    name: "Ember Chicken Stew", description: "Restores 45 Stamina and 30 Life. Grants Fire Resistance +3 for 1 day.",
    attributes: [ITEM_ATTRIBUTE.EDIBLE], mealTags: [MEAL_TAG.MEAT, MEAL_TAG.HEARTY, MEAL_TAG.WARM, MEAL_TAG.HERBS],
    staminaRecovery: 45, lifeRecovery: 30, baseSellPriceCopper: 64,
    grantedStatusEffectId: "fire_resistance_3",
  },
  soup_ember_egg: {
    name: "Ember Egg Soup", description: "Restores 35 Stamina and 20 Life. Grants Fire Resistance +2 for 1 day.",
    attributes: [ITEM_ATTRIBUTE.EDIBLE], mealTags: [MEAL_TAG.SOUP, MEAL_TAG.HEALTHY, MEAL_TAG.HEARTY, MEAL_TAG.WARM],
    staminaRecovery: 35, lifeRecovery: 20, baseSellPriceCopper: 72,
    grantedStatusEffectId: "fire_resistance_2",
  },
  snowberrysherbet: {
    name: "Snowberry Sherbet",
    description: "A cold snowberry dessert. Recipe and effects will be added later.",
    attributes: [ITEM_ATTRIBUTE.EDIBLE],
    mealTags: [MEAL_TAG.SWEET, MEAL_TAG.COLD],
  },
  herbs:       { name: "Herbs",            description: "Fresh herbs picked from the garden.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  carrot:      { name: "Carrot",           description: "A fresh carrot harvested from the garden.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  potato:      { name: "Potato",           description: "A sturdy potato used in many warm meals.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  onion:       { name: "Onion",            description: "A pungent onion used as a cooking ingredient.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  egg:         { name: "Egg",              description: "A fresh egg used for cooking.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  chicken:     { name: "Chicken",          description: "Chicken meat used for cooking.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  beef:        { name: "Beef",             description: "Beef used for cooking.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  fish:        { name: "Fish",             description: "Fresh fish used for cooking.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  tomato:      { name: "Tomato",           description: "A ripe tomato used for cooking.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  ember_chicken_meat: { name: "Ember Chicken Meat", description: "Rare monster meat radiating heat.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  ember_chicken_egg:  { name: "Ember Chicken Egg",  description: "A rare monster egg radiating heat.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  bucket:      { name: "Empty Bucket",     description: "A sturdy wooden bucket. It needs to be filled.", attributes: [ITEM_ATTRIBUTE.VESSEL] },
  bucketwater: { name: "Bucket of Water", description: "A bucket filled with fresh water from the well.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  seed_herb:   { name: "Herb Seed",        description: "Seeds for growing herbs.", attributes: [] },
  seed_carrot: { name: "Carrot Seed",      description: "Seeds for growing carrots.", attributes: [] },
  seed_potato: { name: "Potato Seed",      description: "Seeds for growing potatoes.", attributes: [] },
  seed_onion:  { name: "Onion Seed",       description: "Seeds for growing onions.", attributes: [] },
  standard_fertilizer: { name: "Standard Fertilizer", description: "Basic fertilizer for improving a crop.", attributes: [] },
  premium_fertilizer:  { name: "Premium Fertilizer",  description: "High-quality fertilizer for improving a crop.", attributes: [] },
  healthymuffin: {
    name: "Healthy Muffin",
    description: "Restores 50 Stamina, up to your normal maximum.",
    attributes: [ITEM_ATTRIBUTE.CONSUMABLE],
    consumableCategory: CONSUMABLE_CATEGORY.OTHER,
    staminaRecovery: 50,
  },
  goldenapple: {
    name: "Golden Apple",
    description: "Restores 50 Stamina and may raise it temporarily above its normal maximum.",
    attributes: [ITEM_ATTRIBUTE.CONSUMABLE],
    consumableCategory: CONSUMABLE_CATEGORY.OTHER,
    staminaRecovery: 50,
    allowsStaminaOverflow: true,
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
  potion_healing_low_grade: {
    name: "Low Quality Healing Potion",
    description: "A basic healing potion. Restores 30 Life, up to the normal maximum.",
    attributes: [ITEM_ATTRIBUTE.CONSUMABLE],
    consumableCategory: CONSUMABLE_CATEGORY.POTION,
    lifeRecovery: 30,
  },
  potion_stamina_low_grade: {
    name: "Low Quality Stamina Potion",
    description: "A basic stamina potion. Restores 60 Stamina, up to the normal maximum.",
    attributes: [ITEM_ATTRIBUTE.CONSUMABLE],
    consumableCategory: CONSUMABLE_CATEGORY.POTION,
    staminaRecovery: 60,
  },
  antidote: {
    name: "Antidote",
    description: "A remedy for poison. Its cure behavior will activate with poison effects.",
    attributes: [ITEM_ATTRIBUTE.CONSUMABLE],
    consumableCategory: CONSUMABLE_CATEGORY.POTION,
  },
  // Resources
  wood:        { name: "Wood",             description: "Cut timber. Useful for repairs and construction.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  stone:       { name: "Stone",            description: "A piece of solid rock. Used for building and crafting.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  cloth:       { name: "Cloth",            description: "Woven fabric. Useful for making items and decorations.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  nails:       { name: "Nails",            description: "Iron nails for woodworking and construction.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  paint:       { name: "Paint",            description: "A bucket of paint for renovating the tavern.", attributes: [] },
  ingot_iron:  { name: "Iron Ingot",       description: "A refined iron ingot used for crafting.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  ingot_copper:{ name: "Copper Ingot",     description: "A refined copper ingot used for crafting.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  shard_mana:  { name: "Mana Shard",       description: "A small crystalline fragment filled with mana.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  stone_mana:  { name: "Mana Stone",       description: "A concentrated mana stone used in rare crafting.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  tool_rusty_butchering_knife: {
    name: "Rusty Butchering Knife",
    description: "A worn but usable butchering tool. Durability 25/25.",
    attributes: [ITEM_ATTRIBUTE.TOOL],
    maxDurability: 25,
  },
  armor_leather_bracers: {
    name: "Leather Bracers",
    description: "Reduces physical damage by 2. Durability 20/20.",
    attributes: [ITEM_ATTRIBUTE.ARMOR],
    physicalDefense: 2,
    maxDurability: 20,
  },
  armor_leather_armor: {
    name: "Leather Armor",
    description: "Reduces physical damage by 5. Durability 20/20.",
    attributes: [ITEM_ATTRIBUTE.ARMOR],
    physicalDefense: 5,
    maxDurability: 20,
  },
  weapon_iron_dagger: {
    name: "Iron Dagger",
    description: "Deals 2–4 damage. Basic accuracy 70%. Durability 20/20.",
    attributes: [ITEM_ATTRIBUTE.WEAPON],
    damageMin: 2,
    damageMax: 4,
    basicAccuracyPercent: 70,
    maxDurability: 20,
  },
  weapon_iron_shortsword: {
    name: "Iron Shortsword",
    description: "Deals 3–6 damage. Basic accuracy 80%. Durability 20/20.",
    attributes: [ITEM_ATTRIBUTE.WEAPON],
    damageMin: 3,
    damageMax: 6,
    basicAccuracyPercent: 80,
    maxDurability: 20,
  },
  oldpot:      { name: "Old Pot",          description: "An old iron pot. Perfect for brewing herbal concoctions.", attributes: [ITEM_ATTRIBUTE.TOOL] },
  cooking_pot: { name: "Cooking Pot",      description: "A permanent Stage 2 kitchen upgrade.", attributes: [ITEM_ATTRIBUTE.TOOL] },
  frying_pan:  { name: "Frying Pan",       description: "A planned specialist tool for eggs and pan-fried dishes.", attributes: [ITEM_ATTRIBUTE.TOOL] },
};

function itemId(itemOrId: BagItem | string): string {
  return normalizeItemId(typeof itemOrId === "string" ? itemOrId : itemOrId.id);
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

export function getMealBaseSellPriceCopper(itemOrId: BagItem | string): number | null {
  if (!isEdible(itemOrId)) return null;
  const price = ITEM_CATALOG[itemId(itemOrId)]?.baseSellPriceCopper;
  return Number.isFinite(price) ? Math.max(0, Math.floor(price!)) : null;
}

export function getGrantedStatusEffectId(itemOrId: BagItem | string): string | null {
  return ITEM_CATALOG[itemId(itemOrId)]?.grantedStatusEffectId ?? null;
}

export type StaminaRecoveryEffect = {
  amount: number;
  allowsOverflow: boolean;
};

/** Resolve recovery rules from the canonical catalog without requiring save migration. */
export function getStaminaRecoveryEffect(itemOrId: BagItem | string): StaminaRecoveryEffect | null {
  const entry = ITEM_CATALOG[itemId(itemOrId)];
  if (!entry?.staminaRecovery || entry.staminaRecovery <= 0) return null;
  return {
    amount: entry.staminaRecovery,
    allowsOverflow: entry.allowsStaminaOverflow === true,
  };
}

/** Buff-only consumables remain usable at full Stamina; ordinary food does not. */
export function canConsumeForStamina(
  itemOrId: BagItem | string,
  currentStamina: number,
  maximumStamina: number,
): boolean {
  const effect = getStaminaRecoveryEffect(itemOrId);
  return !effect || effect.allowsOverflow || currentStamina < maximumStamina;
}

/** Apply recovery and discard overflow unless the item's metadata explicitly permits it. */
export function applyStaminaRecovery(
  itemOrId: BagItem | string,
  currentStamina: number,
  maximumStamina: number,
): number {
  const effect = getStaminaRecoveryEffect(itemOrId);
  if (!effect) return currentStamina;
  const recovered = currentStamina + effect.amount;
  return effect.allowsOverflow ? recovered : Math.min(maximumStamina, recovered);
}

/** Apply Life recovery without exceeding maximum Life. */
export function applyLifeRecovery(
  itemOrId: BagItem | string,
  currentLife: number,
  maximumLife: number,
): number {
  const recovery = ITEM_CATALOG[itemId(itemOrId)]?.lifeRecovery ?? 0;
  return Math.min(maximumLife, Math.max(0, currentLife) + Math.max(0, recovery));
}
