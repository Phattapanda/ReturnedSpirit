import AsyncStorage from "@react-native-async-storage/async-storage";

export const LOGBOOK_KEY = "@game:logbook";

export type LogEntry = {
  id: string;       // stable unique ID (deduplication key)
  speaker: string;  // "Rupert" | "Old Innkeeper" | player name
  text: string;     // full dialog text
  day: string;      // "MO" | "TU" | etc.
  location: string; // "kitchen" | "garden" | "dormitory"
  seq: number;      // insertion order
};

// Keep the most recent 30 sentences, retaining their speaker/day metadata.
export function limitLogbook(entries: LogEntry[]): LogEntry[] {
  let remaining = 30;
  const result: LogEntry[] = [];
  for (let i = entries.length - 1; i >= 0 && remaining > 0; i -= 1) {
    const entry = entries[i];
    const sentences = entry.text.match(/[^.!?]+(?:[.!?]+["'”’]*|$)/g) ?? [];
    const kept = sentences.slice(-remaining);
    if (kept.length > 0) result.unshift({ ...entry, text: kept.join("").trim() });
    remaining -= kept.length;
  }
  return result;
}

// Write an entry once (deduplication by id). Returns the updated list.
export async function appendLogEntry(
  id: string,
  speaker: string,
  text: string,
  day: string,
  location: string,
  existing: LogEntry[],
): Promise<LogEntry[]> {
  if (existing.some((e) => e.id === id)) return existing; // already recorded
  const entry: LogEntry = {
    id, speaker, text, day, location,
    seq: (existing.at(-1)?.seq ?? -1) + 1,
  };
  const updated = limitLogbook([...existing, entry]);
  try {
    await AsyncStorage.setItem(LOGBOOK_KEY, JSON.stringify(updated));
  } catch { /* non-critical */ }
  return updated;
}

export async function loadLogbook(): Promise<LogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(LOGBOOK_KEY);
    return raw ? limitLogbook(JSON.parse(raw) as LogEntry[]) : [];
  } catch {
    return [];
  }
}
