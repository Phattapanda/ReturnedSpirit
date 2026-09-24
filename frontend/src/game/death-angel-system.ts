import { normalizeNextRunBonuses, prepareNextRun, type NextRunBonuses } from "@/src/game/next-run";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PLAYER_STATS_KEY, normalizePlayerStats } from "@/src/game/player-stats";
import { addKarmaPoints, spendKarmaPoints } from "@/src/game/progression";
import { leaveForestDungeon, restoreForestFightSnapshot, type DungeonActionResult } from "@/src/game/forest-dungeon-system";

export const REPEAT_FIGHT_KP_COST = 5;
export const KARMA_TAVERN_RETURN_COST = 50;

export function nextRunBonusCost(bonuses: NextRunBonuses): number {
  const normalized = normalizeNextRunBonuses(bonuses);
  return (normalized.betterValues ? 10 : 0) +
    (normalized.incomeBonusPacks ?? 0) * 10 +
    (normalized.startingSilver ?? 0) * 3 +
    (normalized.growthPointPacks ?? 0) * 3 +
    (normalized.preserveFavor ? 20 : 0) +
    (normalized.skipRupertTutorials ? 2 : 0);
}

export async function repeatForestFight(): Promise<DungeonActionResult | null> {
  const paid = await spendKarmaPoints(REPEAT_FIGHT_KP_COST);
  if (!paid) return null;
  const restored = await restoreForestFightSnapshot();
  if (!restored) {
    await addKarmaPoints(REPEAT_FIGHT_KP_COST);
    return null;
  }
  return restored;
}

export async function returnToTavernAfterForestDeath(): Promise<Awaited<ReturnType<typeof leaveForestDungeon>> | null> {
  const paid = await spendKarmaPoints(KARMA_TAVERN_RETURN_COST);
  if (!paid) return null;
  try {
    return await leaveForestDungeon({ karmaRescue: true });
  } catch {
    await addKarmaPoints(KARMA_TAVERN_RETURN_COST);
    return null;
  }
}

export async function beginChosenNextRun(slotNumber: number, bonuses: NextRunBonuses): Promise<"ok" | "insufficient_kp"> {
  bonuses = normalizeNextRunBonuses(bonuses);
  const rawStats = await AsyncStorage.getItem(PLAYER_STATS_KEY);
  if (normalizePlayerStats(rawStats ? JSON.parse(rawStats) : null).runBaseUpgrades >= 10) {
    bonuses = { ...bonuses, betterValues: false };
  }
  const cost = nextRunBonusCost(bonuses);
  if (cost > 0 && !await spendKarmaPoints(cost)) return "insufficient_kp";
  try {
    await prepareNextRun(slotNumber, bonuses);
    return "ok";
  } catch (error) {
    if (cost > 0) await addKarmaPoints(cost);
    throw error;
  }
}
