import AsyncStorage from "@react-native-async-storage/async-storage";

import { CURRENCY_KEY, DEFAULT_CURRENCY_COPPER } from "@/src/game/currency-system";
import { DEFAULT_PLAYER_STATS, PLAYER_STATS_KEY, normalizePlayerStats } from "@/src/game/player-stats";
import { PROGRESSION_STATE_KEY } from "@/src/game/progression";
import { PLAYER_AVATAR_KEY } from "@/src/game/player-avatar";
import { advanceToNextRun } from "@/src/game/run-system";
import { deliverMailboxMessage, type MailReward } from "@/src/game/mailbox-system";
import { GUEST_PROFILES, GUEST_STATE_KEY, loadGuestState, type GuestId } from "@/src/game/guest-system";
import { ALL_SNAPSHOT_KEYS, createSnapshot } from "@/src/game/save-manager";
import { ensureStartingPackageForCurrentRun } from "@/src/game/starting-package-purchase";
import { EMBER_ROOSTER_ENCOUNTER_SEEN_KEY } from "@/src/game/encounter-cinematics";
import { GUEST_TUTORIAL_INTRO_KEY } from "@/src/game/guest-tutorial";
import {
  DEFAULT_POST_GUEST_TUTORIAL_STATE,
  POST_GUEST_TUTORIAL_STATE_KEY,
  getKitchenTableSlotCount,
} from "@/src/game/post-guest-tutorial";
import { QUESTBOOK_UNLOCKED_KEY } from "@/src/game/questbook-system";
import { TRAVEL_STATE_KEY, type TravelState } from "@/src/game/travel-system";
import {
  createEmptyGardenPlot,
  createGardenPlotFromSeed,
  gardenPlotStorageKey,
} from "@/src/game/garden-crop-system";
import {
  DEFAULT_BAG,
  ITEM_CATALOG,
  KITCHEN_TABLE_KEY,
  PLAYER_BAG_KEY,
  type BagItem,
} from "@/src/game/item-system";
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
export type NextRunFreeItem = "stamina_potions" | "healing_potions" | "energy_potions" | "onion_bag" | "nails" | "paint" | "seeds";
export type NextRunBonuses = {
  betterValues?: boolean;
  incomeBonusPacks?: number;
  startingSilver?: number;
  growthPointPacks?: number;
  preserveFavor?: boolean;
  skipRupertTutorials?: boolean;
  freeItems?: NextRunFreeItem[];
};

const NEXT_RUN_FREE_ITEMS = new Set<NextRunFreeItem>(["stamina_potions", "healing_potions", "energy_potions", "onion_bag", "nails", "paint", "seeds"]);

function normalizedCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

export function normalizeNextRunBonuses(raw: NextRunBonuses | null | undefined): NextRunBonuses {
  return {
    betterValues: raw?.betterValues === true,
    incomeBonusPacks: normalizedCount(raw?.incomeBonusPacks),
    startingSilver: normalizedCount(raw?.startingSilver),
    growthPointPacks: normalizedCount(raw?.growthPointPacks),
    preserveFavor: raw?.preserveFavor === true,
    skipRupertTutorials: raw?.skipRupertTutorials === true,
    freeItems: [...new Set((raw?.freeItems ?? []).filter((item): item is NextRunFreeItem => NEXT_RUN_FREE_ITEMS.has(item)))],
  };
}

function rupertTutorialSkipEntries(): [string, string][] {
  const postGuestState = {
    ...DEFAULT_POST_GUEST_TUTORIAL_STATE,
    secondPlotThoughtSeen: true,
    upgradeIntroSeen: true,
  };
  const playerBag = {
    ...DEFAULT_BAG,
    unlocked: true,
    slots: [
      {
        id: "bucket",
        itemType: "bucket",
        name: ITEM_CATALOG.bucket.name,
        quantity: 1,
        attributes: [...ITEM_CATALOG.bucket.attributes],
      },
      ...DEFAULT_BAG.slots.slice(1),
    ],
  };
  const herbSoupCatalog = ITEM_CATALOG.soup_herb;
  const herbSoup: BagItem = {
    id: "soup_herb",
    itemType: "soup_herb",
    name: herbSoupCatalog.name,
    quantity: 1,
    attributes: [...herbSoupCatalog.attributes],
  };
  const kitchenTable = Array<BagItem | null>(getKitchenTableSlotCount(postGuestState)).fill(null);
  kitchenTable[0] = herbSoup;
  kitchenTable[1] = {
    id: "oldpot",
    itemType: "oldpot",
    name: ITEM_CATALOG.oldpot.name,
    quantity: 1,
    attributes: [...ITEM_CATALOG.oldpot.attributes],
  };
  const travelState: TravelState = {
    version: 1,
    exploreUnlocked: true,
    unlockedDestinations: ["next_city"],
  };
  const plantedHerbPlot = {
    ...createGardenPlotFromSeed(createEmptyGardenPlot(1), "seed_herb")!,
    cropAsset: "bed_herb",
    completedGrowthDays: 1,
    remainingGrowthDays: 1,
    progressPercent: 50,
  };

  return [
    ["@tutorial:kitchen_done", "true"],
    ["@kitchen:has_seen_post_garden_dialog", "true"],
    ["@kitchen:dormitory_unlocked", "true"],
    ["@kitchen:tuesday_morning_shown", "true"],
    ["@kitchen:soup_demo_seen", "true"],
    ["@kitchen:cooking_tutorial_done", "true"],
    ["@garden:has_entered", "true"],
    ["@garden:has_seen_introduction", "true"],
    ["@garden:minimum_task_complete", "true"],
    ["@garden:tutorial_complete", "true"],
    ["@garden:tutorial_state", "IDLE"],
    [gardenPlotStorageKey(1), JSON.stringify(plantedHerbPlot)],
    ["@garden:inventory_bag_unlocked", "true"],
    ["@garden:has_received_bucket", "true"],
    ["@garden:activity_bar_unlocked", "true"],
    ["@game:bag_inspected", "true"],
    [PLAYER_BAG_KEY, JSON.stringify(playerBag)],
    [KITCHEN_TABLE_KEY, JSON.stringify(kitchenTable)],
    [GUEST_TUTORIAL_INTRO_KEY, "service_complete"],
    [POST_GUEST_TUTORIAL_STATE_KEY, JSON.stringify(postGuestState)],
    [QUESTBOOK_UNLOCKED_KEY, "true"],
    [TRAVEL_STATE_KEY, JSON.stringify(travelState)],
  ];
}

