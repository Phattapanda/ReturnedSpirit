import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  ITEM_CATALOG,
  ITEM_ATTRIBUTE,
  PLAYER_BAG_KEY,
  normalizeBagItem,
  normalizePlayerBagData,
  planAddToBag,
  removeBagItem,
  type BagItem,
  type PlayerBagData,
} from "@/src/game/item-system";
import {
  calculateIncomingPhysicalDamage,
  consumeArmorDurability,
  consumeWeaponDurability,
  getEquippedItem,
  rollPlayerPhysicalDamage,
} from "@/src/game/equipment-system";
import { loadCurrencyCopper, saveCurrencyCopper } from "@/src/game/currency-system";
import { DEFAULT_PLAYER_STATS, PLAYER_STATS_KEY, getEffectiveLuck, normalizePlayerStats, type PlayerStats } from "@/src/game/player-stats";
import {
  GARDEN_INVENTORY_KEY,
  normalizeGardenInventory,
  normalizeSharedResources,
  planTavernReturnStorage,
} from "@/src/game/tavern-return-storage";
import { SHARED_RESOURCES_KEY } from "@/src/game/shared-resources";
import { FOREST_DIRECT_LOOT, getButcheringDefinition } from "@/src/game/butchering-system";
import {
  activeSupporter, activeTempleBlessing, addToSupporterFirst, beginSupporterDungeonRun,
  beginTempleBlessingExpedition, completeTempleBlessingExpedition, deliverSupporterBagAfterDungeonRun, hasActiveCampQuest,
  markCampDocumentsFound, recordMonsterDefeat,
} from "@/src/game/city-system";

export const FOREST_DUNGEON_KEY = "@dungeon:forest_entrance";
export const FOREST_FIGHT_SNAPSHOT_KEY = "@dungeon:forest_fight_snapshot";
export const FOREST_FLOOR_COUNT = 30;
export const FOREST_FORWARD_STAMINA_COST = 3;
export const FOREST_SEARCH_BASE_SUCCESS = 60;
export const FOREST_SEARCH_PERCEPTION_BONUS = 2;
export const FOREST_SEARCH_LUCK_POINTS_PER_BONUS_ITEM = 10;
export const FOREST_REST_FLOORS = new Set([5, 10, 15, 20, 25]);

export const LUCK_ROLLED_FIND_ITEM_IDS: ReadonlySet<string> = new Set([
  "herbs",
  "mushroom",
  "nuts",
  "wild_berries",
  "egg",
  "ember_feather",
  "ember_chicken_egg",
]);

const STAMINA_KEY = "@game:stamina";
const LIFE_KEY = "@game:life";

export type ForestMonsterId =
  | "forest_slime"
  | "feral_rabbit"
  | "wild_boar"
  | "wild_wolf"
  | "ember_chick"
  | "ember_chicken"
  | "ember_rooster"
  | "goblin_forager"
  | "elder_ember_rooster";
export type ForestMonsterDefinition = {
  id: ForestMonsterId;
  name: string;
  strength: number;
  physicalDefense: number;
  magicalDefense: number;
  fireMagicalDefense?: number;
  fireImmune?: boolean;
  boss?: boolean;
  maximumLife: number;
};

export type ForestAttackPreview = {
  hitChance: number;
  minimumDamage: number;
  maximumDamage: number;
};

export const FOREST_MONSTERS: Record<ForestMonsterId, ForestMonsterDefinition> = {
  forest_slime: { id: "forest_slime", name: "Forest Slime", strength: 3, physicalDefense: 1, magicalDefense: 0, maximumLife: 6 },
  feral_rabbit: { id: "feral_rabbit", name: "Feral Rabbit", strength: 5, physicalDefense: 2, magicalDefense: 0, maximumLife: 10 },
  wild_boar: { id: "wild_boar", name: "Wild Boar", strength: 7, physicalDefense: 4, magicalDefense: 3, maximumLife: 18 },
  wild_wolf: { id: "wild_wolf", name: "Wild Wolf", strength: 9, physicalDefense: 3, magicalDefense: 2, maximumLife: 18 },
  ember_chick: { id: "ember_chick", name: "Ember Chick", strength: 5, physicalDefense: 2, magicalDefense: 0, fireMagicalDefense: 10, maximumLife: 12 },
  ember_chicken: { id: "ember_chicken", name: "Ember Chicken", strength: 10, physicalDefense: 6, magicalDefense: 0, fireMagicalDefense: 15, maximumLife: 22 },
  ember_rooster: { id: "ember_rooster", name: "Ember Rooster", strength: 12, physicalDefense: 5, magicalDefense: 0, fireMagicalDefense: 13, maximumLife: 25 },
  goblin_forager: { id: "goblin_forager", name: "Goblin Forager", strength: 8, physicalDefense: 4, magicalDefense: 5, maximumLife: 15 },
  elder_ember_rooster: { id: "elder_ember_rooster", name: "Elder Ember Rooster", strength: 20, physicalDefense: 10, magicalDefense: 0, fireImmune: true, boss: true, maximumLife: 50 },
};

export type ForestMonsterState = {
  id: ForestMonsterId;
  life: number;
  maximumLife: number;
  phase: "noticed" | "hidden" | "avoided" | "combat" | "defeated";
};

export type ForestFloorState = {
  searched: boolean;
  searchAvailable: boolean;
  searchCost: number;
  searchLocation: string;
  monster: ForestMonsterState | null;
  message: string | null;
  carcassPending: boolean;
  pendingLoot: BagItem[];
};

export type ForestDungeonState = {
  version: 1;
  active: boolean;
  currentFloor: number;
  floors: Record<string, ForestFloorState>;
};

export const DEFAULT_FOREST_DUNGEON_STATE: ForestDungeonState = {
  version: 1,
  active: true,
  currentFloor: 1,
  floors: {},
};

