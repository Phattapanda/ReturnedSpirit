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
  chicken: "white_meat",
  beef: "red_meat",
};

export type ItemDurability = {
  current: number;
  maximum: number;
};

export const BIG_BACKPACK_BAG: Omit<PlayerBagData, "unlocked" | "slots"> = {
  bagId: "bag3",
  level: 3,
  rows: 4,
  columns: 4,
  slotCount: 16,
  maxStackSize: 9,
};

export const RUSTY_BUTCHERING_KNIFE_MAX_DURABILITY = 20;

export function normalizeItemId(id: string): string {
  return LEGACY_ITEM_IDS[id] ?? id;
}

export function normalizeBagItem(item: BagItem | null): BagItem | null {
  if (!item) return null;
  const id = normalizeItemId(item.id);
  const itemType = normalizeItemId(item.itemType);
  const canonicalName = id === "white_meat" ? "White Meat" : id === "red_meat" ? "Red Meat" : item.name;
  const normalized = { ...item, id, itemType, name: canonicalName };
  if (id === "tool_kitchen_knife") {
    const unlimited = { ...normalized };
    delete unlimited.durability;
    delete unlimited.maxDurability;
    return unlimited;
  }
  const durability = getItemDurability(normalized);
  if (durability) {
    return {
      ...normalized,
      durability: durability.current,
      maxDurability: durability.maximum,
    };
  }
  return id === item.id && itemType === item.itemType && canonicalName === item.name
    ? item
    : normalized;
}

export function normalizePlayerBagData(bag: Partial<PlayerBagData>): PlayerBagData {
  const parsedSlots = Array.isArray(bag.slots) ? bag.slots : [];
  const definition = bag.bagId === BIG_BACKPACK_BAG.bagId
    ? BIG_BACKPACK_BAG
    : bag.bagId === BACKPACK_BAG.bagId ? BACKPACK_BAG : DEFAULT_BAG;
  const columns = definition.columns;
  const minimumSlots = definition.slotCount;
  const slotCount = Math.max(minimumSlots, Number(bag.slotCount) || 0, parsedSlots.length);
  const rows = Math.max(definition.rows, Math.ceil(slotCount / columns));
  return {
    ...DEFAULT_BAG,
    ...bag,
    ...(bag.bagId === BIG_BACKPACK_BAG.bagId ? BIG_BACKPACK_BAG : bag.bagId === BACKPACK_BAG.bagId ? BACKPACK_BAG : {}),
    rows,
    columns,
    slotCount,
    slots: Array.from({ length: slotCount }, (_, index) => normalizeBagItem(parsedSlots[index] ?? null)),
  };
}

