import React, { createContext, useContext } from "react";

export type GardenRuntimeContextValue = {
  refreshGarden: () => void;
  showPlayerThought: (text: string) => void;
};

const runtimeRefreshListeners = new Set<() => void>();

/**
 * Notify the mounted Garden screen that persistent values changed outside its
 * own state handlers (for example actions on the independently stateful 2nd Plot).
 * This is intentionally a soft sync: it must never remount the room or reset scroll.
 */
export function notifyGardenRuntimeRefresh(): void {
  runtimeRefreshListeners.forEach((listener) => listener());
}

export function subscribeGardenRuntimeRefresh(listener: () => void): () => void {
  runtimeRefreshListeners.add(listener);
  return () => runtimeRefreshListeners.delete(listener);
}

const DEFAULT_VALUE: GardenRuntimeContextValue = {
  refreshGarden: notifyGardenRuntimeRefresh,
  showPlayerThought: () => {},
};

export const GardenRuntimeContext = createContext<GardenRuntimeContextValue>(DEFAULT_VALUE);

export function useGardenRuntime(): GardenRuntimeContextValue {
  return useContext(GardenRuntimeContext);
}