type SearchLocation = { name: string; cost: number; itemId?: string; copper?: [number, number] };
const SEARCH_LOCATIONS: readonly SearchLocation[] = [
  { name: "Berry Bush", cost: 3, itemId: "wild_berries" },
  { name: "Wild Herb Patch", cost: 4, itemId: "herbs" },
  { name: "Tree Hollow", cost: 5, copper: [3, 12] },
  { name: "Ember Chicken Nest", cost: 5, itemId: "ember_chicken_egg" },
  { name: "Small Pond", cost: 4, itemId: "fish" },
  { name: "Abandoned Backpack", cost: 5, itemId: "cloth" },
  { name: "Animal Burrow", cost: 5, itemId: "white_meat" },
  { name: "Scorched Clearing", cost: 6, itemId: "ember_feather" },
];

function clampPercent(value: number): number { return Math.max(0, Math.min(100, value)); }

/**
 * Rolls the 2-5 quantity used by search, gathering, and nest finds.
 * Each later roll is only attempted after the preceding roll succeeds.
 */
export function rollLuckFindQuantity(luck: number, randomValue = Math.random): number {
  const safeLuck = Math.max(0, Number.isFinite(luck) ? luck : 0);
  const chances = [25 + safeLuck * 5, 10 + safeLuck * 5, safeLuck * 5];
  let quantity = 2;
  for (const chance of chances) {
    if (randomValue() * 100 >= clampPercent(chance)) break;
    quantity += 1;
  }
  return quantity;
}

/** Uses the same accuracy and physical-damage formula as attackForestMonster. */
export function getForestAttackPreview(
  monsterId: ForestMonsterId,
  target: "head" | "body",
  stats: PlayerStats,
  bag: PlayerBagData,
): ForestAttackPreview {
  const monster = FOREST_MONSTERS[monsterId];
  const weapon = getEquippedItem(bag, "weapon");
  const entry = weapon ? ITEM_CATALOG[weapon.id] : null;
  const hitChance = clampPercent((entry?.basicAccuracyPercent ?? 100) + stats.accuracy - (target === "head" ? 30 : 0));
  const strength = Math.max(0, Math.floor(stats.strength));
  const defense = Math.max(0, Math.floor(monster.physicalDefense));
  const minimum = Math.max(0, (entry?.damageMin ?? 0) + strength - defense);
  const maximum = Math.max(0, Math.max(entry?.damageMin ?? 0, entry?.damageMax ?? 0) + strength - defense);
  return {
    hitChance,
    minimumDamage: target === "head" ? Math.ceil(minimum * 1.5) : minimum,
    maximumDamage: target === "head" ? Math.ceil(maximum * 1.5) : maximum,
  };
}
function randomIndex(length: number, randomValue = Math.random): number {
  return Math.min(length - 1, Math.floor(Math.max(0, Math.min(0.999999, randomValue())) * length));
}

export function forestAreaForFloor(floor: number): "Forest Edge" | "Deeper Forest" | "Forest Heart" | "Forest Rest Area" | "Forest Nest" {
  if (FOREST_REST_FLOORS.has(floor)) return "Forest Rest Area";
  if (floor <= 9) return "Forest Edge";
  if (floor <= 19) return "Deeper Forest";
  if (floor <= 24) return "Forest Heart";
  return "Forest Nest";
}

function monsterPoolForFloor(floor: number): ForestMonsterId[] {
  if (floor <= 4) return ["forest_slime", "feral_rabbit"];
  if (floor <= 9) return ["forest_slime", "feral_rabbit", "wild_boar", "ember_chick", "goblin_forager"];
  if (floor <= 14) return ["feral_rabbit", "wild_boar", "wild_wolf", "ember_chick", "goblin_forager"];
  if (floor <= 19) return ["wild_boar", "wild_wolf", "ember_chick", "ember_chicken", "goblin_forager"];
  if (floor <= 24) return ["wild_wolf", "ember_chicken", "ember_rooster", "goblin_forager"];
  return ["wild_wolf", "ember_chicken", "ember_rooster"];
}

function createFloorState(floor: number): ForestFloorState {
  if (floor === FOREST_FLOOR_COUNT) {
    const boss = FOREST_MONSTERS.elder_ember_rooster;
    return {
      searched: false,
      searchAvailable: false,
      searchCost: 0,
      searchLocation: "Elder Ember Rooster Nest",
      monster: { id: boss.id, life: boss.maximumLife, maximumLife: boss.maximumLife, phase: "combat" },
      message: "The Elder Ember Rooster guards the heart of the nest.",
      carcassPending: false,
      pendingLoot: [],
    };
  }
  const location = SEARCH_LOCATIONS[randomIndex(SEARCH_LOCATIONS.length)];
  return {
    searched: false,
    searchAvailable: !FOREST_REST_FLOORS.has(floor) && floor < FOREST_FLOOR_COUNT,
    searchCost: location.cost,
    searchLocation: location.name,
    monster: null,
    message: FOREST_REST_FLOORS.has(floor) ? "This is a safe place to rest." : null,
    carcassPending: false,
    pendingLoot: [],
  };
}

function normalizeFloor(raw: Partial<ForestFloorState> | undefined, floor: number): ForestFloorState {
  const fallback = createFloorState(floor);
  const monster = raw?.monster && FOREST_MONSTERS[raw.monster.id]
    ? {
        id: raw.monster.id,
        life: Math.max(0, Math.floor(Number(raw.monster.life) || 0)),
        maximumLife: FOREST_MONSTERS[raw.monster.id].maximumLife,
        phase: raw.monster.phase === "noticed" || raw.monster.phase === "hidden" || raw.monster.phase === "avoided" || raw.monster.phase === "defeated"
          ? raw.monster.phase
          : "combat" as const,
      }
    : fallback.monster;
  return {
    searched: raw?.searched === true,
    searchAvailable: raw?.searchAvailable !== false && !FOREST_REST_FLOORS.has(floor) && floor < FOREST_FLOOR_COUNT,
    searchCost: Math.max(0, Math.floor(Number(raw?.searchCost) || fallback.searchCost)),
    searchLocation: typeof raw?.searchLocation === "string" ? raw.searchLocation : fallback.searchLocation,
    monster,
    message: typeof raw?.message === "string" ? raw.message : fallback.message,
    carcassPending: raw?.carcassPending === true,
    pendingLoot: Array.isArray(raw?.pendingLoot)
      ? raw.pendingLoot.map((item) => normalizeBagItem(item)).filter((item): item is BagItem => item !== null)
      : [],
  };
}

