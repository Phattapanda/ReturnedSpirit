/**
 * save-manager.ts
 *
 * Central save/snapshot system.
 * Only two save triggers are allowed for gameplay state:
 *   1. createSnapshot(slotNum, "day_transition") — after complete sleep/day change
 *   2. createSnapshot(slotNum, "manual")         — manual save from room menus
 *
 * Dev-only logs:
 *   SAVE TRIGGER: DAY TRANSITION
 *   SAVE TRIGGER: MANUAL MENU SAVE
 *   LOAD SAVE SLOT
 *   DISCARD UNSAVED RUNTIME STATE
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { CURRENCY_KEY, DEFAULT_CURRENCY_COPPER } from "@/src/game/currency-system";
import {
  DEFAULT_DINING_MEAL_STATE,
  DINING_MEAL_STATE_KEY,
} from "@/src/game/dining-meal-system";
import {
  advanceGuestCalendar,
  DEFAULT_GUEST_STATE,
  GUEST_STATE_KEY,
} from "@/src/game/guest-system";
import {
  DEFAULT_GUEST_TUTORIAL_INTRO_STEP,
  GUEST_TUTORIAL_INTRO_KEY,
} from "@/src/game/guest-tutorial";
import { advanceSecondGardenPlotDay } from "@/src/game/garden-crop-system";
import {
  DEFAULT_POST_GUEST_TUTORIAL_STATE,
  POST_GUEST_TUTORIAL_STATE_KEY,
} from "@/src/game/post-guest-tutorial";
import {
  DEFAULT_PLAYER_STATS,
  PLAYER_STATS_KEY,
  advancePlayerStatusEffectsDay,
  normalizePlayerStats,
} from "@/src/game/player-stats";
import { DEFAULT_PROGRESSION_STATE, PROGRESSION_STATE_KEY } from "@/src/game/progression";
import { flushPlaytime } from "@/src/game/playtime-tracker";
import { DEFAULT_TRAVEL_STATE, TRAVEL_STATE_KEY } from "@/src/game/travel-system";
import { DISCOVERED_RECIPES_KEY } from "@/src/game/cooking-system";
import { MERCHANT_SHOP_KEY } from "@/src/game/merchant-shop";
import { DEFAULT_MAILBOX_STATE, MAILBOX_STATE_KEY, deliverDailyBonusLetters } from "@/src/game/mailbox-system";
import { KITCHEN_SMALL_CRATE_KEY } from "@/src/game/kitchen-small-crate";
import { FOREST_DUNGEON_KEY, FOREST_FIGHT_SNAPSHOT_KEY } from "@/src/game/forest-dungeon-system";
import { COACHMAN_ESCORT_KEY } from "@/src/game/coachman-escort-system";
import { EMBER_ROOSTER_ENCOUNTER_SEEN_KEY } from "@/src/game/encounter-cinematics";
import { DEFAULT_MINSTREL_STATE, MINSTREL_STATE_KEY } from "@/src/game/minstrel-system";
import { CITY_STATE_KEY, SUPPORTER_BAG_KEY } from "@/src/game/city-system";
import {
  DEFAULT_TITHE_STATE,
  ELAPSED_DAYS_KEY,
  NEXT_RUN_INTRO_PENDING_KEY,
  TITHE_STATE_KEY,
  normalizeTitheState,
} from "@/src/game/tithe-system";

/** All gameplay keys that form a complete save snapshot (NO meta keys like active_slot / game_slots). */
export const ALL_SNAPSHOT_KEYS: string[] = [
  // Core game state
  "@game:stamina",
  "@game:stamina_max",
  "@game:life",
  "@game:player_name",
  "@game:player_avatar_id",
  "@game:day_index",
  ELAPSED_DAYS_KEY,
  "@game:stamina_spent_today",
  "@game:unlocked_locs",
  "@game:save_location",
  "@game:player_bag",
  PLAYER_STATS_KEY,
  PROGRESSION_STATE_KEY,
  "@game:bag_inspected",
  "@game:logbook",
  "@game:questbook_unlocked",
  "@game:tavern_quests",
  CURRENCY_KEY,
  GUEST_STATE_KEY,
  DINING_MEAL_STATE_KEY,
  GUEST_TUTORIAL_INTRO_KEY,
  POST_GUEST_TUTORIAL_STATE_KEY,
  TITHE_STATE_KEY,
  NEXT_RUN_INTRO_PENDING_KEY,
  TRAVEL_STATE_KEY,
  MERCHANT_SHOP_KEY,
  MAILBOX_STATE_KEY,
  MINSTREL_STATE_KEY,
  CITY_STATE_KEY,
  SUPPORTER_BAG_KEY,
  // Kitchen tutorial flags
  "@tutorial:kitchen_done",
  "@kitchen:has_seen_post_garden_dialog",
  "@kitchen:dormitory_unlocked",
  "@kitchen:tuesday_morning_shown",
  "@kitchen:soup_demo_seen",
  "@kitchen:table_items",
  "@kitchen:cooking_tutorial_done",
  "@kitchen:cooking_tutorial_step",
  "@kitchen:craft_ingredients",
  "@kitchen:craft_tool_slot",
  KITCHEN_SMALL_CRATE_KEY,
  FOREST_DUNGEON_KEY,
  FOREST_FIGHT_SNAPSHOT_KEY,
  COACHMAN_ESCORT_KEY,
  EMBER_ROOSTER_ENCOUNTER_SEEN_KEY,
  DISCOVERED_RECIPES_KEY,
  // Garden state
  "@garden:has_entered",
  "@garden:has_seen_introduction",
  "@garden:has_watered_tutorial",
  "@garden:has_pulled_weeds_tutorial",
  "@garden:has_fertilized_tutorial",
  "@garden:minimum_task_complete",
  "@garden:tutorial_complete",
  "@garden:tutorial_state",
  "@garden:plot_01_data",
  "@garden:plot_02_data",
  "@garden:plot_03_data",
  "@garden:plot_04_data",
  "@garden:inventory",
  "@garden:selected_fertilizer",
  "@garden:inventory_bag_unlocked",
  "@garden:has_harvested_tutorial_herbs",
  "@garden:harvested_tutorial_yield",
  "@garden:has_received_bucket",
  "@garden:activity_bar_unlocked",
  "@garden:has_fetched_tutorial_water",
  "@garden:crafting_tutorial_ready",
  // Room / Dormitory state
  "@room:has_entered",
  "@room:has_seen_evening_thought",
  "@room:time_of_day",
  "@room:must_sleep_before_leaving",
  "@room:first_sleep_completed",
  "@room:upgrades",
  "@room:storage",
  // Shared resources
  "@shared:resources",
];

