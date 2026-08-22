import AsyncStorage from "@react-native-async-storage/async-storage";

export const PROGRESSION_STATE_KEY = "@game:progression";

export type ProgressionState = {
  version: 1;
  karmaPoints: number;
  runNumber: number;
};

export const DEFAULT_PROGRESSION_STATE: ProgressionState = {
  version: 1,
  karmaPoints: 0,
  runNumber: 1,
};

function normalizeNonNegativeInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

export function normalizeProgressionState(raw: unknown): ProgressionState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PROGRESSION_STATE };
  const candidate = raw as Partial<ProgressionState>;
  return {
    version: 1,
    karmaPoints: normalizeNonNegativeInteger(candidate.karmaPoints, 0),
    runNumber: Math.max(1, normalizeNonNegativeInteger(candidate.runNumber, 1)),
  };
}

export async function loadProgressionState(): Promise<ProgressionState> {
  try {
    const raw = await AsyncStorage.getItem(PROGRESSION_STATE_KEY);
    return raw ? normalizeProgressionState(JSON.parse(raw)) : { ...DEFAULT_PROGRESSION_STATE };
  } catch {
    return { ...DEFAULT_PROGRESSION_STATE };
  }
}

let progressionQueue: Promise<void> = Promise.resolve();

function updateProgressionState(
  updater: (state: ProgressionState) => ProgressionState,
): Promise<ProgressionState> {
  const operation = progressionQueue.then(async () => {
    const current = await loadProgressionState();
    const next = normalizeProgressionState(updater(current));
    await AsyncStorage.setItem(PROGRESSION_STATE_KEY, JSON.stringify(next));
    return next;
  });
  progressionQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export function addKarmaPoints(amount: number): Promise<ProgressionState> {
  const normalizedAmount = Math.max(0, Math.floor(Number(amount) || 0));
  return updateProgressionState((state) => ({
    ...state,
    karmaPoints: state.karmaPoints + normalizedAmount,
  }));
}

export function beginNextRun(): Promise<ProgressionState> {
  return updateProgressionState((state) => ({
    ...state,
    runNumber: state.runNumber + 1,
  }));
}