export function normalizeForestDungeonState(raw: unknown): ForestDungeonState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_FOREST_DUNGEON_STATE, floors: {} };
  const candidate = raw as Partial<ForestDungeonState>;
  const currentFloor = Math.max(1, Math.min(FOREST_FLOOR_COUNT, Math.floor(Number(candidate.currentFloor) || 1)));
  const floors: Record<string, ForestFloorState> = {};
  if (candidate.floors && typeof candidate.floors === "object") {
    for (const [key, value] of Object.entries(candidate.floors)) {
      const floor = Math.floor(Number(key));
      if (floor >= 1 && floor <= FOREST_FLOOR_COUNT) floors[String(floor)] = normalizeFloor(value, floor);
    }
  }
  return { version: 1, active: candidate.active !== false, currentFloor, floors };
}

export async function loadForestDungeonState(): Promise<ForestDungeonState> {
  const raw = await AsyncStorage.getItem(FOREST_DUNGEON_KEY);
  const state = normalizeForestDungeonState(raw ? JSON.parse(raw) : null);
  if (!state.floors[String(state.currentFloor)]) state.floors[String(state.currentFloor)] = createFloorState(state.currentFloor);
  const current = state.floors[String(state.currentFloor)];
  if (current.searchAvailable && !current.searched && await hasActiveCampQuest()) {
    current.searchLocation = "Hunter's Camp";
    current.searchCost = 5;
  }
  return state;
}

export async function enterForestDungeon(): Promise<ForestDungeonState> {
  await beginSupporterDungeonRun();
  await beginTempleBlessingExpedition();
  const loaded = await loadForestDungeonState();
  if (loaded.active) return loaded;
  const fresh: ForestDungeonState = { ...DEFAULT_FOREST_DUNGEON_STATE, active: true, floors: { "1": createFloorState(1) } };
  return saveForestDungeonState(fresh);
}

export async function saveForestDungeonState(state: ForestDungeonState): Promise<ForestDungeonState> {
  const normalized = normalizeForestDungeonState(state);
  await AsyncStorage.setItem(FOREST_DUNGEON_KEY, JSON.stringify(normalized));
  return normalized;
}

async function loadRuntime() {
  const [rawStats, rawStamina, rawLife, rawBag] = await AsyncStorage.multiGet([PLAYER_STATS_KEY, STAMINA_KEY, LIFE_KEY, PLAYER_BAG_KEY]);
  const blessing = await activeTempleBlessing();
  const baseStats = normalizePlayerStats(rawStats[1] ? JSON.parse(rawStats[1]) : DEFAULT_PLAYER_STATS);
  return {
    stats: { ...baseStats, maximumStamina: baseStats.maximumStamina + (blessing === "endurance" ? 50 : 0), luck: baseStats.luck + (blessing === "fortune" ? 5 : 0) },
    stamina: Math.max(0, Number.parseInt(rawStamina[1] ?? "0", 10) || 0),
    life: Math.max(0, Number.parseInt(rawLife[1] ?? "0", 10) || 0),
    bag: normalizePlayerBagData(rawBag[1] ? JSON.parse(rawBag[1]) : {}),
  };
}

async function saveRuntime(state: ForestDungeonState, life: number, stamina: number, bag: PlayerBagData) {
  await AsyncStorage.multiSet([
    [FOREST_DUNGEON_KEY, JSON.stringify(state)], [LIFE_KEY, String(life)], [STAMINA_KEY, String(stamina)], [PLAYER_BAG_KEY, JSON.stringify(bag)],
  ]);
}

export type DungeonLootFlight = { item: BagItem; destination: "supporter" | "player" };
export type DungeonActionResult = {
  ok: boolean;
  state: ForestDungeonState;
  message: string;
  life: number;
  stamina: number;
  bag: PlayerBagData;
  playerAttack?: { kind: "slash" | "critical" | "punch"; damage: number; defeated: boolean };
  lootFlights?: DungeonLootFlight[];
};

function currentFloorOf(state: ForestDungeonState): ForestFloorState {
  return state.floors[String(state.currentFloor)] ?? createFloorState(state.currentFloor);
}

function spawnMonster(floor: number): ForestMonsterState {
  const pool = monsterPoolForFloor(floor);
  const id = pool[randomIndex(pool.length)];
  return { id, life: FOREST_MONSTERS[id].maximumLife, maximumLife: FOREST_MONSTERS[id].maximumLife, phase: "noticed" };
}

function createCarcass(monster: ForestMonsterDefinition): BagItem {
  const definition = getButcheringDefinition(monster.id);
  return { id: "monster_carcass", itemType: "monster_carcass", name: definition?.carcassName ?? `${monster.name} Carcass`, quantity: 1, monsterId: monster.id, attributes: ["material"] };
}

const SLASHING_WEAPON_IDS = new Set([
  "weapon_iron_dagger",
  "weapon_iron_shortsword",
  "weapon_iron_sword",
]);

function normalAttackKind(weapon: BagItem | null): "slash" | "punch" {
  return weapon && SLASHING_WEAPON_IDS.has(weapon.id) ? "slash" : "punch";
}

function createMaterial(id: string, quantity = 1): BagItem {
  const catalog = ITEM_CATALOG[id];
  return { id, itemType: id, name: catalog?.name ?? id, quantity, attributes: catalog?.attributes ? [...catalog.attributes] : undefined };
}