const SNAPSHOT_PREFIX = "@slot_snapshot:";

function snapshotKey(slotNum: number): string {
  return `${SNAPSHOT_PREFIX}${slotNum}`;
}

/**
 * Create (or overwrite) the snapshot for a given slot.
 * Reads all current runtime keys and writes them as a single JSON blob.
 */
export async function createSnapshot(
  slotNum: number,
  trigger: "day_transition" | "manual" | "new_game",
): Promise<void> {
  if (__DEV__) {
  }
  try {
    if (trigger === "new_game") {
      await AsyncStorage.multiSet([
        ["@game:stamina", "20"],
        ["@game:life", "10"],
        [CURRENCY_KEY, String(DEFAULT_CURRENCY_COPPER)],
        [GUEST_STATE_KEY, JSON.stringify(DEFAULT_GUEST_STATE)],
        [DINING_MEAL_STATE_KEY, JSON.stringify(DEFAULT_DINING_MEAL_STATE)],
        [GUEST_TUTORIAL_INTRO_KEY, DEFAULT_GUEST_TUTORIAL_INTRO_STEP],
        [POST_GUEST_TUTORIAL_STATE_KEY, JSON.stringify(DEFAULT_POST_GUEST_TUTORIAL_STATE)],
        [PLAYER_STATS_KEY, JSON.stringify(DEFAULT_PLAYER_STATS)],
        [PROGRESSION_STATE_KEY, JSON.stringify(DEFAULT_PROGRESSION_STATE)],
        [ELAPSED_DAYS_KEY, "0"],
        [TITHE_STATE_KEY, JSON.stringify(DEFAULT_TITHE_STATE)],
        [NEXT_RUN_INTRO_PENDING_KEY, "false"],
        [TRAVEL_STATE_KEY, JSON.stringify(DEFAULT_TRAVEL_STATE)],
        [DISCOVERED_RECIPES_KEY, JSON.stringify([])],
        [MAILBOX_STATE_KEY, JSON.stringify(DEFAULT_MAILBOX_STATE)],
        [MINSTREL_STATE_KEY, JSON.stringify(DEFAULT_MINSTREL_STATE)],
      ]);
    }

    // The core day index is already advanced by Dormitory before this checkpoint.
    // Guest visits and the optional second Garden plot are advanced here so both
    // states are included in the same day-transition snapshot.
    if (trigger === "day_transition") {
      const rawDay = await AsyncStorage.getItem("@game:day_index");
      const newDay = rawDay !== null ? parseInt(rawDay, 10) : 0;
      const guestState = await advanceGuestCalendar(newDay);
      await deliverDailyBonusLetters(guestState.calendarDaySerial);
      await advanceSecondGardenPlotDay();
      const rawStats = await AsyncStorage.getItem(PLAYER_STATS_KEY);
      const stats = normalizePlayerStats(rawStats ? JSON.parse(rawStats) : null);
      await AsyncStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(advancePlayerStatusEffectsDay(stats)));
    }

    await flushPlaytime();

    const pairs = await AsyncStorage.multiGet(ALL_SNAPSHOT_KEYS);
    const snapshot: Record<string, string | null> = {};
    for (const [key, value] of pairs) {
      snapshot[key] = value;
    }
    await AsyncStorage.setItem(snapshotKey(slotNum), JSON.stringify(snapshot));
  } catch (e) {
    console.error("[SaveManager] createSnapshot failed:", e);
  }
}

