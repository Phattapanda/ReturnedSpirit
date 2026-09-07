import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  getMerchantExchangeOffer,
  discoverGuestPreference,
  prepareGuestsForDay,
  setActiveGuest,
  subscribeFavorRewardDialog,
  type GuestId,
  type GuestVisitView,
} from "@/src/game/guest-system";
import { ITEM_CATALOG, type MealTag } from "@/src/game/item-system";
import CurrencyPrice from "@/src/components/currency-price";

export type GuestServiceAction = "sell" | "exchange" | "water" | "talk";
export type GuestServiceSourcePoint = { x: number; y: number };

type GuestCardProps = {
  guest: GuestVisitView;
  onSelect: (guestId: GuestId) => void;
  onService?: (
    guest: GuestVisitView,
    action: GuestServiceAction,
    source?: GuestServiceSourcePoint,
  ) => boolean | void | Promise<boolean | void>;
  enabledService?: GuestServiceAction | readonly GuestServiceAction[] | null;
  sellPriceCopper?: number | null;
  selectedMealIsAlcoholic?: boolean;
  beverageName?: string;
  beveragePriceCopper?: number;
  beverageIsAlcoholic?: boolean;
  departing?: boolean;
};

const OLD_FARMER = require("../../assets/images/old_farmer.png");
const COACHMAN = require("../../assets/images/coachman.png");
const MERCHANT = require("../../assets/images/merchant.png");
const TRAVELER = require("../../assets/images/traveler.png");
const CITY_GUARD = require("../../assets/images/city_guard.png");
const LOCAL_BOOZER = require("../../assets/images/local_boozer.png");
const SERVICE_SELL = require("../../assets/images/service_sell.png");
const SERVICE_WATER = require("../../assets/images/service_water.png");
const SERVICE_TALK = require("../../assets/images/service_talk.png");
const TRADE_POTATO = require("../../assets/images/potato.png");
const TRADE_CARROT = require("../../assets/images/carrot.png");
const TRADE_ONION = require("../../assets/images/onion.png");
const TRADE_FERTILIZER = require("../../assets/images/fertilizer.png");
const TRADE_PREMIUM_FERTILIZER = require("../../assets/premiumfertilizer.png");
const TRADE_SEED_POTATO = require("../../assets/images/seed_potato.png");
const TRADE_SEED_CARROT = require("../../assets/images/seed_carrot.png");
const TRADE_SEED_ONION = require("../../assets/images/seed_onion.png");
const TRADE_HEALTHY_MUFFIN = require("../../assets/images/healthy muffin.png");
const TRADE_GOLDEN_APPLE = require("../../assets/images/golden apple.png");
const TRADE_BUCKET = require("../../assets/images/bucket.png");
const TRADE_SEED_HERB = require("../../assets/images/seed_herb.png");
const TRADE_NAILS = require("../../assets/images/nails.png");
const TRADE_CLOTH = require("../../assets/images/cloth.png");
const TRADE_PAINT = require("../../assets/images/paint.png");
const TRADE_HEALING_POTION = require("../../assets/images/potion_healing_low_grade.png");
const TRADE_STAMINA_POTION = require("../../assets/images/potion_stamina_low_grade.png");
const TRADE_IRON_INGOT = require("../../assets/images/ingot_iron.png");
const TRADE_COPPER_INGOT = require("../../assets/images/ingot_copper.png");
const TRADE_MANA_SHARD = require("../../assets/images/shard_mana.png");
const TRADE_MANA_STONE = require("../../assets/images/stone_mana.png");

const TRADE_IMAGES: Record<string, ReturnType<typeof require>> = {
  potato: TRADE_POTATO,
  carrot: TRADE_CARROT,
  onion: TRADE_ONION,
  standard_fertilizer: TRADE_FERTILIZER,
  premium_fertilizer: TRADE_PREMIUM_FERTILIZER,
  seed_potato: TRADE_SEED_POTATO,
  seed_carrot: TRADE_SEED_CARROT,
  seed_onion: TRADE_SEED_ONION,
  healthymuffin: TRADE_HEALTHY_MUFFIN,
  goldenapple: TRADE_GOLDEN_APPLE,
  bucket: TRADE_BUCKET,
  seed_herb: TRADE_SEED_HERB,
  nails: TRADE_NAILS,
  cloth: TRADE_CLOTH,
  paint: TRADE_PAINT,
  potion_healing_low_grade: TRADE_HEALING_POTION,
  potion_stamina_low_grade: TRADE_STAMINA_POTION,
  ingot_iron: TRADE_IRON_INGOT,
  ingot_copper: TRADE_COPPER_INGOT,
  shard_mana: TRADE_MANA_SHARD,
  stone_mana: TRADE_MANA_STONE,
};

