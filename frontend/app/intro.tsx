import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useEventListener } from "expo";
import { useRouter } from "expo-router";
import { useAudioPlayer } from "expo-audio";
import { VideoView, useVideoPlayer } from "expo-video";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_PLAYER_AVATAR_ID,
  PLAYER_AVATAR_KEY,
  getPlayerAvatarSource,
  normalizePlayerAvatarId,
  type PlayerAvatarId,
} from "@/src/game/player-avatar";

// Bundled portrait cinematic used for new-game intro playback.
const INTRO_VIDEO = require("../assets/intro.mp4");

const ROOM = require("../assets/images/intro4.jpg");

const PORTRAITS = {
  rupert: require("../assets/images/rupert.png"),
  rupertsad: require("../assets/images/rupertsad.png"),
  rupertlaugh: require("../assets/images/rupertlaugh.png"),
} as const;

type PortraitVariant = keyof typeof PORTRAITS | "player_tired";

type DialogPhase =
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
    portrait: "player_tired",
    speakerName: null,
    text: "You look around the room. You are lying on a hard bed with a stained sheet.",
  },
  {
    phase: "look_2",
    portrait: "player_tired",
    speakerName: null,
    text: "The curtains are very old and full of holes, so you get woken up by the first rays of light.",
  },
  {
    phase: "look_3",
    portrait: "player_tired",
    speakerName: null,
    text: "A solitary candle stands on the small table beside the bed.",
  },
  {
    phase: "look_4",
    portrait: "player_tired",
    speakerName: null,
    text: "It looks as though the place hasn't been cleaned in a while.",
  },
  {
    phase: "choice_down",
    portrait: "player_tired",
    speakerName: null,
    text: null,
    choices: [{ label: "Go downstairs.", nextPhase: "kitchen" }],
  },
];

const SOUNDS = {
  knock: require("../assets/audio/knock.mp3"),
  tap: require("../assets/audio/tap.wav"),
  walkingwood: require("../assets/audio/walking-on-wood.mp3"),
};

const SKIP_HOLD_MS = 900;
const ROOM_FADE_MS = 650;
const KNOCK_DELAY_MS = 450;
const KNOCK_TO_BUBBLE_MS = 2200;
const BUBBLE_TO_DIALOG_MS = 1300;

type IntroStage = "video" | "room";

