import { Asset } from "expo-asset";

type ForestAssetKind = "image" | "audio" | "video";

type ForestAssetEntry = {
  key: string;
  kind: ForestAssetKind;
  module: number;
};

// Keep all require() calls static so Metro includes the complete Forest bundle.
const FOREST_ASSETS: readonly ForestAssetEntry[] = [
  { key: "forest_edge", kind: "image", module: require("../../assets/images/forest_edge.png") },
  { key: "forest_deeper", kind: "image", module: require("../../assets/images/forest_deeper.png") },
  { key: "forest_heart", kind: "image", module: require("../../assets/images/forest_heart.png") },
  { key: "forest_rest_area", kind: "image", module: require("../../assets/images/forest_rest_area.png") },
  { key: "forest_nest", kind: "image", module: require("../../assets/images/forest_nest.png") },
  { key: "forest_heart_boss", kind: "image", module: require("../../assets/images/forest_heart_boss.png") },
  { key: "hunters_camp", kind: "image", module: require("../../assets/images/hunters_camp.png") },

  { key: "forest_slime", kind: "image", module: require("../../assets/images/forest_slime.png") },
  { key: "feral_rabbit", kind: "image", module: require("../../assets/images/feral_rabbit.png") },
  { key: "wild_boar", kind: "image", module: require("../../assets/images/wild_boar.png") },
  { key: "wild_wolf", kind: "image", module: require("../../assets/images/wild_wolf.png") },
  { key: "ember_chick", kind: "image", module: require("../../assets/images/ember_chick.png") },
  { key: "ember_chicken", kind: "image", module: require("../../assets/images/ember_chicken.png") },
  { key: "ember_rooster", kind: "image", module: require("../../assets/images/ember_rooster.png") },
  { key: "goblin_forager", kind: "image", module: require("../../assets/images/goblin_forager.png") },
  { key: "elder_ember_rooster", kind: "image", module: require("../../assets/images/elder_ember_rooster.png") },

  { key: "porter_normal", kind: "image", module: require("../../assets/images/porter_normal.png") },
  { key: "porter_healer", kind: "image", module: require("../../assets/images/porter_healer.png") },
  { key: "porter_cleric", kind: "image", module: require("../../assets/images/porter_cleric.png") },
  { key: "porter_botanist", kind: "image", module: require("../../assets/images/porter_botanist.png") },
  { key: "slash", kind: "image", module: require("../../assets/images/slash.png") },
  { key: "critical", kind: "image", module: require("../../assets/images/critical.png") },
  { key: "punch", kind: "image", module: require("../../assets/images/punch.png") },

  { key: "forest_theme", kind: "audio", module: require("../../assets/audio/forest_theme.mp3") },
  { key: "battle_over50", kind: "audio", module: require("../../assets/audio/battle_theme_over50.mp3") },
  { key: "battle_under50", kind: "audio", module: require("../../assets/audio/battle_theme_under50.mp3") },
  { key: "rest_area", kind: "audio", module: require("../../assets/audio/rest_area.mp3") },
  { key: "boss_battle", kind: "audio", module: require("../../assets/audio/boss_battle_theme.mp3") },
  { key: "sword_hit", kind: "audio", module: require("../../assets/audio/sword_hit.mp3") },
  { key: "sword_miss", kind: "audio", module: require("../../assets/audio/sword_miss.mp3") },
  { key: "combat_impact", kind: "audio", module: require("../../assets/audio/combat_impact.mp3") },
  { key: "attack_miss", kind: "audio", module: require("../../assets/audio/attack_miss.mp3") },
  { key: "victory", kind: "audio", module: require("../../assets/audio/victory.wav") },
  { key: "victory_boss", kind: "audio", module: require("../../assets/audio/victory_boss.wav") },

  { key: "ember_rooster_encounter", kind: "video", module: require("../../assets/video/encounter_ember_rooster.mp4") },
  { key: "boss_encounter", kind: "video", module: require("../../assets/video/entrance_boss_elder_ember_rooster.mp4") },
] as const;

export type ForestVideoKey = "ember_rooster_encounter" | "boss_encounter";
export type ForestAssetProgress = (loaded: number, total: number) => void;

let forestAssetsReady = false;
let activePreload: Promise<void> | null = null;

async function downloadEntry(entry: ForestAssetEntry): Promise<void> {
  const asset = Asset.fromModule(entry.module);
  await asset.downloadAsync();
  if (!asset.localUri && !asset.uri) throw new Error(`Forest asset ${entry.key} has no usable URI.`);
}

/**
 * Ensure the complete Forest bundle is present in Expo's local asset cache.
 * Rechecking after an app restart is intentional: the OS may purge cache files.
 */
export async function preloadForestAssets(onProgress?: ForestAssetProgress): Promise<void> {
  if (forestAssetsReady) {
    onProgress?.(FOREST_ASSETS.length, FOREST_ASSETS.length);
    return;
  }
  if (activePreload) {
    await activePreload;
    onProgress?.(FOREST_ASSETS.length, FOREST_ASSETS.length);
    return;
  }

  activePreload = (async () => {
    let loaded = 0;
    onProgress?.(loaded, FOREST_ASSETS.length);

    // A small worker pool avoids flooding Android/Metro while keeping the first
    // Forest load comfortably faster than downloading every asset sequentially.
    const queue = [...FOREST_ASSETS];
    const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length > 0) {
        const entry = queue.shift();
        if (!entry) return;
        await downloadEntry(entry);
        loaded += 1;
        onProgress?.(loaded, FOREST_ASSETS.length);
      }
    });
    const results = await Promise.allSettled(workers);
    const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failure) throw failure.reason;
    forestAssetsReady = true;
  })();

  try {
    await activePreload;
  } finally {
    activePreload = null;
  }
}

/** Use the downloaded file URI when available and the Metro module as fallback. */
export function getForestVideoSource(key: ForestVideoKey): string | number {
  const entry = FOREST_ASSETS.find((candidate) => candidate.key === key && candidate.kind === "video");
  if (!entry) throw new Error(`Unknown Forest video: ${key}`);
  return Asset.fromModule(entry.module).localUri ?? entry.module;
}

export const FOREST_ASSET_COUNT = FOREST_ASSETS.length;
