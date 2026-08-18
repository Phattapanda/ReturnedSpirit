import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Image,
  StyleSheet,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useAudioManager } from "@/src/audio/AudioProvider";
import SceneBackground from "@/src/components/SceneBackground";
import CurrencyHud from "@/src/components/CurrencyHud";
import DiningGuestArea from "@/src/components/GuestCard";
import PlayerBag, { BagIconButton } from "@/src/components/PlayerBag";
import StatusModal from "@/src/components/StatusModal";
import { DEFAULT_PLAYER_STATS, PLAYER_STATS_KEY, type PlayerStats } from "@/src/game/player-stats";
import { DEFAULT_BAG, PLAYER_BAG_KEY, type PlayerBagData } from "@/src/game/item-system";
import { createSnapshot, discardRuntimeAndRestore } from "@/src/game/save-manager";
import {
  PLAYER_AVATAR_KEY,
  getPlayerAvatarForStamina,
  normalizePlayerAvatarId,
  type PlayerAvatarId,
} from "@/src/game/player-avatar";

const DSK = {
  STAMINA:       "@game:stamina",
  LIFE:          "@game:life",
  PLAYER_NAME:   "@game:player_name",
  DAY_INDEX:     "@game:day_index",
  TIME_OF_DAY:   "@room:time_of_day",
  SAVE_LOCATION: "@game:save_location",
  ACTIVE_SLOT:   "@game:active_slot",
  GAME_SLOTS:    "game_slots",
} as const;

const IMG = {
  dining:      require("../assets/images/dining.png"),
  dining_dawn: require("../assets/images/dining_dawn.png"),
  loc_kitchen:   require("../assets/images/gotokitchen.png"),
  loc_garden:    require("../assets/images/gotogarden.png"),
  loc_dining:    require("../assets/images/gotodining.png"),
  loc_dormitory: require("../assets/images/gotodormitory.png"),
  loc_mail:      require("../assets/images/gotomail.png"),
  loc_explore:   require("../assets/images/goexplore.png"),
};

const DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

const LOCS = [
  { id: "kitchen",   nav: true  },
  { id: "garden",    nav: false },
  { id: "dining",    nav: false },
  { id: "dormitory", nav: false },
  { id: "mail",      nav: false },
  { id: "explore",   nav: false },
] as const;

const MEAL_SLOT_COUNT = 6;

