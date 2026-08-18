import AsyncStorage from "@react-native-async-storage/async-storage";

import { MEAL_TAG, type MealTag } from "@/src/game/item-system";

export const GUEST_STATE_KEY = "@game:guest_state";

export type GuestId = "old_farmer" | "coachman" | (string & {});

export type GuestFavorTier = {
  minFavor: number;
  maxFavor: number;
  /** Weekday indices use the existing game convention: MO=0 ... SU=6. */
  visitDays: readonly number[];
  /** Reserved for guests whose favor changes another system, e.g. Coachman transport. */
  transportDiscountPercent?: number;
};

export type GuestProfile = {
  id: GuestId;
  name: string;
  portraitKey: string;
  /** Default visit days. favorTiers can override these at the guest's current favor. */
  visitDays: readonly number[];
  favorTiers?: readonly GuestFavorTier[];
  initialFavor: number;
  favoriteDishId: string | null;
  leastFavoriteDishId: string | null;
  preferredMealTags: readonly MealTag[];
  dislikedMealTags: readonly MealTag[];
  /** Empty means this guest has no interest in trading. */
  tradePool: readonly number[];
};

export type GuestVisitTrade = {
  daySerial: number;
  offerRoll: number;
};

export type GuestState = {
  version: 1;
  /** Monotonic in-game day counter used to distinguish visits across week wraps. */
  calendarDaySerial: number;
  /** Current weekday in the game's existing MO=0 ... SU=6 format. */
  calendarWeekday: number;
  favors: Record<string, number>;
  activeGuestId: GuestId | null;
  /** Only the current/most recent visit roll per guest is retained. */
  visitTrades: Record<string, GuestVisitTrade>;
};

export type GuestVisitView = {
  profile: GuestProfile;
  favor: number;
  tradeOfferRoll: number | null;
  transportDiscountPercent: number;
  selected: boolean;
};

export const OLD_FARMER_PROFILE: GuestProfile = {
  id: "old_farmer",
  name: "Old Farmer",
  portraitKey: "old_farmer",
  visitDays: [1, 2, 4, 5, 6], // TU / WE / FR / SA / SU
  initialFavor: 0,
  // Preferences are intentionally left neutral until their design is defined.
  favoriteDishId: null,
  leastFavoriteDishId: null,
  preferredMealTags: [],
  dislikedMealTags: [],
  // Point 6 foundation: the initial trade roll is simply 0–24.
  tradePool: Array.from({ length: 25 }, (_, index) => index),
};

export const COACHMAN_PROFILE: GuestProfile = {
  id: "coachman",
  name: "Coachman",
  portraitKey: "coachman",
  // Base tier: WE / FR / SA. Higher favor adds one visit day per tier.
  visitDays: [2, 4, 5],
  favorTiers: [
    { minFavor: 0,  maxFavor: 24,  visitDays: [2, 4, 5],                transportDiscountPercent: 0 },
    { minFavor: 25, maxFavor: 49,  visitDays: [0, 2, 4, 5],             transportDiscountPercent: 10 },
    { minFavor: 50, maxFavor: 74,  visitDays: [0, 1, 2, 4, 5],          transportDiscountPercent: 20 },
    { minFavor: 75, maxFavor: 99,  visitDays: [0, 1, 2, 3, 4, 5],       transportDiscountPercent: 40 },
    { minFavor: 100, maxFavor: 100, visitDays: [0, 1, 2, 3, 4, 5, 6],   transportDiscountPercent: 60 },
  ],
  initialFavor: 0,
  // Reserved canonical IDs; the actual recipes/items can be added later.
  favoriteDishId: "beefstew", // Beef Stew
  leastFavoriteDishId: "snowberrysherbet", // Snowberry Sherbet
  preferredMealTags: [MEAL_TAG.HEARTY, MEAL_TAG.WARM],
  dislikedMealTags: [MEAL_TAG.COLD],
  // Coachman buys meals but does not trade items.
  tradePool: [],
};