export function getGuestExchangeImage(itemId: string): ReturnType<typeof require> | null {
  return TRADE_IMAGES[itemId] ?? null;
}

const GUEST_PORTRAITS: Record<string, ReturnType<typeof require>> = {
  old_farmer: OLD_FARMER,
  coachman: COACHMAN,
  merchant: MERCHANT,
  traveler: TRAVELER,
  city_guard: CITY_GUARD,
  local_boozer: LOCAL_BOOZER,
};

/**
 * Foundation GuestCard, intentionally modeled after GardenPlot:
 * - square guest portrait on the LEFT, like the crop/Herb Bed image
 * - guest name + request text in the main information area
 * - finger-friendly service tiles below
 *
 * Favor remains in the guest model but is intentionally NOT shown here. A later
 * guest-detail view can expose it from the portrait. Dialog presentation is kept
 * separate so future half-body dialog art does not constrain this card layout.
 */
export function GuestCard({
  guest,
  onSelect,
  onService,
  enabledService = null,
  sellPriceCopper = null,
  selectedMealIsAlcoholic = false,
  beverageName = "Water",
  beveragePriceCopper = 1,
  beverageIsAlcoholic = false,
  departing = false,
}: GuestCardProps) {
  const [detailsVisible, setDetailsVisible] = useState(false);
  const { profile, selected } = guest;
  const displayedSellPrice = profile.id === "local_boozer" && selectedMealIsAlcoholic && sellPriceCopper !== null
    ? sellPriceCopper * 2
    : sellPriceCopper;
  const displayedBeveragePrice = profile.id === "local_boozer" && beverageIsAlcoholic
    ? beveragePriceCopper * 2
    : beveragePriceCopper;
  const portrait = GUEST_PORTRAITS[profile.portraitKey];
  const selectedMerchantOffer = profile.id === "merchant" && sellPriceCopper !== null
    ? getMerchantExchangeOffer(sellPriceCopper)
    : null;
  const visibleExchangeOffer = profile.exchangeMode === "meal_value"
    ? selectedMerchantOffer
    : guest.exchangeOffer;
  const canTrade = guest.exchangeOffer !== null || profile.exchangeMode === "meal_value";
  const tradeImage = visibleExchangeOffer ? TRADE_IMAGES[visibleExchangeOffer.itemId] : null;
  const exchangeButtonRef = useRef<View>(null);
  const sellButtonRef = useRef<View>(null);
  const departureOpacity = useRef(new Animated.Value(1)).current;
  const departureX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!departing) return;
    Animated.parallel([
      Animated.timing(departureOpacity, { toValue: 0, duration: 700, useNativeDriver: true }),
      Animated.timing(departureX, { toValue: 32, duration: 700, useNativeDriver: true }),
    ]).start();
  }, [departing, departureOpacity, departureX]);

  const serviceEnabled = (action: GuestServiceAction) => !!onService && (
    Array.isArray(enabledService) ? enabledService.includes(action) : enabledService === action
  );

  function handleSellPress() {
    const button = sellButtonRef.current;
    if (!button) {
      void onService?.(guest, "sell");
      return;
    }
    button.measureInWindow((x, y, width, height) => {
      void onService?.(guest, "sell", { x: x + width / 2, y: y + height / 2 });
    });
  }

  function handleExchangePress() {
    const exchangeButton = exchangeButtonRef.current;
    if (!exchangeButton) {
      void onService?.(guest, "exchange");
      return;
    }
    exchangeButton.measureInWindow((x, y, width, height) => {
      void onService?.(guest, "exchange", { x: x + width / 2, y: y + height / 2 });
    });
  }

  return (
    <Animated.View style={{ opacity: departureOpacity, transform: [{ translateX: departureX }] }}>
      <TouchableOpacity
        style={[styles.card, selected && styles.cardSelected]}
        onPress={() => onSelect(profile.id)}
        activeOpacity={0.88}
      >
        <View style={styles.guestTopRow}>
          <TouchableOpacity
            style={styles.portraitWrap}
            onPress={() => setDetailsVisible(true)}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel={`View details for ${profile.name}`}
          >
            {portrait ? (
              <Image source={portrait} style={styles.portraitImage} resizeMode="cover" resizeMethod="resize" />
            ) : (
              <Ionicons name="person-outline" size={40} color="rgba(196,148,58,0.76)" />
            )}
          </TouchableOpacity>

          <View style={styles.guestTextArea}>
            <Text style={styles.name}>{profile.name}</Text>
            <Text style={styles.requestText}>{coachmanRequestText(guest)}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.serviceRow}>
          <TouchableOpacity
            ref={sellButtonRef}
            style={[styles.serviceButton, !serviceEnabled("sell") && styles.serviceButtonDisabled]}
            disabled={!serviceEnabled("sell")}
            onPress={handleSellPress}
            activeOpacity={0.8}
          >
            <Image source={SERVICE_SELL} style={styles.serviceImage} resizeMode="contain" resizeMethod="resize" />
            <Text style={styles.serviceLabel}>Sell for</Text>
            <View style={styles.serviceValueRow}>
              {displayedSellPrice === null ? (
                <Text style={styles.serviceValueText}>Select meal</Text>
              ) : (
                <CurrencyPrice totalCopper={displayedSellPrice} textStyle={styles.serviceValueText} />
              )}
            </View>
          </TouchableOpacity>

          {canTrade && (
            <TouchableOpacity
              ref={exchangeButtonRef}
              style={[styles.serviceButton, !serviceEnabled("exchange") && styles.serviceButtonDisabled]}
              disabled={!serviceEnabled("exchange")}
              onPress={handleExchangePress}
              activeOpacity={0.8}
            >
              <View style={styles.tradeItemWrap}>
                {tradeImage ? (
                  <Image source={tradeImage} style={styles.tradeItemImage} resizeMode="contain" resizeMethod="resize" />
                ) : (
                  <Ionicons name="gift-outline" size={25} color="#C4943A" />
                )}
              </View>
              <Text style={styles.serviceLabel}>Exchange</Text>
              {visibleExchangeOffer && (
                <Text style={styles.tradeOfferText} numberOfLines={2}>
                  {visibleExchangeOffer.quantity}× {visibleExchangeOffer.name}
                </Text>
              )}
              {!visibleExchangeOffer && profile.exchangeMode === "meal_value" && (
                <Text style={styles.tradeOfferText} numberOfLines={2}>
                  {sellPriceCopper === null ? "Select a meal" : "No offer for this meal"}
                </Text>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.serviceButton, !serviceEnabled("water") && styles.serviceButtonDisabled]}
            disabled={!serviceEnabled("water")}
            onPress={() => onService?.(guest, "water")}
            activeOpacity={0.8}
          >
            {beverageIsAlcoholic
              ? <Ionicons name="beer-outline" size={29} color="#C4943A" />
              : <Image source={SERVICE_WATER} style={styles.serviceImage} resizeMode="contain" resizeMethod="resize" />}
            <Text style={styles.serviceLabel}>Offer {beverageName}</Text>
            <View style={styles.serviceValueRow}>
              <Text style={styles.serviceValueText}>for</Text>
              <CurrencyPrice totalCopper={displayedBeveragePrice} textStyle={styles.serviceValueText} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.serviceButton, !serviceEnabled("talk") && styles.serviceButtonDisabled]}
            disabled={!serviceEnabled("talk")}
            onPress={() => onService?.(guest, "talk")}
            activeOpacity={0.8}
          >
            <Image source={SERVICE_TALK} style={styles.serviceImage} resizeMode="contain" resizeMethod="resize" />
            <Text style={styles.serviceLabel}>Talk</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      <GuestDetailsModal
        visible={detailsVisible}
        guest={guest}
        portrait={portrait}
        onClose={() => setDetailsVisible(false)}
      />
    </Animated.View>
  );
}

