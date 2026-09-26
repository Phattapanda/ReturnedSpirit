import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { DEFAULT_WATER_STORAGE, loadWaterStorage, subscribeWaterStorage } from "@/src/game/water-storage";

export function useWaterStorage() {
  const [water, setWater] = useState(DEFAULT_WATER_STORAGE);
  useFocusEffect(useCallback(() => {
    let active = true;
    void loadWaterStorage().then((state) => { if (active) setWater(state); });
    const unsubscribe = subscribeWaterStorage(setWater);
    return () => { active = false; unsubscribe(); };
  }, []));
  return water;
}
