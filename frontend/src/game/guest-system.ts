import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  DEFAULT_BAG,
  PLAYER_BAG_KEY,
  planAddToBag,
  getItemMealTags,
  type BagItem,
  type MealTag,
} from "@/src/game/item-system";
import { MEAL_TAG } from "@/src/game/item-system";
import { addKarmaPoints } from "@/src/game/progression";
import {
  areExpandedGuestsUnlockedForDay,
  areRegularGuestsUnlockedForDay,
  loadPostGuestTutorialState,
} from "@/src/game/post-guest-tutorial";

export const GUEST_STATE_KEY = "@game:guest_state";

export type GuestId = "old_farmer" | "coachman" | "merchant" | "traveler" | "city_guard" | "local_boozer" | (string & {});

export type GuestExchangeMode = "daily_roll" | "meal_value" | "none";

export type GuestFavorTier = {
  minFavor: number;
  maxFavor: number;
  /** Weekday indices use the existing game convention: MO=0 ... SU=6. */
  visitDays: readonly number[];
  /** Reserved for guests whose favor changes another system, e.g. Coachman transport. */
  transportDiscountPercent?: number;
  exchangePool?: readonly GuestExchangeOffer[];
};

export type GuestExchangeOffer = {
  itemId: string;
  name: string;
  quantity: number;
  /** Percentage weight within this tier. Pools always total 100. */
  weight: number;
};

export type GuestProfile = {
  id: GuestId;
  name: string;
  portraitKey: string;
  /** Default visit days. favorTiers can override these at the guest's current favor. */
  visitDays: readonly number[];
  favorTiers?: readonly GuestFavorTier[];
  initialFavor: number;
  favoriteDishId: string | null;
  leastFavoriteDishId: string | null;
  preferredMealTags: readonly MealTag[];
  dislikedMealTags: readonly MealTag[];
  /** Default exchange pool. Favor tiers can replace it. */
  exchangePool: readonly GuestExchangeOffer[];
  /** Meal-value exchanges are resolved only after the player selects a meal. */
  exchangeMode?: GuestExchangeMode;
  /** Non-relationship guests never earn favor rewards. */
  usesFavor?: boolean;
};

export type GuestVisitTrade = {
  daySerial: number;
  offer: GuestExchangeOffer;
  claimed: boolean;
};

export type PendingFavorGift = {
  favorTier: number;
  item: BagItem;
};

export type GuestPreferenceFactKey =
  | "favorite_dish"
  | "least_favorite_dish"
  | `preferred_tag:${MealTag}`
  | `disliked_tag:${MealTag}`;

export type GuestPreferenceDiscoveryResult =
  | { outcome: "learned"; factKey: GuestPreferenceFactKey; learnedFactKeys: GuestPreferenceFactKey[] }
  | { outcome: "nothing_learned" | "already_known" | "no_preferences"; learnedFactKeys: GuestPreferenceFactKey[] };

export type GuestState = {
  version: 4;
  /** Monotonic in-game day counter used to distinguish visits across week wraps. */
  calendarDaySerial: number;
  /** Current weekday in the game's existing MO=0 ... SU=6 format. */
  calendarWeekday: number;
  favors: Record<string, number>;
  activeGuestId: GuestId | null;
  /** Only the current/most recent visit roll per guest is retained. */
  visitTrades: Record<string, GuestVisitTrade>;
  rewardedFavorTiers: Record<string, number[]>;
  pendingFavorGifts: Record<string, PendingFavorGift[]>;
  giftDialogDaySerial: Record<string, number>;
  /** The day on which each guest has already received food or water. */
  servedDaySerial: Record<string, number>;
  /** Preference facts discovered by talking to each guest. */
  learnedPreferenceFacts: Record<string, GuestPreferenceFactKey[]>;
};

export type GuestVisitView = {
  profile: GuestProfile;
  favor: number;
  exchangeOffer: GuestExchangeOffer | null;
  transportDiscountPercent: number;
  selected: boolean;
  favorRewardDialog: string | null;
  learnedPreferenceFacts: readonly GuestPreferenceFactKey[];
};

const FAVOR_GIFT_SUCCESS = "Thank you very much for your hospitality. I like coming here. Here, take this.";
const FAVOR_GIFT_DEFERRED = "Thank you very much for your hospitality.  I’d like to give you something. I don’t have it with me right now, but I’ll bring it next time.";
const favorRewardListeners = new Set<(guestId: GuestId, text: string) => void>();

export type FavorChangeFeedbackKind = "increase" | "big_increase" | "stage_increase" | "decrease";

export type FavorChangeFeedback = {
  guestId: GuestId;
  previousFavor: number;
  nextFavor: number;
  delta: number;
  kind: FavorChangeFeedbackKind;
};

const FAVOR_STAGE_THRESHOLDS = [25, 50, 75, 99, 100] as const;
const favorChangeListeners = new Set<(feedback: FavorChangeFeedback) => void>();

export function subscribeFavorChangeFeedback(listener: (feedback: FavorChangeFeedback) => void): () => void {
  favorChangeListeners.add(listener);
  return () => { favorChangeListeners.delete(listener); };
}

