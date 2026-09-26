import AsyncStorage from "@react-native-async-storage/async-storage";

import { audioEngine } from "@/src/audio/audioEngine";
import { CURRENCY_KEY, COPPER_PER_SILVER, addIncomeCopper, loadCurrencyCopper, notifyCurrencyChanged } from "@/src/game/currency-system";
import { loadGuestState } from "@/src/game/guest-system";
import { SHARED_RESOURCES_KEY, SHARED_RESOURCE_DEFAULTS, type SharedResources } from "@/src/game/shared-resources";
import { DEFAULT_BAG, PLAYER_BAG_KEY, normalizePlayerBagData, removeBagItem, type PlayerBagData } from "@/src/game/item-system";

export const GUEST_ROOM_STATE_KEY = "@tavern:guest_rooms";
export const GUEST_ROOM_DAILY_INCOME_COPPER = 10;
export const GOOD_GUEST_ROOM_DAILY_INCOME_COPPER = 20;
export const GUEST_ROOM_MAX_STORED_DAYS = 10;
export const GUEST_ROOM_UPGRADE_ITEM_ID = "elder_ember_comb";
export const GUEST_ROOM_UPGRADE_CONSTRUCTION_DAYS = 2;
export const GUEST_ROOM_REQUIREMENTS = {
  nails: 10,
  wood: 15,
  stone: 15,
  paint: 2,
  cloth: 5,
  copper: 3 * COPPER_PER_SILVER,
  constructionDays: 3,
} as const;

export type GuestRoomPhase = "locked" | "available" | "building" | "complete";
export type GuestRoomUpgradePhase = "locked" | "available" | "quest_active" | "building" | "complete";
export type GuestRoomState = {
  version: 2;
  phase: GuestRoomPhase;
  orderPlacedDaySerial: number | null;
  completionDaySerial: number | null;
  lastIncomeDaySerial: number | null;
  storedIncomeDays: number;
  storedIncomeCopper: number;
  roomLevel: 1 | 2;
  upgradePhase: GuestRoomUpgradePhase;
  upgradeCompletionDaySerial: number | null;
};

export const DEFAULT_GUEST_ROOM_STATE: GuestRoomState = {
  version: 2,
  phase: "locked",
  orderPlacedDaySerial: null,
  completionDaySerial: null,
  lastIncomeDaySerial: null,
  storedIncomeDays: 0,
  storedIncomeCopper: 0,
  roomLevel: 1,
  upgradePhase: "locked",
  upgradeCompletionDaySerial: null,
};

const listeners = new Set<(state: GuestRoomState) => void>();

function normalizeDay(value: unknown): number | null {
  return Number.isFinite(value) ? Math.max(0, Math.floor(Number(value))) : null;
}

function normalizeState(raw: unknown): GuestRoomState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_GUEST_ROOM_STATE };
  const value = raw as Partial<GuestRoomState>;
  const phases: GuestRoomPhase[] = ["locked", "available", "building", "complete"];
  const upgradePhases: GuestRoomUpgradePhase[] = ["locked", "available", "quest_active", "building", "complete"];
  const phase = phases.includes(value.phase as GuestRoomPhase) ? value.phase as GuestRoomPhase : "locked";
  const storedIncomeDays = Math.min(GUEST_ROOM_MAX_STORED_DAYS, Math.max(0, Math.floor(Number(value.storedIncomeDays) || 0)));
  const roomLevel = value.roomLevel === 2 ? 2 : 1;
  return {
    version: 2,
    phase,
    orderPlacedDaySerial: normalizeDay(value.orderPlacedDaySerial),
    completionDaySerial: normalizeDay(value.completionDaySerial),
    lastIncomeDaySerial: normalizeDay(value.lastIncomeDaySerial),
    storedIncomeDays,
    storedIncomeCopper: Math.max(0, Math.floor(Number(value.storedIncomeCopper) || storedIncomeDays * (roomLevel === 2 ? GOOD_GUEST_ROOM_DAILY_INCOME_COPPER : GUEST_ROOM_DAILY_INCOME_COPPER))),
    roomLevel,
    upgradePhase: upgradePhases.includes(value.upgradePhase as GuestRoomUpgradePhase)
      ? value.upgradePhase as GuestRoomUpgradePhase
      : phase === "complete" ? "available" : "locked",
    upgradeCompletionDaySerial: normalizeDay(value.upgradeCompletionDaySerial),
  };
}

async function saveState(state: GuestRoomState): Promise<GuestRoomState> {
  const normalized = normalizeState(state);
  await AsyncStorage.setItem(GUEST_ROOM_STATE_KEY, JSON.stringify(normalized));
  listeners.forEach((listener) => listener(normalized));
  return normalized;
}

