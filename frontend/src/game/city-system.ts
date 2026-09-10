import AsyncStorage from "@react-native-async-storage/async-storage";
import { audioEngine } from "@/src/audio/audioEngine";

import {
  CURRENCY_KEY,
  addCurrencyCopper,
  formatCurrencyAmount,
  loadCurrencyCopper,
  notifyCurrencyChanged,
  saveCurrencyCopper,
} from "@/src/game/currency-system";
import { loadGuestState } from "@/src/game/guest-system";
import {
  DEFAULT_BAG, ITEM_ATTRIBUTE, ITEM_CATALOG, PLAYER_BAG_KEY,
  applyLifeRecovery, applyStaminaRecovery, canConsumeForStamina, isConsumable, isEdible,
  hasItemAttribute, normalizePlayerBagData, planAddToBag, planAddToNextFreeBagSlot, removeBagItem,
  upgradeToBigBackpack, type BagItem, type PlayerBagData,
} from "@/src/game/item-system";
import { deliverMailboxMessage, type MailReward } from "@/src/game/mailbox-system";
import { DEFAULT_PLAYER_STATS, PLAYER_STATS_KEY, normalizePlayerStats } from "@/src/game/player-stats";
import { loadCoachmanEscortState, setCoachmanEscortPhase } from "@/src/game/coachman-escort-system";
import { getButcheringDefinition, rollButcheringOutputs } from "@/src/game/butchering-system";
import { addKarmaPoints } from "@/src/game/progression";

export const CITY_STATE_KEY = "@game:next_city";
export const SUPPORTER_BAG_KEY = "@game:supporter_bag";

export type SupporterId = "normal" | "healer" | "cleric" | "botanist";
export type QuestId = "wolves" | "feathers" | "camp" | "healing";
export type QuestStatus = "offered" | "accepted" | "ready" | "completed";
export type TempleBlessingId = "endurance" | "fortune" | "protection";

export type SupporterDefinition = {
  id: SupporterId; name: string; rows: number; columns: number; slots: number; description: string;
};

export const SUPPORTERS: Record<SupporterId, SupporterDefinition> = {
  normal: { id: "normal", name: "Normal Porter", rows: 4, columns: 4, slots: 16, description: "Carries a spacious 4 × 4 Supporter Bag." },
  healer: { id: "healer", name: "Healer Porter", rows: 3, columns: 3, slots: 9, description: "Restores 10% Life when entering a floor for the first time." },
  cleric: { id: "cleric", name: "Cleric Porter", rows: 2, columns: 3, slots: 6, description: "Attacks once per round with Strength +5 and heals 10% Life every third round." },
  botanist: { id: "botanist", name: "Botanist Porter", rows: 3, columns: 4, slots: 12, description: "+15% herb and mushroom yield, Perception and Luck while searching." },
};

export const QUESTS = {
  wolves: { id: "wolves", type: "Battle Quest", rank: "H", title: "Defeat 2 Feral Rabbits", detail: "Defeat two Feral Rabbits in the Forest Dungeon.", rewardCopper: 60, reputation: 7 },
  feathers: { id: "feathers", type: "Collection Quest", rank: "H", title: "Collect 2× Mushrooms", detail: "Bring two Mushrooms to the Adventurers’ Guild.", rewardCopper: 40, reputation: 5 },
  camp: { id: "camp", type: "Investigation Quest", rank: "H", title: "Retrieve the Researchers' Documents", detail: "Retrieve the researchers' documents from the abandoned camp in the Forest Dungeon.", rewardCopper: 75, reputation: 3 },
  healing: { id: "healing", type: "Alchemy Quest", rank: "H", title: "Deliver 1 Low Quality Stamina Potion", detail: "Bring one Low Quality Stamina Potion to the Adventurers’ Guild.", rewardCopper: 60, reputation: 4 },
} as const;
const RANK_H_QUEST_KARMA_POINTS = 3;

export type CityState = {
  version: 1;
  foodStockDay: number;
  foodStock: string[];
  supporter: { id: SupporterId; runsRemaining: number; announcedRunSerial: number | null } | null;
  guildReputation: number;
  quests: Record<QuestId, { status: QuestStatus; progress: number }>;
  questRollWeek: number;
  pendingProcessing: {
    id: string; dueDay: number; meat: number; feathers: number;
    kind?: "ember_chicken" | "wild_wolf"; pelts?: number;
    monsterId?: string; outputs?: { itemId: string; quantity: number }[];
  }[];
  merchantReputation: number;
  merchantGuildIntroductionSeen: boolean;
  healingPotionContract: "available" | "accepted" | "completed";
  blessing: { id: TempleBlessingId; status: "prepared" | "active" } | null;
};

const DEFAULT_QUESTS: CityState["quests"] = {
  wolves: { status: "offered", progress: 0 }, feathers: { status: "offered", progress: 0 },
  camp: { status: "offered", progress: 0 }, healing: { status: "offered", progress: 0 },
};

function foodStock(day: number): string[] {
  const core = ["potato", "carrot", "onion", "tomato", "egg", "white_meat", "red_meat", "herbs", "mushroom"];
  const omitted = day % core.length;
  return core.filter((_, index) => index !== omitted || index < 4);
}

