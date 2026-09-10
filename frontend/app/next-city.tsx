import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View, type ImageSourcePropType } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useAudioManager } from "@/src/audio/AudioProvider";
import type { ThemeKey } from "@/src/audio/audioEngine";
import CurrencyHud from "@/src/components/CurrencyHud";
import CurrencyPrice from "@/src/components/currency-price";
import SceneBackground from "@/src/components/SceneBackground";
import StoryDialogOverlay, { type StoryDialogChoice, type StoryDialogLine } from "@/src/components/story-dialog-overlay";
import { COACHMAN_DIALOG_SCALE, DIALOG_CHARACTER_ASSETS, getDialogExpressionForStamina, getPlayerDialogCharacter, getPlayerDialogScale } from "@/src/assets/dialog-character-assets";
import {
  BLACKSMITH_SMELTING_RECIPES, BLACKSMITH_TOOL_UPGRADE_RECIPES, CITY_BUY_PRICES, GUILD_PROCESSING_FEE_PER_CARCASS, QUESTS, SUPPORTERS, acceptHealingPotionContract, acceptQuest, buyBulkShipment,
  buyCityItem, buyTempleBlessing, fulfillHealingPotionContract, guildRank, hireSupporter,
  markMerchantGuildIntroductionSeen,
  citySellPrice, loadCityState, merchantBulkQuantity, merchantPrice, performBlacksmithRecipe, processGuildCarcasses, processTutorialWildWolf, receiveTempleTreatment, repairCityItem,
  sellCityItem, tanMaterial, turnInQuest, type CityState, type QuestId, type SupporterId,
  type BlacksmithRecipe, type TempleBlessingId,
} from "@/src/game/city-system";
import { getButcheringDefinition } from "@/src/game/butchering-system";
import { DEFAULT_BAG, ITEM_CATALOG, PLAYER_BAG_KEY, normalizePlayerBagData, type PlayerBagData } from "@/src/game/item-system";
import { loadProgressionState } from "@/src/game/progression";
import { storePlayerBagMaterialsForTavernReturn } from "@/src/game/tavern-return-storage";
import { loadCoachmanEscortState, markGuildIntroductionSeen, markWalkingArrivalGuardSeen, setCoachmanEscortPhase, type CoachmanEscortPhase } from "@/src/game/coachman-escort-system";
import { PLAYER_AVATAR_KEY, normalizePlayerAvatarId } from "@/src/game/player-avatar";
import { unlockForestEntranceAfterRegistration } from "@/src/game/travel-system";
import { loadTavernQuestState, markBrewQuestItemPurchased, type BrewQuestItemId, type TavernQuestState, DEFAULT_TAVERN_QUEST_STATE } from "@/src/game/tavern-quest-system";
import { DEFAULT_MINSTREL_STATE, MINSTREL_SONGS, loadMinstrelState, markMinstrelIntroductionSeen, unlockMinstrelSong, type MinstrelSongId, type MinstrelState } from "@/src/game/minstrel-system";

const MARKET_BACKGROUND = require("../assets/images/market.png");
const ARTISAN_BACKGROUND = require("../assets/images/artisans_district.png");
const ADVENTURERS_GUILD_BACKGROUND = require("../assets/images/adventurers_guild.png");
const MERCHANT_GUILD_BACKGROUND = require("../assets/images/merchant_guild.png");
const TEMPLE_BACKGROUND = require("../assets/images/temple.png");
const HOLY_SISTER = require("../assets/images/dialog/dialogue_holy_sister.png");
const RECEPTIONIST = require("../assets/images/dialog/dialogue_receptionist.png");
const MERCHANT_GUILD_RECEPTIONIST_DIALOG = require("../assets/images/dialog/dialogue_receptionist_merchant.png");
const MERCHANT_GUILD_RECEPTIONIST_PORTRAIT = require("../assets/images/receptionist_merchant.png");
const SUPPORTER_IMAGES: Record<SupporterId, ImageSourcePropType> = {
  normal: require("../assets/images/porter_normal.png"), healer: require("../assets/images/porter_healer.png"),
  cleric: require("../assets/images/porter_cleric.png"), botanist: require("../assets/images/porter_botanist.png"),
};
const ITEM_IMAGES: Record<string, ImageSourcePropType> = {
  potato: require("../assets/images/potato.png"), carrot: require("../assets/images/carrot.png"), onion: require("../assets/images/onion.png"),
  tomato: require("../assets/images/tomato.png"), egg: require("../assets/images/egg.png"), white_meat: require("../assets/images/meat_white.png"),
  red_meat: require("../assets/images/meat_red.png"), herbs: require("../assets/images/herbs.png"), mushroom: require("../assets/images/mushroom.png"),
  fish: require("../assets/images/meat_fish.png"), cloth: require("../assets/images/cloth.png"), empty_bottle: require("../assets/images/empty_bottle.png"), leather: require("../assets/images/leather.png"),
  fur: require("../assets/images/fur.png"), wolf_pelt: require("../assets/images/wolf_pelt.png"),
  rope: require("../assets/images/rope.png"), torch: require("../assets/images/torch_normal.png"), bag3: require("../assets/images/bag3.png"),
  frying_pan: require("../assets/images/frying_pan.png"), tool_rusty_butchering_knife: require("../assets/images/tool_rusty_butchering_knife.png"),
  tool_iron_butchering_knife: require("../assets/images/tool_iron_butchering_knife.png"), tool_steel_butchering_knife: require("../assets/images/tool_steel_butchering_knife.png"),
  weapon_iron_dagger: require("../assets/images/weapon_iron_dagger.png"), weapon_iron_shortsword: require("../assets/images/weapon_iron_shortsword.png"),
  armor_leather_bracers: require("../assets/images/armor_leather_bracers.png"), armor_leather_armor: require("../assets/images/armor_leather_armor.png"),
  oldpot: require("../assets/images/oldpot.png"), cooking_pot: require("../assets/images/cooking_pot.png"), fine_cooking_pot: require("../assets/images/fine_cooking_pot.png"),
  tool_kitchen_knife: require("../assets/images/cooking_knife.png"),
  ingot_iron: require("../assets/images/ingot_iron.png"), ingot_copper: require("../assets/images/ingot_copper.png"),
  ingot_silver: require("../assets/images/ingot_silver.png"), ingot_gold: require("../assets/images/ingot_gold.png"),
  ore_iron: require("../assets/images/ore_iron.png"), ore_copper: require("../assets/images/ore_copper.png"),
  ore_silver: require("../assets/images/ore_silver.png"), ore_gold: require("../assets/images/ore_gold.png"),
  snowberry: require("../assets/images/snowberry.png"), shard_mana: require("../assets/images/shard_mana.png"),
  monster_carcass: require("../assets/images/monster_carcass.png"),
  dried_hop_cones: require("../assets/images/quest_item.png"), malted_barley: require("../assets/images/quest_item.png"), brewers_yeast: require("../assets/images/quest_item.png"),
};

type ViewId = "city" | "market" | "food" | "general" | "sell" | "fish" | "notice_board" | "minstrels" | "artisan" | "blacksmith" | "blacksmith_buy" | "smelting" | "tool_upgrades" | "repair" | "tannery" | "carpenter" | "guild" | "support" | "processing" | "quests" | "merchant" | "bulk" | "imports" | "contracts" | "temple" | "healing" | "blessings" | "holy_goods" | "alchemy_recipes" | "holy_sister" | "side_alley";
const PARENT: Partial<Record<ViewId, ViewId>> = { market: "city", food: "market", general: "market", sell: "general", fish: "market", notice_board: "market", minstrels: "market", artisan: "city", blacksmith: "artisan", blacksmith_buy: "blacksmith", smelting: "blacksmith", tool_upgrades: "blacksmith", repair: "blacksmith", tannery: "artisan", carpenter: "artisan", guild: "city", support: "guild", processing: "guild", quests: "guild", merchant: "city", bulk: "merchant", imports: "merchant", contracts: "merchant", temple: "city", healing: "temple", blessings: "temple", holy_goods: "temple", alchemy_recipes: "temple", holy_sister: "temple", side_alley: "city" };
const GENERAL = [{ id: "rope", price: 12 }, { id: "cloth", price: 22 }, { id: "empty_bottle", price: 12 }, { id: "torch", price: 30 }, { id: "bag3", price: 1000 }];
const BLACKSMITH = [{ id: "tool_rusty_butchering_knife", price: 50 }, { id: "tool_iron_butchering_knife", price: 70 }, { id: "tool_kitchen_knife", price: 80 }, { id: "weapon_iron_dagger", price: 45 }, { id: "weapon_iron_shortsword", price: 60 }, { id: "armor_leather_bracers", price: 50 }, { id: "armor_leather_armor", price: 90 }, { id: "frying_pan", price: 100 }];
const BULK_SHIPMENTS = [{ id: "potato" as const, price: 80 }, { id: "carrot" as const, price: 60 }, { id: "onion" as const, price: 100 }];
const IMPORTS = [{ id: "snowberry", price: 35, reputation: 0 }, { id: "spices", price: 45, reputation: 10 }, { id: "wine", price: 60, reputation: 20 }, { id: "alchemical_ingredients", price: 70, reputation: 30 }, { id: "shard_mana", price: 100, reputation: 40 }];
const HOLY_GOODS = [{ id: "holy_herb", price: 25 }, { id: "medicinal_herb", price: 22 }, { id: "blessed_water", price: 30 }, { id: "incense", price: 20 }, { id: "purified_salt", price: 18 }];
const CARPENTER_SERVICES = [
  { title: "Build Guest Room", description: "Adds a rentable guest room to the tavern." },
  { title: "Upgrade Guest Room", description: "Improves comfort, rent and possible guest quality. Requires an existing guest room." },
  { title: "Build Stable", description: "Unlocks animals." },
  { title: "Expand Stable", description: "Increases stable spaces and capacity." },
  { title: "Build Workshop", description: "Unlocks personal crafting and alchemy outside the tavern." },
  { title: "Other Repairs", description: "Repairs damage caused by future events." },
  { title: "Craft Furniture", description: "Improves Tavern Comfort or Decoration during future events." },
] as const;

