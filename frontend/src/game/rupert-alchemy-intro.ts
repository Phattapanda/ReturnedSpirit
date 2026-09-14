import AsyncStorage from "@react-native-async-storage/async-storage";

import type { PlayerBagData } from "@/src/game/item-system";

export const RUPERT_ALCHEMY_INTRO_PENDING_KEY = "@tutorial:rupert_alchemy_intro_pending";
export const RUPERT_ALCHEMY_INTRO_SEEN_KEY = "@tutorial:rupert_alchemy_intro_seen";

const ALCHEMY_DISCOVERY_ITEM_IDS = new Set([
  "weak_monster_core",
  "slime_gel",
  "shard_mana",
]);

export function hasRupertAlchemyDiscoveryItem(bag: PlayerBagData): boolean {
  return bag.slots.some((item) => !!item && item.quantity > 0 && ALCHEMY_DISCOVERY_ITEM_IDS.has(item.id));
}

/** Queue the introduction only when qualifying materials actually return from a Dungeon. */
export async function queueRupertAlchemyIntroAfterDungeon(bag: PlayerBagData): Promise<void> {
  if (!hasRupertAlchemyDiscoveryItem(bag)) return;
  const seen = await AsyncStorage.getItem(RUPERT_ALCHEMY_INTRO_SEEN_KEY);
  if (seen !== "true") await AsyncStorage.setItem(RUPERT_ALCHEMY_INTRO_PENDING_KEY, "true");
}

export async function isRupertAlchemyIntroPending(): Promise<boolean> {
  const [pending, seen] = await AsyncStorage.multiGet([
    RUPERT_ALCHEMY_INTRO_PENDING_KEY,
    RUPERT_ALCHEMY_INTRO_SEEN_KEY,
  ]);
  return pending[1] === "true" && seen[1] !== "true";
}

export async function completeRupertAlchemyIntro(): Promise<void> {
  await AsyncStorage.multiSet([
    [RUPERT_ALCHEMY_INTRO_PENDING_KEY, "false"],
    [RUPERT_ALCHEMY_INTRO_SEEN_KEY, "true"],
  ]);
}