function nextRunPackageRewards(choice: NextRunFreeItem): MailReward[] {
  if (choice === "stamina_potions") return [{ type: "item", itemId: "potion_stamina_low_grade", quantity: 3 }];
  if (choice === "healing_potions") return [{ type: "item", itemId: "potion_healing_low_grade", quantity: 3 }];
  if (choice === "energy_potions") return [{ type: "item", itemId: "potion_energy_low_grade", quantity: 3 }];
  if (choice === "onion_bag") return [{ type: "item", itemId: "bag_onion", quantity: 1, containedItem: "onion", containedQuantity: 50 }];
  if (choice === "nails") return [{ type: "shared_resource", resourceId: "nails", quantity: 10 }];
  if (choice === "paint") return [{ type: "shared_resource", resourceId: "paint", quantity: 4 }];
  return [
    { type: "garden_item", itemId: "seed_herb", quantity: 3, itemType: "seed" },
    { type: "garden_item", itemId: "seed_carrot", quantity: 3, itemType: "seed" },
    { type: "garden_item", itemId: "seed_potato", quantity: 3, itemType: "seed" },
  ];
}

export async function prepareNextRun(slotNumber: number, bonuses: NextRunBonuses = {}): Promise<{ playerName: string }> {
  bonuses = normalizeNextRunBonuses(bonuses);
  const [playerName, avatarId] = await Promise.all([
    AsyncStorage.getItem("@game:player_name"),
    AsyncStorage.getItem(PLAYER_AVATAR_KEY),
  ]);

  const preservedGuests: GuestId[] = bonuses.preserveFavor ? GUEST_PROFILES.map((guest) => guest.id) : [];
  const progression = await advanceToNextRun(slotNumber, preservedGuests);
  const nextGuestState = await loadGuestState();
  const rawAdvancedStats = await AsyncStorage.getItem(PLAYER_STATS_KEY);
  const advancedStats = normalizePlayerStats(rawAdvancedStats ? JSON.parse(rawAdvancedStats) : null);
  const runBaseUpgrades = Math.min(10, advancedStats.runBaseUpgrades + (bonuses.betterValues ? 1 : 0));
  const cleanStats = {
    ...DEFAULT_PLAYER_STATS,
    runBaseUpgrades,
    maximumStamina: DEFAULT_PLAYER_STATS.maximumStamina + runBaseUpgrades * 10,
    maximumLife: DEFAULT_PLAYER_STATS.maximumLife + runBaseUpgrades * 5,
    growthPoints: Math.max(0, Math.floor(bonuses.growthPointPacks ?? 0)) * 10,
    incomeBonusPercent: Math.max(0, Math.floor(bonuses.incomeBonusPacks ?? 0)) * 10,
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
    [CURRENCY_KEY, String(DEFAULT_CURRENCY_COPPER + Math.max(0, Math.floor(bonuses.startingSilver ?? 0)) * 100)],
    [PLAYER_STATS_KEY, JSON.stringify(cleanStats)],
    ["@game:stamina", "0"],
    ["@game:life", "0"],
    [PROGRESSION_STATE_KEY, JSON.stringify(progression)],
    [GUEST_STATE_KEY, JSON.stringify(nextGuestState)],
    [TITHE_STATE_KEY, JSON.stringify(DEFAULT_TITHE_STATE)],
    [NEXT_RUN_INTRO_PENDING_KEY, "true"],
    ...(bonuses.skipRupertTutorials ? rupertTutorialSkipEntries() : []),
  ]);
  const freeItems = [...new Set(bonuses.freeItems ?? [])];
  if (freeItems.length > 0) {
    await deliverMailboxMessage({
      id: `city-guard-next-run:${progression.runNumber}`,
      sender: "City Guard",
      senderKind: "system",
      subject: "Recovered belongings",
      body: "Hello, we found this nearby. There was a name tag attached indicating it belongs to you. You should take better care of your belongings. - City Guard",
      rewards: freeItems.flatMap(nextRunPackageRewards),
    });
  }
  await ensureStartingPackageForCurrentRun();
  await createSnapshot(slotNumber, "manual");
  return { playerName: playerName?.trim() || "Adventurer" };
}
