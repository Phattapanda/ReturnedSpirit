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
    if (id === "@/src/audio/audioEngine") return { audioEngine: { playSoundEffect: () => {} } };
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
  const mailbox = load(path.join(root, "src/game/mailbox-system.ts"));
  const purchases = load(path.join(root, "src/game/starting-package-purchase.ts"));
  assert.equal(await purchases.ensureStartingPackageForCurrentRun(), false);
  await purchases.grantHarvestPackageEntitlement();
  await Promise.all([purchases.ensureStartingPackageForCurrentRun(), purchases.ensureStartingPackageForCurrentRun()]);
  let purchasedMail = await mailbox.loadMailboxState();
  assert.equal(purchasedMail.messages.length, 1);
  assert.deepEqual(purchasedMail.messages[0].rewards, mailbox.BONUS_CODE_CATALOG.HARVESTSUN.rewards);
  assert.equal(purchasedMail.messages[0].claimed, false);
  const mailboxKey = [...data.keys()].find(key => data.get(key).includes('"PURCHASE_HARVESTSUN"'));
  data.set(mailboxKey, JSON.stringify({...purchasedMail, messages: []}));
  await purchases.ensureStartingPackageForCurrentRun();
  assert.equal((await mailbox.loadMailboxState()).messages.length, 0, "deleted mail is not delivered twice");
  data.delete(mailboxKey);
  await purchases.ensureStartingPackageForCurrentRun();
  assert.equal((await mailbox.loadMailboxState()).messages.length, 1, "new run gets its own package");
  data.clear();

  const { DISCOVERED_ALCHEMY_RECIPES_KEY, getMonsterRecipeDropChance, rollAlchemyRecipeDrops, rollMonsterRecipeDrops, rollRecipeDrops, readAlchemyRecipeItem, readRecipeItem } = load(path.join(root, "src/game/recipe-item.ts"));
  const { planKitchenCraftOutputs } = load(path.join(root, "src/game/kitchen-craft-output.ts"));
  const { EXPLORE_AREA_BASE_STAMINA_COST, EXPLORE_AREA_POOL, createExploreAreaItem, formatExploreAreaFind, getExploreAreaLuckChance, rollExploreAreaFind, rollExploreAreaQuantity } = load(path.join(root, "src/game/outside-exploration.ts"));
  const { COOKING_RECIPES, DISCOVERED_RECIPES_KEY } = load(path.join(root, "src/game/cooking-system.ts"));
  const { DEFAULT_TAVERN_QUEST_STATE, TAVERN_QUEST_STATE_KEY, claimTavernQuest, loadTavernQuestState, recordTavernService } = load(path.join(root, "src/game/tavern-quest-system.ts"));
  const { CURRENCY_KEY } = load(path.join(root, "src/game/currency-system.ts"));
  const { GOOD_GUEST_ROOM_DAILY_INCOME_COPPER, GUEST_ROOM_MAX_STORED_DAYS, GUEST_ROOM_STATE_KEY, acceptGuestRoomUpgradeQuest, advanceGuestRoomState, collectGuestRoomIncome, getGuestRoomDailyIncome, getGuestRoomStoredIncome, isGuestRoomIncomeFull, placeGuestRoomOrder, turnInGuestRoomUpgradeItem, unlockGuestRoomOffer } = load(path.join(root, "src/game/guest-room-system.ts"));
  const { SHARED_RESOURCES_KEY } = load(path.join(root, "src/game/shared-resources.ts"));
  const { DEFAULT_BAG, ITEM_CATALOG, PLAYER_BAG_KEY, KITCHEN_TABLE_KEY, isItemDiscardable, canStack, getContainerStackLimit, normalizePlayerBagData } = load(path.join(root, "src/game/item-system.ts"));
  const water = load(path.join(root, "src/game/water-storage.ts"));
  assert.deepEqual(await water.loadWaterStorage(), {amount: 0, capacity: 5});
  assert.equal((await water.refillWaterStorage()).state.amount, 5);
  assert.equal((await water.refillWaterStorage()).ok, false);
  assert.equal(await water.consumeStoredWater(6), false);
  assert.equal(await water.consumeStoredWater(2), true);
  assert.equal((await water.refillWaterStorage()).state.amount, 5);
  data.set(PLAYER_BAG_KEY, JSON.stringify({...DEFAULT_BAG, slots: [{id:"water_jar", itemType:"water_jar", name:"Water Jar", quantity:1}, ...DEFAULT_BAG.slots.slice(1)]}));
  assert.ok(await water.expandWaterStorageFromBag(0));
  assert.equal(await water.expandWaterStorageFromBag(0), null);
  assert.deepEqual(await water.loadWaterStorage(), {amount:5, capacity:10});
  assert.deepEqual(await Promise.all([water.consumeStoredWater(4), water.consumeStoredWater(4)]), [true,false]);
  data.set("@game:supporter_bag", JSON.stringify({slots:[{id:"bucketwater",quantity:6},{id:"bucket",quantity:2}]}));
  await water.migrateLegacyWaterBuckets();
  assert.deepEqual(await water.loadWaterStorage(), {amount:7,capacity:10});
  assert.equal(JSON.parse(data.get("@game:supporter_bag")).slots[0].id, "water_jar");
  await water.migrateLegacyWaterBuckets();
  assert.equal((await water.loadWaterStorage()).amount,7);
  for (const id of ["soup_herb","soup_carrot","soup_potato","soup_onion","soup_carrot_potato"]) {
    const recipe = COOKING_RECIPES.find(r=>r.id===id);
    assert.equal(recipe.waterRequired,1);
    assert.ok(!recipe.ingredients.some(i=>i.id==="bucketwater"));
    assert.ok(!recipe.byproducts?.some(i=>i.id==="bucket"));
  }
  data.clear();
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
  assert.equal(EXPLORE_AREA_BASE_STAMINA_COST, 10);
  assert.ok(EXPLORE_AREA_POOL.length >= 25, "exploration offers a varied set of finds");
  const forbiddenExploreIds = new Set([
    "recipe", "alchemy_recipe", "scroll", "fur", "hide", "tusk", "wolf_pelt", "fang",
    "slime_gel", "weak_monster_core", "ember_feather", "rooster_comb", "elder_ember_comb",
    "beetle_shell", "ember_chicken_meat", "ember_chicken_egg",
  ]);
  for (const entry of EXPLORE_AREA_POOL) {
    assert.ok(entry.text.length > 20, "every exploration find has contextual text");
    if (entry.kind === "copper") continue;
    const catalog = ITEM_CATALOG[entry.itemId];
    assert.ok(catalog, `${entry.itemId}: exploration item exists in the catalog`);
    assert.equal(forbiddenExploreIds.has(entry.itemId), false, `${entry.itemId}: is not a monster drop, recipe, or scroll`);
    assert.equal(entry.itemId.includes("alchemy_powder"), false, `${entry.itemId}: is not an alchemy powder`);
    assert.equal(catalog.consumableCategory, undefined, `${entry.itemId}: is not a potion or other consumable`);
    assert.equal((catalog.mealTags ?? []).length, 0, `${entry.itemId}: is not a prepared dish`);
  }
  assert.equal(getExploreAreaLuckChance(0), 25);
  assert.equal(getExploreAreaLuckChance(5), 35);
  assert.equal(getExploreAreaLuckChance(-10), 25);
  assert.equal(getExploreAreaLuckChance(100), 100);
  assert.equal(rollExploreAreaQuantity("item", 0, () => 0.25), 1, "a failed Item Luck roll keeps the minimum quantity");
  assert.equal(rollExploreAreaQuantity("item", 0, () => 0.249), 5, "successful Item Luck rolls stop at five");
  assert.equal(rollExploreAreaQuantity("item", 5, () => 0.35), 1, "Luck chance uses an exclusive percentage threshold");
  assert.equal(rollExploreAreaQuantity("item", 5, () => 0.349), 5, "each Luck point adds two percentage points");
  assert.equal(rollExploreAreaQuantity("copper", 0, () => 0.25), 8, "Copper finds start at eight");
  assert.equal(rollExploreAreaQuantity("copper", 100, () => 0.999), 15, "Copper Luck rolls stop at fifteen");
  const explorationRolls = [0, 0.99];
  const deterministicFind = rollExploreAreaFind(0, () => explorationRolls.shift());
  assert.equal(deterministicFind.kind, "item");
  assert.equal(deterministicFind.itemId, "seed_herb");
  assert.equal(deterministicFind.quantity, 1);
  assert.match(formatExploreAreaFind(deterministicFind), /Found: 1× Herb Seed\./);
  const daggerEntry = EXPLORE_AREA_POOL.find((entry) => entry.kind === "item" && entry.itemId === "weapon_iron_dagger");
  const dagger = createExploreAreaItem({ ...daggerEntry, quantity: 1 });
  assert.equal(dagger.durability, 20, "found equipment receives full durability");
  data.set(TAVERN_QUEST_STATE_KEY, JSON.stringify({
    ...DEFAULT_TAVERN_QUEST_STATE,
    claimed: { ...DEFAULT_TAVERN_QUEST_STATE.claimed, clean_guest_area: true, serve_food: true },
  }));
  for (let index = 0; index < 50; index += 1) await recordTavernService("water");
  const guestQuestReady = await loadTavernQuestState();
  assert.equal(guestQuestReady.waterServed, 5, "water quest progress remains capped at five");
  assert.equal(guestQuestReady.guestsServed, 50, "all services count toward the fifty guest quest");
  const guestQuestClaim = await claimTavernQuest("serve_guests");
  assert.equal(guestQuestClaim.ok, true);
  assert.equal(guestQuestClaim.reward, "guest_rooms");
  const offeredRooms = await unlockGuestRoomOffer();
  assert.equal(offeredRooms.phase, "available", "Rupert's completed dialogue unlocks the Carpenter service");
  data.set("@game:guest_state", JSON.stringify({ calendarDaySerial: 7 }));
  data.set(SHARED_RESOURCES_KEY, JSON.stringify({ nails: 10, wood: 15, stone: 15, paint: 2, cloth: 5 }));
  data.set(CURRENCY_KEY, "300");
  const roomOrder = await placeGuestRoomOrder();
  assert.equal(roomOrder.ok, true);
  assert.equal(roomOrder.state.phase, "building");
  assert.equal(roomOrder.state.orderPlacedDaySerial, 7);
  assert.equal(roomOrder.state.completionDaySerial, 10);
  assert.deepEqual(JSON.parse(data.get(SHARED_RESOURCES_KEY)), { nails: 0, wood: 0, stone: 0, paint: 0, cloth: 0 });
  assert.equal(data.get(CURRENCY_KEY), "0", "the Carpenter charges exactly three Silver Coins");
  data.set(GUEST_ROOM_STATE_KEY, JSON.stringify({ ...roomOrder.state, orderPlacedDaySerial: 0, completionDaySerial: 3 }));
  assert.equal((await advanceGuestRoomState(2)).phase, "building");
  const completedRoom = await advanceGuestRoomState(3);
  assert.equal(completedRoom.phase, "complete");
  assert.equal(completedRoom.storedIncomeDays, 0, "construction day itself does not generate rent");
  const fullRoom = await advanceGuestRoomState(13);
  assert.equal(fullRoom.storedIncomeDays, GUEST_ROOM_MAX_STORED_DAYS);
  assert.equal(getGuestRoomStoredIncome(fullRoom), 100);
  assert.equal(isGuestRoomIncomeFull(fullRoom), true);
  const stillCappedRoom = await advanceGuestRoomState(20);
  assert.equal(stillCappedRoom.storedIncomeDays, GUEST_ROOM_MAX_STORED_DAYS, "stored rent never exceeds ten days");
  data.set(CURRENCY_KEY, "0");
  const collectedRoom = await collectGuestRoomIncome();
  assert.equal(collectedRoom.ok, true);
  assert.equal(collectedRoom.collectedCopper, 100);
  assert.equal(collectedRoom.state.storedIncomeDays, 0);
  assert.equal(data.get(CURRENCY_KEY), "100");
  const upgradeQuest = await acceptGuestRoomUpgradeQuest();
  assert.equal(upgradeQuest.upgradePhase, "quest_active", "the Carpenter conversation starts the room-upgrade quest");
  data.set("@game:guest_state", JSON.stringify({ calendarDaySerial: 21 }));
  data.set(GUEST_ROOM_STATE_KEY, JSON.stringify({ ...upgradeQuest, lastIncomeDaySerial: 20, storedIncomeDays: 1, storedIncomeCopper: 10 }));
  data.set(PLAYER_BAG_KEY, JSON.stringify({ ...DEFAULT_BAG, slots: [{ id: "elder_ember_comb", itemType: "elder_ember_comb", name: "Elder Ember Rooster Comb", quantity: 1 }, ...DEFAULT_BAG.slots.slice(1)] }));
  const upgradeOrder = await turnInGuestRoomUpgradeItem();
  assert.equal(upgradeOrder.ok, true);
  assert.equal(upgradeOrder.state.upgradePhase, "building");
  assert.equal(upgradeOrder.state.upgradeCompletionDaySerial, 23);
  assert.equal(upgradeOrder.bag.slots[0], null, "the Carpenter consumes one Elder Ember Rooster Comb");
  assert.equal((await advanceGuestRoomState(22)).storedIncomeCopper, 10, "the old room earns no income during construction");
  const upgradedRoom = await advanceGuestRoomState(23);
  assert.equal(upgradedRoom.roomLevel, 2);
  assert.equal(upgradedRoom.upgradePhase, "complete");
  assert.equal(getGuestRoomDailyIncome(upgradedRoom), GOOD_GUEST_ROOM_DAILY_INCOME_COPPER);
  assert.equal(getGuestRoomStoredIncome(upgradedRoom), 10, "uncollected Small Basic Room income survives the upgrade");
  const upgradedIncome = await advanceGuestRoomState(24);
  assert.equal(getGuestRoomStoredIncome(upgradedIncome), 30, "new income accrues at twenty Copper per day");
  data.set("@game:player_stats", JSON.stringify({ incomeBonusPercent: 10 }));
  data.set(CURRENCY_KEY, "0");
  const collectedUpgradedRoom = await collectGuestRoomIncome();
  assert.equal(collectedUpgradedRoom.collectedCopper, 33, "the permanent income trait applies to Guest Room income");
  console.log("Recipe item tests passed: kitchen/workshop separation, drops, value, discard, consumption, unknown selection, and all-known retention.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
