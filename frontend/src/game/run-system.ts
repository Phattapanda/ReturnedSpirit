import AsyncStorage from "@react-native-async-storage/async-storage";

import { resetGuestRelationshipsForNextRun, type GuestId } from "@/src/game/guest-system";
import { beginNextRun, type ProgressionState } from "@/src/game/progression";

type SaveSlot = {
  slot: number;
  runNumber?: number;
  [key: string]: unknown;
};

export function formatRunOrdinal(runNumber: number): string {
  const value = Math.max(1, Math.floor(Number(runNumber) || 1));
  const lastTwo = value % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${value}th`;
  if (value % 10 === 1) return `${value}st`;
  if (value % 10 === 2) return `${value}nd`;
  if (value % 10 === 3) return `${value}rd`;
  return `${value}th`;
}

export function getDeathAngelRunLine(runNumber: number): string {
  return `I'm seeing you for the ${formatRunOrdinal(runNumber)} time.`;
}

/**
 * Persistent death/run transition foundation. The future Death Angel flow passes
 * the NPC relationships purchased for preservation; everything else resets.
 */
export async function advanceToNextRun(
  slotNumber: number,
  preservedGuestIds: readonly GuestId[] = [],
): Promise<ProgressionState> {
  const [progression] = await Promise.all([
    beginNextRun(),
    resetGuestRelationshipsForNextRun(preservedGuestIds),
  ]);

  const rawSlots = await AsyncStorage.getItem("game_slots");
  if (rawSlots) {
    const slots = JSON.parse(rawSlots) as SaveSlot[];
    const updated = slots.map((slot) => slot.slot === slotNumber
      ? { ...slot, runNumber: progression.runNumber }
      : slot);
    await AsyncStorage.setItem("game_slots", JSON.stringify(updated));
  }
  return progression;
}
