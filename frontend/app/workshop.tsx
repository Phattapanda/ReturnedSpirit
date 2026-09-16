import React, { useCallback, useMemo, useState } from "react";
import { Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import SceneBackground from "@/src/components/SceneBackground";
import SeasonedItemBadge from "@/src/components/seasoned-item-badge";
import ItemDurabilityBadge from "@/src/components/item-durability-badge";
import ScrollActivationOverlay from "@/src/components/scroll-activation-overlay";
import TravelHeader from "@/src/components/travel-header";
import { getItemImageSource } from "@/src/components/PlayerBag";
import { COOKING_RECIPES, consumeRecipeIngredients, createRecipeOutputs, discoverRecipe, findCookingRecipe, loadDiscoveredRecipes } from "@/src/game/cooking-system";
import { DEFAULT_BAG, ITEM_ATTRIBUTE, PLAYER_BAG_KEY, canStack, hasItemAttribute, normalizeBagItem, normalizePlayerBagData, planAddToBag, type BagItem, type PlayerBagData } from "@/src/game/item-system";
import { WORKSHOP_CRAFT_INGREDIENTS_KEY, WORKSHOP_CRAFT_RESULT_KEY, WORKSHOP_CRAFT_TOOL_KEY, WORKSHOP_STORAGE_KEY, loadWorkshopState } from "@/src/game/workshop-system";
import { createCraftedScroll, SCROLL_BASE_USES } from "@/src/game/scroll-system";
import { PLAYER_STATS_KEY, normalizePlayerStats } from "@/src/game/player-stats";

const BACKGROUND = require("../assets/images/workshop.png");
const TOOL_CATEGORIES = [
  { id: "hand", label: "Hand", image: null },
  { id: "mortar_and_pestle", label: "Mortar and Pestle", image: require("../assets/images/mortar_and_pestle.png") },
  { id: "distiller", label: "Distiller", image: require("../assets/images/distiller.png") },
  { id: "hammer_and_anvil", label: "Hammer and Anvil", image: require("../assets/images/hammer_and_anvil.png") },
  { id: "tailoring", label: "Tailoring", image: require("../assets/images/tailoring.png") },
] as const;

function cloneSlots(raw: string | null, count: number): (BagItem | null)[] {
  try { const parsed = raw ? JSON.parse(raw) : []; return Array.from({ length: count }, (_, index) => normalizeBagItem(parsed[index] ?? null)); }
  catch { return Array(count).fill(null); }
}

function addToSlots(slots: (BagItem | null)[], item: BagItem): { slots: (BagItem | null)[]; moved: boolean } {
  const next = slots.map((slot) => slot ? { ...slot } : null);
  let remaining = item.quantity;
  const maxStack = hasItemAttribute(item, ITEM_ATTRIBUTE.TOOL) || item.id === "scroll" || item.id.endsWith("_scroll") ? 1 : 20;
  for (let i = 0; i < next.length && remaining > 0; i++) {
    const slot = next[i];
    if (slot && canStack(slot, item) && slot.quantity < maxStack) { const amount = Math.min(remaining, maxStack - slot.quantity); next[i] = { ...slot, quantity: slot.quantity + amount }; remaining -= amount; }
  }
  for (let i = 0; i < next.length && remaining > 0; i++) if (!next[i]) { const amount = Math.min(remaining, maxStack); next[i] = { ...item, equipped: false, quantity: amount }; remaining -= amount; }
  return { slots: next, moved: remaining === 0 };
}

function ItemSlot({ item, label, onPress }: { item: BagItem | null; label?: string; onPress?: () => void }) {
  const source = item ? getItemImageSource(item.id) : undefined;
  return <TouchableOpacity disabled={!onPress} onPress={onPress} style={styles.slot} activeOpacity={0.78}>
    {source ? <Image source={source} style={styles.slotImage} resizeMode="contain" /> : <Ionicons name={item ? "cube-outline" : "add"} size={item ? 25 : 18} color={item ? "#D6A33B" : "rgba(228,200,130,0.38)"} />}
    {item ? <><SeasonedItemBadge visible={!!item.weaponEnhanced || !!item.armorEnhanced || item.seasonedStage !== undefined} /><ItemDurabilityBadge item={item} /></> : null}
    {item && item.quantity > 1 ? <Text style={styles.quantity}>{item.quantity}</Text> : null}
    {!item && label ? <Text style={styles.slotLabel}>{label}</Text> : null}
  </TouchableOpacity>;
}

export default function WorkshopScreen() {
  const router = useRouter(); const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(0); const [refreshKey, setRefreshKey] = useState(0);
  const [bag, setBag] = useState<PlayerBagData>({ ...DEFAULT_BAG, slots: [...DEFAULT_BAG.slots] });
  const [storage, setStorage] = useState<(BagItem | null)[]>(Array(12).fill(null));
  const [ingredients, setIngredients] = useState<(BagItem | null)[]>(Array(3).fill(null));
  const [tool, setTool] = useState<BagItem | null>(null); const [result, setResult] = useState<BagItem | null>(null);
  const [discovered, setDiscovered] = useState<string[]>([]); const [bookOpen, setBookOpen] = useState(false); const [category, setCategory] = useState<typeof TOOL_CATEGORIES[number]["id"]>("hand");
  const [message, setMessage] = useState<string | null>(null);
  const [storageActionIndex, setStorageActionIndex] = useState<number | null>(null);
  const [effectiveness, setEffectiveness] = useState(1);
  const [scrollActivationKey, setScrollActivationKey] = useState(0);

  useFocusEffect(useCallback(() => { let active = true; (async () => {
    const state = await loadWorkshopState(); if (state.phase !== "complete") { router.replace("/outside-tavern"); return; }
    const [rawStorage, rawIngredients, rawTool, rawResult, rawBag, known, rawStats] = await Promise.all([
      AsyncStorage.getItem(WORKSHOP_STORAGE_KEY), AsyncStorage.getItem(WORKSHOP_CRAFT_INGREDIENTS_KEY), AsyncStorage.getItem(WORKSHOP_CRAFT_TOOL_KEY), AsyncStorage.getItem(WORKSHOP_CRAFT_RESULT_KEY), AsyncStorage.getItem(PLAYER_BAG_KEY), loadDiscoveredRecipes(), AsyncStorage.getItem(PLAYER_STATS_KEY),
    ]); if (!active) return;
    setStorage(cloneSlots(rawStorage, 12)); setIngredients(cloneSlots(rawIngredients, 3)); setTool(normalizeBagItem(rawTool ? JSON.parse(rawTool) : null)); setResult(normalizeBagItem(rawResult ? JSON.parse(rawResult) : null)); setBag(rawBag ? normalizePlayerBagData(JSON.parse(rawBag)) : DEFAULT_BAG); setDiscovered(known); setEffectiveness(normalizePlayerStats(rawStats ? JSON.parse(rawStats) : null).effectiveness);
  })().catch(() => setMessage("The workshop could not be loaded.")); return () => { active = false; }; }, [router]));

  async function persist(nextStorage = storage, nextIngredients = ingredients, nextTool = tool, nextResult = result, nextBag = bag) {
    await AsyncStorage.multiSet([[WORKSHOP_STORAGE_KEY, JSON.stringify(nextStorage)], [WORKSHOP_CRAFT_INGREDIENTS_KEY, JSON.stringify(nextIngredients)], [WORKSHOP_CRAFT_TOOL_KEY, JSON.stringify(nextTool)], [WORKSHOP_CRAFT_RESULT_KEY, JSON.stringify(nextResult)], [PLAYER_BAG_KEY, JSON.stringify(nextBag)]]);
  }
  async function moveBagItem(slotIndex: number, item: BagItem) {
    const added = addToSlots(storage, { ...item, equipped: false }); if (!added.moved) { setMessage("The Workshop Storage is full."); return; }
    const nextBag = { ...bag, slots: bag.slots.map((slot, index) => index === slotIndex ? null : slot) };
    setStorage(added.slots); setBag(nextBag); setRefreshKey((key) => key + 1); await persist(added.slots, ingredients, tool, result, nextBag);
  }
  async function selectStorage(index: number) {
    const item = storage[index]; if (!item) return;
    const nextStorage = storage.map((slot, i) => i === index ? null : slot);
    if (hasItemAttribute(item, ITEM_ATTRIBUTE.TOOL)) {
      if (tool) { setMessage("The Tool Slot is already occupied."); return; }
      setStorage(nextStorage); setTool(item); await persist(nextStorage, ingredients, item, result); return;
    }
    const empty = ingredients.findIndex((slot) => !slot); if (empty < 0) { setMessage("All ingredient slots are occupied."); return; }
    const nextIngredients = ingredients.map((slot, i) => i === empty ? item : slot); setStorage(nextStorage); setIngredients(nextIngredients); await persist(nextStorage, nextIngredients, tool, result);
  }
  async function moveStorageToBag(index: number) {
    const item = storage[index]; if (!item) return;
    const plan = planAddToBag(item, bag); if (!plan.canTransfer || plan.remainderQty > 0) { setMessage("There is not enough room in the Player Bag."); return; }
    const nextStorage = storage.map((slot, i) => i === index ? null : slot); const nextBag = { ...bag, slots: plan.updatedSlots };
    setStorage(nextStorage); setBag(nextBag); setStorageActionIndex(null); setRefreshKey((key) => key + 1); await persist(nextStorage, ingredients, tool, result, nextBag);
  }
  async function returnToStorage(item: BagItem, kind: "ingredient" | "tool" | "result", index = -1) {
    const added = addToSlots(storage, item); if (!added.moved) { setMessage("The Workshop Storage is full."); return; }
    const nextIngredients = kind === "ingredient" ? ingredients.map((slot, i) => i === index ? null : slot) : ingredients;
    const nextTool = kind === "tool" ? null : tool; const nextResult = kind === "result" ? null : result;
    setStorage(added.slots); setIngredients(nextIngredients); setTool(nextTool); setResult(nextResult); await persist(added.slots, nextIngredients, nextTool, nextResult);
  }
  const recipe = useMemo(() => findCookingRecipe(ingredients, tool), [ingredients, tool]);
  async function craft() {
    if (!recipe) { setMessage("There is no recipe for that combination."); return; }
    if (result) { setMessage("Take the result first."); return; }
    if (!(recipe.toolId === null || recipe.toolId === "mortar_and_pestle" || recipe.toolId === "distiller")) { setMessage("This recipe cannot be made at this station yet."); return; }
    const nextIngredients = consumeRecipeIngredients(ingredients, recipe); if (!nextIngredients) return;
    const rawStats = await AsyncStorage.getItem(PLAYER_STATS_KEY);
    const currentEffectiveness = normalizePlayerStats(rawStats ? JSON.parse(rawStats) : null).effectiveness;
    setEffectiveness(currentEffectiveness);
    const output = Object.hasOwn(SCROLL_BASE_USES, recipe.outputId)
      ? createCraftedScroll(recipe.outputId, currentEffectiveness)
      : createRecipeOutputs(recipe, 1, 20, 0, tool)[0] ?? null;
    setIngredients(nextIngredients); setResult(output); await persist(storage, nextIngredients, tool, output);
    if (recipe.enhancementKind) setScrollActivationKey((current) => current + 1);
    if (!recipe.hiddenFromRecipeBook && !discovered.includes(recipe.id)) { const next = await discoverRecipe(recipe.id); setDiscovered(next); }
    setMessage(`${recipe.name} crafted.`);
  }
  const visibleRecipes = COOKING_RECIPES.filter((entry) => !entry.hiddenFromRecipeBook && discovered.includes(entry.id) && (category === "hand" ? entry.toolId === null : entry.toolId === category));

  return <View style={styles.root}>
    <SceneBackground source={BACKGROUND} topOffset={headerHeight} />
    <View style={[StyleSheet.absoluteFill, { top: headerHeight }, styles.overlay]} pointerEvents="none" />
    <TravelHeader locationName="Workshop" showPortraitRow onHeaderHeightChange={setHeaderHeight} refreshKey={refreshKey} bagContext="kitchen" onBagUpdated={setBag} onBagTransferItem={moveBagItem} />
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.panel}>
        <View style={styles.titleRow}><Text style={styles.title}>Crafting Workbench</Text><TouchableOpacity style={styles.bookButton} onPress={() => setBookOpen(true)}><Ionicons name="book-outline" size={22} color="#FFF1CB" /><Text style={styles.bookText}>Recipes</Text></TouchableOpacity></View>
        <View style={styles.craftRow}><View style={styles.ingredients}>{ingredients.map((item, index) => <ItemSlot key={index} item={item} label="Ingredient" onPress={item ? () => { void returnToStorage(item, "ingredient", index); } : undefined} />)}</View><Ionicons name="add" size={20} color="#C4943A" /><ItemSlot item={tool} label="Tool" onPress={tool ? () => { void returnToStorage(tool, "tool"); } : undefined} /><Ionicons name="arrow-forward" size={20} color="#C4943A" /><ItemSlot item={result ?? (recipe ? createRecipeOutputs(recipe, 1, 20, 0, tool, effectiveness)[0] : null)} label="Result" onPress={result ? () => { void returnToStorage(result, "result"); } : undefined} /></View>
        <TouchableOpacity style={[styles.craftButton, (!recipe || !!result) && styles.disabled]} disabled={!recipe || !!result} onPress={() => { void craft(); }}><Text style={styles.craftText}>CRAFT</Text></TouchableOpacity>
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
      <View style={styles.panel}><Text style={styles.title}>Workshop Storage</Text><View style={styles.storageGrid}>{storage.map((item, index) => <ItemSlot key={index} item={item} onPress={item ? () => setStorageActionIndex(index) : undefined} />)}</View></View>
      <TouchableOpacity style={styles.exitButton} onPress={() => router.replace("/outside-tavern")}><Ionicons name="exit-outline" size={20} color="#F5E6C8" /><Text style={styles.exitText}>Exit the Workshop</Text></TouchableOpacity>
    </ScrollView>
    <Modal visible={bookOpen} transparent animationType="fade" onRequestClose={() => setBookOpen(false)}><View style={styles.modalOverlay}><View style={styles.bookPanel}><View style={styles.titleRow}><Text style={styles.title}>Recipe Book</Text><TouchableOpacity onPress={() => setBookOpen(false)}><Ionicons name="close" size={26} color="#F5E6C8" /></TouchableOpacity></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>{TOOL_CATEGORIES.map((entry) => <TouchableOpacity key={entry.id} style={[styles.category, category === entry.id && styles.categoryActive]} onPress={() => setCategory(entry.id)}>{entry.image ? <Image source={entry.image} style={styles.categoryImage} resizeMode="contain" /> : <Ionicons name="hand-left-outline" size={28} color="#E4C882" />}<Text style={styles.categoryText}>{entry.label}</Text></TouchableOpacity>)}</ScrollView><ScrollView>{visibleRecipes.length ? visibleRecipes.map((entry) => <View key={entry.id} style={styles.recipeCard}><Text style={styles.recipeName}>{entry.name}</Text><Text style={styles.recipeDetail}>{entry.ingredients.map((ingredient) => `${ingredient.quantity}× ${ingredient.id.replaceAll("_", " ")}`).join(" + ")} → {entry.outputQuantity}× {entry.outputId.replaceAll("_", " ")}</Text></View>) : <Text style={styles.empty}>No discovered recipes for this tool.</Text>}</ScrollView></View></View></Modal>
    <Modal visible={storageActionIndex !== null} transparent animationType="fade" onRequestClose={() => setStorageActionIndex(null)}><View style={styles.modalOverlay}><View style={styles.itemActionPanel}><Text style={styles.title}>{storageActionIndex === null ? "Item" : storage[storageActionIndex]?.name}</Text><TouchableOpacity style={styles.craftButton} onPress={() => { const index = storageActionIndex; setStorageActionIndex(null); if (index !== null) void selectStorage(index); }}><Text style={styles.craftText}>Use at Workbench</Text></TouchableOpacity><TouchableOpacity style={styles.craftButton} onPress={() => { if (storageActionIndex !== null) void moveStorageToBag(storageActionIndex); }}><Text style={styles.craftText}>Move to Player Bag</Text></TouchableOpacity><TouchableOpacity style={styles.closeAction} onPress={() => setStorageActionIndex(null)}><Text style={styles.exitText}>Cancel</Text></TouchableOpacity></View></View></Modal>
    <ScrollActivationOverlay activationKey={scrollActivationKey} />
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#090501" }, overlay: { backgroundColor: "rgba(0,0,0,0.34)" }, content: { flexGrow: 1, padding: 14, gap: 12 }, panel: { borderRadius: 18, borderWidth: 1.5, borderColor: "rgba(196,148,58,0.65)", backgroundColor: "rgba(18,9,2,0.94)", padding: 13, gap: 12 }, titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }, title: { color: "#FFF1CB", fontFamily: "Oldenburg", fontSize: 17 }, bookButton: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, borderWidth: 1, borderColor: "#C4943A", backgroundColor: "rgba(112,73,18,0.85)", padding: 9 }, bookText: { color: "#FFF1CB", fontFamily: "Oldenburg", fontSize: 11 }, craftRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }, ingredients: { flexDirection: "row", gap: 4 }, slot: { width: 50, height: 58, borderRadius: 10, borderWidth: 1, borderColor: "rgba(196,148,58,0.48)", backgroundColor: "rgba(43,25,8,0.9)", alignItems: "center", justifyContent: "center" }, slotImage: { width: 43, height: 43 }, quantity: { position: "absolute", right: 4, bottom: 2, color: "#FFF", fontFamily: "Oldenburg", fontSize: 10, backgroundColor: "rgba(0,0,0,0.72)", borderRadius: 7, paddingHorizontal: 4 }, slotLabel: { color: "rgba(240,232,213,0.45)", fontSize: 7, textAlign: "center" }, craftButton: { minHeight: 48, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#79521D", borderWidth: 1.5, borderColor: "#E4C882" }, craftText: { color: "#FFF7E5", fontFamily: "Oldenburg", fontSize: 15 }, disabled: { opacity: 0.38 }, message: { color: "#E4C882", fontSize: 12, textAlign: "center" }, storageGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 7 }, exitButton: { minHeight: 52, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "rgba(18,9,2,0.95)", borderWidth: 1.5, borderColor: "rgba(196,148,58,0.62)" }, exitText: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 13 }, modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.82)", alignItems: "center", justifyContent: "center", padding: 14 }, bookPanel: { width: "100%", maxWidth: 470, maxHeight: "84%", borderRadius: 18, borderWidth: 1.5, borderColor: "#C4943A", backgroundColor: "#180D04", padding: 14, gap: 12 }, itemActionPanel: { width: "100%", maxWidth: 360, borderRadius: 18, borderWidth: 1.5, borderColor: "#C4943A", backgroundColor: "#180D04", padding: 16, gap: 11 }, closeAction: { minHeight: 42, alignItems: "center", justifyContent: "center" }, categories: { gap: 8 }, category: { width: 92, minHeight: 92, alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 11, borderWidth: 1, borderColor: "rgba(196,148,58,0.3)", backgroundColor: "rgba(48,27,7,0.72)", padding: 7 }, categoryActive: { borderColor: "#E4C882", backgroundColor: "rgba(112,73,18,0.88)" }, categoryImage: { width: 42, height: 42 }, categoryText: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 9, textAlign: "center" }, recipeCard: { padding: 12, borderRadius: 11, backgroundColor: "rgba(48,27,7,0.75)", borderWidth: 1, borderColor: "rgba(196,148,58,0.3)", marginBottom: 8 }, recipeName: { color: "#FFF1CB", fontFamily: "Oldenburg", fontSize: 13 }, recipeDetail: { color: "#C7B99D", fontSize: 11, lineHeight: 17, marginTop: 5, textTransform: "capitalize" }, empty: { color: "#BAA986", textAlign: "center", padding: 22 },
});
