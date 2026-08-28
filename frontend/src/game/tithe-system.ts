import AsyncStorage from "@react-native-async-storage/async-storage";

import { spendCurrencyCopper } from "@/src/game/currency-system";

export const ELAPSED_DAYS_KEY = "@game:elapsed_days";
export const TITHE_STATE_KEY = "@game:civil_servant_tithe";
export const NEXT_RUN_INTRO_PENDING_KEY = "@game:pending_next_run_intro";

export type TitheEventPhase =
  | "idle"
  | "awaiting_kitchen"
  | "kitchen_dialog"
  | "awaiting_dining"
  | "in_dining"
  | "bad_ending";

export type TitheState = {
  version: 1;
  phase: TitheEventPhase;
  harvestDays: number[];
  deferredDebtCopper: number;
  currentEventDay: number | null;
  currentHarvestCount: number;
  currentChargeCopper: number;
  currentHadDeferredDebt: boolean;
  lastCompletedEventDay: number | null;
};

export const DEFAULT_TITHE_STATE: TitheState = {
  version: 1,
  phase: "idle",
  harvestDays: [],
  deferredDebtCopper: 0,
  currentEventDay: null,
  currentHarvestCount: 0,
  currentChargeCopper: 0,
  currentHadDeferredDebt: false,
  lastCompletedEventDay: null,
};

const PHASES = new Set<TitheEventPhase>([
  "idle",
  "awaiting_kitchen",
  "kitchen_dialog",
  "awaiting_dining",
  "in_dining",
  "bad_ending",
]);

function wholeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

export function normalizeTitheState(raw: unknown): TitheState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_TITHE_STATE };
  const candidate = raw as Partial<TitheState>;
  const eventDay = candidate.currentEventDay === null || candidate.currentEventDay === undefined
    ? null
    : wholeNumber(candidate.currentEventDay);
  const completedDay = candidate.lastCompletedEventDay === null || candidate.lastCompletedEventDay === undefined
    ? null
    : wholeNumber(candidate.lastCompletedEventDay);
  return {
    version: 1,
    phase: PHASES.has(candidate.phase as TitheEventPhase)
      ? candidate.phase as TitheEventPhase
      : "idle",
    harvestDays: Array.isArray(candidate.harvestDays)
      ? candidate.harvestDays.map((day) => wholeNumber(day)).filter((day) => day >= 0)
      : [],
    deferredDebtCopper: wholeNumber(candidate.deferredDebtCopper),
    currentEventDay: eventDay,
    currentHarvestCount: wholeNumber(candidate.currentHarvestCount),
    currentChargeCopper: wholeNumber(candidate.currentChargeCopper),
    currentHadDeferredDebt: candidate.currentHadDeferredDebt === true,
    lastCompletedEventDay: completedDay,
  };
}

export async function loadElapsedDays(): Promise<number> {
  const raw = await AsyncStorage.getItem(ELAPSED_DAYS_KEY);
  return wholeNumber(raw);
}

export async function loadTitheState(): Promise<TitheState> {
  try {
    const raw = await AsyncStorage.getItem(TITHE_STATE_KEY);
    return normalizeTitheState(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_TITHE_STATE };
  }
}

export async function saveTitheState(state: TitheState): Promise<TitheState> {
  const normalized = normalizeTitheState(state);
  await AsyncStorage.setItem(TITHE_STATE_KEY, JSON.stringify(normalized));
  return normalized;
}

let titheWriteQueue: Promise<unknown> = Promise.resolve();

/** Records one successful harvest action. The queue prevents simultaneous plots losing an entry. */
export function recordTitheHarvest(): Promise<TitheState> {
  const task = titheWriteQueue.then(async () => {
    const [elapsedDay, state] = await Promise.all([loadElapsedDays(), loadTitheState()]);
    return saveTitheState({ ...state, harvestDays: [...state.harvestDays, elapsedDay] });
  });
  titheWriteQueue = task.catch(() => undefined);
  return task;
}

/** Every 14 elapsed days (always Monday), prepare a mandatory Civil Servant event. */
export async function prepareTitheForDay(elapsedDay: number): Promise<TitheState> {
  const state = await loadTitheState();
  if (
    elapsedDay <= 0 ||
    elapsedDay % 14 !== 0 ||
    state.lastCompletedEventDay === elapsedDay ||
    state.currentEventDay === elapsedDay
  ) return state;

  const windowStart = elapsedDay - 14;
  const harvestCount = state.harvestDays.filter((day) => day > windowStart && day <= elapsedDay).length;
  const hadDebt = state.deferredDebtCopper > 0;
  return saveTitheState({
    ...state,
    phase: "awaiting_kitchen",
    currentEventDay: elapsedDay,
    currentHarvestCount: harvestCount,
    currentChargeCopper: harvestCount * 10 + state.deferredDebtCopper,
    currentHadDeferredDebt: hadDebt,
  });
}

export async function setTithePhase(phase: TitheEventPhase): Promise<TitheState> {
  const state = await loadTitheState();
  return saveTitheState({ ...state, phase });
}

function completeEvent(state: TitheState, deferredDebtCopper: number): TitheState {
  const eventDay = state.currentEventDay;
  return {
    ...state,
    phase: "idle",
    harvestDays: eventDay === null ? state.harvestDays : state.harvestDays.filter((day) => day > eventDay),
    deferredDebtCopper,
    lastCompletedEventDay: eventDay,
    currentEventDay: null,
    currentHarvestCount: 0,
    currentChargeCopper: 0,
    currentHadDeferredDebt: false,
  };
}

export type TitheResolution = "paid" | "deferred" | "death";

export async function resolveCurrentTithe(): Promise<{ state: TitheState; resolution: TitheResolution }> {
  const state = await loadTitheState();
  const remaining = await spendCurrencyCopper(state.currentChargeCopper);
  if (remaining !== null) {
    const completed = await saveTitheState(completeEvent(state, 0));
    return { state: completed, resolution: "paid" };
  }
  if (!state.currentHadDeferredDebt) {
    const completed = await saveTitheState(completeEvent(state, state.currentChargeCopper));
    return { state: completed, resolution: "deferred" };
  }
  const failed = await saveTitheState({ ...state, phase: "bad_ending" });
  return { state: failed, resolution: "death" };
}

export function formatHarvestCount(count: number): string {
  const words = [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
  ];
  return words[count] ?? String(count);
}
