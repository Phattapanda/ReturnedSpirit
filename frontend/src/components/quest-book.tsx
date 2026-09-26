import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions, type ImageSourcePropType } from "react-native";

import { DIALOG_CHARACTER_ASSETS, RUPERT_DIALOG_SCALE } from "@/src/assets/dialog-character-assets";
import StoryDialogOverlay, { type StoryDialogLine } from "@/src/components/story-dialog-overlay";
import { MERCHANT_CONTRACTS, QUESTS, getQuestDefinition, loadCityState, merchantContractDaysRemaining, type QuestId } from "@/src/game/city-system";
import { loadGuestState } from "@/src/game/guest-system";
import { loadCoachmanEscortState, type CoachmanEscortPhase } from "@/src/game/coachman-escort-system";
import { isGuestAreaComplete, loadPostGuestTutorialState } from "@/src/game/post-guest-tutorial";
import { loadQuestBookUnlocked, subscribeQuestBookUnlocked } from "@/src/game/questbook-system";
import { loadElapsedDays, loadTitheState } from "@/src/game/tithe-system";
import { claimTavernQuest, loadTavernQuestState, markAleIngredientsDialogueSeen, repairLegacyCleanQuestReward, subscribeTavernQuests, type TavernQuestId } from "@/src/game/tavern-quest-system";
import { DEFAULT_BAG, PLAYER_BAG_KEY, normalizePlayerBagData, type PlayerBagData } from "@/src/game/item-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { UI_NOTIFICATION_DURATION_MS } from "@/src/ui/timings";
import { hasGuestRoomUpgradeItem, loadGuestRoomState, subscribeGuestRoomState, unlockGuestRoomOffer } from "@/src/game/guest-room-system";

type QuestTab = "open" | "complete";
type QuestBookEntry = { id: string; source: string; title: string; detail: string; emphasizedDetail?: string; tab: QuestTab; ready?: boolean; progress?: string; reward?: "potion" | "carrot_seed" | "copper" | "ale_upgrade" | "guest_rooms" | "fertilizer"; tavernQuestId?: TavernQuestId };
const NPC_ESCORT_PHASES = new Set<CoachmanEscortPhase>(["accepted", "journey", "combat", "post_combat", "city_arrival", "city_exploration"]);
const REWARD_IMAGES: Record<NonNullable<QuestBookEntry["reward"]>, ImageSourcePropType> = {
  fertilizer: require("../../assets/images/fertilizer.png"),
  potion: require("../../assets/images/potion_stamina_low_grade.png"), carrot_seed: require("../../assets/images/seed_carrot.png"), copper: require("../../assets/images/coin_copper.png"), ale_upgrade: require("../../assets/images/questbook.png"), guest_rooms: require("../../assets/images/gotodormitory.png"),
};

function coachmanObjective(phase: CoachmanEscortPhase) {
  if (phase === "accepted") return { title: "Journey to the Next City", detail: "Meet the Coachman outside the tavern when you are ready to leave." };
  if (phase === "city_arrival" || phase === "city_exploration") return { title: "The Wild Wolf Carcass", detail: "Bring the Wild Wolf carcass to the Adventurers’ Guild." };
  return { title: "Journey to the Next City", detail: "Travel safely to the city with the Coachman." };
}

