import { prepareNextRun, type NextRunBonuses } from "@/src/game/next-run";
import { addKarmaPoints, spendKarmaPoints } from "@/src/game/progression";
import { restoreForestFightSnapshot, type DungeonActionResult } from "@/src/game/forest-dungeon-system";

export const REPEAT_FIGHT_KP_COST = 10;

export function nextRunBonusCost(bonuses: NextRunBonuses): number {
  return (bonuses.betterValues ? 10 : 0) +
    (bonuses.growthPoints ? 10 : 0) +
    (bonuses.copper === 100 ? 5 : bonuses.copper === 300 ? 15 : 0) +
    (bonuses.preserveFavor ? 25 : 0);
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

export async function beginChosenNextRun(slotNumber: number, bonuses: NextRunBonuses): Promise<"ok" | "insufficient_kp"> {
  const cost = nextRunBonusCost(bonuses);
  if (cost > 0 && !await spendKarmaPoints(cost)) return "insufficient_kp";
  await prepareNextRun(slotNumber, bonuses);
  return "ok";
}