function normalizeCityState(raw: unknown, day: number): CityState {
  const value = raw && typeof raw === "object" ? raw as Partial<CityState> : {};
  const savedQuests = value.quests ?? DEFAULT_QUESTS;
  return {
    version: 1,
    foodStockDay: value.foodStockDay === day ? day : day,
    foodStock: value.foodStockDay === day && Array.isArray(value.foodStock) ? value.foodStock : foodStock(day),
    supporter: value.supporter && SUPPORTERS[value.supporter.id]
      ? { id: value.supporter.id, runsRemaining: Math.max(0, Math.min(3, Math.floor(value.supporter.runsRemaining))), announcedRunSerial: value.supporter.announcedRunSerial ?? null }
      : null,
    guildReputation: Math.max(0, Math.floor(value.guildReputation ?? 0)),
    quests: Object.fromEntries((Object.keys(QUESTS) as QuestId[]).map((id) => [id, {
      status: savedQuests[id]?.status ?? "offered", progress: Math.max(0, Math.floor(savedQuests[id]?.progress ?? 0)),
    }])) as CityState["quests"],
    questRollWeek: Math.floor(day / 7),
    pendingProcessing: Array.isArray(value.pendingProcessing) ? value.pendingProcessing : [],
    merchantReputation: Math.max(0, Math.floor(value.merchantReputation ?? 0)),
    merchantGuildIntroductionSeen: value.merchantGuildIntroductionSeen === true,
    healingPotionContract: value.healingPotionContract === "accepted" || value.healingPotionContract === "completed" ? value.healingPotionContract : "available",
    blessing: value.blessing && (value.blessing.id === "endurance" || value.blessing.id === "fortune" || value.blessing.id === "protection")
      ? { id: value.blessing.id, status: value.blessing.status === "active" ? "active" : "prepared" }
      : null,
  };
}

export async function loadCityState(): Promise<CityState> {
  const day = (await loadGuestState()).calendarDaySerial;
  const raw = await AsyncStorage.getItem(CITY_STATE_KEY);
  const state = normalizeCityState(raw ? JSON.parse(raw) : null, day);
  const previousWeek = raw ? Math.floor(Number((JSON.parse(raw) as Partial<CityState>).questRollWeek ?? 0)) : state.questRollWeek;
  if (state.questRollWeek !== previousWeek) {
    for (const id of Object.keys(QUESTS) as QuestId[]) if (state.quests[id].status === "offered") state.quests[id] = { status: "offered", progress: 0 };
  }
  const due = state.pendingProcessing.filter((entry) => entry.dueDay <= day);
  if (due.length) {
    for (const entry of due) {
      const wolf = entry.kind === "wild_wolf";
      const definition = getButcheringDefinition(entry.monsterId ?? entry.kind);
      const rewards: MailReward[] = entry.outputs?.length
        ? entry.outputs.map((output) => ({ type: "item", itemId: output.itemId, quantity: output.quantity }))
        : wolf
          ? [{ type: "item", itemId: "red_meat", quantity: entry.meat }, { type: "item", itemId: "wolf_pelt", quantity: entry.pelts ?? 1 }]
          : [{ type: "item", itemId: "ember_chicken_meat", quantity: entry.meat }, { type: "item", itemId: "ember_feather", quantity: entry.feathers }];
      await deliverMailboxMessage({
        id: `guild-processing-${entry.id}`, sender: "Adventurers' Guild", senderKind: "guild",
        subject: "Monster Processing Complete",
        body: `The Guild Butcher has finished processing your ${definition?.carcassName ?? (wolf ? "Forest Wolf Carcass" : "Ember Chicken Carcass")}.`,
        rewards,
      });
    }
    state.pendingProcessing = state.pendingProcessing.filter((entry) => entry.dueDay > day);
  }
  await AsyncStorage.setItem(CITY_STATE_KEY, JSON.stringify(state));
  return state;
}

export async function saveCityState(state: CityState): Promise<CityState> {
  await AsyncStorage.setItem(CITY_STATE_KEY, JSON.stringify(state));
  return state;
}

export async function markMerchantGuildIntroductionSeen(): Promise<CityState> {
  const state = await loadCityState();
  if (state.merchantGuildIntroductionSeen) return state;
  return saveCityState({ ...state, merchantGuildIntroductionSeen: true });
}

async function loadBag(): Promise<PlayerBagData> {
  const raw = await AsyncStorage.getItem(PLAYER_BAG_KEY);
  return raw ? normalizePlayerBagData(JSON.parse(raw)) : { ...DEFAULT_BAG, slots: [...DEFAULT_BAG.slots] };
}

function createItem(id: string): BagItem {
  const entry = ITEM_CATALOG[id]; const max = entry?.maxDurability;
  return { id, itemType: id, name: entry?.name ?? id, quantity: 1, attributes: entry?.attributes ? [...entry.attributes] : undefined, durability: max, maxDurability: max };
}

export type CityActionResult = { ok: true; message: string } | { ok: false; message: string };
export const GUILD_PROCESSING_FEE_PER_CARCASS = 6;

export type GuildCarcassSelection = {
  bagSlotIndex: number;
  monsterId: string;
  quantity: number;
};

export type BlacksmithRecipeId =
  | "smelt_iron"
  | "smelt_copper"
  | "smelt_steel"
  | "smelt_silver"
  | "smelt_gold"
  | "upgrade_old_pot_coins"
  | "upgrade_old_pot_iron"
  | "upgrade_cooking_pot_steel"
  | "upgrade_rusty_knife"
  | "upgrade_iron_knife";

export type BlacksmithRecipe = {
  id: BlacksmithRecipeId;
  input: readonly { itemId: string; quantity: number }[];
  outputItemId: string;
  outputQuantity: number;
  priceCopper: number;
};

