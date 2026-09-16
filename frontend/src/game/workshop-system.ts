import AsyncStorage from "@react-native-async-storage/async-storage";

import { CURRENCY_KEY, COPPER_PER_SILVER, loadCurrencyCopper, notifyCurrencyChanged } from "@/src/game/currency-system";
import { RUPERT_MORTAR_RECIPE_DIALOG_SEEN_KEY } from "@/src/game/cooking-system";
import { loadGuestState } from "@/src/game/guest-system";
import { deliverMailboxMessage } from "@/src/game/mailbox-system";
import { SHARED_RESOURCES_KEY, SHARED_RESOURCE_DEFAULTS, type SharedResources } from "@/src/game/shared-resources";
import type { BagItem } from "@/src/game/item-system";

export const WORKSHOP_STATE_KEY = "@workshop:state";
export const WORKSHOP_STORAGE_KEY = "@workshop:storage";
export const WORKSHOP_CRAFT_INGREDIENTS_KEY = "@workshop:craft_ingredients";
export const WORKSHOP_CRAFT_TOOL_KEY = "@workshop:craft_tool";
export const WORKSHOP_CRAFT_RESULT_KEY = "@workshop:craft_result";

export type WorkshopPhase = "locked" | "available" | "quoted" | "building" | "complete";
export type WorkshopState = { version: 1; phase: WorkshopPhase; orderPlacedDaySerial: number | null; completionDaySerial: number | null };
export const DEFAULT_WORKSHOP_STATE: WorkshopState = { version: 1, phase: "locked", orderPlacedDaySerial: null, completionDaySerial: null };
export const WORKSHOP_REQUIREMENTS = { wood: 50, stone: 20, nails: 25, copper: 20 * COPPER_PER_SILVER } as const;

function normalizeState(raw: unknown): WorkshopState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_WORKSHOP_STATE };
  const value = raw as Partial<WorkshopState>;
  const phases: WorkshopPhase[] = ["locked", "available", "quoted", "building", "complete"];
  return {
    version: 1,
    phase: phases.includes(value.phase as WorkshopPhase) ? value.phase as WorkshopPhase : "locked",
    orderPlacedDaySerial: Number.isFinite(value.orderPlacedDaySerial) ? Math.max(0, Math.floor(value.orderPlacedDaySerial!)) : null,
    completionDaySerial: Number.isFinite(value.completionDaySerial) ? Math.max(0, Math.floor(value.completionDaySerial!)) : null,
  };
}

export async function loadWorkshopState(): Promise<WorkshopState> {
  const [raw, mortarDialogSeen] = await Promise.all([
    AsyncStorage.getItem(WORKSHOP_STATE_KEY),
    AsyncStorage.getItem(RUPERT_MORTAR_RECIPE_DIALOG_SEEN_KEY),
  ]);
  const state = normalizeState(raw ? JSON.parse(raw) : null);
  if (state.phase === "locked" && mortarDialogSeen === "true") {
    const migrated = { ...state, phase: "available" as const };
    await AsyncStorage.setItem(WORKSHOP_STATE_KEY, JSON.stringify(migrated));
    return migrated;
  }
  return state;
}

export async function unlockWorkshopOfferAfterRupertDialogue(): Promise<WorkshopState> {
  const state = await loadWorkshopState();
  if (state.phase !== "locked") return state;
  const next = { ...state, phase: "available" as const };
  await AsyncStorage.setItem(WORKSHOP_STATE_KEY, JSON.stringify(next));
  return next;
}

export async function markWorkshopQuoteSeen(): Promise<WorkshopState> {
  const state = await loadWorkshopState();
  if (state.phase !== "available") return state;
  const next = { ...state, phase: "quoted" as const };
  await AsyncStorage.setItem(WORKSHOP_STATE_KEY, JSON.stringify(next));
  return next;
}

export type WorkshopOrderAvailability = { resources: SharedResources; currencyCopper: number; canPlace: boolean };
export async function loadWorkshopOrderAvailability(): Promise<WorkshopOrderAvailability> {
  const [rawResources, currencyCopper] = await Promise.all([AsyncStorage.getItem(SHARED_RESOURCES_KEY), loadCurrencyCopper()]);
  const parsed = rawResources ? JSON.parse(rawResources) as Partial<SharedResources> : {};
  const resources: SharedResources = { ...SHARED_RESOURCE_DEFAULTS, ...parsed };
  return { resources, currencyCopper, canPlace: resources.wood >= 50 && resources.stone >= 20 && resources.nails >= 25 && currencyCopper >= WORKSHOP_REQUIREMENTS.copper };
}

export async function placeWorkshopOrder(): Promise<{ ok: boolean; state: WorkshopState; availability: WorkshopOrderAvailability }> {
  const [state, availability, guestState] = await Promise.all([loadWorkshopState(), loadWorkshopOrderAvailability(), loadGuestState()]);
  if (state.phase !== "quoted" || !availability.canPlace) return { ok: false, state, availability };
  const resources = { ...availability.resources, wood: availability.resources.wood - 50, stone: availability.resources.stone - 20, nails: availability.resources.nails - 25 };
  const next: WorkshopState = { version: 1, phase: "building", orderPlacedDaySerial: guestState.calendarDaySerial, completionDaySerial: guestState.calendarDaySerial + 3 };
  const currency = availability.currencyCopper - WORKSHOP_REQUIREMENTS.copper;
  await AsyncStorage.multiSet([[SHARED_RESOURCES_KEY, JSON.stringify(resources)], [CURRENCY_KEY, String(currency)], [WORKSHOP_STATE_KEY, JSON.stringify(next)]]);
  notifyCurrencyChanged(currency);
  return { ok: true, state: next, availability: { resources, currencyCopper: currency, canPlace: false } };
}

export async function advanceWorkshopConstruction(daySerial: number): Promise<WorkshopState> {
  const state = await loadWorkshopState();
  if (state.phase !== "building" || state.completionDaySerial === null || daySerial < state.completionDaySerial) return state;
  await deliverMailboxMessage({
    id: "carpenter_workshop_complete",
    sender: "Carpenter",
    senderKind: "npc",
    subject: "Your Workshop Is Ready",
    body: "Your order has been completed. The workshop outside Rupert’s Tavern is finished and ready for immediate use. As a bonus, we have already installed a Distiller in the workshop.",
    rewards: [],
  });
  const rawTool = await AsyncStorage.getItem(WORKSHOP_CRAFT_TOOL_KEY);
  let existingTool: unknown = null;
  try { existingTool = rawTool ? JSON.parse(rawTool) : null; } catch { existingTool = null; }
  const tool: BagItem = { id: "distiller", itemType: "distiller", name: "Distiller", quantity: 1 };
  const next = { ...state, phase: "complete" as const };
  await AsyncStorage.multiSet([[WORKSHOP_STATE_KEY, JSON.stringify(next)], [WORKSHOP_CRAFT_TOOL_KEY, JSON.stringify(existingTool ?? tool)]]);
  return next;
}