function emitFavorChangeFeedback(guestId: GuestId, previousFavor: number, nextFavor: number) {
  const delta = nextFavor - previousFavor;
  if (delta === 0) return;

  const crossedFavorStage = delta > 0 && FAVOR_STAGE_THRESHOLDS.some(
    (threshold) => previousFavor < threshold && nextFavor >= threshold,
  );
  const kind: FavorChangeFeedbackKind = delta < 0
    ? "decrease"
    : crossedFavorStage
      ? "stage_increase"
      : delta >= 3
        ? "big_increase"
        : "increase";

  const feedback = { guestId, previousFavor, nextFavor, delta, kind };
  for (const listener of favorChangeListeners) listener(feedback);
}

export function subscribeFavorRewardDialog(listener: (guestId: GuestId, text: string) => void): () => void {
  favorRewardListeners.add(listener);
  return () => { favorRewardListeners.delete(listener); };
}

function emitFavorRewardDialog(guestId: GuestId, text: string) {
  for (const listener of favorRewardListeners) listener(guestId, text);
}

function exchangeOffer(itemId: string, name: string, quantity: number, weight: number): GuestExchangeOffer {
  return { itemId, name, quantity, weight };
}

const LEGACY_EXCHANGE_ITEM_IDS: Record<string, string> = {
  carrotseed: "seed_carrot",
  herbseed: "seed_herb",
  onionseed: "seed_onion",
  potatoseed: "seed_potato",
  standardfertilizer: "standard_fertilizer",
  premiumfertilizer: "premium_fertilizer",
};

export function normalizeGuestExchangeItemId(itemId: string): string {
  return LEGACY_EXCHANGE_ITEM_IDS[itemId] ?? itemId;
}

const OLD_FARMER_VISIT_DAYS = [1, 2, 4, 5, 6] as const;
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6] as const;

export const OLD_FARMER_PROFILE: GuestProfile = {
  id: "old_farmer",
  name: "Old Farmer",
  portraitKey: "old_farmer",
  visitDays: OLD_FARMER_VISIT_DAYS, // TU / WE / FR / SA / SU
  favorTiers: [
    {
      minFavor: 0, maxFavor: 24, visitDays: OLD_FARMER_VISIT_DAYS,
      exchangePool: [
        exchangeOffer("potato", "Potato", 2, 17.5),
        exchangeOffer("carrot", "Carrot", 2, 17.5),
        exchangeOffer("standard_fertilizer", "Standard Fertilizer", 3, 17.5),
        exchangeOffer("seed_carrot", "Carrot Seed", 1, 17.5),
        exchangeOffer("onion", "Onion", 1, 10),
        exchangeOffer("seed_potato", "Potato Seed", 1, 10),
        exchangeOffer("egg", "Egg", 1, 10),
      ],
    },
    {
      minFavor: 25, maxFavor: 49, visitDays: OLD_FARMER_VISIT_DAYS,
      exchangePool: [
        exchangeOffer("potato", "Potato", 2, 12.5),
        exchangeOffer("carrot", "Carrot", 2, 12.5),
        exchangeOffer("onion", "Onion", 2, 12.5),
        exchangeOffer("standard_fertilizer", "Standard Fertilizer", 3, 25),
        exchangeOffer("seed_potato", "Potato Seed", 1, 12.5),
        exchangeOffer("seed_carrot", "Carrot Seed", 1, 12.5),
        exchangeOffer("seed_onion", "Onion Seed", 1, 12.5),
      ],
    },
    {
      minFavor: 50, maxFavor: 74, visitDays: OLD_FARMER_VISIT_DAYS,
      exchangePool: [
        exchangeOffer("premium_fertilizer", "Premium Fertilizer", 2, 25),
        exchangeOffer("seed_potato", "Potato Seed", 1, 18.75),
        exchangeOffer("seed_carrot", "Carrot Seed", 1, 18.75),
        exchangeOffer("seed_onion", "Onion Seed", 1, 18.75),
        exchangeOffer("healthymuffin", "Healthy Muffin", 1, 18.75),
      ],
    },
    {
      minFavor: 75, maxFavor: 99, visitDays: EVERY_DAY,
      exchangePool: [
        exchangeOffer("premium_fertilizer", "Premium Fertilizer", 3, 25),
        exchangeOffer("seed_potato", "Potato Seed", 2, 18.75),
        exchangeOffer("seed_carrot", "Carrot Seed", 2, 18.75),
        exchangeOffer("seed_onion", "Onion Seed", 2, 18.75),
        exchangeOffer("healthymuffin", "Healthy Muffin", 1, 18.75),
      ],
    },
    {
      minFavor: 100, maxFavor: 100, visitDays: EVERY_DAY,
      exchangePool: [
        exchangeOffer("premium_fertilizer", "Premium Fertilizer", 3, 25),
        exchangeOffer("seed_potato", "Potato Seed", 2, 17.5),
        exchangeOffer("seed_carrot", "Carrot Seed", 2, 17.5),
        exchangeOffer("seed_onion", "Onion Seed", 2, 17.5),
        exchangeOffer("healthymuffin", "Healthy Muffin", 1, 17.5),
        exchangeOffer("goldenapple", "Golden Apple", 1, 5),
      ],
    },
  ],
  initialFavor: 0,
  favoriteDishId: "soup_carrot",
  leastFavoriteDishId: null,
  preferredMealTags: [MEAL_TAG.SEASONED, MEAL_TAG.HEALTHY],
  dislikedMealTags: [MEAL_TAG.SWEET],
  exchangePool: [],
};

