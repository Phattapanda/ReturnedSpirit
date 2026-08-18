import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Currency is stored canonically as one non-negative Copper value.
 * Silver and Gold are display denominations only and are always derived from Copper.
 */
export const CURRENCY_KEY = "@game:currency_copper";

export const COPPER_PER_SILVER = 100;
export const SILVER_PER_GOLD = 100;
export const COPPER_PER_GOLD = COPPER_PER_SILVER * SILVER_PER_GOLD;
export const DEFAULT_CURRENCY_COPPER = 0;

export type CurrencyBreakdown = {
  gold: number;
  silver: number;
  copper: number;
};

/** Keep persisted currency safe and deterministic: whole Copper, never negative. */
export function normalizeCopper(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CURRENCY_COPPER;
  return Math.max(0, Math.floor(value));
}

/** Convert canonical Copper into display denominations. */
export function copperToDenominations(totalCopper: number): CurrencyBreakdown {
  let remaining = normalizeCopper(totalCopper);
  const gold = Math.floor(remaining / COPPER_PER_GOLD);
  remaining %= COPPER_PER_GOLD;
  const silver = Math.floor(remaining / COPPER_PER_SILVER);
  const copper = remaining % COPPER_PER_SILVER;
  return { gold, silver, copper };
}

/** Convert denominations back into canonical Copper. Useful for future prices/tools. */
export function denominationsToCopper(balance: Partial<CurrencyBreakdown>): number {
  return normalizeCopper(
    (balance.gold ?? 0) * COPPER_PER_GOLD +
    (balance.silver ?? 0) * COPPER_PER_SILVER +
    (balance.copper ?? 0),
  );
}

export async function loadCurrencyCopper(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(CURRENCY_KEY);
    if (raw === null) return DEFAULT_CURRENCY_COPPER;
    return normalizeCopper(Number(raw));
  } catch {
    return DEFAULT_CURRENCY_COPPER;
  }
}

export async function saveCurrencyCopper(totalCopper: number): Promise<number> {
  const normalized = normalizeCopper(totalCopper);
  await AsyncStorage.setItem(CURRENCY_KEY, String(normalized));
  return normalized;
}

/** Add Copper and persist the resulting canonical balance. */
export async function addCurrencyCopper(amount: number): Promise<number> {
  const current = await loadCurrencyCopper();
  return saveCurrencyCopper(current + normalizeCopper(amount));
}

export async function canAffordCopper(cost: number): Promise<boolean> {
  const current = await loadCurrencyCopper();
  return current >= normalizeCopper(cost);
}

/** Return null when funds are insufficient; otherwise persist and return the new balance. */
export async function spendCurrencyCopper(cost: number): Promise<number | null> {
  const normalizedCost = normalizeCopper(cost);
  const current = await loadCurrencyCopper();
  if (current < normalizedCost) return null;
  return saveCurrencyCopper(current - normalizedCost);
}