export const BLACKSMITH_SMELTING_RECIPES: readonly BlacksmithRecipe[] = [
  { id: "smelt_iron", input: [{ itemId: "ore_iron", quantity: 3 }], outputItemId: "ingot_iron", outputQuantity: 1, priceCopper: 50 },
  { id: "smelt_copper", input: [{ itemId: "ore_copper", quantity: 3 }], outputItemId: "ingot_copper", outputQuantity: 1, priceCopper: 100 },
  { id: "smelt_steel", input: [{ itemId: "ore_iron", quantity: 2 }, { itemId: "coal", quantity: 2 }], outputItemId: "ingot_steel", outputQuantity: 1, priceCopper: 150 },
  { id: "smelt_silver", input: [{ itemId: "ore_silver", quantity: 3 }], outputItemId: "ingot_silver", outputQuantity: 1, priceCopper: 200 },
  { id: "smelt_gold", input: [{ itemId: "ore_gold", quantity: 3 }], outputItemId: "ingot_gold", outputQuantity: 1, priceCopper: 400 },
];

export const BLACKSMITH_TOOL_UPGRADE_RECIPES: readonly BlacksmithRecipe[] = [
  { id: "upgrade_old_pot_coins", input: [{ itemId: "oldpot", quantity: 1 }], outputItemId: "cooking_pot", outputQuantity: 1, priceCopper: 300 },
  { id: "upgrade_old_pot_iron", input: [{ itemId: "oldpot", quantity: 1 }, { itemId: "ingot_iron", quantity: 2 }], outputItemId: "cooking_pot", outputQuantity: 1, priceCopper: 50 },
  { id: "upgrade_cooking_pot_steel", input: [{ itemId: "cooking_pot", quantity: 1 }, { itemId: "ingot_steel", quantity: 3 }], outputItemId: "fine_cooking_pot", outputQuantity: 1, priceCopper: 400 },
  { id: "upgrade_rusty_knife", input: [{ itemId: "tool_rusty_butchering_knife", quantity: 1 }, { itemId: "ingot_iron", quantity: 2 }], outputItemId: "tool_iron_butchering_knife", outputQuantity: 1, priceCopper: 100 },
  { id: "upgrade_iron_knife", input: [{ itemId: "tool_iron_butchering_knife", quantity: 1 }, { itemId: "ingot_steel", quantity: 2 }], outputItemId: "tool_steel_butchering_knife", outputQuantity: 1, priceCopper: 300 },
];

const BLACKSMITH_RECIPES: readonly BlacksmithRecipe[] = [
  ...BLACKSMITH_SMELTING_RECIPES,
  ...BLACKSMITH_TOOL_UPGRADE_RECIPES,
];

export async function performBlacksmithRecipe(recipeId: BlacksmithRecipeId): Promise<CityActionResult> {
  const recipe = BLACKSMITH_RECIPES.find((entry) => entry.id === recipeId);
  if (!recipe) return { ok: false, message: "The blacksmith does not offer that service." };

  const bag = await loadBag();
  if (!bag.unlocked) return { ok: false, message: "I need my bag first." };
  for (const requirement of recipe.input) {
    if (itemCount(bag, requirement.itemId) < requirement.quantity) {
      const name = ITEM_CATALOG[requirement.itemId]?.name ?? requirement.itemId;
      return { ok: false, message: `I need ${requirement.quantity}× ${name} in my bag.` };
    }
  }

  const balance = await loadCurrencyCopper();
  if (balance < recipe.priceCopper) {
    return { ok: false, message: `I need ${formatCurrencyAmount(recipe.priceCopper)} for that.` };
  }

  let nextBag = bag;
  for (const requirement of recipe.input) {
    nextBag = consumeItems(nextBag, requirement.itemId, requirement.quantity);
  }

  const output = createItem(recipe.outputItemId);
  output.quantity = recipe.outputQuantity;
  const plan = output.maxDurability === undefined
    ? planAddToBag(output, nextBag)
    : planAddToNextFreeBagSlot(output, nextBag);
  const fits = "ok" in plan ? plan.ok : plan.canTransfer && plan.remainderQty === 0;
  if (!fits) return { ok: false, message: `My bag needs room for the ${output.name}.` };

  const updatedBag = { ...nextBag, slots: plan.updatedSlots };
  const remainingCopper = balance - recipe.priceCopper;
  await AsyncStorage.multiSet([
    [PLAYER_BAG_KEY, JSON.stringify(updatedBag)],
    [CURRENCY_KEY, String(remainingCopper)],
  ]);
  notifyCurrencyChanged(remainingCopper);
  if (recipe.priceCopper > 0) audioEngine.playSoundEffect("losecoin", { maxDurationMs: 2200 });
  return {
    ok: true,
    message: `${recipe.input.map((entry) => `${entry.quantity}× ${ITEM_CATALOG[entry.itemId]?.name ?? entry.itemId}`).join(" + ")} transformed into ${recipe.outputQuantity}× ${output.name}.`,
  };
}