export const COACHMAN_PROFILE: GuestProfile = {
  id: "coachman",
  name: "Coachman",
  portraitKey: "coachman",
  // Base tier: WE / FR / SA. Higher favor adds one visit day per tier.
  visitDays: [2, 4, 5],
  favorTiers: [
    { minFavor: 0,  maxFavor: 24,  visitDays: [2, 4, 5],                transportDiscountPercent: 0 },
    { minFavor: 25, maxFavor: 49,  visitDays: [0, 2, 4, 5],             transportDiscountPercent: 10 },
    { minFavor: 50, maxFavor: 74,  visitDays: [0, 1, 2, 4, 5],          transportDiscountPercent: 20 },
    { minFavor: 75, maxFavor: 99,  visitDays: [0, 1, 2, 3, 4, 5],       transportDiscountPercent: 40 },
    { minFavor: 100, maxFavor: 100, visitDays: [0, 1, 2, 3, 4, 5, 6],   transportDiscountPercent: 60 },
  ],
  initialFavor: 0,
  // Reserved canonical IDs; the actual recipes/items can be added later.
  favoriteDishId: "stew_beef", // Red Stew
  leastFavoriteDishId: "snowberrysherbet", // Snowberry Sherbet
  preferredMealTags: [MEAL_TAG.HEARTY, MEAL_TAG.WARM],
  dislikedMealTags: [MEAL_TAG.COLD],
  // Coachman buys meals but does not trade items.
  exchangePool: [],
};

export const MERCHANT_PROFILE: GuestProfile = {
  id: "merchant",
  name: "Merchant",
  portraitKey: "merchant",
  visitDays: EVERY_DAY,
  initialFavor: 0,
  favoriteDishId: null,
  leastFavoriteDishId: null,
  preferredMealTags: [],
  dislikedMealTags: [],
  exchangePool: [],
  exchangeMode: "meal_value",
  usesFavor: false,
};

export const TRAVELER_PROFILE: GuestProfile = {
  id: "traveler",
  name: "Traveller",
  portraitKey: "traveler",
  visitDays: EVERY_DAY,
  initialFavor: 0,
  favoriteDishId: null,
  leastFavoriteDishId: null,
  preferredMealTags: [],
  dislikedMealTags: [],
  exchangePool: [
    exchangeOffer("seed_herb", "Herb Seed", 1, 80),
    exchangeOffer("bucket", "Empty Bucket", 1, 20),
  ],
  exchangeMode: "daily_roll",
  usesFavor: false,
};

export const CITY_GUARD_PROFILE: GuestProfile = {
  id: "city_guard",
  name: "City Guard",
  portraitKey: "city_guard",
  visitDays: EVERY_DAY,
  initialFavor: 0,
  favoriteDishId: null,
  leastFavoriteDishId: null,
  preferredMealTags: [],
  dislikedMealTags: [],
  exchangePool: [
    exchangeOffer("cloth", "Cloth", 1, 30),
    exchangeOffer("nails", "Nails", 1, 70),
  ],
  exchangeMode: "daily_roll",
  usesFavor: false,
};

export const LOCAL_BOOZER_PROFILE: GuestProfile = {
  id: "local_boozer",
  name: "Local Boozer",
  portraitKey: "local_boozer",
  visitDays: EVERY_DAY,
  initialFavor: 0,
  favoriteDishId: null,
  leastFavoriteDishId: null,
  preferredMealTags: [MEAL_TAG.ALCOHOLIC],
  dislikedMealTags: [],
  exchangePool: [],
};

/** Scheduled guests are capped before the Traveller is added as the single filler guest. */
export const CURRENT_MAX_DAILY_GUESTS = 3;
export const GUEST_PROFILES: readonly GuestProfile[] = [
  OLD_FARMER_PROFILE,
  COACHMAN_PROFILE,
  MERCHANT_PROFILE,
  TRAVELER_PROFILE,
  CITY_GUARD_PROFILE,
  LOCAL_BOOZER_PROFILE,
];

export const DEFAULT_GUEST_STATE: GuestState = {
  version: 4,
  calendarDaySerial: 0,
  calendarWeekday: 0,
  favors: {},
  activeGuestId: null,
  visitTrades: {},
  rewardedFavorTiers: {},
  pendingFavorGifts: {},
  giftDialogDaySerial: {},
  servedDaySerial: {},
  learnedPreferenceFacts: {},
};

function normalizeWeekday(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return ((Math.floor(value) % 7) + 7) % 7;
}

export function clampFavor(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.floor(value)));
}

