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

/** All gameplay keys that form a complete save snapshot (NO meta keys like active_slot / game_slots). */
export const ALL_SNAPSHOT_KEYS: string[] = [
  // Core game state
  "@game:stamina",
  "@game:stamina_max",
  "@game:life",
  "@game:player_name",
  "@game:day_index",
  "@game:stamina_spent_today",
  "@game:unlocked_locs",
  "@game:player_bag",
  "@game:player_stats",
  "@game:bag_inspected",
  "@game:logbook",
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
    if (trigger === "day_transition") {
      console.log("[SAVE] SAVE TRIGGER: DAY TRANSITION — slot", slotNum);
    } else if (trigger === "manual") {
      console.log("[SAVE] SAVE TRIGGER: MANUAL MENU SAVE — slot", slotNum);
    } else {
      console.log("[SAVE] SAVE TRIGGER: NEW GAME INIT — slot", slotNum);
    }
  }
  try {
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
  } catch (e) {
    console.error("[SaveManager] restoreFromSnapshot failed:", e);
  }
}

/**
 * Discard unsaved runtime state by restoring the last snapshot.
 * Called when the player navigates to Main Menu without saving.
 */
export async function discardRuntimeAndRestore(slotNum: number): Promise<void> {
  if (__DEV__) console.log("[SAVE] DISCARD UNSAVED RUNTIME STATE — slot", slotNum);
  await restoreFromSnapshot(slotNum);
}

/**
 * Remove the snapshot for a slot (used when deleting a save slot).
 * Does NOT clear individual runtime keys (those will be reset on next new-game).
 */
export async function clearSlotSnapshot(slotNum: number): Promise<void> {
  try {
    await AsyncStorage.removeItem(snapshotKey(slotNum));
  } catch (e) {
    console.error("[SaveManager] clearSlotSnapshot failed:", e);
  }
}