export async function buyCityItem(id: string, priceCopper: number): Promise<CityActionResult> {
  const bag = await loadBag();
  if (!bag.unlocked) return { ok: false, message: "I need my bag first." };
  if (id === "bag3") {
    if (bag.bagId === "bag3") return { ok: false, message: "I already own the Big Backpack." };
    if ((await loadCurrencyCopper()) < priceCopper) return { ok: false, message: "I do not have enough coins." };
    await saveCurrencyCopper((await loadCurrencyCopper()) - priceCopper);
    await AsyncStorage.setItem(PLAYER_BAG_KEY, JSON.stringify(upgradeToBigBackpack(bag)));
    return { ok: true, message: "Backpack upgraded to the 4 × 4 Big Backpack." };
  }
  const item = createItem(id);
  const plan = item.maxDurability === undefined || id === "torch" ? planAddToBag(item, bag) : planAddToNextFreeBagSlot(item, bag);
  const fits = "ok" in plan ? plan.ok : plan.canTransfer && plan.remainderQty === 0;
  if (!fits) return { ok: false, message: "My bag is full." };
  const balance = await loadCurrencyCopper();
  if (balance < priceCopper) return { ok: false, message: "I do not have enough coins." };
  await AsyncStorage.multiSet([[PLAYER_BAG_KEY, JSON.stringify({ ...bag, slots: plan.updatedSlots })], ["@game:currency_copper", String(balance - priceCopper)]]);
  await saveCurrencyCopper(balance - priceCopper);
  return { ok: true, message: `${item.name} added to my bag.` };
}

export function merchantPrice(basePrice: number, reputation: number): number {
  const discountPercent = Math.min(20, Math.floor(Math.max(0, reputation) / 10));
  return Math.max(1, Math.floor(basePrice * (100 - discountPercent) / 100));
}

export function merchantBulkQuantity(reputation: number): number {
  return 20 + Math.min(20, Math.floor(Math.max(0, reputation) / 25) * 5);
}

export async function buyBulkShipment(vegetable: "potato" | "carrot" | "onion", basePrice: number): Promise<CityActionResult> {
  const bag = await loadBag(); if (!bag.unlocked) return { ok: false, message: "I need my bag first." };
  const state = await loadCityState(); const price = merchantPrice(basePrice, state.merchantReputation);
  const quantity = merchantBulkQuantity(state.merchantReputation);
  const bagId = `bag_${vegetable}`; const entry = ITEM_CATALOG[bagId];
  const shipment: BagItem = { id: bagId, itemType: bagId, name: entry?.name ?? `${vegetable} Bag`, quantity: 1, containedItem: vegetable, containedQuantity: quantity, attributes: entry?.attributes ? [...entry.attributes] : undefined };
  const plan = planAddToBag(shipment, bag); if (!plan.canTransfer || plan.remainderQty) return { ok: false, message: "My bag has no room for the shipment." };
  const balance = await loadCurrencyCopper(); if (balance < price) return { ok: false, message: `I need ${formatCurrencyAmount(price)} for that shipment.` };
  await AsyncStorage.setItem(PLAYER_BAG_KEY, JSON.stringify({ ...bag, slots: plan.updatedSlots })); await saveCurrencyCopper(balance - price);
  return { ok: true, message: `A ${entry?.name ?? "vegetable bag"} containing ${quantity} ${ITEM_CATALOG[vegetable]?.name ?? vegetable} was added to my bag.` };
}

export async function acceptHealingPotionContract(): Promise<CityActionResult> {
  const state = await loadCityState();
  if (state.healingPotionContract !== "available") return { ok: false, message: "That trade contract has already been accepted." };
  state.healingPotionContract = "accepted"; await saveCityState(state);
  return { ok: true, message: "Supply Contract: Healing Potion accepted." };
}

export async function fulfillHealingPotionContract(): Promise<CityActionResult> {
  const state = await loadCityState(); if (state.healingPotionContract !== "accepted") return { ok: false, message: "I have not accepted this contract." };
  const bag = await loadBag(); if (itemCount(bag, "potion_healing_low_grade") < 10) return { ok: false, message: "I need 10 Low Quality Healing Potions." };
  const nextBag = consumeItems(bag, "potion_healing_low_grade", 10); state.healingPotionContract = "completed"; state.merchantReputation += 10;
  await AsyncStorage.multiSet([[PLAYER_BAG_KEY, JSON.stringify(nextBag)], [CITY_STATE_KEY, JSON.stringify(state)]]); await addCurrencyCopper(85);
  return { ok: true, message: `Contract fulfilled: ${formatCurrencyAmount(85)} and 10 Merchant Reputation awarded.` };
}

export async function receiveTempleTreatment(): Promise<CityActionResult> {
  const [balance, rawStats, rawLife] = await Promise.all([loadCurrencyCopper(), AsyncStorage.getItem(PLAYER_STATS_KEY), AsyncStorage.getItem("@game:life")]);
  if (balance < 12) return { ok: false, message: `I need ${formatCurrencyAmount(12)} for treatment.` };
  const stats = normalizePlayerStats(rawStats ? JSON.parse(rawStats) : DEFAULT_PLAYER_STATS); const life = Math.max(0, Number(rawLife) || 0);
  if (life >= stats.maximumLife) return { ok: false, message: "I am already at full Life." };
  await AsyncStorage.setItem("@game:life", String(stats.maximumLife)); await saveCurrencyCopper(balance - 12);
  return { ok: true, message: `Treatment complete. ${stats.maximumLife - life} Life restored.` };
}

export async function buyTempleBlessing(id: TempleBlessingId): Promise<CityActionResult> {
  const state = await loadCityState();
  if (state.blessing?.id === id && state.blessing.status === "prepared") return { ok: false, message: "That blessing is already prepared." };
  const balance = await loadCurrencyCopper(); if (balance < 50) return { ok: false, message: `I need ${formatCurrencyAmount(50)} for a blessing.` };
  state.blessing = { id, status: "prepared" }; await saveCityState(state); await saveCurrencyCopper(balance - 50);
  return { ok: true, message: `Blessing of ${id[0].toUpperCase()}${id.slice(1)} prepared for the next Expedition.` };
}

