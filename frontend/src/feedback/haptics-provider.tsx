import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import * as Haptics from "expo-haptics";

import {
  DEFAULT_GAME_SETTINGS,
  loadGameSettings,
  updateGameSettings,
  type HapticsMode,
} from "@/src/settings/game-settings";

export type HapticEvent = "choice" | "craft" | "guest-served" | "level-up";

type HapticsContextValue = {
  hapticsMode: HapticsMode;
  setHapticsMode: (mode: HapticsMode) => void;
  triggerHaptic: (event: HapticEvent) => void;
};

const HapticsContext = createContext<HapticsContextValue | null>(null);

function impactStyle(mode: HapticsMode): Haptics.ImpactFeedbackStyle {
  if (mode === "strong") return Haptics.ImpactFeedbackStyle.Heavy;
  if (mode === "medium") return Haptics.ImpactFeedbackStyle.Medium;
  return Haptics.ImpactFeedbackStyle.Light;
}

export function HapticsProvider({ children }: { children: React.ReactNode }) {
  const [hapticsMode, setModeState] = useState<HapticsMode>(DEFAULT_GAME_SETTINGS.haptics);

  const reload = useCallback(() => {
    loadGameSettings().then((settings) => setModeState(settings.haptics)).catch(() => {});
  }, []);

  useEffect(() => {
    reload();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") reload();
    });
    return () => subscription.remove();
  }, [reload]);

  const setHapticsMode = useCallback((mode: HapticsMode) => {
    setModeState(mode);
    updateGameSettings({ haptics: mode }).catch(() => {});
    if (mode !== "off") void Haptics.impactAsync(impactStyle(mode));
  }, []);

  const triggerHaptic = useCallback((event: HapticEvent) => {
    if (hapticsMode === "off") return;
    if (event === "choice") {
      void Haptics.selectionAsync();
    } else if (event === "level-up") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      void Haptics.impactAsync(impactStyle(hapticsMode));
    }
  }, [hapticsMode]);

  const value = useMemo(() => ({ hapticsMode, setHapticsMode, triggerHaptic }), [hapticsMode, setHapticsMode, triggerHaptic]);
  return <HapticsContext.Provider value={value}>{children}</HapticsContext.Provider>;
}

export function useHaptics(): HapticsContextValue {
  const value = useContext(HapticsContext);
  if (!value) throw new Error("useHaptics must be used within HapticsProvider");
  return value;
}
