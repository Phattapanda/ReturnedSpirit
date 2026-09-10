import AsyncStorage from "@react-native-async-storage/async-storage";

import { loadCurrencyCopper, saveCurrencyCopper, spendCurrencyCopper } from "@/src/game/currency-system";
import { loadGuestState } from "@/src/game/guest-system";
import {
  DEFAULT_BAG,
  ITEM_CATALOG,
  KITCHEN_TABLE_KEY,
  PLAYER_BAG_KEY,
  normalizePlayerBagData,
  planAddToBag,
  planAddToNextFreeBagSlot,
  upgradeToBackpack,
  type BagItem,
  type PlayerBagData,
} from "@/src/game/item-system";
import {
  KITCHEN_SMALL_CRATE_KEY,
  createSmallCrateItem,
  loadSmallCrateState,
} from "@/src/game/kitchen-small-crate";
import { GARDEN_INVENTORY_KEY, normalizeGardenInventory } from "@/src/game/tavern-return-storage";
import { SHARED_RESOURCES_KEY } from "@/src/game/shared-resources";

export const MERCHANT_SHOP_KEY = "@game:merchant_shop";

export type MerchantStockId =
  | "bucket"
  | "egg"
  | "chicken"
  | "fish"
  | "beef"
  | "bag2"
  | "crate1"
  | "seed_herb"
  | "seed_carrot"
  | "seed_potato"
  | "seed_onion"
  | "standard_fertilizer"
  | "nails"
  | "cloth"
  | "paint"
  | "tool_rusty_butchering_knife"
  | "armor_leather_bracers"
  | "weapon_iron_dagger"
  | "weapon_iron_shortsword";

export type MerchantStockDefinition = {
  id: MerchantStockId;
  priceCopper: number;
  maxPurchases: number;
};

export const MERCHANT_STOCK: Record<MerchantStockId, MerchantStockDefinition> = {
  bucket: { id: "bucket", priceCopper: 25, maxPurchases: 2 },
  egg: { id: "egg", priceCopper: 14, maxPurchases: 2 },
  chicken: { id: "chicken", priceCopper: 23, maxPurchases: 2 },
  fish: { id: "fish", priceCopper: 44, maxPurchases: 2 },
  beef: { id: "beef", priceCopper: 29, maxPurchases: 2 },
  bag2: { id: "bag2", priceCopper: 100, maxPurchases: 1 },
  crate1: { id: "crate1", priceCopper: 40, maxPurchases: 3 },
  seed_herb: { id: "seed_herb", priceCopper: 8, maxPurchases: 3 },
  seed_carrot: { id: "seed_carrot", priceCopper: 12, maxPurchases: 3 },
  seed_potato: { id: "seed_potato", priceCopper: 16, maxPurchases: 3 },
  seed_onion: { id: "seed_onion", priceCopper: 20, maxPurchases: 3 },
  standard_fertilizer: { id: "standard_fertilizer", priceCopper: 5, maxPurchases: 5 },
  nails: { id: "nails", priceCopper: 15, maxPurchases: 2 },
  cloth: { id: "cloth", priceCopper: 25, maxPurchases: 2 },
  paint: { id: "paint", priceCopper: 40, maxPurchases: 2 },
  tool_rusty_butchering_knife: { id: "tool_rusty_butchering_knife", priceCopper: 50, maxPurchases: 1 },
  armor_leather_bracers: { id: "armor_leather_bracers", priceCopper: 50, maxPurchases: 1 },
  weapon_iron_dagger: { id: "weapon_iron_dagger", priceCopper: 45, maxPurchases: 1 },
  weapon_iron_shortsword: { id: "weapon_iron_shortsword", priceCopper: 60, maxPurchases: 1 },
};

export type MerchantShopState = {
  version: 1;
  daySerial: number;
  stockIds: MerchantStockId[];
  purchased: Partial<Record<MerchantStockId, number>>;
};

