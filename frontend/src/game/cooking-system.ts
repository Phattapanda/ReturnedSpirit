import AsyncStorage from "@react-native-async-storage/async-storage";

import { ITEM_CATALOG, normalizeItemId, type BagItem, type MealTag } from "@/src/game/item-system";
import { createCraftedScroll, SCROLL_BASE_USES } from "@/src/game/scroll-system";
import {
  getButcheringDefinition,
  getButcheringKnifeTier,
  rollButcheringOutputs,
} from "@/src/game/butchering-system";

export const DISCOVERED_RECIPES_KEY = "@kitchen:discovered_recipes";
export const RUPERT_MORTAR_RECIPE_DIALOG_SEEN_KEY = "@tutorial:rupert_mortar_recipe_dialog_seen";

export type CookingRecipe = {
  id: string; name: string; stage: 1 | 2 | 3; rarity: "common" | "uncommon" | "rare"; unlock: string;
  ingredients: readonly { id: string; quantity: number }[]; toolId: string | null;
  outputId: string; outputQuantity: number; byproducts?: readonly { id: string; quantity: number }[];
  sellPriceCopper: number; staminaRecovery: number; lifeRecovery: number; tags: readonly MealTag[];
  buff?: { effectId: string; name: string; intensity: number; durationDays: number };
  /** Runtime recipes such as seasoning must work at the table without entering the recipe book. */
  hiddenFromRecipeBook?: boolean;
  seasonedStage?: 1 | 2 | 3;
  enhancedOriginal?: BagItem;
  enhancementKind?: "weapon" | "armor";
};

