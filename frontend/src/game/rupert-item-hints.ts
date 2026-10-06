import { COOKING_RECIPES } from "./cooking-system";
import { ITEM_CATALOG, type BagItem } from "./item-system";

/** Advice only: never consumes items or discovers a recipe. */
export function getRupertItemHint(item: BagItem): string {
  const id = item.id;
  if (id === "cucumber") return "Cucumber is mainly used for cold dishes. You will need a kitchen knife.";
  if (id === "tomato") return "Tomatoes can be prepared hot or cold. Try a frying pan or a kitchen knife.";
  if (id === "monster_carcass") return "A carcass needs a butchering knife first. Some of the materials you obtain may be useful for alchemy.";
  if (id.startsWith("bag_")) return "Unpack this harvest bag first, then show me one of the ingredients inside.";
  if (id.startsWith("seed_")) return "Plant these seeds in the garden first. Bring me the harvest and I can give you a hint.";
  const recipes = COOKING_RECIPES.filter(recipe => recipe.ingredients.some(ingredient => ingredient.id === id));
  const hints: string[] = [];
  if (recipes.some(recipe => recipe.toolId === "tool_kitchen_knife")) hints.push("This can be used for cold dishes. A kitchen knife will help you prepare it.");
  if (recipes.some(recipe => recipe.toolId === "oldpot" || recipe.toolId === "cooking_pot")) hints.push("This can be used in a warm dish. Try preparing it in a cooking pot.");
  if (recipes.some(recipe => recipe.toolId === "frying_pan")) hints.push("This can also be prepared in a frying pan.");
  if (recipes.some(recipe => recipe.outputId.startsWith("alchemy_powder_"))) hints.push("This is useful for alchemy. A mortar and pestle can turn it into powder.");
  else if (id.startsWith("alchemy_powder_") || recipes.some(recipe => recipe.outputId.startsWith("potion_"))) hints.push("This is useful for alchemy. Keep it for preparing mixtures and potions.");
  if (hints.length) return hints.join(" ");
  if (recipes.some(recipe => recipe.toolId === "mortar_and_pestle")) return "Try processing this with a mortar and pestle. Not everything belongs in a cooking pot.";
  if (ITEM_CATALOG[id]?.mealTags?.length) return "This dish is already prepared. You can eat it or serve it to a guest.";
  return "I don't have a cooking tip for this item. Keep it; it may be useful elsewhere.";
}
