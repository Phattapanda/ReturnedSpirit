import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Image,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer } from "expo-audio";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Constants ───────────────────────────────────────────────────────────────

const TYPING_MS = 44;
const FADE_IN_MS = 1600;
const FADE_OUT_MS = 850;
const BLACK_HOLD_MS = 3200; // hold after text complete before fading
const KNOCK_OFFSET_MS = 500; // delay before knock plays after text done
const KNOCK_DURATION_MS = 2700; // estimated knock sound duration
const BUBBLE_TO_DIALOG_MS = 1300;

// ─── Assets ──────────────────────────────────────────────────────────────────

const IMGS = {
  i1: require("../assets/images/intro1.jpg"),
  i2: require("../assets/images/intro2.jpg"),
  i3: require("../assets/images/intro3.jpg"),
  i4: require("../assets/images/intro4.jpg"),
};

// ─── Portrait system ──────────────────────────────────────────────────────────

export type PortraitVariant = "rupert" | "rupertsad" | "rupertlaugh" | "avatar1_tired";

const PORTRAITS: Record<PortraitVariant, unknown> = {
  rupert: require("../assets/images/rupert.png"),
  rupertsad: require("../assets/images/rupertsad.png"),
  rupertlaugh: require("../assets/images/rupertlaugh.png"),
  avatar1_tired: require("../assets/images/avatar1_tired.png"),
};

const SOUNDS = {
  walking: require("../assets/audio/walkingslowondirt.mp3"),
  footsteps: require("../assets/audio/slowfootsteps.mp3"),
  breathing: require("../assets/audio/heavy-breathing.mp3"),
  dragging: require("../assets/audio/dragging-on-floor.mp3"),
  doorclose: require("../assets/audio/door-close.mp3"),
  birds: require("../assets/audio/morning-birds.mp3"),
  knock: require("../assets/audio/knock.mp3"),
  tap: require("../assets/audio/tap.wav"),
  walkingwood: require("../assets/audio/walking-on-wood.mp3"),
};

// ─── Dialog system ───────────────────────────────────────────────────────────

export type DialogPhase =
  | "awake"
  | "rupert_1"
  | "rupert_2"
  | "choice_main"
  | "look_1"
  | "look_2"
  | "look_3"
  | "look_4"
  | "choice_down";

type Choice = { label: string; nextPhase: DialogPhase | "kitchen" };
type DialogEntry = {
  phase: DialogPhase;
  portrait: PortraitVariant;
  speakerName: string | null;
  text: string | null;
  choices?: Choice[];
};

const DIALOG_ADVANCE: Partial<Record<DialogPhase, DialogPhase>> = {
  awake: "rupert_1",
  rupert_1: "rupert_2",
  rupert_2: "choice_main",
  look_1: "look_2",
  look_2: "look_3",
  look_3: "look_4",
  look_4: "choice_down",
};

const DIALOG_FLOW: DialogEntry[] = [
  {
    phase: "awake",
    portrait: "rupertlaugh",
    speakerName: "Old Innkeeper",
    text: '"Are you awake?"',
  },
  {
    phase: "rupert_1",
    portrait: "rupert",
    speakerName: "Old Innkeeper",
    text: '"I found you collapsed before my door and got you inside as best as possible."',
  },
  {
    phase: "rupert_2",
    portrait: "rupert",
    speakerName: "Old Innkeeper",
    text: '"You don\'t seem to be injured. Come down to the kitchen - I made you some soup."',
  },
  {
    phase: "choice_main",
    portrait: "rupert",
    speakerName: null,
    text: null,
    choices: [
      { label: "Look around.", nextPhase: "look_1" },
      { label: "Go downstairs.", nextPhase: "kitchen" },
    ],
  },
  {
    phase: "look_1",
    portrait: "avatar1_tired",
    speakerName: null,
    text: "You look around the room. You are lying on a hard bed with a stained sheet.",
  },
  {
    phase: "look_2",
    portrait: "avatar1_tired",
    speakerName: null,
    text: "The curtains are very old and full of holes, so you get woken up by the first rays of light.",
  },
  {
    phase: "look_3",
    portrait: "avatar1_tired",
    speakerName: null,
    text: "A solitary candle stands on the small table beside the bed.",
  },
  {
    phase: "look_4",
    portrait: "avatar1_tired",
    speakerName: null,
    text: "It looks as though the place hasn't been cleaned in a while.",
  },
  {
    phase: "choice_down",
    portrait: "avatar1_tired",
    speakerName: null,
    text: null,
    choices: [{ label: "Go downstairs.", nextPhase: "kitchen" }],
  },
];

