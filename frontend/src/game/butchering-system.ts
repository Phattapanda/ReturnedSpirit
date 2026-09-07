export const BUTCHERING_KNIFE_IDS = [
  "tool_rusty_butchering_knife",
  "tool_iron_butchering_knife",
  "tool_steel_butchering_knife",
] as const;

export type ButcheringKnifeId = (typeof BUTCHERING_KNIFE_IDS)[number];
export type ButcheringKnifeTier = 1 | 2 | 3;
type QuantityRange = readonly [minimum: number, maximum: number];

type ButcheringMaterial = {
  id: string;
  ranges: readonly [QuantityRange, QuantityRange, QuantityRange];
};

type RareButcheringMaterial = {
  id: string;
  chances: readonly [number, number, number];
};

export type ButcheringDefinition = {
  monsterId: string;
  recipeName: string;
  carcassName: string;
  primary: ButcheringMaterial;
  secondary: readonly ButcheringMaterial[];
  rare: readonly RareButcheringMaterial[];
};

const range = (minimum: number, maximum = minimum): QuantityRange => [minimum, maximum];

export const BUTCHERING_DEFINITIONS: Readonly<Record<string, ButcheringDefinition>> = {
  feral_rabbit: {
    monsterId: "feral_rabbit", recipeName: "Butcher Feral Rabbit", carcassName: "Feral Rabbit Carcass",
    primary: { id: "white_meat", ranges: [range(1, 2), range(2, 3), range(3, 4)] },
    secondary: [{ id: "fur", ranges: [range(0, 1), range(1), range(1, 2)] }], rare: [],
  },
  wild_boar: {
    monsterId: "wild_boar", recipeName: "Butcher Wild Boar", carcassName: "Wild Boar Carcass",
    primary: { id: "red_meat", ranges: [range(2, 4), range(3, 5), range(4, 6)] },
    secondary: [{ id: "hide", ranges: [range(0, 1), range(1), range(1, 2)] }],
    rare: [{ id: "tusk", chances: [10, 18, 25] }],
  },
  wild_wolf: {
    monsterId: "wild_wolf", recipeName: "Butcher Forest Wolf", carcassName: "Forest Wolf Carcass",
    primary: { id: "red_meat", ranges: [range(2, 3), range(3, 4), range(4, 5)] },
    secondary: [{ id: "wolf_pelt", ranges: [range(0, 1), range(1), range(1, 2)] }],
    rare: [{ id: "fang", chances: [8, 15, 25] }],
  },
  ember_chicken: {
    monsterId: "ember_chicken", recipeName: "Butcher Ember Chicken", carcassName: "Ember Chicken Carcass",
    primary: { id: "ember_chicken_meat", ranges: [range(2, 4), range(3, 5), range(4, 6)] },
    secondary: [{ id: "ember_feather", ranges: [range(1, 2), range(1, 3), range(2, 3)] }],
    rare: [{ id: "shard_mana", chances: [3, 7, 12] }],
  },
  ember_rooster: {
    monsterId: "ember_rooster", recipeName: "Butcher Ember Rooster", carcassName: "Ember Rooster Carcass",
    primary: { id: "ember_chicken_meat", ranges: [range(3, 5), range(4, 6), range(5, 7)] },
    secondary: [{ id: "ember_feather", ranges: [range(1, 2), range(2, 3), range(2, 4)] }],
    rare: [{ id: "rooster_comb", chances: [10, 18, 30] }, { id: "shard_mana", chances: [8, 15, 25] }],
  },
  elder_ember_rooster: {
    monsterId: "elder_ember_rooster", recipeName: "Butcher Elder Ember Rooster", carcassName: "Elder Ember Rooster Carcass",
    primary: { id: "ember_chicken_meat", ranges: [range(6, 8), range(7, 9), range(8, 10)] },
    secondary: [{ id: "ember_feather", ranges: [range(2, 4), range(3, 5), range(4, 6)] }],
    rare: [
      { id: "elder_ember_comb", chances: [70, 85, 100] },
      { id: "shard_mana", chances: [50, 70, 100] },
      { id: "stone_mana", chances: [15, 25, 40] },
    ],
  },
};

/** Enemies explicitly excluded from carcass processing by the Forest Dungeon guide. */
export const FOREST_DIRECT_LOOT: Readonly<Record<string, readonly string[]>> = {
  forest_slime: ["slime_gel", "weak_monster_core"],
  thorn_beetle: ["beetle_shell"],
  goblin_forager: ["herbs", "cloth"],
};

export function getButcheringKnifeTier(itemId: string | null | undefined): ButcheringKnifeTier | null {
  const index = BUTCHERING_KNIFE_IDS.indexOf(itemId as ButcheringKnifeId);
  return index < 0 ? null : (index + 1) as ButcheringKnifeTier;
}

export function getButcheringDefinition(monsterId: string | null | undefined): ButcheringDefinition | null {
  return monsterId ? BUTCHERING_DEFINITIONS[monsterId] ?? null : null;
}

function rollQuantity(bounds: QuantityRange, luck: number, random: () => number): number {
  const [minimum, maximum] = bounds;
  if (maximum <= minimum) return minimum;
  const span = maximum - minimum + 1;
  let roll = Math.floor(random() * span);
  // Luck can replace a low result with a second roll, but never exceeds the guide's range.
  if (random() * 100 < Math.min(50, Math.max(0, luck) * 2)) {
    roll = Math.max(roll, Math.floor(random() * span));
  }
  return minimum + roll;
}

export function rollButcheringOutputs(
  monsterId: string,
  knifeId: string,
  luck: number,
  craftCount = 1,
  random: () => number = Math.random,
): { id: string; quantity: number }[] {
  const definition = getButcheringDefinition(monsterId);
  const tier = getButcheringKnifeTier(knifeId);
  if (!definition || !tier || craftCount < 1) return [];
  const quantities = new Map<string, number>();
  const add = (id: string, quantity: number) => {
    if (quantity > 0) quantities.set(id, (quantities.get(id) ?? 0) + quantity);
  };
  for (let craft = 0; craft < Math.floor(craftCount); craft += 1) {
    add(definition.primary.id, rollQuantity(definition.primary.ranges[tier - 1], luck, random));
    for (const material of definition.secondary) {
      add(material.id, rollQuantity(material.ranges[tier - 1], luck, random));
    }
    for (const material of definition.rare) {
      const chance = Math.min(100, material.chances[tier - 1] + Math.max(0, luck));
      if (random() * 100 < chance) add(material.id, 1);
    }
  }
  return [...quantities].map(([id, quantity]) => ({ id, quantity }));
}
