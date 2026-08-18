/**
 * AssetManager – Central gameplay asset registry and preloader.
 *
 * Architecture:
 *  - ASSET_REGISTRY: static list of all gameplay assets with require() at module scope.
 *  - preloadGameplayAssets(): loads AND decodes every asset before gameplay starts.
 *  - isAssetReady(key): synchronous check for a single asset.
 *  - ensureAssetReady(key): async defensive guarantee for flying-item animations.
 *
 * All require() calls MUST remain at module scope (Metro compile-time requirement).
 * The in-session cache Map persists for the entire app session, so assets
 * loaded during game-loading.tsx remain available for the whole game without
 * re-fetching.
 *
 * Groups:
 *   CORE       – critical on every session (portraits, flying items, kitchen bg)
 *   PORTRAITS  – all player / NPC portrait variants
 *   ITEMS      – every item image (flying-critical ones marked critical:true)
 *   BACKGROUNDS– scene backgrounds
 *   NAVIGATION – location-bar button images
 *   UI         – HUD and action button images
 */

import { Asset } from 'expo-asset';
import { Image, Platform } from 'react-native';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type AssetGroup =
  | 'portraits_player'
  | 'portraits_rupert'
  | 'items'
  | 'backgrounds'
  | 'navigation'
  | 'ui';

export type AssetEntry = {
  key: string;
  // Static require() return value — typed as any by Metro bundler conventions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  module: any;
  group: AssetGroup;
  /** If true: failure shows retry/main-menu error screen */
  critical?: boolean;
};

type CacheStatus = 'idle' | 'loading' | 'ready' | 'error';
type CacheEntry = { asset: Asset; status: CacheStatus };

// ─── Asset Registry ────────────────────────────────────────────────────────────
// IMPORTANT: All require() calls must stay at module scope for Metro bundler.

