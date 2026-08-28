import AsyncStorage from "@react-native-async-storage/async-storage";

export const GAME_SETTINGS_KEY = "game_settings";

export type HapticsMode = "off" | "light" | "medium" | "strong";

export type GameSettings = {
  musicVolume: number;
  sfxVolume: number;
  haptics: HapticsMode;
};

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  musicVolume: 75,
  sfxVolume: 75,
  haptics: "light",
};

function volume(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : fallback;
}

function hapticsMode(value: unknown, legacyValue?: unknown): HapticsMode {
  const candidate = value ?? legacyValue;
  return candidate === "off" || candidate === "light" || candidate === "medium" || candidate === "strong"
    ? candidate
    : DEFAULT_GAME_SETTINGS.haptics;
}

export function normalizeGameSettings(raw: unknown): GameSettings {
  const settings = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    musicVolume: volume(settings.musicVolume, DEFAULT_GAME_SETTINGS.musicVolume),
    sfxVolume: volume(settings.sfxVolume, DEFAULT_GAME_SETTINGS.sfxVolume),
    haptics: hapticsMode(settings.haptics, settings.vibration),
  };
}

export async function loadGameSettings(): Promise<GameSettings> {
  try {
    const raw = await AsyncStorage.getItem(GAME_SETTINGS_KEY);
    return normalizeGameSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_GAME_SETTINGS };
  }
}

let writeQueue: Promise<GameSettings> = Promise.resolve({ ...DEFAULT_GAME_SETTINGS });

/** Serialize merges so two sliders and Haptics cannot overwrite each other. */
export function updateGameSettings(patch: Partial<GameSettings>): Promise<GameSettings> {
  writeQueue = writeQueue.then(async () => {
    const current = await loadGameSettings();
    const next = normalizeGameSettings({ ...current, ...patch });
    await AsyncStorage.setItem(GAME_SETTINGS_KEY, JSON.stringify(next));
    return next;
  });
  return writeQueue;
}