function normalizeGuestState(raw: unknown): GuestState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_GUEST_STATE };
  const candidate = raw as Partial<GuestState>;

  const favors: Record<string, number> = {};
  if (candidate.favors && typeof candidate.favors === "object") {
    for (const [guestId, favor] of Object.entries(candidate.favors)) {
      favors[guestId] = clampFavor(Number(favor));
    }
  }

  const visitTrades: Record<string, GuestVisitTrade> = {};
  if (candidate.visitTrades && typeof candidate.visitTrades === "object") {
    for (const [guestId, trade] of Object.entries(candidate.visitTrades)) {
      if (!trade || typeof trade !== "object") continue;
      const t = trade as Partial<GuestVisitTrade>;
      const daySerial = Math.max(0, Math.floor(Number(t.daySerial) || 0));
      if (t.offer && typeof t.offer === "object") {
        const offer = t.offer as GuestExchangeOffer;
        if (typeof offer.itemId === "string" && Number(offer.quantity) > 0) {
          const itemId = normalizeGuestExchangeItemId(offer.itemId);
          const oldFarmerQuantity = guestId === "old_farmer"
            ? itemId === "carrot" || itemId === "potato"
              ? 2
              : itemId === "standard_fertilizer"
                ? 3
                : null
            : null;
          visitTrades[guestId] = {
            daySerial,
            claimed: Boolean(t.claimed),
            offer: {
              itemId,
              name: String(offer.name || offer.itemId),
              quantity: oldFarmerQuantity ?? Math.max(1, Math.floor(Number(offer.quantity) || 1)),
              weight: Math.max(0, Number(offer.weight) || 0),
            },
          };
        }
      }
    }
  }

  const rewardedFavorTiers: Record<string, number[]> = {};
  if (candidate.rewardedFavorTiers && typeof candidate.rewardedFavorTiers === "object") {
    for (const [guestId, tiers] of Object.entries(candidate.rewardedFavorTiers)) {
      if (!Array.isArray(tiers)) continue;
      rewardedFavorTiers[guestId] = [...new Set(tiers
        .map((tier) => Math.floor(Number(tier)))
        .filter((tier) => tier === 25 || tier === 50 || tier === 75 || tier === 100))];
    }
  }

  const pendingFavorGifts: Record<string, PendingFavorGift[]> = {};
  if (candidate.pendingFavorGifts && typeof candidate.pendingFavorGifts === "object") {
    for (const [guestId, gifts] of Object.entries(candidate.pendingFavorGifts)) {
      if (!Array.isArray(gifts)) continue;
      pendingFavorGifts[guestId] = gifts.filter((gift): gift is PendingFavorGift => (
        !!gift && typeof gift === "object" && typeof gift.item?.id === "string" && Number(gift.item.quantity) > 0
      ));
    }
  }

  const giftDialogDaySerial: Record<string, number> = {};
  if (candidate.giftDialogDaySerial && typeof candidate.giftDialogDaySerial === "object") {
    for (const [guestId, daySerial] of Object.entries(candidate.giftDialogDaySerial)) {
      giftDialogDaySerial[guestId] = Math.max(0, Math.floor(Number(daySerial) || 0));
    }
  }

  const servedDaySerial: Record<string, number> = {};
  if (candidate.servedDaySerial && typeof candidate.servedDaySerial === "object") {
    for (const [guestId, daySerial] of Object.entries(candidate.servedDaySerial)) {
      servedDaySerial[guestId] = Math.max(0, Math.floor(Number(daySerial) || 0));
    }
  }

  const learnedPreferenceFacts: Record<string, GuestPreferenceFactKey[]> = {};
  if (candidate.learnedPreferenceFacts && typeof candidate.learnedPreferenceFacts === "object") {
    for (const [guestId, facts] of Object.entries(candidate.learnedPreferenceFacts)) {
      if (!Array.isArray(facts)) continue;
      const profile = GUEST_PROFILES.find((entry) => entry.id === guestId);
      if (!profile) continue;
      const validFacts = new Set(getGuestPreferenceFactKeys(profile));
      learnedPreferenceFacts[guestId] = [...new Set(facts.filter(
        (fact): fact is GuestPreferenceFactKey => typeof fact === "string" && validFacts.has(fact as GuestPreferenceFactKey),
      ))];
    }
  }

  return {
    version: 4,
    calendarDaySerial: Math.max(0, Math.floor(Number(candidate.calendarDaySerial) || 0)),
    calendarWeekday: normalizeWeekday(Number(candidate.calendarWeekday) || 0),
    favors,
    activeGuestId: typeof candidate.activeGuestId === "string" ? candidate.activeGuestId as GuestId : null,
    visitTrades,
    rewardedFavorTiers,
    pendingFavorGifts,
    giftDialogDaySerial,
    servedDaySerial,
    learnedPreferenceFacts,
  };
}

export async function loadGuestState(): Promise<GuestState> {
  try {
    const raw = await AsyncStorage.getItem(GUEST_STATE_KEY);
    if (!raw) return { ...DEFAULT_GUEST_STATE };
    return normalizeGuestState(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_GUEST_STATE };
  }
}