function rollStock(count: number, randomValue = Math.random, keep: readonly MerchantStockId[] = []): MerchantStockId[] {
  const kept = [...new Set(keep.filter((id) => id !== "bag2" && !!MERCHANT_STOCK[id]))];
  const ids = (Object.keys(MERCHANT_STOCK) as MerchantStockId[]).filter((id) => id !== "bag2" && !kept.includes(id));
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(randomValue() * (index + 1));
    [ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]];
  }
  return [...kept, ...ids].slice(0, count);
}

export async function prepareMerchantShop(): Promise<MerchantShopState> {
  const guestState = await loadGuestState();
  const rawBag = await AsyncStorage.getItem(PLAYER_BAG_KEY);
  const bag = rawBag ? normalizePlayerBagData(JSON.parse(rawBag)) : DEFAULT_BAG;
  const backpackOwned = bag.bagId === "bag2" || bag.bagId === "bag3";
  const raw = await AsyncStorage.getItem(MERCHANT_SHOP_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as MerchantShopState;
      if (parsed.daySerial === guestState.calendarDaySerial && Array.isArray(parsed.stockIds)) {
        const rotatingCount = backpackOwned ? 5 : 4;
        const previousRotating = parsed.stockIds.filter((id) => id !== "bag2" && !!MERCHANT_STOCK[id]);
        const stockIds = [
          ...(!backpackOwned ? ["bag2" as const] : []),
          ...rollStock(rotatingCount, Math.random, previousRotating.slice(0, rotatingCount)),
        ];
        const normalized = { ...parsed, stockIds };
        if (JSON.stringify(normalized.stockIds) !== JSON.stringify(parsed.stockIds)) await AsyncStorage.setItem(MERCHANT_SHOP_KEY, JSON.stringify(normalized));
        return normalized;
      }
    } catch { /* roll a clean shop */ }
  }
  const next: MerchantShopState = {
    version: 1,
    daySerial: guestState.calendarDaySerial,
    stockIds: [...(!backpackOwned ? ["bag2" as const] : []), ...rollStock(backpackOwned ? 5 : 4)],
    purchased: {},
  };
  await AsyncStorage.setItem(MERCHANT_SHOP_KEY, JSON.stringify(next));
  return next;
}

export type MerchantPurchaseResult =
  | { ok: true; shop: MerchantShopState; bag: PlayerBagData; delivery: "bag" | "backpack_upgrade" | "kitchen" | "garden" | "materials" }
  | { ok: false; reason: "sold_out" | "not_offered" | "already_owned" | "bag_locked" | "bag_full" | "kitchen_full" | "insufficient_copper" | "storage_error" };

let purchaseQueue: Promise<void> = Promise.resolve();