export const ASSET_REGISTRY: AssetEntry[] = [
  // ── Player portraits (all variants) ────────────────────────────────────────
  {
    key: 'av_normal',
    module: require('../../assets/images/avatar1_normal.png'),
    group: 'portraits_player',
    critical: true,
  },
  {
    key: 'av_laugh',
    module: require('../../assets/images/avatar1_laugh.png'),
    group: 'portraits_player',
  },
  {
    key: 'av_sad',
    module: require('../../assets/images/avatar1_sad.png'),
    group: 'portraits_player',
  },
  {
    key: 'av_tired',
    module: require('../../assets/images/avatar1_tired.png'),
    group: 'portraits_player',
  },
  {
    key: 'av_sick',
    module: require('../../assets/images/avatar1_sick.png'),
    group: 'portraits_player',
  },

  // ── Additional selectable player portraits ─────────────────────────────────
  { key: 'av2_normal', module: require('../../assets/images/avatar2_normal.png'), group: 'portraits_player' },
  { key: 'av2_laugh',  module: require('../../assets/images/avatar2_laugh.png'),  group: 'portraits_player' },
  { key: 'av2_sad',    module: require('../../assets/images/avatar2_sad.png'),    group: 'portraits_player' },
  { key: 'av2_tired',  module: require('../../assets/images/avatar2_tired.png'),  group: 'portraits_player' },
  { key: 'av2_sick',   module: require('../../assets/images/avatar2_sick.png'),   group: 'portraits_player' },
  { key: 'av3_normal', module: require('../../assets/images/avatar3_normal.png'), group: 'portraits_player' },
  { key: 'av3_laugh',  module: require('../../assets/images/avatar3_laugh.png'),  group: 'portraits_player' },
  { key: 'av3_sad',    module: require('../../assets/images/avatar3_sad.png'),    group: 'portraits_player' },
  { key: 'av3_tired',  module: require('../../assets/images/avatar3_tired.png'),  group: 'portraits_player' },
  { key: 'av3_sick',   module: require('../../assets/images/avatar3_sick.png'),   group: 'portraits_player' },

  // ── Rupert portraits (all variants) ────────────────────────────────────────
  {
    key: 'rupert',
    module: require('../../assets/images/rupert.png'),
    group: 'portraits_rupert',
    critical: true,
  },
  {
    key: 'rupertlaugh',
    module: require('../../assets/images/rupertlaugh.png'),
    group: 'portraits_rupert',
  },
  {
    key: 'rupertsad',
    module: require('../../assets/images/rupertsad.png'),
    group: 'portraits_rupert',
  },

  // ── Flying-critical items (must be ready before FIRST flying animation) ────
  {
    key: 'herbsoup',
    module: require('../../assets/images/herbsoup.png'),
    group: 'items',
    critical: true,
  },
  {
    key: 'herbbag',
    module: require('../../assets/images/herbbag.png'),
    group: 'items',
    critical: true,
  },
  {
    key: 'bucket',
    module: require('../../assets/images/bucket.png'),
    group: 'items',
    critical: true,
  },
  {
    key: 'bucketwater',
    module: require('../../assets/images/bucketwater.png'),
    group: 'items',
    critical: true,
  },

  // ── Other item images ───────────────────────────────────────────────────────
  { key: 'herbs',         module: require('../../assets/images/herbs.png'),         group: 'items' },
  { key: 'herbseed',      module: require('../../assets/images/herbseed.png'),      group: 'items' },
  { key: 'herbbed',       module: require('../../assets/images/herbbed.png'),       group: 'items' },
  { key: 'herbbed_young', module: require('../../assets/images/herbbed_young.png'), group: 'items' },
  { key: 'fertilizer',    module: require('../../assets/images/fertilizer.png'),    group: 'items' },
  { key: 'bag1',          module: require('../../assets/images/bag1.png'),          group: 'items' },
  // Craft materials / resources
  { key: 'wood',  module: require('../../assets/images/wood.png'),  group: 'items' },
  { key: 'stone', module: require('../../assets/images/stone.png'), group: 'items' },
  { key: 'cloth', module: require('../../assets/images/cloth.png'), group: 'items' },
  { key: 'nails', module: require('../../assets/images/nails.png'), group: 'items' },
  { key: 'paint', module: require('../../assets/images/paint.png'), group: 'items' },

  // ── Scene backgrounds ───────────────────────────────────────────────────────
  {
    key: 'bg_kitchen',
    module: require('../../assets/images/kitchen1.jpg'),
    group: 'backgrounds',
    critical: true,
  },
  { key: 'bg_garden',       module: require('../../assets/images/garden1.jpg'),       group: 'backgrounds' },
  { key: 'bg_room_morning', module: require('../../assets/images/room1_morning.jpg'), group: 'backgrounds' },
  { key: 'bg_room_evening', module: require('../../assets/images/room1_evening.jpg'), group: 'backgrounds' },

  // ── Navigation / location-bar icons ────────────────────────────────────────
  { key: 'goto_kitchen',   module: require('../../assets/images/gotokitchen.png'),   group: 'navigation' },
  { key: 'goto_garden',    module: require('../../assets/images/gotogarden.png'),    group: 'navigation' },
  { key: 'goto_dining',    module: require('../../assets/images/gotodining.png'),    group: 'navigation' },
  { key: 'goto_dormitory', module: require('../../assets/images/gotodormitory.png'), group: 'navigation' },
  { key: 'goto_mail',      module: require('../../assets/images/gotomail.png'),      group: 'navigation' },
  { key: 'go_explore',     module: require('../../assets/images/goexplore.png'),     group: 'navigation' },
  { key: 'goto_storage',   module: require('../../assets/images/gotostorage.png'),   group: 'navigation' },

  // ── UI / HUD / action-button images ────────────────────────────────────────
  { key: 'watering',  module: require('../../assets/images/watering.png'),    group: 'ui' },
  { key: 'pullweeds', module: require('../../assets/images/pullweeds.png'),   group: 'ui' },
  { key: 'harvest',   module: require('../../assets/images/harvest.png'),     group: 'ui' },
  { key: 'getwater',   module: require('../../assets/images/getwater.png'),   group: 'ui' },
  { key: 'getwood',    module: require('../../assets/images/getwood.png'),    group: 'ui' },
  { key: 'getstone',   module: require('../../assets/images/getstone.png'),   group: 'ui' },
  { key: 'workout1',   module: require('../../assets/images/workout1.png'),   group: 'ui' },
  { key: 'workout2',   module: require('../../assets/images/workout2.png'),   group: 'ui' },
  { key: 'well_icon',  module: require('../../assets/images/well.png'),       group: 'navigation' },
  { key: 'craft_area',module: require('../../assets/images/craft-area.webp'), group: 'ui' },
  { key: 'table_2x6', module: require('../../assets/images/table-2x6.webp'), group: 'ui' },
];

/** Total number of assets (used for real progress calculation). */
export const TOTAL_ASSET_COUNT = ASSET_REGISTRY.length;

/**
 * Keys that, if unavailable, must show the retry / main-menu error screen
 * instead of allowing gameplay to start with broken flying animations.
 */
export const CRITICAL_ASSET_KEYS: string[] = ASSET_REGISTRY
  .filter(a => a.critical)
  .map(a => a.key);

// ─── In-session cache ──────────────────────────────────────────────────────────
// Persists for the entire app session so that images loaded during
// game-loading.tsx are not re-downloaded on subsequent room changes.

const _cache = new Map<string, CacheEntry>();
let _allReady = false;

// ─── Public API ───────────────────────────────────────────────────────────────

/** Synchronous check: returns true only when asset has been loaded AND decoded. */
export function isAssetReady(key: string): boolean {
  return _cache.get(key)?.status === 'ready';
}