export const GUEST_PROFILES: readonly GuestProfile[] = [OLD_FARMER_PROFILE, COACHMAN_PROFILE];

export const DEFAULT_GUEST_STATE: GuestState = {
  version: 1,
  calendarDaySerial: 0,
  calendarWeekday: 0,
  favors: {},
  activeGuestId: null,
  visitTrades: {},
};

function normalizeWeekday(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return ((Math.floor(value) % 7) + 7) % 7;
}

export function clampFavor(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.floor(value)));
}

function normalizeGuestState(raw: unknown): GuestState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_GUEST_STATE };
  const candidate = raw as Partial<GuestState>;

  const favors: Record<string, number> = {};
  if (candidate.favors && typeof candidate.favors === "object") {
    for (const [guestId, favor] of Object.entries(candidate.favors)) {
      favors[guestId] = clampFavor(Number(favor));
    }
  }

  const visitTrades: Record<string, GuestVisitTrade> = {};
  if (candidate.visitTrades && typeof candidate.visitTrades === "object") {
    for (const [guestId, trade] of Object.entries(candidate.visitTrades)) {
      if (!trade || typeof trade !== "object") continue;
      const t = trade as Partial<GuestVisitTrade>;
      const daySerial = Math.max(0, Math.floor(Number(t.daySerial) || 0));
      const offerRoll = Math.floor(Number(t.offerRoll));
      if (Number.isFinite(offerRoll)) visitTrades[guestId] = { daySerial, offerRoll };
    }
  }

  return {
    version: 1,
    calendarDaySerial: Math.max(0, Math.floor(Number(candidate.calendarDaySerial) || 0)),
    calendarWeekday: normalizeWeekday(Number(candidate.calendarWeekday) || 0),
    favors,
    activeGuestId: typeof candidate.activeGuestId === "string" ? candidate.activeGuestId as GuestId : null,
    visitTrades,
  };
}

export async function loadGuestState(): Promise<GuestState> {
  try {
    const raw = await AsyncStorage.getItem(GUEST_STATE_KEY);
    if (!raw) return { ...DEFAULT_GUEST_STATE };
    return normalizeGuestState(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_GUEST_STATE };
  }
}

