import AsyncStorage from "@react-native-async-storage/async-storage";

import { ITEM_CATALOG, normalizeItemId, type BagItem, type MealTag } from "@/src/game/item-system";
import {
  getButcheringDefinition,
  getButcheringKnifeTier,
  rollButcheringOutputs,
} from "@/src/game/butchering-system";

export const DISCOVERED_RECIPES_KEY = "@kitchen:discovered_recipes";

export type CookingRecipe = {
  id: string; name: string; stage: 1 | 2 | 3; rarity: "common" | "uncommon" | "rare"; unlock: string;
  ingredients: readonly { id: string; quantity: number }[]; toolId: string | null;
  outputId: string; outputQuantity: number; byproducts?: readonly { id: string; quantity: number }[];
  sellPriceCopper: number; staminaRecovery: number; lifeRecovery: number; tags: readonly MealTag[];
  buff?: { effectId: string; name: string; intensity: number; durationDays: number };
};

export const COOKING_RECIPES: readonly CookingRecipe[] = [
  {
    id: "soup_herb", name: "Herb Soup", stage: 1, rarity: "common", unlock: "Start",
    ingredients: [{ id: "herbs", quantity: 2 }, { id: "bucketwater", quantity: 1 }],
    // The existing tutorial splits the cooked batch into one guest serving and one player serving.
    toolId: "oldpot", outputId: "soup_herb", outputQuantity: 2, byproducts: [{ id: "bucket", quantity: 1 }],
    sellPriceCopper: 9, staminaRecovery: 15, lifeRecovery: 0,
    tags: ["warm", "vegetarian", "soup", "healthy", "herbs"],
  },
  {
    id: "soup_carrot", name: "Carrot Soup", stage: 1, rarity: "common", unlock: "Early",
    ingredients: [{ id: "carrot", quantity: 2 }, { id: "bucketwater", quantity: 1 }],
    toolId: "oldpot", outputId: "soup_carrot", outputQuantity: 2, byproducts: [{ id: "bucket", quantity: 1 }],
    sellPriceCopper: 13, staminaRecovery: 20, lifeRecovery: 0,
    tags: ["warm", "vegetarian", "soup", "healthy"],
  },
  {
    id: "soup_potato", name: "Potato Soup", stage: 1, rarity: "common", unlock: "Early",
    ingredients: [{ id: "potato", quantity: 2 }, { id: "bucketwater", quantity: 1 }],
    toolId: "oldpot", outputId: "soup_potato", outputQuantity: 2, byproducts: [{ id: "bucket", quantity: 1 }],
    sellPriceCopper: 17, staminaRecovery: 30, lifeRecovery: 0,
    tags: ["warm", "vegetarian", "soup", "hearty"],
  },
  {
    id: "soup_onion", name: "Onion Soup", stage: 1, rarity: "common", unlock: "Early",
    ingredients: [{ id: "onion", quantity: 2 }, { id: "bucketwater", quantity: 1 }],
    toolId: "oldpot", outputId: "soup_onion", outputQuantity: 2, byproducts: [{ id: "bucket", quantity: 1 }],
    sellPriceCopper: 21, staminaRecovery: 20, lifeRecovery: 10,
    tags: ["warm", "vegetarian", "soup", "healthy"],
  },
  {
    id: "soup_carrot_potato", name: "Carrot-Potato Soup", stage: 1, rarity: "common", unlock: "Early",
    ingredients: [{ id: "carrot", quantity: 1 }, { id: "potato", quantity: 1 }, { id: "bucketwater", quantity: 1 }],
    toolId: "oldpot", outputId: "soup_carrot_potato", outputQuantity: 2, byproducts: [{ id: "bucket", quantity: 1 }],
    sellPriceCopper: 15, staminaRecovery: 25, lifeRecovery: 10,
    tags: ["warm", "vegetarian", "soup", "healthy", "hearty"],
  },
  {
    id: "stew_vegetable", name: "Vegetable Stew", stage: 1, rarity: "common", unlock: "Early",
    ingredients: [{ id: "carrot", quantity: 1 }, { id: "potato", quantity: 1 }, { id: "onion", quantity: 1 }],
    toolId: "oldpot", outputId: "stew_vegetable", outputQuantity: 2,
    sellPriceCopper: 24, staminaRecovery: 35, lifeRecovery: 20,
    tags: ["warm", "vegetarian", "healthy", "hearty"],
  },
  {
    id: "stew_chicken", name: "White Stew", stage: 2, rarity: "uncommon", unlock: "Mid",
    ingredients: [{ id: "soup_carrot_potato", quantity: 1 }, { id: "white_meat", quantity: 1 }, { id: "herbs", quantity: 1 }],
    toolId: "cooking_pot", outputId: "stew_chicken", outputQuantity: 2,
    sellPriceCopper: 44, staminaRecovery: 45, lifeRecovery: 25,
    tags: ["warm", "meat", "healthy", "hearty", "herbs"],
  },
  {
    id: "stew_beef", name: "Red Stew", stage: 2, rarity: "uncommon", unlock: "Mid",
    ingredients: [{ id: "soup_carrot_potato", quantity: 1 }, { id: "red_meat", quantity: 1 }, { id: "herbs", quantity: 1 }],
    toolId: "cooking_pot", outputId: "stew_beef", outputQuantity: 2,
    sellPriceCopper: 49, staminaRecovery: 40, lifeRecovery: 40,
    tags: ["warm", "meat", "hearty", "herbs"],
  },
  {
    id: "stew_fisherman", name: "Fisherman Stew", stage: 2, rarity: "uncommon", unlock: "Mid",
    ingredients: [{ id: "soup_potato", quantity: 1 }, { id: "fish", quantity: 1 }, { id: "herbs", quantity: 1 }],
    toolId: "cooking_pot", outputId: "stew_fisherman", outputQuantity: 2,
    sellPriceCopper: 48, staminaRecovery: 40, lifeRecovery: 25,
    tags: ["warm", "healthy", "hearty", "herbs"],
  },
  {
    id: "pan_farmhouse", name: "Farmhouse Pan", stage: 2, rarity: "uncommon", unlock: "Mid",
    ingredients: [{ id: "potato", quantity: 1 }, { id: "egg", quantity: 1 }, { id: "onion", quantity: 1 }],
    toolId: "frying_pan", outputId: "pan_farmhouse", outputQuantity: 2,
    sellPriceCopper: 35, staminaRecovery: 45, lifeRecovery: 15,
    tags: ["warm", "vegetarian", "healthy", "hearty"],
  },
  {
    id: "stew_ember_chicken", name: "Ember Chicken Stew", stage: 2, rarity: "rare", unlock: "Monster Cooking I",
    ingredients: [{ id: "soup_carrot_potato", quantity: 1 }, { id: "ember_chicken_meat", quantity: 1 }, { id: "herbs", quantity: 1 }],
    toolId: "cooking_pot", outputId: "stew_ember_chicken", outputQuantity: 2,
    sellPriceCopper: 64, staminaRecovery: 45, lifeRecovery: 30,
    tags: ["warm", "meat", "hearty", "herbs"],
    buff: { effectId: "fire_resistance_3", name: "Fire Resistance +3", intensity: 3, durationDays: 1 },
  },
  {
    id: "soup_ember_egg", name: "Ember Egg Soup", stage: 2, rarity: "rare", unlock: "Monster Cooking I",
    ingredients: [{ id: "soup_onion", quantity: 1 }, { id: "ember_chicken_egg", quantity: 1 }, { id: "tomato", quantity: 1 }],
    toolId: "cooking_pot", outputId: "soup_ember_egg", outputQuantity: 2,
    sellPriceCopper: 72, staminaRecovery: 35, lifeRecovery: 20,
    tags: ["warm", "soup", "healthy", "hearty"],
    buff: { effectId: "fire_resistance_2", name: "Fire Resistance +2", intensity: 2, durationDays: 1 },
  },
] as const;

