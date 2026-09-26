import { ITEM_CATALOG, type BagItem } from "@/src/game/item-system";

export const EXPLORE_AREA_BASE_STAMINA_COST = 10;

type ExploreItemEntry = {
  kind: "item";
  itemId: string;
  minQuantity: number;
  maxQuantity: number;
  weight: number;
  text: string;
};

type ExploreCopperEntry = {
  kind: "copper";
  minQuantity: number;
  maxQuantity: number;
  weight: number;
  text: string;
};

export type ExploreAreaEntry = ExploreItemEntry | ExploreCopperEntry;

export type ExploreAreaFind = ExploreAreaEntry & {
  quantity: number;
};

/**
 * Explicit whitelist for the countryside around the tavern. Keeping this list
 * curated prevents meals, potions, scrolls, alchemy powders, and monster-only
 * drops from entering the activity when the central item catalog grows.
 */
export const EXPLORE_AREA_POOL: readonly ExploreAreaEntry[] = [
  { kind: "item", itemId: "seed_herb", minQuantity: 1, maxQuantity: 2, weight: 3, text: "You notice dried seed pods among the roadside herbs." },
  { kind: "item", itemId: "seed_carrot", minQuantity: 1, maxQuantity: 2, weight: 3, text: "Near an abandoned garden bed, you find a few carrot seeds." },
  { kind: "item", itemId: "seed_potato", minQuantity: 1, maxQuantity: 2, weight: 3, text: "A small seed pouch lies half-hidden beneath loose soil." },
  { kind: "item", itemId: "seed_onion", minQuantity: 1, maxQuantity: 2, weight: 3, text: "You gather onion seeds from plants growing beside an old fence." },
  { kind: "item", itemId: "seed_lettuce", minQuantity: 1, maxQuantity: 2, weight: 2, text: "A patch of wild lettuce has gone to seed near the trail." },
  { kind: "item", itemId: "seed_cucumber", minQuantity: 1, maxQuantity: 2, weight: 2, text: "You discover cucumber seeds in an overgrown vegetable patch." },
  { kind: "item", itemId: "seed_spinach", minQuantity: 1, maxQuantity: 2, weight: 2, text: "Among the weeds, you spot spinach plants carrying usable seeds." },
  { kind: "item", itemId: "seed_tomato", minQuantity: 1, maxQuantity: 2, weight: 2, text: "A fallen tomato has left several good seeds in the soft earth." },
  { kind: "item", itemId: "seed_pumpkin", minQuantity: 1, maxQuantity: 2, weight: 1, text: "Behind a mossy wall, you find the remains of a wild pumpkin vine." },

  { kind: "item", itemId: "ore_iron", minQuantity: 1, maxQuantity: 1, weight: 2, text: "A dark glint in a rocky outcrop reveals a piece of iron ore." },
  { kind: "item", itemId: "ore_copper", minQuantity: 1, maxQuantity: 1, weight: 2, text: "You pry a green-streaked piece of copper ore from a cracked stone." },
  { kind: "item", itemId: "coal", minQuantity: 1, maxQuantity: 2, weight: 3, text: "At an old, cold firepit, you uncover a few usable pieces of coal." },
  { kind: "copper", minQuantity: 3, maxQuantity: 12, weight: 4, text: "Something glints in the dirt beside the road: a few lost Copper Coins." },
  { kind: "item", itemId: "nails", minQuantity: 1, maxQuantity: 3, weight: 4, text: "Near a broken cart wheel, you find several nails that are still usable." },
  { kind: "item", itemId: "wood", minQuantity: 1, maxQuantity: 3, weight: 5, text: "You collect dry, sturdy wood from fallen branches beside the path." },
  { kind: "item", itemId: "stone", minQuantity: 1, maxQuantity: 3, weight: 5, text: "A cluster of loose stones contains several useful building pieces." },
  { kind: "item", itemId: "weapon_iron_dagger", minQuantity: 1, maxQuantity: 1, weight: 1, text: "Beneath a thorny bush, you discover an old Iron Dagger in surprisingly good condition." },
  { kind: "item", itemId: "standard_fertilizer", minQuantity: 1, maxQuantity: 1, weight: 2, text: "Beside a deserted field, you find a sealed sack of fertilizer." },

  { kind: "item", itemId: "nuts", minQuantity: 1, maxQuantity: 3, weight: 5, text: "Under a broad old tree, you gather nuts scattered among the leaves." },
  { kind: "item", itemId: "mushroom", minQuantity: 1, maxQuantity: 2, weight: 5, text: "You pass a fallen tree trunk and notice mushrooms growing on it." },
  { kind: "item", itemId: "wild_berries", minQuantity: 1, maxQuantity: 3, weight: 5, text: "A sunlit bush beside the trail is heavy with ripe wild berries." },
  { kind: "item", itemId: "egg", minQuantity: 1, maxQuantity: 2, weight: 3, text: "In a sheltered nest near the hedgerow, you find a few ordinary eggs." },
  { kind: "item", itemId: "herbs", minQuantity: 1, maxQuantity: 3, weight: 4, text: "The scent of fresh herbs leads you to a small patch growing in the wild." },
  { kind: "item", itemId: "carrot", minQuantity: 1, maxQuantity: 2, weight: 3, text: "Green leaves reveal wild carrots growing in the soft roadside soil." },
  { kind: "item", itemId: "potato", minQuantity: 1, maxQuantity: 2, weight: 3, text: "You uncover a few potatoes in the remains of an abandoned field." },
  { kind: "item", itemId: "onion", minQuantity: 1, maxQuantity: 2, weight: 3, text: "Near a low stone wall, you find wild onions ready to be picked." },
  { kind: "item", itemId: "tomato", minQuantity: 1, maxQuantity: 2, weight: 2, text: "An overgrown vine bears a couple of ripe tomatoes." },
  { kind: "item", itemId: "lettuce", minQuantity: 1, maxQuantity: 2, weight: 2, text: "In the shade of a hedge, you discover crisp wild lettuce." },
  { kind: "item", itemId: "cucumber", minQuantity: 1, maxQuantity: 2, weight: 2, text: "A creeping vine hidden in the grass holds a fresh cucumber." },
  { kind: "item", itemId: "spinach", minQuantity: 1, maxQuantity: 2, weight: 2, text: "You recognize edible spinach among the leafy plants by the path." },
  { kind: "item", itemId: "pumpkin", minQuantity: 1, maxQuantity: 1, weight: 1, text: "Beyond a collapsed fence, you find a small ripe pumpkin." },
] as const;

