import React, { useCallback, useState } from "react";
import { Image, Modal, StyleSheet, Text, TouchableOpacity, View, type ImageSourcePropType } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import PlayerBag, { BagIconButton } from "@/src/components/PlayerBag";
import CurrencyHud from "@/src/components/CurrencyHud";
import StatusModal from "@/src/components/StatusModal";
import { DEFAULT_BAG, PLAYER_BAG_KEY, normalizePlayerBagData, type PlayerBagData } from "@/src/game/item-system";
import { DEFAULT_PLAYER_STATS, PLAYER_STATS_KEY, normalizePlayerStats, type PlayerStats } from "@/src/game/player-stats";
import { PLAYER_AVATAR_KEY, getPlayerAvatarForStamina, normalizePlayerAvatarId, type PlayerAvatarId } from "@/src/game/player-avatar";
import { activeTempleBlessing } from "@/src/game/city-system";

const DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

type Props = {
  locationName: string;
  showPortraitRow?: boolean;
  onHeaderHeightChange?: (height: number) => void;
  onPortraitBottomChange?: (bottom: number) => void;
  refreshKey?: number;
  bagAttention?: boolean;
  supporterImage?: ImageSourcePropType;
  onSupporterPress?: () => void;
};

export default function TravelHeader({ locationName, showPortraitRow = false, onHeaderHeightChange, onPortraitBottomChange, refreshKey = 0, bagAttention = false, supporterImage, onSupporterPress }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [stamina, setStamina] = useState(0);
  const [life, setLife] = useState(0);
  const [dayIdx, setDayIdx] = useState(0);
  const [stats, setStats] = useState<PlayerStats>(DEFAULT_PLAYER_STATS);
  const [avatarId, setAvatarId] = useState<PlayerAvatarId>(1);
  const [bag, setBag] = useState<PlayerBagData>(DEFAULT_BAG);
  const [bagOpen, setBagOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [templeBlessing, setTempleBlessing] = useState<Awaited<ReturnType<typeof activeTempleBlessing>>>(null);

  useFocusEffect(useCallback(() => {
    void refreshKey;
    let active = true;
    (async () => {
      const [[rawStamina, rawLife, rawDay, rawStats, rawAvatar, rawBag], blessing] = await Promise.all([
        AsyncStorage.multiGet(["@game:stamina", "@game:life", "@game:day_index", PLAYER_STATS_KEY, PLAYER_AVATAR_KEY, PLAYER_BAG_KEY]),
        activeTempleBlessing(),
      ]);
      if (!active) return;
      const loadedStats = rawStats[1] ? normalizePlayerStats(JSON.parse(rawStats[1])) : DEFAULT_PLAYER_STATS;
      setStats(loadedStats);
      setTempleBlessing(blessing);
      setStamina(Math.max(0, Number.parseInt(rawStamina[1] ?? "0", 10) || 0));
      setLife(Math.max(0, Number.parseInt(rawLife[1] ?? "0", 10) || 0));
      setDayIdx(Math.max(0, Number.parseInt(rawDay[1] ?? "0", 10) || 0) % 7);
      setAvatarId(normalizePlayerAvatarId(rawAvatar[1]));
      if (rawBag[1]) setBag(normalizePlayerBagData(JSON.parse(rawBag[1])));
    })().catch(() => {});
    return () => { active = false; };
  }, [refreshKey]));

  const effectiveMaximumStamina = stats.maximumStamina + (templeBlessing === "endurance" ? 50 : 0);
  const staminaPct = Math.max(0, Math.min(1, stamina / Math.max(1, effectiveMaximumStamina)));
  const lifePct = Math.max(0, Math.min(1, life / Math.max(1, stats.maximumLife)));

  return (
    <>
      <View
        style={[styles.header, { paddingTop: insets.top + 6 }]}
        onLayout={(event) => onHeaderHeightChange?.(event.nativeEvent.layout.height)}
      >
        <View style={styles.headerTopRow}>
          <View style={styles.leftHeader}>
            <View style={styles.statBarOuter}>
              <Ionicons name="flash" size={15} color="#C4943A" />
              <View style={styles.statBarTrack}><View style={[styles.staminaFill, { width: `${staminaPct * 100}%` }]} /></View>
              <Text style={styles.statBarText}>{stamina}/{effectiveMaximumStamina}</Text>
            </View>
            <View style={styles.statBarOuter}>
              <Ionicons name="heart" size={13} color="#CC2200" />
              <View style={styles.statBarTrack}><View style={[styles.lifeFill, { width: `${lifePct * 100}%` }]} /></View>
              <Text style={styles.statBarText}>{life}/{stats.maximumLife}</Text>
            </View>
          </View>
          <View style={styles.rightHeaderColumn}>
            <View style={styles.rightHeader}>
              <View style={styles.dayBadge}><Text style={styles.dayText}>{DAYS[dayIdx]}</Text></View>
              <TouchableOpacity style={styles.menuButton} onPress={() => setMenuOpen(true)} activeOpacity={0.8}>
                <Ionicons name="menu" size={22} color="#F5E6C8" />
              </TouchableOpacity>
            </View>
            <CurrencyHud inline compact />
          </View>
        </View>
        <Text style={styles.locationName}>{locationName}</Text>
      </View>

      {showPortraitRow && (
        <View
          style={styles.portraitRow}
          onLayout={(event) => {
            const { y, height } = event.nativeEvent.layout;
            onPortraitBottomChange?.(y + height - 12);
          }}
        >
          <TouchableOpacity style={styles.circleWrap} onPress={() => setStatusOpen(true)} activeOpacity={0.8}>
            <Image source={getPlayerAvatarForStamina(avatarId, stamina)} style={styles.circleImg} resizeMode="cover" />
          </TouchableOpacity>
          {supporterImage ? <TouchableOpacity style={styles.supporterWrap} onPress={onSupporterPress} activeOpacity={0.82}><Image source={supporterImage} style={styles.supporterImg} /></TouchableOpacity> : null}
          <BagIconButton unlocked={bag.unlocked} bagId={bag.bagId} pulsing={bagAttention} onPress={() => setBagOpen(true)} />
        </View>
      )}

      <PlayerBag
        bag={bag}
        visible={bagOpen}
        context="none"
        dayIdx={dayIdx}
        onClose={() => setBagOpen(false)}
        onTransferItem={() => {}}
        onBagUpdated={setBag}
        onStatsUpdated={setStats}
        onStaminaUpdated={setStamina}
        onLifeUpdated={setLife}
      />
      <StatusModal
        visible={statusOpen}
        stats={stats}
        currentStamina={stamina}
        currentLife={life}
        onClose={() => setStatusOpen(false)}
        onStatsUpdated={(nextStats, nextLife) => {
          setStats(nextStats);
          void AsyncStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(nextStats));
          if (nextLife !== null) {
            setLife(nextLife);
            void AsyncStorage.setItem("@game:life", String(nextLife));
          }
        }}
      />
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuPanel}>
            <Text style={styles.menuTitle}>Menu</Text>
            {[
              { icon: "play" as const, label: "Resume", action: () => setMenuOpen(false) },
              { icon: "book-outline" as const, label: "Logbook", action: () => { setMenuOpen(false); router.push("/logbook"); } },
              { icon: "settings-outline" as const, label: "Settings", action: () => { setMenuOpen(false); router.push("/settings"); } },
            ].map((item) => (
              <TouchableOpacity key={item.label} style={styles.menuRow} onPress={item.action} activeOpacity={0.8}>
                <Ionicons name={item.icon} size={20} color="#C4943A" />
                <Text style={styles.menuRowText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 12,
    paddingBottom: 6,
    backgroundColor: "rgba(14,7,1,0.85)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(196,148,58,0.20)",
    zIndex: 4,
  },
  headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  leftHeader: { flex: 1, gap: 5 },
  statBarOuter: {
    flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 18, borderWidth: 1.5,
    borderColor: "rgba(130,90,20,0.50)", backgroundColor: "rgba(10,5,0,0.82)", paddingHorizontal: 10, paddingVertical: 5,
  },
  statBarTrack: { flex: 1, height: 9, borderRadius: 5, backgroundColor: "#2A1800", overflow: "hidden" },
  staminaFill: { height: "100%", backgroundColor: "#C4943A", borderRadius: 5 },
  lifeFill: { height: "100%", backgroundColor: "#CC2200", borderRadius: 5 },
  statBarText: { color: "#F0E8D5", minWidth: 54, textAlign: "right", fontSize: 11, fontFamily: "Oldenburg" },
  dayBadge: {
    width: 42, height: 42, borderRadius: 9, alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "rgba(196,148,58,0.38)", backgroundColor: "rgba(196,148,58,0.16)",
  },
  rightHeaderColumn: { alignItems: "flex-end", alignSelf: "flex-start", gap: 4, transform: [{ translateY: -2 }] },
  rightHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  menuButton: {
    width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "rgba(196,148,58,0.38)", backgroundColor: "rgba(196,148,58,0.16)",
  },
  dayText: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 13 },
  locationName: { color: "#F0E8D5", textAlign: "center", fontFamily: "Oldenburg", fontSize: 13, letterSpacing: 1, marginTop: 4 },
  portraitRow: {
    zIndex: 3, flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 22, paddingVertical: 12,
  },
  circleWrap: {
    width: 96, height: 96, borderRadius: 48, overflow: "hidden", borderWidth: 2.5,
    borderColor: "#C4943A", backgroundColor: "rgba(44,24,16,0.50)",
  },
  circleImg: { width: "100%", height: "100%", transform: [{ scale: 1.06 }] },
  supporterWrap: { width: 78, height: 78, borderRadius: 39, overflow: "hidden", borderWidth: 2.5, borderColor: "#7D62C8", backgroundColor: "rgba(25,18,43,0.82)" },
  supporterImg: { width: "100%", height: "100%" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.76)", alignItems: "center", justifyContent: "center" },
  menuPanel: {
    width: 264, backgroundColor: "#160B03", borderRadius: 20, padding: 22,
    borderWidth: 1.5, borderColor: "rgba(196,148,58,0.38)", gap: 4,
  },
  menuTitle: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 18, textAlign: "center", paddingBottom: 8 },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 13, paddingHorizontal: 6 },
  menuRowText: { color: "#F0E8D5", fontFamily: "Oldenburg", fontSize: 15 },
});