async function loadQuestBookEntries(): Promise<QuestBookEntry[]> {
  const [city, escort, post, tavern, tithe, elapsedDays, guestState, guestRoom, rawBag] = await Promise.all([loadCityState(), loadCoachmanEscortState(), loadPostGuestTutorialState(), loadTavernQuestState(), loadTitheState(), loadElapsedDays(), loadGuestState(), loadGuestRoomState(), AsyncStorage.getItem(PLAYER_BAG_KEY)]);
  let bag = { ...DEFAULT_BAG, slots: [...DEFAULT_BAG.slots] };
  try { if (rawBag) bag = normalizePlayerBagData(JSON.parse(rawBag)); } catch { /* use an empty normalized bag */ }
  const entries: QuestBookEntry[] = [];
  (Object.keys(QUESTS) as QuestId[]).forEach((id) => {
    const state = city.quests[id];
    if (state.status === "offered") return;
    const definition = getQuestDefinition(id, city);
    const target = definition.targetQuantity ?? 1;
    entries.push({ id: `guild-${id}`, source: "Adventurers’ Guild", title: definition.title, detail: definition.detail, tab: state.status === "completed" ? "complete" : "open", ready: state.status === "ready", progress: id === "wolves" && state.status !== "completed" ? `${Math.min(target, state.progress)}/${target}` : undefined });
  });
  if (city.adventurerPromotionActive || city.adventurerPromotionCompleted) {
    const complete = city.adventurerPromotionCompleted;
    const ready = !complete && city.adventurerPromotionProgress >= 3;
    entries.push({
      id: "adventurer-promotion-rank-g",
      source: "Adventurers’ Guild",
      title: "Rank-Up Aptitude Test · Rank G",
      detail: ready ? "Return to the Receptionist to complete the promotion. Reward: 3 Silver Coins." : "Defeat 3 Ember Roosters. Reward: 3 Silver Coins.",
      tab: complete ? "complete" : "open",
      ready,
      progress: complete ? undefined : `${city.adventurerPromotionProgress}/3`,
    });
  }
  city.activeMerchantContracts.forEach((contract) => {
    const definition = MERCHANT_CONTRACTS[contract.id];
    entries.push({ id: `merchant-contract-${contract.id}-${contract.acceptedDay}`, source: "Merchant’s Guild", title: definition.title, detail: definition.detail, tab: "open", progress: `${merchantContractDaysRemaining(contract, guestState.calendarDaySerial)} days remaining` });
  });
  city.completedMerchantContracts.forEach((contract, index) => {
    const definition = MERCHANT_CONTRACTS[contract.id];
    entries.push({ id: `merchant-contract-complete-${contract.id}-${contract.completedDay}-${index}`, source: "Merchant’s Guild", title: definition.title, detail: definition.detail, tab: "complete" });
  });
  if (city.merchantGuildIntroductionSeen) entries.push({ id: "merchant-aptitude-test", source: "Merchant’s Guild", title: "Merchant Aptitude Test", detail: "Bring the Merchant Guild Receptionist a herbal pouch containing exactly eleven herbs.", tab: city.merchantRegistered ? "complete" : "open" });
  if (NPC_ESCORT_PHASES.has(escort.phase)) entries.push({ id: "npc-coachman-escort", source: "Coachman", ...coachmanObjective(escort.phase), tab: "open" });
  else if (escort.phase === "complete") entries.push({ id: "npc-coachman-escort", source: "Coachman", title: "Journey to the Next City", detail: "Arrived safely and registered at the Adventurers’ Guild.", tab: "complete" });
  if (tithe.deferredDebtCopper > 0 && tithe.phase === "idle") {
    const remainder = elapsedDays % 14;
    const daysRemaining = remainder === 0 ? 14 : 14 - remainder;
    entries.push({ id: "tithe-debt", source: "Civil Servant", title: "Outstanding Tithe", detail: `The Civil Servant returns in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}.`, tab: "open" });
  }
  const addTavern = (id: TavernQuestId, title: string, detail: string, ready: boolean, progress: string | undefined, reward: QuestBookEntry["reward"]) => entries.push({ id: `tavern-${id}`, source: "Rupert", title, detail, tab: tavern.claimed[id] ? "complete" : "open", ready, progress, reward, tavernQuestId: id });
  addTavern("clean_guest_area", "Clean the guest area", "Talk to Rupert.", isGuestAreaComplete(post), `${Math.min(5, post.guestAreaCleanSteps)}/5`, "potion");
  addTavern("build_second_plot", "Build the second Plot", "Get the materials in the Garden and talk to Rupert.", post.secondPlotUnlocked, post.secondPlotUnlocked ? "Built" : undefined, "carrot_seed");
  if (tavern.claimed.clean_guest_area) addTavern("serve_food", "Serve food to 5 guests", "Serve meals to five guests. Water does not count.", tavern.foodServed >= 5, `${tavern.foodServed}/5`, "copper");
  if (tavern.claimed.serve_food) addTavern("serve_water", "Serve water to 5 guests", "Serve water to five guests.", tavern.waterServed >= 5, `${tavern.waterServed}/5`, "ale_upgrade");
  if (tavern.claimed.serve_food) addTavern("serve_guests", "Serve 50 guests", "Serve a total of fifty guests food or drinks.", tavern.guestsServed >= 50, `${tavern.guestsServed}/50`, "guest_rooms");
  if (tavern.claimed.serve_water && tavern.aleIngredientsDialogueSeen) addTavern("standard_ale_ingredients", "Get the ingredients for Standard Ale.", "Bring Malted Barley, Dried Hop Cones and Brewer's Yeast to Rupert and complete the Standard Ale upgrade.", post.aleServiceUnlocked, post.aleServiceUnlocked ? "Upgrade completed" : undefined, "fertilizer");
  if (["quest_active", "building", "complete"].includes(guestRoom.upgradePhase)) {
    const handedOver = guestRoom.upgradePhase === "building" || guestRoom.upgradePhase === "complete";
    entries.push({
      id: "carpenter-guest-room-1-upgrade",
      source: "Carpenter",
      title: "Upgrade Guest Room 1",
      detail: handedOver ? "The Elder Ember Rooster Comb was delivered to the Carpenter." : "Bring an Elder Ember Rooster Comb to the Carpenter.",
      emphasizedDetail: "Elder Ember Rooster Comb",
      tab: handedOver ? "complete" : "open",
      ready: !handedOver && hasGuestRoomUpgradeItem(bag),
      progress: handedOver ? undefined : hasGuestRoomUpgradeItem(bag) ? "1/1 · Return to the Carpenter" : "0/1",
    });
  }
  return entries;
}

