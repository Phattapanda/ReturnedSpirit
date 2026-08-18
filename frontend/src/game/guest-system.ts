import AsyncStorage from "@react-native-async-storage/async-storage";

import type { MealTag } from "@/src/game/item-system";

export const GUEST_STATE_KEY = "@game:guest_state";

export type GuestId = "old_farmer" | (string & {});

export type GuestProfile = {
  id: GuestId;
  name: string;
  portraitKey: string;
  /** Weekday indices use the existing game convention: MO=0 ... SU=6. */
  visitDays: readonly number[];
  initialFavor: number;
  favoriteDishId: string | null;
  leastFavoriteDishId: string | null;
  preferredMealTags: readonly MealTag[];
  dislikedMealTags: readonly MealTag[];
  /** Foundation-only offer pool. Values can later map to concrete trade offers. */
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
  tradeOfferRoll: number;
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

export const GUEST_PROFILES: readonly GuestProfile[] = [OLD_FARMER_PROFILE];

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

export function isGuestScheduled(profile: GuestProfile, dayIndex: number): boolean {
  return profile.visitDays.includes(normalizeWeekday(dayIndex));
}

function rollTradeOffer(profile: GuestProfile): number {
  if (profile.tradePool.length === 0) return 0;
  const index = Math.floor(Math.random() * profile.tradePool.length);
  return profile.tradePool[index] ?? profile.tradePool[0] ?? 0;
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
 * Prepare today's scheduled guests. Each guest receives one trade roll for the
 * current calendarDaySerial; reopening the room or reloading preserves that roll.
 */
export async function prepareGuestsForDay(dayIndex: number): Promise<GuestVisitView[]> {
  let state = await syncGuestCalendar(dayIndex);
  const scheduled = GUEST_PROFILES.filter((profile) => isGuestScheduled(profile, dayIndex));
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

    const existingTrade = nextTrades[profile.id];
    if (!existingTrade || existingTrade.daySerial !== state.calendarDaySerial) {
      nextTrades[profile.id] = {
        daySerial: state.calendarDaySerial,
        offerRoll: rollTradeOffer(profile),
      };
      changed = true;
    }
  }

  if (changed) {
    state = await saveGuestState({ ...state, favors: nextFavors, visitTrades: nextTrades });
  }

  return scheduled.map((profile) => ({
    profile,
    favor: clampFavor(state.favors[profile.id] ?? profile.initialFavor),
    tradeOfferRoll: state.visitTrades[profile.id]?.offerRoll ?? 0,
    selected: state.activeGuestId === profile.id,
  }));
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