export async function saveGuestState(state: GuestState): Promise<GuestState> {
  const normalized = normalizeGuestState(state);
  await AsyncStorage.setItem(GUEST_STATE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function getGuestFavorTier(profile: GuestProfile, favor: number): GuestFavorTier | null {
  if (!profile.favorTiers?.length) return null;
  const normalizedFavor = clampFavor(favor);
  return profile.favorTiers.find(
    (tier) => normalizedFavor >= tier.minFavor && normalizedFavor <= tier.maxFavor,
  ) ?? null;
}

export function getGuestVisitDays(profile: GuestProfile, favor: number): readonly number[] {
  return getGuestFavorTier(profile, favor)?.visitDays ?? profile.visitDays;
}

export function getGuestTransportDiscountPercent(profile: GuestProfile, favor: number): number {
  return Math.max(0, getGuestFavorTier(profile, favor)?.transportDiscountPercent ?? 0);
}

export function isGuestScheduled(
  profile: GuestProfile,
  dayIndex: number,
  favor: number = profile.initialFavor,
): boolean {
  return getGuestVisitDays(profile, favor).includes(normalizeWeekday(dayIndex));
}

function rollTradeOffer(profile: GuestProfile): number | null {
  if (profile.tradePool.length === 0) return null;
  const index = Math.floor(Math.random() * profile.tradePool.length);
  return profile.tradePool[index] ?? profile.tradePool[0] ?? null;
}

/**
 * Advance the guest calendar exactly once when the core game advances a day.
 * Call this from the existing sleep/day-transition flow before its snapshot.
 */
export async function advanceGuestCalendar(newDayIndex: number): Promise<GuestState> {
  const state = await loadGuestState();
  const next: GuestState = {
    ...state,
    calendarDaySerial: state.calendarDaySerial + 1,
    calendarWeekday: normalizeWeekday(newDayIndex),
    activeGuestId: null,
  };
  return saveGuestState(next);
}

/**
 * Backward-compatible sync for saves that predate the guest system. If the core
 * weekday differs, advance the guest serial once rather than rerolling on every mount.
 */
async function syncGuestCalendar(dayIndex: number): Promise<GuestState> {
  const weekday = normalizeWeekday(dayIndex);
  const state = await loadGuestState();
  if (state.calendarWeekday === weekday) return state;
  return saveGuestState({
    ...state,
    calendarDaySerial: state.calendarDaySerial + 1,
    calendarWeekday: weekday,
    activeGuestId: null,
  });
}

/**
 * Prepare today's scheduled guests. Guests with a trade pool receive one trade roll
 * for the current calendarDaySerial; reopening the room preserves that roll.
 */
export async function prepareGuestsForDay(dayIndex: number): Promise<GuestVisitView[]> {
  let state = await syncGuestCalendar(dayIndex);

  const favorFor = (profile: GuestProfile) => clampFavor(state.favors[profile.id] ?? profile.initialFavor);
  const scheduled = GUEST_PROFILES.filter((profile) => isGuestScheduled(profile, dayIndex, favorFor(profile)));
  let changed = false;

  const scheduledIds = new Set(scheduled.map((profile) => profile.id));
  if (state.activeGuestId && !scheduledIds.has(state.activeGuestId)) {
    state = { ...state, activeGuestId: null };
    changed = true;
  }

  const nextFavors = { ...state.favors };
  const nextTrades = { ...state.visitTrades };

  for (const profile of scheduled) {
    if (nextFavors[profile.id] === undefined) {
      nextFavors[profile.id] = clampFavor(profile.initialFavor);
      changed = true;
    }

    if (profile.tradePool.length === 0) {
      if (nextTrades[profile.id] !== undefined) {
        delete nextTrades[profile.id];
        changed = true;
      }
      continue;
    }

    const existingTrade = nextTrades[profile.id];
    if (!existingTrade || existingTrade.daySerial !== state.calendarDaySerial) {
      const offerRoll = rollTradeOffer(profile);
      if (offerRoll !== null) {
        nextTrades[profile.id] = {
          daySerial: state.calendarDaySerial,
          offerRoll,
        };
        changed = true;
      }
    }
  }

  if (changed) {
    state = await saveGuestState({ ...state, favors: nextFavors, visitTrades: nextTrades });
  }

  return scheduled.map((profile) => {
    const favor = clampFavor(state.favors[profile.id] ?? profile.initialFavor);
    return {
      profile,
      favor,
      tradeOfferRoll: profile.tradePool.length > 0
        ? state.visitTrades[profile.id]?.offerRoll ?? null
        : null,
      transportDiscountPercent: getGuestTransportDiscountPercent(profile, favor),
      selected: state.activeGuestId === profile.id,
    };
  });
}

export async function setActiveGuest(guestId: GuestId | null): Promise<GuestState> {
  const state = await loadGuestState();
  return saveGuestState({ ...state, activeGuestId: guestId });
}

export async function setGuestFavor(guestId: GuestId, favor: number): Promise<GuestState> {
  const state = await loadGuestState();
  return saveGuestState({
    ...state,
    favors: { ...state.favors, [guestId]: clampFavor(favor) },
  });
}

export async function addGuestFavor(guestId: GuestId, amount: number): Promise<GuestState> {
  const state = await loadGuestState();
  const profile = GUEST_PROFILES.find((entry) => entry.id === guestId);
  const current = state.favors[guestId] ?? profile?.initialFavor ?? 0;
  return setGuestFavor(guestId, current + amount);
}
