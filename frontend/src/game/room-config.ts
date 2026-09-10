import type { ResourceId, SharedResources } from "./shared-resources";

export type UpgradeCost = Partial<Record<ResourceId, number>>;

export type UpgradeEffects = {
  sleepStaminaRecovery?: number;
  sleepLifeRecovery?:    number;
  unlockRoomStorage?: {
    level:   number;
    rows:    number;
    columns: number;
  };
};

export type RoomUpgrade = {
  id:          string;
  chain:       "curtain" | "storage" | "room" | "bed";
  level:       1 | 2 | 3;
  displayName: string;
  costs:       UpgradeCost;
  effects:     UpgradeEffects;
  completed:   boolean;
};

export const SLEEP_STAMINA_SPEND_REQUIRED = 10;

export const ROOM_UPGRADES_DEFAULT: RoomUpgrade[] = [
  {
    id: "room_curtain_01",
    chain: "curtain",
    level: 1,
    displayName: "Light Curtain (Lvl. 1)",
    costs: { cloth: 2 },
    effects: { sleepStaminaRecovery: 5 },
    completed: false,
  },
  {
    id: "room_curtain_02",
    chain: "curtain",
    level: 2,
    displayName: "Pretty Curtain (Lvl. 2)",
    costs: { cloth: 5, paint: 1 },
    effects: { sleepStaminaRecovery: 5 },
    completed: false,
  },
  {
    id: "room_curtain_03",
    chain: "curtain",
    level: 3,
    displayName: "Dark Curtain (Lvl. 3)",
    costs: { cloth: 10, paint: 2 },
    effects: { sleepStaminaRecovery: 5, sleepLifeRecovery: 5 },
    completed: false,
  },
  {
    id: "room_storage_01",
    chain: "storage",
    level: 1,
    displayName: "Build Storage (Lvl. 1)",
    costs: { wood: 10 },
    effects: {
      unlockRoomStorage: { level: 1, rows: 2, columns: 5 },
    },
    completed: false,
  },
  {
    id: "room_storage_02",
    chain: "storage",
    level: 2,
    displayName: "Expand Storage (Lvl. 2)",
    costs: { wood: 10, nails: 5 },
    effects: {
      unlockRoomStorage: { level: 2, rows: 3, columns: 5 },
    },
    completed: false,
  },
  {
    id: "room_storage_03",
    chain: "storage",
    level: 3,
    displayName: "Expand Storage (Lvl. 3)",
    costs: { wood: 10, nails: 5, paint: 3 },
    effects: {
      unlockRoomStorage: { level: 3, rows: 4, columns: 5 },
    },
    completed: false,
  },
  {
    id: "room_upgrade_01",
    chain: "room",
    level: 1,
    displayName: "Close Gaps (Lvl. 1)",
    costs: { wood: 3, nails: 2 },
    effects: { sleepStaminaRecovery: 5, sleepLifeRecovery: 5 },
    completed: false,
  },
  {
    id: "room_upgrade_02",
    chain: "room",
    level: 2,
    displayName: "Close More Gaps (Lvl. 2)",
    costs: { stone: 5, paint: 2 },
    effects: { sleepStaminaRecovery: 5, sleepLifeRecovery: 5 },
    completed: false,
  },
  {
    id: "room_upgrade_03",
    chain: "room",
    level: 3,
    displayName: "Paint the Room (Lvl. 3)",
    costs: { paint: 10 },
    effects: { sleepStaminaRecovery: 10, sleepLifeRecovery: 5 },
    completed: false,
  },
  {
    id: "room_bed_01",
    chain: "bed",
    level: 1,
    displayName: "Change the Sheets (Lvl. 1)",
    costs: { cloth: 3 },
    effects: { sleepStaminaRecovery: 5, sleepLifeRecovery: 5 },
    completed: false,
  },
  {
    id: "room_bed_02",
    chain: "bed",
    level: 2,
    displayName: "Replace Mattress (Lvl. 2)",
    costs: { cloth: 15 },
    effects: { sleepStaminaRecovery: 10, sleepLifeRecovery: 10 },
    completed: false,
  },
  {
    id: "room_bed_03",
    chain: "bed",
    level: 3,
    displayName: "Modify Bed Frame (Lvl. 3)",
    costs: { wood: 15, nails: 20, paint: 5 },
    effects: { sleepStaminaRecovery: 10, sleepLifeRecovery: 10 },
    completed: false,
  },
];

/** Shows the next unfinished stage in each chain, or its final completed stage. */
export function visibleRoomUpgrades(upgrades: RoomUpgrade[]): RoomUpgrade[] {
  const chains: RoomUpgrade["chain"][] = ["curtain", "storage", "room", "bed"];
  return chains.flatMap((chain) => {
    const stages = upgrades.filter((upgrade) => upgrade.chain === chain).sort((a, b) => a.level - b.level);
    return stages.find((upgrade) => !upgrade.completed) ?? stages[stages.length - 1] ?? [];
  });
}

export function roomStorageCapacity(upgrades: RoomUpgrade[]): number {
  return upgrades.reduce((capacity, upgrade) => {
    const storage = upgrade.completed ? upgrade.effects.unlockRoomStorage : undefined;
    return storage ? Math.max(capacity, storage.rows * storage.columns) : capacity;
  }, 0);
}

// Derive cumulative sleep recovery from completed upgrades
export function calcSleepRecovery(upgrades: RoomUpgrade[]): { stamina: number; life: number } {
  let stamina = 20; // base
  let life    = 10; // base
  for (const upg of upgrades) {
    if (upg.completed) {
      if (upg.effects.sleepStaminaRecovery) stamina += upg.effects.sleepStaminaRecovery;
      if (upg.effects.sleepLifeRecovery)    life    += upg.effects.sleepLifeRecovery;
    }
  }
  return { stamina, life };
}

// Check if a single upgrade is affordable
export function canAfford(upgrade: RoomUpgrade, resources: SharedResources): boolean {
  for (const [res, qty] of Object.entries(upgrade.costs) as [ResourceId, number][]) {
    if ((resources[res] ?? 0) < qty) return false;
  }
  return true;
}

// Atomically deduct resources for an upgrade (returns new resources or null if insufficient)
export function deductUpgradeCost(
  upgrade: RoomUpgrade,
  resources: SharedResources,
): SharedResources | null {
  if (!canAfford(upgrade, resources)) return null;
  const next = { ...resources };
  for (const [res, qty] of Object.entries(upgrade.costs) as [ResourceId, number][]) {
    next[res] = (next[res] ?? 0) - qty;
  }
  return next;
}