export const COOKING_RECIPES: readonly CookingRecipe[] = [
  // Mortar and Pestle processing recipes are grouped by powder color and yield.
  // Yellow
  {
    id: "powder_yellow_tusk", name: "Yellow Alchemy Powder from Tusk", stage: 1, rarity: "common", unlock: "Alchemy Processing",
    ingredients: [{ id: "tusk", quantity: 1 }],
    toolId: "mortar_and_pestle", outputId: "alchemy_powder_yellow", outputQuantity: 2,
    sellPriceCopper: 0, staminaRecovery: 0, lifeRecovery: 0, tags: [],
  },
  {
    id: "powder_yellow_fang", name: "Yellow Alchemy Powder from Large Fang", stage: 1, rarity: "common", unlock: "Alchemy Processing",
    ingredients: [{ id: "fang", quantity: 1 }],
    toolId: "mortar_and_pestle", outputId: "alchemy_powder_yellow", outputQuantity: 2,
    sellPriceCopper: 0, staminaRecovery: 0, lifeRecovery: 0, tags: [],
  },
  // Red
  {
    id: "powder_red_feather", name: "Red Alchemy Powder from Ember Feather", stage: 1, rarity: "common", unlock: "Alchemy Processing",
    ingredients: [{ id: "ember_feather", quantity: 1 }],
    toolId: "mortar_and_pestle", outputId: "alchemy_powder_red", outputQuantity: 1,
    sellPriceCopper: 0, staminaRecovery: 0, lifeRecovery: 0, tags: [],
  },
  {
    id: "powder_red_rooster_comb", name: "Red Alchemy Powder from Rooster Comb", stage: 1, rarity: "common", unlock: "Alchemy Processing",
    ingredients: [{ id: "rooster_comb", quantity: 1 }],
    toolId: "mortar_and_pestle", outputId: "alchemy_powder_red", outputQuantity: 2,
    sellPriceCopper: 0, staminaRecovery: 0, lifeRecovery: 0, tags: [],
  },
  {
    id: "powder_red_elder_comb", name: "Red Alchemy Powder from Elder Ember Rooster Comb", stage: 1, rarity: "common", unlock: "Alchemy Processing",
    ingredients: [{ id: "elder_ember_comb", quantity: 1 }],
    toolId: "mortar_and_pestle", outputId: "alchemy_powder_red", outputQuantity: 5,
    sellPriceCopper: 0, staminaRecovery: 0, lifeRecovery: 0, tags: [],
  },
  // Green
  {
    id: "powder_green_spinach", name: "Green Alchemy Powder from Spinach", stage: 1, rarity: "common", unlock: "Alchemy Processing",
    ingredients: [{ id: "spinach", quantity: 1 }],
    toolId: "mortar_and_pestle", outputId: "alchemy_powder_green", outputQuantity: 2,
    sellPriceCopper: 0, staminaRecovery: 0, lifeRecovery: 0, tags: [],
  },
  // Blue
  {
    id: "powder_blue_slime_gel", name: "Blue Alchemy Powder from Slime Gel", stage: 1, rarity: "common", unlock: "Alchemy Processing",
    ingredients: [{ id: "slime_gel", quantity: 1 }],
    toolId: "mortar_and_pestle", outputId: "alchemy_powder_blue", outputQuantity: 1,
    sellPriceCopper: 0, staminaRecovery: 0, lifeRecovery: 0, tags: [],
  },
  {
    id: "powder_blue_monster_core", name: "Blue Alchemy Powder from Weak Monster Core", stage: 1, rarity: "common", unlock: "Alchemy Processing",
    ingredients: [{ id: "weak_monster_core", quantity: 1 }],
    toolId: "mortar_and_pestle", outputId: "alchemy_powder_blue", outputQuantity: 1,
    sellPriceCopper: 0, staminaRecovery: 0, lifeRecovery: 0, tags: [],
  },
  // Brown
  {
    id: "powder_brown_nuts", name: "Brown Alchemy Powder from Nuts", stage: 1, rarity: "common", unlock: "Alchemy Processing",
    ingredients: [{ id: "nuts", quantity: 1 }],
    toolId: "mortar_and_pestle", outputId: "alchemy_powder_brown", outputQuantity: 1,
    sellPriceCopper: 0, staminaRecovery: 0, lifeRecovery: 0, tags: [],
  },
  {
    id: "powder_brown_bark", name: "Brown Alchemy Powder from Bark", stage: 1, rarity: "common", unlock: "Alchemy Processing",
    ingredients: [{ id: "bark", quantity: 1 }],
    toolId: "mortar_and_pestle", outputId: "alchemy_powder_brown", outputQuantity: 2,
    sellPriceCopper: 0, staminaRecovery: 0, lifeRecovery: 0, tags: [],
  },
  // White
  {
    id: "powder_white_snowberry", name: "White Alchemy Powder from Snowberry", stage: 1, rarity: "common", unlock: "Alchemy Processing",
    ingredients: [{ id: "snowberry", quantity: 1 }],
    toolId: "mortar_and_pestle", outputId: "alchemy_powder_white", outputQuantity: 1,
    sellPriceCopper: 0, staminaRecovery: 0, lifeRecovery: 0, tags: [],
  },
  // Black
  {
    id: "powder_black_charred_wood", name: "Black Alchemy Powder from Charred Wood", stage: 1, rarity: "common", unlock: "Alchemy Processing",
    ingredients: [{ id: "charred_wood", quantity: 1 }],
    toolId: "mortar_and_pestle", outputId: "alchemy_powder_black", outputQuantity: 2,
    sellPriceCopper: 0, staminaRecovery: 0, lifeRecovery: 0, tags: [],
  },
  // Consumable-product recipes follow the powder processing recipes.
  {
    id: "spices", name: "Spices", stage: 1, rarity: "common", unlock: "Early",
    ingredients: [{ id: "herbs", quantity: 2 }, { id: "nuts", quantity: 1 }],
    toolId: "mortar_and_pestle", outputId: "spices", outputQuantity: 2,
    sellPriceCopper: 0, staminaRecovery: 0, lifeRecovery: 0, tags: [],
  },
  ...([
    ["fire_bolt_scroll", "Fire Bolt Scroll", "red"],
    ["ice_field_scroll", "Ice Field Scroll", "blue"],
    ["lightning_bolt_scroll", "Lightning Bolt Scroll", "white"],
    ["bountiful_harvest_scroll", "Bountiful Harvest Scroll", "green"],
    ["gravitas_scroll", "Gravitas Scroll", "black"],
    ["weapon_enhancement_scroll", "Weapon Enhancement Scroll", "brown"],
    ["armor_enhancement_scroll", "Armor Enhancement Scroll", "yellow"],
  ] as const).map(([id, name, color]): CookingRecipe => ({
    id, name, stage: 1, rarity: "uncommon", unlock: "Scroll Crafting",
    ingredients: [{ id: "scroll", quantity: 1 }, { id: "shard_mana", quantity: 1 }, { id: `alchemy_powder_${color}`, quantity: 2 }],
    toolId: null, outputId: id, outputQuantity: 1,
    sellPriceCopper: 0, staminaRecovery: 0, lifeRecovery: 0, tags: [],
  })),
  // Distiller potions
  {
    id: "potion_healing_low_grade", name: "Low Grade Healing Potion", stage: 1, rarity: "common", unlock: "Distilling",
    ingredients: [{ id: "alchemy_powder_red", quantity: 1 }, { id: "syrup", quantity: 1 }, { id: "empty_bottle", quantity: 1 }],
    toolId: "distiller", outputId: "potion_healing_low_grade", outputQuantity: 1,
    sellPriceCopper: 0, staminaRecovery: 0, lifeRecovery: 30, tags: [],
  },
  {
    id: "potion_stamina_low_grade", name: "Low Grade Stamina Potion", stage: 1, rarity: "common", unlock: "Distilling",
    ingredients: [{ id: "alchemy_powder_yellow", quantity: 1 }, { id: "syrup", quantity: 1 }, { id: "empty_bottle", quantity: 1 }],
    toolId: "distiller", outputId: "potion_stamina_low_grade", outputQuantity: 1,
    sellPriceCopper: 0, staminaRecovery: 60, lifeRecovery: 0, tags: [],
  },
  {
    id: "potion_energy_low_grade", name: "Low Grade Energy Potion", stage: 1, rarity: "common", unlock: "Distilling",
    ingredients: [{ id: "alchemy_powder_blue", quantity: 1 }, { id: "syrup", quantity: 1 }, { id: "empty_bottle", quantity: 1 }],
    toolId: "distiller", outputId: "potion_energy_low_grade", outputQuantity: 1,
    sellPriceCopper: 0, staminaRecovery: 0, lifeRecovery: 0, tags: [],
    buff: { effectId: "low_grade_energy_potion", name: "Energy +1", intensity: 1, durationDays: 1 },
  },
  {
    id: "potion_strength", name: "Strength Potion", stage: 1, rarity: "common", unlock: "Distilling",
    ingredients: [{ id: "alchemy_powder_yellow", quantity: 1 }, { id: "alchemy_powder_red", quantity: 1 }, { id: "empty_bottle", quantity: 1 }],
    toolId: "distiller", outputId: "potion_strength", outputQuantity: 1,
    sellPriceCopper: 0, staminaRecovery: 0, lifeRecovery: 0, tags: [],
    buff: { effectId: "strength_potion", name: "Damage +5", intensity: 5, durationDays: 1 },
  },
  {
    id: "potion_defense", name: "Defense Potion", stage: 1, rarity: "common", unlock: "Distilling",
    ingredients: [{ id: "alchemy_powder_blue", quantity: 1 }, { id: "alchemy_powder_green", quantity: 1 }, { id: "empty_bottle", quantity: 1 }],
    toolId: "distiller", outputId: "potion_defense", outputQuantity: 1,
    sellPriceCopper: 0, staminaRecovery: 0, lifeRecovery: 0, tags: [],
    buff: { effectId: "defense_potion", name: "Endurance +5", intensity: 5, durationDays: 1 },
  },
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
    id: "pan_fried_eggs", name: "Fried Eggs", stage: 1, rarity: "common", unlock: "Early",
    ingredients: [{ id: "egg", quantity: 2 }, { id: "herbs", quantity: 1 }],
    toolId: "frying_pan", outputId: "pan_fried_eggs", outputQuantity: 2,
    sellPriceCopper: 28, staminaRecovery: 30, lifeRecovery: 10,
    tags: ["warm", "vegetarian", "healthy"],
  },
  {
    id: "pan_fishermans_fry", name: "Fisherman's Fry", stage: 1, rarity: "common", unlock: "Early",
    ingredients: [{ id: "fish", quantity: 1 }, { id: "tomato", quantity: 1 }, { id: "herbs", quantity: 1 }],
    toolId: "frying_pan", outputId: "pan_fishermans_fry", outputQuantity: 2,
    sellPriceCopper: 42, staminaRecovery: 35, lifeRecovery: 20,
    tags: ["warm", "healthy", "hearty", "herbs"],
  },
  {
    id: "pan_meat_and_carrots", name: "Meat and Carrots", stage: 1, rarity: "common", unlock: "Early",
    ingredients: [{ id: "white_meat", quantity: 1 }, { id: "carrot", quantity: 1 }, { id: "herbs", quantity: 1 }],
    toolId: "frying_pan", outputId: "pan_meat_and_carrots", outputQuantity: 2,
    sellPriceCopper: 30, staminaRecovery: 35, lifeRecovery: 20,
    tags: ["warm", "meat", "healthy", "hearty", "herbs"],
  },
  {
    id: "pan_meat_skillet", name: "Meat Skillet", stage: 1, rarity: "common", unlock: "Early",
    ingredients: [{ id: "red_meat", quantity: 1 }, { id: "potato", quantity: 1 }, { id: "herbs", quantity: 1 }],
    toolId: "frying_pan", outputId: "pan_meat_skillet", outputQuantity: 2,
    sellPriceCopper: 37, staminaRecovery: 35, lifeRecovery: 30,
    tags: ["warm", "meat", "hearty", "herbs"],
  },
  {
    id: "pan_mushroom_skillet", name: "Mushroom Skillet", stage: 1, rarity: "common", unlock: "Early",
    ingredients: [{ id: "mushroom", quantity: 1 }, { id: "onion", quantity: 1 }, { id: "herbs", quantity: 1 }],
    toolId: "frying_pan", outputId: "pan_mushroom_skillet", outputQuantity: 2,
    sellPriceCopper: 22, staminaRecovery: 25, lifeRecovery: 10,
    tags: ["warm", "vegetarian", "healthy", "herbs"],
  },
  {
    id: "pan_fried_potatoes", name: "Pan-Fried Potatoes", stage: 1, rarity: "common", unlock: "Early",
    ingredients: [{ id: "potato", quantity: 2 }, { id: "herbs", quantity: 1 }],
    toolId: "frying_pan", outputId: "pan_fried_potatoes", outputQuantity: 2,
    sellPriceCopper: 20, staminaRecovery: 35, lifeRecovery: 0,
    tags: ["warm", "vegetarian", "hearty", "herbs"],
  },
  {
    id: "pan_ember_chicken_skillet", name: "Ember Chicken Skillet", stage: 2, rarity: "rare", unlock: "Monster Cooking I",
    ingredients: [{ id: "ember_chicken_meat", quantity: 1 }, { id: "mushroom", quantity: 1 }, { id: "herbs", quantity: 1 }],
    toolId: "frying_pan", outputId: "pan_ember_chicken_skillet", outputQuantity: 2,
    sellPriceCopper: 57, staminaRecovery: 45, lifeRecovery: 25,
    tags: ["warm", "meat", "hearty", "herbs"],
    buff: { effectId: "fire_resistance_3", name: "Fire Resistance +3", intensity: 3, durationDays: 1 },
  },
  {
    id: "pan_ember_egg_hash", name: "Ember Egg Hash", stage: 2, rarity: "rare", unlock: "Monster Cooking I",
    ingredients: [{ id: "ember_chicken_egg", quantity: 1 }, { id: "potato", quantity: 1 }, { id: "onion", quantity: 1 }],
    toolId: "frying_pan", outputId: "pan_ember_egg_hash", outputQuantity: 2,
    sellPriceCopper: 53, staminaRecovery: 40, lifeRecovery: 25,
    tags: ["warm", "vegetarian", "healthy", "hearty"],
    buff: { effectId: "fire_resistance_2", name: "Fire Resistance +2", intensity: 2, durationDays: 1 },
  },
  {
    id: "pan_farmhouse", name: "Farmhouse Pan", stage: 2, rarity: "uncommon", unlock: "Mid",
    ingredients: [{ id: "pan_fried_potatoes", quantity: 1 }, { id: "onion", quantity: 1 }, { id: "egg", quantity: 1 }],
    toolId: "frying_pan", outputId: "pan_farmhouse", outputQuantity: 2,
    sellPriceCopper: 47, staminaRecovery: 50, lifeRecovery: 20,
    tags: ["warm", "vegetarian", "healthy", "hearty"],
  },
  {
    id: "syrup", name: "Syrup", stage: 1, rarity: "common", unlock: "Early",
    ingredients: [{ id: "sap", quantity: 2 }],
    toolId: "oldpot", outputId: "syrup", outputQuantity: 1,
    sellPriceCopper: 0, staminaRecovery: 0, lifeRecovery: 0, tags: [],
  },
  {
    id: "pan_rare_mushroom_skillet", name: "Rare Mushroom Skillet", stage: 2, rarity: "rare", unlock: "Monster Cooking I",
    ingredients: [{ id: "mushroom_rare", quantity: 1 }, { id: "onion", quantity: 1 }, { id: "herbs", quantity: 1 }],
    toolId: "frying_pan", outputId: "pan_rare_mushroom_skillet", outputQuantity: 2,
    sellPriceCopper: 49, staminaRecovery: 35, lifeRecovery: 15,
    tags: ["warm", "vegetarian", "healthy", "herbs"],
    buff: { effectId: "luck_3", name: "Luck +3", intensity: 3, durationDays: 1 },
  },
  {
    id: "knife_garden_salad", name: "Garden Salad", stage: 1, rarity: "common", unlock: "Early",
    ingredients: [{ id: "lettuce", quantity: 1 }, { id: "cucumber", quantity: 1 }, { id: "tomato", quantity: 1 }],
    toolId: "tool_kitchen_knife", outputId: "knife_garden_salad", outputQuantity: 2,
    sellPriceCopper: 42, staminaRecovery: 25, lifeRecovery: 10,
    tags: ["cold", "vegetarian", "healthy"],
  },
  {
    id: "knife_carrot_cucumber_salad", name: "Carrot-Cucumber Salad", stage: 1, rarity: "common", unlock: "Early",
    ingredients: [{ id: "carrot", quantity: 1 }, { id: "cucumber", quantity: 1 }, { id: "herbs", quantity: 1 }],
    toolId: "tool_kitchen_knife", outputId: "knife_carrot_cucumber_salad", outputQuantity: 2,
    sellPriceCopper: 24, staminaRecovery: 20, lifeRecovery: 5,
    tags: ["cold", "vegetarian", "healthy", "herbs"],
  },
  {
    id: "knife_fishermans_cold_plate", name: "Fisherman's Cold Plate", stage: 1, rarity: "common", unlock: "Early",
    ingredients: [{ id: "fish", quantity: 1 }, { id: "cucumber", quantity: 1 }, { id: "tomato", quantity: 1 }],
    toolId: "tool_kitchen_knife", outputId: "knife_fishermans_cold_plate", outputQuantity: 2,
    sellPriceCopper: 52, staminaRecovery: 30, lifeRecovery: 20,
    tags: ["cold", "healthy"],
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

function findSeasoningRecipe(ingredientSlots: readonly (BagItem | null)[], tool: BagItem | null): CookingRecipe | null {
  if (tool !== null) return null;
  const occupied = ingredientSlots.filter((item): item is BagItem => item !== null);
  if (occupied.some((item) => item.seasonedStage !== undefined)) return null;
  const totals = ingredientTotals(occupied);
  if (totals.size !== 2 || (totals.get("spices") ?? 0) < 1) return null;

  const dish = occupied.find((item) => item.id !== "spices");
  if (!dish) return null;
  const sourceRecipe = COOKING_RECIPES.find((recipe) => recipe.outputId === dish.id && recipe.tags.length > 0);
  if (!sourceRecipe) return null;

  return {
    id: `season_${dish.id}`,
    name: `Season ${sourceRecipe.name}`,
    stage: sourceRecipe.stage,
    rarity: sourceRecipe.rarity,
    unlock: "Seasoning",
    ingredients: [{ id: dish.id, quantity: 1 }, { id: "spices", quantity: 1 }],
    toolId: null,
    outputId: dish.id,
    outputQuantity: 1,
    sellPriceCopper: sourceRecipe.sellPriceCopper,
    staminaRecovery: sourceRecipe.staminaRecovery,
    lifeRecovery: sourceRecipe.lifeRecovery,
    tags: sourceRecipe.tags,
    buff: sourceRecipe.buff,
    hiddenFromRecipeBook: true,
    seasonedStage: sourceRecipe.stage,
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
  const seasoning = findSeasoningRecipe(ingredientSlots, tool);
  if (seasoning) return seasoning;
  if (!tool) {
    const occupied = ingredientSlots.filter((item): item is BagItem => item !== null);
    if (occupied.length === 2) {
      const scroll = occupied.find((item) => item.id === "weapon_enhancement_scroll" || item.id === "armor_enhancement_scroll");
      const equipment = occupied.find((item) => item !== scroll);
      const kind = scroll?.id === "weapon_enhancement_scroll" ? "weapon" : "armor";
      const attribute = kind === "weapon" ? "weapon" : "armor";
      if (scroll && equipment && equipment.quantity === 1 && scroll.quantity === 1 &&
          (scroll.usesRemaining ?? 1) > 0 &&
          !equipment[kind === "weapon" ? "weaponEnhanced" : "armorEnhanced"] &&
          ITEM_CATALOG[equipment.id]?.attributes.includes(attribute)) {
        return { id: `enhance_${kind}_${equipment.id}`, name: `Enhanced ${equipment.name}`,
          stage: 1, rarity: "uncommon", unlock: "Scroll Enhancement",
          ingredients: [{ id: equipment.id, quantity: 1 }, { id: scroll.id, quantity: 1 }],
          toolId: null, outputId: equipment.id, outputQuantity: 1,
          sellPriceCopper: 0, staminaRecovery: 0, lifeRecovery: 0, tags: [],
          hiddenFromRecipeBook: true, enhancedOriginal: equipment, enhancementKind: kind };
      }
    }
  }
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
    if (recipe.enhancementKind && slot.id.endsWith("_enhancement_scroll")) {
      const charges = (slot.usesRemaining ?? slot.maxUses ?? 1) - craftCount;
      return charges > 0 ? { ...slot, usesRemaining: charges } : null;
    }
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
  effectiveness = 1,
): BagItem[] {
  if (Object.hasOwn(SCROLL_BASE_USES, recipe.outputId)) {
    return Array.from({ length: recipe.outputQuantity * craftCount }, () => createCraftedScroll(recipe.outputId, effectiveness));
  }
  if (recipe.enhancedOriginal && recipe.enhancementKind) {
    return [{ ...recipe.enhancedOriginal, equipped: false, quantity: 1,
      name: `Enhanced ${ITEM_CATALOG[recipe.outputId]?.name ?? recipe.enhancedOriginal.name}`,
      [recipe.enhancementKind === "weapon" ? "weaponEnhanced" : "armorEnhanced"]: true }];
  }
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
  if (recipe.seasonedStage) {
    const outputs: BagItem[] = [];
    let remaining = recipe.outputQuantity * craftCount;
    while (remaining > 0) {
      const quantity = Math.min(remaining, maxStackQuantity);
      const output = createCraftedItem(recipe.outputId, quantity);
      outputs.push({
        ...output,
        name: `Seasoned ${ITEM_CATALOG[recipe.outputId]?.name ?? output.name}`,
        seasonedStage: recipe.seasonedStage,
      });
      remaining -= quantity;
    }
    return outputs;
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