export async function beginTempleBlessingExpedition(): Promise<{ id: TempleBlessingId; activatedNow: boolean } | null> {
  const state = await loadCityState(); if (!state.blessing) return null;
  const activatedNow = state.blessing.status === "prepared";
  if (activatedNow) { state.blessing.status = "active"; await saveCityState(state); }
  return { id: state.blessing.id, activatedNow };
}

export async function activeTempleBlessing(): Promise<TempleBlessingId | null> {
  const state = await loadCityState(); return state.blessing?.status === "active" ? state.blessing.id : null;
}

export async function completeTempleBlessingExpedition(): Promise<void> {
  const state = await loadCityState(); if (state.blessing?.status !== "active") return;
  state.blessing = null; await saveCityState(state);
}

const BASE_PRICES: Record<string, number> = { potato: 6, carrot: 6, onion: 7, tomato: 8, egg: 8, white_meat: 14, red_meat: 18, herbs: 7, mushroom: 9, fish: 14, rope: 9, cloth: 17, empty_bottle: 9 };
export const CITY_BUY_PRICES = Object.fromEntries(Object.entries(BASE_PRICES).map(([id, price]) => [id, Math.floor(price * 1.2)]));
export function citySellPrice(id: string): number { return Math.ceil((BASE_PRICES[id] ?? ITEM_CATALOG[id]?.baseSellPriceCopper ?? 2) * 0.5); }

export async function sellCityItem(slot: number): Promise<CityActionResult> {
  const bag = await loadBag(); const item = bag.slots[slot];
  if (!item) return { ok: false, message: "That slot is empty." };
  if (item.equipped || (ITEM_CATALOG[item.id]?.attributes ?? []).includes(ITEM_ATTRIBUTE.QUEST_ITEM)) return { ok: false, message: "That item cannot be sold." };
  const price = citySellPrice(item.id); const next = removeBagItem(bag, slot, 1);
  await AsyncStorage.setItem(PLAYER_BAG_KEY, JSON.stringify(next)); await addCurrencyCopper(price);
  return { ok: true, message: `Sold 1× ${item.name} for ${formatCurrencyAmount(price)}.` };
}

export async function repairCityItem(slot: number): Promise<CityActionResult> {
  const bag = await loadBag(); const item = bag.slots[slot];
  if (!item?.maxDurability || item.durability === item.maxDurability) return { ok: false, message: "That item does not need repairs." };
  const balance = await loadCurrencyCopper(); if (balance < 20) return { ok: false, message: `I need ${formatCurrencyAmount(20)} for the repair.` };
  const slots = [...bag.slots]; slots[slot] = { ...item, durability: item.maxDurability };
  await AsyncStorage.setItem(PLAYER_BAG_KEY, JSON.stringify({ ...bag, slots })); await saveCurrencyCopper(balance - 20);
  return { ok: true, message: `${item.name} repaired for ${formatCurrencyAmount(20)}.` };
}

export async function tanMaterial(source: "fur" | "wolf_pelt"): Promise<CityActionResult> {
  const bag = await loadBag(); const index = bag.slots.findIndex((item) => item?.id === source);
  if (index < 0) return { ok: false, message: `I do not have any ${source === "fur" ? "Fur" : "Wolf Pelt"}.` };
  const priceCopper = 25;
  const balance = await loadCurrencyCopper();
  if (balance < priceCopper) return { ok: false, message: `I need ${formatCurrencyAmount(priceCopper)} for tanning.` };
  const removed = removeBagItem(bag, index, 1); const leather = createItem("leather"); leather.quantity = source === "fur" ? 1 : 2;
  const plan = planAddToBag(leather, removed); if (!plan.canTransfer || plan.remainderQty) return { ok: false, message: "My bag needs room for the Leather." };
  const remainingCopper = balance - priceCopper;
  await AsyncStorage.multiSet([
    [PLAYER_BAG_KEY, JSON.stringify({ ...removed, slots: plan.updatedSlots })],
    [CURRENCY_KEY, String(remainingCopper)],
  ]);
  notifyCurrencyChanged(remainingCopper);
  audioEngine.playSoundEffect("losecoin", { maxDurationMs: 2200 });
  return { ok: true, message: `${source === "fur" ? "Fur" : "Wolf Pelt"} processed into ${leather.quantity}× Leather.` };
}

export async function hireSupporter(id: SupporterId, runs: number): Promise<CityActionResult> {
  const count = Math.max(1, Math.min(3, Math.floor(runs))); const cost = count * 100; const balance = await loadCurrencyCopper();
  if (balance < cost) return { ok: false, message: `I need ${formatCurrencyAmount(cost)} for this contract.` };
  const state = await loadCityState(); state.supporter = { id, runsRemaining: count, announcedRunSerial: null };
  const definition = SUPPORTERS[id]; const bag: PlayerBagData = { bagId: `supporter_${id}`, level: 1, rows: definition.rows, columns: definition.columns, slotCount: definition.slots, maxStackSize: 9, unlocked: true, slots: Array(definition.slots).fill(null) };
  await AsyncStorage.multiSet([[CITY_STATE_KEY, JSON.stringify(state)], [SUPPORTER_BAG_KEY, JSON.stringify(bag)]]); await saveCurrencyCopper(balance - cost);
  return { ok: true, message: `${definition.name} hired for ${count} Dungeon Run${count === 1 ? "" : "s"}.` };
}

