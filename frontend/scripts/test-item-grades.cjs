const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function("require", "module", "exports", code)(id => {
    if (id === "@react-native-async-storage/async-storage") return {};
    if (id.startsWith("@/")) return load(path.join(root, id.slice(2) + ".ts"));
    if (id.startsWith(".")) return load(path.resolve(path.dirname(file), id + ".ts"));
    throw new Error(id);
  }, module, module.exports);
  return module.exports;
}
const grades = load(path.join(root, "src/game/item-grade.ts"));
const items = load(path.join(root, "src/game/item-system.ts"));
const cooking = load(path.join(root, "src/game/cooking-system.ts"));
const crops = load(path.join(root, "src/game/garden-crop-system.ts"));
const effects = load(path.join(root, "src/game/status-effect-system.ts"));
const statsSystem = load(path.join(root, "src/game/player-stats.ts"));
const nearCap = { ...statsSystem.DEFAULT_PLAYER_STATS, level: 99, growthPoints: 30 };
const capped = statsSystem.applyStatUpgrade(nearCap, "strength", 10).stats;
assert.equal(capped.level, 100);
assert.equal(capped.growthPoints, 20);
for (const field of statsSystem.UPGRADABLE_FIELDS) {
  const blocked = statsSystem.applyStatUpgrade(capped, field, 10);
  assert.deepEqual(blocked.stats, capped);
  assert.equal(blocked.newCurrentLife, null);
}
assert.equal(statsSystem.normalizePlayerStats({ ...capped, level: 150 }).level, 100);
assert.equal(statsSystem.normalizePlayerStats({ ...capped, level: 150 }).growthPoints, 20);
const { getRupertItemHint } = load(path.join(root, "src/game/rupert-item-hints.ts"));
const hintItem = cooking.createCraftedItem("cucumber", 3);
const hintBefore = JSON.stringify(hintItem);
assert.match(getRupertItemHint(hintItem), /cold.*kitchen knife/);
assert.equal(JSON.stringify(hintItem), hintBefore);
assert.match(getRupertItemHint(cooking.createCraftedItem("tomato", 1)), /hot or cold/);
assert.match(getRupertItemHint(cooking.createCraftedItem("ember_feather", 1)), /alchemy/);
assert.match(getRupertItemHint(cooking.createCraftedItem("bag_herb", 1)), /Unpack/);
assert.match(getRupertItemHint(cooking.createCraftedItem("wood", 1)), /elsewhere/);
const carrot = (grade, quantity = 1) => ({ ...cooking.createCraftedItem("carrot", quantity), grade });
assert.equal(grades.cropGrade({}), "D");
assert.equal(grades.cropGrade({ premiumFertilizerUses: 1 }), "C");
assert.equal(grades.cropGrade({ premiumFertilizerUses: 99 }), "S");
assert.equal(grades.cropGrade({ yieldUpgradeLevel: 2 }), "C");
assert.equal(grades.cropGrade({ yieldUpgradeLevel: 2, premiumFertilizerUses: 1 }), "B");
assert.equal(grades.collectiveGrade([carrot("C"), carrot("D")]), "D");
assert.equal(grades.collectiveGrade([carrot("C", 2), carrot("D")]), "C");
assert.equal(grades.collectiveGrade([carrot("S"), carrot("C", 2)]), "C");
assert.equal(items.canStack(carrot("C"), carrot("D")), false);
assert.equal(items.canStack(carrot(undefined), carrot("D")), true);
assert.equal(items.canStack(carrot("C"), carrot("C")), true);
assert.equal(items.canStack(cooking.createCraftedItem("soup_carrot", 1), { ...cooking.createCraftedItem("soup_carrot", 1), grade: "D", gradeIngredientCount: 2 }), true);
assert.equal(crops.createHarvestBagForCrop("seed_carrot", 8, { premiumFertilizerUses: 2 }).grade, "B");
const soup = cooking.COOKING_RECIPES.find(recipe => recipe.id === "soup_carrot");
assert.ok(soup);
const output = (ingredients, effectiveness = 1, recipe = soup) => cooking.createRecipeOutputs(recipe, 1, 20, 0, null, effectiveness, ingredients)[0];
const c = output([carrot("C", 2)]);
assert.equal(c.grade, "C");
assert.equal(c.gradeIngredientCount, 2);
assert.equal(items.getMealBaseSellPriceCopper(c) - items.getMealBaseSellPriceCopper("soup_carrot"), 6);
assert.equal(output([carrot("D"), carrot("C")]).grade, "D");
const vegetable = cooking.COOKING_RECIPES.find(recipe => recipe.ingredients.some(i => i.id === "potato") && recipe.ingredients.some(i => i.id === "onion") && recipe.ingredients.some(i => i.id === "carrot"));
assert.ok(vegetable);
const veg = output(vegetable.ingredients.map(i => ({ ...cooking.createCraftedItem(i.id, i.quantity), grade: i.id === "onion" ? "D" : "C" })), 1, vegetable);
assert.equal(veg.grade, "C");
assert.equal(items.getGradePriceBonus(veg), 9);
assert.equal(output([carrot("C", 2)], 9).quantity, soup.outputQuantity);
assert.equal(output([carrot("C", 2)], 10).quantity, soup.outputQuantity + 1);
assert.equal(output([carrot("C", 2)], 20).quantity, soup.outputQuantity + 2);
const batches = cooking.createRecipeOutputs(soup, 2, 20, 0, null, 1, [carrot("C", 2), carrot("D", 2)]);
assert.deepEqual(batches.map(item => item.grade), ["C", "D"]);
assert.equal(cooking.summarizeRecipeOutput(batches, soup.outputId).quantity, soup.outputQuantity * 2);
const herbRecipe = cooking.COOKING_RECIPES.find(recipe => recipe.outputId === "soup_herb");
assert.ok(herbRecipe);
const herbIngredients = herbRecipe.ingredients.map(item => cooking.createCraftedItem(item.id, item.quantity * 2));
for (const effectiveness of [1, 10]) {
  const outputs = cooking.createRecipeOutputs(herbRecipe, 2, 1, 0, null, effectiveness, herbIngredients);
  assert.equal(cooking.summarizeRecipeOutput(outputs, herbRecipe.outputId).quantity,
    (herbRecipe.outputQuantity + Math.floor(effectiveness / 10)) * 2);
}
assert.equal(cooking.summarizeRecipeOutput([], soup.outputId), null);
assert.equal(items.applyStaminaRecovery(c, 0, 100, 1), items.ITEM_CATALOG[c.id].staminaRecovery + 5);
assert.equal(items.applyStaminaRecovery(c, 0, 100, 2), items.ITEM_CATALOG[c.id].staminaRecovery + 6);
assert.equal(items.applyStaminaRecovery(c, 98, 100, 1), 100);
assert.equal(items.applyLifeRecovery(c, 0, 100, 1), 5);
assert.equal(items.applyLifeRecovery(c, 0, 100, 2), 5);
assert.equal(items.foodEffectivenessRecoveryBonus(50, 2), 1); // 1.50 rounds down
assert.equal(items.foodEffectivenessRecoveryBonus(17, 2), 1); // 0.51 rounds up
assert.equal(items.foodEffectivenessRecoveryBonus(16, 2), 0); // 0.48 rounds down
assert.equal(items.foodEffectivenessRecoveryBonus(50, 1), 0);
assert.equal(items.foodEffectivenessRecoveryBonus(50, 3), 3);
for (const effectiveness of [1, 2, 10]) {
  const bonus = effectiveness - 1;
  assert.equal(items.foodRecoveryBonus({ ...c, grade: "D" }, effectiveness),
    items.foodEffectivenessRecoveryBonus(items.ITEM_CATALOG[c.id].staminaRecovery, effectiveness));
  assert.equal(items.applyStaminaRecovery("potion_stamina_low_grade", 0, 1000, effectiveness),
    items.ITEM_CATALOG.potion_stamina_low_grade.staminaRecovery + bonus);
  assert.equal(items.applyLifeRecovery("potion_healing_low_grade", 0, 1000, effectiveness),
    items.ITEM_CATALOG.potion_healing_low_grade.lifeRecovery + bonus);
}
assert.equal(items.applyLifeRecovery(c, 99, 100, 1), 100);
const fireMeal = { ...cooking.createCraftedItem("soup_ember_egg", 1), grade: "B" };
assert.equal(items.getItemBuffPotency(fireMeal, 1), 4);
const state = effects.applyTemporaryEffect({ version: 1, temporary: [], traits: [] }, "fire_resistance_2", undefined, items.getItemBuffPotency(fireMeal, 1));
assert.equal(effects.getStatusModifiers(state).fireResistance, 4);
assert.equal(JSON.parse(JSON.stringify(c)).grade, "C");
console.log("Item grade tests passed: crops, majority, stacking, batches, prices, healing, yield and buffs.");