async function addRewardItem(bag: PlayerBagData, item: BagItem): Promise<{ bag: PlayerBagData; added: boolean; destination: "supporter" | "player" }> {
  const support = await addToSupporterFirst(item);
  if (support.stored) return { bag, added: true, destination: "supporter" };
  const plan = planAddToBag(item, bag);
  return plan.canTransfer && plan.remainderQty === 0
    ? { bag: { ...bag, slots: plan.updatedSlots }, added: true, destination: "player" }
    : { bag, added: false, destination: "player" };
}

async function grantMonsterDefeatRewards(
  floor: ForestFloorState,
  bag: PlayerBagData,
  monster: ForestMonsterDefinition,
): Promise<{ bag: PlayerBagData; message: string; lootFlights: DungeonLootFlight[] }> {
  const definition = getButcheringDefinition(monster.id);
  const directLoot = FOREST_DIRECT_LOOT[monster.id];
  const rewards: BagItem[] = definition
    ? [createCarcass(monster)]
    : directLoot
      ? directLoot.map((id) => createMaterial(id))
        : monster.id === "ember_chick"
          ? [createMaterial("ember_feather")]
          : [];
  let copper = 0;
  if (monster.id === "goblin_forager") {
    copper = 3 + Math.floor(Math.random() * 6);
    await saveCurrencyCopper((await loadCurrencyCopper()) + copper);
  }
  const pending: BagItem[] = [];
  const received: string[] = [];
  const lootFlights: DungeonLootFlight[] = [];
  let nextBag = bag;
  for (const item of rewards) {
    const result = await addRewardItem(nextBag, item);
    nextBag = result.bag;
    if (result.added) {
      received.push(item.name);
      lootFlights.push({ item, destination: result.destination });
    }
    else pending.push(item);
  }
  floor.pendingLoot = pending;
  floor.carcassPending = pending.length > 0;
  const parts: string[] = [];
  if (received.length) parts.push(`${received.join(", ")} ${received.length === 1 ? "was" : "were"} collected.`);
  if (copper) parts.push(`${copper} Copper was collected.`);
  if (pending.length) parts.push("My bags are full; the remaining battle loot stays here.");
  return { bag: nextBag, message: parts.length ? ` ${parts.join(" ")}` : "", lootFlights };
}

function dungeonActivityCost(bag: PlayerBagData, baseCost: number): number {
  return getEquippedItem(bag, "tool")?.id === "torch" ? Math.max(0, baseCost - 2) : baseCost;
}

function payDungeonActivityCost(stamina: number, life: number, cost: number) {
  const staminaPaid = Math.min(Math.max(0, stamina), cost);
  const lifePaid = Math.max(0, cost - staminaPaid);
  return {
    stamina: stamina - staminaPaid,
    life: Math.max(0, life - lifePaid),
    lifePaid,
    message: lifePaid > 0 ? ` I lack Stamina and lose ${lifePaid} Life instead.` : "",
  };
}

function consumeTorchDurability(bag: PlayerBagData): PlayerBagData {
  const index = bag.slots.findIndex((item) => item?.equipped && item.id === "torch");
  if (index < 0) return bag;
  const torch = bag.slots[index]!; const remaining = Math.max(0, (torch.durability ?? 50) - 1);
  const slots = [...bag.slots];
  slots[index] = remaining > 0
    ? { ...torch, durability: remaining }
    : { id: "coal", itemType: "coal", name: "Coal", quantity: 1, attributes: [ITEM_ATTRIBUTE.MATERIAL] };
  return { ...bag, slots };
}

async function saveFightSnapshot(state: ForestDungeonState, life: number, stamina: number, bag: PlayerBagData) {
  await AsyncStorage.setItem(FOREST_FIGHT_SNAPSHOT_KEY, JSON.stringify({ state, life, stamina, bag }));
}

