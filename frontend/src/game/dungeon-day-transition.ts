import AsyncStorage from '@react-native-async-storage/async-storage';

import type { GardenPlotData } from '@/src/components/GardenPlot';
import { DEFAULT_PLAYER_STATS, PLAYER_STATS_KEY, normalizePlayerStats } from '@/src/game/player-stats';
import { ROOM_UPGRADES_DEFAULT, calcSleepRecovery, type RoomUpgrade } from '@/src/game/room-config';
import { createSnapshot } from '@/src/game/save-manager';
import { ELAPSED_DAYS_KEY, prepareTitheForDay } from '@/src/game/tithe-system';

const KEYS = {
  dayIndex: '@game:day_index',
  stamina: '@game:stamina',
  life: '@game:life',
  staminaSpent: '@game:stamina_spent_today',
  plot: '@garden:plot_01_data',
  upgrades: '@room:upgrades',
  firstSleepDone: '@room:first_sleep_completed',
  timeOfDay: '@room:time_of_day',
  mustSleep: '@room:must_sleep_before_leaving',
  saveLocation: '@game:save_location',
  activeSlot: '@game:active_slot',
  gameSlots: 'game_slots',
} as const;

function processPrimaryPlotDayChange(plot: GardenPlotData): GardenPlotData {
  if (plot.status === 'empty' || plot.readyToHarvest) {
    return {
      ...plot,
      wateredToday: false,
      weedsPulledToday: false,
      fertilizedToday: false,
      fertilizerTypeUsedToday: null,
    };
  }

  const next = { ...plot };
  if (!plot.withered) {
    if (plot.wateredToday) {
      next.completedGrowthDays = Math.min(plot.completedGrowthDays + 1, plot.totalGrowthDays);
      next.progressPercent = Math.round((next.completedGrowthDays / plot.totalGrowthDays) * 100);
      next.remainingGrowthDays = Math.max(0, plot.totalGrowthDays - next.completedGrowthDays);
      next.consecutiveUnwateredDays = 0;
      if (next.completedGrowthDays >= plot.totalGrowthDays) {
        next.status = 'ready';
        next.readyToHarvest = true;
      }
    } else {
      next.consecutiveUnwateredDays = plot.consecutiveUnwateredDays + 1;
      if (next.consecutiveUnwateredDays >= 3) {
        next.withered = true;
        next.status = 'withered';
      }
    }
  }

  next.wateredToday = false;
  next.weedsPulledToday = false;
  next.fertilizedToday = false;
  next.fertilizerTypeUsedToday = null;
  return next;
}

function loadCompletedRoomUpgrades(raw: string | null): RoomUpgrade[] {
  if (!raw) return ROOM_UPGRADES_DEFAULT;
  try {
    const saved = JSON.parse(raw) as RoomUpgrade[];
    return ROOM_UPGRADES_DEFAULT.map((definition) => {
      const stored = saved.find((upgrade) => upgrade.id === definition.id);
      return stored ? { ...definition, completed: stored.completed === true } : definition;
    });
  } catch {
    return ROOM_UPGRADES_DEFAULT;
  }
}

/** Ends a dungeon outing exactly like sleeping, then checkpoints in the Dormitory. */
export async function completeDungeonDayTransition(): Promise<void> {
  const values = await AsyncStorage.multiGet([
    KEYS.dayIndex,
    ELAPSED_DAYS_KEY,
    KEYS.stamina,
    KEYS.life,
    KEYS.plot,
    KEYS.upgrades,
    PLAYER_STATS_KEY,
    KEYS.activeSlot,
    KEYS.gameSlots,
  ]);
  const stored = Object.fromEntries(values);

  const oldDay = Math.max(0, Number.parseInt(stored[KEYS.dayIndex] ?? '0', 10) || 0) % 7;
  const newDay = (oldDay + 1) % 7;
  const elapsedDays = Math.max(0, Number.parseInt(stored[ELAPSED_DAYS_KEY] ?? '0', 10) || 0) + 1;
  const stats = normalizePlayerStats(stored[PLAYER_STATS_KEY] ? JSON.parse(stored[PLAYER_STATS_KEY]!) : DEFAULT_PLAYER_STATS);
  const recovery = calcSleepRecovery(loadCompletedRoomUpgrades(stored[KEYS.upgrades]));
  const oldStamina = Math.max(0, Number.parseInt(stored[KEYS.stamina] ?? '0', 10) || 0);
  const oldLife = Math.max(0, Number.parseInt(stored[KEYS.life] ?? '0', 10) || 0);
  const newStamina = Math.min(stats.maximumStamina, oldStamina + recovery.stamina);
  const newLife = Math.min(stats.maximumLife, oldLife + recovery.life);

  const updates: [string, string][] = [
    [KEYS.dayIndex, String(newDay)],
    [ELAPSED_DAYS_KEY, String(elapsedDays)],
    [KEYS.stamina, String(newStamina)],
    [KEYS.life, String(newLife)],
    [KEYS.staminaSpent, '0'],
    [KEYS.firstSleepDone, 'true'],
    [KEYS.timeOfDay, 'morning'],
    [KEYS.mustSleep, 'false'],
    [KEYS.saveLocation, 'dormitory'],
  ];

  if (stored[KEYS.plot]) {
    try {
      const plot = JSON.parse(stored[KEYS.plot]!) as GardenPlotData;
      updates.push([KEYS.plot, JSON.stringify(processPrimaryPlotDayChange(plot))]);
    } catch {
      // A malformed optional plot must not prevent the player from returning home.
    }
  }

  await AsyncStorage.multiSet(updates);
  await prepareTitheForDay(elapsedDays);

  const activeSlot = Number.parseInt(stored[KEYS.activeSlot] ?? '', 10);
  if (activeSlot > 0) {
    if (stored[KEYS.gameSlots]) {
      try {
      const slots = JSON.parse(stored[KEYS.gameSlots]!) as { slot: number; [key: string]: unknown }[];
      const updatedSlots = slots.map((slot) => slot.slot === activeSlot
        ? { ...slot, dayIdx: newDay, stamina: newStamina, life: newLife, lastSaved: new Date().toISOString() }
        : slot);
      await AsyncStorage.setItem(KEYS.gameSlots, JSON.stringify(updatedSlots));
      } catch {
        // A damaged slot list must not prevent the day transition checkpoint.
      }
    }
    await createSnapshot(activeSlot, 'day_transition');
  }
}