function ItemIcon({ id, size = 46 }: { id: string; size?: number }) {
  return ITEM_IMAGES[id] ? <Image source={ITEM_IMAGES[id]} style={{ width: size, height: size }} resizeMode="contain" /> : <Ionicons name={id.includes("armor") ? "shield-outline" : id.includes("weapon") || id.includes("knife") ? "hammer-outline" : id === "bag3" ? "bag-handle-outline" : "cube-outline"} size={Math.round(size * 0.65)} color="#D6A33B" />;
}

function guildProcessingEstimate(monsterId: string): string {
  const definition = getButcheringDefinition(monsterId);
  if (!definition) return "No processing estimate available.";
  const quantityText = (itemId: string, minimum: number, maximum: number) => {
    const quantity = minimum === maximum ? String(minimum) : `${minimum}–${maximum}`;
    return `${quantity} ${ITEM_CATALOG[itemId]?.name ?? itemId}`;
  };
  const guaranteed = [definition.primary, ...definition.secondary]
    .map((material) => quantityText(material.id, material.ranges[2][0], material.ranges[2][1]));
  const rare = definition.rare.map((material) => `${material.chances[2]}% ${ITEM_CATALOG[material.id]?.name ?? material.id}`);
  return [...guaranteed, ...rare].join(", ");
}

type CarriedCarcass = {
  key: string;
  bagSlotIndex: number;
  monsterId: string;
  name: string;
  unitNumber: number;
  stackQuantity: number;
};

function guildIntroductionLines(
  playerName: string,
  playerPortrait: ImageSourcePropType,
  playerScale: number,
): StoryDialogLine[] {
  const receptionist = (text: string): StoryDialogLine => ({ speaker: "Receptionist", portrait: RECEPTIONIST, characterScale: 0.91, text });
  const player = (text: string): StoryDialogLine => ({ speaker: playerName, portrait: playerPortrait, playerPortrait: true, characterScale: playerScale, text });
  return [
    receptionist("Welcome to the Adventurer’s Guild. I don’t believe I’ve seen you here before."),
    player("No, this is my first time."),
    receptionist("Then welcome. What can I help you with?"),
    player("I was told to bring this here. I ran into a Wild Wolf just outside the city walls and managed to kill it."),
    receptionist("A Wild Wolf? Outside the walls?"),
    player("Yes. It attacked me on the road. I was told that I should bring the carcass here."),
    receptionist("You did the right thing. Thank you very much for bringing it to us."),
    receptionist("We’ve received several reports lately of forest monsters appearing outside their usual territory. Creatures that normally remain deep within the forest have been sighted closer and closer to the city."),
    player("Is that normal?"),
    receptionist("No. And that is precisely why we’re investigating it."),
    receptionist("Given the current situation, the guild is accepting monster carcasses from adventurers and travelers. We’ll process this one for you free of charge."),
    player("You process them here?"),
    receptionist("We do. Our butchers will examine the carcass and salvage anything useful from it. Meat, hide, fangs, or other valuable materials."),
    receptionist("Whatever can be recovered will be packed and sent to you tomorrow."),
    player("That’s convenient. Thank you."),
    receptionist("Of course."),
    receptionist("Still... defeating a Wild Wolf on your own is no small feat, especially if you aren’t even registered with the guild."),
    player("Registered?"),
    receptionist("You clearly have some talent. If you’re interested, you may register as an adventurer here."),
    receptionist("Once registered, you’ll be allowed to accept quests from the guild and gain official access to the Forest Dungeon."),
    player("The Forest Dungeon?"),
    receptionist("Yes. It lies deeper within the forest. Entry is restricted for ordinary travelers, but registered adventurers are permitted to enter."),
    receptionist("Considering what you’ve already accomplished, I believe you’d be a good fit."),
    player("Alright. I’d like to register."),
    receptionist("Excellent."),
    receptionist("Then welcome to the Adventurer’s Guild, adventurer."),
  ];
}

type MerchantGuildDialogBranch = "intro" | "yes" | "no";

function merchantGuildIntroductionLines(
  branch: MerchantGuildDialogBranch,
  playerName: string,
  playerPortrait: ImageSourcePropType,
  playerScale: number,
): StoryDialogLine[] {
  const receptionist = (text: string, highlightedPhrases?: readonly string[]): StoryDialogLine => ({
    speaker: "Merchant Guild Receptionist",
    portrait: MERCHANT_GUILD_RECEPTIONIST_DIALOG,
    characterScale: 0.8,
    text,
    highlightedPhrases,
  });
  const player = (text: string): StoryDialogLine => ({ speaker: playerName, portrait: playerPortrait, playerPortrait: true, characterScale: playerScale, text });
  if (branch === "yes") return [
    player("Yes, please."),
    receptionist("Of course. I’ll keep it brief."),
    receptionist("First, we handle Bulk Orders.", ["Bulk Orders"]),
    receptionist("Merchants, inns, workshops, and other clients regularly place large orders with the guild. If you have the required goods, you can fulfill those orders and receive payment in return."),
    receptionist("Then there are Imported Goods.", ["Imported Goods"]),
    receptionist("The guild brings in items and materials from other regions that can be difficult, or sometimes impossible, to find locally."),
    receptionist("Not everything is available to everyone, though."),
    player("What do you mean?"),
    receptionist("The more guild orders you complete, the more your reputation with us will increase.", ["reputation"]),
    receptionist("As your reputation rises, so does your guild rank.", ["reputation"]),
    receptionist("Each new rank comes with additional benefits. That may include better prices, discounts on certain goods, or access to rarer merchandise."),
    receptionist("Some of our most valuable imports are reserved for merchants and suppliers who have proven themselves reliable."),
    player("So the more work I do for the guild, the more options I get."),
    receptionist("Exactly."),
    receptionist("Fulfill orders, build your reputation, and the guild will make sure your efforts are rewarded.", ["reputation"]),
    receptionist("Whenever you’re ready, you can check the available Bulk Orders or take a look at our Imported Goods.", ["Bulk Orders", "Imported Goods"]),
  ];
  if (branch === "no") return [
    player("No, thank you. I think I’ll figure it out."),
    receptionist("Feel free to browse the available orders or take a look at our imported goods."),
  ];
  return [
    receptionist("Welcome to the Merchants’ Guild. How can I help you today?"),
    receptionist("...Ah. Wait a moment. I’ve already heard about you."),
    player("About me?"),
    receptionist("You’re the one who took down that Wild Wolf outside the city walls, aren’t you?"),
    player("News travels this fast?"),
    receptionist("Usually? No. But in this case, the receptionist over at the Adventurer’s Guild happens to be my sister."),
    player("Ah. That explains it."),
    receptionist("She mentioned you stopped by earlier. Apparently, you made quite the first impression."),
    receptionist("Since this is your first visit here, would you like a quick explanation of what the Merchants’ Guild can offer?"),
  ];
}

