// ─── Player Stats & Growth Points ─────────────────────────────────────────────

export type PlayerStats = {
  maximumStamina: number;
  maximumLife: number;
  strength: number;
  endurance: number;
  perception: number;
  accuracy: number;
  luck: number;
  effectiveness: number;
  growthPoints: number;
};

export const PLAYER_STATS_KEY = "@game:player_stats";

export const DEFAULT_PLAYER_STATS: PlayerStats = {
  maximumStamina: 100,
  maximumLife: 30,
  strength: 1,
  endurance: 1,
  perception: 1,
  accuracy: 1,
  luck: 1,
  effectiveness: 1,
  growthPoints: 0,
};

export const UPGRADE_GP_COST = 10;

/** Central endurance cost formula – always use this, never hardcode reduced costs */
export function calcEffectiveStaminaCost(baseCost: number, endurance: number): number {
  const reduction = Math.floor(endurance / 5);
  return Math.max(1, baseCost - reduction);
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
  const updated = { ...stats, growthPoints: stats.growthPoints - UPGRADE_GP_COST };
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
