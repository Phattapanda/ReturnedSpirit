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
  const { rollRecipeDrops, readRecipeItem } = load(path.join(root, "src/game/recipe-item.ts"));
  const { COOKING_RECIPES, DISCOVERED_RECIPES_KEY } = load(path.join(root, "src/game/cooking-system.ts"));
  const { ITEM_CATALOG, PLAYER_BAG_KEY, KITCHEN_TABLE_KEY, isItemDiscardable, canStack, getContainerStackLimit } = load(path.join(root, "src/game/item-system.ts"));
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
  const meal = COOKING_RECIPES.find((recipe) => recipe.toolId === "oldpot");
  assert.equal(rollRecipeDrops(meal, 3, () => 0.049), 3);
  assert.equal(rollRecipeDrops(meal, 3, () => 0.05), 0);
  assert.equal(rollRecipeDrops({ ...meal, toolId: "mortar_and_pestle" }, 3, () => 0), 0);
  assert.equal(rollRecipeDrops({ ...meal, hiddenFromRecipeBook: true }, 3, () => 0), 0);
  const item = { id: "recipe", itemType: "recipe", name: "Recipe", quantity: 2 };
  assert.equal(ITEM_CATALOG.recipe.baseSellPriceCopper, 50);
  assert.equal(isItemDiscardable(item), true);
  data.set(PLAYER_BAG_KEY, JSON.stringify({ bagId: "bag1", columns: 3, slots: [item] }));
  const first = await readRecipeItem(PLAYER_BAG_KEY, 0);
  assert.equal(first.allKnown, false);
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
  console.log("Recipe item tests passed: probability, batches, exclusions, value, discard, bag/table consumption, unknown selection, all-known retention.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