function ingredientTotals(slots: readonly (BagItem | null)[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const slot of slots) if (slot) totals.set(slot.id, (totals.get(slot.id) ?? 0) + slot.quantity);
  return totals;
}

const COOKING_POT_LEVELS: Readonly<Record<string, number>> = {
  oldpot: 1,
  cooking_pot: 2,
  fine_cooking_pot: 3,
};

/** Higher-level cooking pots can satisfy recipes written for a lower-level pot. */
export function isCookingToolCompatible(actualToolId: string | null, requiredToolId: string | null): boolean {
  if (actualToolId === requiredToolId) return true;
  if (!actualToolId || !requiredToolId) return false;
  const actualLevel = COOKING_POT_LEVELS[actualToolId];
  const requiredLevel = COOKING_POT_LEVELS[requiredToolId];
  return actualLevel !== undefined && requiredLevel !== undefined && actualLevel >= requiredLevel;
}

function findButcheringRecipe(ingredientSlots: readonly (BagItem | null)[], tool: BagItem | null): CookingRecipe | null {
  const knifeTier = getButcheringKnifeTier(tool?.id);
  if (!tool || !knifeTier) return null;
  const occupied = ingredientSlots.filter((item): item is BagItem => item !== null);
  if (!occupied.length || occupied.some((item) => item.id !== "monster_carcass")) return null;
  const monsterIds = [...new Set(occupied.map((item) => item.monsterId).filter((id): id is string => typeof id === "string"))];
  if (monsterIds.length !== 1) return null;
  const definition = getButcheringDefinition(monsterIds[0]);
  if (!definition) return null;
  return {
    id: `butcher_${monsterIds[0]}`, name: definition.recipeName, stage: 2, rarity: "common", unlock: ITEM_CATALOG[tool.id]?.name ?? "Butchering Knife",
    ingredients: [{ id: "monster_carcass", quantity: 1 }], toolId: tool.id,
    outputId: definition.primary.id, outputQuantity: definition.primary.ranges[knifeTier - 1][0],
    byproducts: definition.secondary.map((material) => ({ id: material.id, quantity: material.ranges[knifeTier - 1][0] })),
    sellPriceCopper: 0, staminaRecovery: 0, lifeRecovery: 0, tags: [],
  };
}

