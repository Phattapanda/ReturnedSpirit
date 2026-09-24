import AsyncStorage from "@react-native-async-storage/async-storage";
import { COOKING_RECIPES, DISCOVERED_RECIPES_KEY, loadDiscoveredRecipes, type CookingRecipe } from "./cooking-system";
import { KITCHEN_TABLE_KEY, PLAYER_BAG_KEY, type BagItem, type PlayerBagData } from "./item-system";

export const DISCOVERED_ALCHEMY_RECIPES_KEY = "@workshop:discovered_alchemy_recipes";
export const MONSTER_RECIPE_BASE_DROP_CHANCE = 3;
export const MONSTER_RECIPE_LUCK_BONUS_PER_POINT = 2;

export type RecipeItemId = "recipe" | "alchemy_recipe";

export function getMonsterRecipeDropChance(luck: number): number {
  return Math.min(100, Math.max(0, MONSTER_RECIPE_BASE_DROP_CHANCE + Math.max(0, luck) * MONSTER_RECIPE_LUCK_BONUS_PER_POINT));
}

export function rollMonsterRecipeDrops(luck: number, random = Math.random): RecipeItemId[] {
  const chance = getMonsterRecipeDropChance(luck) / 100;
  const drops: RecipeItemId[] = [];
  if (random() < chance) drops.push("recipe");
  if (random() < chance) drops.push("alchemy_recipe");
  return drops;
}

const KITCHEN_RECIPE_TOOL_IDS = new Set(["oldpot", "cooking_pot", "fine_cooking_pot", "frying_pan", "tool_kitchen_knife"]);
const WORKSHOP_RECIPE_TOOL_IDS = new Set(["mortar_and_pestle", "distiller"]);

export function isKitchenRecipe(recipe: CookingRecipe): boolean {
  return !recipe.hiddenFromRecipeBook && KITCHEN_RECIPE_TOOL_IDS.has(recipe.toolId ?? "");
}

export function isAlchemyRecipe(recipe: CookingRecipe): boolean {
  return !recipe.hiddenFromRecipeBook && (recipe.toolId === null || WORKSHOP_RECIPE_TOOL_IDS.has(recipe.toolId));
}

export function rollRecipeDrops(recipe: CookingRecipe, count: number, random = Math.random): number {
  // Only cooking, not alchemy, butchering, seasoning or equipment crafting.
  if (!isKitchenRecipe(recipe)) return 0;
  let drops = 0;
  for (let i = 0; i < count; i += 1) if (random() < 0.05) drops += 1;
  return drops;
}

export function rollAlchemyRecipeDrops(recipe: CookingRecipe, count: number, random = Math.random): number {
  if (!isAlchemyRecipe(recipe)) return 0;
  let drops = 0;
  for (let i = 0; i < count; i += 1) if (random() < 0.05) drops += 1;
  return drops;
}

export async function loadDiscoveredAlchemyRecipes(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(DISCOVERED_ALCHEMY_RECIPES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? [...new Set(parsed.filter((id): id is string => typeof id === "string"))] : [];
  } catch { return []; }
}

export async function discoverAlchemyRecipe(recipeId: string): Promise<string[]> {
  const current = await loadDiscoveredAlchemyRecipes();
  if (current.includes(recipeId)) return current;
  const next = [...current, recipeId];
  await AsyncStorage.setItem(DISCOVERED_ALCHEMY_RECIPES_KEY, JSON.stringify(next));
  return next;
}

let reading = false;
export async function readRecipeItem(key: typeof KITCHEN_TABLE_KEY | typeof PLAYER_BAG_KEY, slot: number) {
  if (reading) return null;
  reading = true;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const container = JSON.parse(raw) as PlayerBagData | (BagItem | null)[];
    const slots = Array.isArray(container) ? container : container.slots;
    const item = slots[slot];
    if (!item || item.id !== "recipe" || item.quantity < 1) return null;
    const known = await loadDiscoveredRecipes();
    const unknown = COOKING_RECIPES.filter((recipe) => isKitchenRecipe(recipe) && !known.includes(recipe.id));
    if (!unknown.length) return { allKnown: true as const };
    const recipe = unknown[Math.floor(Math.random() * unknown.length)];
    const ids = [...known, recipe.id];
    slots[slot] = item.quantity > 1 ? { ...item, quantity: item.quantity - 1 } : null;
    await AsyncStorage.multiSet([
      [key, JSON.stringify(container)],
      [DISCOVERED_RECIPES_KEY, JSON.stringify(ids)],
    ]);
    return { allKnown: false as const, recipe, ids, slots, bag: Array.isArray(container) ? null : container };
  } finally {
    reading = false;
  }
}


export async function readAlchemyRecipeItem(key: typeof PLAYER_BAG_KEY, slot: number) {
  if (reading) return null;
  reading = true;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const container = JSON.parse(raw) as PlayerBagData;
    const slots = container.slots;
    const item = slots[slot];
    if (!item || item.id !== "alchemy_recipe" || item.quantity < 1) return null;
    const known = await loadDiscoveredAlchemyRecipes();
    const unknown = COOKING_RECIPES.filter((recipe) => isAlchemyRecipe(recipe) && !known.includes(recipe.id));
    if (!unknown.length) return { allKnown: true as const };
    const recipe = unknown[Math.floor(Math.random() * unknown.length)];
    const ids = [...known, recipe.id];
    slots[slot] = item.quantity > 1 ? { ...item, quantity: item.quantity - 1 } : null;
    await AsyncStorage.multiSet([
      [key, JSON.stringify(container)],
      [DISCOVERED_ALCHEMY_RECIPES_KEY, JSON.stringify(ids)],
    ]);
    return { allKnown: false as const, recipe, ids, bag: container };
  } finally {
    reading = false;
  }
}
