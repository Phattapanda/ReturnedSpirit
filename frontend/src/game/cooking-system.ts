import AsyncStorage from "@react-native-async-storage/async-storage";

import { ITEM_CATALOG, type BagItem, type MealTag } from "@/src/game/item-system";

export const DISCOVERED_RECIPES_KEY = "@kitchen:discovered_recipes";

export type CookingRecipe = {
  id: string;
  name: string;
  ingredients: readonly { id: string; quantity: number }[];
  toolId: string | null;
  outputId: string;
  outputQuantity: number;
  byproducts?: readonly { id: string; quantity: number }[];
  sellPriceCopper: number;
  staminaRecovery: number;
  lifeRecovery: number;
  tags: readonly MealTag[];
};

export const COOKING_RECIPES: readonly CookingRecipe[] = [
  {
    id: "herbsoup",
    name: "Herb Soup",
    ingredients: [
      { id: "herbs", quantity: 2 },
      { id: "bucketwater", quantity: 1 },
    ],
    toolId: "oldpot",
    outputId: "herbsoup",
    outputQuantity: 2,
    byproducts: [{ id: "bucket", quantity: 1 }],
    sellPriceCopper: 9,
    staminaRecovery: 20,
    lifeRecovery: 0,
    tags: ["warm", "vegetarian", "soup", "healthy", "herbs"],
  },
  {
    id: "carrotsoup",
    name: "Carrot Soup",
    ingredients: [
      { id: "carrot", quantity: 1 },
      { id: "herbs", quantity: 1 },
      { id: "bucketwater", quantity: 1 },
    ],
    toolId: "oldpot",
    outputId: "carrotsoup",
    outputQuantity: 1,
    byproducts: [{ id: "bucket", quantity: 1 }],
    sellPriceCopper: 11,
    staminaRecovery: 15,
    lifeRecovery: 5,
    tags: ["warm", "vegetarian", "soup", "healthy", "herbs"],
  },
  {
    id: "carrotpotatosoup",
    name: "Carrot and Potato Soup",
    ingredients: [
      { id: "carrot", quantity: 1 },
      { id: "potato", quantity: 1 },
      { id: "herbsoup", quantity: 1 },
    ],
    toolId: "oldpot",
    outputId: "carrotpotatosoup",
    outputQuantity: 1,
    sellPriceCopper: 23,
    staminaRecovery: 40,
    lifeRecovery: 5,
    tags: ["warm", "vegetarian", "soup", "healthy", "hearty", "herbs"],
  },
  {
    id: "boiledpotato",
    name: "Boiled Potato",
    ingredients: [
      { id: "potato", quantity: 1 },
      { id: "herbs", quantity: 1 },
      { id: "bucketwater", quantity: 1 },
    ],
    toolId: "oldpot",
    outputId: "boiledpotato",
    outputQuantity: 1,
    byproducts: [{ id: "bucket", quantity: 1 }],
    sellPriceCopper: 13,
    staminaRecovery: 25,
    lifeRecovery: 0,
    tags: ["warm", "vegetarian", "healthy", "hearty", "herbs"],
  },
] as const;

function ingredientTotals(slots: readonly (BagItem | null)[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const slot of slots) {
    if (slot) totals.set(slot.id, (totals.get(slot.id) ?? 0) + slot.quantity);
  }
  return totals;
}

export function findCookingRecipe(
  ingredientSlots: readonly (BagItem | null)[],
  tool: BagItem | null,
): CookingRecipe | null {
  const totals = ingredientTotals(ingredientSlots);
  return COOKING_RECIPES.find((recipe) => {
    if ((tool?.id ?? null) !== recipe.toolId || (tool && tool.quantity !== 1)) return false;
    if (totals.size !== recipe.ingredients.length) return false;
    return recipe.ingredients.every((ingredient) => (totals.get(ingredient.id) ?? 0) >= ingredient.quantity);
  }) ?? null;
}

export function createCraftedItem(itemId: string, quantity: number): BagItem {
  const catalog = ITEM_CATALOG[itemId];
  return {
    id: itemId,
    itemType: itemId,
    name: catalog?.name ?? itemId,
    quantity,
    attributes: catalog?.attributes ? [...catalog.attributes] : undefined,
    mealTags: catalog?.mealTags ? [...catalog.mealTags] : undefined,
  };
}

export function consumeRecipeIngredients(
  ingredientSlots: readonly (BagItem | null)[],
  recipe: CookingRecipe,
): (BagItem | null)[] | null {
  const remaining = new Map(recipe.ingredients.map((item) => [item.id, item.quantity]));
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

export function createRecipeOutputs(recipe: CookingRecipe): BagItem[] {
  return [
    createCraftedItem(recipe.outputId, recipe.outputQuantity),
    ...(recipe.byproducts ?? []).map((item) => createCraftedItem(item.id, item.quantity)),
  ];
}

export async function loadDiscoveredRecipes(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(DISCOVERED_RECIPES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? [...new Set(parsed.filter((id): id is string => typeof id === "string"))]
      : [];
  } catch {
    return [];
  }
}

export async function discoverRecipe(recipeId: string): Promise<string[]> {
  const current = await loadDiscoveredRecipes();
  if (current.includes(recipeId)) return current;
  const next = [...current, recipeId];
  await AsyncStorage.setItem(DISCOVERED_RECIPES_KEY, JSON.stringify(next));
  return next;
}
