import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
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

const ACTION_ICONS = [
  "chatbubble-ellipses-outline",
  "restaurant-outline",
  "swap-horizontal-outline",
  "gift-outline",
] as const;

/**
 * Foundation-only GuestCard. The four activity buttons are intentionally inert;
 * their gameplay is implemented in later guest/dining steps.
 */
export function GuestCard({ guest, onSelect }: GuestCardProps) {
  const { profile, favor, tradeOfferRoll, selected } = guest;

  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.cardSelected]}
      onPress={() => onSelect(profile.id)}
      activeOpacity={0.86}
    >
      <View style={styles.infoColumn}>
        <View>
          <Text style={styles.name}>{profile.name}</Text>
          <Text style={styles.subtitle}>Favor {favor}/100</Text>
        </View>

        <View style={styles.favorTrack}>
          <View style={[styles.favorFill, { width: `${favor}%` }]} />
        </View>

        <View style={styles.tradeBadge}>
          <Ionicons name="swap-horizontal-outline" size={14} color="#C4943A" />
          <Text style={styles.tradeText}>Trade roll {tradeOfferRoll}</Text>
        </View>

        {selected && (
          <View style={styles.selectedBadge}>
            <Text style={styles.selectedText}>Active guest</Text>
          </View>
        )}
      </View>

      <View style={styles.guestColumn}>
        {/* Portrait placeholder until the Old Farmer portrait asset is supplied. */}
        <View style={styles.portraitWrap}>
          <Ionicons name="person-outline" size={38} color="rgba(196,148,58,0.72)" />
        </View>

        <View style={styles.actionRow}>
          {ACTION_ICONS.map((icon) => (
            <View key={icon} style={styles.actionButton}>
              <Ionicons name={icon} size={15} color="rgba(240,232,213,0.42)" />
            </View>
          ))}
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

  return (
    <View style={styles.sectionCard}>
      {loading ? (
        <View style={styles.emptyArea}>
          <ActivityIndicator size="small" color="#C4943A" />
        </View>
      ) : guests.length === 0 ? (
        <View style={styles.emptyArea}>
          <Ionicons name="moon-outline" size={24} color="rgba(196,148,58,0.30)" />
          <Text style={styles.emptyText}>No guests today</Text>
        </View>
      ) : (
        <View style={styles.guestList}>
          {guests.map((guest) => (
            <GuestCard key={guest.profile.id} guest={guest} onSelect={handleSelect} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionCard: {
    marginHorizontal: 18,
    marginTop: 16,
    backgroundColor: "rgba(14,8,2,0.90)",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.35)",
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 16,
  },
  guestList: { gap: 10 },
  card: {
    minHeight: 142,
    flexDirection: "row",
    backgroundColor: "rgba(20,11,3,0.94)",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(90,65,30,0.46)",
    padding: 12,
    gap: 12,
  },
  cardSelected: {
    borderColor: "#C4943A",
    backgroundColor: "rgba(36,20,5,0.96)",
  },
  infoColumn: {
    flex: 1,
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  name: {
    color: "#F5E6C8",
    fontSize: 15,
    fontFamily: "Oldenburg",
    letterSpacing: 0.4,
  },
  subtitle: {
    marginTop: 4,
    color: "rgba(240,232,213,0.70)",
    fontSize: 11,
    fontFamily: "Oldenburg",
  },
  favorTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(0,0,0,0.45)",
    overflow: "hidden",
    marginVertical: 8,
  },
  favorFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: "#C4943A",
  },
  tradeBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "rgba(196,148,58,0.10)",
    borderWidth: 1,
    borderColor: "rgba(196,148,58,0.25)",
  },
  tradeText: {
    color: "rgba(240,232,213,0.72)",
    fontSize: 10,
    fontFamily: "Oldenburg",
  },
  selectedBadge: {
    alignSelf: "flex-start",
    marginTop: 7,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(196,148,58,0.18)",
  },
  selectedText: {
    color: "#C4943A",
    fontSize: 9,
    fontFamily: "Oldenburg",
  },
  guestColumn: {
    width: 104,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 9,
  },
  portraitWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(35,22,10,0.94)",
    borderWidth: 2,
    borderColor: "rgba(196,148,58,0.58)",
  },
  actionRow: {
    flexDirection: "row",
    gap: 4,
  },
  actionButton: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.025)",
    borderWidth: 1,
    borderColor: "rgba(196,148,58,0.18)",
  },
  emptyArea: {
    minHeight: 116,
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
