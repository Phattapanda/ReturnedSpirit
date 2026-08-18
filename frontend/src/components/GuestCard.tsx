import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
  type GuestId,
  type GuestVisitView,
} from "@/src/game/guest-system";

type GuestCardProps = {
  guest: GuestVisitView;
  onSelect: (guestId: GuestId) => void;
};

const COIN_COPPER = require("../../assets/images/coin_copper.png");
const OLD_FARMER = require("../../assets/images/old_farmer.png");
const COACHMAN = require("../../assets/images/coachman.png");
const SERVICE_SELL = require("../../assets/images/service_sell.png");
const SERVICE_WATER = require("../../assets/images/service_water.png");
const SERVICE_TALK = require("../../assets/images/service_talk.png");
const TRADE_POTATO = require("../../assets/images/potato.png");

const GUEST_PORTRAITS: Record<string, ReturnType<typeof require>> = {
  old_farmer: OLD_FARMER,
  coachman: COACHMAN,
};

/**
 * Foundation-only GuestCard, intentionally modeled after GardenPlot:
 * - square guest portrait on the LEFT, like the crop/Herb Bed image
 * - guest name + request text in the main information area
 * - four large, finger-friendly service tiles below
 *
 * Favor remains in the guest model but is intentionally NOT shown here. A later
 * guest-detail view can expose it from the portrait. Dialog presentation is kept
 * separate so future half-body dialog art does not constrain this card layout.
 * Service actions remain visual-only in Point 6.
 */
export function GuestCard({ guest, onSelect }: GuestCardProps) {
  const { profile, selected } = guest;
  const portrait = GUEST_PORTRAITS[profile.portraitKey];

  return (
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
        <View style={styles.serviceButton} pointerEvents="none">
          <Image source={SERVICE_SELL} style={styles.serviceImage} resizeMode="contain" resizeMethod="resize" />
          <View style={styles.serviceLabelInline}>
            <Text
              style={styles.serviceLabel}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
            >
              Sell for X
            </Text>
            <Image source={COIN_COPPER} style={styles.miniCoin} resizeMode="contain" resizeMethod="resize" />
          </View>
        </View>

        <View style={styles.serviceButton} pointerEvents="none">
          <View style={styles.tradeItemWrap}>
            <Image source={TRADE_POTATO} style={styles.tradeItemImage} resizeMode="contain" resizeMethod="resize" />
            {/* Stack badge will be added when roll → concrete item quantity is defined. */}
          </View>
          <Text style={styles.serviceLabel}>Trade</Text>
        </View>

        <View style={styles.serviceButton} pointerEvents="none">
          <Image source={SERVICE_WATER} style={styles.serviceImage} resizeMode="contain" resizeMethod="resize" />
          <View style={styles.serviceLabelInline}>
            <Text
              style={styles.serviceLabel}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.68}
            >
              Offer water for 1
            </Text>
            <Image source={COIN_COPPER} style={styles.miniCoin} resizeMode="contain" resizeMethod="resize" />
          </View>
        </View>

        <View style={styles.serviceButton} pointerEvents="none">
          <Image source={SERVICE_TALK} style={styles.serviceImage} resizeMode="contain" resizeMethod="resize" />
          <Text style={styles.serviceLabel}>Talk</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

type DiningGuestAreaProps = {
  dayIndex: number;
};

/**
 * Dining-facing guest list foundation. It owns only presentation/selection state;
 * guest scheduling, favor, and once-per-visit trade rolls live in guest-system.ts.
 */
export default function DiningGuestArea({ dayIndex }: DiningGuestAreaProps) {
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
        if (active) setGuests(prepared);
      } catch {
        if (active) setGuests([]);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [dayIndex]);

  async function handleSelect(guestId: GuestId) {
    await setActiveGuest(guestId);
    setGuests((current) => current.map((guest) => ({
      ...guest,
      selected: guest.profile.id === guestId,
    })));
  }

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

  return (
    <View style={styles.guestList}>
      {guests.map((guest) => (
        <GuestCard key={guest.profile.id} guest={guest} onSelect={handleSelect} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  guestList: {
    marginHorizontal: 18,
    marginTop: 18,
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
  },
  guestTextArea: {
    flex: 1,
    gap: 8,
  },
  name: {
    color: "#F5E6C8",
    fontSize: 16,
    fontFamily: "Oldenburg",
    letterSpacing: 0.45,
  },
  requestText: {
    color: "rgba(240,232,213,0.86)",
    fontSize: 13,
    lineHeight: 20,
    fontFamily: "Oldenburg",
  },

  divider: {
    height: 1,
    backgroundColor: "rgba(196,148,58,0.18)",
    marginHorizontal: 10,
  },

  // Exact GardenPlot action rhythm: shorter fields, smaller images, text directly below.
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
    fontSize: 9.5,
    lineHeight: 12,
    textAlign: "center",
    fontFamily: "Oldenburg",
    flexShrink: 1,
  },
  serviceLabelInline: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  miniCoin: {
    width: 10,
    height: 10,
    flexShrink: 0,
  },

  emptyCard: {
    minHeight: 120,
    marginHorizontal: 18,
    marginTop: 18,
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