export type GardenFertilizerId = "standard_fertilizer" | "premium_fertilizer";

export type GardenFertilizerConfig = {
  id: GardenFertilizerId;
  name: string;
  yieldBonus: number;
  staminaCost: number;
};

const LEGACY_FERTILIZER_IDS: Record<string, GardenFertilizerId> = {
  standardfertilizer: "standard_fertilizer",
  premiumfertilizer: "premium_fertilizer",
};

export const GARDEN_FERTILIZER_CONFIGS: readonly GardenFertilizerConfig[] = [
  { id: "standard_fertilizer", name: "Standard Fertilizer", yieldBonus: 1, staminaCost: 3 },
  { id: "premium_fertilizer", name: "Premium Fertilizer", yieldBonus: 2, staminaCost: 3 },
];

export function normalizeGardenFertilizerId(itemId: string | null): string | null {
  return itemId ? (LEGACY_FERTILIZER_IDS[itemId] ?? itemId) : null;
}

export function getGardenFertilizerConfig(itemId: string | null): GardenFertilizerConfig | null {
  const normalized = normalizeGardenFertilizerId(itemId);
  return GARDEN_FERTILIZER_CONFIGS.find((config) => config.id === normalized) ?? null;
}
