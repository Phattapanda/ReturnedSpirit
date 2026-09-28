import React, { useCallback, useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Modal,
  Pressable,
  ScrollView,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { requireOptionalNativeModule } from "expo-modules-core";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAudioManager } from "@/src/audio/AudioProvider";
import { audioEngine, getRandomMainMenuTheme } from "@/src/audio/audioEngine";
import StartingPackageStoreBridge from "@/src/components/starting-package-store-bridge";
import PurchaseIconShine from "@/src/components/purchase-icon-shine";
import { ownsStartingPackage, ownsHarvestPackage, HARVEST_PACKAGE_PRODUCT_ID } from "@/src/game/starting-package-purchase";

import MenuAttentionPulse from "@/src/components/menu-attention-pulse";

const BG = require("../assets/images/mainpage.png");
const LETTER_UNREAD = require("../assets/images/letter.png");
const LETTER_READ = require("../assets/images/letter_open.png");
const STARTING_PACKAGE = require("../assets/images/startingpackage7days.png");
const HARVEST_PACKAGE = require("../assets/images/harvest_sung.png");
const STARTUP_MAIN_MENU_THEME = getRandomMainMenuTheme();
const EARLY_ACCESS_READ_KEY = "@main-menu:early-access-read";
const EARLY_ACCESS_HIDDEN_KEY = "@main-menu:early-access-do-not-show";
const TESTER_GIFT_READ_KEY = "@main-menu:tester-gift-read";
const STARTING_VIEWED_KEY = "@main-menu:starting-package-viewed";
const HARVEST_VIEWED_KEY = "@main-menu:harvest-package-viewed";
// Show once per app session, not each time the player returns to the menu.
let earlyAccessDismissed = false;
const NATIVE_IAP_AVAILABLE = (process.env.EXPO_OS === "android" || process.env.EXPO_OS === "ios")
  && requireOptionalNativeModule("ExpoIap") !== null;

const MENU_ITEMS = [
  { id: "new-game", label: "New Game", icon: "sword-cross" as const },
  { id: "load-game", label: "Load Game", icon: "bookmark-multiple-outline" as const },
  { id: "settings", label: "Settings", icon: "cog-outline" as const },
  { id: "support", label: "Support", icon: "email-outline" as const },
];