export async function loadGuestRoomState(): Promise<GuestRoomState> {
  const raw = await AsyncStorage.getItem(GUEST_ROOM_STATE_KEY);
  try { return normalizeState(raw ? JSON.parse(raw) : null); }
  catch { return { ...DEFAULT_GUEST_ROOM_STATE }; }
}

export function subscribeGuestRoomState(listener: (state: GuestRoomState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function unlockGuestRoomOffer(): Promise<GuestRoomState> {
  const state = await loadGuestRoomState();
  return state.phase === "locked" ? saveState({ ...state, phase: "available" }) : state;
}

export type GuestRoomOrderAvailability = {
  resources: SharedResources;
  currencyCopper: number;
  canPlace: boolean;
};

export async function loadGuestRoomOrderAvailability(): Promise<GuestRoomOrderAvailability> {
  const [rawResources, currencyCopper] = await Promise.all([
    AsyncStorage.getItem(SHARED_RESOURCES_KEY),
    loadCurrencyCopper(),
  ]);
  let parsed: Partial<SharedResources> = {};
  try { parsed = rawResources ? JSON.parse(rawResources) as Partial<SharedResources> : {}; }
  catch { parsed = {}; }
  const resources = { ...SHARED_RESOURCE_DEFAULTS, ...parsed };
  const canPlace = resources.nails >= GUEST_ROOM_REQUIREMENTS.nails
    && resources.wood >= GUEST_ROOM_REQUIREMENTS.wood
    && resources.stone >= GUEST_ROOM_REQUIREMENTS.stone
    && resources.paint >= GUEST_ROOM_REQUIREMENTS.paint
    && resources.cloth >= GUEST_ROOM_REQUIREMENTS.cloth
    && currencyCopper >= GUEST_ROOM_REQUIREMENTS.copper;
  return { resources, currencyCopper, canPlace };
}

export async function placeGuestRoomOrder(): Promise<{
  ok: boolean;
  state: GuestRoomState;
  availability: GuestRoomOrderAvailability;
}> {
  const [state, availability, guestState] = await Promise.all([
    loadGuestRoomState(),
    loadGuestRoomOrderAvailability(),
    loadGuestState(),
  ]);
  if (state.phase !== "available" || !availability.canPlace) return { ok: false, state, availability };
  const resources: SharedResources = {
    ...availability.resources,
    nails: availability.resources.nails - GUEST_ROOM_REQUIREMENTS.nails,
    wood: availability.resources.wood - GUEST_ROOM_REQUIREMENTS.wood,
    stone: availability.resources.stone - GUEST_ROOM_REQUIREMENTS.stone,
    paint: availability.resources.paint - GUEST_ROOM_REQUIREMENTS.paint,
    cloth: availability.resources.cloth - GUEST_ROOM_REQUIREMENTS.cloth,
  };
  const next: GuestRoomState = {
    version: 2,
    phase: "building",
    orderPlacedDaySerial: guestState.calendarDaySerial,
    completionDaySerial: guestState.calendarDaySerial + GUEST_ROOM_REQUIREMENTS.constructionDays,
    lastIncomeDaySerial: null,
    storedIncomeDays: 0,
    storedIncomeCopper: 0,
    roomLevel: 1,
    upgradePhase: "locked",
    upgradeCompletionDaySerial: null,
  };
  const currencyCopper = availability.currencyCopper - GUEST_ROOM_REQUIREMENTS.copper;
  await AsyncStorage.multiSet([
    [SHARED_RESOURCES_KEY, JSON.stringify(resources)],
    [CURRENCY_KEY, String(currencyCopper)],
    [GUEST_ROOM_STATE_KEY, JSON.stringify(next)],
  ]);
  notifyCurrencyChanged(currencyCopper);
  listeners.forEach((listener) => listener(next));
  audioEngine.playSoundEffect("losemoney", { maxDurationMs: 2200 });
  return { ok: true, state: next, availability: { resources, currencyCopper, canPlace: false } };
}

/** Completes construction and accrues rent once for every elapsed calendar day. */
export async function advanceGuestRoomState(daySerial: number): Promise<GuestRoomState> {
  const safeDay = Math.max(0, Math.floor(daySerial));
  const state = await loadGuestRoomState();
  if (state.phase === "building") {
    const completionDay = state.completionDaySerial;
    if (completionDay === null || safeDay < completionDay) return state;
    return saveState({
      ...state,
      phase: "complete",
      lastIncomeDaySerial: safeDay,
      storedIncomeDays: Math.min(GUEST_ROOM_MAX_STORED_DAYS, Math.max(0, safeDay - completionDay)),
      storedIncomeCopper: Math.min(GUEST_ROOM_MAX_STORED_DAYS, Math.max(0, safeDay - completionDay)) * GUEST_ROOM_DAILY_INCOME_COPPER,
      upgradePhase: "available",
    });
  }
  if (state.phase !== "complete") return state;

  if (state.upgradePhase === "building") {
    const completionDay = state.upgradeCompletionDaySerial;
    if (completionDay === null || safeDay < completionDay) return state;
    const addedDays = Math.min(GUEST_ROOM_MAX_STORED_DAYS - state.storedIncomeDays, Math.max(0, safeDay - completionDay));
    return saveState({
      ...state,
      roomLevel: 2,
      upgradePhase: "complete",
      upgradeCompletionDaySerial: completionDay,
      lastIncomeDaySerial: safeDay,
      storedIncomeDays: state.storedIncomeDays + addedDays,
      storedIncomeCopper: state.storedIncomeCopper + addedDays * GOOD_GUEST_ROOM_DAILY_INCOME_COPPER,
    });
  }
  const lastDay = state.lastIncomeDaySerial ?? safeDay;
  if (safeDay <= lastDay) return state;
  const addedDays = Math.min(GUEST_ROOM_MAX_STORED_DAYS - state.storedIncomeDays, safeDay - lastDay);
  const dailyIncome = getGuestRoomDailyIncome(state);
  return saveState({
    ...state,
    lastIncomeDaySerial: safeDay,
    storedIncomeDays: state.storedIncomeDays + addedDays,
    storedIncomeCopper: state.storedIncomeCopper + addedDays * dailyIncome,
  });
}

export function getGuestRoomStoredIncome(state: GuestRoomState): number {
  return state.storedIncomeCopper;
}

export function getGuestRoomDailyIncome(state: GuestRoomState): number {
  return state.roomLevel === 2 ? GOOD_GUEST_ROOM_DAILY_INCOME_COPPER : GUEST_ROOM_DAILY_INCOME_COPPER;
}

export function isGuestRoomIncomeFull(state: GuestRoomState): boolean {
  return state.phase === "complete" && state.storedIncomeDays >= GUEST_ROOM_MAX_STORED_DAYS;
}

export async function collectGuestRoomIncome(): Promise<{
  ok: boolean;
  collectedCopper: number;
  state: GuestRoomState;
}> {
  const guestState = await loadGuestState();
  const advanced = await advanceGuestRoomState(guestState.calendarDaySerial);
  const collectedCopper = getGuestRoomStoredIncome(advanced);
  if (advanced.phase !== "complete" || collectedCopper <= 0) return { ok: false, collectedCopper: 0, state: advanced };
  const state = await saveState({ ...advanced, storedIncomeDays: 0, storedIncomeCopper: 0 });
  const before = await loadCurrencyCopper();
  const after = await addIncomeCopper(collectedCopper);
  return { ok: true, collectedCopper: after - before, state };
}

export async function acceptGuestRoomUpgradeQuest(): Promise<GuestRoomState> {
  const state = await loadGuestRoomState();
  if (state.phase !== "complete" || state.upgradePhase !== "available") return state;
  return saveState({ ...state, upgradePhase: "quest_active" });
}

export function hasGuestRoomUpgradeItem(bag: PlayerBagData): boolean {
  return bag.slots.some((item) => item?.id === GUEST_ROOM_UPGRADE_ITEM_ID && item.quantity > 0);
}

export async function turnInGuestRoomUpgradeItem(): Promise<{ ok: boolean; state: GuestRoomState; bag: PlayerBagData }> {
  const [state, rawBag, guestState] = await Promise.all([
    loadGuestRoomState(),
    AsyncStorage.getItem(PLAYER_BAG_KEY),
    loadGuestState(),
  ]);
  let bag = { ...DEFAULT_BAG, slots: [...DEFAULT_BAG.slots] };
  try { if (rawBag) bag = normalizePlayerBagData(JSON.parse(rawBag)); } catch { /* use an empty normalized bag */ }
  const slotIndex = bag.slots.findIndex((item) => item?.id === GUEST_ROOM_UPGRADE_ITEM_ID && item.quantity > 0);
  if (state.phase !== "complete" || state.upgradePhase !== "quest_active" || slotIndex < 0) return { ok: false, state, bag };

  const nextBag = removeBagItem(bag, slotIndex, 1);
  const next = normalizeState({
    ...state,
    upgradePhase: "building",
    upgradeCompletionDaySerial: guestState.calendarDaySerial + GUEST_ROOM_UPGRADE_CONSTRUCTION_DAYS,
    lastIncomeDaySerial: guestState.calendarDaySerial,
  });
  await AsyncStorage.multiSet([
    [PLAYER_BAG_KEY, JSON.stringify(nextBag)],
    [GUEST_ROOM_STATE_KEY, JSON.stringify(next)],
  ]);
  listeners.forEach((listener) => listener(next));
  return { ok: true, state: next, bag: nextBag };
}