export async function loadSupporterBag(): Promise<PlayerBagData | null> {
  const state = await loadCityState(); if (!state.supporter) return null;
  const day = (await loadGuestState()).calendarDaySerial;
  if (!state.supporter.runsRemaining && state.supporter.announcedRunSerial !== day) return null;
  const raw = await AsyncStorage.getItem(SUPPORTER_BAG_KEY); const def = SUPPORTERS[state.supporter.id];
  if (raw) {
    const parsed = JSON.parse(raw) as Partial<PlayerBagData>;
    const slots = Array.isArray(parsed.slots) ? parsed.slots : [];
    return { bagId: `supporter_${def.id}`, level: 1, rows: def.rows, columns: def.columns, slotCount: def.slots, maxStackSize: 9, unlocked: true, slots: Array.from({ length: def.slots }, (_, index) => slots[index] ?? null) };
  }
  return { bagId: `supporter_${def.id}`, level: 1, rows: def.rows, columns: def.columns, slotCount: def.slots, maxStackSize: 9, unlocked: true, slots: Array(def.slots).fill(null) };
}

export async function moveSupporterItemToPlayer(slot: number): Promise<CityActionResult> {
  const supporterBag = await loadSupporterBag(); const item = supporterBag?.slots[slot];
  if (!supporterBag || !item) return { ok: false, message: "That Supporter Bag slot is empty." };
  const playerBag = await loadBag(); const transfer = { ...item, quantity: 1 };
  const plan = transfer.maxDurability === undefined ? planAddToBag(transfer, playerBag) : planAddToNextFreeBagSlot(transfer, playerBag);
  const fits = "ok" in plan ? plan.ok : plan.canTransfer && plan.remainderQty === 0;
  if (!fits) return { ok: false, message: "The Player Bag is full." };
  await AsyncStorage.multiSet([
    [PLAYER_BAG_KEY, JSON.stringify({ ...playerBag, slots: plan.updatedSlots })],
    [SUPPORTER_BAG_KEY, JSON.stringify(removeBagItem(supporterBag, slot, 1))],
  ]);
  return { ok: true, message: `${item.name} moved to the Player Bag.` };
}

export async function discardSupporterItem(slot: number): Promise<CityActionResult> {
  const bag = await loadSupporterBag(); const item = bag?.slots[slot];
  if (!bag || !item) return { ok: false, message: "That Supporter Bag slot is empty." };
  if (hasItemAttribute(item, ITEM_ATTRIBUTE.QUEST_ITEM)) return { ok: false, message: "Quest Items cannot be discarded." };
  await AsyncStorage.setItem(SUPPORTER_BAG_KEY, JSON.stringify(removeBagItem(bag, slot, item.quantity)));
  return { ok: true, message: `${item.name} discarded.` };
}

export async function eatSupporterItem(slot: number): Promise<CityActionResult> {
  const bag = await loadSupporterBag(); const item = bag?.slots[slot];
  if (!bag || !item || (!isEdible(item) && !isConsumable(item))) return { ok: false, message: "That item cannot be eaten." };
  const [rawStats, rawStamina, rawLife] = await AsyncStorage.multiGet([PLAYER_STATS_KEY, "@game:stamina", "@game:life"]);
  const stats = normalizePlayerStats(rawStats[1] ? JSON.parse(rawStats[1]) : DEFAULT_PLAYER_STATS);
  const stamina = Math.max(0, Number(rawStamina[1]) || 0); const life = Math.max(0, Number(rawLife[1]) || 0);
  if (!canConsumeForStamina(item, stamina, stats.maximumStamina) && life >= stats.maximumLife) return { ok: false, message: "I do not need this right now." };
  const nextStamina = applyStaminaRecovery(item, stamina, stats.maximumStamina); const nextLife = applyLifeRecovery(item, life, stats.maximumLife);
  await AsyncStorage.multiSet([[SUPPORTER_BAG_KEY, JSON.stringify(removeBagItem(bag, slot, 1))], ["@game:stamina", String(nextStamina)], ["@game:life", String(nextLife)]]);
  return { ok: true, message: `${item.name} consumed.` };
}

export async function activeSupporter(): Promise<{ definition: SupporterDefinition; runsRemaining: number } | null> {
  const state = await loadCityState();
  if (!state.supporter) return null;
  const day = (await loadGuestState()).calendarDaySerial;
  if (!state.supporter.runsRemaining && state.supporter.announcedRunSerial !== day) return null;
  return { definition: SUPPORTERS[state.supporter.id], runsRemaining: state.supporter.runsRemaining };
}

/** Dungeon finds go into the hired supporter's bag first; the caller receives overflow. */
export async function addToSupporterFirst(item: BagItem): Promise<{ stored: boolean; destination: "supporter" | "player" }> {
  const supportBag = await loadSupporterBag();
  if (!supportBag) return { stored: false, destination: "player" };
  const plan = item.maxDurability === undefined ? planAddToBag(item, supportBag) : planAddToNextFreeBagSlot(item, supportBag);
  const fits = "ok" in plan ? plan.ok : plan.canTransfer && plan.remainderQty === 0;
  if (!fits) return { stored: false, destination: "player" };
  await AsyncStorage.setItem(SUPPORTER_BAG_KEY, JSON.stringify({ ...supportBag, slots: plan.updatedSlots }));
  return { stored: true, destination: "supporter" };
}

