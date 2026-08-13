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
    seq: existing.length,
  };
  const updated = [...existing, entry];
  try {
    await AsyncStorage.setItem(LOGBOOK_KEY, JSON.stringify(updated));
  } catch { /* non-critical */ }
  return updated;
}

export async function loadLogbook(): Promise<LogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(LOGBOOK_KEY);
    return raw ? (JSON.parse(raw) as LogEntry[]) : [];
  } catch {
    return [];
  }
}
