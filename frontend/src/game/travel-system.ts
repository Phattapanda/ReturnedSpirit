import AsyncStorage from "@react-native-async-storage/async-storage";

import { spendCurrencyCopper } from "@/src/game/currency-system";
import {
  COACHMAN_PROFILE,
  getGuestTransportDiscountPercent,
  isGuestScheduled,
  loadGuestState,
} from "@/src/game/guest-system";
import {
  DEFAULT_PLAYER_STATS,
  PLAYER_STATS_KEY,
  calcEffectiveStaminaCost,
  getActiveStaminaBuffReduction,
  normalizePlayerStats,
} from "@/src/game/player-stats";

export const TRAVEL_STATE_KEY = "@game:travel_state";

export type TravelDestinationId = "next_city" | "forest_entrance";
export type TavernReturnLocation = "kitchen" | "garden" | "dining" | "mail";

export type TravelState = {
  version: 1;
  exploreUnlocked: boolean;
  unlockedDestinations: TravelDestinationId[];
};

export const DEFAULT_TRAVEL_STATE: TravelState = {
  version: 1,
  exploreUnlocked: false,
  unlockedDestinations: [],
};

export const TRAVEL_DESTINATIONS: Record<TravelDestinationId, {
  id: TravelDestinationId;
  name: string;
  carriageCostCopper: number;
  walkingStaminaCost: number;
  route: "/next-city" | "/forest-entrance";
}> = {
  next_city: {
    id: "next_city",
    name: "Next City",
    carriageCostCopper: 15,
    walkingStaminaCost: 30,
    route: "/next-city",
  },
  forest_entrance: {
    id: "forest_entrance",
    name: "Forest Entrance",
    carriageCostCopper: 25,
    walkingStaminaCost: 50,
    route: "/forest-entrance",
  },
};

function normalizeTravelState(raw: unknown): TravelState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_TRAVEL_STATE, unlockedDestinations: [] };
  const candidate = raw as Partial<TravelState>;
  const valid = new Set<TravelDestinationId>(["next_city", "forest_entrance"]);
  return {
    version: 1,
    exploreUnlocked: candidate.exploreUnlocked === true,
    unlockedDestinations: Array.isArray(candidate.unlockedDestinations)
      ? [...new Set(candidate.unlockedDestinations.filter((id): id is TravelDestinationId => valid.has(id as TravelDestinationId)))]
      : [],
  };
}

export async function loadTravelState(): Promise<TravelState> {
  try {
    const raw = await AsyncStorage.getItem(TRAVEL_STATE_KEY);
    return normalizeTravelState(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_TRAVEL_STATE, unlockedDestinations: [] };
  }
}

export async function unlockExploreFromCoachman(): Promise<TravelState> {
  const next: TravelState = {
    version: 1,
    exploreUnlocked: true,
    unlockedDestinations: ["next_city", "forest_entrance"],
  };
  await AsyncStorage.setItem(TRAVEL_STATE_KEY, JSON.stringify(next));
  return next;
}

export async function getCoachmanTravelStatus(dayIndex: number): Promise<{
  available: boolean;
  favor: number;
  discountPercent: number;
}> {
  const state = await loadGuestState();
  const favor = state.favors.coachman ?? COACHMAN_PROFILE.initialFavor;
  return {
    available: isGuestScheduled(COACHMAN_PROFILE, dayIndex, favor),
    favor,
    discountPercent: getGuestTransportDiscountPercent(COACHMAN_PROFILE, favor),
  };
}

export function discountedCarriageCost(baseCost: number, discountPercent: number): number {
  return Math.ceil(Math.max(0, baseCost) * Math.max(0, 100 - discountPercent) / 100);
}

export async function getEffectiveWalkingCost(baseCost: number): Promise<number> {
  const rawStats = await AsyncStorage.getItem(PLAYER_STATS_KEY);
  const stats = rawStats ? normalizePlayerStats(JSON.parse(rawStats)) : DEFAULT_PLAYER_STATS;
  return calcEffectiveStaminaCost(baseCost, stats.endurance, getActiveStaminaBuffReduction(stats));
}

export async function payForCarriage(costCopper: number): Promise<boolean> {
  return (await spendCurrencyCopper(costCopper)) !== null;
}

export async function spendWalkingStamina(cost: number): Promise<{ ok: boolean; remaining: number }> {
  const raw = await AsyncStorage.getItem("@game:stamina");
  const current = Math.max(0, Number.parseInt(raw ?? "0", 10) || 0);
  if (current < cost) return { ok: false, remaining: current };
  const remaining = current - cost;
  await AsyncStorage.setItem("@game:stamina", String(remaining));
  return { ok: true, remaining };
}
