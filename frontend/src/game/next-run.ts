import AsyncStorage from "@react-native-async-storage/async-storage";

import { CURRENCY_KEY, DEFAULT_CURRENCY_COPPER } from "@/src/game/currency-system";
import { DEFAULT_PLAYER_STATS, PLAYER_STATS_KEY, normalizePlayerStats } from "@/src/game/player-stats";
import { PROGRESSION_STATE_KEY } from "@/src/game/progression";
import { PLAYER_AVATAR_KEY } from "@/src/game/player-avatar";
import { advanceToNextRun } from "@/src/game/run-system";
import { deliverMailboxMessage, type MailReward } from "@/src/game/mailbox-system";
import { GUEST_STATE_KEY, loadGuestState, type GuestId } from "@/src/game/guest-system";
import { ALL_SNAPSHOT_KEYS, createSnapshot } from "@/src/game/save-manager";
import { EMBER_ROOSTER_ENCOUNTER_SEEN_KEY } from "@/src/game/encounter-cinematics";
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
export type NextRunFreeItem = "stamina_potions" | "healing_potions" | "iron_shortswords" | "leather_armor" | "onion_bag";
export type NextRunBonuses = {
  betterValues?: boolean;
  growthPoints?: boolean;
  copper?: 0 | 100 | 300;
  preserveFavor?: boolean;
  freeItem?: NextRunFreeItem | null;
};

function nextRunPackageReward(choice: NextRunFreeItem): MailReward {
  if (choice === "stamina_potions") return { type: "item", itemId: "potion_stamina_low_grade", quantity: 3 };
  if (choice === "healing_potions") return { type: "item", itemId: "potion_healing_low_grade", quantity: 3 };
  if (choice === "iron_shortswords") return { type: "item", itemId: "weapon_iron_shortsword", quantity: 2 };
  if (choice === "leather_armor") return { type: "item", itemId: "armor_leather_bracers", quantity: 2 };
  return { type: "item", itemId: "bag_onion", quantity: 1, containedItem: "onion", containedQuantity: 15 };
}

export async function prepareNextRun(slotNumber: number, bonuses: NextRunBonuses = {}): Promise<{ playerName: string }> {
  const [playerName, avatarId] = await Promise.all([
    AsyncStorage.getItem("@game:player_name"),
    AsyncStorage.getItem(PLAYER_AVATAR_KEY),
  ]);

  const preservedGuests: GuestId[] = bonuses.preserveFavor ? ["old_farmer", "coachman"] : [];
  const progression = await advanceToNextRun(slotNumber, preservedGuests);
  const nextGuestState = await loadGuestState();
  const rawAdvancedStats = await AsyncStorage.getItem(PLAYER_STATS_KEY);
  const advancedStats = normalizePlayerStats(rawAdvancedStats ? JSON.parse(rawAdvancedStats) : null);
  const cleanStats = {
    ...DEFAULT_PLAYER_STATS,
    maximumStamina: DEFAULT_PLAYER_STATS.maximumStamina + (bonuses.betterValues ? 10 : 0),
    maximumLife: DEFAULT_PLAYER_STATS.maximumLife + (bonuses.betterValues ? 5 : 0),
    growthPoints: bonuses.growthPoints ? 30 : 0,
    statusEffects: advancedStats.statusEffects,
  };

  await AsyncStorage.multiRemove(ALL_SNAPSHOT_KEYS.filter((key) => key !== PROGRESSION_STATE_KEY && key !== EMBER_ROOSTER_ENCOUNTER_SEEN_KEY));
  await AsyncStorage.multiSet([
    ["@game:player_name", playerName?.trim() || "Adventurer"],
    [PLAYER_AVATAR_KEY, avatarId ?? "1"],
    ["@game:day_index", "0"],
    [ELAPSED_DAYS_KEY, "0"],
    ["@game:save_location", "kitchen"],
    ["@game:stamina_spent_today", "0"],
    [CURRENCY_KEY, String(DEFAULT_CURRENCY_COPPER + (bonuses.copper ?? 0))],
    [PLAYER_STATS_KEY, JSON.stringify(cleanStats)],
    ["@game:stamina", String(cleanStats.maximumStamina)],
    ["@game:life", String(cleanStats.maximumLife)],
    [PROGRESSION_STATE_KEY, JSON.stringify(progression)],
    [GUEST_STATE_KEY, JSON.stringify(nextGuestState)],
    [TITHE_STATE_KEY, JSON.stringify(DEFAULT_TITHE_STATE)],
    [NEXT_RUN_INTRO_PENDING_KEY, "true"],
  ]);
  if (bonuses.freeItem) {
    await deliverMailboxMessage({
      id: `city-guard-next-run:${progression.runNumber}`,
      sender: "City Guard",
      senderKind: "system",
      subject: "Recovered belongings",
      body: "Hello, we found this nearby. There was a name tag attached indicating it belongs to you. You should take better care of your belongings. - City Guard",
      rewards: [nextRunPackageReward(bonuses.freeItem)],
    });
  }
  await createSnapshot(slotNumber, "manual");
  return { playerName: playerName?.trim() || "Adventurer" };
}