function boundedRoll(random: () => number): number {
  return Math.min(0.999999999, Math.max(0, random()));
}

export function getExploreAreaLuckChance(luck: number): number {
  const safeLuck = Math.max(0, Number.isFinite(luck) ? luck : 0);
  return Math.min(100, 25 + safeLuck * 2);
}

/** Each successful Luck roll adds one find until the appropriate cap is reached. */
export function rollExploreAreaQuantity(
  kind: ExploreAreaEntry["kind"],
  luck: number,
  random: () => number = Math.random,
): number {
  const minimum = kind === "copper" ? 8 : 1;
  const maximum = kind === "copper" ? 15 : 5;
  const chance = getExploreAreaLuckChance(luck);
  let quantity = minimum;
  while (quantity < maximum && boundedRoll(random) * 100 < chance) quantity += 1;
  return quantity;
}

export function rollExploreAreaFind(luck: number, random: () => number = Math.random): ExploreAreaFind {
  const totalWeight = EXPLORE_AREA_POOL.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = boundedRoll(random) * totalWeight;
  let selected = EXPLORE_AREA_POOL[EXPLORE_AREA_POOL.length - 1];
  for (const entry of EXPLORE_AREA_POOL) {
    roll -= entry.weight;
    if (roll < 0) {
      selected = entry;
      break;
    }
  }
  const quantity = rollExploreAreaQuantity(selected.kind, luck, random);
  return { ...selected, quantity };
}

export function createExploreAreaItem(find: ExploreAreaFind): BagItem | null {
  if (find.kind !== "item") return null;
  const catalog = ITEM_CATALOG[find.itemId];
  const maximumDurability = catalog?.maxDurability;
  return {
    id: find.itemId,
    itemType: find.itemId.startsWith("seed_") ? "seed" : find.itemId,
    name: catalog?.name ?? find.itemId,
    quantity: find.quantity,
    attributes: catalog?.attributes ? [...catalog.attributes] : undefined,
    durability: maximumDurability,
    maxDurability: maximumDurability,
  };
}

export function formatExploreAreaFind(find: ExploreAreaFind): string {
  if (find.kind === "copper") {
    return `${find.text}\nFound: ${find.quantity} Copper Coin${find.quantity === 1 ? "" : "s"}.`;
  }
  const name = ITEM_CATALOG[find.itemId]?.name ?? find.itemId;
  return `${find.text}\nFound: ${find.quantity}× ${name}.`;
}