function displayItemName(itemId: string | null): string {
  if (!itemId) return "";
  return ITEM_CATALOG[itemId]?.name ?? itemId
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function displayTag(tag: MealTag): string {
  return tag.charAt(0).toUpperCase() + tag.slice(1).replace(/_/g, " ");
}

function GuestDetailsModal({
  visible,
  guest,
  portrait,
  onClose,
}: {
  visible: boolean;
  guest: GuestVisitView;
  portrait: ReturnType<typeof require> | undefined;
  onClose: () => void;
}) {
  const { profile } = guest;
  const learned = new Set(guest.learnedPreferenceFacts);
  const hasPreferences = !!profile.favoriteDishId || !!profile.leastFavoriteDishId ||
    profile.preferredMealTags.length > 0 || profile.dislikedMealTags.length > 0;
  const satisfiedWithEverything = profile.usesFavor === false && !hasPreferences;

  const maskedTags = (tags: readonly MealTag[], prefix: "preferred_tag" | "disliked_tag") => tags
    .map((tag) => learned.has(`${prefix}:${tag}`) ? displayTag(tag) : "?")
    .join(", ");

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.detailsOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.detailsCard} activeOpacity={1} onPress={() => {}}>
          <View style={styles.detailsHeader}>
            <View style={styles.detailsPortraitWrap}>
              {portrait ? (
                <Image source={portrait} style={styles.detailsPortrait} resizeMode="cover" resizeMethod="resize" />
              ) : (
                <Ionicons name="person-outline" size={48} color="rgba(196,148,58,0.76)" />
              )}
            </View>
            <View style={styles.detailsTitleArea}>
              <Text selectable style={styles.detailsName}>{profile.name}</Text>
              {profile.usesFavor !== false && (
                <Text selectable style={styles.favorText}>Favor Points: {guest.favor}/100</Text>
              )}
            </View>
            <TouchableOpacity style={styles.detailsClose} onPress={onClose} activeOpacity={0.75}>
              <Ionicons name="close" size={22} color="#F0E8D5" />
            </TouchableOpacity>
          </View>

          <View style={styles.detailsDivider} />

          {satisfiedWithEverything ? (
            <Text selectable style={styles.satisfiedText}>This guest is satisfied with everything.</Text>
          ) : (
            <View style={styles.preferenceList}>
              {profile.favoriteDishId && (
                <PreferenceRow
                  label="Favorite dish"
                  value={learned.has("favorite_dish") ? displayItemName(profile.favoriteDishId) : "?"}
                />
              )}
              {profile.leastFavoriteDishId && (
                <PreferenceRow
                  label="Disliked dish"
                  value={learned.has("least_favorite_dish") ? displayItemName(profile.leastFavoriteDishId) : "?"}
                />
              )}
              {profile.preferredMealTags.length > 0 && (
                <PreferenceRow label="Preferred tags" value={maskedTags(profile.preferredMealTags, "preferred_tag")} />
              )}
              {profile.dislikedMealTags.length > 0 && (
                <PreferenceRow label="Disliked tags" value={maskedTags(profile.dislikedMealTags, "disliked_tag")} />
              )}
              {!hasPreferences && (
                <Text selectable style={styles.satisfiedText}>This guest is satisfied with everything.</Text>
              )}
            </View>
          )}

          {hasPreferences && (
            <Text selectable style={styles.discoveryHint}>Talk to this guest for a chance to learn an unknown preference.</Text>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function PreferenceRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.preferenceRow}>
      <Text selectable style={styles.preferenceLabel}>{label}</Text>
      <Text selectable style={styles.preferenceValue}>{value}</Text>
    </View>
  );
}

