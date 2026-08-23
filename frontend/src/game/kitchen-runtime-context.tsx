import { createContext, useContext } from "react";

export type KitchenRuntimeContextValue = {
  refreshKitchen: () => void;
  showPlayerThought: (text: string) => void;
};

const playerThoughtListeners = new Set<(text: string) => void>();

export function notifyKitchenPlayerThought(text: string): void {
  playerThoughtListeners.forEach((listener) => listener(text));
}

export function subscribeKitchenPlayerThought(listener: (text: string) => void): () => void {
  playerThoughtListeners.add(listener);
  return () => playerThoughtListeners.delete(listener);
}

const DEFAULT_VALUE: KitchenRuntimeContextValue = {
  refreshKitchen: () => {},
  showPlayerThought: notifyKitchenPlayerThought,
};

export const KitchenRuntimeContext = createContext<KitchenRuntimeContextValue>(DEFAULT_VALUE);

export function useKitchenRuntime(): KitchenRuntimeContextValue {
  return useContext(KitchenRuntimeContext);
}