export async function beginSupporterDungeonRun(): Promise<{ id: SupporterId; runsRemaining: number } | null> {
  const state = await loadCityState(); if (!state.supporter?.runsRemaining) return null;
  const day = (await loadGuestState()).calendarDaySerial;
  if (state.supporter.announcedRunSerial !== day) {
    state.supporter.runsRemaining -= 1; state.supporter.announcedRunSerial = day;
    await saveCityState(state);
  }
  return { id: state.supporter.id, runsRemaining: state.supporter.runsRemaining };
}

/** Returns everything carried by the current supporter as one claimable mailbox package. */
export async function deliverSupporterBagAfterDungeonRun(): Promise<boolean> {
  const state = await loadCityState();
  const supporter = state.supporter;
  if (!supporter || supporter.announcedRunSerial === null) return false;

  const definition = SUPPORTERS[supporter.id];
  const raw = await AsyncStorage.getItem(SUPPORTER_BAG_KEY);
  const parsed = raw ? JSON.parse(raw) as Partial<PlayerBagData> : {};
  const slots = Array.isArray(parsed.slots) ? parsed.slots : [];
  const carriedItems = slots.filter((item): item is BagItem => item !== null && typeof item === "object" && item.quantity > 0);
  if (!carriedItems.length) return false;

  await deliverMailboxMessage({
    id: `supporter-return:${supporter.id}:${supporter.announcedRunSerial}`,
    sender: definition.name,
    senderKind: "adventurer",
    subject: "Supporter Bag Returned",
    body: "Our dungeon run is over. I packed everything I carried during the expedition and sent it to your Courier’s Chest.",
    rewards: carriedItems.map((item) => ({
      type: "item" as const,
      itemId: item.id,
      quantity: item.quantity,
      item: {
        ...item,
        attributes: item.attributes ? [...item.attributes] : undefined,
        mealTags: item.mealTags ? [...item.mealTags] : undefined,
      },
    })),
  });

  const emptyBag: PlayerBagData = {
    bagId: `supporter_${definition.id}`,
    level: 1,
    rows: definition.rows,
    columns: definition.columns,
    slotCount: definition.slots,
    maxStackSize: 9,
    unlocked: true,
    slots: Array(definition.slots).fill(null),
  };
  await AsyncStorage.setItem(SUPPORTER_BAG_KEY, JSON.stringify(emptyBag));
  return true;
}

export async function hasActiveCampQuest(): Promise<boolean> {
  const state = await loadCityState();
  return state.quests.camp.status === "accepted" && state.quests.camp.progress === 0;
}

export async function markCampDocumentsFound(): Promise<void> {
  const state = await loadCityState();
  if (state.quests.camp.status !== "accepted") return;
  state.quests.camp.progress = 1; state.quests.camp.status = "ready"; await saveCityState(state);
}

export async function acceptQuest(id: QuestId): Promise<CityActionResult> {
  const state = await loadCityState(); if (state.quests[id].status !== "offered") return { ok: false, message: "That quest is already in my journal." };
  state.quests[id] = { status: "accepted", progress: 0 }; await saveCityState(state); return { ok: true, message: `${QUESTS[id].title} accepted.` };
}

function itemCount(bag: PlayerBagData, id: string): number { return bag.slots.reduce((sum, item) => sum + (item?.id === id ? item.quantity : 0), 0); }
function consumeItems(bag: PlayerBagData, id: string, quantity: number): PlayerBagData {
  let left = quantity; let next = bag;
  for (let i = 0; i < next.slots.length && left > 0; i += 1) { const item = next.slots[i]; if (item?.id !== id) continue; const used = Math.min(left, item.quantity); next = removeBagItem(next, i, used); left -= used; }
  return next;
}

export async function turnInQuest(id: QuestId): Promise<CityActionResult> {
  const state = await loadCityState(); const quest = state.quests[id]; if (quest.status !== "accepted" && quest.status !== "ready") return { ok: false, message: "That quest is not ready to turn in." };
  let bag = await loadBag(); let requirementMet = id === "wolves" ? quest.progress >= 2 : false;
  const requirement = id === "feathers" ? ["mushroom", 2] as const : id === "camp" ? ["quest_hunters_documents", 1] as const : id === "healing" ? ["potion_stamina_low_grade", 1] as const : null;
  if (requirement) { requirementMet = itemCount(bag, requirement[0]) >= requirement[1]; if (requirementMet) bag = consumeItems(bag, requirement[0], requirement[1]); }
  if (!requirementMet) return { ok: false, message: "The quest requirements are not complete yet." };
  const def = QUESTS[id]; state.guildReputation += def.reputation; state.quests[id] = { status: "completed", progress: quest.progress };
  await AsyncStorage.multiSet([[PLAYER_BAG_KEY, JSON.stringify(bag)], [CITY_STATE_KEY, JSON.stringify(state)]]);
  await Promise.all([addCurrencyCopper(def.rewardCopper), addKarmaPoints(RANK_H_QUEST_KARMA_POINTS)]);
  return { ok: true, message: `Quest complete: ${formatCurrencyAmount(def.rewardCopper)} and ${def.reputation} Guild Reputation awarded.` };
}

