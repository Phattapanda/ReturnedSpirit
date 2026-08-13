// Central shared resource storage
// Accessed by: Room Upgrades, Garden Constructions, Tavern, future systems

export type ResourceId = "wood" | "nails" | "stone" | "cloth" | "paint";

export type SharedResources = {
  wood:  number;
  nails: number;
  stone: number;
  cloth: number;
  paint: number;
};

export const SHARED_RESOURCE_DEFAULTS: SharedResources = {
  wood: 0, nails: 0, stone: 0, cloth: 0, paint: 0,
};

export const RESOURCE_NAMES: Record<ResourceId, string> = {
  wood:  "Wood",
  nails: "Nails",
  stone: "Stone",
  cloth: "Cloth",
  paint: "Paint",
};

// Core materials shown even at qty 0 (unlike optional seeds/fertilizers)
export const CORE_MATERIAL_IDS: ResourceId[] = ["wood", "nails", "stone", "cloth", "paint"];

export const SHARED_RESOURCES_KEY = "@shared:resources";