export async function searchForestArea(): Promise<DungeonActionResult> {
  const state = await loadForestDungeonState();
  const runtime = await loadRuntime();
  const floor = currentFloorOf(state);
  if (!floor.searchAvailable || floor.searched || floor.monster?.phase === "combat") return { ok: false, state, message: "There is nothing more to search here.", ...runtime };
  const activityCost = dungeonActivityCost(runtime.bag, floor.searchCost);
  const payment = payDungeonActivityCost(runtime.stamina, runtime.life, activityCost);
  const stamina = payment.stamina;
  const paidLife = payment.life;
  runtime.bag = consumeTorchDurability(runtime.bag);
  const nextFloor = { ...floor, searched: true, searchAvailable: false };
  const nextState = { ...state, floors: { ...state.floors, [String(state.currentFloor)]: nextFloor } };
  const hiredSupporter = await activeSupporter();
  const searchPerception = hiredSupporter?.definition.id === "botanist" ? runtime.stats.perception * 1.15 : runtime.stats.perception;
  const successChance = clampPercent(FOREST_SEARCH_BASE_SUCCESS + searchPerception * FOREST_SEARCH_PERCEPTION_BONUS);
  if (Math.random() * 100 >= successChance) {
    nextFloor.message = "I could not find anything useful.";
    nextFloor.message += payment.message;
    await saveRuntime(nextState, paidLife, stamina, runtime.bag);
    return { ok: true, state: nextState, message: nextFloor.message, life: paidLife, stamina, bag: runtime.bag };
  }

  if (floor.searchLocation === "Hunter's Camp" && await hasActiveCampQuest()) {
    const item: BagItem = { id: "quest_hunters_documents", itemType: "quest_hunters_documents", name: "Research Documents", quantity: 1, attributes: [ITEM_ATTRIBUTE.QUEST_ITEM] };
    const support = await addToSupporterFirst(item);
    let bag = runtime.bag;
    if (!support.stored) {
      const plan = planAddToBag(item, bag);
      if (!plan.canTransfer || plan.remainderQty) {
        nextFloor.message = "I found the researchers' document bag, but neither bag has enough room." + payment.message;
        await saveRuntime(nextState, paidLife, stamina, bag);
        return { ok: true, state: nextState, message: nextFloor.message, life: paidLife, stamina, bag };
      }
      bag = { ...bag, slots: plan.updatedSlots };
    }
    await markCampDocumentsFound();
    nextFloor.message = `I found the researchers' documents at the Hunter's Camp. They went into the ${support.stored ? "Supporter Bag" : "Player Bag"}.` + payment.message;
    await saveRuntime(nextState, paidLife, stamina, bag);
    return { ok: true, state: nextState, message: nextFloor.message, life: paidLife, stamina, bag };
  }

  // After deliberately letting a monster pass, searching should inspect the
  // newly safe area rather than immediately spawning a replacement encounter.
  const eventRoll = floor.monster?.phase === "avoided" ? 50 + Math.random() * 50 : Math.random() * 100;
  if (eventRoll < 50) {
    nextFloor.monster = spawnMonster(state.currentFloor);
    const monster = FOREST_MONSTERS[nextFloor.monster.id];
    nextFloor.message = `I noticed a ${monster.name} before it noticed me.` + payment.message;
    await saveRuntime(nextState, paidLife, stamina, runtime.bag);
    return { ok: true, state: nextState, message: nextFloor.message, life: paidLife, stamina, bag: runtime.bag };
  }

  const location = SEARCH_LOCATIONS.find((entry) => entry.name === floor.searchLocation) ?? SEARCH_LOCATIONS[0];
  const effectiveLuck = getEffectiveLuck(runtime.stats);
  const searchLuck = hiredSupporter?.definition.id === "botanist" ? effectiveLuck * 1.15 : effectiveLuck;
  const usesLuckRolledQuantity = Boolean(location.itemId && LUCK_ROLLED_FIND_ITEM_IDS.has(location.itemId));
  const botanistYield = !usesLuckRolledQuantity && hiredSupporter?.definition.id === "botanist" && Math.random() < 0.15 ? 1 : 0;
  const findQuantity = usesLuckRolledQuantity
    ? rollLuckFindQuantity(searchLuck)
    : 1 + botanistYield + Math.min(2, Math.floor(searchLuck / FOREST_SEARCH_LUCK_POINTS_PER_BONUS_ITEM));
  let bag = runtime.bag;
  let message = `I searched the ${location.name}.`;
  if (eventRoll < 85 && location.copper) {
    const amount = (location.copper[0] + Math.floor(Math.random() * (location.copper[1] - location.copper[0] + 1))) * findQuantity;
    await saveCurrencyCopper((await loadCurrencyCopper()) + amount);
    message = `I found ${amount} Copper in the ${location.name}.`;
  } else if (eventRoll < 85 && location.itemId) {
    const catalog = ITEM_CATALOG[location.itemId];
    const item: BagItem = { id: location.itemId, itemType: location.itemId, name: catalog?.name ?? location.itemId, quantity: findQuantity, attributes: catalog?.attributes ? [...catalog.attributes] : undefined };
    const support = await addToSupporterFirst(item);
    const plan = support.stored ? null : planAddToBag(item, bag);
    if (support.stored) {
      message = `I found ${findQuantity}× ${catalog?.name ?? location.itemId} in the ${location.name}. It went into the Supporter Bag.`;
    } else if (plan && plan.canTransfer && plan.remainderQty === 0) {
      bag = { ...bag, slots: plan.updatedSlots };
      message = `I found ${findQuantity}× ${catalog?.name ?? location.itemId} in the ${location.name}.`;
    } else message = "My bag is full. I have to leave the find behind.";
  } else if (eventRoll < 95) message = "I found unusual tracks, but nothing I can take with me yet.";
  else message = "The forest is quiet. For a moment, I only hear the leaves moving.";
  nextFloor.message = message;
  message += payment.message;
  nextFloor.message = message;
  await saveRuntime(nextState, paidLife, stamina, bag);
  return { ok: true, state: nextState, message, life: paidLife, stamina, bag };
}

function incomingDamage(monster: ForestMonsterDefinition, endurance: number, armor: BagItem | null, defending: boolean): number {
  const normal = calculateIncomingPhysicalDamage(monster.strength, endurance, armor);
  return defending ? Math.max(0, Math.ceil(normal / 2)) : normal;
}

async function monsterAttack(
  state: ForestDungeonState,
  runtime: Awaited<ReturnType<typeof loadRuntime>>,
  defending: boolean,
): Promise<DungeonActionResult> {
  const floor = currentFloorOf(state);
  const monsterState = floor.monster!;
  const monster = FOREST_MONSTERS[monsterState.id];
  const dodged = defending && Math.random() * 100 < clampPercent(30 + getEffectiveLuck(runtime.stats));
  let bag = runtime.bag;
  let life = runtime.life;
  let message: string;
  if (dodged) message = `I evade the ${monster.name}'s attack.`;
  else {
    const armor = getEquippedItem(bag, "armor");
    const blessing = await activeTempleBlessing();
    const rawDamage = incomingDamage(monster, runtime.stats.endurance, armor, defending);
    const damage = blessing === "protection" ? Math.ceil(rawDamage * 0.85) : rawDamage;
    life = Math.max(0, life - damage);
    if (damage > 0 && armor) bag = consumeArmorDurability(bag);
    message = damage > 0 ? `${monster.name} hits me for ${damage} damage.` : `${monster.name} cannot get through my defense.`;
  }
  await saveRuntime(state, life, runtime.stamina, bag);
  return { ok: true, state, message, life, stamina: runtime.stamina, bag };
}

