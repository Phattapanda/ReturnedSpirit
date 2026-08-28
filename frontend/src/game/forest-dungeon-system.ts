import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  ITEM_CATALOG,
  ITEM_ATTRIBUTE,
  PLAYER_BAG_KEY,
  normalizePlayerBagData,
  planAddToBag,
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
import { DEFAULT_PLAYER_STATS, PLAYER_STATS_KEY, normalizePlayerStats } from "@/src/game/player-stats";

export const FOREST_DUNGEON_KEY = "@dungeon:forest_entrance";
export const FOREST_FIGHT_SNAPSHOT_KEY = "@dungeon:forest_fight_snapshot";
export const FOREST_FLOOR_COUNT = 30;
export const FOREST_FORWARD_STAMINA_COST = 3;
export const FOREST_SEARCH_BASE_SUCCESS = 60;
export const FOREST_SEARCH_PERCEPTION_BONUS = 2;
export const FOREST_SEARCH_LUCK_POINTS_PER_BONUS_ITEM = 10;
export const FOREST_REST_FLOORS = new Set([5, 10, 15, 20, 25]);

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
  phase: "noticed" | "combat" | "defeated";
};

export type ForestFloorState = {
  searched: boolean;
  searchAvailable: boolean;
  searchCost: number;
  searchLocation: string;
  monster: ForestMonsterState | null;
  message: string | null;
  carcassPending: boolean;
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
  };
}