export function purchaseMerchantItem(stockId: MerchantStockId): Promise<MerchantPurchaseResult> {
  const operation = purchaseQueue.then(async (): Promise<MerchantPurchaseResult> => {
    try {
      const shop = await prepareMerchantShop();
      const definition = MERCHANT_STOCK[stockId];
      if (!shop.stockIds.includes(stockId)) return { ok: false, reason: "not_offered" };
      const bought = shop.purchased[stockId] ?? 0;
      if (bought >= definition.maxPurchases) return { ok: false, reason: "sold_out" };

      const [rawBag, rawTable, rawGardenInventory, rawSharedResources] = await Promise.all([
        AsyncStorage.getItem(PLAYER_BAG_KEY),
        AsyncStorage.getItem(KITCHEN_TABLE_KEY),
        AsyncStorage.getItem(GARDEN_INVENTORY_KEY),
        AsyncStorage.getItem(SHARED_RESOURCES_KEY),
      ]);
      const bag = rawBag ? normalizePlayerBagData(JSON.parse(rawBag)) : { ...DEFAULT_BAG, slots: [...DEFAULT_BAG.slots] };
      if (!bag.unlocked) return { ok: false, reason: "bag_locked" };
      let nextBag = bag;
      let delivery: "bag" | "backpack_upgrade" | "kitchen" | "garden" | "materials" = "bag";
      const extraPairs: [string, string][] = [];

      if (stockId === "bag2") {
        if (bag.bagId === "bag2" || bag.bagId === "bag3") return { ok: false, reason: "already_owned" };
        nextBag = upgradeToBackpack(bag);
        delivery = "backpack_upgrade";
      } else if (stockId === "crate1") {
        const crateState = await loadSmallCrateState();
        const parsedTable = rawTable ? JSON.parse(rawTable) as (BagItem | null)[] : [];
        const nextTable: (BagItem | null)[] = Array.from(
          { length: Math.max(12, parsedTable.length) },
          (_, index) => parsedTable[index] ?? null,
        );
        const freeSlot = nextTable.findIndex((item) => item === null);
        if (freeSlot < 0) return { ok: false, reason: "kitchen_full" };
        nextTable[freeSlot] = createSmallCrateItem();
        const nextCrateCount = crateState.count + 1;
        extraPairs.push(
          [KITCHEN_TABLE_KEY, JSON.stringify(nextTable)],
          [KITCHEN_SMALL_CRATE_KEY, JSON.stringify({
            ...crateState,
            owned: true,
            count: nextCrateCount,
            slots: [...crateState.slots.slice(0, crateState.count * 6), ...Array(6).fill(null)],
          })],
        );
        delivery = "kitchen";
      } else if (stockId.startsWith("seed_") || stockId === "standard_fertilizer") {
        const inventory = normalizeGardenInventory(rawGardenInventory);
        const itemType = stockId.startsWith("seed_") ? "seed" : "fertilizer";
        const existing = inventory.find((item) => item.id === stockId && item.itemType === itemType);
        if (existing) existing.quantity += 1;
        else inventory.push({ id: stockId, itemType, name: ITEM_CATALOG[stockId]?.name ?? stockId, quantity: 1 });
        extraPairs.push([GARDEN_INVENTORY_KEY, JSON.stringify(inventory)]);
        delivery = "garden";
      } else if (stockId === "nails" || stockId === "cloth" || stockId === "paint") {
        const resources = rawSharedResources ? JSON.parse(rawSharedResources) as Record<string, number> : {};
        resources[stockId] = Math.max(0, Number(resources[stockId]) || 0) + 1;
        extraPairs.push([SHARED_RESOURCES_KEY, JSON.stringify(resources)]);
        delivery = "materials";
      } else {
        const catalog = ITEM_CATALOG[stockId];
        const maximumDurability = catalog?.maxDurability;
        const item: BagItem = {
          id: stockId,
          itemType: stockId,
          name: catalog?.name ?? stockId,
          quantity: 1,
          attributes: catalog?.attributes ? [...catalog.attributes] : undefined,
          durability: maximumDurability,
          maxDurability: maximumDurability,
        };
        const isUnique = maximumDurability !== undefined;
        const addPlan = isUnique ? planAddToNextFreeBagSlot(item, bag) : planAddToBag(item, bag);
        const canAdd = "ok" in addPlan ? addPlan.ok : addPlan.canTransfer && addPlan.remainderQty === 0;
        if (!canAdd) return { ok: false, reason: "bag_full" };
        nextBag = { ...bag, slots: addPlan.updatedSlots };
      }

      const balanceBefore = await loadCurrencyCopper();
      if (await spendCurrencyCopper(definition.priceCopper) === null) return { ok: false, reason: "insufficient_copper" };
      const nextShop: MerchantShopState = {
        ...shop,
        stockIds: stockId === "bag2"
          ? rollStock(5, Math.random, shop.stockIds.filter((id) => id !== "bag2"))
          : shop.stockIds,
        purchased: { ...shop.purchased, [stockId]: bought + 1 },
      };
      try {
        await AsyncStorage.multiSet([
          [PLAYER_BAG_KEY, JSON.stringify(nextBag)],
          [MERCHANT_SHOP_KEY, JSON.stringify(nextShop)],
          ...extraPairs,
        ]);
      } catch {
        await saveCurrencyCopper(balanceBefore);
        return { ok: false, reason: "storage_error" };
      }
      return { ok: true, shop: nextShop, bag: nextBag, delivery };
    } catch {
      return { ok: false, reason: "storage_error" };
    }
  });
  purchaseQueue = operation.then(() => undefined, () => undefined);
  return operation;
}
