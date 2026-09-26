import AsyncStorage from "@react-native-async-storage/async-storage";
import { PLAYER_BAG_KEY, normalizePlayerBagData, removeBagItem } from "@/src/game/item-system";

export const WATER_STORAGE_KEY = "@garden:water_storage";
export const DEFAULT_WATER_STORAGE = { amount: 0, capacity: 5 };
export type WaterStorage = typeof DEFAULT_WATER_STORAGE;
const listeners = new Set<(state: WaterStorage) => void>();
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(action: () => Promise<T>): Promise<T> {
  const result = queue.then(action);
  queue = result.catch(() => {});
  return result;
}
export async function loadWaterStorage(): Promise<WaterStorage> {
  const raw = await AsyncStorage.getItem(WATER_STORAGE_KEY);
  const parsed = raw ? JSON.parse(raw) : DEFAULT_WATER_STORAGE;
  const capacity = Math.max(5, Math.floor(Number(parsed.capacity) || 5));
  return { capacity, amount: Math.min(capacity, Math.max(0, Math.floor(Number(parsed.amount) || 0))) };
}
export function subscribeWaterStorage(listener: (state: WaterStorage) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function notify(state: WaterStorage) { listeners.forEach((listener) => listener(state)); }
export function refillWaterStorage() {
  return serialized(async () => {
    const state = await loadWaterStorage();
    if (state.amount >= state.capacity) return { ok: false, state };
    const next = { ...state, amount: Math.min(state.capacity, state.amount + 5) };
    await AsyncStorage.setItem(WATER_STORAGE_KEY, JSON.stringify(next));
    notify(next);
    return { ok: true, state: next };
  });
}
export function consumeStoredWater(quantity: number) {
  return serialized(async () => {
    const state = await loadWaterStorage();
    if (!Number.isInteger(quantity) || quantity < 0 || state.amount < quantity) return false;
    const next = { ...state, amount: state.amount - quantity };
    await AsyncStorage.setItem(WATER_STORAGE_KEY, JSON.stringify(next));
    notify(next);
    return true;
  });
}
export function expandWaterStorageFromBag(slotIndex: number) {
  return serialized(async () => {
    const raw = await AsyncStorage.getItem(PLAYER_BAG_KEY);
    const bag = normalizePlayerBagData(raw ? JSON.parse(raw) : null);
    if (bag.slots[slotIndex]?.id !== "water_jar") return null;
    const state = await loadWaterStorage();
    const next = { ...state, capacity: state.capacity + 5 };
    const nextBag = removeBagItem(bag, slotIndex, 1);
    await AsyncStorage.multiSet([[PLAYER_BAG_KEY, JSON.stringify(nextBag)], [WATER_STORAGE_KEY, JSON.stringify(next)]]);
    notify(next);
    return nextBag;
  });
}

/** Run after restoring a save and before screens read inventories. Idempotent. */
export function migrateLegacyWaterBuckets() {
  return serialized(async () => {
    const state = await loadWaterStorage();
    let water = 0;
    const writes: [string, string][] = [];
    const keys = [PLAYER_BAG_KEY, "@kitchen:table_items", "@kitchen:craft_ingredients", "@kitchen:craft_tool_slot", "@kitchen:small_crate", "@room:storage", "@workshop:storage", "@game:supporter_bag"];
    const convert = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(convert);
      if (!value || typeof value !== "object") return value;
      const item = value as Record<string, unknown>;
      if (item.id === "bucket" || item.id === "bucketwater") {
        if (item.id === "bucketwater") water += Math.max(0, Number(item.quantity) || 0);
        return { ...item, id: "water_jar", itemType: "water_jar", name: "Water Jar", attributes: ["consumable"] };
      }
      return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, convert(child)]));
    };
    for (const key of keys) {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) continue;
      const next = JSON.stringify(convert(JSON.parse(raw)));
      if (next !== raw) writes.push([key, next]);
    }
    // Preserve existing water even when an old save carried more than five buckets.
    const next = { amount: state.amount + water, capacity: Math.max(state.capacity, state.amount + water) };
    writes.push([WATER_STORAGE_KEY, JSON.stringify(next)]);
    await AsyncStorage.multiSet(writes);
    notify(next);
  });
}
