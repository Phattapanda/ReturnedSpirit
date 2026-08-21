import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  prepareGuestsForDay,
  setActiveGuest,
  subscribeFavorRewardDialog,
  type GuestId,
  type GuestVisitView,
} from "@/src/game/guest-system";

export type GuestServiceAction = "sell" | "exchange" | "water" | "talk";

type GuestCardProps = {
  guest: GuestVisitView;
  onSelect: (guestId: GuestId) => void;
  onService?: (guest: GuestVisitView, action: GuestServiceAction) => void;
  enabledService?: GuestServiceAction | null;
  sellPriceCopper?: number | null;
  departing?: boolean;
};

const COIN_COPPER = require("../../assets/images/coin_copper.png");
const OLD_FARMER = require("../../assets/images/old_farmer.png");
const COACHMAN = require("../../assets/images/coachman.png");
const SERVICE_SELL = require("../../assets/images/service_sell.png");
const SERVICE_WATER = require("../../assets/images/service_water.png");
const SERVICE_TALK = require("../../assets/images/service_talk.png");
const TRADE_POTATO = require("../../assets/images/potato.png");
const TRADE_CARROT = require("../../assets/images/carrot.png");
const TRADE_FERTILIZER = require("../../assets/images/fertilizer.png");
const TRADE_GOLDEN_APPLE = require("../../assets/images/golden apple.png");

const TRADE_IMAGES: Record<string, ReturnType<typeof require>> = {
  potato: TRADE_POTATO,
  carrot: TRADE_CARROT,
  standardfertilizer: TRADE_FERTILIZER,
  premiumfertilizer: TRADE_FERTILIZER,
  goldenapple: TRADE_GOLDEN_APPLE,
};

const GUEST_PORTRAITS: Record<string, ReturnType<typeof require>> = {
  old_farmer: OLD_FARMER,
  coachman: COACHMAN,
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
  departing = false,
}: GuestCardProps) {
  const { profile, selected } = guest;
  const portrait = GUEST_PORTRAITS[profile.portraitKey];
  const canTrade = guest.exchangeOffer !== null;
  const tradeImage = guest.exchangeOffer ? TRADE_IMAGES[guest.exchangeOffer.itemId] : null;
  const departureOpacity = useRef(new Animated.Value(1)).current;
  const departureX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!departing) return;
    Animated.parallel([
      Animated.timing(departureOpacity, { toValue: 0, duration: 700, useNativeDriver: true }),
      Animated.timing(departureX, { toValue: 32, duration: 700, useNativeDriver: true }),
    ]).start();
  }, [departing, departureOpacity, departureX]);

  const serviceEnabled = (action: GuestServiceAction) => !!onService && enabledService === action;

  return (
    <Animated.View style={{ opacity: departureOpacity, transform: [{ translateX: departureX }] }}>
      <TouchableOpacity
        style={[styles.card, selected && styles.cardSelected]}
        onPress={() => onSelect(profile.id)}
        activeOpacity={0.88}
      >
        <View style={styles.guestTopRow}>
          <View style={styles.portraitWrap}>
            {portrait ? (
              <Image source={portrait} style={styles.portraitImage} resizeMode="cover" resizeMethod="resize" />
            ) : (
              <Ionicons name="person-outline" size={40} color="rgba(196,148,58,0.76)" />
            )}
          </View>

          <View style={styles.guestTextArea}>
            <Text style={styles.name}>{profile.name}</Text>
            <Text style={styles.requestText}>“I could use something to eat.”</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.serviceRow}>
          <TouchableOpacity
            style={[styles.serviceButton, !serviceEnabled("sell") && styles.serviceButtonDisabled]}
            disabled={!serviceEnabled("sell")}
            onPress={() => onService?.(guest, "sell")}
            activeOpacity={0.8}
          >
            <Image source={SERVICE_SELL} style={styles.serviceImage} resizeMode="contain" resizeMethod="resize" />
            <Text style={styles.serviceLabel}>Sell for</Text>
            <View style={styles.serviceValueRow}>
              <Text style={styles.serviceValueText}>{sellPriceCopper ?? "X"}</Text>
              <Image source={COIN_COPPER} style={styles.miniCoin} resizeMode="contain" resizeMethod="resize" />
            </View>
          </TouchableOpacity>

          {canTrade && (
            <TouchableOpacity
              style={[styles.serviceButton, !serviceEnabled("exchange") && styles.serviceButtonDisabled]}
              disabled={!serviceEnabled("exchange")}
              onPress={() => onService?.(guest, "exchange")}
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
              {guest.exchangeOffer && (
                <Text style={styles.tradeOfferText} numberOfLines={2}>
                  {guest.exchangeOffer.quantity}× {guest.exchangeOffer.name}
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
            <Image source={SERVICE_WATER} style={styles.serviceImage} resizeMode="contain" resizeMethod="resize" />
            <Text style={styles.serviceLabel}>Offer water</Text>
            <View style={styles.serviceValueRow}>
              <Text style={styles.serviceValueText}>for 1</Text>
              <Image source={COIN_COPPER} style={styles.miniCoin} resizeMode="contain" resizeMethod="resize" />
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
    </Animated.View>
  );
}

type DiningGuestAreaProps = {
  dayIndex: number;
  forcedActiveGuestId?: GuestId | null;
  enabledService?: GuestServiceAction | null;
  sellPriceCopper?: number | null;
  departingGuestId?: GuestId | null;
  hiddenGuestIds?: readonly GuestId[];
  onService?: (guest: GuestVisitView, action: GuestServiceAction) => void;
  onFavorRewardDialog?: (guest: GuestVisitView, text: string) => void;
};

/**
 * Dining-facing guest list foundation. It owns only presentation/selection state;
 * guest scheduling, favor, and once-per-visit trade rolls live in guest-system.ts.
 */
export default function DiningGuestArea({
  dayIndex,
  forcedActiveGuestId = null,
  enabledService = null,
  sellPriceCopper = null,
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
          onService={onService}
          enabledService={guest.selected ? enabledService : null}
          sellPriceCopper={guest.profile.id === "old_farmer" ? sellPriceCopper : null}
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
});