function carcassesPerCraft(recipe: CookingRecipe): number {
  return recipe.ingredients.reduce(
    (total, ingredient) => total + (ingredient.id.toLocaleLowerCase().includes("carcass") ? ingredient.quantity : 0),
    0,
  );
}

/** Number of complete recipe batches supported by the current ingredient stacks and tool. */
export function getCraftableRecipeCount(
  ingredientSlots: readonly (BagItem | null)[],
  recipe: CookingRecipe,
  tool: BagItem | null,
): number {
  if (!isCookingToolCompatible(tool?.id ?? null, recipe.toolId) || (tool && tool.quantity !== 1)) return 0;

  const totals = ingredientTotals(ingredientSlots);
  let craftCount = recipe.ingredients.reduce(
    (count, ingredient) => Math.min(count, Math.floor((totals.get(ingredient.id) ?? 0) / ingredient.quantity)),
    Number.POSITIVE_INFINITY,
  );
  if (!Number.isFinite(craftCount)) craftCount = 0;

  const recipeToolId = recipe.toolId;
  if (recipeToolId && getButcheringKnifeTier(recipeToolId)) {
    const durabilityPerCraft = carcassesPerCraft(recipe);
    if (durabilityPerCraft > 0) {
      const catalogMaximum = ITEM_CATALOG[recipeToolId]?.maxDurability ?? 0;
      const availableDurability = Math.max(0, tool?.durability ?? tool?.maxDurability ?? catalogMaximum);
      craftCount = Math.min(craftCount, Math.floor(availableDurability / durabilityPerCraft));
    }
  }

  return Math.max(0, craftCount);
}

export function findCookingRecipe(ingredientSlots: readonly (BagItem | null)[], tool: BagItem | null): CookingRecipe | null {
  const butchering = findButcheringRecipe(ingredientSlots, tool);
  if (butchering) return butchering;
  const totals = ingredientTotals(ingredientSlots);
  return COOKING_RECIPES.find((recipe) => {
    if (!isCookingToolCompatible(tool?.id ?? null, recipe.toolId) || (tool && tool.quantity !== 1)) return false;
    if (totals.size !== recipe.ingredients.length) return false;
    return recipe.ingredients.every((ingredient) => (totals.get(ingredient.id) ?? 0) >= ingredient.quantity) &&
      getCraftableRecipeCount(ingredientSlots, recipe, tool) > 0;
  }) ?? null;
}