export async function saveGuestState(state: GuestState): Promise<GuestState> {
  const normalized = normalizeGuestState(state);
  await AsyncStorage.setItem(GUEST_STATE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function getGuestFavorTier(profile: GuestProfile, favor: number): GuestFavorTier | null {
  if (!profile.favorTiers?.length) return null;
  const normalizedFavor = clampFavor(favor);
  return profile.favorTiers.find(
    (tier) => normalizedFavor >= tier.minFavor && normalizedFavor <= tier.maxFavor,
  ) ?? null;
}

export function getGuestVisitDays(profile: GuestProfile, favor: number): readonly number[] {
  return getGuestFavorTier(profile, favor)?.visitDays ?? profile.visitDays;
}

export function getGuestTransportDiscountPercent(profile: GuestProfile, favor: number): number {
  return Math.max(0, getGuestFavorTier(profile, favor)?.transportDiscountPercent ?? 0);
}

export function getGuestExchangePool(profile: GuestProfile, favor: number): readonly GuestExchangeOffer[] {
  return getGuestFavorTier(profile, favor)?.exchangePool ?? profile.exchangePool;
}

export function getGuestPreferenceFactKeys(profile: GuestProfile): GuestPreferenceFactKey[] {
  return [
    ...(profile.favoriteDishId ? ["favorite_dish" as const] : []),
    ...(profile.leastFavoriteDishId ? ["least_favorite_dish" as const] : []),
    ...profile.preferredMealTags.map((tag): GuestPreferenceFactKey => `preferred_tag:${tag}`),
    ...profile.dislikedMealTags.map((tag): GuestPreferenceFactKey => `disliked_tag:${tag}`),
  ];
}

/** Each conversation has a 33% chance to reveal one still-unknown preference. */
export async function discoverGuestPreference(
  guestId: GuestId,
  random: () => number = Math.random,
): Promise<GuestPreferenceDiscoveryResult> {
  const profile = GUEST_PROFILES.find((entry) => entry.id === guestId);
  if (!profile) return { outcome: "no_preferences", learnedFactKeys: [] };

  const allFacts = getGuestPreferenceFactKeys(profile);
  const state = await loadGuestState();
  const learned = state.learnedPreferenceFacts[guestId] ?? [];
  if (allFacts.length === 0) return { outcome: "no_preferences", learnedFactKeys: learned };

  const learnedSet = new Set(learned);
  const unknown = allFacts.filter((fact) => !learnedSet.has(fact));
  if (unknown.length === 0) return { outcome: "already_known", learnedFactKeys: learned };
  if (random() >= 0.33) return { outcome: "nothing_learned", learnedFactKeys: learned };

  const factKey = unknown[Math.min(unknown.length - 1, Math.floor(Math.max(0, random()) * unknown.length))];
  const learnedFactKeys = [...learned, factKey];
  await saveGuestState({
    ...state,
    learnedPreferenceFacts: {
      ...state.learnedPreferenceFacts,
      [guestId]: learnedFactKeys,
    },
  });
  return { outcome: "learned", factKey, learnedFactKeys };
}

export function getMerchantExchangeOffer(mealValueCopper: number): GuestExchangeOffer | null {
  const value = Math.max(0, Math.floor(mealValueCopper));
  if (value >= 9 && value <= 15) return exchangeOffer("nails", "Nails", 1, 100);
  if (value >= 16 && value <= 22) return exchangeOffer("cloth", "Cloth", 1, 100);
  if (value >= 23 && value <= 29) return exchangeOffer("paint", "Paint", 1, 100);
  if (value >= 30 && value <= 36) return exchangeOffer("potion_healing_low_grade", "Low Quality Healing Potion", 1, 100);
  if (value >= 37 && value <= 44) return exchangeOffer("potion_stamina_low_grade", "Low Grade Stamina Potion", 1, 100);
  if (value >= 45 && value <= 50) return exchangeOffer("ingot_iron", "Iron Ingot", 1, 100);
  if (value >= 51 && value <= 57) return exchangeOffer("ingot_copper", "Copper Ingot", 1, 100);
  if (value >= 58 && value <= 64) return exchangeOffer("shard_mana", "Mana Shard", 2, 100);
  if (value >= 65 && value <= 71) return exchangeOffer("stone_mana", "Mana Stone", 1, 100);
  return null;
}

export function isGuestScheduled(
  profile: GuestProfile,
  dayIndex: number,
  favor: number = profile.initialFavor,
): boolean {
  return getGuestVisitDays(profile, favor).includes(normalizeWeekday(dayIndex));
}

export function rollExchangeOffer(
  pool: readonly GuestExchangeOffer[],
  randomValue = Math.random(),
): GuestExchangeOffer | null {
  if (pool.length === 0) return null;
  const totalWeight = pool.reduce((sum, offer) => sum + Math.max(0, offer.weight), 0);
  if (totalWeight <= 0) return pool[0] ?? null;
  let cursor = Math.max(0, Math.min(0.999999999, randomValue)) * totalWeight;
  for (const offer of pool) {
    cursor -= Math.max(0, offer.weight);
    if (cursor < 0) return offer;
  }
  return pool[pool.length - 1] ?? null;
}

/**
 * Advance the guest calendar exactly once when the core game advances a day.
 * Call this from the existing sleep/day-transition flow before its snapshot.
 */
export async function advanceGuestCalendar(newDayIndex: number): Promise<GuestState> {
  const state = await loadGuestState();
  const next: GuestState = {
    ...state,
    calendarDaySerial: state.calendarDaySerial + 1,
    calendarWeekday: normalizeWeekday(newDayIndex),
    activeGuestId: null,
  };
  return saveGuestState(next);
}

/**
 * Backward-compatible sync for saves that predate the guest system. If the core
 * weekday differs, advance the guest serial once rather than rerolling on every mount.
 */
async function syncGuestCalendar(dayIndex: number): Promise<GuestState> {
  const weekday = normalizeWeekday(dayIndex);
  const state = await loadGuestState();
  if (state.calendarWeekday === weekday) return state;
  return saveGuestState({
    ...state,
    calendarDaySerial: state.calendarDaySerial + 1,
    calendarWeekday: weekday,
    activeGuestId: null,
  });
}

function normalizePlayerBag(raw: string | null) {
  if (!raw) return { ...DEFAULT_BAG, slots: [...DEFAULT_BAG.slots] };
  try {
    const parsed = JSON.parse(raw) as typeof DEFAULT_BAG;
    return {
      ...DEFAULT_BAG,
      ...parsed,
      slots: Array.from({ length: parsed.slotCount || DEFAULT_BAG.slotCount }, (_, index) => parsed.slots?.[index] ?? null),
    };
  } catch {
    return { ...DEFAULT_BAG, slots: [...DEFAULT_BAG.slots] };
  }
}

/**
 * Prepare today's scheduled guests. Guests with a trade pool receive one trade roll
 * for the current calendarDaySerial; reopening the room preserves that roll.
 */
export async function prepareGuestsForDay(dayIndex: number): Promise<GuestVisitView[]> {
  let state = await syncGuestCalendar(dayIndex);
  const postGuestState = await loadPostGuestTutorialState();
  const regularGuestsUnlocked = areRegularGuestsUnlockedForDay(postGuestState, state.calendarDaySerial);
  const expandedGuestsUnlocked = areExpandedGuestsUnlockedForDay(postGuestState, state.calendarDaySerial);
  const maximumGuests = expandedGuestsUnlocked ? CURRENT_MAX_DAILY_GUESTS + 1 : CURRENT_MAX_DAILY_GUESTS;

  const favorFor = (profile: GuestProfile) => clampFavor(state.favors[profile.id] ?? profile.initialFavor);
  const available = (profile: GuestProfile) => state.servedDaySerial[profile.id] !== state.calendarDaySerial;
  const scheduled: GuestProfile[] = [OLD_FARMER_PROFILE].filter((profile) => (
    isGuestScheduled(profile, dayIndex, favorFor(profile)) && available(profile)
  ));
  if (regularGuestsUnlocked) {
    if (isGuestScheduled(COACHMAN_PROFILE, dayIndex, favorFor(COACHMAN_PROFILE)) && available(COACHMAN_PROFILE)) {
      scheduled.push(COACHMAN_PROFILE);
    }
    // Day serial 0 is game day 1; the Merchant visits on game days 4, 8, 12, ...
    if ((state.calendarDaySerial + 1) % 4 === 0 && available(MERCHANT_PROFILE)) {
      scheduled.push(MERCHANT_PROFILE);
    }
    if (scheduled.length < maximumGuests && available(TRAVELER_PROFILE)) {
      scheduled.push(TRAVELER_PROFILE);
    }
    const rotatingGuest = state.calendarDaySerial % 2 === 0 ? CITY_GUARD_PROFILE : LOCAL_BOOZER_PROFILE;
    if (expandedGuestsUnlocked && scheduled.length < maximumGuests && available(rotatingGuest)) {
      scheduled.push(rotatingGuest);
    }
  }
  scheduled.splice(maximumGuests);
  let changed = false;

  const scheduledIds = new Set(scheduled.map((profile) => profile.id));
  if (state.activeGuestId && !scheduledIds.has(state.activeGuestId)) {
    state = { ...state, activeGuestId: null };
    changed = true;
  }

  const nextFavors = { ...state.favors };
  const nextTrades = { ...state.visitTrades };
  const nextPendingGifts = Object.fromEntries(
    Object.entries(state.pendingFavorGifts).map(([guestId, gifts]) => [guestId, [...gifts]]),
  );
  const nextGiftDialogDays = { ...state.giftDialogDaySerial };
  const rewardDialogs: Record<string, string | null> = {};
  let playerBag = normalizePlayerBag(await AsyncStorage.getItem(PLAYER_BAG_KEY));
  let bagChanged = false;

  for (const profile of scheduled) {
    if (profile.usesFavor !== false && nextFavors[profile.id] === undefined) {
      nextFavors[profile.id] = clampFavor(profile.initialFavor);
      changed = true;
    }

    const favor = favorFor(profile);
    const exchangePool = getGuestExchangePool(profile, favor);
    if (exchangePool.length === 0) {
      if (nextTrades[profile.id] !== undefined) {
        delete nextTrades[profile.id];
        changed = true;
      }
    } else {
      const existingTrade = nextTrades[profile.id];
      if (!existingTrade || existingTrade.daySerial !== state.calendarDaySerial) {
        const offer = rollExchangeOffer(exchangePool);
        if (offer !== null) {
          nextTrades[profile.id] = {
            daySerial: state.calendarDaySerial,
            offer,
            claimed: false,
          };
          changed = true;
        }
      }
    }

    const pending = profile.usesFavor === false ? [] : (nextPendingGifts[profile.id] ?? []);
    if (pending.length > 0 && nextGiftDialogDays[profile.id] !== state.calendarDaySerial) {
      const gift = pending[0];
      const plan = playerBag.unlocked ? planAddToBag(gift.item, playerBag) : null;
      if (plan?.canTransfer && plan.remainderQty === 0) {
        playerBag = { ...playerBag, slots: plan.updatedSlots };
        nextPendingGifts[profile.id] = pending.slice(1);
        bagChanged = true;
        rewardDialogs[profile.id] = FAVOR_GIFT_SUCCESS;
      } else {
        rewardDialogs[profile.id] = FAVOR_GIFT_DEFERRED;
      }
      nextGiftDialogDays[profile.id] = state.calendarDaySerial;
      changed = true;
    }
  }

  if (changed) {
    state = normalizeGuestState({
      ...state,
      favors: nextFavors,
      visitTrades: nextTrades,
      pendingFavorGifts: nextPendingGifts,
      giftDialogDaySerial: nextGiftDialogDays,
    });
    if (bagChanged) {
      await AsyncStorage.multiSet([
        [GUEST_STATE_KEY, JSON.stringify(state)],
        [PLAYER_BAG_KEY, JSON.stringify(playerBag)],
      ]);
    } else {
      await AsyncStorage.setItem(GUEST_STATE_KEY, JSON.stringify(state));
    }
  }

  return scheduled.map((profile) => {
    const favor = clampFavor(state.favors[profile.id] ?? profile.initialFavor);
    return {
      profile,
      favor,
      exchangeOffer: getGuestExchangePool(profile, favor).length > 0
        ? state.visitTrades[profile.id]?.claimed
          ? null
          : state.visitTrades[profile.id]?.offer ?? null
        : null,
      transportDiscountPercent: getGuestTransportDiscountPercent(profile, favor),
      selected: state.activeGuestId === profile.id,
      favorRewardDialog: rewardDialogs[profile.id] ?? null,
      learnedPreferenceFacts: state.learnedPreferenceFacts[profile.id] ?? [],
    };
  });
}

export async function setActiveGuest(guestId: GuestId | null): Promise<GuestState> {
  const state = await loadGuestState();
  return saveGuestState({ ...state, activeGuestId: guestId });
}

/** Persist a value-based offer so the normal atomic exchange path can validate it. */
export async function setCurrentGuestExchangeOffer(
  guestId: GuestId,
  offer: GuestExchangeOffer,
): Promise<GuestState> {
  const state = await loadGuestState();
  return saveGuestState({
    ...state,
    visitTrades: {
      ...state.visitTrades,
      [guestId]: { daySerial: state.calendarDaySerial, offer, claimed: false },
    },
  });
}

export async function markGuestServed(guestId: GuestId): Promise<GuestState> {
  const state = await loadGuestState();
  return saveGuestState({
    ...state,
    activeGuestId: state.activeGuestId === guestId ? null : state.activeGuestId,
    servedDaySerial: { ...state.servedDaySerial, [guestId]: state.calendarDaySerial },
  });
}

export type GuestMealReaction = "favorite" | "favored" | "neutral" | "disliked" | "least_favorite";

export function evaluateGuestMealFavor(
  profile: GuestProfile,
  item: BagItem,
): { favorDelta: number; reaction: GuestMealReaction } {
  if (item.id === profile.favoriteDishId) return { favorDelta: 3, reaction: "favorite" };
  if (item.id === profile.leastFavoriteDishId) return { favorDelta: -2, reaction: "least_favorite" };
  const tags = new Set(getItemMealTags(item));
  const hasFavored = profile.preferredMealTags.some((tag) => tags.has(tag));
  const hasDisliked = profile.dislikedMealTags.some((tag) => tags.has(tag));
  if (hasFavored && hasDisliked) return { favorDelta: 0, reaction: "neutral" };
  if (hasFavored) return { favorDelta: 1, reaction: "favored" };
  if (hasDisliked) return { favorDelta: -1, reaction: "disliked" };
  return { favorDelta: 0, reaction: "neutral" };
}

const FAVOR_REWARD_THRESHOLDS = [25, 50, 75, 100] as const;
let favorUpdateQueue: Promise<void> = Promise.resolve();

function favorGiftForThreshold(threshold: number): PendingFavorGift {
  const isDrink = threshold === 25 || threshold === 50;
  return {
    favorTier: threshold,
    item: {
      id: isDrink ? "energydrink" : "energypill",
      itemType: isDrink ? "energydrink" : "energypill",
      name: isDrink ? "Energy Drink" : "Energy Pill",
      quantity: 1,
      attributes: ["consumable"],
      consumableCategory: isDrink ? "drink" : "pill",
    },
  };
}

export function setGuestFavor(guestId: GuestId, favor: number): Promise<GuestState> {
  const operation = favorUpdateQueue.then(async () => {
    const state = await loadGuestState();
    const profile = GUEST_PROFILES.find((entry) => entry.id === guestId);
    const previousFavor = clampFavor(state.favors[guestId] ?? profile?.initialFavor ?? 0);
    const nextFavor = clampFavor(favor);
    const alreadyRewarded = state.rewardedFavorTiers[guestId] ?? [];
    const crossedThresholds = FAVOR_REWARD_THRESHOLDS.filter(
      (threshold) => previousFavor < threshold && nextFavor >= threshold && !alreadyRewarded.includes(threshold),
    );
    let nextState = await saveGuestState({
      ...state,
      favors: { ...state.favors, [guestId]: nextFavor },
      rewardedFavorTiers: crossedThresholds.length > 0
        ? { ...state.rewardedFavorTiers, [guestId]: [...alreadyRewarded, ...crossedThresholds] }
        : state.rewardedFavorTiers,
      pendingFavorGifts: crossedThresholds.length > 0
        ? {
            ...state.pendingFavorGifts,
            [guestId]: [
              ...(state.pendingFavorGifts[guestId] ?? []),
              ...crossedThresholds.map(favorGiftForThreshold),
            ],
          }
        : state.pendingFavorGifts,
    });
    emitFavorChangeFeedback(guestId, previousFavor, nextFavor);
    if (crossedThresholds.length > 0) await addKarmaPoints(crossedThresholds.length * 10);

    if (crossedThresholds.length > 0) {
      const pending = nextState.pendingFavorGifts[guestId] ?? [];
      const gift = pending[0];
      if (gift) {
        const playerBag = normalizePlayerBag(await AsyncStorage.getItem(PLAYER_BAG_KEY));
        const plan = playerBag.unlocked ? planAddToBag(gift.item, playerBag) : null;
        const delivered = !!plan?.canTransfer && plan.remainderQty === 0;
        const giftState = normalizeGuestState({
          ...nextState,
          pendingFavorGifts: delivered
            ? { ...nextState.pendingFavorGifts, [guestId]: pending.slice(1) }
            : nextState.pendingFavorGifts,
          giftDialogDaySerial: {
            ...nextState.giftDialogDaySerial,
            [guestId]: nextState.calendarDaySerial,
          },
        });
        if (delivered && plan) {
          await AsyncStorage.multiSet([
            [PLAYER_BAG_KEY, JSON.stringify({ ...playerBag, slots: plan.updatedSlots })],
            [GUEST_STATE_KEY, JSON.stringify(giftState)],
          ]);
        } else {
          await AsyncStorage.setItem(GUEST_STATE_KEY, JSON.stringify(giftState));
        }
        nextState = giftState;
        emitFavorRewardDialog(guestId, delivered ? FAVOR_GIFT_SUCCESS : FAVOR_GIFT_DEFERRED);
      }
    }
    return nextState;
  });
  favorUpdateQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function addGuestFavor(guestId: GuestId, amount: number): Promise<GuestState> {
  const state = await loadGuestState();
  const profile = GUEST_PROFILES.find((entry) => entry.id === guestId);
  const current = state.favors[guestId] ?? profile?.initialFavor ?? 0;
  return setGuestFavor(guestId, current + amount);
}

/**
 * Starts a new life. Unpreserved relationships return to zero and can reward
 * their Favor tiers again. Preserved relationships retain both Favor and the
 * claimed-tier ledger, so only newly reached higher tiers can reward KP/gifts.
 */
export async function resetGuestRelationshipsForNextRun(
  preservedGuestIds: readonly GuestId[] = [],
): Promise<GuestState> {
  const state = await loadGuestState();
  const preserved = new Set<string>(preservedGuestIds);
  const favors: Record<string, number> = {};
  const rewardedFavorTiers: Record<string, number[]> = {};
  const pendingFavorGifts: Record<string, PendingFavorGift[]> = {};
  const learnedPreferenceFacts: Record<string, GuestPreferenceFactKey[]> = {};

  for (const profile of GUEST_PROFILES) {
    if (!preserved.has(profile.id)) continue;
    favors[profile.id] = clampFavor(state.favors[profile.id] ?? profile.initialFavor);
    rewardedFavorTiers[profile.id] = [...(state.rewardedFavorTiers[profile.id] ?? [])];
    pendingFavorGifts[profile.id] = [...(state.pendingFavorGifts[profile.id] ?? [])];
    learnedPreferenceFacts[profile.id] = [...(state.learnedPreferenceFacts[profile.id] ?? [])];
  }

  return saveGuestState({
    ...DEFAULT_GUEST_STATE,
    favors,
    rewardedFavorTiers,
    pendingFavorGifts,
    learnedPreferenceFacts,
  });
}