export default function IntroScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [playerAvatarId, setPlayerAvatarId] = useState<PlayerAvatarId>(DEFAULT_PLAYER_AVATAR_ID);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(PLAYER_AVATAR_KEY)
      .then((raw) => { if (active) setPlayerAvatarId(normalizePlayerAvatarId(raw)); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const [stage, setStage] = useState<IntroStage>("video");
  const [showBubble, setShowBubble] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [dialogPhase, setDialogPhase] = useState<DialogPhase>("awake");
  const [dialogPortrait, setDialogPortrait] = useState<PortraitVariant>("rupertlaugh");
  const [videoReady, setVideoReady] = useState(false);
  const [holdActive, setHoldActive] = useState(false);

  const mountedRef = useRef(true);
  const transitionStartedRef = useRef(false);
  const roomSequenceStartedRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const skipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const blackOpacity = useRef(new Animated.Value(1)).current;
  const holdProgress = useRef(new Animated.Value(0)).current;
  const dialogTranslate = useRef(new Animated.Value(500)).current;
  const bubbleOpacity = useRef(new Animated.Value(0)).current;

  const knockPlayer = useAudioPlayer(SOUNDS.knock);
  const tapPlayer = useAudioPlayer(SOUNDS.tap);
  const walkPlayer = useAudioPlayer(SOUNDS.walkingwood);

  const videoPlayer = useVideoPlayer(INTRO_VIDEO, (player) => {
    player.loop = false;
    player.play();
  });

  useEventListener(videoPlayer, "playToEnd", () => {
    finishVideo();
  });

  useEventListener(videoPlayer, "statusChange", ({ status }) => {
    // Never trap a new game on a failed cinematic. If the video cannot load,
    // fall through to the same room/knock sequence used after a skip.
    if (status === "error") finishVideo();
  });

  useEffect(() => {
    mountedRef.current = true;
    try { knockPlayer.volume = 1; } catch {}
    try { tapPlayer.volume = 1; } catch {}
    try { walkPlayer.volume = 1; } catch {}

    return () => {
      mountedRef.current = false;
      for (const timer of timersRef.current) clearTimeout(timer);
      timersRef.current = [];
      if (skipTimerRef.current) {
        clearTimeout(skipTimerRef.current);
        skipTimerRef.current = null;
      }
      try { videoPlayer.pause(); } catch {}
      try { knockPlayer.pause(); } catch {}
      try { tapPlayer.pause(); } catch {}
      try { walkPlayer.pause(); } catch {}
    };
  }, [knockPlayer, tapPlayer, videoPlayer, walkPlayer]);

  function later(fn: () => void, ms: number) {
    const timer = setTimeout(() => {
      if (mountedRef.current) fn();
    }, ms);
    timersRef.current.push(timer);
  }

  function revealVideo() {
    if (videoReady) return;
    setVideoReady(true);
    Animated.timing(blackOpacity, {
      toValue: 0,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }

  function finishVideo() {
    if (transitionStartedRef.current) return;
    transitionStartedRef.current = true;
    setHoldActive(false);
    holdProgress.stopAnimation();
    try { videoPlayer.pause(); } catch {}

    Animated.timing(blackOpacity, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished || !mountedRef.current) return;
      setStage("room");
      setShowBubble(false);
      setShowDialog(false);
      blackOpacity.setValue(1);
      later(startRoomSequence, 40);
    });
  }

  function startRoomSequence() {
    if (roomSequenceStartedRef.current) return;
    roomSequenceStartedRef.current = true;

    Animated.timing(blackOpacity, {
      toValue: 0,
      duration: ROOM_FADE_MS,
      useNativeDriver: true,
    }).start();

    later(() => {
      try {
        knockPlayer.seekTo(0);
        knockPlayer.play();
      } catch {}

      later(() => {
        setShowBubble(true);
        Animated.timing(bubbleOpacity, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }).start();

        later(() => {
          setShowBubble(false);
          bubbleOpacity.setValue(0);
          setDialogPortrait("rupertlaugh");
          setDialogPhase("awake");
          setShowDialog(true);
          Animated.spring(dialogTranslate, {
            toValue: 0,
            useNativeDriver: true,
            damping: 18,
            stiffness: 150,
            mass: 0.9,
          }).start();
        }, BUBBLE_TO_DIALOG_MS);
      }, KNOCK_TO_BUBBLE_MS);
    }, KNOCK_DELAY_MS);
  }

  function handleSkipPressIn() {
    if (stage !== "video" || transitionStartedRef.current) return;

    if (skipTimerRef.current) clearTimeout(skipTimerRef.current);
    setHoldActive(true);
    holdProgress.setValue(0);
    Animated.timing(holdProgress, {
      toValue: 1,
      duration: SKIP_HOLD_MS,
      useNativeDriver: false,
    }).start();

    // Do not rely on React Native's onLongPress firing over a native VideoView.
    // The hold itself owns an explicit timer and reaches the same finishVideo()
    // path as normal playback completion.
    skipTimerRef.current = setTimeout(() => {
      skipTimerRef.current = null;
      if (!mountedRef.current || stage !== "video" || transitionStartedRef.current) return;
      finishVideo();
    }, SKIP_HOLD_MS);
  }

  function handleSkipPressOut() {
    if (skipTimerRef.current) {
      clearTimeout(skipTimerRef.current);
      skipTimerRef.current = null;
    }
    setHoldActive(false);
    holdProgress.stopAnimation();
    Animated.timing(holdProgress, {
      toValue: 0,
      duration: 120,
      useNativeDriver: false,
    }).start();
  }

  function changePortrait(variant: PortraitVariant) {
    setDialogPortrait(variant);
  }

  function playTapSound() {
    try {
      tapPlayer.seekTo(0);
      tapPlayer.play();
    } catch {}
  }

  function playWalkingWood() {
    try {
      walkPlayer.seekTo(0);
      walkPlayer.play();
    } catch {}
  }

  async function saveIntroProgress() {
    try {
      const rawSlot = await AsyncStorage.getItem("@game:active_slot");
      const rawSlots = await AsyncStorage.getItem("game_slots");
      if (rawSlot && rawSlots) {
        const slotNum = parseInt(rawSlot, 10);
        const slots = JSON.parse(rawSlots);
        const updated = slots.map((s: { slot: number }) =>
          s.slot === slotNum
            ? { ...s, savedAt: new Date().toISOString(), tutorialDone: false }
            : s,
        );
        await AsyncStorage.setItem("game_slots", JSON.stringify(updated));
      }
    } catch {}
    router.replace("/kitchen");
  }

  function goToKitchen() {
    Animated.timing(blackOpacity, {
      toValue: 1,
      duration: 900,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && mountedRef.current) void saveIntroProgress();
    });
  }

  function advanceDialog() {
    const next = DIALOG_ADVANCE[dialogPhase];
    if (!next) return;
    const entry = DIALOG_FLOW.find((item) => item.phase === next);
    if (entry) changePortrait(entry.portrait);
    setDialogPhase(next);
  }

  function handleChoice(nextPhase: DialogPhase | "kitchen") {
    playTapSound();
    if (nextPhase === "kitchen") {
      playWalkingWood();
      later(goToKitchen, 500);
      return;
    }

    const entry = DIALOG_FLOW.find((item) => item.phase === nextPhase);
    if (entry) changePortrait(entry.portrait);
    setDialogPhase(nextPhase);
  }

  const currentDialogEntry = DIALOG_FLOW.find((entry) => entry.phase === dialogPhase) ?? null;
  const holdWidth = holdProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.root}>
      <View style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
        {Object.values(PORTRAITS).map((source, index) => (
          <Image key={index} source={source} style={{ width: 1, height: 1 }} />
        ))}
        <Image source={ROOM} style={{ width: 1, height: 1 }} />
      </View>

      {stage === "video" ? (
        <View style={StyleSheet.absoluteFill}>
          {/* Native video surfaces can capture touch input on-device. Keep the
              video subtree non-interactive and put the hold target above it. */}
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <VideoView
              style={{ width: screenW, height: screenH }}
              player={videoPlayer}
              nativeControls={false}
              contentFit="cover"
              onFirstFrameRender={revealVideo}
            />
          </View>

          <Pressable
            testID="intro-hold-to-skip"
            style={StyleSheet.absoluteFill}
            onPressIn={handleSkipPressIn}
            onPressOut={handleSkipPressOut}
          >
            <View
              pointerEvents="none"
              style={[styles.skipWrap, { bottom: insets.bottom + 24 }]}
            >
              <Text style={styles.skipText}>{holdActive ? "Keep holding..." : "Hold to skip"}</Text>
              <View style={styles.skipTrack}>
                <Animated.View style={[styles.skipProgress, { width: holdWidth }]} />
              </View>
            </View>
          </Pressable>
        </View>
      ) : (
        <Image
          source={ROOM}
          style={{ position: "absolute", width: screenW, height: screenH }}
          resizeMode="cover"
          resizeMethod="resize"
        />
      )}

      {stage === "room" && showBubble && !showDialog && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.bubbleWrap,
            { bottom: insets.bottom + 68, opacity: bubbleOpacity },
          ]}
        >
          <View style={styles.bubble}>
            <Text style={styles.bubbleText}>{'"Are you awake?"'}</Text>
            <View style={styles.bubbleTail} />
          </View>
        </Animated.View>
      )}

      {stage === "room" && showDialog && currentDialogEntry && (
        <Animated.View
          style={[
            styles.dialogPanel,
            {
              paddingBottom: insets.bottom + 20,
              transform: [{ translateY: dialogTranslate }],
            },
          ]}
        >
          <View style={styles.portraitWrap}>
            <Image
              key={`${dialogPortrait}-${playerAvatarId}`}
              source={dialogPortrait === "player_tired" ? getPlayerAvatarSource(playerAvatarId, "tired") : PORTRAITS[dialogPortrait]}
              style={[styles.portrait, dialogPortrait === "player_tired" ? styles.playerPortraitImage : styles.npcPortraitImage]}
              resizeMode="cover"
              resizeMethod="resize"
            />
          </View>

          {currentDialogEntry.speakerName ? (
            <Text style={styles.npcName}>{currentDialogEntry.speakerName}</Text>
          ) : null}

          {currentDialogEntry.text ? (
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

          {!currentDialogEntry.choices ? (
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

          {currentDialogEntry.choices?.map((choice, index) => (
            <TouchableOpacity
              key={index}
              testID={`choice-${index}`}
              style={styles.choiceBtn}
              onPress={() => handleChoice(choice.nextPhase)}
              activeOpacity={0.8}
            >
              <Text style={styles.choiceTxt}>{choice.label}</Text>
            </TouchableOpacity>
          ))}
        </Animated.View>
      )}

      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.blackOverlay, { opacity: blackOpacity }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  blackOverlay: {
    backgroundColor: "#000",
    zIndex: 50,
  },
  skipWrap: {
    position: "absolute",
    left: 28,
    right: 28,
    alignItems: "center",
  },
  skipText: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 13,
    letterSpacing: 0.4,
    marginBottom: 8,
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  skipTrack: {
    width: 150,
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  skipProgress: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(245,230,200,0.95)",
  },
  bubbleWrap: {
    position: "absolute",
    left: 24,
    right: 24,
    alignItems: "center",
  },
  bubble: {
    maxWidth: "82%",
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
    fontFamily: "RobotoRegular",
    textAlign: "center",
  },
  dialogPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#160B03",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 74,
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
    top: -62,
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
  playerPortraitImage: { transform: [{ scale: 1.06 }] },
  npcPortraitImage: { transform: [{ scale: 1.06 }] },
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
    fontFamily: "RobotoRegular",
    textAlign: "center",
  },
  narratorText: {
    fontStyle: "normal",
    color: "#E8DEC8",
  },
  continueBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#8B5A2B",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    minWidth: 150,
  },
  continueTxt: {
    color: "#F5E6C8",
    fontSize: 15,
    fontFamily: "Oldenburg",
  },
  choiceBtn: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(196, 148, 58, 0.45)",
    backgroundColor: "rgba(196, 148, 58, 0.12)",
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  choiceTxt: {
    color: "#F5E6C8",
    fontSize: 15,
    fontFamily: "Oldenburg",
    letterSpacing: 0.4,
  },
});
