// ─── Activity Bar Configuration ───────────────────────────────────────────────

export type ActivityId = "well" | "collectWood" | "collectStone" | "workout";

export type ActivityConfig = {
  id: ActivityId;
  label: string;
  iconName: string;
  baseStaminaCost: number;
  tutorialLocked: boolean;
};

export const ACTIVITIES: ActivityConfig[] = [
  { id: "well",         label: "Well",          iconName: "water-outline",   baseStaminaCost: 3,  tutorialLocked: false },
  { id: "collectWood",  label: "Collect\nWood", iconName: "leaf-outline",    baseStaminaCost: 5,  tutorialLocked: true  },
  { id: "collectStone", label: "Collect\nStone",iconName: "cube-outline",    baseStaminaCost: 5,  tutorialLocked: true  },
  { id: "workout",      label: "Workout",       iconName: "barbell-outline", baseStaminaCost: 15, tutorialLocked: true  },
];