function normalizeFloor(raw: Partial<ForestFloorState> | undefined, floor: number): ForestFloorState {
  const fallback = createFloorState(floor);
  const monster = raw?.monster && FOREST_MONSTERS[raw.monster.id]
    ? {
        id: raw.monster.id,
        life: Math.max(0, Math.floor(Number(raw.monster.life) || 0)),
        maximumLife: FOREST_MONSTERS[raw.monster.id].maximumLife,
        phase: raw.monster.phase === "noticed" || raw.monster.phase === "defeated" ? raw.monster.phase : "combat" as const,
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
  return state;
}

export async function enterForestDungeon(): Promise<ForestDungeonState> {
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
  return {
    stats: normalizePlayerStats(rawStats[1] ? JSON.parse(rawStats[1]) : DEFAULT_PLAYER_STATS),
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

export type DungeonActionResult = { ok: boolean; state: ForestDungeonState; message: string; life: number; stamina: number; bag: PlayerBagData };

function currentFloorOf(state: ForestDungeonState): ForestFloorState {
  return state.floors[String(state.currentFloor)] ?? createFloorState(state.currentFloor);
}

function spawnMonster(floor: number): ForestMonsterState {
  const pool = monsterPoolForFloor(floor);
  const id = pool[randomIndex(pool.length)];
  return { id, life: FOREST_MONSTERS[id].maximumLife, maximumLife: FOREST_MONSTERS[id].maximumLife, phase: "noticed" };
}

function createCarcass(monster: ForestMonsterDefinition): BagItem {
  return { id: "monster_carcass", itemType: "monster_carcass", name: `${monster.name} Carcass`, quantity: 1, monsterId: monster.id, attributes: ["material"] };
}

function addCarcass(bag: PlayerBagData, monster: ForestMonsterDefinition): { bag: PlayerBagData; added: boolean } {
  const plan = planAddToBag(createCarcass(monster), bag);
  return plan.canTransfer && plan.remainderQty === 0
    ? { bag: { ...bag, slots: plan.updatedSlots }, added: true }
    : { bag, added: false };
}

async function saveFightSnapshot(state: ForestDungeonState, life: number, stamina: number, bag: PlayerBagData) {
  await AsyncStorage.setItem(FOREST_FIGHT_SNAPSHOT_KEY, JSON.stringify({ state, life, stamina, bag }));
}

export async function searchForestArea(): Promise<DungeonActionResult> {
  const state = await loadForestDungeonState();
  const runtime = await loadRuntime();
  const floor = currentFloorOf(state);
  if (!floor.searchAvailable || floor.searched || floor.monster?.phase === "combat") return { ok: false, state, message: "There is nothing more to search here.", ...runtime };
  if (runtime.stamina < floor.searchCost) return { ok: false, state, message: "I do not have enough Stamina.", ...runtime };
  const stamina = runtime.stamina - floor.searchCost;
  const nextFloor = { ...floor, searched: true, searchAvailable: false };
  const nextState = { ...state, floors: { ...state.floors, [String(state.currentFloor)]: nextFloor } };
  const successChance = clampPercent(FOREST_SEARCH_BASE_SUCCESS + runtime.stats.perception * FOREST_SEARCH_PERCEPTION_BONUS);
  if (Math.random() * 100 >= successChance) {
    nextFloor.message = "I could not find anything useful.";
    await saveRuntime(nextState, runtime.life, stamina, runtime.bag);
    return { ok: true, state: nextState, message: nextFloor.message, life: runtime.life, stamina, bag: runtime.bag };
  }

  const eventRoll = Math.random() * 100;
  if (eventRoll < 50) {
    nextFloor.monster = spawnMonster(state.currentFloor);
    const monster = FOREST_MONSTERS[nextFloor.monster.id];
    nextFloor.message = `I noticed a ${monster.name} before it noticed me.`;
    await saveRuntime(nextState, runtime.life, stamina, runtime.bag);
    return { ok: true, state: nextState, message: nextFloor.message, life: runtime.life, stamina, bag: runtime.bag };
  }

  const location = SEARCH_LOCATIONS.find((entry) => entry.name === floor.searchLocation) ?? SEARCH_LOCATIONS[0];
  const findQuantity = 1 + Math.min(2, Math.floor(runtime.stats.luck / FOREST_SEARCH_LUCK_POINTS_PER_BONUS_ITEM));
  let bag = runtime.bag;
  let message = `I searched the ${location.name}.`;
  if (eventRoll < 85 && location.copper) {
    const amount = (location.copper[0] + Math.floor(Math.random() * (location.copper[1] - location.copper[0] + 1))) * findQuantity;
    await saveCurrencyCopper((await loadCurrencyCopper()) + amount);
    message = `I found ${amount} Copper in the ${location.name}.`;
  } else if (eventRoll < 85 && location.itemId) {
    const catalog = ITEM_CATALOG[location.itemId];
    const item: BagItem = { id: location.itemId, itemType: location.itemId, name: catalog?.name ?? location.itemId, quantity: findQuantity, attributes: catalog?.attributes ? [...catalog.attributes] : undefined };
    const plan = planAddToBag(item, bag);
    if (plan.canTransfer && plan.remainderQty === 0) {
      bag = { ...bag, slots: plan.updatedSlots };
      message = `I found ${findQuantity}× ${catalog?.name ?? location.itemId} in the ${location.name}.`;
    } else message = "My bag is full. I have to leave the find behind.";
  } else if (eventRoll < 95) message = "I found unusual tracks, but nothing I can take with me yet.";
  else message = "The forest is quiet. For a moment, I only hear the leaves moving.";
  nextFloor.message = message;
  await saveRuntime(nextState, runtime.life, stamina, bag);
  return { ok: true, state: nextState, message, life: runtime.life, stamina, bag };
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
  const dodged = defending && Math.random() * 100 < clampPercent(30 + runtime.stats.luck);
  let bag = runtime.bag;
  let life = runtime.life;
  let message: string;
  if (dodged) message = `I evade the ${monster.name}'s attack.`;
  else {
    const armor = getEquippedItem(bag, "armor");
    const damage = incomingDamage(monster, runtime.stats.endurance, armor, defending);
    life = Math.max(0, life - damage);
    if (damage > 0 && armor) bag = consumeArmorDurability(bag);
    message = damage > 0 ? `${monster.name} hits me for ${damage} damage.` : `${monster.name} cannot get through my defense.`;
  }
  await saveRuntime(state, life, runtime.stamina, bag);
  return { ok: true, state, message, life, stamina: runtime.stamina, bag };
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
  if (Math.random() * 100 < clampPercent(50 + runtime.stats.luck)) {
    const weapon = getEquippedItem(runtime.bag, "weapon");
    const damage = rollPlayerPhysicalDamage(runtime.stats.strength, monster.physicalDefense, weapon) * 2;
    nextMonster.life = Math.max(0, nextMonster.life - damage);
    let bag = weapon ? consumeWeaponDurability(runtime.bag) : runtime.bag;
    let message = `I remain unseen and strike critically for ${damage} damage.`;
    if (nextMonster.life <= 0) {
      nextMonster.phase = "defeated";
      const carcass = addCarcass(bag, monster);
      bag = carcass.bag;
      nextFloor.carcassPending = !carcass.added;
      message += carcass.added ? ` ${monster.name} Carcass was added to my bag.` : " My bag is full; the carcass remains here.";
    }
    await saveRuntime(nextState, runtime.life, runtime.stamina, bag);
    return { ok: true, state: nextState, message, life: runtime.life, stamina: runtime.stamina, bag };
  }
  await saveForestDungeonState(nextState);
  const result = await monsterAttack(nextState, runtime, false);
  return { ...result, message: `The ${monster.name} discovers me. ${result.message}` };
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
  if (Math.random() * 100 < hitChance) {
    const baseDamage = rollPlayerPhysicalDamage(runtime.stats.strength, monster.physicalDefense, weapon);
    const damage = target === "head" ? Math.ceil(baseDamage * 1.5) : baseDamage;
    floor.monster.life = Math.max(0, floor.monster.life - damage);
    if (weapon) bag = consumeWeaponDurability(bag);
    message = `I hit the ${monster.name}'s ${target} for ${damage} damage.`;
    if (floor.monster.life <= 0) {
      floor.monster.phase = "defeated";
      const carcass = addCarcass(bag, monster);
      bag = carcass.bag;
      floor.carcassPending = !carcass.added;
      message += carcass.added ? ` ${monster.name} Carcass was added to my bag.` : " My bag is full; the carcass remains here.";
      await saveRuntime(state, runtime.life, runtime.stamina, bag);
      return { ok: true, state, message, life: runtime.life, stamina: runtime.stamina, bag };
    }
  } else message = `My attack against the ${monster.name}'s ${target} misses.`;
  const counter = await monsterAttack(state, { ...runtime, bag }, false);
  return { ...counter, message: `${message} ${counter.message}` };
}

export async function defendAgainstForestMonster(): Promise<DungeonActionResult> {
  const state = await loadForestDungeonState();
  const runtime = await loadRuntime();
  const floor = currentFloorOf(state);
  if (!floor.monster || floor.monster.phase !== "combat") return { ok: false, state, message: "There is no attack to defend against.", ...runtime };
  return monsterAttack(state, runtime, true);
}

export async function escapeForestCombat(): Promise<DungeonActionResult> {
  const state = await loadForestDungeonState();
  const runtime = await loadRuntime();
  const floor = currentFloorOf(state);
  if (!floor.monster || floor.monster.phase !== "combat") return { ok: false, state, message: "There is nothing to escape from.", ...runtime };
  if (Math.random() * 100 < clampPercent(50 + runtime.stats.luck)) {
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
  if (floor.monster && floor.monster.phase !== "defeated") return { ok: false, state, message: "The monster blocks the way forward.", ...runtime };
  if (floor.carcassPending) return { ok: false, state, message: "I need room in my bag for the carcass first.", ...runtime };
  if (runtime.stamina < FOREST_FORWARD_STAMINA_COST) return { ok: false, state, message: "I do not have enough Stamina.", ...runtime };
  if (state.currentFloor >= FOREST_FLOOR_COUNT) return { ok: false, state, message: "The Forest Entrance has been cleared.", ...runtime };
  state.currentFloor += 1;
  if (!state.floors[String(state.currentFloor)]) state.floors[String(state.currentFloor)] = createFloorState(state.currentFloor);
  const entered = currentFloorOf(state);
  if (entered.monster?.phase === "combat") await saveFightSnapshot(state, runtime.life, runtime.stamina - FOREST_FORWARD_STAMINA_COST, runtime.bag);
  await saveRuntime(state, runtime.life, runtime.stamina - FOREST_FORWARD_STAMINA_COST, runtime.bag);
  return { ok: true, state, message: entered.message ?? `I advance to floor ${state.currentFloor}.`, life: runtime.life, stamina: runtime.stamina - FOREST_FORWARD_STAMINA_COST, bag: runtime.bag };
}

export async function collectPendingForestCarcass(): Promise<DungeonActionResult> {
  const state = await loadForestDungeonState();
  const runtime = await loadRuntime();
  const floor = currentFloorOf(state);
  if (!floor.carcassPending || !floor.monster) return { ok: false, state, message: "There is no carcass to collect.", ...runtime };
  const monster = FOREST_MONSTERS[floor.monster.id];
  const result = addCarcass(runtime.bag, monster);
  if (!result.added) return { ok: false, state, message: "My bag is still full.", ...runtime };
  floor.carcassPending = false;
  const message = `${monster.name} Carcass was added to my bag.`;
  await saveRuntime(state, runtime.life, runtime.stamina, result.bag);
  return { ok: true, state, message, life: runtime.life, stamina: runtime.stamina, bag: result.bag };
}

export async function bandageAtForestRestArea(useHerb: boolean): Promise<DungeonActionResult> {
  const state = await loadForestDungeonState();
  const runtime = await loadRuntime();
  if (!FOREST_REST_FLOORS.has(state.currentFloor)) return { ok: false, state, message: "I can only bandage wounds at a Rest Area.", ...runtime };
  if (runtime.stamina < 10) return { ok: false, state, message: "I do not have enough Stamina.", ...runtime };
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
  const life = Math.min(runtime.stats.maximumLife, runtime.life + Math.ceil(runtime.stats.maximumLife * percent));
  await saveRuntime(state, life, runtime.stamina - 10, bag);
  return { ok: true, state, message: `I restore ${life - runtime.life} Life.`, life, stamina: runtime.stamina - 10, bag };
}

export async function leaveForestDungeon(): Promise<{ message: string; bag: PlayerBagData }> {
  const state = await loadForestDungeonState();
  const floor = currentFloorOf(state);
  const bossDefeated = state.currentFloor === FOREST_FLOOR_COUNT
    && floor.monster?.id === "elder_ember_rooster"
    && floor.monster.phase === "defeated"
    && !floor.carcassPending;
  if (!FOREST_REST_FLOORS.has(state.currentFloor) && !bossDefeated) throw new Error("not_safe_exit");
  const runtime = await loadRuntime();
  const rawGarden = await AsyncStorage.getItem("@garden:inventory");
  const garden: { id: string; itemType: string; name: string; quantity: number }[] = rawGarden ? JSON.parse(rawGarden) : [];
  const nextSlots = runtime.bag.slots.map((item) => {
    if (!item || item.id === "monster_carcass") return item;
    const attributes = ITEM_CATALOG[item.id]?.attributes ?? item.attributes ?? [];
    if (!attributes.includes(ITEM_ATTRIBUTE.MATERIAL)) return item;
    const existing = garden.find((entry) => entry.id === item.id);
    if (existing) existing.quantity += item.quantity;
    else garden.push({ id: item.id, itemType: item.itemType, name: ITEM_CATALOG[item.id]?.name ?? item.name, quantity: item.quantity });
    return null;
  });
  const bag = { ...runtime.bag, slots: nextSlots };
  const ended: ForestDungeonState = { ...state, active: false };
  await AsyncStorage.multiSet([
    [FOREST_DUNGEON_KEY, JSON.stringify(ended)], [PLAYER_BAG_KEY, JSON.stringify(bag)], ["@garden:inventory", JSON.stringify(garden)],
  ]);
  return { message: bossDefeated ? "The Forest Entrance is cleared. You return to the tavern." : "You store the materials in the garden storage.", bag };
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