export default function MainMenu() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [showEarlyAccess, setShowEarlyAccess] = useState(false);
  const [earlyAccessRead, setEarlyAccessRead] = useState(false);
  const [doNotShowEarlyAccess, setDoNotShowEarlyAccess] = useState(false);
  const [showTesterGift, setShowTesterGift] = useState(false);
  const [testerGiftRead, setTesterGiftRead] = useState(false);
  const [showStartingPackage, setShowStartingPackage] = useState(false);
  const [startingPackageOwned, setStartingPackageOwned] = useState(false);
  const [storeConnected, setStoreConnected] = useState(false);
  const [storePrice, setStorePrice] = useState<string>();
  const [purchaseRequest, setPurchaseRequest] = useState(0);
  const [purchasePending, setPurchasePending] = useState(false);
  const [purchaseError, setPurchaseError] = useState("");

  const handleStoreStatus = useCallback((status: { connected: boolean; displayPrice?: string }) => {
    setStoreConnected(status.connected);
    setStorePrice(status.displayPrice);
  }, []);
  const handleStartingPackageOwned = useCallback(() => {
    setStartingPackageOwned(true);
    setPurchasePending(false);
    setPurchaseError("");
  }, []);
  const handlePurchaseError = useCallback((message: string) => {
    setPurchasePending(false);
    setPurchaseError(message);
  }, []);

  const [showHarvestPackage, setShowHarvestPackage] = useState(false);
  const [harvestPackageOwned, setHarvestPackageOwned] = useState(false);
  const [harvestStoreConnected, setHarvestStoreConnected] = useState(false);
  const [harvestStorePrice, setHarvestStorePrice] = useState<string>();
  const [harvestPurchaseRequest, setHarvestPurchaseRequest] = useState(0);
  const [harvestPurchasePending, setHarvestPurchasePending] = useState(false);
  const [harvestPurchaseError, setHarvestPurchaseError] = useState("");

  const handleHarvestStoreStatus = useCallback((status: { connected: boolean; displayPrice?: string }) => {
    setHarvestStoreConnected(status.connected);
    setHarvestStorePrice(status.displayPrice);
  }, []);
  const handleHarvestPackageOwned = useCallback(() => {
    setHarvestPackageOwned(true);
    setHarvestPurchasePending(false);
    setHarvestPurchaseError("");
  }, []);
  const handleHarvestPurchaseError = useCallback((message: string) => {
    setHarvestPurchasePending(false);
    setHarvestPurchaseError(message);
  }, []);

  const [startingViewed, setStartingViewed] = useState(true);
  const [harvestViewed, setHarvestViewed] = useState(true);
  const [attentionReady, setAttentionReady] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pulseTarget, setPulseTarget] = useState<number | null>(null);
  const pulsed = useRef(new Set<number>());
  useFocusEffect(useCallback(() => {
    pulsed.current.clear();
    setFocused(true);
    return () => { setFocused(false); setPulseTarget(null); };
  }, []));
  useEffect(() => {
    if (!focused || !attentionReady || showEarlyAccess || showTesterGift || showStartingPackage || showHarvestPackage) {
      setPulseTarget(null);
      return;
    }
    const eligible = [!earlyAccessRead, !testerGiftRead, !startingViewed && !startingPackageOwned, !harvestViewed && !harvestPackageOwned];
    const queue = eligible.map((value, index) => value && !pulsed.current.has(index) ? index : -1).filter(index => index >= 0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    queue.forEach((index, order) => {
      timers.push(setTimeout(() => { pulsed.current.add(index); setPulseTarget(index); }, 500 + order * 1000));
    });
    timers.push(setTimeout(() => setPulseTarget(null), 500 + queue.length * 1000));
    return () => { timers.forEach(clearTimeout); setPulseTarget(null); };
  }, [focused, attentionReady, showEarlyAccess, showTesterGift, showStartingPackage, showHarvestPackage, earlyAccessRead, testerGiftRead, startingViewed, harvestViewed, startingPackageOwned, harvestPackageOwned]);

  function markEarlyAccessRead() {
    setEarlyAccessRead(true);
    void AsyncStorage.setItem(EARLY_ACCESS_READ_KEY, "true").catch(() => {});
  }

  function openEarlyAccess() {
    markEarlyAccessRead();
    setShowEarlyAccess(true);
  }

  function dismissEarlyAccess() {
    earlyAccessDismissed = true;
    setShowEarlyAccess(false);
  }

  function openTesterGift() {
    setTesterGiftRead(true);
    setShowTesterGift(true);
    void AsyncStorage.setItem(TESTER_GIFT_READ_KEY, "true").catch(() => {});
  }

  function toggleEarlyAccessPreference() {
    const next = !doNotShowEarlyAccess;
    setDoNotShowEarlyAccess(next);
    void AsyncStorage.setItem(EARLY_ACCESS_HIDDEN_KEY, String(next)).catch(() => {});
  }

  useEffect(() => {
    let active = true;

    AsyncStorage.multiGet([EARLY_ACCESS_READ_KEY, EARLY_ACCESS_HIDDEN_KEY, TESTER_GIFT_READ_KEY, STARTING_VIEWED_KEY, HARVEST_VIEWED_KEY])
      .then((entries) => {
        if (!active) return;
        const hasRead = entries[0][1] === "true";
        const isHidden = entries[1][1] === "true";
        const hasReadTesterGift = entries[2][1] === "true";
        setStartingViewed(entries[3][1] === "true");
        setHarvestViewed(entries[4][1] === "true");
        setAttentionReady(true);
        setEarlyAccessRead(hasRead);
        setDoNotShowEarlyAccess(isHidden);
        setTesterGiftRead(hasReadTesterGift);

        if (!isHidden && !earlyAccessDismissed) {
          setShowEarlyAccess(true);
          setEarlyAccessRead(true);
          void AsyncStorage.setItem(EARLY_ACCESS_READ_KEY, "true").catch(() => {});
        }
      })
      .catch(() => {
        if (!active || earlyAccessDismissed) return;
        setShowEarlyAccess(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void ownsStartingPackage().then(setStartingPackageOwned).catch(() => {});
    void ownsHarvestPackage().then(setHarvestPackageOwned).catch(() => {});
  }, []);

  // Audio: play the startup's randomly selected main menu theme immediately (no crossfade)
  // We use audioEngine directly so we can await unlockAudio() before crossfadeTo.
  // On native (Expo Go / device) there are no browser autoplay restrictions, so
  // unlocking on mount is correct and starts the theme right away.
  const audioManager = useAudioManager();
  useEffect(() => {
    (async () => {
      await audioEngine.unlockAudio();
      audioEngine.crossfadeTo(STARTUP_MAIN_MENU_THEME, 0);
    })();
  }, []);

  // Unlock audio + navigate on menu item press
  function handleMenuPress(id: string) {
    audioManager.unlockAudio();
    router.push(`/${id}` as any);
  }

  return (
    <View style={styles.root}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <Image
        source={BG}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition="top center"
      />
      {NATIVE_IAP_AVAILABLE ? (
        <StartingPackageStoreBridge
          purchaseRequest={purchaseRequest}
          onStatus={handleStoreStatus}
          onOwned={handleStartingPackageOwned}
          onError={handlePurchaseError}
        />
      ) : null}
      {NATIVE_IAP_AVAILABLE ? (
        <StartingPackageStoreBridge productId={HARVEST_PACKAGE_PRODUCT_ID}
          purchaseRequest={harvestPurchaseRequest}
          onStatus={handleHarvestStoreStatus}
          onOwned={handleHarvestPackageOwned}
          onError={handleHarvestPurchaseError}
        />
      ) : null}
      <View style={[styles.buttons, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.topActions}>
          <View style={styles.mailButtons}>
          <MenuAttentionPulse active={pulseTarget === 0}>
          <TouchableOpacity
            testID="early-access-mail-button"
            accessibilityRole="button"
            accessibilityLabel="Open Early Access message"
            style={styles.mailButton}
            onPress={openEarlyAccess}
            activeOpacity={0.78}
          >
            <Image
              source={earlyAccessRead ? LETTER_READ : LETTER_UNREAD}
              style={styles.mailIcon}
              contentFit="contain"
            />
          </TouchableOpacity>
          </MenuAttentionPulse>
          <MenuAttentionPulse active={pulseTarget === 1}>
          <TouchableOpacity
            testID="tester-gift-mail-button"
            accessibilityRole="button"
            accessibilityLabel="Open thank-you message for testers"
            style={styles.mailButton}
            onPress={openTesterGift}
            activeOpacity={0.78}
          >
            <Image
              source={testerGiftRead ? LETTER_READ : LETTER_UNREAD}
              style={styles.mailIcon}
              contentFit="contain"
            />
          </TouchableOpacity>
          </MenuAttentionPulse>
          </View>
          <View style={styles.mailButtons}>
          <MenuAttentionPulse active={pulseTarget === 2}>
          <TouchableOpacity
            testID="starting-package-button"
            accessibilityRole="button"
            accessibilityLabel="Open 7-Day Starting Package offer"
            style={styles.startingPackageButton}
            onPress={() => { setStartingViewed(true); void AsyncStorage.setItem(STARTING_VIEWED_KEY, "true").catch(() => {}); setPurchaseError(""); setShowStartingPackage(true); }}
            activeOpacity={0.78}
          >
            <Image source={STARTING_PACKAGE} style={styles.startingPackageIcon} contentFit="contain" />
            <PurchaseIconShine />
          </TouchableOpacity>
          </MenuAttentionPulse>
          <MenuAttentionPulse active={pulseTarget === 3}>
          <TouchableOpacity
            testID="harvest-package-button"
            accessibilityRole="button"
            accessibilityLabel="Open Harvest Sun Package offer"
            style={styles.startingPackageButton}
            onPress={() => { setHarvestViewed(true); void AsyncStorage.setItem(HARVEST_VIEWED_KEY, "true").catch(() => {}); setHarvestPurchaseError(""); setShowHarvestPackage(true); }}
            activeOpacity={0.78}
          >
            <Image source={HARVEST_PACKAGE} style={styles.startingPackageIcon} contentFit="contain" />
            <PurchaseIconShine delay={3700} />
          </TouchableOpacity>
          </MenuAttentionPulse>
          </View>
        </View>
        {MENU_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.id}
            testID={`main-menu-${item.id}`}
            style={styles.btn}
            onPress={() => handleMenuPress(item.id)}
            activeOpacity={0.75}
          >
            <MaterialCommunityIcons name={item.icon} size={22} color="#C4943A" />
            <Text style={styles.btnText}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.45)" />
          </TouchableOpacity>
        ))}
        <Text testID="version-text" style={styles.version}>
          v1.0.6 · local save
        </Text>
      </View>
      <Modal visible={showEarlyAccess} transparent animationType="fade" onRequestClose={dismissEarlyAccess}>
        <View style={[styles.noticeOverlay, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
          <Pressable testID="early-access-backdrop" accessibilityRole="button" accessibilityLabel="Close Early Access notice" style={StyleSheet.absoluteFill} onPress={dismissEarlyAccess} />
          <View accessibilityViewIsModal style={styles.noticePanel}>
            <View style={styles.noticeHeader}>
              <Text selectable accessibilityRole="header" style={styles.noticeTitle}>Early Access</Text>
              <Pressable testID="early-access-close" accessibilityRole="button" accessibilityLabel="Close Early Access notice" onPress={dismissEarlyAccess} style={styles.noticeClose}>
                <Text style={styles.noticeCloseText}>×</Text>
              </Pressable>
            </View>
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 16 }}>
              <Text selectable style={styles.noticeText}><Text style={{ fontStyle: "italic" }}>A Returned Spirit</Text> is still in <Text style={{ fontWeight: "700" }}>Early Access</Text> and is actively being developed.</Text>
              <Text selectable style={styles.noticeText}>New content, features and improvements will be added regularly.</Text>
              <Text selectable style={styles.noticeText}>If you encounter any bugs or problems, please let me know using the <Text style={{ fontWeight: "700" }}>Support</Text> button.</Text>
              <Text selectable style={styles.noticeText}>Thank you for playing and helping improve the game! ❤️</Text>
            </ScrollView>
            <Pressable
              testID="early-access-do-not-show"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: doNotShowEarlyAccess }}
              onPress={toggleEarlyAccessPreference}
              style={styles.noticePreference}
            >
              <View style={[styles.noticeCheckbox, doNotShowEarlyAccess && styles.noticeCheckboxChecked]}>
                {doNotShowEarlyAccess ? <Ionicons name="checkmark" size={17} color="#1A0F00" /> : null}
              </View>
              <Text style={styles.noticePreferenceText}>Do not show this message again</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={showTesterGift} transparent animationType="fade" onRequestClose={() => setShowTesterGift(false)}>
        <View style={[styles.noticeOverlay, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
          <Pressable
            testID="tester-gift-backdrop"
            accessibilityRole="button"
            accessibilityLabel="Close tester thank-you message"
            style={StyleSheet.absoluteFill}
            onPress={() => setShowTesterGift(false)}
          />
          <View accessibilityViewIsModal style={styles.noticePanel}>
            <View style={styles.noticeHeader}>
              <Text selectable accessibilityRole="header" style={styles.noticeTitle}>Thank You for Testing</Text>
              <Pressable
                testID="tester-gift-close"
                accessibilityRole="button"
                accessibilityLabel="Close tester thank-you message"
                onPress={() => setShowTesterGift(false)}
                style={styles.noticeClose}
              >
                <Text style={styles.noticeCloseText}>×</Text>
              </Pressable>
            </View>
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 16 }}>
              <Text selectable style={styles.noticeText}>
                As a little thank-you for testing, use the code{" "}
                <Text style={styles.bonusCode}>welcometraveller</Text> in-game to receive
              </Text>
              <Text selectable style={[styles.noticeText, styles.rewardText]}>
                1 Silver Coin + 3× Low Grade Stamina Potions. 🎁
              </Text>
              <Text selectable style={styles.noticeText}>More updates are already on the way!</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal visible={showStartingPackage} transparent animationType="fade" onRequestClose={() => setShowStartingPackage(false)}>
        <View style={[styles.noticeOverlay, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowStartingPackage(false)} />
          <View accessibilityViewIsModal style={styles.noticePanel}>
            <View style={styles.noticeHeader}>
              <Text selectable accessibilityRole="header" style={styles.noticeTitle}>7-Day Starting Package</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close offer" onPress={() => setShowStartingPackage(false)} style={styles.noticeClose}>
                <Text style={styles.noticeCloseText}>×</Text>
              </Pressable>
            </View>
            <Image source={STARTING_PACKAGE} style={styles.offerImage} contentFit="contain" />
            <Text selectable style={styles.noticeText}>Receive 1 Silver Coin per in-game day for 7 days.</Text>
            <Text selectable style={styles.noticeText}>This permanent purchase applies to every save slot and starts again with every new run.</Text>
            {purchaseError ? <Text selectable style={styles.purchaseError}>{purchaseError}</Text> : null}
            <TouchableOpacity
              testID="buy-starting-package"
              disabled={startingPackageOwned || purchasePending || !NATIVE_IAP_AVAILABLE || !storeConnected || !storePrice}
              style={[styles.purchaseButton, (startingPackageOwned || purchasePending || !NATIVE_IAP_AVAILABLE || !storeConnected || !storePrice) && styles.purchaseButtonDisabled]}
              onPress={() => { setPurchasePending(true); setPurchaseError(""); setPurchaseRequest((value) => value + 1); }}
            >
              <Text style={styles.purchaseButtonText}>
                {startingPackageOwned ? "Purchased" : purchasePending ? "Processing…" : storePrice ? `Buy for ${storePrice}` : NATIVE_IAP_AVAILABLE ? "Store product unavailable" : "Available in a store build"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal visible={showHarvestPackage} transparent animationType="fade" onRequestClose={() => setShowHarvestPackage(false)}>
        <View style={[styles.noticeOverlay, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowHarvestPackage(false)} />
          <View accessibilityViewIsModal style={styles.noticePanel}>
            <View style={styles.noticeHeader}>
              <Text selectable accessibilityRole="header" style={styles.noticeTitle}>Harvest Sun Package</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close offer" onPress={() => setShowHarvestPackage(false)} style={styles.noticeClose}>
                <Text style={styles.noticeCloseText}>×</Text>
              </Pressable>
            </View>
            <Image source={HARVEST_PACKAGE} style={styles.offerImage} contentFit="contain" />
            <Text selectable style={styles.noticeText}>Receive 3 of every seed and 20 of every fertilizer. Claim your supplies in the Mailbox; they go directly to Garden Storage.</Text>
            <Text selectable style={styles.noticeText}>One-time purchase: €1.99 (local store price applies). Claim once per save slot and per run.</Text>
            {harvestPurchaseError ? <Text selectable style={styles.purchaseError}>{harvestPurchaseError}</Text> : null}
            <TouchableOpacity
              testID="buy-harvest-package"
              disabled={harvestPackageOwned || harvestPurchasePending || !NATIVE_IAP_AVAILABLE || !harvestStoreConnected || !harvestStorePrice}
              style={[styles.purchaseButton, (harvestPackageOwned || harvestPurchasePending || !NATIVE_IAP_AVAILABLE || !harvestStoreConnected || !harvestStorePrice) && styles.purchaseButtonDisabled]}
              onPress={() => { setHarvestPurchasePending(true); setHarvestPurchaseError(""); setHarvestPurchaseRequest((value) => value + 1); }}
            >
              <Text style={styles.purchaseButtonText}>
                {harvestPackageOwned ? "Purchased" : harvestPurchasePending ? "Processing…" : harvestStorePrice ? `Buy for ${harvestStorePrice}` : NATIVE_IAP_AVAILABLE ? "Store product unavailable" : "Available in a store build"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#1a0d05", overflow: "hidden" },
  noticeOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  noticePanel: { width: "100%", maxWidth: 480, maxHeight: "90%", backgroundColor: "#1A0F00", borderColor: "#C4943A", borderWidth: 1.5, borderRadius: 18, padding: 24, gap: 18 },
  noticeHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  noticeTitle: { flex: 1, color: "#C4943A", fontSize: 24, fontWeight: "700", fontFamily: "Oldenburg" },
  noticeClose: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  noticeCloseText: { color: "#F5EDD8", fontSize: 32 },
  noticeText: { color: "#F5EDD8", fontSize: 16, lineHeight: 25 },
  noticePreference: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  noticeCheckbox: { width: 24, height: 24, borderRadius: 5, borderWidth: 1.5, borderColor: "#C4943A", alignItems: "center", justifyContent: "center" },
  noticeCheckboxChecked: { backgroundColor: "#C4943A" },
  noticePreferenceText: { flex: 1, color: "#F5EDD8", fontSize: 15, lineHeight: 21 },
  bonusCode: { color: "#F5D98A", fontWeight: "700", fontFamily: "monospace" },
  rewardText: { fontWeight: "700" },
  buttons: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    gap: 10,
  },
  mailButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: "rgba(196, 148, 58, 0.78)",
    backgroundColor: "rgba(15, 8, 2, 0.88)",
    alignItems: "center",
    justifyContent: "center",
  },
  mailButtons: { alignItems: "flex-start", gap: 8 },
  mailIcon: { width: 48, height: 48 },
  topActions: { width: "100%", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  startingPackageButton: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: "#E9D8B5", overflow: "hidden", backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  startingPackageIcon: { width: 56, height: 56 },
  offerImage: { width: 112, height: 112, alignSelf: "center" },
  purchaseError: { color: "#FFB5A8", fontSize: 14, lineHeight: 20 },
  purchaseButton: { minHeight: 50, borderRadius: 12, backgroundColor: "#A66B20", alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  purchaseButtonDisabled: { opacity: 0.48 },
  purchaseButtonText: { color: "#FFF7E7", fontSize: 16, fontWeight: "700", fontFamily: "Oldenburg", textAlign: "center" },
  btn: {
    backgroundColor: "rgba(15, 8, 2, 0.82)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(180, 140, 60, 0.35)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 16,
  },
  btnText: {
    flex: 1,
    color: "#F5EDD8",
    fontSize: 17,
    fontFamily: "Oldenburg",
    letterSpacing: 0.3,
  },
  version: {
    textAlign: "center",
    color: "rgba(255,255,255,0.38)",
    fontSize: 12,
    marginTop: 2,
  },
});
