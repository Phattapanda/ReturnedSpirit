import { ITEM_CATALOG, type BagItem, type PlayerBagData } from "@/src/game/item-system";

export const SCROLL_BASE_USES: Readonly<Record<string, number>> = {
  fire_bolt_scroll: 5,
  ice_field_scroll: 7,
  lightning_bolt_scroll: 3,
  bountiful_harvest_scroll: 2,
  gravitas_scroll: 4,
  weapon_enhancement_scroll: 1,
  armor_enhancement_scroll: 1,
};

export function isScroll(item: BagItem | string): boolean {
  const id = typeof item === "string" ? item : item.id;
  return id === "scroll" || Object.hasOwn(SCROLL_BASE_USES, id);
}

export function createCraftedScroll(id: string, effectiveness: number): BagItem {
  const maximum = (SCROLL_BASE_USES[id] ?? 0) + Math.floor(Math.max(0, effectiveness) / 5);
  return {
    id, itemType: id, name: ITEM_CATALOG[id]?.name ?? id, quantity: 1,
    attributes: ITEM_CATALOG[id]?.attributes ? [...ITEM_CATALOG[id]!.attributes] : undefined,
    usesRemaining: maximum, maxUses: maximum, equipped: false,
  };
}

/** Used on an attempted cast, even if the spell misses. The final charge destroys the scroll. */
export function expendScrollUse(bag: PlayerBagData, slotIndex: number): PlayerBagData {
  const item = bag.slots[slotIndex];
  if (!item || !Object.hasOwn(SCROLL_BASE_USES, item.id)) return bag;
  const maximum = item.maxUses ?? SCROLL_BASE_USES[item.id];
  const remaining = Math.max(0, (item.usesRemaining ?? maximum) - 1);
  const slots = [...bag.slots];
  slots[slotIndex] = remaining === 0 ? null : { ...item, usesRemaining: remaining, maxUses: maximum };
  return { ...bag, slots };
}
