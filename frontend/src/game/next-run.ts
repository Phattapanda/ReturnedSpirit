import AsyncStorage from "@react-native-async-storage/async-storage";

import { CURRENCY_KEY, DEFAULT_CURRENCY_COPPER } from "@/src/game/currency-system";
import { DEFAULT_PLAYER_STATS, PLAYER_STATS_KEY, normalizePlayerStats } from "@/src/game/player-stats";
import { PROGRESSION_STATE_KEY } from "@/src/game/progression";
import { PLAYER_AVATAR_KEY } from "@/src/game/player-avatar";
import { advanceToNextRun } from "@/src/game/run-system";
import { ALL_SNAPSHOT_KEYS, createSnapshot } from "@/src/game/save-manager";
import {
  DEFAULT_TITHE_STATE,
  ELAPSED_DAYS_KEY,
  NEXT_RUN_INTRO_PENDING_KEY,
  TITHE_STATE_KEY,
} from "@/src/game/tithe-system";

/**
 * Creates the clean runtime state for the following life while preserving
 * account/run progression and the traits carried into that run.
 */
export async function prepareNextRun(slotNumber: number): Promise<{ playerName: string }> {
  const [playerName, avatarId] = await Promise.all([
    AsyncStorage.getItem("@game:player_name"),
    AsyncStorage.getItem(PLAYER_AVATAR_KEY),
  ]);

  const progression = await advanceToNextRun(slotNumber);
  const rawAdvancedStats = await AsyncStorage.getItem(PLAYER_STATS_KEY);
  const advancedStats = normalizePlayerStats(rawAdvancedStats ? JSON.parse(rawAdvancedStats) : null);
  const cleanStats = { ...DEFAULT_PLAYER_STATS, statusEffects: advancedStats.statusEffects };

  await AsyncStorage.multiRemove(ALL_SNAPSHOT_KEYS.filter((key) => key !== PROGRESSION_STATE_KEY));
  await AsyncStorage.multiSet([
    ["@game:player_name", playerName?.trim() || "Adventurer"],
    [PLAYER_AVATAR_KEY, avatarId ?? "1"],
    ["@game:day_index", "0"],
    [ELAPSED_DAYS_KEY, "0"],
    ["@game:save_location", "kitchen"],
    ["@game:stamina_spent_today", "0"],
    [CURRENCY_KEY, String(DEFAULT_CURRENCY_COPPER)],
    [PLAYER_STATS_KEY, JSON.stringify(cleanStats)],
    [PROGRESSION_STATE_KEY, JSON.stringify(progression)],
    [TITHE_STATE_KEY, JSON.stringify(DEFAULT_TITHE_STATE)],
    [NEXT_RUN_INTRO_PENDING_KEY, "true"],
  ]);
  await createSnapshot(slotNumber, "manual");
  return { playerName: playerName?.trim() || "Adventurer" };
}
