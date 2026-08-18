import {
  getItemMealTags,
  isEdible,
  type BagItem,
  type MealTag,
} from "@/src/game/item-system";

/**
 * Generic meal request for guests/NPCs.
 *
 * Requests deliberately target semantic meal tags instead of item IDs or recipe
 * names. Example: a guest can ask for { requiredTags: ["soup", "vegetarian"] }
 * and any future meal matching those tags can satisfy the request.
 */
export type MealRequest = {
  /** Every listed tag must be present. */
  requiredTags?: readonly MealTag[];
  /** If provided, at least one listed tag must be present. */
  anyTags?: readonly MealTag[];
  /** None of these tags may be present. */
  excludedTags?: readonly MealTag[];
};

export type MealRequestEvaluation = {
  matches: boolean;
  mealTags: MealTag[];
  missingRequiredTags: MealTag[];
  matchedAnyTags: MealTag[];
  excludedTagsPresent: MealTag[];
};

/**
 * Evaluate an item against a semantic meal request.
 * Non-edible items never satisfy meal requests even if they accidentally carry tags.
 */
export function evaluateMealRequest(
  itemOrId: BagItem | string,
  request: MealRequest,
): MealRequestEvaluation {
  const mealTags = getItemMealTags(itemOrId);
  const tagSet = new Set(mealTags);

  const requiredTags = request.requiredTags ?? [];
  const anyTags = request.anyTags ?? [];
  const excludedTags = request.excludedTags ?? [];

  const missingRequiredTags = requiredTags.filter(tag => !tagSet.has(tag));
  const matchedAnyTags = anyTags.filter(tag => tagSet.has(tag));
  const excludedTagsPresent = excludedTags.filter(tag => tagSet.has(tag));

  const requiredMatch = missingRequiredTags.length === 0;
  const anyMatch = anyTags.length === 0 || matchedAnyTags.length > 0;
  const excludedMatch = excludedTagsPresent.length === 0;

  return {
    matches: isEdible(itemOrId) && requiredMatch && anyMatch && excludedMatch,
    mealTags,
    missingRequiredTags,
    matchedAnyTags,
    excludedTagsPresent,
  };
}

export function matchesMealRequest(itemOrId: BagItem | string, request: MealRequest): boolean {
  return evaluateMealRequest(itemOrId, request).matches;
}
