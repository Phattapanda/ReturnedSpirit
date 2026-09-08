import AsyncStorage from "@react-native-async-storage/async-storage";

import { loadPostGuestTutorialState } from "@/src/game/post-guest-tutorial";

export const QUESTBOOK_UNLOCKED_KEY = "@game:questbook_unlocked";

const listeners = new Set<(unlocked: boolean) => void>();

export async function loadQuestBookUnlocked(): Promise<boolean> {
  if (await AsyncStorage.getItem(QUESTBOOK_UNLOCKED_KEY) === "true") return true;

  // Existing saves that already completed Rupert's upgrade introduction receive
  // the Questbook without replaying the one-time gift scene.
  const tutorial = await loadPostGuestTutorialState();
  if (!tutorial.upgradeIntroSeen) return false;
  await AsyncStorage.setItem(QUESTBOOK_UNLOCKED_KEY, "true");
  return true;
}

export async function unlockQuestBook(): Promise<void> {
  await AsyncStorage.setItem(QUESTBOOK_UNLOCKED_KEY, "true");
  listeners.forEach((listener) => listener(true));
}

export function subscribeQuestBookUnlocked(listener: (unlocked: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
