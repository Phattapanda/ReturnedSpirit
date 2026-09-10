import AsyncStorage from "@react-native-async-storage/async-storage";

import { loadCurrencyCopper, saveCurrencyCopper } from "@/src/game/currency-system";
import { addGuestFavor, loadGuestState } from "@/src/game/guest-system";
import {
  ITEM_ATTRIBUTE,
  ITEM_CATALOG,
  KITCHEN_TABLE_KEY,
  PLAYER_BAG_KEY,
  normalizeBagItem,
  normalizePlayerBagData,
  planAddToBag,
  type BagItem,
  type PlayerBagData,
} from "@/src/game/item-system";

export const COACHMAN_ESCORT_KEY = "@tutorial:coachman_escort";
export const ESCORT_WEAPON_ID = "weapon_iron_shortsword";
export const ESCORT_ARMOR_ID = "armor_leather_armor";

export type CoachmanEscortPhase = "locked" | "rupert_warned" | "offer_pending" | "accepted" | "declined" | "declined_final" | "journey" | "combat" | "post_combat" | "city_arrival" | "city_exploration" | "complete";

export type CoachmanEscortState = {
  version: 1;
  phase: CoachmanEscortPhase;
  equipmentPending: boolean;
  bonusCopperAccepted: boolean;
  guildIntroductionSeen: boolean;
  walkingArrivalGuardSeen: boolean;
  declinedDaySerial: number | null;
};

export const DEFAULT_COACHMAN_ESCORT_STATE: CoachmanEscortState = {
  version: 1,
  phase: "locked",
  equipmentPending: false,
  bonusCopperAccepted: false,
  guildIntroductionSeen: false,
  walkingArrivalGuardSeen: false,
  declinedDaySerial: null,
};

function normalizeState(raw: unknown): CoachmanEscortState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_COACHMAN_ESCORT_STATE };
  const candidate = raw as Partial<CoachmanEscortState>;
  const phases = new Set<CoachmanEscortPhase>(["locked", "rupert_warned", "offer_pending", "accepted", "declined", "declined_final", "journey", "combat", "post_combat", "city_arrival", "city_exploration", "complete"]);
  const guildIntroductionSeen = candidate.guildIntroductionSeen === true;
  const storedPhase = phases.has(candidate.phase as CoachmanEscortPhase) ? candidate.phase as CoachmanEscortPhase : "locked";
  return {
    version: 1,
    // Completing the Guild introduction is the terminal step of this tutorial.
    // Keep old saves from being trapped if a later city walk overwrote the phase.
    phase: guildIntroductionSeen ? "complete" : storedPhase,
    equipmentPending: candidate.equipmentPending === true,
    bonusCopperAccepted: candidate.bonusCopperAccepted === true,
    guildIntroductionSeen,
    walkingArrivalGuardSeen: candidate.walkingArrivalGuardSeen === true,
    declinedDaySerial: Number.isFinite(candidate.declinedDaySerial) ? Math.max(0, Math.floor(candidate.declinedDaySerial!)) : null,
  };
}

export async function loadCoachmanEscortState(): Promise<CoachmanEscortState> {
  const raw = await AsyncStorage.getItem(COACHMAN_ESCORT_KEY);
  const parsed = raw ? JSON.parse(raw) : null;
  const normalized = normalizeState(parsed);
  if (raw && (parsed as Partial<CoachmanEscortState>)?.phase !== normalized.phase) {
    await AsyncStorage.setItem(COACHMAN_ESCORT_KEY, JSON.stringify(normalized));
  }
  return normalized;
}

/** Whether the one-time Wild Wolf encounter on the road to the city is over. */
export function hasCompletedCityRoadEncounter(state: CoachmanEscortState): boolean {
  return state.guildIntroductionSeen || ["post_combat", "city_arrival", "city_exploration", "complete"].includes(state.phase);
}

