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
 * Foundation-only GuestCard.
 *
 * Visual contract intentionally follows the Garden Plot:
 * - guest information/request occupies the large upper-left area
 * - portrait lives on the upper-right
 * - four large activity/service tiles run across the bottom
 *
 * Favor remains in the guest model but is intentionally NOT shown on the card.
 * It will later live in the guest detail window opened from the portrait.
 * Service actions are visual-only in Point 6.
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
        <View style={styles.guestTextArea}>
          <Text style={styles.name}>{profile.name}</Text>
          <Text style={styles.requestText}>“I could use something to eat.”</Text>
        </View>

        <View style={styles.portraitWrap}>
          {portrait ? (
            <Image source={portrait} style={styles.portraitImage} resizeMode="cover" resizeMethod="resize" />
          ) : (
            <Ionicons name="person-outline" size={42} color="rgba(196,148,58,0.76)" />
          )}
        </View>
      </View>

      <View style={styles.serviceRow}>
        <View style={styles.serviceButton} pointerEvents="none">
          <View style={styles.serviceArtwork}>
            <Image source={SERVICE_SELL} style={styles.serviceImage} resizeMode="contain" resizeMethod="resize" />
          </View>
          <View style={styles.serviceLabelRow}>
            <Text style={styles.serviceLabel}>Sell for X</Text>
            <Image source={COIN_COPPER} style={styles.miniCoin} resizeMode="contain" resizeMethod="resize" />
          </View>
        </View>

        <View style={styles.serviceButton} pointerEvents="none">
          <View style={styles.serviceArtwork}>
            <View style={styles.tradeItemWrap}>
              <Image source={TRADE_POTATO} style={styles.tradeItemImage} resizeMode="contain" resizeMethod="resize" />
              {/* Stack quantity badge is intentionally omitted until roll → item/quantity is defined. */}
            </View>
          </View>
          <Text style={styles.serviceLabel}>Trade</Text>
        </View>

        <View style={styles.serviceButton} pointerEvents="none">
          <View style={styles.serviceArtwork}>
            <Image source={SERVICE_WATER} style={styles.serviceImage} resizeMode="contain" resizeMethod="resize" />
          </View>
          <View style={styles.serviceLabelWrap}>
            <Text style={styles.serviceLabel}>Offer water for 1</Text>
            <Image source={COIN_COPPER} style={styles.miniCoin} resizeMode="contain" resizeMethod="resize" />
          </View>
        </View>

        <View style={styles.serviceButton} pointerEvents="none">
          <View style={styles.serviceArtwork}>
            <Image source={SERVICE_TALK} style={styles.serviceImage} resizeMode="contain" resizeMethod="resize" />
          </View>
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
        // finishes loading. Always prefer the persisted core day so that mount timing
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
  card: {
    backgroundColor: "rgba(20,11,3,0.94)",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.42)",
    padding: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 16,
  },
  cardSelected: {
    borderWidth: 2,
    borderColor: "#D8A64A",
    backgroundColor: "rgba(47,25,6,0.97)",
    transform: [{ translateY: -8 }],
  },
  guestTopRow: {
    minHeight: 112,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 4,
    paddingBottom: 10,
  },
  guestTextArea: {
    flex: 1,
    alignSelf: "stretch",
    paddingVertical: 4,
  },
  name: {
    color: "#F5E6C8",
    fontSize: 16,
    fontFamily: "Oldenburg",
    letterSpacing: 0.45,
  },
  requestText: {
    marginTop: 16,
    color: "rgba(240,232,213,0.86)",
    fontSize: 13,
    lineHeight: 20,
    fontFamily: "Oldenburg",
  },
  portraitWrap: {
    width: 92,
    height: 92,
    borderRadius: 46,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(35,22,10,0.96)",
    borderWidth: 2.5,
    borderColor: "rgba(196,148,58,0.68)",
  },
  portraitImage: {
    width: "100%",
    height: "100%",
  },
  serviceRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(196,148,58,0.18)",
  },
  serviceButton: {
    flex: 1,
    minHeight: 112,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(196,148,58,0.28)",
    backgroundColor: "rgba(18,10,3,0.82)",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingTop: 7,
    paddingBottom: 7,
  },
  serviceArtwork: {
    height: 68,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  serviceImage: {
    width: "78%",
    height: "78%",
  },
  tradeItemWrap: {
    width: "78%",
    height: "78%",
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
    lineHeight: 13,
    textAlign: "center",
    fontFamily: "Oldenburg",
  },
  serviceLabelRow: {
    minHeight: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  serviceLabelWrap: {
    minHeight: 28,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  miniCoin: {
    width: 12,
    height: 12,
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