export async function recordMonsterDefeat(monsterId: string): Promise<void> {
  const karmaReward: Record<string, number> = {
    forest_slime: 3,
    feral_rabbit: 3,
    wild_boar: 3,
    wild_wolf: 3,
    goblin_forager: 3,
    ember_chick: 4,
    ember_chicken: 5,
    ember_rooster: 8,
    elder_ember_rooster: 15,
  };
  await addKarmaPoints(karmaReward[monsterId] ?? 3);
  if (monsterId !== "feral_rabbit") return;
  const state = await loadCityState(); const quest = state.quests.wolves;
  if (quest.status !== "accepted") return; quest.progress = Math.min(2, quest.progress + 1); if (quest.progress >= 2) quest.status = "ready"; await saveCityState(state);
}

export async function processGuildCarcasses(selections: readonly GuildCarcassSelection[]): Promise<CityActionResult> {
  const grouped = new Map<number, GuildCarcassSelection>();
  for (const selection of selections) {
    const bagSlotIndex = Math.floor(selection.bagSlotIndex);
    const quantity = Math.max(0, Math.floor(selection.quantity));
    if (bagSlotIndex < 0 || quantity < 1 || !getButcheringDefinition(selection.monsterId)) continue;
    const existing = grouped.get(bagSlotIndex);
    if (existing && existing.monsterId !== selection.monsterId) {
      return { ok: false, message: "The carcass selection is no longer valid." };
    }
    grouped.set(bagSlotIndex, {
      bagSlotIndex,
      monsterId: selection.monsterId,
      quantity: (existing?.quantity ?? 0) + quantity,
    });
  }
  if (!grouped.size) return { ok: false, message: "Select at least one Monster Carcass." };

  const bag = await loadBag();
  let carcassCount = 0;
  for (const selection of grouped.values()) {
    const item = bag.slots[selection.bagSlotIndex];
    if (item?.id !== "monster_carcass" || item.monsterId !== selection.monsterId || item.quantity < selection.quantity) {
      return { ok: false, message: "The carcass selection has changed. Please select the carcasses again." };
    }
    carcassCount += selection.quantity;
  }

  const totalFee = carcassCount * GUILD_PROCESSING_FEE_PER_CARCASS;
  const balance = await loadCurrencyCopper();
  if (balance < totalFee) return { ok: false, message: `I need ${formatCurrencyAmount(totalFee)} for processing.` };

  let nextBag = bag;
  const state = await loadCityState();
  const day = (await loadGuestState()).calendarDaySerial;
  let entryIndex = 0;
  for (const selection of grouped.values()) {
    nextBag = removeBagItem(nextBag, selection.bagSlotIndex, selection.quantity);
    const outputs = rollButcheringOutputs(
      selection.monsterId,
      "tool_steel_butchering_knife",
      0,
      selection.quantity,
    ).map((output) => ({ itemId: output.id, quantity: output.quantity }));
    state.pendingProcessing.push({
      id: `guild-${selection.monsterId}-${day}-${Date.now()}-${entryIndex}`,
      dueDay: day + 1,
      monsterId: selection.monsterId,
      meat: 0,
      feathers: 0,
      outputs,
    });
    entryIndex += 1;
  }

  await AsyncStorage.multiSet([
    [PLAYER_BAG_KEY, JSON.stringify(nextBag)],
    [CITY_STATE_KEY, JSON.stringify(state)],
  ]);
  await saveCurrencyCopper(balance - totalFee);
  return {
    ok: true,
    message: `${carcassCount} ${carcassCount === 1 ? "carcass" : "carcasses"} sent to the Guild Butcher for ${formatCurrencyAmount(totalFee)}. The result will arrive in the Courier’s Chest tomorrow.`,
  };
}

export async function processEmberChicken(): Promise<CityActionResult> {
  const bag = await loadBag();
  const index = bag.slots.findIndex((item) => item?.id === "monster_carcass" && item.monsterId === "ember_chicken");
  if (index < 0) return { ok: false, message: "I do not have an Ember Chicken Carcass." };
  return processGuildCarcasses([{ bagSlotIndex: index, monsterId: "ember_chicken", quantity: 1 }]);
}

export async function processTutorialWildWolf(): Promise<CityActionResult> {
  const escort = await loadCoachmanEscortState();
  if (escort.phase !== "city_exploration" && escort.phase !== "city_arrival") {
    return { ok: false, message: "There is no tutorial carcass to process." };
  }
  const bag = await loadBag();
  const index = bag.slots.findIndex((item) => item?.id === "monster_carcass" && item.monsterId === "wild_wolf");
  if (index < 0) return { ok: false, message: "I do not have the Forest Wolf Carcass." };
  const state = await loadCityState();
  const day = (await loadGuestState()).calendarDaySerial;
  const outputs = rollButcheringOutputs("wild_wolf", "tool_steel_butchering_knife", 0)
    .map((output) => ({ itemId: output.id, quantity: output.quantity }));
  state.pendingProcessing.push({
    id: `tutorial-wolf-${day}-${Date.now()}`,
    dueDay: day + 1,
    kind: "wild_wolf",
    monsterId: "wild_wolf",
    meat: 0,
    feathers: 0,
    pelts: 0,
    outputs,
  });
  await AsyncStorage.multiSet([
    [PLAYER_BAG_KEY, JSON.stringify(removeBagItem(bag, index, 1))],
    [CITY_STATE_KEY, JSON.stringify(state)],
  ]);
  await setCoachmanEscortPhase("complete");
  return { ok: true, message: "The Guild accepted the carcass. The result will arrive in the Courier’s Chest tomorrow." };
}

export function guildRank(reputation: number): string { return ["H", "G", "F", "E", "D", "C", "B", "A", "S", "L"][Math.min(9, Math.floor(reputation / 100))]; }