export function createCraftedItem(itemId: string, quantity: number): BagItem {
  const catalog = ITEM_CATALOG[itemId];
  return { id: itemId, itemType: itemId, name: catalog?.name ?? itemId, quantity,
    attributes: catalog?.attributes ? [...catalog.attributes] : undefined,
    mealTags: catalog?.mealTags ? [...catalog.mealTags] : undefined };
}

export function consumeRecipeIngredients(
  ingredientSlots: readonly (BagItem | null)[],
  recipe: CookingRecipe,
  craftCount = 1,
): (BagItem | null)[] | null {
  if (!Number.isInteger(craftCount) || craftCount < 1) return null;
  const remaining = new Map(recipe.ingredients.map((item) => [item.id, item.quantity * craftCount]));
  const next = ingredientSlots.map((slot): BagItem | null => {
    if (!slot) return null;
    const needed = remaining.get(slot.id) ?? 0;
    if (needed <= 0) return { ...slot };
    const used = Math.min(needed, slot.quantity);
    remaining.set(slot.id, needed - used);
    return slot.quantity > used ? { ...slot, quantity: slot.quantity - used } : null;
  });
  return [...remaining.values()].every((quantity) => quantity === 0) ? next : null;
}

export function createRecipeOutputs(
  recipe: CookingRecipe,
  craftCount = 1,
  maxStackQuantity = Number.POSITIVE_INFINITY,
  luck = 0,
  tool: BagItem | null = null,
): BagItem[] {
  const isButchering = recipe.id.startsWith("butcher_");
  if (isButchering && tool && getButcheringKnifeTier(tool.id)) {
    const monsterId = recipe.id.slice("butcher_".length);
    return rollButcheringOutputs(monsterId, tool.id, luck, craftCount).flatMap((output) => {
      const stacks: BagItem[] = [];
      let remaining = output.quantity;
      while (remaining > 0) {
        const quantity = Math.min(remaining, maxStackQuantity);
        stacks.push(createCraftedItem(output.id, quantity));
        remaining -= quantity;
      }
      return stacks;
    });
  }
  const outputs = [
    { id: recipe.outputId, quantity: recipe.outputQuantity * craftCount },
    ...(recipe.byproducts ?? []).map((item) => ({ id: item.id, quantity: item.quantity * craftCount })),
  ];

  return outputs.flatMap((output) => {
    const stacks: BagItem[] = [];
    let remaining = output.quantity;
    while (remaining > 0) {
      const quantity = Math.min(remaining, maxStackQuantity);
      stacks.push(createCraftedItem(output.id, quantity));
      remaining -= quantity;
    }
    return stacks;
  });
}

/** Cooking pots stay unchanged; a butchering knife loses one durability per processed carcass. */
export function applyRecipeToolUse(
  tool: BagItem | null,
  recipe: CookingRecipe,
  craftCount = 1,
): BagItem | null {
  if (!tool || !getButcheringKnifeTier(recipe.toolId) || tool.id !== recipe.toolId) return tool ? { ...tool } : null;

  const durabilityCost = carcassesPerCraft(recipe) * craftCount;
  if (durabilityCost <= 0) return { ...tool };

  const catalogMaximum = ITEM_CATALOG[tool.id]?.maxDurability ?? 0;
  const maximum = tool.maxDurability ?? catalogMaximum;
  const remaining = Math.max(0, (tool.durability ?? maximum) - durabilityCost);
  return remaining > 0 ? { ...tool, durability: remaining, maxDurability: maximum } : null;
}

export async function loadDiscoveredRecipes(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(DISCOVERED_RECIPES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? [...new Set(parsed.filter((id): id is string => typeof id === "string").map(normalizeItemId))]
      : [];
  } catch { return []; }
}

export async function discoverRecipe(recipeId: string): Promise<string[]> {
  const current = await loadDiscoveredRecipes();
  if (current.includes(recipeId)) return current;
  const next = [...current, recipeId];
  await AsyncStorage.setItem(DISCOVERED_RECIPES_KEY, JSON.stringify(next));
  return next;
}