function QuestDetail({ entry }: { entry: QuestBookEntry }) {
  if (!entry.emphasizedDetail || !entry.detail.includes(entry.emphasizedDetail)) return <Text style={styles.detail}>{entry.detail}</Text>;
  const [before, after] = entry.detail.split(entry.emphasizedDetail);
  return <Text style={styles.detail}>{before}<Text style={styles.detailEmphasis}>{entry.emphasizedDetail}</Text>{after}</Text>;
}

function rewardDialog(id: TavernQuestId): StoryDialogLine[] {
  if (id === "serve_guests") return [
    { speaker: "Rupert", portrait: DIALOG_CHARACTER_ASSETS.rupert.laugh, characterScale: RUPERT_DIALOG_SCALE, text: "Wow, it’s really gotten livelier. That reminds me of the old days." },
    { speaker: "Rupert", portrait: DIALOG_CHARACTER_ASSETS.rupert.sad, characterScale: RUPERT_DIALOG_SCALE, text: "Grieving for my late wife, I had sorely neglected the tavern." },
    { speaker: "Rupert", portrait: DIALOG_CHARACTER_ASSETS.rupert.normal, characterScale: RUPERT_DIALOG_SCALE, text: "But she had loved that tavern. Thanks for reminding me." },
    { speaker: "Rupert", portrait: DIALOG_CHARACTER_ASSETS.rupert.normal, characterScale: RUPERT_DIALOG_SCALE, text: "If you like, we can fix up the rooms on the second floor so that we can host overnight guests." },
    { speaker: "Rupert", portrait: DIALOG_CHARACTER_ASSETS.rupert.sad, characterScale: RUPERT_DIALOG_SCALE, text: "It would be better to hire the carpenter. The rooms are in quite poor condition." },
  ];
  if (id === "standard_ale_ingredients") return [
    { speaker: "Rupert", portrait: DIALOG_CHARACTER_ASSETS.rupert.laugh, characterScale: RUPERT_DIALOG_SCALE, text: "I never thought I would start brewing beer again." },
    { speaker: "Rupert", portrait: DIALOG_CHARACTER_ASSETS.rupert.laugh, characterScale: RUPERT_DIALOG_SCALE, text: "I'll start right away; it takes a day. Starting tomorrow, you can serve it to the guests instead of water. Here, take this." },
  ];
  if (id === "clean_guest_area") return [
    { speaker: "Rupert", portrait: DIALOG_CHARACTER_ASSETS.rupert.laugh, characterScale: RUPERT_DIALOG_SCALE, text: '“Wow, it looks neat and tidy again!”' },
    { speaker: "Rupert", portrait: DIALOG_CHARACTER_ASSETS.rupert.laugh, characterScale: RUPERT_DIALOG_SCALE, text: '“Maybe more guests will stop by again now that it doesn\'t look like a haunted house anymore.”' },
    { speaker: "Rupert", portrait: DIALOG_CHARACTER_ASSETS.rupert.normal, characterScale: RUPERT_DIALOG_SCALE, text: '“Thanks a lot for the effort. I don’t have much, but please take this as thanks.”' },
  ];
  if (id === "build_second_plot") return [{ speaker: "Rupert", portrait: DIALOG_CHARACTER_ASSETS.rupert.normal, characterScale: RUPERT_DIALOG_SCALE, text: '“Great, now more can be planted. I found some carrot seeds, I will put them into the garden storage.”' }];
  if (id === "serve_food") return [
    { speaker: "Rupert", portrait: DIALOG_CHARACTER_ASSETS.rupert.laugh, characterScale: RUPERT_DIALOG_SCALE, text: '“You\'re doing a good job as a server. If you talk to the guests more often, they sometimes reveal their preferences to you.”' },
    { speaker: "Rupert", portrait: DIALOG_CHARACTER_ASSETS.rupert.normal, characterScale: RUPERT_DIALOG_SCALE, text: '“Here, they left this for you as a tip.”' },
  ];
  return [
    { speaker: "Rupert", portrait: DIALOG_CHARACTER_ASSETS.rupert.sad, characterScale: RUPERT_DIALOG_SCALE, text: '“Hmm, it’s sad that we can only offer water to drink. If only I could brew some Ale. But for that, I’d need specific ingredients.”' },
    { speaker: "Rupert", portrait: DIALOG_CHARACTER_ASSETS.rupert.normal, characterScale: RUPERT_DIALOG_SCALE, text: '“It’s possible to get the special ingredients from the City, but one of them is an imported item and only occasionally available at the Merchants\' Guild.”' },
  ];
}

