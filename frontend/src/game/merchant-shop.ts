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

export const MERCHANT_SHOP_KEY = "@game:merchant_shop";

export type MerchantStockId =
  | "bucket"
  | "egg"
  | "chicken"
  | "fish"
  | "beef"
  | "bag2"
  | "crate1"
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
  egg: { id: "egg", priceCopper: 24, maxPurchases: 2 },
  chicken: { id: "chicken", priceCopper: 40, maxPurchases: 2 },
  fish: { id: "fish", priceCopper: 44, maxPurchases: 2 },
  beef: { id: "beef", priceCopper: 50, maxPurchases: 2 },
  bag2: { id: "bag2", priceCopper: 100, maxPurchases: 1 },
  crate1: { id: "crate1", priceCopper: 40, maxPurchases: 1 },
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

function rollStock(randomValue = Math.random): MerchantStockId[] {
  const ids = Object.keys(MERCHANT_STOCK) as MerchantStockId[];
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(randomValue() * (index + 1));
    [ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]];
  }
  return ids.slice(0, 4);
}

export async function prepareMerchantShop(): Promise<MerchantShopState> {
  const guestState = await loadGuestState();
  const raw = await AsyncStorage.getItem(MERCHANT_SHOP_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as MerchantShopState;
      if (parsed.daySerial === guestState.calendarDaySerial && Array.isArray(parsed.stockIds)) return parsed;
    } catch { /* roll a clean shop */ }
  }
  const next: MerchantShopState = {
    version: 1,
    daySerial: guestState.calendarDaySerial,
    stockIds: rollStock(),
    purchased: {},
  };
  await AsyncStorage.setItem(MERCHANT_SHOP_KEY, JSON.stringify(next));
  return next;
}

export type MerchantPurchaseResult =
  | { ok: true; shop: MerchantShopState; bag: PlayerBagData; delivery: "bag" | "backpack_upgrade" | "kitchen" }
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

      const [rawBag, rawTable] = await Promise.all([
        AsyncStorage.getItem(PLAYER_BAG_KEY),
        AsyncStorage.getItem(KITCHEN_TABLE_KEY),
      ]);
      const bag = rawBag ? normalizePlayerBagData(JSON.parse(rawBag)) : { ...DEFAULT_BAG, slots: [...DEFAULT_BAG.slots] };
      if (!bag.unlocked) return { ok: false, reason: "bag_locked" };
      let nextBag = bag;
      let delivery: "bag" | "backpack_upgrade" | "kitchen" = "bag";
      const extraPairs: [string, string][] = [];

      if (stockId === "bag2") {
        if (bag.bagId === "bag2" || bag.bagId === "bag3") return { ok: false, reason: "already_owned" };
        nextBag = upgradeToBackpack(bag);
        delivery = "backpack_upgrade";
      } else if (stockId === "crate1") {
        const crateState = await loadSmallCrateState();
        if (crateState.owned) return { ok: false, reason: "already_owned" };
        const parsedTable = rawTable ? JSON.parse(rawTable) as (BagItem | null)[] : [];
        const nextTable: (BagItem | null)[] = Array.from(
          { length: Math.max(12, parsedTable.length) },
          (_, index) => parsedTable[index] ?? null,
        );
        const freeSlot = nextTable.findIndex((item) => item === null);
        if (freeSlot < 0) return { ok: false, reason: "kitchen_full" };
        nextTable[freeSlot] = createSmallCrateItem();
        extraPairs.push(
          [KITCHEN_TABLE_KEY, JSON.stringify(nextTable)],
          [KITCHEN_SMALL_CRATE_KEY, JSON.stringify({ ...crateState, owned: true })],
        );
        delivery = "kitchen";
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