export async function saveCoachmanEscortState(state: CoachmanEscortState): Promise<CoachmanEscortState> {
  const normalized = normalizeState(state);
  await AsyncStorage.setItem(COACHMAN_ESCORT_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function getCalendarDayNumber(): Promise<number> {
  const guestState = await loadGuestState();
  return guestState.calendarDaySerial + 1;
}

export async function markRupertMonsterWarningSeen(): Promise<CoachmanEscortState> {
  const state = await loadCoachmanEscortState();
  if (state.phase !== "locked") return state;
  return saveCoachmanEscortState({ ...state, phase: "rupert_warned" });
}

export async function markCoachmanOfferStarted(): Promise<CoachmanEscortState> {
  const state = await loadCoachmanEscortState();
  if (state.phase === "accepted" || state.phase === "declined" || state.phase === "city_arrival" || state.phase === "city_exploration" || state.phase === "complete") return state;
  return saveCoachmanEscortState({ ...state, phase: "offer_pending" });
}

function equipmentItem(id: typeof ESCORT_WEAPON_ID | typeof ESCORT_ARMOR_ID): BagItem {
  const entry = ITEM_CATALOG[id];
  return {
    id,
    itemType: id,
    name: entry.name,
    quantity: 1,
    attributes: [...entry.attributes],
    durability: entry.maxDurability,
    maxDurability: entry.maxDurability,
  };
}

async function deliverEquipmentToKitchen(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(KITCHEN_TABLE_KEY);
  const parsed = raw ? JSON.parse(raw) as (BagItem | null)[] : [];
  const table = Array.from({ length: Math.max(12, parsed.length) }, (_, index) => normalizeBagItem(parsed[index] ?? null));
  const equipmentIds = [ESCORT_WEAPON_ID, ESCORT_ARMOR_ID] as const;
  const missing = equipmentIds.filter((id) => !table.some((item) => item?.id === id));
  const free = table.reduce<number[]>((indices, item, index) => { if (!item) indices.push(index); return indices; }, []);
  if (free.length < missing.length) return false;
  missing.forEach((id, index) => { table[free[index]] = equipmentItem(id); });
  await AsyncStorage.setItem(KITCHEN_TABLE_KEY, JSON.stringify(table));
  return true;
}

export async function acceptCoachmanEscort(withCopperBonus: boolean): Promise<CoachmanEscortState> {
  const state = await loadCoachmanEscortState();
  if (state.phase === "accepted" || state.phase === "journey" || state.phase === "combat" || state.phase === "post_combat" || state.phase === "city_arrival" || state.phase === "city_exploration" || state.phase === "complete") return state;
  if (!withCopperBonus) await addGuestFavor("coachman", 10);
  if (withCopperBonus) await saveCurrencyCopper((await loadCurrencyCopper()) + 50);
  const delivered = await deliverEquipmentToKitchen();
  return saveCoachmanEscortState({ ...state, phase: "accepted", equipmentPending: !delivered, bonusCopperAccepted: withCopperBonus });
}

export async function declineCoachmanEscort(): Promise<CoachmanEscortState> {
  const [state, guestState] = await Promise.all([loadCoachmanEscortState(), loadGuestState()]);
  return saveCoachmanEscortState({ ...state, phase: "declined", declinedDaySerial: guestState.calendarDaySerial });
}

export type EscortPreparationResult = "ready" | "equipment_in_kitchen" | "bag_full";

export async function prepareCoachmanEscortDeparture(): Promise<EscortPreparationResult> {
  const [rawBag, rawTable, state] = await Promise.all([
    AsyncStorage.getItem(PLAYER_BAG_KEY),
    AsyncStorage.getItem(KITCHEN_TABLE_KEY),
    loadCoachmanEscortState(),
  ]);
  let bag = normalizePlayerBagData(rawBag ? JSON.parse(rawBag) : {});
  const table = rawTable ? (JSON.parse(rawTable) as (BagItem | null)[]).map(normalizeBagItem) : [];
  const ids = [ESCORT_WEAPON_ID, ESCORT_ARMOR_ID] as const;
  if (ids.every((id) => bag.slots.some((item) => item?.id === id))) {
    await saveCoachmanEscortState({ ...state, phase: "journey", equipmentPending: false });
    return "ready";
  }
  if (ids.some((id) => table.some((item) => item?.id === id) && !bag.slots.some((item) => item?.id === id))) return "equipment_in_kitchen";

  for (const id of ids) {
    if (bag.slots.some((item) => item?.id === id)) continue;
    const plan = planAddToBag(equipmentItem(id), bag);
    if (!plan.canTransfer || plan.remainderQty > 0) return "bag_full";
    bag = { ...bag, slots: plan.updatedSlots };
  }
  await AsyncStorage.multiSet([
    [PLAYER_BAG_KEY, JSON.stringify(bag)],
    [COACHMAN_ESCORT_KEY, JSON.stringify({ ...state, phase: "journey", equipmentPending: false })],
  ]);
  return "ready";
}

export async function setCoachmanEscortPhase(phase: CoachmanEscortPhase): Promise<CoachmanEscortState> {
  const state = await loadCoachmanEscortState();
  return saveCoachmanEscortState({ ...state, phase });
}

export async function reconsiderCoachmanEscort(): Promise<CoachmanEscortState> {
  const state = await loadCoachmanEscortState();
  if (state.phase !== "declined") return state;
  await addGuestFavor("coachman", 5);
  const delivered = await deliverEquipmentToKitchen();
  return saveCoachmanEscortState({ ...state, phase: "accepted", equipmentPending: !delivered, bonusCopperAccepted: false });
}

export async function finalizeCoachmanEscortDecline(): Promise<CoachmanEscortState> {
  const state = await loadCoachmanEscortState();
  if (state.phase !== "declined") return state;
  return saveCoachmanEscortState({ ...state, phase: "declined_final" });
}

export async function markGuildIntroductionSeen(): Promise<CoachmanEscortState> {
  const state = await loadCoachmanEscortState();
  if (state.guildIntroductionSeen) return state;
  return saveCoachmanEscortState({ ...state, guildIntroductionSeen: true });
}

export async function markWalkingArrivalGuardSeen(): Promise<CoachmanEscortState> {
  const state = await loadCoachmanEscortState();
  if (state.walkingArrivalGuardSeen) return state;
  return saveCoachmanEscortState({ ...state, walkingArrivalGuardSeen: true });
}

export function bagHasEscortEquipment(bag: PlayerBagData): boolean {
  return bag.slots.some((item) => item?.id === ESCORT_WEAPON_ID)
    && bag.slots.some((item) => item?.id === ESCORT_ARMOR_ID);
}

export const ESCORT_EQUIPMENT_ATTRIBUTES = [ITEM_ATTRIBUTE.WEAPON, ITEM_ATTRIBUTE.ARMOR] as const;