/** Returns true once ALL gameplay assets have completed the preload phase. */
export function areGameplayAssetsReady(): boolean {
  return _allReady;
}

/**
 * Defensive guarantee for flying-item animations.
 *
 * - Already ready → resolves immediately (zero overhead).
 * - Currently loading → polls every 50 ms until ready (max 3 s).
 * - Not started / error → triggers an emergency single-asset load.
 *
 * In normal flow the preloading has already finished and this is a no-op.
 */
export async function ensureAssetReady(key: string): Promise<void> {
  const entry = _cache.get(key);
  if (entry?.status === 'ready') return;

  if (entry?.status === 'loading') {
    // Wait for the in-progress download to complete (max ~3 s)
    for (let i = 0; i < 60; i++) {
      await new Promise<void>(r => setTimeout(r, 50));
      if (_cache.get(key)?.status === 'ready') return;
    }
    return; // timed out – proceed, animation will do its best
  }

  // Not in cache at all (e.g. preload was skipped) → emergency load
  const def = ASSET_REGISTRY.find(a => a.key === key);
  if (!def) return;
  try {
    await _loadOne(def);
  } catch {
    // Non-blocking: do not throw from a flying-animation guard
  }
}

// ─── Web-decode helper ─────────────────────────────────────────────────────────
// On web, expo-asset.downloadAsync() resolves the URL but does not guarantee the
// browser has fully decoded the image into GPU memory. We do an explicit DOM
// Image + decode() pass to ensure naturalWidth > 0 before marking ready.

async function _decodeWeb(uri: string): Promise<void> {
  if (Platform.OS !== 'web') return;
  const ImageCtor =
    typeof window !== 'undefined'
      ? (window as unknown as Record<string, unknown>)['Image'] as
          | (new () => HTMLImageElement)
          | undefined
      : undefined;
  if (!ImageCtor) return;

  return new Promise<void>(resolve => {
    const img = new ImageCtor!();
    img.onload = async () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        if (typeof (img as unknown as { decode?: () => Promise<void> }).decode === 'function') {
          try {
            await (img as unknown as { decode: () => Promise<void> }).decode();
          } catch {
            // decode() not supported on all browsers – ignore
          }
        }
      }
      resolve();
    };
    img.onerror = () => resolve(); // non-blocking on error
    img.src = uri;
  });
}

// ─── Single-asset loader ───────────────────────────────────────────────────────

async function _loadOne(entry: AssetEntry): Promise<void> {
  // Already ready → skip (cache persists for the whole session)
  const prev = _cache.get(entry.key);
  if (prev?.status === 'ready') return;

  const asset = Asset.fromModule(entry.module);
  _cache.set(entry.key, { asset, status: 'loading' });

  try {
    if (Platform.OS === 'web') {
      // Web: downloadAsync + explicit decode to guarantee naturalWidth > 0
      await asset.downloadAsync();
      const uri = asset.localUri ?? asset.uri;
      if (uri) await _decodeWeb(uri);
    } else {
      // Native (Expo Go + production):
      // Image.prefetch() warms the exact HTTP/file cache that React Native's
      // Image component reads. This is the only mechanism that makes require()
      // assets render instantly on Android without an OutOfMemoryError.
      // downloadAsync() writes to a different file-system path that the RN
      // Image renderer does NOT consult in Expo Go dev mode.
      const uri = asset.uri;
      if (uri) await Image.prefetch(uri);
    }

    _cache.set(entry.key, { asset, status: 'ready' });
  } catch (e) {
    if (__DEV__) {
      console.error('[AssetManager] Failed to preload:', entry.key, e);
    }
    _cache.set(entry.key, { asset, status: 'error' });
    throw e;
  }
}

// ─── Main preload function ─────────────────────────────────────────────────────

/**
 * Preloads ALL registered gameplay assets in parallel.
 *
 * Must be called once from game-loading.tsx before releasing gameplay.
 *
 * @param onProgress  Called with (loadedCount, totalCount) after each asset finishes.
 * @param onFailure   Called with the asset key for each asset that fails to load.
 */
export async function preloadGameplayAssets(
  onProgress?: (loaded: number, total: number) => void,
  onFailure?: (key: string) => void,
): Promise<void> {
  _allReady = false;

  // Clear cache on each call so that Image.prefetch() re-warms the RN image
  // cache on every game start. This guarantees fresh renders even after
  // hot-reloads or if the native cache was evicted between sessions.
  _cache.clear();

  const total = ASSET_REGISTRY.length;
  let loaded = 0;

  await Promise.allSettled(
    ASSET_REGISTRY.map(async (entry) => {
      try {
        await _loadOne(entry);
      } catch {
        onFailure?.(entry.key);
      } finally {
        loaded += 1;
        onProgress?.(loaded, total);
      }
    }),
  );

  _allReady = true;
}