type DiningGuestAreaProps = {
  dayIndex: number;
  forcedActiveGuestId?: GuestId | null;
  enabledService?: GuestServiceAction | null;
  enabledServicesForGuest?: (guest: GuestVisitView) => GuestServiceAction | readonly GuestServiceAction[] | null;
  sellPriceCopper?: number | null;
  selectedMealIsAlcoholic?: boolean;
  beverageName?: string;
  beveragePriceCopper?: number;
  beverageIsAlcoholic?: boolean;
  departingGuestId?: GuestId | null;
  hiddenGuestIds?: readonly GuestId[];
  onService?: (
    guest: GuestVisitView,
    action: GuestServiceAction,
    source?: GuestServiceSourcePoint,
  ) => boolean | void | Promise<boolean | void>;
  onFavorRewardDialog?: (guest: GuestVisitView, text: string) => void;
};

function coachmanRequestText(guest: GuestVisitView): string {
  if (guest.profile.id === "local_boozer") return "“Something alcoholic, if you have it.”";
  if (guest.profile.id === "city_guard") return "“Anything warm will do.”";
  if (guest.profile.id !== "coachman") return "“I could use something to eat.”";
  if (guest.favor >= 100) return "“My favorite stop. What’s cooking?”";
  if (guest.favor >= 75) return "“I was hoping your kitchen was open.”";
  if (guest.favor >= 50) return "“The road always leads me back here.”";
  if (guest.favor >= 25) return "“Good to see you. Something warm today?”";
  return "“A hot meal would be welcome.”";
}

/**
 * Dining-facing guest list foundation. It owns only presentation/selection state;
 * guest scheduling, favor, and once-per-visit trade rolls live in guest-system.ts.
 */
