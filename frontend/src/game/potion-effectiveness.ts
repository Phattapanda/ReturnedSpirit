/** Effectiveness starts at 1; recovery gains 2 per additional point. */
export function potionRecoveryBonus(effectiveness: number): number {
  return Math.max(0, Math.floor(effectiveness) - 1) * 2;
}

/** Strength and Defense gain one point at 5, 10, 15, ... Effectiveness. */
export function potionStatBonus(effectiveness: number): number {
  return Math.floor(Math.max(0, Math.floor(effectiveness)) / 5);
}

export function potionBuffPotency(itemId: string, effectiveness: number): number | undefined {
  return itemId === "potion_strength" || itemId === "potion_defense"
    ? 5 + potionStatBonus(effectiveness)
    : undefined;
}
