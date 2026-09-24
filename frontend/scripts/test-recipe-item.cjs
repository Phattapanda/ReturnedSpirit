const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const data = new Map();
const storage = {
  getItem: async (key) => data.get(key) ?? null,
  setItem: async (key, value) => { data.set(key, value); },
  multiSet: async (pairs) => { pairs.forEach(([key, value]) => data.set(key, value)); },
};
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const localRequire = (id) => {
    if (id === "@react-native-async-storage/async-storage") return storage;
    if (id.startsWith("@/") || id.startsWith(".")) {
      const resolved = id.startsWith("@/") ? path.join(root, id.slice(2)) : path.resolve(path.dirname(file), id);
      return load(`${resolved}.ts`);
    }
    throw new Error(`Unexpected dependency: ${id}`);
  };
  new Function("require", "module", "exports", code)(localRequire, module, module.exports);
  return module.exports;
}

(async () => {
  const { DISCOVERED_ALCHEMY_RECIPES_KEY, getMonsterRecipeDropChance, rollAlchemyRecipeDrops, rollMonsterRecipeDrops, rollRecipeDrops, readAlchemyRecipeItem, readRecipeItem } = load(path.join(root, "src/game/recipe-item.ts"));
  const { planKitchenCraftOutputs } = load(path.join(root, "src/game/kitchen-craft-output.ts"));
  const { COOKING_RECIPES, DISCOVERED_RECIPES_KEY } = load(path.join(root, "src/game/cooking-system.ts"));
  const { DEFAULT_BAG, ITEM_CATALOG, PLAYER_BAG_KEY, KITCHEN_TABLE_KEY, isItemDiscardable, canStack, getContainerStackLimit, normalizePlayerBagData } = load(path.join(root, "src/game/item-system.ts"));
  assert.deepEqual([DEFAULT_BAG.rows, DEFAULT_BAG.columns, DEFAULT_BAG.slotCount], [2, 4, 8]);
  const oldShoulderBag = normalizePlayerBagData({ bagId: "bag1", rows: 2, columns: 3, slotCount: 6, slots: [{ id: "herbs", itemType: "herbs", name: "Herbs", quantity: 1 }] });
  const oldBackpack = normalizePlayerBagData({ bagId: "bag2", rows: 3, columns: 3, slotCount: 9, slots: Array(9).fill(null) });
  const oldBigBackpack = normalizePlayerBagData({ bagId: "bag3", rows: 4, columns: 4, slotCount: 16, slots: Array(16).fill(null) });
  assert.deepEqual([oldShoulderBag.rows, oldShoulderBag.columns, oldShoulderBag.slotCount, oldShoulderBag.slots.length], [2, 4, 8, 8]);
  assert.equal(oldShoulderBag.slots[0].id, "herbs", "keeps existing Shoulder Bag items during migration");
  assert.deepEqual([oldBackpack.rows, oldBackpack.columns, oldBackpack.slotCount, oldBackpack.slots.length], [3, 4, 12, 12]);
  assert.deepEqual([oldBigBackpack.rows, oldBigBackpack.columns, oldBigBackpack.slotCount, oldBigBackpack.slots.length], [4, 5, 20, 20]);
  for (const [id, catalog] of Object.entries(ITEM_CATALOG)) {
    if (catalog.consumableCategory !== "potion") continue;
    const crafted = { id, itemType: id, name: catalog.name, quantity: 2 };
    const reward = { ...crafted, itemType: "consumable", consumableCategory: "potion", quantity: 1 };
    assert.equal(canStack(crafted, reward), true, `${id}: crafted and reward stack`);
    assert.equal(canStack(reward, crafted), true, `${id}: symmetric stacking`);
    assert.equal(canStack(crafted, { ...reward, quality: "different" }), false);
    assert.equal(canStack(crafted, { ...reward, id: "another_potion" }), false);
    assert.equal(canStack(crafted, { ...crafted, quantity: 1 }), true);
  }
  assert.equal(getContainerStackLimit("kitchenTable"), 20);
  const existingSoup = { id: "soup_carrot_potato", itemType: "soup_carrot_potato", name: "Carrot-Potato Soup", quantity: 18 };
  const existingBuckets = { id: "bucket", itemType: "bucket", name: "Empty Bucket", quantity: 3 };
  const originalTable = [existingSoup, existingBuckets, null, null];
  const outputPlan = planKitchenCraftOutputs(originalTable, [
    { ...existingSoup, quantity: 6 },
    { ...existingBuckets, quantity: 2 },
  ], 20);
  assert.ok(outputPlan);
  assert.equal(outputPlan.tableItems[0].quantity, 20, "fills an existing product stack first");
  assert.equal(outputPlan.tableItems[1].quantity, 5, "merges Empty Bucket byproducts into their existing stack");
  assert.equal(outputPlan.tableItems[2].quantity, 4, "opens a new stack only for the remainder");
  assert.deepEqual(originalTable.map((item) => item?.quantity ?? null), [18, 3, null, null], "planning is atomic and does not mutate the current table");
  assert.equal(planKitchenCraftOutputs([existingSoup], [{ ...existingSoup, quantity: 3 }], 20), null, "rejects the whole craft when its remainder cannot fit");
  const meal = COOKING_RECIPES.find((recipe) => recipe.toolId === "oldpot");
  assert.equal(rollRecipeDrops(meal, 3, () => 0.049), 3);
  assert.equal(rollRecipeDrops(meal, 3, () => 0.05), 0);
  assert.equal(rollRecipeDrops({ ...meal, toolId: "mortar_and_pestle" }, 3, () => 0), 0);
  assert.equal(rollAlchemyRecipeDrops({ ...meal, toolId: "mortar_and_pestle" }, 3, () => 0.049), 3);
  assert.equal(rollAlchemyRecipeDrops(meal, 3, () => 0), 0);
  assert.equal(rollRecipeDrops({ ...meal, hiddenFromRecipeBook: true }, 3, () => 0), 0);
  assert.equal(getMonsterRecipeDropChance(0), 3);
  assert.equal(getMonsterRecipeDropChance(5), 13);
  assert.equal(getMonsterRecipeDropChance(100), 100);
  assert.deepEqual(rollMonsterRecipeDrops(5, () => 0.129), ["recipe", "alchemy_recipe"]);
  assert.deepEqual(rollMonsterRecipeDrops(5, () => 0.13), []);
  const independentRolls = [0.02, 0.9];
  assert.deepEqual(rollMonsterRecipeDrops(0, () => independentRolls.shift()), ["recipe"]);
  const item = { id: "recipe", itemType: "recipe", name: "Recipe", quantity: 2 };
  assert.equal(ITEM_CATALOG.recipe.baseSellPriceCopper, 50);
  assert.equal(isItemDiscardable(item), true);
  data.set(PLAYER_BAG_KEY, JSON.stringify({ bagId: "bag1", columns: 3, slots: [item] }));
  const first = await readRecipeItem(PLAYER_BAG_KEY, 0);
  assert.equal(first.allKnown, false);
  assert.ok(["oldpot", "cooking_pot", "fine_cooking_pot", "frying_pan", "tool_kitchen_knife"].includes(first.recipe.toolId));
  assert.equal(first.bag.slots[0].quantity, 1);
  assert.deepEqual(JSON.parse(data.get(DISCOVERED_RECIPES_KEY)), [first.recipe.id]);
  const second = await readRecipeItem(PLAYER_BAG_KEY, 0);
  assert.notEqual(first.recipe.id, second.recipe.id);
  assert.equal(second.bag.slots[0], null);
  assert.equal(await readRecipeItem(PLAYER_BAG_KEY, 0), null);
  data.set(KITCHEN_TABLE_KEY, JSON.stringify([{ ...item, quantity: 1 }]));
  const table = await readRecipeItem(KITCHEN_TABLE_KEY, 0);
  assert.equal(table.slots[0], null);
  data.set(DISCOVERED_RECIPES_KEY, JSON.stringify(COOKING_RECIPES.map((recipe) => recipe.id)));
  const full = JSON.stringify([{ ...item, quantity: 1 }]);
  data.set(KITCHEN_TABLE_KEY, full);
  assert.equal((await readRecipeItem(KITCHEN_TABLE_KEY, 0)).allKnown, true);
  assert.equal(data.get(KITCHEN_TABLE_KEY), full);
  const alchemyItem = { id: "alchemy_recipe", itemType: "alchemy_recipe", name: "Alchemy Recipe", quantity: 1 };
  data.set(PLAYER_BAG_KEY, JSON.stringify({ bagId: "bag1", columns: 3, slots: [alchemyItem] }));
  const alchemy = await readAlchemyRecipeItem(PLAYER_BAG_KEY, 0);
  assert.equal(alchemy.allKnown, false);
  assert.ok(alchemy.recipe.toolId === null || ["mortar_and_pestle", "distiller"].includes(alchemy.recipe.toolId));
  assert.deepEqual(JSON.parse(data.get(DISCOVERED_ALCHEMY_RECIPES_KEY)), [alchemy.recipe.id]);
  assert.equal(alchemy.bag.slots[0], null);
  assert.equal(ITEM_CATALOG.alchemy_recipe.baseSellPriceCopper, 50);
  assert.equal(isItemDiscardable(alchemyItem), true);
  console.log("Recipe item tests passed: kitchen/workshop separation, drops, value, discard, consumption, unknown selection, and all-known retention.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
