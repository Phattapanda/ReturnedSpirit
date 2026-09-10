import AsyncStorage from "@react-native-async-storage/async-storage";

import type { MinstrelTrackKey } from "@/src/audio/audioEngine";
import { spendCurrencyCopper } from "@/src/game/currency-system";

export const MINSTREL_STATE_KEY = "@city:minstrel_state";

export type MinstrelSongId = "classical" | "rock" | "pop" | "rave" | "metal" | "kpop" | "alpine" | "techno" | "country" | "hiphop";
export type MinstrelSong = { id: MinstrelSongId; genre: string; title: string; priceCopper: 3 | 7; audioKey: MinstrelTrackKey };

export const MINSTREL_SONGS: readonly MinstrelSong[] = [
  { id: "classical", genre: "Classical (instrumental)", title: "Feathered Banner", priceCopper: 3, audioKey: "minstrel-classical" },
  { id: "rock", genre: "Rock (instrumental)", title: "Marketgate Riot", priceCopper: 3, audioKey: "minstrel-rock" },
  { id: "pop", genre: "Pop (instrumental)", title: "Stonegate Dance", priceCopper: 3, audioKey: "minstrel-pop" },
  { id: "rave", genre: "Rave", title: "Hey-Ho Beneath the Castle", priceCopper: 7, audioKey: "minstrel-rave" },
  { id: "metal", genre: "Metal", title: "Hold the Line", priceCopper: 7, audioKey: "minstrel-metal" },
  { id: "kpop", genre: "K-Pop Musical", title: "Age of Stone", priceCopper: 7, audioKey: "minstrel-kpop" },
  { id: "alpine", genre: "Alpine Folk", title: "Over the Hill We Go", priceCopper: 7, audioKey: "minstrel-alpine" },
  { id: "techno", genre: "Techno", title: "Ride the Wheel", priceCopper: 7, audioKey: "minstrel-techno" },
  { id: "country", genre: "Country", title: "The Road We Own", priceCopper: 7, audioKey: "minstrel-country" },
  { id: "hiphop", genre: "Hip Hop", title: "Timber and Stone", priceCopper: 7, audioKey: "minstrel-hiphop" },
];

export type MinstrelState = { introduced: boolean; unlockedSongIds: MinstrelSongId[] };
export const DEFAULT_MINSTREL_STATE: MinstrelState = { introduced: false, unlockedSongIds: [] };

function normalizeMinstrelState(raw: string | null): MinstrelState {
  if (!raw) return { ...DEFAULT_MINSTREL_STATE };
  try {
    const parsed = JSON.parse(raw) as Partial<MinstrelState>;
    const validIds = new Set(MINSTREL_SONGS.map((song) => song.id));
    return {
      introduced: parsed.introduced === true,
      unlockedSongIds: Array.isArray(parsed.unlockedSongIds)
        ? [...new Set(parsed.unlockedSongIds.filter((id): id is MinstrelSongId => typeof id === "string" && validIds.has(id as MinstrelSongId)))]
        : [],
    };
  } catch {
    return { ...DEFAULT_MINSTREL_STATE };
  }
}

export async function loadMinstrelState(): Promise<MinstrelState> {
  return normalizeMinstrelState(await AsyncStorage.getItem(MINSTREL_STATE_KEY));
}

export async function markMinstrelIntroductionSeen(): Promise<MinstrelState> {
  const current = await loadMinstrelState();
  const next = { ...current, introduced: true };
  await AsyncStorage.setItem(MINSTREL_STATE_KEY, JSON.stringify(next));
  return next;
}

export async function unlockMinstrelSong(songId: MinstrelSongId): Promise<{ ok: boolean; message: string; state: MinstrelState }> {
  const current = await loadMinstrelState();
  if (current.unlockedSongIds.includes(songId)) return { ok: true, message: "This song is already unlocked.", state: current };
  const song = MINSTREL_SONGS.find((entry) => entry.id === songId);
  if (!song) return { ok: false, message: "This song is not available.", state: current };
  const remaining = await spendCurrencyCopper(song.priceCopper);
  if (remaining === null) return { ok: false, message: "You don't have enough Copper Coins.", state: current };
  const next = { ...current, unlockedSongIds: [...current.unlockedSongIds, songId] };
  await AsyncStorage.setItem(MINSTREL_STATE_KEY, JSON.stringify(next));
  return { ok: true, message: `${song.title} unlocked.`, state: next };
}
