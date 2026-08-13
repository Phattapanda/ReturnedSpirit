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
  displayName: string;
  costs:       UpgradeCost;
  effects:     UpgradeEffects;
  completed:   boolean;
};

export const ROOM_UPGRADES_DEFAULT: RoomUpgrade[] = [
  {
    id: "room_curtain_01",
    displayName: "Change Curtain",
    costs: { cloth: 2 },
    effects: { sleepStaminaRecovery: 5 },
    completed: false,
  },
  {
    id: "room_bed_01",
    displayName: "Upgrade Bed Lvl. 1",
    costs: { cloth: 2, wood: 3 },
    effects: { sleepStaminaRecovery: 5, sleepLifeRecovery: 5 },
    completed: false,
  },
  {
    id: "room_storage_01",
    displayName: "Build Storage Lvl. 1",
    costs: { wood: 10 },
    effects: {
      unlockRoomStorage: { level: 1, rows: 2, columns: 6 },
    },
    completed: false,
  },
  {
    id: "room_upgrade_01",
    displayName: "Upgrade Room Lvl. 1",
    costs: { wood: 3, nails: 2 },
    effects: { sleepStaminaRecovery: 5, sleepLifeRecovery: 5 },
    completed: false,
  },
];

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