export default function DiningGuestArea({
  dayIndex,
  forcedActiveGuestId = null,
  enabledService = null,
  enabledServicesForGuest,
  sellPriceCopper = null,
  selectedMealIsAlcoholic = false,
  beverageName = "Water",
  beveragePriceCopper = 1,
  beverageIsAlcoholic = false,
  departingGuestId = null,
  hiddenGuestIds = [],
  onService,
  onFavorRewardDialog,
}: DiningGuestAreaProps) {
  const [guests, setGuests] = useState<GuestVisitView[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    (async () => {
      try {
        // Dining initially renders with its local default day before its room state
        // finishes loading. Always prefer the persisted core day so mount timing
        // can never create an extra guest visit/trade roll.
        const rawDay = await AsyncStorage.getItem("@game:day_index");
        const persistedDay = rawDay !== null ? parseInt(rawDay, 10) : dayIndex;
        const prepared = await prepareGuestsForDay(Number.isFinite(persistedDay) ? persistedDay : dayIndex);
        if (active) {
          setGuests(prepared);
          const reward = prepared.find((guest) => !!guest.favorRewardDialog);
          if (reward?.favorRewardDialog) onFavorRewardDialog?.(reward, reward.favorRewardDialog);
        }
      } catch {
        if (active) setGuests([]);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [dayIndex, onFavorRewardDialog]);

  useEffect(() => subscribeFavorRewardDialog((guestId, text) => {
    const guest = guests.find((entry) => entry.profile.id === guestId);
    if (guest) onFavorRewardDialog?.(guest, text);
  }), [guests, onFavorRewardDialog]);

  async function handleSelect(guestId: GuestId) {
    await setActiveGuest(guestId);
    setGuests((current) => current.map((guest) => ({
      ...guest,
      selected: guest.profile.id === guestId,
    })));
  }

  async function handleService(
    guest: GuestVisitView,
    action: GuestServiceAction,
    source?: GuestServiceSourcePoint,
  ) {
    const completed = await onService?.(guest, action, source);
    if (action === "talk") {
      const discovery = await discoverGuestPreference(guest.profile.id);
      if (discovery.outcome === "learned") {
        setGuests((current) => current.map((entry) => entry.profile.id === guest.profile.id
          ? { ...entry, learnedPreferenceFacts: discovery.learnedFactKeys }
          : entry));
      }
    }
    if (action === "exchange" && completed === true) {
      setGuests((current) => current.map((entry) => (
        entry.profile.id === guest.profile.id ? { ...entry, exchangeOffer: null } : entry
      )));
    }
  }

  useEffect(() => {
    if (!forcedActiveGuestId || loading) return;
    setActiveGuest(forcedActiveGuestId).catch(() => {});
    setGuests((current) => current.map((guest) => ({
      ...guest,
      selected: guest.profile.id === forcedActiveGuestId,
    })));
  }, [forcedActiveGuestId, loading]);

  if (loading) {
    return (
      <View style={styles.emptyCard}>
        <ActivityIndicator size="small" color="#C4943A" />
      </View>
    );
  }

  if (guests.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <Ionicons name="moon-outline" size={24} color="rgba(196,148,58,0.30)" />
        <Text style={styles.emptyText}>No guests today</Text>
      </View>
    );
  }

  const visibleGuests = guests.filter((guest) => !hiddenGuestIds.includes(guest.profile.id));

  return (
    <View style={styles.guestList}>
      {visibleGuests.map((guest) => (
        <GuestCard
          key={guest.profile.id}
          guest={guest}
          onSelect={handleSelect}
          onService={handleService}
          enabledService={guest.selected ? (enabledServicesForGuest?.(guest) ?? enabledService) : null}
          sellPriceCopper={sellPriceCopper}
          selectedMealIsAlcoholic={selectedMealIsAlcoholic}
          beverageName={beverageName}
          beveragePriceCopper={beveragePriceCopper}
          beverageIsAlcoholic={beverageIsAlcoholic}
          departing={departingGuestId === guest.profile.id}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  guestList: {
    marginHorizontal: 18,
    marginTop: 5,
    gap: 14,
  },

  // GardenPlot-style outer card. Active selection is conveyed only by movement/color.
  card: {
    backgroundColor: "rgba(14,8,2,0.92)",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.38)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 18,
  },
  cardSelected: {
    borderWidth: 2,
    borderColor: "#D8A64A",
    backgroundColor: "rgba(47,25,6,0.97)",
    transform: [{ translateY: -8 }],
  },

  // Mirrors GardenPlot topRow/cropWrap: portrait left, information right.
  guestTopRow: {
    flexDirection: "row",
    padding: 14,
    gap: 14,
    alignItems: "center",
  },
  portraitWrap: {
    width: 90,
    height: 90,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(196,148,58,0.45)",
    backgroundColor: "rgba(30,18,5,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  portraitImage: {
    width: "100%",
    height: "100%",
    transform: [{ scale: 1.06 }],
  },
  guestTextArea: {
    flex: 1,
    gap: 5,
  },
  name: {
    color: "#C4943A",
    fontSize: 13,
    fontFamily: "Oldenburg",
    letterSpacing: 0.8,
  },
  requestText: {
    color: "#F0E8D5",
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "Oldenburg",
    opacity: 0.85,
  },

  divider: {
    height: 1,
    backgroundColor: "rgba(196,148,58,0.18)",
    marginHorizontal: 10,
  },

  // Exact GardenPlot action rhythm: image, label, then changing value/cost below.
  serviceRow: {
    flexDirection: "row",
    gap: 6,
    padding: 10,
  },
  serviceButton: {
    flex: 1,
    minHeight: 70,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    paddingHorizontal: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(90,65,30,0.45)",
    backgroundColor: "rgba(25,14,4,0.90)",
    gap: 3,
  },
  serviceButtonDisabled: {
    opacity: 0.38,
  },
  serviceImage: {
    width: 28,
    height: 28,
  },
  tradeItemWrap: {
    width: 28,
    height: 28,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  tradeItemImage: {
    width: "100%",
    height: "100%",
  },
  serviceLabel: {
    color: "#F0E8D5",
    fontSize: 10,
    lineHeight: 12,
    textAlign: "center",
    fontFamily: "Oldenburg",
  },
  serviceValueRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  serviceValueText: {
    color: "rgba(240,232,213,0.55)",
    fontSize: 9,
    lineHeight: 11,
    textAlign: "center",
    fontFamily: "Oldenburg",
  },
  tradeOfferText: {
    color: "rgba(240,232,213,0.60)",
    fontSize: 8,
    lineHeight: 10,
    textAlign: "center",
    fontFamily: "Oldenburg",
  },
  miniCoin: {
    width: 10,
    height: 10,
    flexShrink: 0,
  },

  emptyCard: {
    minHeight: 120,
    marginHorizontal: 18,
    marginTop: 5,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.30)",
    backgroundColor: "rgba(14,8,2,0.90)",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyText: {
    color: "rgba(240,232,213,0.45)",
    fontSize: 12,
    fontStyle: "italic",
    fontFamily: "Oldenburg",
  },
  detailsOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
  },
  detailsCard: {
    width: "100%",
    maxWidth: 430,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "rgba(196,148,58,0.72)",
    backgroundColor: "#160C03",
    padding: 18,
    gap: 14,
  },
  detailsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  detailsPortraitWrap: {
    width: 76,
    height: 76,
    borderRadius: 13,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(196,148,58,0.55)",
    backgroundColor: "rgba(30,18,5,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  detailsPortrait: {
    width: "100%",
    height: "100%",
    transform: [{ scale: 1.06 }],
  },
  detailsTitleArea: {
    flex: 1,
    gap: 7,
  },
  detailsName: {
    color: "#E1AF54",
    fontSize: 18,
    fontFamily: "Oldenburg",
  },
  favorText: {
    color: "#F0E8D5",
    fontSize: 13,
    fontFamily: "Oldenburg",
    fontVariant: ["tabular-nums"],
  },
  detailsClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    alignSelf: "flex-start",
  },
  detailsDivider: {
    height: 1,
    backgroundColor: "rgba(196,148,58,0.28)",
  },
  preferenceList: {
    gap: 10,
  },
  preferenceRow: {
    minHeight: 44,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(196,148,58,0.26)",
    backgroundColor: "rgba(255,255,255,0.025)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  preferenceLabel: {
    color: "rgba(240,232,213,0.62)",
    fontSize: 10,
    fontFamily: "Oldenburg",
  },
  preferenceValue: {
    color: "#F0E8D5",
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "Oldenburg",
  },
  satisfiedText: {
    color: "#F0E8D5",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    fontFamily: "Oldenburg",
    paddingVertical: 8,
  },
  discoveryHint: {
    color: "rgba(240,232,213,0.55)",
    fontSize: 10,
    lineHeight: 15,
    textAlign: "center",
    fontFamily: "Oldenburg",
  },
});
