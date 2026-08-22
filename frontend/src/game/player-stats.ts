// ─── Player Stats & Growth Points ─────────────────────────────────────────────

export type PlayerStats = {
  level: number;
  maximumStamina: number;
  maximumLife: number;
  strength: number;
  endurance: number;
  perception: number;
  accuracy: number;
  luck: number;
  effectiveness: number;
  growthPoints: number;
  activeStaminaBuffs: {
    energyDrinkDays: number;
    energyPillDays: number;
  };
};

export const PLAYER_STATS_KEY = "@game:player_stats";

export const DEFAULT_PLAYER_STATS: PlayerStats = {
  level: 1,
  maximumStamina: 100,
  maximumLife: 30,
  strength: 1,
  endurance: 1,
  perception: 1,
  accuracy: 1,
  luck: 1,
  effectiveness: 1,
  growthPoints: 0,
  activeStaminaBuffs: {
    energyDrinkDays: 0,
    energyPillDays: 0,
  },
};

export const UPGRADE_GP_COST = 10;

function normalizedInteger(value: unknown, fallback: number, minimum = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.floor(parsed)) : fallback;
}

/** Safely migrates saves created before Level and temporary Stamina buffs existed. */
export function normalizePlayerStats(raw: unknown): PlayerStats {
  if (!raw || typeof raw !== "object") return {
    ...DEFAULT_PLAYER_STATS,
    activeStaminaBuffs: { ...DEFAULT_PLAYER_STATS.activeStaminaBuffs },
  };
  const candidate = raw as Partial<PlayerStats>;
  const buffs = candidate.activeStaminaBuffs ?? DEFAULT_PLAYER_STATS.activeStaminaBuffs;
  return {
    level: normalizedInteger(candidate.level, 1, 1),
    maximumStamina: normalizedInteger(candidate.maximumStamina, DEFAULT_PLAYER_STATS.maximumStamina, 1),
    maximumLife: normalizedInteger(candidate.maximumLife, DEFAULT_PLAYER_STATS.maximumLife, 1),
    strength: normalizedInteger(candidate.strength, 1, 1),
    endurance: normalizedInteger(candidate.endurance, 1, 1),
    perception: normalizedInteger(candidate.perception, 1, 1),
    accuracy: normalizedInteger(candidate.accuracy, 1, 1),
    luck: normalizedInteger(candidate.luck, 1, 1),
    effectiveness: normalizedInteger(candidate.effectiveness, 1, 1),
    growthPoints: normalizedInteger(candidate.growthPoints, 0),
    activeStaminaBuffs: {
      energyDrinkDays: normalizedInteger(buffs.energyDrinkDays, 0),
      energyPillDays: normalizedInteger(buffs.energyPillDays, 0),
    },
  };
}

export function getActiveStaminaBuffReduction(stats: PlayerStats): number {
  return Number(stats.activeStaminaBuffs.energyDrinkDays > 0)
    + Number(stats.activeStaminaBuffs.energyPillDays > 0);
}

/** Central cost formula: Endurance and active effects can reduce an action to zero. */
export function calcEffectiveStaminaCost(
  baseCost: number,
  endurance: number,
  temporaryReduction = 0,
): number {
  const reduction = Math.floor(endurance / 5);
  return Math.max(0, baseCost - reduction - Math.max(0, temporaryReduction));
}

export type StaminaBuffItemId = "energydrink" | "energypill";

export function hasStaminaBuff(stats: PlayerStats, itemId: StaminaBuffItemId): boolean {
  return itemId === "energydrink"
    ? stats.activeStaminaBuffs.energyDrinkDays > 0
    : stats.activeStaminaBuffs.energyPillDays > 0;
}

export function activateStaminaBuff(stats: PlayerStats, itemId: StaminaBuffItemId): PlayerStats {
  return {
    ...stats,
    activeStaminaBuffs: {
      ...stats.activeStaminaBuffs,
      ...(itemId === "energydrink" ? { energyDrinkDays: 5 } : { energyPillDays: 10 }),
    },
  };
}

export function advanceStaminaBuffDay(stats: PlayerStats): PlayerStats {
  return {
    ...stats,
    activeStaminaBuffs: {
      energyDrinkDays: Math.max(0, stats.activeStaminaBuffs.energyDrinkDays - 1),
      energyPillDays: Math.max(0, stats.activeStaminaBuffs.energyPillDays - 1),
    },
  };
}

export type UpgradableField =
  | "maximumStamina" | "maximumLife"
  | "strength" | "endurance" | "perception"
  | "accuracy" | "luck" | "effectiveness";

export const UPGRADABLE_FIELDS: UpgradableField[] = [
  "maximumStamina", "maximumLife",
  "strength", "endurance", "perception",
  "accuracy", "luck", "effectiveness",
];

export const STAT_LABELS: Record<UpgradableField, string> = {
  maximumStamina: "Maximum Stamina",
  maximumLife:    "Maximum Life",
  strength:       "Strength",
  endurance:      "Endurance",
  perception:     "Perception",
  accuracy:       "Accuracy",
  luck:           "Luck",
  effectiveness:  "Effectiveness",
};

export const STAT_DESCRIPTIONS: Record<string, string> = {
  STAMINA:
    "Energy used for activities. Stamina can be restored through meals, potions, and sleep. During exploration, Life Points are consumed when your Stamina is depleted.",
  LIFE:
    "Your health. Life can be restored by eating, drinking, and sleeping. If your Life Points reach 0, you can lose everything. Increasing your maximum Life fully restores your Life Points.",
  STRENGTH:      "Affects the damage you deal.",
  ENDURANCE:     "Affects your maximum Stamina and your resistance to damage. At certain levels, it also permanently reduces the Stamina cost of activities.",
  PERCEPTION:    "Affects how often you discover items, enemies, and traps.",
  ACCURACY:      "Affects your physical and magical hit rate.",
  LUCK:          "Affects your chance of discovering rare items and your evasion rate.",
  EFFECTIVENESS: "Affects equipment crafting.",
};

/**
 * Apply one upgrade.
 * - maximumStamina: +5, currentStamina unchanged
 * - maximumLife: +5, currentLife set to new max
 * - others: +1
 * Returns updated stats + new currentLife (or null if unchanged).
 */
export function applyStatUpgrade(
  stats: PlayerStats,
  field: UpgradableField,
  currentLife: number,
): { stats: PlayerStats; newCurrentLife: number | null } {
  if (stats.growthPoints < UPGRADE_GP_COST) return { stats, newCurrentLife: null };
  const updated = {
    ...stats,
    level: stats.level + 1,
    growthPoints: stats.growthPoints - UPGRADE_GP_COST,
  };
  let newCurrentLife: number | null = null;

  if (field === "maximumStamina") {
    updated.maximumStamina = stats.maximumStamina + 5;
  } else if (field === "maximumLife") {
    updated.maximumLife = stats.maximumLife + 5;
    newCurrentLife = updated.maximumLife; // full heal
  } else {
    (updated as unknown as Record<string, number>)[field] = (stats as unknown as Record<string, number>)[field] + 1;
  }
  return { stats: updated, newCurrentLife };
}
