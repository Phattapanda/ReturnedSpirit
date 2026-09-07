import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  ITEM_ATTRIBUTE,
  ITEM_CATALOG,
  PLAYER_BAG_KEY,
  getItemAttributes,
  normalizePlayerBagData,
  type BagItem,
  type PlayerBagData,
} from "@/src/game/item-system";

export type EquipmentKind = "weapon" | "armor" | "tool";

export function getEquipmentKind(item: BagItem): EquipmentKind | null {
  const attributes = getItemAttributes(item);
  if (attributes.includes(ITEM_ATTRIBUTE.WEAPON)) return "weapon";
  if (attributes.includes(ITEM_ATTRIBUTE.ARMOR)) return "armor";
  if (item.id === "torch") return "tool";
  return null;
}

export function toggleEquippedItem(bag: PlayerBagData, slotIndex: number): PlayerBagData {
  const target = bag.slots[slotIndex];
  if (!target) return bag;
  const kind = getEquipmentKind(target);
  if (!kind) return bag;
  if (!target.equipped && target.quantity > 1) {
    const free = bag.slots.findIndex((item) => item === null);
    if (free < 0) return bag;
    const slots = bag.slots.map((item) => item && getEquipmentKind(item) === kind && item.equipped ? { ...item, equipped: false } : item);
    slots[slotIndex] = { ...target, quantity: target.quantity - 1, equipped: false };
    slots[free] = { ...target, quantity: 1, equipped: true };
    return { ...bag, slots };
  }
  const nextSlots = bag.slots.map((item, index) => {
    if (!item) return null;
    if (index === slotIndex) return { ...item, equipped: !target.equipped };
    return getEquipmentKind(item) === kind && item.equipped ? { ...item, equipped: false } : item;
  });
  return { ...bag, slots: nextSlots };
}

export function getEquippedItem(bag: PlayerBagData, kind: EquipmentKind): BagItem | null {
  return bag.slots.find((item) => !!item?.equipped && getEquipmentKind(item) === kind) ?? null;
}

/** Successful hits consume one weapon durability; zero durability destroys the weapon. */
export function consumeWeaponDurability(bag: PlayerBagData): PlayerBagData {
  return consumeEquippedDurability(bag, "weapon");
}

/** Every physical hit that reaches the player consumes one armor durability. */
export function consumeArmorDurability(bag: PlayerBagData): PlayerBagData {
  return consumeEquippedDurability(bag, "armor");
}

function consumeEquippedDurability(bag: PlayerBagData, kind: EquipmentKind): PlayerBagData {
  const index = bag.slots.findIndex((item) => !!item?.equipped && getEquipmentKind(item) === kind);
  if (index < 0) return bag;
  const item = bag.slots[index]!;
  const maximum = item.maxDurability ?? ITEM_CATALOG[item.id]?.maxDurability ?? 1;
  const remaining = Math.max(0, (item.durability ?? maximum) - 1);
  const slots = [...bag.slots];
  slots[index] = remaining === 0 ? null : { ...item, durability: remaining, maxDurability: maximum };
  return { ...bag, slots };
}

export function rollPlayerPhysicalDamage(
  strength: number,
  monsterPhysicalDefense: number,
  weapon: BagItem | null,
  randomValue = Math.random(),
): number {
  const entry = weapon ? ITEM_CATALOG[weapon.id] : null;
  const minimum = entry?.damageMin ?? 0;
  const maximum = Math.max(minimum, entry?.damageMax ?? 0);
  const weaponDamage = minimum + Math.floor(Math.max(0, Math.min(0.999999, randomValue)) * (maximum - minimum + 1));
  return Math.max(0, weaponDamage + Math.max(0, Math.floor(strength)) - Math.max(0, Math.floor(monsterPhysicalDefense)));
}

export function rollPlayerAttackHit(weapon: BagItem | null, randomValue = Math.random()): boolean {
  const accuracy = weapon ? ITEM_CATALOG[weapon.id]?.basicAccuracyPercent ?? 100 : 100;
  return Math.max(0, Math.min(0.999999, randomValue)) * 100 < accuracy;
}

export function calculateIncomingPhysicalDamage(
  physicalAttack: number,
  endurance: number,
  armor: BagItem | null,
): number {
  const armorDefense = armor ? ITEM_CATALOG[armor.id]?.physicalDefense ?? 0 : 0;
  return Math.max(0, Math.floor(physicalAttack) - Math.max(0, Math.floor(endurance)) - armorDefense);
}

export async function saveEquippedBag(bag: PlayerBagData): Promise<PlayerBagData> {
  const normalized = normalizePlayerBagData(bag);
  await AsyncStorage.setItem(PLAYER_BAG_KEY, JSON.stringify(normalized));
  return normalized;
}
