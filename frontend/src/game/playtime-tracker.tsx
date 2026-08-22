import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePathname } from "expo-router";
import React, { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";

const ACTIVE_SLOT_KEY = "@game:active_slot";
const GAME_SLOTS_KEY = "game_slots";
const GAMEPLAY_ROUTES = new Set(["/intro", "/kitchen", "/garden", "/dining", "/dormitory"]);

let activeSlot: number | null = null;
let startedAtMs: number | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let gameplayRouteActive = false;
let playtimePaused = false;

type SaveSlotWithPlaytime = {
  slot: number;
  playtime?: number;
  playtimeSeconds?: number;
  [key: string]: unknown;
};

function elapsedWholeSeconds(nowMs: number): number {
  if (startedAtMs === null) return 0;
  return Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
}

export function flushPlaytime(): Promise<void> {
  const now = Date.now();
  const seconds = elapsedWholeSeconds(now);
  const slotNumber = activeSlot;
  if (startedAtMs !== null) startedAtMs = now;
  if (!slotNumber || seconds <= 0) return writeQueue;

  writeQueue = writeQueue.then(async () => {
    const raw = await AsyncStorage.getItem(GAME_SLOTS_KEY);
    if (!raw) return;
    const slots = JSON.parse(raw) as SaveSlotWithPlaytime[];
    const updated = slots.map((slot) => {
      if (slot.slot !== slotNumber) return slot;
      const legacySeconds = Math.max(0, Math.floor(Number(slot.playtime) || 0)) * 60;
      const currentSeconds = Number.isFinite(Number(slot.playtimeSeconds))
        ? Math.max(0, Math.floor(Number(slot.playtimeSeconds)))
        : legacySeconds;
      return { ...slot, playtimeSeconds: currentSeconds + seconds };
    });
    await AsyncStorage.setItem(GAME_SLOTS_KEY, JSON.stringify(updated));
  });
  return writeQueue;
}

async function startTracking(): Promise<void> {
  if (startedAtMs !== null || playtimePaused || !gameplayRouteActive) return;
  const rawSlot = await AsyncStorage.getItem(ACTIVE_SLOT_KEY);
  const slotNumber = rawSlot ? Number.parseInt(rawSlot, 10) : 0;
  if (!Number.isFinite(slotNumber) || slotNumber <= 0) return;
  activeSlot = slotNumber;
  startedAtMs = Date.now();
}

export async function setPlaytimePaused(paused: boolean): Promise<void> {
  if (playtimePaused === paused) return;
  playtimePaused = paused;
  if (paused) await stopTracking();
  else if (gameplayRouteActive && AppState.currentState === "active") await startTracking();
}

async function stopTracking(): Promise<void> {
  await flushPlaytime();
  startedAtMs = null;
  activeSlot = null;
}

export function PlaytimeTracker() {
  const pathname = usePathname();
  const isGameplayRoute = GAMEPLAY_ROUTES.has(pathname);

  useEffect(() => {
    gameplayRouteActive = isGameplayRoute;
    if (isGameplayRoute && AppState.currentState === "active") {
      void startTracking();
    } else {
      void stopTracking();
    }
    return () => { gameplayRouteActive = false; };
  }, [isGameplayRoute]);

  useEffect(() => {
    function handleAppState(nextState: AppStateStatus) {
      if (nextState === "active" && isGameplayRoute) void startTracking();
      else void stopTracking();
    }

    const subscription = AppState.addEventListener("change", handleAppState);
    const interval = setInterval(() => { void flushPlaytime(); }, 30_000);
    return () => {
      subscription.remove();
      clearInterval(interval);
      void stopTracking();
    };
  }, [isGameplayRoute]);

  return null;
}