async function clericSupportTurn(
  state: ForestDungeonState,
  runtime: Awaited<ReturnType<typeof loadRuntime>>,
): Promise<{ message: string; life: number; bag: PlayerBagData; defeated: boolean; lootFlights?: DungeonLootFlight[] }> {
  const hired = await activeSupporter();
  const floor = currentFloorOf(state);
  if (hired?.definition.id !== "cleric" || !floor.monster || floor.monster.phase !== "combat") return { message: "", life: runtime.life, bag: runtime.bag, defeated: false };
  const monster = FOREST_MONSTERS[floor.monster.id];
  const damage = Math.max(1, runtime.stats.strength + 5 - monster.physicalDefense);
  floor.monster.life = Math.max(0, floor.monster.life - damage);
  const roundKey = `@dungeon:cleric_round:${state.currentFloor}`;
  const round = Math.max(0, Number(await AsyncStorage.getItem(roundKey)) || 0) + 1;
  await AsyncStorage.setItem(roundKey, String(round));
  const life = round % 3 === 0 ? Math.min(runtime.stats.maximumLife, runtime.life + Math.ceil(runtime.stats.maximumLife * 0.1)) : runtime.life;
  let bag = runtime.bag;
  let message = ` ${hired.definition.name} strikes for ${damage} damage.`;
  if (life > runtime.life) message += ` They restore ${life - runtime.life} Life.`;
  if (floor.monster.life <= 0) {
    floor.monster.phase = "defeated";
    const loot = await grantMonsterDefeatRewards(floor, bag, monster); bag = loot.bag;
    message += loot.message;
    await recordMonsterDefeat(monster.id);
    await saveRuntime(state, life, runtime.stamina, bag);
    return { message, life, bag, defeated: true, lootFlights: loot.lootFlights };
  }
  return { message, life, bag, defeated: false };
}

export async function hideFromForestMonster(): Promise<DungeonActionResult> {
  const state = await loadForestDungeonState();
  const runtime = await loadRuntime();
  const floor = currentFloorOf(state);
  if (!floor.monster || floor.monster.phase !== "noticed") return { ok: false, state, message: "There is nothing to hide from.", ...runtime };
  const monster = FOREST_MONSTERS[floor.monster.id];
  const nextMonster: ForestMonsterState = { ...floor.monster, phase: "combat" };
  const nextFloor: ForestFloorState = { ...floor, monster: nextMonster };
  const nextState: ForestDungeonState = { ...state, floors: { ...state.floors, [String(state.currentFloor)]: nextFloor } };
  await saveFightSnapshot(nextState, runtime.life, runtime.stamina, runtime.bag);
  if (Math.random() * 100 < clampPercent(50 + getEffectiveLuck(runtime.stats))) {
    nextMonster.phase = "hidden";
    const message = `I remain unseen. I can ambush the ${monster.name} or stay hidden and let it pass.`;
    await saveRuntime(nextState, runtime.life, runtime.stamina, runtime.bag);
    return {
      ok: true,
      state: nextState,
      message,
      life: runtime.life,
      stamina: runtime.stamina,
      bag: runtime.bag,
    };
  }
  await saveForestDungeonState(nextState);
  const result = await monsterAttack(nextState, runtime, false);
  return { ...result, message: `The ${monster.name} discovers me. ${result.message}` };
}

export async function ambushHiddenForestMonster(): Promise<DungeonActionResult> {
  const state = await loadForestDungeonState();
  const runtime = await loadRuntime();
  const floor = currentFloorOf(state);
  if (!floor.monster || floor.monster.phase !== "hidden") return { ok: false, state, message: "There is no hidden ambush to make.", ...runtime };
  const monster = FOREST_MONSTERS[floor.monster.id];
  const weapon = getEquippedItem(runtime.bag, "weapon");
  const damage = rollPlayerPhysicalDamage(runtime.stats.strength, monster.physicalDefense, weapon) * 2;
  floor.monster.life = Math.max(0, floor.monster.life - damage);
  floor.monster.phase = floor.monster.life <= 0 ? "defeated" : "combat";
  let bag = weapon ? consumeWeaponDurability(runtime.bag) : runtime.bag;
  let message = `I ambush the ${monster.name} and strike critically for ${damage} damage. I retain the initiative.`;
  let lootFlights: DungeonLootFlight[] | undefined;
  if (floor.monster.phase === "defeated") {
    const loot = await grantMonsterDefeatRewards(floor, bag, monster);
    bag = loot.bag;
    message += loot.message;
    lootFlights = loot.lootFlights;
    await recordMonsterDefeat(monster.id);
  }
  await saveRuntime(state, runtime.life, runtime.stamina, bag);
  return {
    ok: true,
    state,
    message,
    life: runtime.life,
    stamina: runtime.stamina,
    bag,
    playerAttack: { kind: weapon ? "critical" : "punch", damage, defeated: floor.monster.phase === "defeated" },
    lootFlights,
  };
}

export async function letHiddenForestMonsterPass(): Promise<DungeonActionResult> {
  const state = await loadForestDungeonState();
  const runtime = await loadRuntime();
  const floor = currentFloorOf(state);
  if (!floor.monster || floor.monster.phase !== "hidden") return { ok: false, state, message: "There is no monster passing by.", ...runtime };
  const monster = FOREST_MONSTERS[floor.monster.id];
  floor.monster.phase = "avoided";
  floor.message = `I stay hidden until the ${monster.name} passes. The area is safe to search.`;
  await saveRuntime(state, runtime.life, runtime.stamina, runtime.bag);
  return { ok: true, state, message: floor.message, life: runtime.life, stamina: runtime.stamina, bag: runtime.bag };
}

