import React, { createContext, useContext } from "react";

export type GardenRuntimeContextValue = {
  refreshGarden: () => void;
  showPlayerThought: (text: string) => void;
};

const DEFAULT_VALUE: GardenRuntimeContextValue = {
  refreshGarden: () => {},
  showPlayerThought: () => {},
};

export const GardenRuntimeContext = createContext<GardenRuntimeContextValue>(DEFAULT_VALUE);

export function useGardenRuntime(): GardenRuntimeContextValue {
  return useContext(GardenRuntimeContext);
}
