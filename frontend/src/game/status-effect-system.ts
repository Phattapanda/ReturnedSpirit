export type StatusEffectKind = "buff" | "debuff";
export type EffectStackingRule = "refresh" | "stack_duration" | "stack_intensity" | "replace";

export type StatusEffectDefinition = {
  id: string;
  name: string;
  kind: StatusEffectKind;
  description: string;
  defaultDurationDays: number;
  stacking: EffectStackingRule;
  maxStacks?: number;
  maxDurationDays?: number;
  sourceItemId?: string;
  cureTags?: string[];
  modifiers?: {
    staminaCostReduction?: number;
    fireResistance?: number;
  };
};

export type TraitDefinition = {
  id: string;
  name: string;
  description: string;
  defaultDurationRuns: number;
  modifiers?: {
    fireDamageTakenMultiplier?: number;
  };
  cureCondition?: {
    event: "defeat_fire_monster";
    required: number;
    description: string;
  };
};

export type ActiveStatusEffect = {
  id: string;
  kind: StatusEffectKind;
  remainingDays: number;
  stacks: number;
};

export type ActiveTrait = {
  id: string;
  remainingRuns: number;
  cureProgress: number;
};

export type StatusEffectState = {
  version: 1;
  temporary: ActiveStatusEffect[];
  traits: ActiveTrait[];
};

export const DEFAULT_STATUS_EFFECT_STATE: StatusEffectState = {
  version: 1,
  temporary: [],
  traits: [],
};

export const STATUS_EFFECT_DEFINITIONS: Record<string, StatusEffectDefinition> = {
  energy_drink: {
    id: "energy_drink",
    name: "Energy Drink",
    kind: "buff",
    description: "Stamina-consuming actions cost 1 less Stamina.",
    defaultDurationDays: 5,
    stacking: "refresh",
    sourceItemId: "energydrink",
    modifiers: { staminaCostReduction: 1 },
  },
  energy_pill: {
    id: "energy_pill",
    name: "Energy Pill",
    kind: "buff",
    description: "Stamina-consuming actions cost 1 less Stamina.",
    defaultDurationDays: 10,
    stacking: "refresh",
    sourceItemId: "energypill",
    modifiers: { staminaCostReduction: 1 },
  },
  fire_resistance_2: {
    id: "fire_resistance_2",
    name: "Fire Resistance +2",
    kind: "buff",
    description: "Increases Fire Resistance by 2.",
    defaultDurationDays: 1,
    stacking: "refresh",
    sourceItemId: "soup_ember_egg",
    modifiers: { fireResistance: 2 },
  },
  fire_resistance_3: {
    id: "fire_resistance_3",
    name: "Fire Resistance +3",
    kind: "buff",
    description: "Increases Fire Resistance by 3.",
    defaultDurationDays: 1,
    stacking: "refresh",
    sourceItemId: "stew_ember_chicken",
    modifiers: { fireResistance: 3 },
  },
};

export const TRAIT_DEFINITIONS: Record<string, TraitDefinition> = {
  fear_of_fire: {
    id: "fear_of_fire",
    name: "Fear of Fire",
    description: "You take 20% more damage from fire attacks.",
    defaultDurationRuns: 1,
    modifiers: { fireDamageTakenMultiplier: 1.2 },
    cureCondition: {
      event: "defeat_fire_monster",
      required: 5,
      description: "Defeat 5 fire monsters in this run.",
    },
  },
};

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : fallback;
}

function cloneState(state: StatusEffectState): StatusEffectState {
  return {
    version: 1,
    temporary: state.temporary.map((effect) => ({ ...effect })),
    traits: state.traits.map((trait) => ({ ...trait })),
  };
}

export function normalizeStatusEffectState(
  raw: unknown,
  legacyStaminaBuffs?: { energyDrinkDays?: unknown; energyPillDays?: unknown } | null,
): StatusEffectState {
  const candidate = raw && typeof raw === "object" ? raw as Partial<StatusEffectState> : null;
  const temporary = Array.isArray(candidate?.temporary)
    ? candidate.temporary.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const active = entry as Partial<ActiveStatusEffect>;
        const definition = typeof active.id === "string" ? STATUS_EFFECT_DEFINITIONS[active.id] : undefined;
        if (!definition) return [];
        return [{
          id: definition.id,
          kind: definition.kind,
          remainingDays: positiveInteger(active.remainingDays, definition.defaultDurationDays),
          stacks: Math.min(
            definition.maxStacks ?? 1,
            positiveInteger(active.stacks, 1),
          ),
        }];
      })
    : [];

  const traits = Array.isArray(candidate?.traits)
    ? candidate.traits.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const active = entry as Partial<ActiveTrait>;
        const definition = typeof active.id === "string" ? TRAIT_DEFINITIONS[active.id] : undefined;
        if (!definition) return [];
        return [{
          id: definition.id,
          remainingRuns: positiveInteger(active.remainingRuns, definition.defaultDurationRuns),
          cureProgress: Math.max(0, Math.floor(Number(active.cureProgress) || 0)),
        }];
      })
    : [];

  let state: StatusEffectState = { version: 1, temporary, traits };
  if (!candidate && legacyStaminaBuffs) {
    const drinkDays = Math.max(0, Math.floor(Number(legacyStaminaBuffs.energyDrinkDays) || 0));
    const pillDays = Math.max(0, Math.floor(Number(legacyStaminaBuffs.energyPillDays) || 0));
    if (drinkDays > 0) state = applyTemporaryEffect(state, "energy_drink", drinkDays);
    if (pillDays > 0) state = applyTemporaryEffect(state, "energy_pill", pillDays);
  }
  return state;
}

