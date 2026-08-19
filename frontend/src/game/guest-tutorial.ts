import AsyncStorage from "@react-native-async-storage/async-storage";

export const GUEST_TUTORIAL_INTRO_KEY = "@guest:tutorial_intro_step";

export type GuestTutorialIntroStep =
  | "not_started"
  | "knock"
  | "dining_prompt"
  | "dining_intro"
  | "farmer_intro"
  | "meal_reveal"
  | "ready_for_water"
  | "service_sell"
  | "service_exchange"
  | "service_water"
  | "service_talk"
  | "service_reaction"
  | "service_departing"
  | "service_complete";

export const DEFAULT_GUEST_TUTORIAL_INTRO_STEP: GuestTutorialIntroStep = "not_started";

const VALID_STEPS = new Set<GuestTutorialIntroStep>([
  "not_started",
  "knock",
  "dining_prompt",
  "dining_intro",
  "farmer_intro",
  "meal_reveal",
  "ready_for_water",
  "service_sell",
  "service_exchange",
  "service_water",
  "service_talk",
  "service_reaction",
  "service_departing",
  "service_complete",
]);

export function normalizeGuestTutorialIntroStep(raw: string | null): GuestTutorialIntroStep {
  if (raw && VALID_STEPS.has(raw as GuestTutorialIntroStep)) {
    return raw as GuestTutorialIntroStep;
  }
  return DEFAULT_GUEST_TUTORIAL_INTRO_STEP;
}

export async function loadGuestTutorialIntroStep(): Promise<GuestTutorialIntroStep> {
  return normalizeGuestTutorialIntroStep(await AsyncStorage.getItem(GUEST_TUTORIAL_INTRO_KEY));
}

export async function saveGuestTutorialIntroStep(step: GuestTutorialIntroStep): Promise<void> {
  await AsyncStorage.setItem(GUEST_TUTORIAL_INTRO_KEY, step);
}

export function guestTutorialHasReached(
  current: GuestTutorialIntroStep,
  target: GuestTutorialIntroStep,
): boolean {
  const order: GuestTutorialIntroStep[] = [
    "not_started",
    "knock",
    "dining_prompt",
    "dining_intro",
    "farmer_intro",
    "meal_reveal",
    "ready_for_water",
    "service_sell",
    "service_exchange",
    "service_water",
    "service_talk",
    "service_reaction",
    "service_departing",
    "service_complete",
  ];
  return order.indexOf(current) >= order.indexOf(target);
}

/** Rupert remains with the guest until the first service tutorial has fully ended. */
export function guestTutorialKeepsRupertInDining(step: GuestTutorialIntroStep): boolean {
  return step === "ready_for_water" ||
    step === "service_sell" ||
    step === "service_exchange" ||
    step === "service_water" ||
    step === "service_talk" ||
    step === "service_reaction" ||
    step === "service_departing";
}

/**
 * Once Rupert leaves Garden to greet the first guest, that middle portrait slot is
 * permanently reserved for future Garden staff/support rather than Rupert.
 */
export function guestTutorialRupertHasLeftGarden(step: GuestTutorialIntroStep): boolean {
  return guestTutorialHasReached(step, "ready_for_water");
}