/**
 * Restore all runtime keys from the stored snapshot for a given slot.
 * If no snapshot exists, no-op (leaves runtime keys as-is).
 */
export async function restoreFromSnapshot(slotNum: number): Promise<void> {
  if (__DEV__) console.log("[SAVE] LOAD SAVE SLOT:", slotNum);
  try {
    const raw = await AsyncStorage.getItem(snapshotKey(slotNum));
    if (!raw) {
      if (__DEV__) console.log("[SAVE] No snapshot found for slot", slotNum, "— using runtime keys as-is");
      return;
    }
    const snapshot: Record<string, string | null> = JSON.parse(raw);

    const toSet: [string, string][] = [];
    const toRemove: string[] = [];

    for (const key of ALL_SNAPSHOT_KEYS) {
      const val = snapshot[key];
      if (val !== null && val !== undefined) {
        toSet.push([key, val]);
      } else {
        toRemove.push(key);
      }
    }

    if (toSet.length > 0) await AsyncStorage.multiSet(toSet);
    if (toRemove.length > 0) await AsyncStorage.multiRemove(toRemove);

    // Persist schema defaults for snapshots created before Level/Run/KP existed.
    const [rawStats, rawProgression, rawTithe, rawElapsedDays] = await AsyncStorage.multiGet([
      PLAYER_STATS_KEY,
      PROGRESSION_STATE_KEY,
      TITHE_STATE_KEY,
      ELAPSED_DAYS_KEY,
    ]);
    await AsyncStorage.multiSet([
      [PLAYER_STATS_KEY, JSON.stringify(normalizePlayerStats(rawStats[1] ? JSON.parse(rawStats[1]) : null))],
      [PROGRESSION_STATE_KEY, rawProgression[1] ?? JSON.stringify(DEFAULT_PROGRESSION_STATE)],
      [TITHE_STATE_KEY, JSON.stringify(normalizeTitheState(rawTithe[1] ? JSON.parse(rawTithe[1]) : null))],
      [ELAPSED_DAYS_KEY, rawElapsedDays[1] ?? "0"],
    ]);
  } catch (e) {
    console.error("[SaveManager] restoreFromSnapshot failed:", e);
  }
}

/** Discard unsaved runtime state by restoring the last snapshot. */
export async function discardRuntimeAndRestore(slotNum: number): Promise<void> {
  if (__DEV__) console.log("[SAVE] DISCARD UNSAVED RUNTIME STATE — slot", slotNum);
  await restoreFromSnapshot(slotNum);
}

/** Remove the snapshot for a slot (used when deleting a save slot). */
export async function clearSlotSnapshot(slotNum: number): Promise<void> {
  try {
    await AsyncStorage.removeItem(snapshotKey(slotNum));
  } catch (e) {
    console.error("[SaveManager] clearSlotSnapshot failed:", e);
  }
}