/** Upgrade an owned Backpack to the city's 4 x 4 Big Backpack. */
export function upgradeToBigBackpack(bag: PlayerBagData): PlayerBagData {
  const normalized = normalizePlayerBagData(bag);
  if (normalized.bagId === BIG_BACKPACK_BAG.bagId) return normalized;
  return normalizePlayerBagData({
    ...normalized,
    ...BIG_BACKPACK_BAG,
    unlocked: normalized.unlocked,
    slots: [...normalized.slots, ...Array(Math.max(0, BIG_BACKPACK_BAG.slotCount - normalized.slots.length)).fill(null)],
  });
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
    ((a.durability === undefined && b.durability === undefined) ||
      (a.id === "torch" && b.id === "torch" && !a.equipped && !b.equipped && a.durability === b.durability && a.maxDurability === b.maxDurability)) &&
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
  bag3: { name: "Big Backpack", description: "A spacious 4 × 4 backpack upgrade sold in the city.", attributes: [ITEM_ATTRIBUTE.STORAGE] },
  crate1: { name: "Small Crate", description: "A finished 2 × 3 Kitchen storage crate.", attributes: [ITEM_ATTRIBUTE.STORAGE] },
  monster_carcass: { name: "Monster Carcass", description: "A defeated monster. Process it in the Kitchen with a Butchering Knife.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  malted_barley: { name: "Malted Barley", description: "Quest item.", attributes: [ITEM_ATTRIBUTE.QUEST_ITEM] },
  brewers_yeast: { name: "Brewer's Yeast", description: "Quest item.", attributes: [ITEM_ATTRIBUTE.QUEST_ITEM] },
  dried_hop_cones: { name: "Dried Hop Cones", description: "Quest item.", attributes: [ITEM_ATTRIBUTE.QUEST_ITEM] },
  raw_wildflower_honey: { name: "Raw Wildflower Honey", description: "Quest item.", attributes: [ITEM_ATTRIBUTE.QUEST_ITEM] },
  mead_yeast: { name: "Mead Yeast", description: "Quest item.", attributes: [ITEM_ATTRIBUTE.QUEST_ITEM] },
  grown_cinnamon_stalks_cloves: { name: "Grown Cinnamon Stalks & Cloves", description: "Quest item.", attributes: [ITEM_ATTRIBUTE.QUEST_ITEM] },
  yeast_nutrients: { name: "Yeast Nutrients", description: "Quest item.", attributes: [ITEM_ATTRIBUTE.QUEST_ITEM] },
  standard_ale: { name: "Standard Ale", description: "The tavern's unlimited standard alcoholic drink, served for 5 Copper Coins.", attributes: [] },
  wild_berries: { name: "Wild Berries", description: "Forest berries. Restores 5 Stamina and can be used as an ingredient.", attributes: [ITEM_ATTRIBUTE.EDIBLE, ITEM_ATTRIBUTE.INGREDIENT], staminaRecovery: 5 },
  white_meat: { name: "White Meat", description: "Common light meat used in everyday cooking.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  red_meat: { name: "Red Meat", description: "Common red meat used in everyday cooking.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  fur: { name: "Fur", description: "Animal fur used in crafting.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  hide: { name: "Boar Hide", description: "A tough hide recovered from a Wild Boar.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  tusk: { name: "Boar Tusk", description: "A sturdy tusk recovered intact from a Wild Boar.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  wolf_pelt: { name: "Wolf Pelt", description: "A thick pelt from a forest wolf.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  fang: { name: "Large Fang", description: "A large fang preserved while processing a Forest Wolf.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  slime_gel: { name: "Slime Gel", description: "Gel gathered from a defeated slime.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  weak_monster_core: { name: "Weak Monster Core", description: "A faintly glowing monster core.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  ember_feather: { name: "Ember Feather", description: "A warm feather from an Ember creature.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  rooster_comb: { name: "Rooster Comb", description: "A rare comb recovered from an Ember Rooster.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  elder_ember_comb: { name: "Elder Ember Rooster Comb", description: "A rare, flame-touched boss material from an Elder Ember Rooster.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  beetle_shell: { name: "Beetle Shell", description: "A sturdy shell left behind by a Thorn Beetle.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  mushroom: { name: "Mushroom", description: "A common forest mushroom used as a cooking ingredient.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  mushroom_rare: { name: "Rare Mushroom", description: "An unusual purple mushroom prized as a rare cooking ingredient.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  nuts: { name: "Nuts", description: "A handful of forest nuts used as a cooking ingredient.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  bark: { name: "Bark", description: "Strips of sturdy tree bark used in crafting.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  charred_wood: { name: "Charred Wood", description: "Fire-blackened wood that still holds traces of heat.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  leather: { name: "Leather", description: "Processed animal hide used to craft durable equipment.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  sap: { name: "Sap", description: "Sticky tree sap used in crafting and alchemy.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  spices: { name: "Spices", description: "A fragrant imported blend used in uncommon recipes.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  wine: { name: "Wine", description: "Imported regional wine for drinks and refined recipes.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  alchemical_ingredients: { name: "Alchemical Ingredients", description: "An assortment of imported reagents for alchemy.", attributes: [ITEM_ATTRIBUTE.INGREDIENT, ITEM_ATTRIBUTE.MATERIAL] },
  holy_herb: { name: "Holy Herb", description: "A carefully cultivated temple herb used in sacred remedies.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  medicinal_herb: { name: "Medicinal Herb", description: "A potent healing herb selected by the temple sisters.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  blessed_water: { name: "Blessed Water", description: "Purified water blessed at the Temple of the Returning Light.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  incense: { name: "Incense", description: "Aromatic temple incense used in purification recipes.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  purified_salt: { name: "Purified Salt", description: "Ritually purified salt used for protection and alchemy.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
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
    name: "White Stew", description: "A hearty stew made with white meat. Restores 45 Stamina and 25 Life.", attributes: [ITEM_ATTRIBUTE.EDIBLE],
    mealTags: [MEAL_TAG.MEAT, MEAL_TAG.HEALTHY, MEAL_TAG.HEARTY, MEAL_TAG.WARM, MEAL_TAG.HERBS],
    staminaRecovery: 45, lifeRecovery: 25, baseSellPriceCopper: 44,
  },
  stew_beef: {
    name: "Red Stew",
    description: "A hearty, warming red-meat stew. Restores 40 Stamina and 40 Life.",
    attributes: [ITEM_ATTRIBUTE.EDIBLE],
    mealTags: [MEAL_TAG.MEAT, MEAL_TAG.HEARTY, MEAL_TAG.WARM, MEAL_TAG.HERBS],
    staminaRecovery: 40, lifeRecovery: 40, baseSellPriceCopper: 49,
  },
  stew_fisherman: {
    name: "Fisherman Stew", description: "Restores 40 Stamina and 25 Life.", attributes: [ITEM_ATTRIBUTE.EDIBLE],
    mealTags: [MEAL_TAG.HEALTHY, MEAL_TAG.HEARTY, MEAL_TAG.WARM, MEAL_TAG.HERBS],
    staminaRecovery: 40, lifeRecovery: 25, baseSellPriceCopper: 48,
  },
  pan_fried_eggs: {
    name: "Fried Eggs", description: "Two fried eggs seasoned with herbs. Restores 30 Stamina and 10 Life.",
    attributes: [ITEM_ATTRIBUTE.EDIBLE], mealTags: [MEAL_TAG.VEGETARIAN, MEAL_TAG.HEALTHY, MEAL_TAG.WARM],
    staminaRecovery: 30, lifeRecovery: 10, baseSellPriceCopper: 28,
  },
  pan_fishermans_fry: {
    name: "Fisherman's Fry", description: "Pan-fried fish with tomato and herbs. Restores 35 Stamina and 20 Life.",
    attributes: [ITEM_ATTRIBUTE.EDIBLE], mealTags: [MEAL_TAG.HEALTHY, MEAL_TAG.HEARTY, MEAL_TAG.WARM, MEAL_TAG.HERBS],
    staminaRecovery: 35, lifeRecovery: 20, baseSellPriceCopper: 42,
  },
  pan_meat_and_carrots: {
    name: "Meat and Carrots", description: "White meat fried with carrots and herbs. Restores 35 Stamina and 20 Life.",
    attributes: [ITEM_ATTRIBUTE.EDIBLE], mealTags: [MEAL_TAG.MEAT, MEAL_TAG.HEALTHY, MEAL_TAG.HEARTY, MEAL_TAG.WARM, MEAL_TAG.HERBS],
    staminaRecovery: 35, lifeRecovery: 20, baseSellPriceCopper: 30,
  },
  pan_meat_skillet: {
    name: "Meat Skillet", description: "Red meat fried with potatoes and herbs. Restores 35 Stamina and 30 Life.",
    attributes: [ITEM_ATTRIBUTE.EDIBLE], mealTags: [MEAL_TAG.MEAT, MEAL_TAG.HEARTY, MEAL_TAG.WARM, MEAL_TAG.HERBS],
    staminaRecovery: 35, lifeRecovery: 30, baseSellPriceCopper: 37,
  },
  pan_mushroom_skillet: {
    name: "Mushroom Skillet", description: "Mushrooms fried with onion and herbs. Restores 25 Stamina and 10 Life.",
    attributes: [ITEM_ATTRIBUTE.EDIBLE], mealTags: [MEAL_TAG.VEGETARIAN, MEAL_TAG.HEALTHY, MEAL_TAG.WARM, MEAL_TAG.HERBS],
    staminaRecovery: 25, lifeRecovery: 10, baseSellPriceCopper: 22,
  },
  pan_fried_potatoes: {
    name: "Pan-Fried Potatoes", description: "Crisp potatoes seasoned with herbs. Restores 35 Stamina.",
    attributes: [ITEM_ATTRIBUTE.EDIBLE], mealTags: [MEAL_TAG.VEGETARIAN, MEAL_TAG.HEARTY, MEAL_TAG.WARM, MEAL_TAG.HERBS],
    staminaRecovery: 35, baseSellPriceCopper: 20,
  },
  pan_ember_chicken_skillet: {
    name: "Ember Chicken Skillet", description: "Restores 45 Stamina and 25 Life. Grants Fire Resistance +3 for 1 day.",
    attributes: [ITEM_ATTRIBUTE.EDIBLE], mealTags: [MEAL_TAG.MEAT, MEAL_TAG.HEARTY, MEAL_TAG.WARM, MEAL_TAG.HERBS],
    staminaRecovery: 45, lifeRecovery: 25, baseSellPriceCopper: 57,
    grantedStatusEffectId: "fire_resistance_3",
  },
  pan_farmhouse: {
    name: "Farmhouse Pan", description: "Pan-fried potatoes served with onion and egg. Restores 50 Stamina and 20 Life.",
    attributes: [ITEM_ATTRIBUTE.EDIBLE],
    mealTags: [MEAL_TAG.VEGETARIAN, MEAL_TAG.HEALTHY, MEAL_TAG.HEARTY, MEAL_TAG.WARM],
    staminaRecovery: 50, lifeRecovery: 20, baseSellPriceCopper: 47,
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
  chicken:     { name: "White Meat",       description: "Common light meat used in everyday cooking.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  beef:        { name: "Red Meat",         description: "Common red meat used in everyday cooking.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  fish:        { name: "Fish Meat",        description: "Fresh fish meat used for cooking.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  tomato:      { name: "Tomato",           description: "A ripe tomato used for cooking.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  lettuce:     { name: "Lettuce",          description: "Crisp lettuce used for salads and cold dishes.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  cucumber:    { name: "Cucumber",         description: "A fresh cucumber used for salads and cold dishes.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  spinach:     { name: "Spinach",          description: "Fresh leafy spinach used as a cooking ingredient.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
  snowberry:   { name: "Snowberry",        description: "A pale winter berry.", attributes: [ITEM_ATTRIBUTE.INGREDIENT] },
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
    name: "Low Grade Stamina Potion",
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
  rope:        { name: "Rope",             description: "Strong utility rope for travel and crafting.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  empty_bottle:{ name: "Empty Bottle",     description: "An empty glass bottle for potions and other liquids.", attributes: [ITEM_ATTRIBUTE.VESSEL] },
  coal:        { name: "Coal",             description: "Fuel left behind by a spent torch.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  nails:       { name: "Nails",            description: "Iron nails for woodworking and construction.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  paint:       { name: "Paint",            description: "A bucket of paint for renovating the tavern.", attributes: [] },
  ore_iron:    { name: "Iron Ore",         description: "Raw iron ore that can be refined by a blacksmith.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  ore_copper:  { name: "Copper Ore",       description: "Raw copper ore that can be refined by a blacksmith.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  ore_silver:  { name: "Silver Ore",       description: "Raw silver ore that can be refined by a blacksmith.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  ore_gold:    { name: "Gold Ore",         description: "Raw gold ore that can be refined by a blacksmith.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  ingot_iron:  { name: "Iron Ingot",       description: "A refined iron ingot used for crafting.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  ingot_copper:{ name: "Copper Ingot",     description: "A refined copper ingot used for crafting.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  ingot_silver:{ name: "Silver Ingot",     description: "A refined silver ingot used for advanced crafting.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  ingot_gold:  { name: "Gold Ingot",       description: "A refined gold ingot used for valuable crafting projects.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  ingot_steel: { name: "Steel Ingot",      description: "A durable steel ingot used for high-quality equipment.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  shard_mana:  { name: "Mana Shard",       description: "A small crystalline fragment filled with mana.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  stone_mana:  { name: "Mana Stone",       description: "A concentrated mana stone used in rare crafting.", attributes: [ITEM_ATTRIBUTE.MATERIAL] },
  tool_rusty_butchering_knife: {
    name: "Rusty Butchering Knife",
    description: "A worn but usable butchering tool. Durability 20/20.",
    attributes: [ITEM_ATTRIBUTE.TOOL],
    maxDurability: RUSTY_BUTCHERING_KNIFE_MAX_DURABILITY,
  },
  tool_iron_butchering_knife: {
    name: "Iron Butchering Knife",
    description: "A reliable iron knife for processing monster carcasses. Durability 40/40.",
    attributes: [ITEM_ATTRIBUTE.TOOL],
    maxDurability: 40,
  },
  tool_steel_butchering_knife: {
    name: "Steel Butchering Knife",
    description: "A high-quality knife with the best yield and rare-material recovery. Durability 60/60.",
    attributes: [ITEM_ATTRIBUTE.TOOL],
    maxDurability: 60,
  },
  tool_kitchen_knife: {
    name: "Cooking Knife",
    description: "A permanent cooking tool for precise preparation.",
    attributes: [ITEM_ATTRIBUTE.TOOL],
  },
  torch: {
    name: "Torch",
    description: "Reduces Dungeon activity Stamina costs by 2 while equipped. Leaves Coal when its 50 Durability is spent.",
    attributes: [ITEM_ATTRIBUTE.TOOL],
    maxDurability: 50,
  },
  return_bell: {
    name: "Return Bell",
    description: "Returns the adventurer immediately from a Dungeon, even during combat.",
    attributes: [],
  },
  quest_hunters_documents: {
    name: "Research Documents",
    description: "A field bag containing the researchers' abandoned documents. Quest item.",
    attributes: [ITEM_ATTRIBUTE.QUEST_ITEM],
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
  fine_cooking_pot: { name: "Fine Cooking Pot", description: "A finely crafted cooking pot for advanced recipes.", attributes: [ITEM_ATTRIBUTE.TOOL] },
};

function itemId(itemOrId: BagItem | string): string {
  return normalizeItemId(typeof itemOrId === "string" ? itemOrId : itemOrId.id);
}

/** Resolve per-instance durability, falling back to the catalog only for untouched items. */
export function getItemDurability(item: BagItem): ItemDurability | null {
  const catalogMaximum = ITEM_CATALOG[itemId(item)]?.maxDurability;
  const rawMaximum = item.maxDurability ?? catalogMaximum;
  if (rawMaximum === undefined || !Number.isFinite(Number(rawMaximum))) return null;
  const maximum = Math.max(0, Math.floor(Number(rawMaximum)));
  if (maximum <= 0) return null;
  const rawCurrent = item.durability ?? maximum;
  const numericCurrent = Number(rawCurrent);
  const current = Number.isFinite(numericCurrent)
    ? Math.max(0, Math.min(maximum, Math.floor(numericCurrent)))
    : maximum;
  return { current, maximum };
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