export async function attackForestMonster(target: "head" | "body"): Promise<DungeonActionResult> {
  const state = await loadForestDungeonState();
  const runtime = await loadRuntime();
  const floor = currentFloorOf(state);
  if (!floor.monster || floor.monster.phase !== "combat") return { ok: false, state, message: "There is no monster to attack.", ...runtime };
  const monster = FOREST_MONSTERS[floor.monster.id];
  const weapon = getEquippedItem(runtime.bag, "weapon");
  const baseAccuracy = weapon ? ITEM_CATALOG[weapon.id]?.basicAccuracyPercent ?? 100 : 100;
  const hitChance = clampPercent(baseAccuracy + runtime.stats.accuracy - (target === "head" ? 30 : 0));
  let bag = runtime.bag;
  let message: string;
  let playerAttack: DungeonActionResult["playerAttack"];
  if (Math.random() * 100 < hitChance) {
    const baseDamage = rollPlayerPhysicalDamage(runtime.stats.strength, monster.physicalDefense, weapon);
    const damage = target === "head" ? Math.ceil(baseDamage * 1.5) : baseDamage;
    floor.monster.life = Math.max(0, floor.monster.life - damage);
    if (weapon) bag = consumeWeaponDurability(bag);
    message = `I hit the ${monster.name}'s ${target} for ${damage} damage.`;
    playerAttack = { kind: normalAttackKind(weapon), damage, defeated: floor.monster.life <= 0 };
    if (floor.monster.life <= 0) {
      floor.monster.phase = "defeated";
      const loot = await grantMonsterDefeatRewards(floor, bag, monster);
      bag = loot.bag;
      message += loot.message;
      await recordMonsterDefeat(monster.id);
      await saveRuntime(state, runtime.life, runtime.stamina, bag);
      return {
        ok: true,
        state,
        message,
        life: runtime.life,
        stamina: runtime.stamina,
        bag,
        playerAttack,
        lootFlights: loot.lootFlights,
      };
    }
  } else message = `My attack against the ${monster.name}'s ${target} misses.`;
  const cleric = await clericSupportTurn(state, { ...runtime, bag });
  if (cleric.defeated) return { ok: true, state, message: message + cleric.message, life: cleric.life, stamina: runtime.stamina, bag: cleric.bag, playerAttack, lootFlights: cleric.lootFlights };
  const counter = await monsterAttack(state, { ...runtime, life: cleric.life, bag: cleric.bag }, false);
  return { ...counter, message: `${message}${cleric.message} ${counter.message}`, playerAttack };
}

export async function defendAgainstForestMonster(): Promise<DungeonActionResult> {
  const state = await loadForestDungeonState();
  const runtime = await loadRuntime();
  const floor = currentFloorOf(state);
  if (!floor.monster || floor.monster.phase !== "combat") return { ok: false, state, message: "There is no attack to defend against.", ...runtime };
  const cleric = await clericSupportTurn(state, runtime);
  if (cleric.defeated) return {
    ok: true,
    state,
    message: cleric.message.trim(),
    life: cleric.life,
    stamina: runtime.stamina,
    bag: cleric.bag,
    lootFlights: cleric.lootFlights,
  };
  const result = await monsterAttack(state, { ...runtime, life: cleric.life, bag: cleric.bag }, true);
  return { ...result, message: cleric.message + " " + result.message };
}

export async function escapeForestCombat(): Promise<DungeonActionResult> {
  const state = await loadForestDungeonState();
  const runtime = await loadRuntime();
  const floor = currentFloorOf(state);
  if (!floor.monster || floor.monster.phase !== "combat") return { ok: false, state, message: "There is nothing to escape from.", ...runtime };
  if (Math.random() * 100 < clampPercent(50 + getEffectiveLuck(runtime.stats))) {
    const previousFloor = Math.max(1, state.currentFloor - 1);
    state.currentFloor = previousFloor;
    if (!state.floors[String(previousFloor)]) state.floors[String(previousFloor)] = createFloorState(previousFloor);
    await saveRuntime(state, runtime.life, runtime.stamina, runtime.bag);
    return { ok: true, state, message: `I escape to floor ${previousFloor}.`, ...runtime };
  }
  const counter = await monsterAttack(state, runtime, false);
  return { ...counter, message: `I fail to escape. ${counter.message}` };
}

export async function goForwardInForest(): Promise<DungeonActionResult> {
  const state = await loadForestDungeonState();
  const runtime = await loadRuntime();
  const floor = currentFloorOf(state);
  if (floor.monster && floor.monster.phase !== "defeated" && floor.monster.phase !== "avoided") return { ok: false, state, message: "The monster blocks the way forward.", ...runtime };
  if (floor.carcassPending) return { ok: false, state, message: "I need room in my bags for the remaining battle loot first.", ...runtime };
  const activityCost = dungeonActivityCost(runtime.bag, FOREST_FORWARD_STAMINA_COST);
  const payment = payDungeonActivityCost(runtime.stamina, runtime.life, activityCost);
  if (state.currentFloor >= FOREST_FLOOR_COUNT) return { ok: false, state, message: "The Forest Entrance has been cleared.", ...runtime };
  state.currentFloor += 1;
  if (!state.floors[String(state.currentFloor)]) state.floors[String(state.currentFloor)] = createFloorState(state.currentFloor);
  const entered = currentFloorOf(state);
  runtime.bag = consumeTorchDurability(runtime.bag);
  const supporter = await activeSupporter();
  const life = supporter?.definition.id === "healer" ? Math.min(runtime.stats.maximumLife, payment.life + Math.ceil(runtime.stats.maximumLife * 0.1)) : payment.life;
  if (entered.monster?.phase === "combat") await saveFightSnapshot(state, life, payment.stamina, runtime.bag);
  await saveRuntime(state, life, payment.stamina, runtime.bag);
  const healerMessage = life > payment.life ? ` ${supporter!.definition.name} restores ${life - payment.life} Life.` : "";
  return { ok: true, state, message: (entered.message ?? `I advance to floor ${state.currentFloor}.`) + payment.message + healerMessage, life, stamina: payment.stamina, bag: runtime.bag };
}

