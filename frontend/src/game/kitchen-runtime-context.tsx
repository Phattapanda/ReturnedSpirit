import React, { createContext, useContext } from "react";

export type KitchenRuntimeContextValue = {
  refreshKitchen: () => void;
  showPlayerThought: (text: string) => void;
};

const DEFAULT_VALUE: KitchenRuntimeContextValue = {
  refreshKitchen: () => {},
  showPlayerThought: () => {},
};

export const KitchenRuntimeContext = createContext<KitchenRuntimeContextValue>(DEFAULT_VALUE);

export function useKitchenRuntime(): KitchenRuntimeContextValue {
  return useContext(KitchenRuntimeContext);
}