// ─── Scene config ─────────────────────────────────────────────────────────────

type SceneCfg = {
  type: "image" | "black";
  image?: unknown;
  text: string;
  ambient: unknown;
  sfxOnLeave?: unknown;
  autoHoldMs?: number; // auto-advance this many ms after text completes
  hasKnock?: boolean;
};

const SCENES: SceneCfg[] = [
  {
    type: "image",
    image: IMGS.i1,
    text: "You have been on the road in the woods for hours. Cold rain begins to fall. Every drop seeps through your thin cloak. Mud clings to your boots. Your legs are trembling.",
    ambient: SOUNDS.walking,
  },
  {
    type: "image",
    image: IMGS.i2,
    text: "A faint, amber glow appears between the trees—barely visible. Your heart begins to race. You drag yourself onward...",
    ambient: SOUNDS.footsteps,
  },
  {
    type: "image",
    image: IMGS.i3,
    text: "Weather-beaten walls, a broken lantern above a heavy door. It looks abandoned, yet the light feels real. Your legs give way. The world tilts. The door rushes toward you...",
    ambient: SOUNDS.breathing,
  },
  {
    // Black screen with centred voice line
    type: "black",
    text: '"You poor soul. You can rest here."',
    ambient: SOUNDS.dragging,
    sfxOnLeave: SOUNDS.doorclose,
    autoHoldMs: BLACK_HOLD_MS,
  },
  {
    type: "image",
    image: IMGS.i4,
    text: "Morning.\nLight streams through the tattered curtain.\nA rough blanket. A hard bed.\nYou are alive.",
    ambient: SOUNDS.birds,
    hasKnock: true,
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function IntroScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();

  // ── UI state (drives rendering)
  const [renderIdx, setRenderIdx] = useState(0);
  const [displayedText, setDisplayedText] = useState("");
  const [showArrow, setShowArrow] = useState(false);
  const [showBubble, setShowBubble] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [dialogPortrait, setDialogPortrait] = useState<PortraitVariant>("rupert");
  const [dialogPhase, setDialogPhase] = useState<DialogPhase>("awake");

  // ── Internal refs (no re-renders, always fresh in callbacks)
  const R = useRef({
    sceneIdx: 0,
    charIdx: 0,
    isTypingDone: false,
    isTransitioning: false,
    mounted: true,
    typingTimer: null as ReturnType<typeof setInterval> | null,
    autoAdvTimer: null as ReturnType<typeof setTimeout> | null,
    volTimer: null as ReturnType<typeof setInterval> | null,
  }).current;

  // ── Shared animation values
  const overlayOp = useSharedValue(1.0); // 1 = black, 0 = clear
  const textOp = useSharedValue(0.0);
  const bubbleOp = useSharedValue(0.0);
  const dialogY = useSharedValue(500);
  // NOTE: Portrait opacity animation was removed.
  // RNAnimated.Image with useNativeDriver:true caused the image to be invisible
  // on both web and Expo Go (native animation layer conflict when source changes).
  // Now: portrait swaps instantly via plain Image + key prop (force remount on change).

  // ── Audio players (initialised; replaced per scene)
  const ambient = useAudioPlayer(SOUNDS.walking);
  const sfx = useAudioPlayer(SOUNDS.knock);
  const tapPlayer = useAudioPlayer(SOUNDS.tap);
  const walkPlayer = useAudioPlayer(SOUNDS.walkingwood);

  // ─── Cleanup ─────────────────────────────────────────────────────────────

  useEffect(() => {
    // Prevent accidental auto-play on mount
    try { ambient.volume = 0; } catch {}
    try { sfx.volume = 0; } catch {}

    return () => {
      R.mounted = false;
      clearTypingTimer();
      clearAutoAdv();
      clearVolTimer();
      try { ambient.pause(); } catch {}
      try { sfx.pause(); } catch {}
      try { tapPlayer.pause(); } catch {}
      try { walkPlayer.pause(); } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Timer helpers ────────────────────────────────────────────────────────

  function clearTypingTimer() {
    if (R.typingTimer) { clearInterval(R.typingTimer); R.typingTimer = null; }
  }
  function clearAutoAdv() {
    if (R.autoAdvTimer) { clearTimeout(R.autoAdvTimer); R.autoAdvTimer = null; }
  }
  function clearVolTimer() {
    if (R.volTimer) { clearInterval(R.volTimer); R.volTimer = null; }
  }

  // ─── Audio helpers ────────────────────────────────────────────────────────

  function fadeInAmbient(src: unknown, loop = true) {
    try {
      ambient.replace(src as never);
      ambient.loop = loop;
      ambient.volume = 0;
      clearVolTimer();
      let v = 0;
      R.volTimer = setInterval(() => {
        if (!R.mounted) { clearVolTimer(); return; }
        v = Math.min(1, v + 0.04);
        try { ambient.volume = v; } catch {}
        if (v >= 1) clearVolTimer();
      }, 50); // ~1.25s total fade-in
      setTimeout(() => { try { ambient.play(); } catch {} }, 200);
    } catch {}
  }

  function stopAmbient() {
    clearVolTimer();
    try { ambient.pause(); } catch {}
  }

  function playSfx(src: unknown) {
    try {
      sfx.replace(src as never);
      sfx.loop = false;
      sfx.volume = 1;
      setTimeout(() => { try { sfx.play(); } catch {} }, 150);
    } catch {}
  }

  // ─── Portrait change (cross-fade) ────────────────────────────────────────
  // Instant portrait swap (cross-fade removed: opacity animation caused
  // invisible portraits on web and Expo Go due to native-driver conflicts)
  function changePortrait(variant: PortraitVariant) {
    if (variant === dialogPortrait) return;
    setDialogPortrait(variant);
  }

  // ─── Dialog helpers ───────────────────────────────────────────────────────

  function playTapSound() {
    try {
      tapPlayer.replace(SOUNDS.tap as never);
      tapPlayer.loop = false;
      tapPlayer.volume = 1;
      setTimeout(() => { try { tapPlayer.play(); } catch {} }, 50);
    } catch {}
  }

  function playWalkingWood() {
    try {
      walkPlayer.replace(SOUNDS.walkingwood as never);
      walkPlayer.loop = false;
      walkPlayer.volume = 1;
      setTimeout(() => { try { walkPlayer.play(); } catch {} }, 80);
    } catch {}
  }

  function navigateToKitchen() {
    router.replace("/kitchen");
  }

  async function saveIntroProgress() {
    // Auto-save the intro checkpoint so load-game → kitchen tutorial begins
    try {
      const rawSlot = await AsyncStorage.getItem("@game:active_slot");
      const rawSlots = await AsyncStorage.getItem("game_slots");
      if (rawSlot && rawSlots) {
        const slotNum = parseInt(rawSlot, 10);
        const slots = JSON.parse(rawSlots);
        const updated = slots.map((s: { slot: number }) =>
          s.slot === slotNum
            ? { ...s, savedAt: new Date().toISOString(), tutorialDone: false }
            : s
        );
        await AsyncStorage.setItem("game_slots", JSON.stringify(updated));
      }
    } catch {}
    navigateToKitchen();
  }

  function goToKitchen() {
    if (!R.mounted) return;
    stopAmbient();
    textOp.value = withTiming(0, { duration: 300 });
    overlayOp.value = withTiming(1, { duration: 1200 }, (finished) => {
      if (finished) {
        runOnJS(saveIntroProgress)();
      }
    });
  }

  function advanceDialog() {
    const next = DIALOG_ADVANCE[dialogPhase];
    if (!next) return;
    const entry = DIALOG_FLOW.find((e) => e.phase === next);
    if (entry) changePortrait(entry.portrait);
    setDialogPhase(next);
  }

  function handleChoice(nextPhase: DialogPhase | "kitchen") {
    playTapSound();
    if (nextPhase === "kitchen") {
      playWalkingWood();
      setTimeout(() => {
        if (R.mounted) goToKitchen();
      }, 600);
    } else {
      const entry = DIALOG_FLOW.find((e) => e.phase === nextPhase);
      if (entry) changePortrait(entry.portrait);
      setDialogPhase(nextPhase as DialogPhase);
    }
  }

  // ─── Typing ───────────────────────────────────────────────────────────────

  function startTyping(idx: number) {
    if (!R.mounted) return;
    // Guard: user may have tapped during fade-in and already completed the text
    if (R.isTypingDone) return;
    clearTypingTimer();
    const fullText = SCENES[idx].text;
    R.charIdx = 0;
    setShowArrow(false);
    setDisplayedText("");

    R.typingTimer = setInterval(() => {
      if (!R.mounted) { clearTypingTimer(); return; }
      R.charIdx++;
      setDisplayedText(fullText.slice(0, R.charIdx));
      if (R.charIdx >= fullText.length) {
        clearTypingTimer();
        R.isTypingDone = true;
        onTypingComplete(idx);
      }
    }, TYPING_MS);
  }

  function onTypingComplete(idx: number) {
    if (!R.mounted) return;
    const s = SCENES[idx];

    // Show arrow for normal image scenes
    if (s.type === "image" && !s.hasKnock) {
      setShowArrow(true);
    }

    // Auto-advance for black screen (after hold)
    if (s.autoHoldMs) {
      clearAutoAdv();
      R.autoAdvTimer = setTimeout(() => {
        if (R.mounted) doTransition();
      }, s.autoHoldMs);
    }

    // Knock → bubble → dialog flow for last scene
    if (s.hasKnock) {
      setTimeout(() => {
        if (!R.mounted) return;
        playSfx(SOUNDS.knock);
        // After knock finishes, show speech bubble
        setTimeout(() => {
          if (!R.mounted) return;
          setShowBubble(true);
          bubbleOp.value = withTiming(1, { duration: 700 });
          // After bubble, show dialog with warm laughing portrait
          setTimeout(() => {
            if (!R.mounted) return;
            setDialogPortrait("rupertlaugh");
            setDialogPhase("awake");
            setShowDialog(true);
            dialogY.value = withTiming(0, { duration: 580 });
          }, BUBBLE_TO_DIALOG_MS);
        }, KNOCK_DURATION_MS);
      }, KNOCK_OFFSET_MS);
    }
  }

  // ─── Scene lifecycle ──────────────────────────────────────────────────────

  function launchScene(idx: number) {
    if (!R.mounted) return;
    const s = SCENES[idx];

    // Update all tracking refs
    R.sceneIdx = idx;
    R.isTypingDone = false;
    R.isTransitioning = false;

    // Reset UI state
    setRenderIdx(idx);
    setDisplayedText("");
    setShowArrow(false);
    setShowBubble(false);
    setShowDialog(false);

    // Reset animated values (immediately, no animation)
    bubbleOp.value = 0;
    dialogY.value = 500;
    textOp.value = 0;

    // Start ambient audio for this scene (loops except black screen)
    fadeInAmbient(s.ambient, s.type !== "black");

    // Fade in from black, then start typing
    overlayOp.value = withTiming(0, {
      duration: FADE_IN_MS,
      easing: Easing.out(Easing.ease),
    }, (finished) => {
      if (finished) {
        // Fade in text container
        textOp.value = withTiming(1, { duration: 600 });
        runOnJS(startTyping)(idx);
      }
    });
  }

  // Called from JS thread after transition overlay reaches full black
  function onTransitionComplete(nextIdx: number) {
    stopAmbient();
    if (nextIdx >= SCENES.length) {
      router.replace("/");
    } else {
      launchScene(nextIdx);
    }
  }

  function doTransition() {
    if (!R.mounted || R.isTransitioning) return;
    R.isTransitioning = true;
    clearTypingTimer();
    clearAutoAdv();

    const idx = R.sceneIdx;
    const s = SCENES[idx];

    // Fade out text
    textOp.value = withTiming(0, { duration: 380 });

    // Play exit SFX if configured (e.g. door-close leaving black screen)
    if (s.sfxOnLeave) {
      stopAmbient();
      playSfx(s.sfxOnLeave);
    }

    // Fade to black, then go to next scene
    overlayOp.value = withTiming(1, {
      duration: FADE_OUT_MS,
      easing: Easing.in(Easing.ease),
    }, (finished) => {
      if (finished) {
        runOnJS(onTransitionComplete)(idx + 1);
      }
    });
  }

  // ─── Mount ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const t = setTimeout(() => {
      if (R.mounted) launchScene(0);
    }, 350);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── User interactions ────────────────────────────────────────────────────

  function handleTap() {
    if (R.isTransitioning) return;
    if (!R.isTypingDone) {
      // Instantly reveal full text
      clearTypingTimer();
      const idx = R.sceneIdx;
      const fullText = SCENES[idx].text;
      R.charIdx = fullText.length;
      R.isTypingDone = true;
      setDisplayedText(fullText);
      onTypingComplete(idx);
    }
  }

  function handleArrow() {
    if (!R.isTypingDone || R.isTransitioning) return;
    doTransition();
  }

  // ─── Animated styles ──────────────────────────────────────────────────────

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOp.value }));
  const textStyle = useAnimatedStyle(() => ({ opacity: textOp.value }));
  const bubbleStyle = useAnimatedStyle(() => ({ opacity: bubbleOp.value }));
  const dialogSlide = useAnimatedStyle(() => ({
    transform: [{ translateY: dialogY.value }],
  }));
  // portraitStyle was removed – portrait now uses RNAnimated.Image directly

  const scene = SCENES[renderIdx];
  const currentDialogEntry = DIALOG_FLOW.find((e) => e.phase === dialogPhase) ?? null;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      {/* ── Hidden portrait preload – forces browser/RN to decode all portrait
           images immediately when intro.tsx mounts (0×0 so never visible).
           Belt-and-suspenders on top of the game-loading.tsx AssetManager preload. */}
      <View style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
        {(Object.values(PORTRAITS) as (typeof PORTRAITS[keyof typeof PORTRAITS])[]).map((src, i) => (
          <Image key={i} source={src as never} style={{ width: 1, height: 1 }} />
        ))}
      </View>

      {/* ── Scene background ── */}
      {scene.type === "image" && scene.image ? (
        <Image
          source={scene.image as never}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: screenW,
            height: screenH,
          }}
          resizeMode="cover" resizeMethod="resize"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.blackBg]} />
      )}

      {/* ── Full-screen tap area + text overlay ── */}
      <TouchableWithoutFeedback onPress={handleTap}>
        <View style={StyleSheet.absoluteFill}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.textArea,
              scene.type === "black" ? styles.textAreaCenter : styles.textAreaTop,
              scene.type !== "black" && { paddingTop: insets.top + 16 },
              textStyle,
            ]}
          >
            <Text
              style={[
                styles.storyText,
                scene.type === "black" && styles.storyTextCentered,
              ]}
            >
              {displayedText}
            </Text>
          </Animated.View>
        </View>
      </TouchableWithoutFeedback>

      {/* ── Next-scene arrow ── */}
      {showArrow && (
        <TouchableOpacity
          testID="intro-arrow"
          style={[styles.arrowBtn, { bottom: insets.bottom + 28 }]}
          onPress={handleArrow}
          activeOpacity={0.75}
        >
          <View style={styles.arrowCircle}>
            <Ionicons name="chevron-forward" size={26} color="#F5E6C8" />
          </View>
        </TouchableOpacity>
      )}

      {/* ── Speech bubble (scene 4 after knock) ── */}
      {showBubble && !showDialog && (
        <Animated.View
          pointerEvents="none"
          style={[styles.bubble, { bottom: insets.bottom + 68 }, bubbleStyle]}
        >
          <Text style={styles.bubbleText}>{'"Are you awake?"'}</Text>
          <View style={styles.bubbleTail} />
        </Animated.View>
      )}

      {/* ── Dialog panel ── */}
      {showDialog && (
        <Animated.View
          style={[styles.dialogPanel, { paddingBottom: insets.bottom + 20 }, dialogSlide]}
        >
          {/* Portrait – plain Image (no opacity animation to avoid invisible-image bugs).
               key={dialogPortrait} forces remount on variant change for clean swap. */}
          <View style={styles.portraitWrap}>
            <Image
              key={dialogPortrait}
              source={PORTRAITS[dialogPortrait] as never}
              style={styles.portrait}
              resizeMode="cover" resizeMethod="resize"
            />
          </View>

          {/* Speaker name */}
          {currentDialogEntry?.speakerName ? (
            <Text style={styles.npcName}>{currentDialogEntry.speakerName}</Text>
          ) : null}

          {/* Dialog or narration text */}
          {currentDialogEntry?.text ? (
            <View style={styles.dialogBox}>
              <Text
                style={[
                  styles.dialogText,
                  !currentDialogEntry.speakerName && styles.narratorText,
                ]}
              >
                {currentDialogEntry.text}
              </Text>
            </View>
          ) : null}

          {/* Continue button (non-choice phases) */}
          {currentDialogEntry && !currentDialogEntry.choices ? (
            <TouchableOpacity
              testID="dialog-continue"
              style={styles.continueBtn}
              onPress={advanceDialog}
              activeOpacity={0.8}
            >
              <Text style={styles.continueTxt}>Continue</Text>
              <Ionicons name="chevron-forward" size={16} color="#F5E6C8" />
            </TouchableOpacity>
          ) : null}

          {/* Choice buttons */}
          {currentDialogEntry?.choices?.map((choice, i) => (
            <TouchableOpacity
              key={i}
              testID={`choice-${i}`}
              style={styles.choiceBtn}
              onPress={() => handleChoice(choice.nextPhase)}
              activeOpacity={0.8}
            >
              <Text style={styles.choiceTxt}>{choice.label}</Text>
            </TouchableOpacity>
          ))}
        </Animated.View>
      )}

      {/* ── Black transition overlay — always on top ── */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.blackOverlay, overlayStyle]}
        pointerEvents="none"
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  blackBg: {
    backgroundColor: "#000",
  },

  // Text area
  textArea: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  textAreaTop: {
    top: 0,
    backgroundColor: "rgba(0, 0, 0, 0.70)",
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  textAreaCenter: {
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 36,
  },
  storyText: {
    color: "#F0E8D5",
    fontSize: 16,
    lineHeight: 27,
    fontStyle: "italic",
    letterSpacing: 0.25,
  },
  storyTextCentered: {
    textAlign: "center",
    fontSize: 22,
    lineHeight: 36,
    fontFamily: "Oldenburg",
    fontStyle: "normal",
    color: "#F5E6C8",
    letterSpacing: 0.5,
  },

  // Arrow
  arrowBtn: {
    position: "absolute",
    right: 24,
    zIndex: 5,
  },
  arrowCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(196, 148, 58, 0.28)",
    borderWidth: 1.5,
    borderColor: "rgba(245, 230, 200, 0.55)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Speech bubble
  bubble: {
    position: "absolute",
    left: 24,
    right: 24,
    backgroundColor: "rgba(18, 10, 4, 0.93)",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: "rgba(196, 148, 58, 0.42)",
    alignItems: "center",
    zIndex: 6,
  },
  bubbleTail: {
    position: "absolute",
    bottom: -9,
    alignSelf: "center",
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderTopWidth: 9,
    borderStyle: "solid",
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "rgba(18, 10, 4, 0.93)",
  },
  bubbleText: {
    color: "#F5E6C8",
    fontSize: 18,
    fontStyle: "italic",
    fontFamily: "Oldenburg",
    textAlign: "center",
  },

  // Dialog panel
  dialogPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#160B03",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 74,           // 62 (half portrait) + 12 breathing room
    alignItems: "center",
    gap: 12,
    borderTopWidth: 1.5,
    borderTopColor: "rgba(196, 148, 58, 0.35)",
    zIndex: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.65,
    shadowRadius: 12,
    elevation: 28,
  },
  portraitWrap: {
    position: "absolute",
    top: -62,                 // stick out by half of 124px
    width: 124,
    height: 124,
    borderRadius: 62,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "#C4943A",
    backgroundColor: "#2C1810",
  },
  portrait: {
    width: 124,
    height: 124,
  },
  npcName: {
    color: "#C4943A",
    fontSize: 15,
    fontFamily: "Oldenburg",
    letterSpacing: 1.2,
    marginTop: 2,
  },
  dialogBox: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(196, 148, 58, 0.18)",
  },
  dialogText: {
    color: "#F0E8D5",
    fontSize: 16,
    lineHeight: 25,
    fontStyle: "italic",
    textAlign: "center",
  },
  continueBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(196, 148, 58, 0.18)",
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 26,
    borderWidth: 1,
    borderColor: "rgba(196, 148, 58, 0.35)",
    marginTop: 4,
  },
  continueTxt: {
    color: "#F5E6C8",
    fontSize: 15,
    fontFamily: "Oldenburg",
    letterSpacing: 0.6,
  },

  // Black overlay — always rendered on top via JSX order
  blackOverlay: {
    backgroundColor: "#000",
    zIndex: 10,
  },

  // Choice buttons (dialog choices)
  choiceBtn: {
    width: "100%",
    backgroundColor: "rgba(196, 148, 58, 0.13)",
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: "rgba(196, 148, 58, 0.30)",
    marginTop: 4,
    alignItems: "flex-start",
  },
  choiceTxt: {
    color: "#F5E6C8",
    fontSize: 15,
    fontFamily: "Oldenburg",
    letterSpacing: 0.4,
  },
  narratorLabel: {
    color: "rgba(245, 230, 200, 0.45)",
    fontSize: 11,
    fontStyle: "italic",
    letterSpacing: 1.5,
    marginTop: 2,
  },
  narratorText: {
    textAlign: "left",
    fontStyle: "italic",
  },
});