export async function collectPendingForestCarcass(): Promise<DungeonActionResult> {
  const state = await loadForestDungeonState();
  const runtime = await loadRuntime();
  const floor = currentFloorOf(state);
  if (!floor.carcassPending || !floor.monster) return { ok: false, state, message: "There is no battle loot to collect.", ...runtime };
  const monster = FOREST_MONSTERS[floor.monster.id];
  const legacyPending = floor.pendingLoot.length === 0 && getButcheringDefinition(monster.id)
    ? [createCarcass(monster)]
    : floor.pendingLoot;
  if (legacyPending.length === 0) {
    floor.carcassPending = false;
    await saveRuntime(state, runtime.life, runtime.stamina, runtime.bag);
    return { ok: true, state, message: "There is no butcherable carcass here.", ...runtime };
  }
  let bag = runtime.bag;
  const remaining: BagItem[] = [];
  const collected: string[] = [];
  for (const item of legacyPending) {
    const result = await addRewardItem(bag, item);
    bag = result.bag;
    if (result.added) collected.push(item.name);
    else remaining.push(item);
  }
  floor.pendingLoot = remaining;
  floor.carcassPending = remaining.length > 0;
  const message = remaining.length
    ? `Collected ${collected.join(", ") || "nothing"}. My bags are still too full for the remaining loot.`
    : `${collected.join(", ")} ${collected.length === 1 ? "was" : "were"} collected.`;
  await saveRuntime(state, runtime.life, runtime.stamina, bag);
  return { ok: remaining.length === 0, state, message, life: runtime.life, stamina: runtime.stamina, bag };
}

/** Leave uncollected battle loot behind so a full inventory cannot block progress. */
export async function dismissPendingForestLoot(): Promise<DungeonActionResult> {
  const state = await loadForestDungeonState();
  const runtime = await loadRuntime();
  const floor = currentFloorOf(state);
  if (!floor.carcassPending) return { ok: false, state, message: "There is no battle loot to dismiss.", ...runtime };
  floor.pendingLoot = [];
  floor.carcassPending = false;
  floor.message = "I leave the remaining battle loot behind.";
  await saveRuntime(state, runtime.life, runtime.stamina, runtime.bag);
  return { ok: true, state, message: floor.message, life: runtime.life, stamina: runtime.stamina, bag: runtime.bag };
}

export async function bandageAtForestRestArea(useHerb: boolean): Promise<DungeonActionResult> {
  const state = await loadForestDungeonState();
  const runtime = await loadRuntime();
  if (!FOREST_REST_FLOORS.has(state.currentFloor)) return { ok: false, state, message: "I can only bandage wounds at a Rest Area.", ...runtime };
  const activityCost = dungeonActivityCost(runtime.bag, 10);
  const payment = payDungeonActivityCost(runtime.stamina, runtime.life, activityCost);
  let bag = runtime.bag;
  if (useHerb) {
    const index = bag.slots.findIndex((item) => item?.id === "herbs");
    if (index < 0) return { ok: false, state, message: "I do not have an herb.", ...runtime };
    const slots = [...bag.slots];
    const herb = slots[index]!;
    slots[index] = herb.quantity > 1 ? { ...herb, quantity: herb.quantity - 1 } : null;
    bag = { ...bag, slots };
  }
  const percent = useHerb ? 0.30 : 0.20;
  const life = Math.min(runtime.stats.maximumLife, payment.life + Math.ceil(runtime.stats.maximumLife * percent));
  bag = consumeTorchDurability(bag);
  await saveRuntime(state, life, payment.stamina, bag);
  return { ok: true, state, message: `I restore ${life - payment.life} Life.${payment.message}`, life, stamina: payment.stamina, bag };
}

export async function leaveForestDungeon(options: { useReturnBell?: boolean } = {}): Promise<{ message: string; bag: PlayerBagData }> {
  const state = await loadForestDungeonState();
  const floor = currentFloorOf(state);
  const bossDefeated = state.currentFloor === FOREST_FLOOR_COUNT
    && floor.monster?.id === "elder_ember_rooster"
    && floor.monster.phase === "defeated"
    && !floor.carcassPending;
  const runtime = await loadRuntime();
  const safeExit = FOREST_REST_FLOORS.has(state.currentFloor) || bossDefeated;
  if (!safeExit && !options.useReturnBell) throw new Error("not_safe_exit");
  let returnBag = runtime.bag;
  if (options.useReturnBell) {
    const bellSlot = returnBag.slots.findIndex((item) => item?.id === "return_bell" && item.quantity > 0);
    if (bellSlot < 0) throw new Error("return_bell_missing");
    returnBag = removeBagItem(returnBag, bellSlot, 1);
  }
  const stored = await AsyncStorage.multiGet([GARDEN_INVENTORY_KEY, SHARED_RESOURCES_KEY]);
  const storagePlan = planTavernReturnStorage(
    returnBag,
    normalizeSharedResources(stored[1][1]),
    normalizeGardenInventory(stored[0][1]),
  );
  const bag = storagePlan.bag;
  const ended: ForestDungeonState = { ...state, active: false };
  await deliverSupporterBagAfterDungeonRun();
  await AsyncStorage.multiSet([
    [FOREST_DUNGEON_KEY, JSON.stringify(ended)],
    [PLAYER_BAG_KEY, JSON.stringify(bag)],
    [GARDEN_INVENTORY_KEY, JSON.stringify(storagePlan.gardenInventory)],
    [SHARED_RESOURCES_KEY, JSON.stringify(storagePlan.sharedResources)],
  ]);
  await completeTempleBlessingExpedition();
  return {
    message: options.useReturnBell
      ? "The Return Bell rings and carries me safely back to the tavern."
      : bossDefeated
        ? "The Forest Entrance is cleared. You return to the tavern."
        : "You store the materials in the garden storage.",
    bag,
  };
}

export async function restoreForestFightSnapshot(): Promise<DungeonActionResult | null> {
  const raw = await AsyncStorage.getItem(FOREST_FIGHT_SNAPSHOT_KEY);
  if (!raw) return null;
  const snapshot = JSON.parse(raw) as { state: ForestDungeonState; life: number; stamina: number; bag: PlayerBagData };
  const state = normalizeForestDungeonState(snapshot.state);
  const bag = normalizePlayerBagData(snapshot.bag);
  const life = Math.max(1, Math.floor(snapshot.life));
  const stamina = Math.max(0, Math.floor(snapshot.stamina));
  await saveRuntime(state, life, stamina, bag);
  return { ok: true, state, message: "The fight begins again.", life, stamina, bag };
}
