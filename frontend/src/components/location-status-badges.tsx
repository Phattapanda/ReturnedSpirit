import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { loadGuestState } from "@/src/game/guest-system";
import {
  areRegularGuestsUnlockedForDay,
  loadPostGuestTutorialState,
} from "@/src/game/post-guest-tutorial";
import { loadMailboxState } from "@/src/game/mailbox-system";
import { loadCoachmanEscortState } from "@/src/game/coachman-escort-system";
import { loadCityState } from "@/src/game/city-system";
import { SLEEP_STAMINA_SPEND_REQUIRED } from "@/src/game/room-config";

const STAMINA_SPENT_TODAY_KEY = "@game:stamina_spent_today";

const PRIMARY_GARDEN_PLOT_KEY = "@garden:plot_01_data";
const SECOND_GARDEN_PLOT_KEY = "@garden:plot_02_data";
const THIRD_GARDEN_PLOT_KEY = "@garden:plot_03_data";
const FOURTH_GARDEN_PLOT_KEY = "@garden:plot_04_data";

type LocationStatus = {
  harvestReady: boolean;
  merchantPresent: boolean;
  mailboxUnread: boolean;
  receptionistPresent: boolean;
  sleepReady: boolean;
};

type StoredGardenPlot = {
  status?: string;
  readyToHarvest?: boolean;
};

const DEFAULT_STATUS: LocationStatus = {
  harvestReady: false,
  merchantPresent: false,
  mailboxUnread: false,
  receptionistPresent: false,
  sleepReady: false,
};

const listeners = new Set<() => void>();

export function notifyLocationStatusChanged(): void {
  for (const listener of listeners) listener();
}

function parsePlot(raw: string | null): StoredGardenPlot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredGardenPlot;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function plotIsReady(plot: StoredGardenPlot | null): boolean {
  return plot?.readyToHarvest === true || plot?.status === "ready";
}

async function loadLocationStatus(): Promise<LocationStatus> {
  // City deliveries (guild processing and ordered goods) become due while the
  // player may be anywhere in the tavern. Process them before checking unread
  // mail so the badge does not wait until Courier's Chest is opened.
  await loadCityState();
  const [primaryRaw, secondRaw, thirdRaw, fourthRaw, guestState, postGuestState, mailboxState, escortState, spentRaw] = await Promise.all([
    AsyncStorage.getItem(PRIMARY_GARDEN_PLOT_KEY),
    AsyncStorage.getItem(SECOND_GARDEN_PLOT_KEY),
    AsyncStorage.getItem(THIRD_GARDEN_PLOT_KEY),
    AsyncStorage.getItem(FOURTH_GARDEN_PLOT_KEY),
    loadGuestState(),
    loadPostGuestTutorialState(),
    loadMailboxState(),
    loadCoachmanEscortState(),
    AsyncStorage.getItem(STAMINA_SPENT_TODAY_KEY),
  ]);

  // Match Outside the Tavern exactly. Serving the Merchant in Dining Hall must
  // not hide this badge because his shop remains available outside all day.
  const merchantDay = (guestState.calendarDaySerial + 1) % 4 === 0;

  return {
    harvestReady: [primaryRaw, secondRaw, thirdRaw, fourthRaw].some((raw) => plotIsReady(parsePlot(raw))),
    merchantPresent:
      merchantDay &&
      areRegularGuestsUnlockedForDay(postGuestState, guestState.calendarDaySerial),
    mailboxUnread: mailboxState.messages.some((message) => !message.read),
    receptionistPresent: escortState.phase === "complete" && (guestState.calendarDaySerial + 1) % 7 === 0,
    sleepReady: Math.max(0, Number.parseInt(spentRaw ?? "0", 10) || 0) >= SLEEP_STAMINA_SPEND_REQUIRED,
  };
}

export function useLocationStatusBadges(): LocationStatus {
  const [status, setStatus] = useState<LocationStatus>(DEFAULT_STATUS);

  const refresh = useCallback(() => {
    let active = true;
    loadLocationStatus()
      .then((next) => {
        if (active) setStatus(next);
      })
      .catch(() => {
        if (active) setStatus(DEFAULT_STATUS);
      });
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(refresh);

  useEffect(() => {
    let active = true;
    const listener = () => {
      void loadLocationStatus()
        .then((next) => { if (active) setStatus(next); })
        .catch(() => { if (active) setStatus(DEFAULT_STATUS); });
    };
    listeners.add(listener);
    return () => {
      active = false;
      listeners.delete(listener);
    };
  }, []);

  return status;
}

type LocationStatusBadgeProps = {
  kind: "harvest" | "merchant" | "mail" | "receptionist" | "sleep";
};

export function LocationStatusBadge({ kind }: LocationStatusBadgeProps) {
  return (
    <View
      pointerEvents="none"
      style={[styles.badge, kind === "harvest" || kind === "sleep" ? styles.harvestBadge : styles.orangeBadge]}
    >
      <Text style={styles.badgeText}>{kind === "merchant" ? "?" : kind === "sleep" ? "✓" : "!"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: 2,
    right: 3,
    zIndex: 5,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.88)",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 4px rgba(0,0,0,0.65)",
  },
  harvestBadge: {
    backgroundColor: "#2F9E44",
  },
  orangeBadge: {
    backgroundColor: "#D97706",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "900",
    fontFamily: "Oldenburg",
    textAlign: "center",
  },
});
