import AsyncStorage from "@react-native-async-storage/async-storage";
import { COOKING_RECIPES, DISCOVERED_RECIPES_KEY, loadDiscoveredRecipes, type CookingRecipe } from "./cooking-system";
import { KITCHEN_TABLE_KEY, PLAYER_BAG_KEY, type BagItem, type PlayerBagData } from "./item-system";

export function rollRecipeDrops(recipe: CookingRecipe, count: number, random = Math.random): number {
  // Only cooking, not alchemy, butchering, seasoning or equipment crafting.
  if (recipe.hiddenFromRecipeBook || !["oldpot", "cooking_pot", "fine_cooking_pot", "frying_pan", "tool_kitchen_knife"].includes(recipe.toolId ?? "")) return 0;
  let drops = 0;
  for (let i = 0; i < count; i += 1) if (random() < 0.05) drops += 1;
  return drops;
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
    const unknown = COOKING_RECIPES.filter((recipe) => !recipe.hiddenFromRecipeBook && !known.includes(recipe.id));
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