type Props = { size?: number; disabled?: boolean; onBagUpdated?: (bag: PlayerBagData) => void; bagTargetRef?: React.RefObject<View | null> };
export default function QuestBookButton({ size = 38, disabled = false, onBagUpdated, bagTargetRef }: Props) {
  const { width, height } = useWindowDimensions();
  const [unlocked, setUnlocked] = useState(false), [visible, setVisible] = useState(false), [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<QuestTab>("open"), [entries, setEntries] = useState<QuestBookEntry[]>([]), [floatingMessage, setFloatingMessage] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ lines: StoryDialogLine[]; index: number; reward: NonNullable<QuestBookEntry["reward"]> } | null>(null);
  const [flightVisible, setFlightVisible] = useState(false);
  const claimBusy = useRef(false);
  const gardenStorageTargetRef = useRef<View>(null);
  const [flightReward, setFlightReward] = useState<NonNullable<QuestBookEntry["reward"]>>("potion");
  const rewardX = useRef(new Animated.Value(0)).current, rewardY = useRef(new Animated.Value(0)).current, rewardScale = useRef(new Animated.Value(1)).current, rewardOpacity = useRef(new Animated.Value(0)).current;
  async function refresh() { setEntries(await loadQuestBookEntries()); }
  useEffect(() => { let active = true; void Promise.all([loadQuestBookUnlocked(), loadQuestBookEntries(), repairLegacyCleanQuestReward()]).then(([value, initialEntries, repairedBag]) => { if (active) { setUnlocked(value); setEntries(initialEntries); if (repairedBag) onBagUpdated?.(repairedBag); } }); const a = subscribeQuestBookUnlocked((value) => { if (active) setUnlocked(value); }); const b = subscribeTavernQuests(() => { if (active) void refresh(); }); const c = subscribeGuestRoomState(() => { if (active) void refresh(); }); return () => { active = false; a(); b(); c(); }; }, [onBagUpdated]);
  const hasReadyQuest = entries.some((entry) => entry.tab === "open" && entry.ready);
  const visibleEntries = useMemo(() => entries.filter((entry) => entry.tab === tab), [entries, tab]);
  async function openQuestBook() {
    if (disabled) return;
    const tavern = await loadTavernQuestState();
    if (tavern.claimed.serve_water && !tavern.aleIngredientsDialogueSeen) {
      setDialog({ lines: rewardDialog("serve_water"), index: 0, reward: "ale_upgrade" });
      return;
    }
    setVisible(true); setLoading(true); setTab("open");
    try { await refresh(); } finally { setLoading(false); }
  }
  function showFloating(text: string) { setFloatingMessage(text); setTimeout(() => setFloatingMessage(null), UI_NOTIFICATION_DURATION_MS); }
  async function claim(entry: QuestBookEntry) {
    if (!entry.tavernQuestId || !entry.ready || !entry.reward || claimBusy.current) return;
    claimBusy.current = true;
    try {
    const result = await claimTavernQuest(entry.tavernQuestId);
    if (!result.ok) { showFloating(result.reason === "bag_full" ? "Make some some free space in your bag." : "This quest is not ready yet."); return; }
    if (result.playerBag) onBagUpdated?.(result.playerBag);
    setVisible(false); setFlightReward(entry.reward); setDialog({ lines: rewardDialog(entry.tavernQuestId), index: 0, reward: entry.reward }); await refresh();
    } catch { showFloating("Could not claim this reward. Please try again."); }
    finally { claimBusy.current = false; }
  }
  function flyReward(reward: NonNullable<QuestBookEntry["reward"]>) {
    setFlightVisible(true);
    requestAnimationFrame(() => {
      const begin = (target: { x: number; y: number }) => {
        rewardX.setValue(width * .72); rewardY.setValue(height * .48); rewardScale.setValue(1); rewardOpacity.setValue(1);
        Animated.parallel([Animated.timing(rewardX, { toValue: target.x, duration: 720, useNativeDriver: true }), Animated.timing(rewardY, { toValue: target.y, duration: 720, useNativeDriver: true }), Animated.timing(rewardScale, { toValue: .42, duration: 720, useNativeDriver: true })]).start(() => Animated.timing(rewardOpacity, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => setFlightVisible(false)));
      };
      const fallback = reward === "copper" ? { x: width - 62, y: 62 } : reward === "carrot_seed" || reward === "fertilizer" ? { x: width * .26, y: height - 74 } : { x: width - 58, y: 165 };
      const targetRef = reward === "potion" ? bagTargetRef?.current : reward === "carrot_seed" || reward === "fertilizer" ? gardenStorageTargetRef.current : null;
      if (!targetRef) {
        begin(fallback);
        return;
      }
      targetRef.measureInWindow((x, y, w, h) => {
        begin(w > 0 && h > 0 ? { x: x + w / 2, y: y + h / 2 } : fallback);
      });
    });
  }
  async function advanceDialog(skip = false) { if (!dialog) return; if (!skip && dialog.index < dialog.lines.length - 1) { setDialog({ ...dialog, index: dialog.index + 1 }); return; } if (dialog.reward === "ale_upgrade") await markAleIngredientsDialogueSeen(); else if (dialog.reward === "guest_rooms") await unlockGuestRoomOffer(); else flyReward(dialog.reward); setDialog(null); }
  return <>
    <View style={{ width: Math.round(size * 1.33), height: size }}>{unlocked ? <TouchableOpacity style={[styles.button, disabled && styles.disabled]} onPress={() => void openQuestBook()} disabled={disabled} accessibilityLabel="Open questbook"><Image source={require("../../assets/images/questbook.png")} style={styles.icon} resizeMode="contain" />{hasReadyQuest ? <View style={styles.readyBadge}><Text style={styles.readyBadgeText}>✓</Text></View> : null}</TouchableOpacity> : null}</View>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}><View style={styles.overlay}><View style={styles.panel}>
      <View style={styles.titleRow}><Image source={require("../../assets/images/questbook.png")} style={styles.titleIcon} resizeMode="contain" /><View pointerEvents="none" style={styles.titleCenter}><Text style={styles.title}>Questbook</Text></View><TouchableOpacity style={styles.closeButton} onPress={() => setVisible(false)}><Text style={styles.closeText}>×</Text></TouchableOpacity></View>
      <View style={styles.tabs}>{(["open", "complete"] as QuestTab[]).map((value) => <TouchableOpacity key={value} style={[styles.tab, tab === value && styles.tabActive]} onPress={() => setTab(value)}><Text style={[styles.tabText, tab === value && styles.tabTextActive]}>{value === "open" ? "Open" : "Complete"}</Text></TouchableOpacity>)}</View>
      <ScrollView contentContainerStyle={styles.list}>{loading ? <Text style={styles.empty}>Loading quests…</Text> : null}{!loading && visibleEntries.length === 0 ? <Text style={styles.empty}>{tab === "open" ? "You have no open quests." : "No quests completed yet."}</Text> : null}
        {!loading && visibleEntries.map((entry) => <View key={entry.id} style={[styles.questCard, entry.ready && entry.tab === "open" && styles.questReady]}><View style={styles.questHeader}><Text style={styles.source}>{entry.source}</Text><Text style={[styles.status, entry.ready && styles.ready]}>{entry.tab === "complete" ? "Complete" : entry.ready ? "Ready" : "Open"}</Text></View><Text style={styles.questTitle}>{entry.title}</Text><QuestDetail entry={entry} />{entry.progress ? <Text style={styles.progress}>Progress: {entry.progress}</Text> : null}{entry.reward === "fertilizer" ? <Text style={styles.rewardText}>Reward: 5 Standard Fertilizer</Text> : entry.reward === "copper" ? <View style={styles.rewardRow}><Text style={styles.rewardText}>Reward: 25</Text><Image source={REWARD_IMAGES.copper} style={styles.coinIcon} /></View> : entry.reward === "ale_upgrade" ? <Text style={styles.rewardText}>Reward: New Upgrade</Text> : entry.reward === "guest_rooms" ? <Text style={styles.rewardText}>Reward: Build Guest Rooms</Text> : null}{entry.tab === "open" && entry.tavernQuestId ? <TouchableOpacity style={[styles.doneButton, !entry.ready && styles.doneDisabled]} disabled={!entry.ready} onPress={() => void claim(entry)}><Text style={styles.doneText}>Done</Text></TouchableOpacity> : null}</View>)}
      </ScrollView></View></View>{floatingMessage ? <View pointerEvents="none" style={styles.floating}><Text style={styles.floatingText}>{floatingMessage}</Text></View> : null}</Modal>
    <Modal visible={!!dialog || flightVisible} transparent animationType="none" statusBarTranslucent onRequestClose={() => {}}>
      <View style={styles.dialogLayer} pointerEvents="box-none">
        <StoryDialogOverlay visible={!!dialog} line={dialog?.lines[dialog.index] ?? null} onContinue={() => { void advanceDialog(false); }} onSkip={() => { void advanceDialog(true); }} />
        {flightVisible && (flightReward === "carrot_seed" || flightReward === "fertilizer") && <View pointerEvents="none" style={{ position: "absolute", bottom: 45, left: width * .26 - 55, alignItems: "center" }}><View ref={gardenStorageTargetRef} collapsable={false}><Image source={REWARD_IMAGES[flightReward]} style={{ width: 44, height: 44 }} /></View><Text style={styles.rewardText}>Garden Storage</Text></View>}
        <Animated.View pointerEvents="none" style={[styles.flyingReward, { opacity: rewardOpacity, transform: [{ translateX: rewardX }, { translateY: rewardY }, { scale: rewardScale }] }]}><Image source={REWARD_IMAGES[flightReward]} style={styles.flyingRewardImage} resizeMode="contain" />{flightReward === "fertilizer" && <Text style={{ color: "white", fontWeight: "700", position: "absolute", right: 0, bottom: 0 }}>×5</Text>}</Animated.View>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  button: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }, disabled: { opacity: .35 }, icon: { width: "100%", height: "100%" }, readyBadge: { position: "absolute", right: -2, top: -3, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#2F9E44", borderWidth: 1.5, borderColor: "white" }, readyBadgeText: { color: "white", fontWeight: "900", fontSize: 12 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,.78)", alignItems: "center", justifyContent: "center", padding: 22 }, panel: { width: "100%", maxWidth: 440, maxHeight: "82%", backgroundColor: "#160B03", borderRadius: 20, borderWidth: 1.5, borderColor: "rgba(196,148,58,.65)", overflow: "hidden" }, titleRow: { minHeight: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: "rgba(196,148,58,.28)" }, titleIcon: { width: 45, height: 38 }, titleCenter: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", paddingHorizontal: 64 }, title: { color: "#FFF1D2", fontFamily: "Oldenburg", fontSize: 20, textAlign: "center" }, closeButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center" }, closeText: { color: "#E4C882", fontSize: 30 },
  tabs: { flexDirection: "row", padding: 10, gap: 8 }, tab: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: "rgba(196,148,58,.35)", backgroundColor: "rgba(48,27,7,.45)" }, tabActive: { backgroundColor: "rgba(112,73,18,.88)", borderColor: "#C4943A" }, tabText: { color: "rgba(240,232,213,.62)", fontFamily: "Oldenburg", fontSize: 12 }, tabTextActive: { color: "#FFF1D2" }, list: { padding: 14, paddingTop: 3, gap: 11 }, empty: { color: "rgba(240,232,213,.72)", fontFamily: "Oldenburg", fontSize: 13, textAlign: "center", paddingVertical: 30 },
  questCard: { gap: 6, padding: 13, borderRadius: 13, backgroundColor: "rgba(48,27,7,.82)", borderWidth: 1, borderColor: "rgba(196,148,58,.32)" }, questReady: { borderColor: "#4CAF62" }, questHeader: { flexDirection: "row", justifyContent: "space-between", gap: 8 }, source: { color: "#C4943A", fontFamily: "Oldenburg", fontSize: 10, textTransform: "uppercase", flexShrink: 1 }, status: { color: "rgba(240,232,213,.68)", fontFamily: "Oldenburg", fontSize: 9 }, ready: { color: "#81C784" }, questTitle: { color: "#FFF1D2", fontFamily: "Oldenburg", fontSize: 14 }, detail: { color: "rgba(240,232,213,.78)", fontSize: 12, lineHeight: 18 }, progress: { color: "#E4C882", fontFamily: "Oldenburg", fontSize: 11 }, rewardRow: { flexDirection: "row", alignItems: "center", gap: 5 }, rewardText: { color: "#E4C882", fontFamily: "Oldenburg", fontSize: 11 }, coinIcon: { width: 17, height: 17 }, doneButton: { alignSelf: "center", minWidth: 124, minHeight: 42, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 5, backgroundColor: "#79521D", borderWidth: 1, borderColor: "#C4943A" }, doneDisabled: { opacity: .32 }, doneText: { color: "#FFF", fontFamily: "Oldenburg", fontSize: 12 },
  detailEmphasis: { color: "#FFF1D2", fontWeight: "900" },
  floating: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", padding: 26 }, floatingText: { color: "#FFF1D2", textAlign: "center", paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, backgroundColor: "rgba(30,12,2,.96)", borderWidth: 1, borderColor: "#C4943A", fontFamily: "Oldenburg", fontSize: 12 }, dialogLayer: { flex: 1 }, flyingReward: { position: "absolute", left: -24, top: -24, width: 48, height: 48, zIndex: 2200 }, flyingRewardImage: { width: "100%", height: "100%" },
});