export default function DiningScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ loadedFromSave?: string }>();
  const insets = useSafeAreaInsets();
  const audioManager = useAudioManager();

  const [staminaCurrent, setStaminaCurrent] = useState(40);
  const [lifeCurrent, setLifeCurrent] = useState(15);
  const [playerStats, setPlayerStats] = useState<PlayerStats>(DEFAULT_PLAYER_STATS);
  const [dayIdx, setDayIdx] = useState(0);
  const [playerAvatarId, setPlayerAvatarId] = useState<PlayerAvatarId>(1);
  const [timeOfDay, setTimeOfDay] = useState<"morning" | "evening">("evening");
  const [headerH, setHeaderH] = useState(0);
  const [playerBag, setPlayerBag] = useState<PlayerBagData>(DEFAULT_BAG);

  const [statusOpen, setStatusOpen] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        let loadedStats = DEFAULT_PLAYER_STATS;
        const rawStats = await AsyncStorage.getItem(PLAYER_STATS_KEY);
        if (rawStats) {
          try { loadedStats = { ...DEFAULT_PLAYER_STATS, ...JSON.parse(rawStats) }; } catch { /* default */ }
        }

        const rawSta = await AsyncStorage.getItem(DSK.STAMINA);
        const rawLife = await AsyncStorage.getItem(DSK.LIFE);
        const rawDay = await AsyncStorage.getItem(DSK.DAY_INDEX);
        const rawAv = await AsyncStorage.getItem(PLAYER_AVATAR_KEY);
        const rawTod = await AsyncStorage.getItem(DSK.TIME_OF_DAY);
        const rawBag = await AsyncStorage.getItem(PLAYER_BAG_KEY);

        if (!active) return;

        setPlayerStats(loadedStats);
        setStaminaCurrent(rawSta ? Math.min(Math.max(parseInt(rawSta, 10), 0), loadedStats.maximumStamina) : 40);
        setLifeCurrent(rawLife ? Math.min(Math.max(parseInt(rawLife, 10), 0), loadedStats.maximumLife) : 15);
        setDayIdx(rawDay !== null ? parseInt(rawDay, 10) : 0);
        setPlayerAvatarId(normalizePlayerAvatarId(rawAv));
        setTimeOfDay(rawTod === "morning" ? "morning" : "evening");
        if (rawBag) {
          try { setPlayerBag(JSON.parse(rawBag)); } catch { /* default */ }
        }

        await AsyncStorage.setItem(DSK.SAVE_LOCATION, "dining");
      } catch (e) {
        if (__DEV__) console.error("[Dining] load failed:", e);
      }
    })();
    return () => { active = false; };
  }, []);

  async function updateSaveSlot(day: number, stamina: number, life: number): Promise<number> {
    try {
      const rawSlot = await AsyncStorage.getItem(DSK.ACTIVE_SLOT);
      const rawSlots = await AsyncStorage.getItem(DSK.GAME_SLOTS);
      if (!rawSlot || !rawSlots) return -1;
      const slotNum = parseInt(rawSlot, 10);
      const slots = JSON.parse(rawSlots);
      const updated = slots.map((s: { slot: number }) =>
        s.slot === slotNum
          ? { ...s, dayIdx: day, stamina, life, lastSaved: new Date().toISOString() }
          : s,
      );
      await AsyncStorage.setItem(DSK.GAME_SLOTS, JSON.stringify(updated));
      return slotNum;
    } catch { return -1; }
  }

  async function handleManualSave() {
    setShowMenu(false);
    try {
      const slotNum = await updateSaveSlot(dayIdx, staminaCurrent, lifeCurrent);
      if (slotNum > 0) {
        await AsyncStorage.setItem(DSK.SAVE_LOCATION, "dining");
        await createSnapshot(slotNum, "manual");
      }
    } catch (e) {
      if (__DEV__) console.error("[Dining] manual save failed:", e);
    }
  }

  async function handleMainMenu() {
    setShowMenu(false);
    audioManager.stopGameplayMusic(1500);
    try {
      const rawSlot = await AsyncStorage.getItem(DSK.ACTIVE_SLOT);
      if (rawSlot) await discardRuntimeAndRestore(parseInt(rawSlot, 10));
    } catch { /* non-critical */ }
    router.replace("/");
  }

  function goToKitchen() {
    audioManager.playSoundEffect("footstep", { maxDurationMs: 4000 });
    if (router.canGoBack() && params.loadedFromSave !== "1") router.back();
    else router.replace("/kitchen");
  }

  const staminaPct = Math.max(0, Math.min(1, staminaCurrent / (playerStats.maximumStamina || 1)));
  const lifePct = Math.max(0, Math.min(1, lifeCurrent / (playerStats.maximumLife || 1)));

  return (
    <View style={styles.root}>
      <CurrencyHud />

      <SceneBackground source={timeOfDay === "morning" ? IMG.dining_dawn : IMG.dining} topOffset={headerH} />
      <View style={[StyleSheet.absoluteFill, { top: headerH }, styles.bgOverlay]} pointerEvents="none" />

      <View
        style={[styles.header, { paddingTop: insets.top + 6 }]}
        onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
      >
        <View style={styles.headerTopRow}>
          <View style={styles.leftHeader}>
            <View style={styles.statBarOuter}>
              <Ionicons name="flash" size={15} color="#C4943A" />
              <View style={styles.statBarTrack}>
                <View style={[styles.statBarFill, styles.staminaFill, { width: `${staminaPct * 100}%` }]}>
                  <View style={styles.staminaReflex} />
                </View>
              </View>
              <Text style={styles.statBarText}>{staminaCurrent}/{playerStats.maximumStamina}</Text>
            </View>
            <View style={styles.statBarOuter}>
              <Ionicons name="heart" size={13} color="#CC2200" />
              <View style={styles.statBarTrack}>
                <View style={[styles.statBarFill, styles.lifeFill, { width: `${lifePct * 100}%` }]} />
              </View>
              <Text style={styles.statBarText}>{lifeCurrent}/{playerStats.maximumLife}</Text>
            </View>
          </View>

          <View style={styles.rightHeader}>
            <View style={styles.dayBadge}>
              <Text style={styles.dayText}>{DAYS[dayIdx] ?? DAYS[0]}</Text>
            </View>
            <TouchableOpacity style={styles.menuBtn} onPress={() => setShowMenu(true)} activeOpacity={0.8}>
              <Ionicons name="menu" size={22} color="#F5E6C8" />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.locationName}>Dining Hall</Text>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.portraitRow}>
          <TouchableOpacity
            style={styles.circleWrap}
            onPress={() => setStatusOpen(true)}
            activeOpacity={0.8}
          >
            <Image
              source={getPlayerAvatarForStamina(playerAvatarId, staminaCurrent)}
              style={[styles.circleImg, styles.playerPortraitImage]}
              resizeMode="cover"
              resizeMethod="resize"
            />
          </TouchableOpacity>

          <View style={[styles.circleWrap, styles.rupertReserve]} pointerEvents="none" />

          <BagIconButton
            unlocked={playerBag.unlocked}
            onPress={() => setBagOpen(true)}
          />
        </View>

        {/* Six meal slots mirror the Kitchen crafting row: one compact horizontal line, no heading. */}
        <View style={styles.mealBar}>
          {Array.from({ length: MEAL_SLOT_COUNT }).map((_, i) => (
            <View key={i} style={styles.mealSlot}>
              <Ionicons name="restaurant-outline" size={22} color="rgba(196,148,58,0.34)" />
            </View>
          ))}
        </View>

        <DiningGuestArea dayIndex={dayIdx} />
      </ScrollView>

      <View style={[styles.locationBar, { paddingBottom: insets.bottom + 4 }]}>
        {LOCS.map((loc) => {
          const isCurrent = loc.id === "dining";
          const locImg = IMG[`loc_${loc.id}` as keyof typeof IMG] as number | undefined;
          const active = loc.nav || isCurrent;

          const content = locImg ? (
            <Image
              source={locImg}
              style={[styles.locBtnImg, !active && styles.locBtnImgLocked]}
              resizeMode="contain"
              resizeMethod="resize"
            />
          ) : (
            <Ionicons name="help-outline" size={22} color={active ? "#F5E6C8" : "#3A3535"} />
          );

          return (
            <TouchableOpacity
              key={loc.id}
              style={[
                styles.locBtn,
                isCurrent ? styles.locBtnCurrent : (loc.nav ? styles.locBtnActive : styles.locBtnLocked),
              ]}
              disabled={!loc.nav}
              onPress={loc.nav ? goToKitchen : undefined}
              activeOpacity={0.8}
            >
              {content}
            </TouchableOpacity>
          );
        })}
      </View>

      <Modal visible={showMenu} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.confirmPanel}>
            <Text style={styles.confirmTitle}>Menu</Text>
            <View style={{ height: 1, backgroundColor: "rgba(196,148,58,0.22)", marginVertical: 8, alignSelf: "stretch" }} />
            {[
              { icon: "play" as const, label: "Resume", action: () => setShowMenu(false) },
              { icon: "book-outline" as const, label: "Logbook", action: () => { setShowMenu(false); router.push("/logbook"); } },
              { icon: "save-outline" as const, label: "Save", action: handleManualSave },
              { icon: "home-outline" as const, label: "Main Menu", action: handleMainMenu },
              { icon: "settings-outline" as const, label: "Settings", action: () => { setShowMenu(false); router.push("/settings"); } },
            ].map((item) => (
              <TouchableOpacity
                key={item.label}
                style={styles.menuRow}
                onPress={item.action}
                activeOpacity={0.7}
              >
                <Ionicons name={item.icon} size={20} color="#C4943A" />
                <Text style={styles.menuRowText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      <PlayerBag
        bag={playerBag}
        visible={bagOpen}
        context="room"
        dayIdx={dayIdx}
        onClose={() => setBagOpen(false)}
        onTransferItem={() => {}}
      />

      <StatusModal
        visible={statusOpen}
        stats={playerStats}
        currentStamina={staminaCurrent}
        currentLife={lifeCurrent}
        onClose={() => setStatusOpen(false)}
        onStatsUpdated={(newStats, newLife) => {
          setPlayerStats(newStats);
          if (newLife !== null) setLifeCurrent(newLife);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0500" },
  bgOverlay: { backgroundColor: "rgba(0,0,0,0.30)" },

  header: {
    flexDirection: "column",
    paddingHorizontal: 12,
    paddingBottom: 6,
    backgroundColor: "rgba(14,7,1,0.85)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(196,148,58,0.20)",
    zIndex: 2,
  },
  headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  leftHeader: { flex: 1, gap: 5 },
  statBarOuter: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(10,5,0,0.82)",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(130,90,20,0.50)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 7,
  },
  statBarTrack: { flex: 1, height: 9, borderRadius: 5, backgroundColor: "#2A1800", overflow: "hidden" },
  statBarFill: { height: "100%", borderRadius: 5 },
  staminaFill: { backgroundColor: "#C4943A" },
  staminaReflex: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "45%",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 4,
  },
  lifeFill: { backgroundColor: "#CC2200" },
  statBarText: { color: "#F0E8D5", fontSize: 11, fontFamily: "Oldenburg", minWidth: 40, textAlign: "right" },
  locationName: { color: "#F0E8D5", fontSize: 13, fontFamily: "Oldenburg", letterSpacing: 1, textAlign: "center", marginTop: 4 },
  rightHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 10 },
  dayBadge: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: "rgba(196,148,58,0.16)",
    borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.38)",
    alignItems: "center",
    justifyContent: "center",
  },
  dayText: { color: "#F5E6C8", fontSize: 13, fontFamily: "Oldenburg", letterSpacing: 0.5 },
  menuBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(196,148,58,0.16)",
    borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.38)",
    alignItems: "center",
    justifyContent: "center",
  },

  scrollArea: { flex: 1, zIndex: 1 },

  portraitRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 18,
    paddingVertical: 12,
    backgroundColor: "rgba(14,7,1,0.65)",
  },
  circleWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: "hidden",
    borderWidth: 2.5,
    borderColor: "#C4943A",
    backgroundColor: "#2C1810",
  },
  circleImg: { width: "100%", height: "100%" },
  playerPortraitImage: { transform: [{ scale: 1.06 }] },
  rupertReserve: {
    opacity: 0,
    borderColor: "transparent",
    backgroundColor: "transparent",
  },

  mealBar: {
    marginHorizontal: 18,
    marginTop: 16,
    flexDirection: "row",
    gap: 6,
    padding: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.35)",
    backgroundColor: "rgba(14,8,2,0.90)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 14,
  },
  mealSlot: {
    flex: 1,
    aspectRatio: 1,
    minWidth: 0,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(90,65,30,0.46)",
    backgroundColor: "rgba(20,11,3,0.93)",
    alignItems: "center",
    justifyContent: "center",
  },

  locationBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingTop: 8,
    backgroundColor: "rgba(14,7,1,0.92)",
    borderTopWidth: 1,
    borderTopColor: "rgba(196,148,58,0.20)",
    zIndex: 2,
  },
  locBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  locBtnActive: { backgroundColor: "rgba(196,148,58,0.14)", borderColor: "rgba(196,148,58,0.40)" },
  locBtnCurrent: { backgroundColor: "rgba(196,148,58,0.26)", borderColor: "rgba(196,148,58,0.65)" },
  locBtnLocked: { backgroundColor: "rgba(30,22,10,0.55)", borderColor: "rgba(196,148,58,0.12)" },
  locBtnImg: { width: 30, height: 30 },
  locBtnImgLocked: { opacity: 0.35 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.76)",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmPanel: {
    width: "82%",
    backgroundColor: "#160B03",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1.5,
    borderColor: "rgba(196,148,58,0.38)",
    alignItems: "center",
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 24,
  },
  confirmTitle: { color: "#F5E6C8", fontSize: 17, fontFamily: "Oldenburg", letterSpacing: 0.8, textAlign: "center" },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 13,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignSelf: "stretch",
  },
  menuRowText: { color: "#F0E8D5", fontSize: 15, fontFamily: "Oldenburg", letterSpacing: 0.4 },
});
