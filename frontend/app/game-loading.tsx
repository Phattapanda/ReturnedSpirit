/**
 * game-loading.tsx – Fullscreen loading screen shown once per session entry.
 *
 * Triggered by:
 *  - "New Game" (from new-game.tsx)
 *  - "Continue" / slot load (from load-game.tsx)
 *
 * Does NOT appear during normal in-game room transitions
 * (Kitchen ↔ Garden ↔ Dormitory, Bag, Menu, Logbook, Dialogs).
 *
 * Loading steps:
 *  1. Restore gameplay snapshot (for load-game only)
 *  2. Preload ALL gameplay image assets (load + web-decode)
 *  3. Warm up AudioEngine (initialize + settings load)
 *  4. Ensure minimum display time (~650 ms) to prevent a flash
 *  5. Navigate to destination (/intro for new-game, /kitchen for load-game)
 *
 * Error path:
 *  If critical assets (herbsoup, herbbag, bucket, bucketwater, portraits, bg_kitchen)
 *  fail to load, show a Retry / Main Menu screen.
 *
 * Architecture constraints:
 *  - Uses AssetManager.preloadGameplayAssets() – no second image loader.
 *  - Uses audioEngine.prepareForGameplay() – no second audio system.
 *  - NEVER triggers a gameplay save (checkpoints are only created by sleep / manual save).
 *  - Progress value is derived from real asset load events (no fake timer).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated as RNAnimated,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  CRITICAL_ASSET_KEYS,
  preloadGameplayAssets,
} from "@/src/assets/AssetManager";
import { restoreFromSnapshot } from "@/src/game/save-manager";
import { audioEngine } from "@/src/audio/audioEngine";
// ─── Constants ────────────────────────────────────────────────────────────────

const BG = require("../assets/images/bg-tavern.jpg");
const MIN_DISPLAY_MS = 650; // prevent sub-second flash when cache is warm

const LOADING_TIPS = [
  "Preparing the tavern...",
  "Packing your shoulder bag...",
  "Lighting the fireplace...",
  "Tending the garden...",
  "Brewing herb soup...",
  "Waking the spirit...",
  "Setting the table...",
  "Checking the herb beds...",
  "Fetching water from the well...",
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function GameLoading() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();

  const params = useLocalSearchParams<{
    from: string;
    slotId: string;
    characterName?: string;
  }>();

  // ── State
  const [progress, setProgress] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const [hasFailed, setHasFailed] = useState(false);
  const [failedKeys, setFailedKeys] = useState<string[]>([]);
  const [retryCount, setRetryCount] = useState(0);

  // Animated progress bar (RN Animated, not Reanimated – simpler for loading screen)
  const progressAnim = useRef(new RNAnimated.Value(0)).current;

  // ── Sync progress bar animation
  useEffect(() => {
    RNAnimated.timing(progressAnim, {
      toValue: progress,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [progress, progressAnim]);

  // ── Rotate tip text
  useEffect(() => {
    const t = setInterval(() => {
      setTipIndex(i => (i + 1) % LOADING_TIPS.length);
    }, 1900);
    return () => clearInterval(t);
  }, []);

  // ── Main loading effect
  useEffect(() => {
    const slotId = params.slotId ? parseInt(params.slotId, 10) : 1;
    const startTime = Date.now();
    const failures: string[] = [];
    let cancelled = false;

    const run = async () => {
      // 1. Restore gameplay snapshot (load-game only)
      //    Must happen BEFORE kitchen.tsx mounts and reads AsyncStorage.
      if (params.from === "load-game") {
        try {
          await restoreFromSnapshot(slotId);
        } catch (e) {
          if (__DEV__) console.error("[GameLoading] restoreFromSnapshot failed:", e);
        }
      }
      if (cancelled) return;

      // 2. Preload all gameplay images
      await preloadGameplayAssets(
        (loaded, total) => {
          if (!cancelled) setProgress(loaded / total);
        },
        (key) => {
          failures.push(key);
          if (__DEV__) console.error("[GameLoading] Failed to preload asset:", key);
        },
      );
      if (cancelled) return;

      // 3. Warm up AudioEngine
      try {
        await audioEngine.prepareForGameplay();
      } catch {
        // Non-blocking — audio will still work, just slightly delayed first play
      }
      if (cancelled) return;

      // 4. Check for critical asset failures
      const critFailed = failures.filter(k => CRITICAL_ASSET_KEYS.includes(k));
      if (critFailed.length > 0) {
        setFailedKeys(critFailed);
        setHasFailed(true);
        return;
      }

      // 5. Honour minimum display time
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);
      if (remaining > 0) {
        await new Promise<void>(r => setTimeout(r, remaining));
      }
      if (cancelled) return;

      // 6. Mark 100% and navigate
      setProgress(1);
      // Small tick so the bar reaches 100% visually before navigation
      await new Promise<void>(r => setTimeout(r, 120));
      if (cancelled) return;

      // Stop Main Page-Theme immediately before gameplay audio takes over
      // (new-game → intro has no music; load-game → kitchen will crossfade to Kitchen-Theme)
      audioEngine.stopGameplayMusic(0);

      if (params.from === "new-game") {
        router.replace({
          pathname: "/intro",
          params: {
            characterName: params.characterName ?? "",
            slotId: params.slotId ?? "1",
          },
        });
      } else {
        router.replace("/kitchen");
      }
    };

    run().catch(e => {
      if (__DEV__) console.error("[GameLoading] Fatal error:", e);
      if (!cancelled) setHasFailed(true);
    });

    return () => {
      cancelled = true;
    };
    // retryCount is intentional dep for retry support
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryCount]);

  // ── Retry handler
  const handleRetry = useCallback(() => {
    setHasFailed(false);
    setFailedKeys([]);
    setProgress(0);
    progressAnim.setValue(0);
    setRetryCount(c => c + 1);
  }, [progressAnim]);

  // ── Interpolated bar width
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const pct = Math.round(progress * 100);
  const barW = Math.min(W * 0.75, 320);

  // ── Error screen
  if (hasFailed) {
    return (
      <View style={styles.root}>
        <Image source={BG} style={styles.bgImg} resizeMode="cover" resizeMethod="resize" />
        <View style={styles.overlay} />
        <View style={[styles.center, { paddingBottom: insets.bottom + 32 }]}>
          <Text style={styles.title}>A Returned Spirit</Text>
          <View style={styles.ornament}>
            <View style={styles.ornLine} />
            <Text style={styles.ornDot}>⋄</Text>
            <View style={styles.ornLine} />
          </View>
          <Text style={styles.errorTitle}>Assets could not be loaded</Text>
          {failedKeys.length > 0 && (
            <Text style={styles.errorDetail}>{failedKeys.join(", ")}</Text>
          )}
          <View style={styles.errorBtns}>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={handleRetry}
              activeOpacity={0.8}
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.mainMenuBtn}
              onPress={() => router.replace("/")}
              activeOpacity={0.8}
            >
              <Text style={styles.mainMenuText}>Main Menu</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ── Loading screen
  return (
    <View style={styles.root}>
      <Image source={BG} style={styles.bgImg} resizeMode="cover" resizeMethod="resize" />
      <View style={styles.overlay} />

      <View style={[styles.center, { paddingBottom: insets.bottom + 32 }]}>
        {/* Title */}
        <Text style={styles.title}>A Returned Spirit</Text>
        <Text style={styles.subtitle}>Tavern Crafting RPG</Text>

        {/* Ornamental separator */}
        <View style={styles.ornament}>
          <View style={styles.ornLine} />
          <Text style={styles.ornDot}>⋄</Text>
          <View style={styles.ornLine} />
        </View>

        {/* Progress bar */}
        <View style={[styles.progressBg, { width: barW }]}>
          <RNAnimated.View
            style={[styles.progressFill, { width: progressWidth }]}
          />
        </View>

        {/* Percentage */}
        <Text style={styles.pctText}>{pct}%</Text>

        {/* Rotating tip */}
        <Text style={styles.tipText}>{LOADING_TIPS[tipIndex]}</Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0D0806",
  },
  bgImg: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.14,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.60)",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 14,
  },

  // Title
  title: {
    fontFamily: "Oldenburg",
    fontSize: 30,
    color: "#E8D4A2",
    textAlign: "center",
    letterSpacing: 1.2,
  },
  subtitle: {
    fontFamily: "Oldenburg",
    fontSize: 13,
    color: "#A08852",
    textAlign: "center",
    letterSpacing: 2.5,
    textTransform: "uppercase",
    marginTop: -6,
  },

  // Ornament
  ornament: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 6,
  },
  ornLine: {
    width: 56,
    height: 1,
    backgroundColor: "#4A3018",
  },
  ornDot: {
    color: "#C4943A",
    fontSize: 16,
    lineHeight: 18,
  },

  // Progress bar
  progressBg: {
    height: 10,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 5,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(196,148,58,0.25)",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#C4943A",
    borderRadius: 5,
  },
  pctText: {
    fontFamily: "Oldenburg",
    fontSize: 14,
    color: "#C4943A",
    textAlign: "center",
    marginTop: -2,
  },
  tipText: {
    fontSize: 13,
    color: "#6B5535",
    textAlign: "center",
    fontStyle: "italic",
    marginTop: 6,
  },

  // Error state
  errorTitle: {
    color: "#E8C4A0",
    fontSize: 17,
    textAlign: "center",
    fontFamily: "Oldenburg",
    marginTop: 8,
  },
  errorDetail: {
    color: "#6B5535",
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
    paddingHorizontal: 16,
  },
  errorBtns: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  retryBtn: {
    backgroundColor: "#C4943A",
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 28,
  },
  retryText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
    fontFamily: "Oldenburg",
  },
  mainMenuBtn: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 22,
    borderWidth: 1,
    borderColor: "rgba(196,148,58,0.25)",
  },
  mainMenuText: {
    color: "#C8B888",
    fontSize: 15,
    fontFamily: "Oldenburg",
  },
});
