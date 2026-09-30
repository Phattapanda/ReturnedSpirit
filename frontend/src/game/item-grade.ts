export const ITEM_GRADES = ["D", "C", "B", "A", "S"] as const;
export type ItemGrade = typeof ITEM_GRADES[number];
export function normalizeGrade(value: unknown): ItemGrade {
  return ITEM_GRADES.includes(value as ItemGrade) ? value as ItemGrade : "D";
}
export function gradeLevel(value: unknown): number {
  return ITEM_GRADES.indexOf(normalizeGrade(value));
}
export function cropGrade(plot: { yieldUpgradeLevel?: number; premiumFertilizerUses?: number }): ItemGrade {
  return ITEM_GRADES[Math.min(4, (plot.yieldUpgradeLevel && plot.yieldUpgradeLevel >= 2 ? 1 : 0) +
    Math.max(0, Math.floor(plot.premiumFertilizerUses ?? 0)))];
}
/** Highest rank reached by strictly more than 51% of consumed units. Water is excluded by the caller. */
export function collectiveGrade(items: readonly { grade?: ItemGrade; quantity: number }[]): ItemGrade {
  const total = items.reduce((sum, item) => sum + item.quantity, 0);
  for (let level = 4; level > 0; level--) {
    const qualifying = items.reduce((sum, item) => sum + (gradeLevel(item.grade) >= level ? item.quantity : 0), 0);
    if (total > 0 && qualifying / total > 0.51) return ITEM_GRADES[level];
  }
  return "D";
}