export default function NextCityScreen() {
  const router = useRouter(); const insets = useSafeAreaInsets(); const audio = useAudioManager(); const params = useLocalSearchParams<{ returnTo?: string; arrival?: string }>();
  const [view, setView] = useState<ViewId>("city"); const [message, setMessage] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [floatingMessage, setFloatingMessage] = useState<string | null>(null);
  const floatingMessageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shopActionQueue = useRef<Promise<void>>(Promise.resolve());
  const [city, setCity] = useState<CityState | null>(null); const [bag, setBag] = useState<PlayerBagData>(DEFAULT_BAG); const [runs, setRuns] = useState(1);
  const [karmaPoints, setKarmaPoints] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [escortPhase, setEscortPhase] = useState<CoachmanEscortPhase>("city_arrival");
  const [arrivalDialogIndex, setArrivalDialogIndex] = useState<number | null>(null);
  const [guildDialogIndex, setGuildDialogIndex] = useState<number | null>(null);
  const [merchantGuildDialog, setMerchantGuildDialog] = useState<{ branch: MerchantGuildDialogBranch; index: number } | null>(null);
  const [cityGuardDialogIndex, setCityGuardDialogIndex] = useState<number | null>(null);
  const [guildIntroductionSeen, setGuildIntroductionSeen] = useState(false);
  const [playerName, setPlayerName] = useState("Adventurer");
  const [playerDialogPortrait, setPlayerDialogPortrait] = useState<ImageSourcePropType>(DIALOG_CHARACTER_ASSETS.avatar1.normal);
  const [playerDialogScale, setPlayerDialogScale] = useState(getPlayerDialogScale(1));
  const [thought, setThought] = useState<string | null>(null);
  const [selectedCarcassKeys, setSelectedCarcassKeys] = useState<string[]>([]);
  const [tavernQuests, setTavernQuests] = useState<TavernQuestState>(DEFAULT_TAVERN_QUEST_STATE);
  const [minstrelState, setMinstrelState] = useState<MinstrelState>(DEFAULT_MINSTREL_STATE);
  const [minstrelDialogIndex, setMinstrelDialogIndex] = useState<number | null>(null);
  const [activeMinstrelSong, setActiveMinstrelSong] = useState<MinstrelSongId | null>(null);
  const [minstrelPlayback, setMinstrelPlayback] = useState<"playing" | "paused" | "stopped">("stopped");
  const previousCityTheme = useRef<ThemeKey>(null);
  const minstrelPurchasePending = useRef(false);
  const stopMinstrelTrack = audio.stopMinstrelTrack;
  useEffect(() => () => { if (floatingMessageTimer.current) clearTimeout(floatingMessageTimer.current); }, []);
  useEffect(() => () => { stopMinstrelTrack(); }, [stopMinstrelTrack]);
  function showFloatingMessage(text: string) {
    setFloatingMessage(text);
    if (floatingMessageTimer.current) clearTimeout(floatingMessageTimer.current);
    floatingMessageTimer.current = setTimeout(() => setFloatingMessage(null), 1000);
  }
  const refresh = useCallback(async () => {
    const [state, rawBag, progression, escort, playerData, loadedTavernQuests, loadedMinstrels] = await Promise.all([
      loadCityState(),
      AsyncStorage.getItem(PLAYER_BAG_KEY),
      loadProgressionState(),
      loadCoachmanEscortState(),
      AsyncStorage.multiGet(["@game:player_name", PLAYER_AVATAR_KEY, "@game:stamina"]),
      loadTavernQuestState(),
      loadMinstrelState(),
    ]);
    const avatarId = normalizePlayerAvatarId(playerData[1][1]);
    const stamina = Math.max(0, Number.parseInt(playerData[2][1] ?? "60", 10) || 0);
    setCity(state);
    setBag(rawBag ? normalizePlayerBagData(JSON.parse(rawBag)) : { ...DEFAULT_BAG, slots: [...DEFAULT_BAG.slots] });
    setKarmaPoints(progression.karmaPoints);
    setEscortPhase(escort.phase);
    setGuildIntroductionSeen(escort.guildIntroductionSeen);
    setPlayerName(playerData[0][1]?.trim() || "Adventurer");
    setPlayerDialogPortrait(getPlayerDialogCharacter(avatarId, getDialogExpressionForStamina(stamina), DIALOG_CHARACTER_ASSETS.avatar1.normal));
    setPlayerDialogScale(getPlayerDialogScale(avatarId));
    setTavernQuests(loadedTavernQuests);
    setMinstrelState(loadedMinstrels);
    if (escort.phase === "city_arrival") setArrivalDialogIndex((current) => current ?? 0);
    if (params.arrival === "walk" && !escort.walkingArrivalGuardSeen) setCityGuardDialogIndex((current) => current ?? 0);
  }, [params.arrival, setArrivalDialogIndex, setCityGuardDialogIndex]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  function open(next: ViewId) {
    if (next === "merchant" && !guildIntroductionSeen) return;
    if (next === "minstrels") {
      previousCityTheme.current = audio.currentThemeKey;
      audio.stopGameplayMusic(0);
      if (!minstrelState.introduced) setMinstrelDialogIndex(0);
    } else if (view === "minstrels") {
      audio.stopMinstrelTrack();
      setActiveMinstrelSong(null);
      setMinstrelPlayback("stopped");
      if (previousCityTheme.current) audio.crossfadeTo(previousCityTheme.current, 650);
      previousCityTheme.current = null;
    }
    setMessage(null);
    setThought(null);
    setView(next);
    if (next === "processing") setSelectedCarcassKeys([]);
    if (next === "guild" && escortPhase === "city_exploration" && !guildIntroductionSeen) {
      setGuildDialogIndex(0);
    }
    if (next === "merchant" && !city?.merchantGuildIntroductionSeen) {
      setMerchantGuildDialog({ branch: "intro", index: 0 });
    }
    audio.playSoundEffect("footstep", { maxDurationMs: 1200 });
  }
  async function back() {
    const parent = PARENT[view];
    if (parent) { open(parent); return; }
    if (escortPhase === "city_arrival" || escortPhase === "city_exploration") {
      setThought("I should turn in the monster carcass at the Adventurers' Guild.");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      await storePlayerBagMaterialsForTavernReturn();
      audio.playSoundEffect("footstep", { maxDurationMs: 2000 });
      router.replace({ pathname: "/outside-tavern", params: { returnTo: params.returnTo ?? "kitchen" } });
    } catch {
      setMessage("The materials could not be stored. Please try again.");
      setBusy(false);
    }
  }
  function action(task: () => Promise<{ ok: boolean; message: string }>) {
    shopActionQueue.current = shopActionQueue.current.then(async () => {
      const result = await task();
      showFloatingMessage(result.message);
      if (result.ok) audio.playSoundEffect("moveitem", { maxDurationMs: 1600 });
      await refresh();
    }).catch(() => showFloatingMessage("The action could not be completed."));
    return shopActionQueue.current;
  }
  const repairable = useMemo(() => bag.slots.map((item, slot) => ({ item, slot })).filter(({ item }) => item?.maxDurability && item.durability !== item.maxDurability), [bag]);
  const carriedCarcasses = useMemo(() => bag.slots.flatMap((item, bagSlotIndex): CarriedCarcass[] => {
    if (item?.id !== "monster_carcass" || !item.monsterId || !getButcheringDefinition(item.monsterId)) return [];
    return Array.from({ length: item.quantity }, (_, unitIndex) => ({
      key: `${bagSlotIndex}-${unitIndex}`,
      bagSlotIndex,
      monsterId: item.monsterId!,
      name: getButcheringDefinition(item.monsterId!)!.carcassName,
      unitNumber: unitIndex + 1,
      stackQuantity: item.quantity,
    }));
  }), [bag]);
  const selectedCarcassSet = useMemo(() => new Set(selectedCarcassKeys), [selectedCarcassKeys]);
  const selectedCarcasses = useMemo(
    () => carriedCarcasses.filter((carcass) => selectedCarcassSet.has(carcass.key)),
    [carriedCarcasses, selectedCarcassSet],
  );
  const processingTotal = selectedCarcasses.length * GUILD_PROCESSING_FEE_PER_CARCASS;
  function toggleCarcass(key: string) {
    setSelectedCarcassKeys((current) => current.includes(key)
      ? current.filter((entry) => entry !== key)
      : [...current, key]);
  }
  async function confirmCarcassProcessing() {
    if (busy || selectedCarcasses.length === 0) return;
    const grouped = new Map<number, { bagSlotIndex: number; monsterId: string; quantity: number }>();
    for (const carcass of selectedCarcasses) {
      const current = grouped.get(carcass.bagSlotIndex);
      grouped.set(carcass.bagSlotIndex, {
        bagSlotIndex: carcass.bagSlotIndex,
        monsterId: carcass.monsterId,
        quantity: (current?.quantity ?? 0) + 1,
      });
    }
    setBusy(true);
    try {
      const result = await processGuildCarcasses([...grouped.values()]);
      showFloatingMessage(result.message);
      if (result.ok) {
        setSelectedCarcassKeys([]);
        audio.playSoundEffect("moveitem", { maxDurationMs: 1600 });
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  const nav = (title: string, subtitle: React.ReactNode, target?: ViewId, closed = false) => <TouchableOpacity key={title} style={[styles.nav, closed && styles.disabled]} disabled={closed} onPress={() => target && open(target)} activeOpacity={0.8}><View style={styles.navText}><Text style={styles.navTitle}>{title}</Text>{typeof subtitle === "string" ? <Text style={styles.navSubtitle}>{subtitle}</Text> : subtitle}</View><Ionicons name={closed ? "lock-closed" : "chevron-forward"} size={20} color="#C4943A" /></TouchableOpacity>;
  const buyRow = ({ id, price }: { id: string; price: number }) => <View key={id} style={styles.stockRow}><View style={styles.iconBox}><ItemIcon id={id} /></View><View style={styles.stockText}><Text style={styles.stockName}>{ITEM_CATALOG[id]?.name ?? id}</Text><Text style={styles.stockDescription} numberOfLines={3}>{ITEM_CATALOG[id]?.description}</Text></View><TouchableOpacity disabled={busy} style={styles.priceButton} onPress={() => { void action(() => buyCityItem(id, price)); }}><CurrencyPrice totalCopper={price} /></TouchableOpacity></View>;
  const brewQuestBuyRow = (id: BrewQuestItemId, price: number) => buyRowWithAction(id, price, async () => {
    const result = await buyCityItem(id, price);
    if (result.ok) await markBrewQuestItemPurchased(id);
    return result;
  });
  const buyRowWithAction = (id: string, price: number, purchase: () => ReturnType<typeof buyCityItem>) => <View key={id} style={styles.stockRow}><View style={styles.iconBox}><ItemIcon id={id} /></View><View style={styles.stockText}><Text style={styles.stockName}>{ITEM_CATALOG[id]?.name ?? id}</Text><Text style={styles.stockDescription} numberOfLines={3}>{ITEM_CATALOG[id]?.description}</Text></View><TouchableOpacity disabled={busy} style={styles.priceButton} onPress={() => { void action(purchase); }}><CurrencyPrice totalCopper={price} /></TouchableOpacity></View>;
  const countInBag = (itemId: string) => bag.slots.reduce((sum, item) => sum + (item?.id === itemId ? item.quantity : 0), 0);
  const blacksmithRecipeRow = (recipe: BlacksmithRecipe) => {
    const input = recipe.input.map((entry) => `${entry.quantity}× ${ITEM_CATALOG[entry.itemId]?.name ?? entry.itemId}`).join(" + ");
    const owned = recipe.input.map((entry) => `${ITEM_CATALOG[entry.itemId]?.name ?? entry.itemId}: ${countInBag(entry.itemId)}/${entry.quantity}`).join(" · ");
    return <View key={recipe.id} style={styles.smithRecipe}><View style={styles.smithRecipeMain}><View style={styles.iconBox}><ItemIcon id={recipe.outputItemId} /></View><View style={styles.stockText}><Text style={styles.stockName}>{input} → {recipe.outputQuantity}× {ITEM_CATALOG[recipe.outputItemId]?.name ?? recipe.outputItemId}</Text><Text style={styles.stockDescription}>In bag: {owned}</Text></View></View><TouchableOpacity disabled={busy} style={styles.smithActionButton} onPress={() => { void action(() => performBlacksmithRecipe(recipe.id)); }} activeOpacity={0.78}><Text style={styles.wideButtonText}>{recipe.priceCopper > 0 ? "Transform ·" : "Transform"}</Text>{recipe.priceCopper > 0 ? <CurrencyPrice totalCopper={recipe.priceCopper} textStyle={styles.wideButtonText} /> : null}</TouchableOpacity></View>;
  };
  const tanneryRecipeRow = (source: "fur" | "wolf_pelt", leatherQuantity: 1 | 2) => <View key={source} style={styles.tanneryRecipe}>
    <View style={styles.tanneryConversion}>
      <View style={styles.tanneryItem}><View style={styles.tanneryIconBox}><ItemIcon id={source} size={62} /></View><Text style={styles.tanneryLabel}>{ITEM_CATALOG[source]?.name}</Text></View>
      <Ionicons name="arrow-forward" size={28} color="#E4C882" />
      <View style={styles.tanneryItem}><View style={styles.tanneryOutput}><Text style={styles.tanneryQuantity}>{leatherQuantity}×</Text><View style={styles.tanneryIconBox}><ItemIcon id="leather" size={62} /></View></View><Text style={styles.tanneryLabel}>Leather</Text></View>
    </View>
    <TouchableOpacity disabled={busy} style={[styles.smithActionButton, busy && styles.disabled]} onPress={() => { void action(() => tanMaterial(source)); }} activeOpacity={0.78}><Text style={styles.wideButtonText}>Process ·</Text><CurrencyPrice totalCopper={25} textStyle={styles.wideButtonText} /></TouchableOpacity>
  </View>;
  const wallet = <View style={styles.walletCard}><Text style={styles.walletLabel}>Your Money</Text><CurrencyHud inline compact soundOnChange={false} /></View>;
  const arrivalLines: StoryDialogLine[] = [
    { speaker: "Coachman", portrait: DIALOG_CHARACTER_ASSETS.coachman, characterScale: COACHMAN_DIALOG_SCALE, text: "I’ll be on my way now. We’ll see each other at the tavern one of these days." },
    { speaker: "Coachman", portrait: DIALOG_CHARACTER_ASSETS.coachman, characterScale: COACHMAN_DIALOG_SCALE, text: "You might want to have the monster carcass processed at the Adventurers' Guild." },
  ];
  const guildLines = useMemo(
    () => guildIntroductionLines(playerName, playerDialogPortrait, playerDialogScale),
    [playerName, playerDialogPortrait, playerDialogScale],
  );
  const merchantGuildLines = useMemo(
    () => merchantGuildIntroductionLines(merchantGuildDialog?.branch ?? "intro", playerName, playerDialogPortrait, playerDialogScale),
    [merchantGuildDialog?.branch, playerName, playerDialogPortrait, playerDialogScale],
  );
  const cityGuardLines = useMemo<StoryDialogLine[]>(() => [
    { speaker: "City Guard", portrait: DIALOG_CHARACTER_ASSETS.cityGuard, characterScale: 0.8, text: "Stop right there. What are you carrying?" },
    { speaker: playerName, portrait: playerDialogPortrait, playerPortrait: true, characterScale: playerDialogScale, text: "A wild wolf attacked me on the way here. This is its carcass." },
    { speaker: "City Guard", portrait: DIALOG_CHARACTER_ASSETS.cityGuard, characterScale: 0.8, text: "A wild wolf on the paths? Take the carcass to the Adventurers' Guild and report the incident there." },
  ], [playerDialogPortrait, playerDialogScale, playerName]);
  const minstrelIntroductionLines = useMemo<StoryDialogLine[]>(() => [
    { text: "You are walking towards a group with musical instruments." },
    { text: "A man who appears to be the leader of the group looks at you and speaks to you." },
    { text: '“We have wandered across land and river and listened to music from various cultures. For a small fee, we can play something for you. Just don\'t ask us how we manage to produce such sounds with our ordinary medieval instruments.”' },
  ], []);
  function advanceMinstrelIntroduction() {
    if (minstrelDialogIndex === null) return;
    if (minstrelDialogIndex < minstrelIntroductionLines.length - 1) setMinstrelDialogIndex(minstrelDialogIndex + 1);
  }
  async function finishMinstrelIntroduction() {
    const next = await markMinstrelIntroductionSeen();
    setMinstrelState(next);
    setMinstrelDialogIndex(null);
  }
  async function purchaseMinstrelSong(songId: MinstrelSongId) {
    if (busy || minstrelPurchasePending.current) return;
    minstrelPurchasePending.current = true;
    setBusy(true);
    try {
      const result = await unlockMinstrelSong(songId);
      setMinstrelState(result.state);
      showFloatingMessage(result.message);
    } finally {
      minstrelPurchasePending.current = false;
      setBusy(false);
    }
  }
  function playMinstrelSong(songId: MinstrelSongId) {
    const song = MINSTREL_SONGS.find((entry) => entry.id === songId);
    if (!song) return;
    const restart = activeMinstrelSong !== songId || minstrelPlayback !== "paused";
    audio.playMinstrelTrack(song.audioKey, restart);
    setActiveMinstrelSong(songId);
    setMinstrelPlayback("playing");
  }
  function pauseMinstrelSong(songId: MinstrelSongId) {
    if (activeMinstrelSong !== songId || minstrelPlayback !== "playing") return;
    audio.pauseMinstrelTrack();
    setMinstrelPlayback("paused");
  }
  function stopMinstrelSong(songId: MinstrelSongId) {
    if (activeMinstrelSong !== songId) return;
    audio.stopMinstrelTrack();
    setActiveMinstrelSong(null);
    setMinstrelPlayback("stopped");
  }
  async function advanceArrivalDialog() {
    if (arrivalDialogIndex === 0) { setArrivalDialogIndex(1); return; }
    const next = await setCoachmanEscortPhase("city_exploration");
    setEscortPhase(next.phase);
    setArrivalDialogIndex(null);
  }
  async function advanceGuildIntroduction() {
    if (guildDialogIndex === null || busy) return;
    if (guildDialogIndex < guildLines.length - 1) {
      setGuildDialogIndex(guildDialogIndex + 1);
      return;
    }

    setBusy(true);
    try {
      const processing = await processTutorialWildWolf();
      if (!processing.ok) {
        setGuildDialogIndex(null);
        setMessage(processing.message);
        return;
      }

      const [escort] = await Promise.all([
        markGuildIntroductionSeen(),
        unlockForestEntranceAfterRegistration(),
      ]);
      setGuildIntroductionSeen(true);
      setEscortPhase(escort.phase);
      setGuildDialogIndex(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  async function finishMerchantGuildIntroduction() {
    if (busy) return;
    setBusy(true);
    try {
      const nextCity = await markMerchantGuildIntroductionSeen();
      setCity(nextCity);
      setMerchantGuildDialog(null);
    } finally {
      setBusy(false);
    }
  }
  function advanceMerchantGuildIntroduction() {
    if (!merchantGuildDialog || busy || merchantGuildDialog.branch === "intro") return;
    if (merchantGuildDialog.index < merchantGuildLines.length - 1) {
      setMerchantGuildDialog({ ...merchantGuildDialog, index: merchantGuildDialog.index + 1 });
      return;
    }
    void finishMerchantGuildIntroduction();
  }
  const merchantGuildChoices: readonly StoryDialogChoice[] = merchantGuildDialog?.branch === "intro"
    && merchantGuildDialog.index === merchantGuildLines.length - 1
    ? [
      { label: "Yes, please.", onPress: () => setMerchantGuildDialog({ branch: "yes", index: 0 }) },
      { label: "No, thank you.", onPress: () => setMerchantGuildDialog({ branch: "no", index: 0 }) },
    ]
    : [];
  function skipMerchantGuildIntroduction() {
    if (!merchantGuildDialog || busy) return;
    if (merchantGuildDialog.branch === "intro") {
      setMerchantGuildDialog({ branch: "intro", index: merchantGuildLines.length - 1 });
      return;
    }
    if (merchantGuildDialog.index < merchantGuildLines.length - 1) {
      setMerchantGuildDialog({ ...merchantGuildDialog, index: merchantGuildLines.length - 1 });
      return;
    }
    void finishMerchantGuildIntroduction();
  }
  async function advanceCityGuardDialog() {
    if (cityGuardDialogIndex === null || busy) return;
    if (cityGuardDialogIndex < cityGuardLines.length - 1) {
      setCityGuardDialogIndex(cityGuardDialogIndex + 1);
      return;
    }
    setBusy(true);
    try {
      await markWalkingArrivalGuardSeen();
      setCityGuardDialogIndex(null);
    } finally {
      setBusy(false);
    }
  }
  const merchantReputation = city?.merchantReputation ?? 0;
  const adventurersGuildUnlocked = guildIntroductionSeen || escortPhase === "city_exploration" || escortPhase === "complete";
  const artisanViews: ViewId[] = ["artisan", "blacksmith", "blacksmith_buy", "smelting", "tool_upgrades", "repair", "tannery", "carpenter"];
  const guildViews: ViewId[] = ["guild", "support", "processing", "quests"];
  const merchantViews: ViewId[] = ["merchant", "bulk", "imports", "contracts"];
  const templeViews: ViewId[] = ["temple", "healing", "blessings", "holy_goods", "alchemy_recipes", "holy_sister"];
  const background = artisanViews.includes(view) ? ARTISAN_BACKGROUND : guildViews.includes(view) ? ADVENTURERS_GUILD_BACKGROUND : merchantViews.includes(view) ? MERCHANT_GUILD_BACKGROUND : templeViews.includes(view) ? TEMPLE_BACKGROUND : MARKET_BACKGROUND;

  function content() {
    if (view === "city") return <>{nav("The Market Square", "Food, general goods, notices & Minstrels", "market")}{nav("The Artisan District", "Blacksmith, Tannery & Craftsmen's Quarter", "artisan")}{nav("Adventurers' Guild", adventurersGuildUnlocked ? "Bounties, supporters and monster processing" : "Report a monster incident to gain access", adventurersGuildUnlocked ? "guild" : undefined, !adventurersGuildUnlocked)}{nav("Merchant's Guild", guildIntroductionSeen ? "Bulk orders, imports and trade contracts" : "Visit the Adventurers' Guild first", guildIntroductionSeen ? "merchant" : undefined, !guildIntroductionSeen)}{nav("Temple", "Temple of the Returning Light", "temple")}{nav("Side Alley", "A dark and unwelcoming passage", "side_alley")}</>;
    if (view === "market") {
      const generalGoodsOpen = bag.bagId === "bag2" || bag.bagId === "bag3";
      return <><Text style={styles.sectionTitle}>The Market Square</Text>{nav("Food Stall", "A variety of ingredients from the countryside.", "food")}{nav("General Goods", generalGoodsOpen ? "Tools, supplies and bag expansions" : "Currently closed", generalGoodsOpen ? "general" : undefined, !generalGoodsOpen)}{nav("Fishmonger", "Fresh Fish Meat", "fish")}{nav("Town Notice Board", "Notices and announcements from around the city", "notice_board")}{nav("Listening to the Minstrels", "Unlock songs and listen to music from distant cultures", "minstrels")}</>;
    }
    if (view === "food") return <><Text style={styles.sectionTitle}>Food Stall</Text><Text style={styles.note}>A variety of ingredients from the countryside. The selection changes slightly each day.</Text>{wallet}{city?.foodStock.map((id) => buyRow({ id, price: CITY_BUY_PRICES[id] ?? 10 }))}{tavernQuests.claimed.serve_water && !tavernQuests.purchasedBrewItems.dried_hop_cones ? brewQuestBuyRow("dried_hop_cones", 15) : null}</>;
    if (view === "general") return <><Text style={styles.sectionTitle}>General Goods</Text>{GENERAL.filter((item) => item.id !== "bag3" || bag.bagId !== "bag3").map(buyRow)}{tavernQuests.claimed.serve_water && !tavernQuests.purchasedBrewItems.malted_barley ? brewQuestBuyRow("malted_barley", 30) : null}{nav("Sell Goods", "The merchant pays 50% of base value, rounded up.", "sell")}</>;
    if (view === "sell") return <><Text style={styles.sectionTitle}>Sell Goods</Text><Text style={styles.note}>Tap an item to sell one. Equipped and quest items cannot be sold.</Text>{wallet}{bag.slots.map((item, slot) => item ? <TouchableOpacity key={slot} style={styles.simpleRow} disabled={busy} onPress={() => { void action(() => sellCityItem(slot)); }}><Text style={styles.simpleName}>{item.quantity}× {item.name}</Text><View style={styles.sellOffer}><Text style={styles.goldText}>Sell 1</Text><View style={styles.sellPrice}><CurrencyPrice totalCopper={citySellPrice(item.id)} /></View></View></TouchableOpacity> : null)}</>;
    if (view === "fish") return <><Text style={styles.sectionTitle}>Fishmonger</Text>{buyRow({ id: "fish", price: CITY_BUY_PRICES.fish ?? 18 })}<Text style={styles.note}>For now, Fish Meat must be bought here. Fishing can be added later.</Text></>;
    if (view === "notice_board") return <><Text style={styles.sectionTitle}>Town Notice Board</Text><Text selectable style={styles.note}>{"There's nothing interesting written there."}</Text></>;
    if (view === "minstrels") return <>
      <Text style={styles.sectionTitle}>Listening to the Minstrels</Text>
      <Text style={styles.note}>Unlock a song once, then listen whenever you visit the Minstrels.</Text>
      {wallet}
      {MINSTREL_SONGS.map((song) => {
        const unlocked = minstrelState.unlockedSongIds.includes(song.id);
        const active = activeMinstrelSong === song.id;
        return <View key={song.id} style={[styles.minstrelSong, active && styles.minstrelSongActive]}>
          <View style={styles.minstrelSongInfo}>
            <Text style={styles.stockName}>{song.genre}</Text>
            <Text style={styles.stockDescription}>{song.title}</Text>
          </View>
          {unlocked
            ? <View style={styles.playerControls}>
              <TouchableOpacity accessibilityLabel={`Play ${song.title}`} style={styles.playerButton} onPress={() => playMinstrelSong(song.id)}><Ionicons name="play" size={19} color="#FFF7E5" /></TouchableOpacity>
              <TouchableOpacity accessibilityLabel={`Pause ${song.title}`} disabled={!active || minstrelPlayback !== "playing"} style={[styles.playerButton, (!active || minstrelPlayback !== "playing") && styles.disabled]} onPress={() => pauseMinstrelSong(song.id)}><Ionicons name="pause" size={19} color="#FFF7E5" /></TouchableOpacity>
              <TouchableOpacity accessibilityLabel={`Stop ${song.title}`} disabled={!active} style={[styles.playerButton, !active && styles.disabled]} onPress={() => stopMinstrelSong(song.id)}><Ionicons name="stop" size={19} color="#FFF7E5" /></TouchableOpacity>
            </View>
            : <TouchableOpacity disabled={busy} style={[styles.priceButton, busy && styles.disabled]} onPress={() => { void purchaseMinstrelSong(song.id); }}><CurrencyPrice totalCopper={song.priceCopper} /></TouchableOpacity>}
        </View>;
      })}
    </>;
    if (view === "artisan") return <><Text style={styles.sectionTitle}>The Artisan District</Text>{nav("Blacksmith", "Buy and repair tools and equipment", "blacksmith")}{nav("Tannery", "Process monster pelts into Leather", "tannery")}{nav("Carpenter", "Construction and furnishing services — currently closed", "carpenter")}{nav("Craftsmen's Quarter", "Utility recipes and materials — currently closed", undefined, true)}</>;
    if (view === "blacksmith") return <><Text style={styles.sectionTitle}>Blacksmith</Text>{nav("Buy", "Tools, weapons and armor", "blacksmith_buy")}{nav("Ore Processing", "Refine three pieces of Ore into one Ingot", "smelting")}{nav("Tool Upgrades", "Improve cooking and butchering tools", "tool_upgrades")}{nav("Repair", <View style={styles.navPriceSubtitle}><Text style={styles.navSubtitle}>Restore tools and equipment for</Text><CurrencyPrice totalCopper={20} textStyle={styles.navSubtitle} /></View>, "repair")}</>;
    if (view === "blacksmith_buy") return <><Text style={styles.sectionTitle}>Blacksmith · Buy</Text>{wallet}{BLACKSMITH.map(buyRow)}</>;
    if (view === "smelting") return <><Text style={styles.sectionTitle}>Blacksmith · Ore Processing</Text><Text style={styles.note}>The Ore must be carried in your bag.</Text>{wallet}{BLACKSMITH_SMELTING_RECIPES.map(blacksmithRecipeRow)}</>;
    if (view === "tool_upgrades") return <><Text style={styles.sectionTitle}>Blacksmith · Tool Upgrades</Text><Text style={styles.note}>The tool and all required Ingots must be carried in your bag. Upgraded tools are returned at full Durability.</Text>{wallet}{BLACKSMITH_TOOL_UPGRADE_RECIPES.map(blacksmithRecipeRow)}</>;
    if (view === "repair") return <><Text style={styles.sectionTitle}>Repair</Text><View style={styles.notePriceRow}><Text style={styles.noteInline}>Every repair costs</Text><CurrencyPrice totalCopper={20} textStyle={styles.noteInline} /></View>{repairable.length ? repairable.map(({ item, slot }) => <TouchableOpacity key={slot} style={styles.simpleRow} onPress={() => { void action(() => repairCityItem(slot)); }}><View><Text style={styles.simpleName}>{item!.name}</Text><Text style={styles.small}>{item!.durability}/{item!.maxDurability} Durability</Text></View><CurrencyPrice totalCopper={20} textStyle={styles.goldText} /></TouchableOpacity>) : <Text style={styles.empty}>No damaged equipment in your bag.</Text>}</>;
    if (view === "tannery") return <><Text style={styles.sectionTitle}>Tannery</Text><Text style={styles.note}>The material must be carried in your bag. Each conversion costs 25 Copper Coins.</Text>{wallet}{tanneryRecipeRow("fur", 1)}{tanneryRecipeRow("wolf_pelt", 2)}<Text style={styles.note}>Leather will later be needed for bags and equipment.</Text></>;
    if (view === "carpenter") return <><Text style={styles.sectionTitle}>Carpenter</Text><Text style={styles.carpenterClosed}>Currently closed</Text>{CARPENTER_SERVICES.map((service) => <View key={service.title} style={styles.carpenterService}><View style={styles.carpenterLock}><Ionicons name="lock-closed" size={20} color="#8E7651" /></View><View style={styles.stockText}><Text style={styles.carpenterTitle}>{service.title}</Text><Text style={styles.carpenterDescription}>{service.description}</Text></View></View>)}</>;
    if (view === "guild") return <><Text style={styles.sectionTitle}>Adventurers’ Guild</Text>{city && <Text style={styles.rank}>Guild Rank {guildRank(city.guildReputation)} · {city.guildReputation} Reputation</Text>}{nav("The Expedition Hall", city?.supporter ? `${SUPPORTERS[city.supporter.id].name} · ${city.supporter.runsRemaining} runs remaining` : "Hire support for the next Dungeon Run", "support")}{nav("Monster Processing", "Send a carcass to the Guild Butcher", "processing")}{nav("Quest Board", "Accept quests and claim completed bounties", "quests")}</>;
    if (view === "support") return <><Text style={styles.sectionTitle}>The Expedition Hall</Text><View style={styles.notePriceRow}><CurrencyPrice totalCopper={100} textStyle={styles.noteInline} /><Text style={styles.noteInline}>per Dungeon Run. Choose up to three runs.</Text></View><View style={styles.stepper}><TouchableOpacity style={styles.stepButton} onPress={() => setRuns(Math.max(1, runs - 1))}><Text style={styles.stepText}>−</Text></TouchableOpacity><View style={styles.runCountRow}><Text style={styles.runCount}>{runs} Run{runs === 1 ? "" : "s"} ·</Text><CurrencyPrice totalCopper={runs * 100} textStyle={styles.runCount} /></View><TouchableOpacity style={styles.stepButton} onPress={() => setRuns(Math.min(3, runs + 1))}><Text style={styles.stepText}>+</Text></TouchableOpacity></View>{(Object.keys(SUPPORTERS) as SupporterId[]).map((id) => { const supporter = SUPPORTERS[id]; return <View key={id} style={styles.supporterRow}><Image source={SUPPORTER_IMAGES[id]} style={styles.supporterImage} /><View style={styles.stockText}><Text style={styles.stockName}>{supporter.name}</Text><Text style={styles.stockDescription}>{supporter.description}</Text></View><TouchableOpacity style={styles.hireButton} onPress={() => { void action(() => hireSupporter(id, runs)); }}><Text style={styles.hireText}>Hire</Text></TouchableOpacity></View>; })}</>;
    if (view === "processing") return <><Text style={styles.sectionTitle}>Monster Processing</Text><Text style={styles.note}>Select every Monster Carcass you want the Guild Butcher to process.</Text>{wallet}{carriedCarcasses.length ? carriedCarcasses.map((carcass) => { const selected = selectedCarcassSet.has(carcass.key); return <TouchableOpacity key={carcass.key} style={[styles.processingChoice, selected && styles.selectedCard]} disabled={busy} onPress={() => toggleCarcass(carcass.key)} activeOpacity={0.78}><View style={styles.processingChoiceIcon}><ItemIcon id="monster_carcass" /></View><View style={styles.stockText}><Text style={styles.stockName}>{carcass.name}{carcass.stackQuantity > 1 ? ` · ${carcass.unitNumber}/${carcass.stackQuantity}` : ""}</Text><Text style={styles.stockDescription}>Estimated Result: {guildProcessingEstimate(carcass.monsterId)}</Text><View style={styles.processingUnitFee}><CurrencyPrice totalCopper={GUILD_PROCESSING_FEE_PER_CARCASS} /></View></View><View style={[styles.selectionCheck, selected && styles.selectionCheckSelected]}>{selected && <Ionicons name="checkmark" size={18} color="#FFF7E5" />}</View></TouchableOpacity>; }) : <Text style={styles.empty}>There are no processable Monster Carcasses in your bag.</Text>}<View style={styles.processingSummary}><View><Text style={styles.walletLabel}>Selected</Text><Text style={styles.processingCount}>{selectedCarcasses.length} {selectedCarcasses.length === 1 ? "Carcass" : "Carcasses"}</Text></View><View style={styles.processingTotal}><Text style={styles.walletLabel}>Processing Fee</Text><View style={styles.costLine}><CurrencyPrice totalCopper={processingTotal} textStyle={styles.processingCount} /></View></View></View><TouchableOpacity style={[styles.confirmProcessingButton, (selectedCarcasses.length === 0 || busy) && styles.disabled]} disabled={selectedCarcasses.length === 0 || busy} onPress={() => { void confirmCarcassProcessing(); }}><Ionicons name="checkmark-circle-outline" size={20} color="#FFF7E5" /><Text style={styles.wideButtonText}>Confirm</Text></TouchableOpacity><Text style={styles.note}>The results are delivered to your Courier’s Chest on the following day. Rare materials are rolled independently.</Text></>;
    if (view === "quests") return <><Text style={styles.sectionTitle}>Quest Board</Text><Text style={styles.note}>Accepted quests remain in your journal. Unaccepted quest categories are refreshed every Sunday.</Text>{(Object.keys(QUESTS) as QuestId[]).map((id) => { const def = QUESTS[id]; const status = city?.quests[id]; return <View key={id} style={styles.quest}><Text style={styles.questType}>{def.type} · Rank {def.rank}</Text><Text style={styles.stockName}>{def.title}</Text><Text style={styles.stockDescription}>{def.detail}</Text><View style={styles.rewardRow}><CurrencyPrice totalCopper={def.rewardCopper} textStyle={styles.reward} /><Text style={styles.reward}>· +{def.reputation} Guild Reputation</Text></View>{id === "wolves" && status && status.status !== "offered" && <Text style={styles.progress}>Progress: {Math.min(2, status.progress)}/2</Text>}<TouchableOpacity disabled={busy || status?.status === "completed"} style={[styles.wideButton, status?.status === "completed" && styles.disabled]} onPress={() => { void action(() => !status || status.status === "offered" ? acceptQuest(id) : turnInQuest(id)); }}><Text style={styles.wideButtonText}>{!status || status.status === "offered" ? "Accept Quest" : status.status === "completed" ? "Completed" : "Turn In"}</Text></TouchableOpacity></View>; })}</>;
    if (view === "merchant") return <><Text style={styles.sectionTitle}>Merchant’s Guild</Text><View style={styles.merchantReceptionistRow}><Image source={MERCHANT_GUILD_RECEPTIONIST_PORTRAIT} style={styles.merchantReceptionistPortrait} resizeMode="contain" /><View style={styles.stockText}><Text style={styles.stockName}>Merchant Guild Receptionist</Text><Text style={styles.stockDescription}>Guild orders, imported goods and merchant reputation</Text></View></View><Text style={styles.rank}>Merchant Reputation · {merchantReputation}</Text>{nav("The Trade Hall", "Large purchases and special commercial services", "bulk")}{nav("Imported Goods", "Currently closed", undefined, true)}{nav("Trade Contracts", "Currently closed", undefined, true)}</>;
    if (view === "bulk") return <><Text style={styles.sectionTitle}>Bulk Orders</Text><Text style={styles.note}>Vegetables arrive in shipment bags. Merchant Reputation lowers prices and increases shipment size.</Text>{BULK_SHIPMENTS.map((shipment) => { const price = merchantPrice(shipment.price, merchantReputation); const quantity = merchantBulkQuantity(merchantReputation); return <View key={shipment.id} style={styles.stockRow}><View style={styles.iconBox}><ItemIcon id={shipment.id} /></View><View style={styles.stockText}><Text style={styles.stockName}>{ITEM_CATALOG[shipment.id]?.name} Shipment</Text><Text style={styles.stockDescription}>{quantity} {ITEM_CATALOG[shipment.id]?.name} · delivered in a {ITEM_CATALOG[`bag_${shipment.id}`]?.name}</Text></View><TouchableOpacity style={styles.priceButton} disabled={busy} onPress={() => { void action(() => buyBulkShipment(shipment.id, shipment.price)); }}><CurrencyPrice totalCopper={price} /></TouchableOpacity></View>; })}</>;
    if (view === "imports") return <><Text style={styles.sectionTitle}>Imported Goods</Text><Text style={styles.note}>Higher Merchant Reputation opens rarer trade routes.</Text>{tavernQuests.claimed.serve_water && !tavernQuests.purchasedBrewItems.brewers_yeast ? brewQuestBuyRow("brewers_yeast", 40) : null}{IMPORTS.map((item) => item.reputation <= merchantReputation ? buyRow({ id: item.id, price: merchantPrice(item.price, merchantReputation) }) : <View key={item.id} style={[styles.stockRow, styles.disabled]}><View style={styles.iconBox}><Ionicons name="lock-closed" size={25} color="#C4943A" /></View><View style={styles.stockText}><Text style={styles.stockName}>{ITEM_CATALOG[item.id]?.name}</Text><Text style={styles.stockDescription}>Requires {item.reputation} Merchant Reputation</Text></View></View>)}</>;
    if (view === "contracts") { const status = city?.healingPotionContract ?? "available"; return <><Text style={styles.sectionTitle}>Trade Contracts</Text><View style={styles.quest}><Text style={styles.questType}>Supply Contract</Text><Text style={styles.stockName}>Healing Potion</Text><Text style={styles.stockDescription}>Deliver 10 Low Quality Healing Potions.</Text><View style={styles.rewardRow}><Text style={styles.reward}>Reward:</Text><CurrencyPrice totalCopper={85} textStyle={styles.reward} /><Text style={styles.reward}>· +10 Merchant Reputation</Text></View><TouchableOpacity disabled={busy || status === "completed"} style={[styles.wideButton, status === "completed" && styles.disabled]} onPress={() => { void action(status === "available" ? acceptHealingPotionContract : fulfillHealingPotionContract); }}><Text style={styles.wideButtonText}>{status === "available" ? "Accept Contract" : status === "accepted" ? "Deliver 10 Potions" : "Completed"}</Text></TouchableOpacity></View></>; }
    if (view === "temple") return <><Text style={styles.sectionTitle}>Temple of the Returning Light</Text>{nav("Receive Treatment", <View style={styles.navPriceSubtitle}><Text style={styles.navSubtitle}>Restore Life for</Text><CurrencyPrice totalCopper={12} textStyle={styles.navSubtitle} /></View>, "healing")}{nav("Blessings", city?.blessing ? `Prepared: Blessing of ${city.blessing.id}` : "One blessing for the next Expedition", "blessings")}{nav("Holy Herbs", "Currently closed", undefined, true)}{nav("Alchemy Recipes", "Currently closed", undefined, true)}{nav("Talk to the Holy Sister", "Ask about Karma and the next life", "holy_sister")}</>;
    if (view === "healing") return <><Text style={styles.sectionTitle}>Healing</Text><Text style={styles.note}>The temple sisters will restore your Life through treatment.</Text><TouchableOpacity style={styles.wideButton} disabled={busy} onPress={() => { void action(receiveTempleTreatment); }}><Text style={styles.wideButtonText}>Receive Treatment ·</Text><CurrencyPrice totalCopper={12} textStyle={styles.wideButtonText} /></TouchableOpacity></>;
    if (view === "blessings") { const blessings: { id: TempleBlessingId; name: string; effect: string }[] = [{ id: "endurance", name: "Blessing of Endurance", effect: "+50 Maximum Stamina for the next Expedition." }, { id: "fortune", name: "Blessing of Fortune", effect: "+5 Luck for the next Expedition." }, { id: "protection", name: "Blessing of Protection", effect: "Receive 15% less damage during the next Expedition." }]; return <><Text style={styles.sectionTitle}>Blessings</Text><View style={styles.notePriceRow}><Text style={styles.noteInline}>Only one blessing may be active at a time. Choosing another replaces the previous blessing. Each costs</Text><CurrencyPrice totalCopper={50} textStyle={styles.noteInline} /></View>{blessings.map((blessing) => <View key={blessing.id} style={[styles.quest, city?.blessing?.id === blessing.id && styles.selectedCard]}><Text style={styles.stockName}>{blessing.name}</Text><Text style={styles.stockDescription}>{blessing.effect}</Text><TouchableOpacity style={styles.wideButton} disabled={busy} onPress={() => { void action(() => buyTempleBlessing(blessing.id)); }}>{city?.blessing?.id === blessing.id ? <Text style={styles.wideButtonText}>Selected</Text> : <><Text style={styles.wideButtonText}>Receive ·</Text><CurrencyPrice totalCopper={50} textStyle={styles.wideButtonText} /></>}</TouchableOpacity></View>)}</>; }
    if (view === "holy_goods") return <><Text style={styles.sectionTitle}>Holy Herbs</Text>{HOLY_GOODS.map(buyRow)}</>;
    if (view === "alchemy_recipes") return <><Text style={styles.sectionTitle}>Alchemy Recipes</Text>{["Holy Water", "Antidote", "Purification Potion", "Blessed Healing Potion"].map((name) => <View key={name} style={styles.recipe}><Text style={styles.simpleName}>{name}</Text><Text style={styles.small}>A special Temple recipe. Recipe crafting will be added with the expanded Alchemy system.</Text></View>)}</>;
    if (view === "holy_sister") return <><Image source={HOLY_SISTER} style={styles.holySister} resizeMode="contain" /><Text style={styles.sectionTitle}>Holy Sister</Text><View style={styles.dialogueCard}><Text style={styles.dialogueText}>“I see you’ve collected {karmaPoints} karma point{karmaPoints === 1 ? "" : "s"}. That will be useful to you in your next life.”</Text></View></>;
    return <><Text style={styles.sectionTitle}>Side Alley</Text><View style={styles.warningCard}><Ionicons name="warning-outline" size={36} color="#E58A35" /><Text style={styles.warningText}>I’d better stay away from that.</Text><Text style={styles.small}>Something lies beyond the alley, but it is not accessible yet.</Text></View></>;
  }

  return (
    <View style={styles.root}>
      <SceneBackground source={background} topOffset={headerHeight} />
      <View style={styles.overlay} pointerEvents="none" />
      <View
        style={[styles.cityHeader, { paddingTop: insets.top + 22 }]}
        onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
      >
        <View style={styles.titleRow}>
          {PARENT[view]
            ? <TouchableOpacity style={styles.roundButton} onPress={back}><Ionicons name="arrow-back" size={22} color="#F5E6C8" /></TouchableOpacity>
            : <View style={styles.headerSpacer} />}
          <Text style={styles.title}>Next City</Text>
          <CurrencyHud inline compact />
        </View>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.panel}>{content()}</View>
        {view === "city" && (
          <TouchableOpacity style={[styles.returnButton, busy && styles.disabled]} disabled={busy} onPress={() => { void back(); }} activeOpacity={0.8}>
            <Ionicons name="home-outline" size={19} color="#F5E6C8" />
            <Text style={styles.returnButtonText}>Go back to the tavern.</Text>
          </TouchableOpacity>
        )}
        {thought && <Text selectable style={styles.thought}>{thought}</Text>}
        {message && <Text selectable style={styles.message}>{message}</Text>}
      </ScrollView>
      <StoryDialogOverlay
        visible={arrivalDialogIndex !== null}
        line={arrivalDialogIndex === null ? null : arrivalLines[arrivalDialogIndex] ?? null}
        onContinue={() => { void advanceArrivalDialog(); }}
        onSkip={() => { if (arrivalDialogIndex === arrivalLines.length - 1) void advanceArrivalDialog(); else setArrivalDialogIndex(arrivalLines.length - 1); }}
      />
      {floatingMessage && <View pointerEvents="none" style={styles.floatingMessageWrap}><Text selectable style={styles.floatingMessage}>{floatingMessage}</Text></View>}
      <StoryDialogOverlay
        visible={guildDialogIndex !== null}
        line={guildDialogIndex === null ? null : guildLines[guildDialogIndex] ?? null}
        onContinue={() => { void advanceGuildIntroduction(); }}
        onSkip={() => { if (guildDialogIndex === guildLines.length - 1) void advanceGuildIntroduction(); else setGuildDialogIndex(guildLines.length - 1); }}
      />
      <StoryDialogOverlay
        visible={merchantGuildDialog !== null}
        line={merchantGuildDialog === null ? null : merchantGuildLines[merchantGuildDialog.index] ?? null}
        choices={merchantGuildChoices}
        onContinue={advanceMerchantGuildIntroduction}
        onSkip={skipMerchantGuildIntroduction}
      />
      <StoryDialogOverlay
        visible={cityGuardDialogIndex !== null}
        line={cityGuardDialogIndex === null ? null : cityGuardLines[cityGuardDialogIndex] ?? null}
        onContinue={() => { void advanceCityGuardDialog(); }}
        onSkip={() => { if (cityGuardDialogIndex === cityGuardLines.length - 1) void advanceCityGuardDialog(); else setCityGuardDialogIndex(cityGuardLines.length - 1); }}
      />
      <StoryDialogOverlay
        visible={minstrelDialogIndex !== null}
        line={minstrelDialogIndex === null ? null : minstrelIntroductionLines[minstrelDialogIndex] ?? null}
        choices={minstrelDialogIndex === minstrelIntroductionLines.length - 1
          ? [{ label: "Check out what they offer.", onPress: () => { void finishMinstrelIntroduction(); } }]
          : []}
        onContinue={advanceMinstrelIntroduction}
        onSkip={() => { if (minstrelDialogIndex === minstrelIntroductionLines.length - 1) void finishMinstrelIntroduction(); else setMinstrelDialogIndex(minstrelIntroductionLines.length - 1); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0500" }, overlay: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.34)" }, cityHeader: { paddingHorizontal: 14, paddingBottom: 12 }, scroll: { flex: 1 }, content: { flexGrow: 1, paddingHorizontal: 14, paddingTop: 12, gap: 12 }, titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, title: { flex: 1, color: "#FFF7E5", fontFamily: "Oldenburg", fontSize: 22, textAlign: "center", textShadowColor: "#000", textShadowRadius: 8 }, roundButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(18,9,2,0.9)", borderWidth: 1, borderColor: "rgba(196,148,58,0.55)" }, headerSpacer: { width: 42, height: 42 },
  panel: { borderRadius: 18, borderCurve: "continuous", borderWidth: 1.5, borderColor: "rgba(196,148,58,0.58)", backgroundColor: "rgba(18,9,2,0.94)", padding: 13, gap: 9 }, prompt: { color: "#E4C882", fontFamily: "Oldenburg", fontSize: 15 }, sectionTitle: { color: "#FFF1CB", fontFamily: "Oldenburg", fontSize: 19, textAlign: "center", marginBottom: 3 }, nav: { minHeight: 64, borderRadius: 13, borderCurve: "continuous", borderWidth: 1, borderColor: "rgba(196,148,58,0.30)", backgroundColor: "rgba(48,27,7,0.78)", padding: 12, flexDirection: "row", alignItems: "center", gap: 10 }, navText: { flex: 1, gap: 4 }, navTitle: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 14 }, navSubtitle: { color: "rgba(240,232,213,0.64)", fontSize: 11, lineHeight: 15 }, navPriceSubtitle: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 }, disabled: { opacity: 0.42 },
  stockRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 8, borderRadius: 12, backgroundColor: "rgba(48,27,7,0.72)", borderWidth: 1, borderColor: "rgba(196,148,58,0.25)" }, iconBox: { width: 48, height: 48, alignItems: "center", justifyContent: "center" }, itemImage: { width: 46, height: 46 }, stockText: { flex: 1, gap: 3 }, stockName: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 12 }, stockDescription: { color: "rgba(240,232,213,0.67)", fontSize: 10, lineHeight: 14 }, priceButton: { minWidth: 58, minHeight: 42, paddingHorizontal: 7, borderRadius: 10, backgroundColor: "rgba(112,73,18,0.88)", borderWidth: 1, borderColor: "#C4943A", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }, price: { color: "#FFF", fontFamily: "Oldenburg", fontSize: 11, textAlign: "center" }, coin: { width: 17, height: 17 }, note: { color: "#D6C8A8", fontSize: 12, lineHeight: 18, padding: 6 }, noteInline: { color: "#D6C8A8", fontSize: 12, lineHeight: 18 }, notePriceRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 5, padding: 6 }, rewardRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4, marginTop: 3 },
  smithRecipe: { gap: 8, padding: 10, borderRadius: 13, borderCurve: "continuous", backgroundColor: "rgba(48,27,7,0.78)", borderWidth: 1, borderColor: "rgba(196,148,58,0.32)" }, smithRecipeMain: { flexDirection: "row", alignItems: "center", gap: 8 }, smithActionButton: { minHeight: 42, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, backgroundColor: "#79521D", borderWidth: 1, borderColor: "#C4943A", paddingHorizontal: 10 },
  tanneryRecipe: { gap: 12, padding: 12, borderRadius: 13, borderCurve: "continuous", backgroundColor: "rgba(48,27,7,0.78)", borderWidth: 1, borderColor: "rgba(196,148,58,0.32)" },
  tanneryConversion: { minHeight: 92, flexDirection: "row", alignItems: "center", justifyContent: "space-around", gap: 10 },
  tanneryItem: { flex: 1, alignItems: "center", gap: 5 },
  tanneryOutput: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  tanneryIconBox: { width: 68, height: 68, alignItems: "center", justifyContent: "center" },
  tanneryQuantity: { color: "#FFF1CB", fontFamily: "Oldenburg", fontSize: 17 },
  tanneryLabel: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 15, textAlign: "center" },
  carpenterClosed: { color: "#E4C882", fontFamily: "Oldenburg", fontSize: 14, textAlign: "center", paddingVertical: 5 },
  carpenterService: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 11, padding: 12, borderRadius: 13, borderCurve: "continuous", backgroundColor: "rgba(37,23,10,0.72)", borderWidth: 1, borderColor: "rgba(142,118,81,0.35)" },
  carpenterLock: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(12,8,4,0.62)", borderWidth: 1, borderColor: "rgba(142,118,81,0.38)" },
  carpenterTitle: { color: "#C7B99D", fontFamily: "Oldenburg", fontSize: 14 },
  carpenterDescription: { color: "rgba(214,200,168,0.58)", fontSize: 11, lineHeight: 16 },
  walletCard: { minHeight: 48, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, backgroundColor: "rgba(10,5,1,0.82)", borderWidth: 1, borderColor: "rgba(196,148,58,0.38)" }, walletLabel: { color: "#E4C882", fontFamily: "Oldenburg", fontSize: 12 }, sellOffer: { minWidth: 58, alignItems: "center", gap: 5 }, sellPrice: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  simpleRow: { minHeight: 51, borderRadius: 11, backgroundColor: "rgba(48,27,7,0.72)", paddingHorizontal: 12, paddingVertical: 9, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, simpleName: { flex: 1, color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 12 }, goldText: { color: "#E4C882", fontFamily: "Oldenburg", fontSize: 11 }, small: { color: "#BAA986", fontSize: 10, marginTop: 3 }, empty: { color: "#BAA986", textAlign: "center", padding: 18 }, recipe: { minHeight: 57, padding: 13, borderRadius: 12, justifyContent: "center", backgroundColor: "rgba(48,27,7,0.78)", borderWidth: 1, borderColor: "rgba(196,148,58,0.32)" }, rank: { color: "#E4C882", textAlign: "center", fontFamily: "Oldenburg", fontSize: 12, marginBottom: 4 },
  stepper: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 14, marginBottom: 3 }, stepButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(112,73,18,0.9)", borderWidth: 1, borderColor: "#C4943A" }, stepText: { color: "#FFF", fontSize: 22 }, runCountRow: { flexDirection: "row", alignItems: "center", gap: 4 }, runCount: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 12 }, supporterRow: { flexDirection: "row", gap: 9, alignItems: "center", padding: 8, borderRadius: 13, backgroundColor: "rgba(48,27,7,0.76)" }, supporterImage: { width: 66, height: 66, borderRadius: 11, borderWidth: 1, borderColor: "#C4943A" }, hireButton: { paddingHorizontal: 11, paddingVertical: 10, borderRadius: 9, backgroundColor: "#79521D" }, hireText: { color: "#FFF", fontFamily: "Oldenburg", fontSize: 11 }, processingCard: { gap: 9, padding: 13, borderRadius: 13, backgroundColor: "rgba(48,27,7,0.78)" }, wideButton: { minHeight: 42, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, backgroundColor: "#79521D", borderWidth: 1, borderColor: "#C4943A", marginTop: 5 }, wideButtonText: { color: "#FFF7E5", fontFamily: "Oldenburg", fontSize: 11 }, quest: { gap: 5, padding: 12, borderRadius: 13, backgroundColor: "rgba(48,27,7,0.78)", borderWidth: 1, borderColor: "rgba(196,148,58,0.3)" }, questType: { color: "#C4943A", fontFamily: "Oldenburg", fontSize: 10, textTransform: "uppercase" }, reward: { color: "#E4C882", fontSize: 11 }, progress: { color: "#F5E6C8", fontSize: 11 }, message: { color: "#F5E6C8", textAlign: "center", backgroundColor: "rgba(54,28,6,0.95)", borderRadius: 11, padding: 11, fontSize: 12 },
  processingChoice: { minHeight: 82, flexDirection: "row", alignItems: "center", gap: 9, padding: 9, borderRadius: 13, borderCurve: "continuous", backgroundColor: "rgba(48,27,7,0.78)", borderWidth: 1, borderColor: "rgba(196,148,58,0.3)" }, processingChoiceIcon: { width: 52, height: 52, alignItems: "center", justifyContent: "center" }, processingUnitFee: { flexDirection: "row", alignItems: "center", gap: 4, paddingTop: 3 }, selectionCheck: { width: 28, height: 28, borderRadius: 8, borderWidth: 1.5, borderColor: "rgba(196,148,58,0.55)", backgroundColor: "rgba(10,5,1,0.6)", alignItems: "center", justifyContent: "center" }, selectionCheckSelected: { backgroundColor: "#79521D", borderColor: "#E4C882" }, processingSummary: { minHeight: 62, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 12, borderCurve: "continuous", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, backgroundColor: "rgba(10,5,1,0.86)", borderWidth: 1, borderColor: "rgba(196,148,58,0.4)" }, processingTotal: { alignItems: "flex-end", gap: 4 }, costLine: { flexDirection: "row", alignItems: "center", gap: 5 }, processingCount: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 13, fontVariant: ["tabular-nums"] }, confirmProcessingButton: { minHeight: 48, borderRadius: 11, borderCurve: "continuous", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: "#79521D", borderWidth: 1.5, borderColor: "#C4943A" },
  returnButton: { minHeight: 54, marginTop: "auto", borderRadius: 14, borderCurve: "continuous", borderWidth: 1.5, borderColor: "rgba(196,148,58,0.62)", backgroundColor: "rgba(18,9,2,0.95)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 16 }, returnButtonText: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 14 }, thought: { color: "#E8DFC9", textAlign: "center", fontStyle: "italic", backgroundColor: "rgba(15,9,4,0.92)", borderRadius: 11, padding: 12, fontSize: 12, borderWidth: 1, borderColor: "rgba(196,148,58,0.25)" },
  selectedCard: { borderColor: "#E4C882", backgroundColor: "rgba(92,67,20,0.88)" }, holySister: { width: "100%", height: 330, borderRadius: 14 }, dialogueCard: { padding: 14, borderRadius: 13, borderWidth: 1, borderColor: "rgba(228,200,130,0.5)", backgroundColor: "rgba(20,13,24,0.86)" }, dialogueText: { color: "#F5E6C8", fontSize: 13, lineHeight: 21, textAlign: "center", fontStyle: "italic" }, warningCard: { alignItems: "center", gap: 12, padding: 20, borderRadius: 14, borderWidth: 1, borderColor: "rgba(229,138,53,0.55)", backgroundColor: "rgba(42,17,8,0.9)" }, warningText: { color: "#FFD8B2", fontFamily: "Oldenburg", fontSize: 16, textAlign: "center" },
  merchantReceptionistRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 9, borderRadius: 13, backgroundColor: "rgba(48,27,7,0.72)", borderWidth: 1, borderColor: "rgba(196,148,58,0.25)" },
  merchantReceptionistPortrait: { width: 58, height: 58, borderRadius: 29, borderWidth: 1, borderColor: "#C4943A" },
  minstrelSong: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 12, borderCurve: "continuous", backgroundColor: "rgba(48,27,7,0.72)", borderWidth: 1, borderColor: "rgba(196,148,58,0.25)" },
  minstrelSongActive: { borderColor: "#E4C882", backgroundColor: "rgba(83,48,10,0.88)" },
  minstrelSongInfo: { flex: 1, gap: 4 },
  playerControls: { flexDirection: "row", alignItems: "center", gap: 6 },
  playerButton: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(112,73,18,0.9)", borderWidth: 1, borderColor: "#C4943A" },
  floatingMessageWrap: { ...StyleSheet.absoluteFill, zIndex: 5000, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  floatingMessage: { color: "#FFF4DC", fontFamily: "Oldenburg", fontSize: 14, textAlign: "center", backgroundColor: "rgba(18,9,2,0.95)", borderWidth: 1, borderColor: "#C4943A", borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
});