export function getEffectDefinition(id: string): StatusEffectDefinition | null {
  return STATUS_EFFECT_DEFINITIONS[id] ?? null;
}

export function getTraitDefinition(id: string): TraitDefinition | null {
  return TRAIT_DEFINITIONS[id] ?? null;
}

export function getEffectForConsumable(itemId: string): StatusEffectDefinition | null {
  return Object.values(STATUS_EFFECT_DEFINITIONS).find((effect) => effect.sourceItemId === itemId) ?? null;
}

export function hasTemporaryEffect(state: StatusEffectState, effectId: string): boolean {
  return state.temporary.some((effect) => effect.id === effectId && effect.remainingDays > 0);
}

export function applyTemporaryEffect(
  state: StatusEffectState,
  effectId: string,
  durationDays?: number,
): StatusEffectState {
  const definition = STATUS_EFFECT_DEFINITIONS[effectId];
  if (!definition) return cloneState(state);
  const duration = positiveInteger(durationDays, definition.defaultDurationDays);
  const next = cloneState(state);
  const index = next.temporary.findIndex((effect) => effect.id === effectId);
  if (index < 0) {
    next.temporary.push({ id: effectId, kind: definition.kind, remainingDays: duration, stacks: 1 });
    return next;
  }

  const current = next.temporary[index];
  if (definition.stacking === "stack_duration") {
    current.remainingDays = Math.min(
      definition.maxDurationDays ?? Number.MAX_SAFE_INTEGER,
      current.remainingDays + duration,
    );
  } else if (definition.stacking === "stack_intensity") {
    current.stacks = Math.min(definition.maxStacks ?? 1, current.stacks + 1);
    current.remainingDays = Math.max(current.remainingDays, duration);
  } else if (definition.stacking === "replace") {
    next.temporary[index] = { id: effectId, kind: definition.kind, remainingDays: duration, stacks: 1 };
  } else {
    current.remainingDays = Math.max(current.remainingDays, duration);
  }
  return next;
}

export function advanceTemporaryEffectsDay(state: StatusEffectState): StatusEffectState {
  return {
    ...cloneState(state),
    temporary: state.temporary
      .map((effect) => ({ ...effect, remainingDays: effect.remainingDays - 1 }))
      .filter((effect) => effect.remainingDays > 0),
  };
}

export function removeEffectsByCureTags(
  state: StatusEffectState,
  cureTags: readonly string[],
): StatusEffectState {
  const tags = new Set(cureTags);
  return {
    ...cloneState(state),
    temporary: state.temporary.filter((effect) => {
      const definition = STATUS_EFFECT_DEFINITIONS[effect.id];
      return !definition?.cureTags?.some((tag) => tags.has(tag));
    }),
  };
}

export function grantTrait(
  state: StatusEffectState,
  traitId: string,
  durationRuns?: number,
): StatusEffectState {
  const definition = TRAIT_DEFINITIONS[traitId];
  if (!definition) return cloneState(state);
  const next = cloneState(state);
  const duration = positiveInteger(durationRuns, definition.defaultDurationRuns);
  const existing = next.traits.find((trait) => trait.id === traitId);
  if (existing) {
    existing.remainingRuns = Math.max(existing.remainingRuns, duration);
    existing.cureProgress = 0;
  } else {
    next.traits.push({ id: traitId, remainingRuns: duration, cureProgress: 0 });
  }
  return next;
}

/** Death clears temporary effects, ages existing traits, then grants traits for the new run. */
export function advanceEffectsToNextRun(
  state: StatusEffectState,
  grantedTraitIds: readonly string[] = [],
): StatusEffectState {
  let next: StatusEffectState = {
    version: 1,
    temporary: [],
    traits: state.traits
      .map((trait) => ({ ...trait, remainingRuns: trait.remainingRuns - 1, cureProgress: 0 }))
      .filter((trait) => trait.remainingRuns > 0),
  };
  for (const traitId of grantedTraitIds) next = grantTrait(next, traitId);
  return next;
}

export function recordTraitCureEvent(
  state: StatusEffectState,
  event: "defeat_fire_monster",
  amount = 1,
): { state: StatusEffectState; curedTraitIds: string[] } {
  const curedTraitIds: string[] = [];
  const traits = state.traits.flatMap((trait) => {
    const definition = TRAIT_DEFINITIONS[trait.id];
    if (!definition?.cureCondition || definition.cureCondition.event !== event) return [{ ...trait }];
    const cureProgress = trait.cureProgress + Math.max(0, Math.floor(amount));
    if (cureProgress >= definition.cureCondition.required) {
      curedTraitIds.push(trait.id);
      return [];
    }
    return [{ ...trait, cureProgress }];
  });
  return { state: { version: 1, temporary: state.temporary.map((effect) => ({ ...effect })), traits }, curedTraitIds };
}

export function getStatusModifiers(state: StatusEffectState): {
  staminaCostReduction: number;
  fireResistance: number;
  fireDamageTakenMultiplier: number;
} {
  const staminaCostReduction = state.temporary.reduce((total, active) => {
    const value = STATUS_EFFECT_DEFINITIONS[active.id]?.modifiers?.staminaCostReduction ?? 0;
    return total + value * active.stacks;
  }, 0);
  const fireResistance = state.temporary.reduce((total, active) => {
    const value = STATUS_EFFECT_DEFINITIONS[active.id]?.modifiers?.fireResistance ?? 0;
    return total + value * active.stacks;
  }, 0);
  const fireDamageTakenMultiplier = state.traits.reduce((total, active) => {
    return total * (TRAIT_DEFINITIONS[active.id]?.modifiers?.fireDamageTakenMultiplier ?? 1);
  }, 1);
  return { staminaCostReduction, fireResistance, fireDamageTakenMultiplier };
}
