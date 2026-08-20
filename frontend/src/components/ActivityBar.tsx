import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet, useWindowDimensions } from "react-native";
import { ACTIVITIES, type ActivityId } from "@/src/game/activity-config";
import { calcEffectiveStaminaCost } from "@/src/game/player-stats";
import {
  guestTutorialKeepsRupertInDining,
  loadGuestTutorialIntroStep,
} from "@/src/game/guest-tutorial";

const ACTIVITY_ICONS: Record<ActivityId, ReturnType<typeof require>> = {
  well:         require("../../assets/images/well.png"),
  collectWood:  require("../../assets/images/wood.png"),
  collectStone: require("../../assets/images/stone.png"),
  workout:      require("../../assets/images/workout2.png"),
};

type Props = {
  visible: boolean;
  /** Which activity IDs are currently enabled (rest remain tutorial-locked) */
  enabledActivities: ActivityId[];
  endurance: number;
  onActivity: (id: ActivityId) => void;
  /** Show thought bubble for locked activities */
  onLockedTap: (id: ActivityId) => void;
};

export default function ActivityBar({
  visible,
  enabledActivities,
  endurance,
  onActivity,
  onLockedTap,
}: Props) {
  const { width: W } = useWindowDimensions();
  const [guestTutorialComplete, setGuestTutorialComplete] = useState(false);
  const [guestMealQuestActive, setGuestMealQuestActive] = useState(false);

  useEffect(() => {
    let active = true;
    loadGuestTutorialIntroStep()
      .then((step) => {
        if (!active) return;
        setGuestTutorialComplete(step === "service_complete");
        setGuestMealQuestActive(guestTutorialKeepsRupertInDining(step));
      })
      .catch(() => {
        if (!active) return;
        setGuestTutorialComplete(false);
        setGuestMealQuestActive(false);
      });
    return () => { active = false; };
  }, []);

  if (!visible) return null;

  return (
    <View style={[styles.bar, { width: W }]}>
      {ACTIVITIES.map((act) => {
        // Water is required by the tutorial itself. Optional resource/training
        // actions only unlock once the first guest tutorial is fully complete.
        const storyUnlocked = act.id === "well" || guestTutorialComplete;
        const isEnabled = storyUnlocked && enabledActivities.includes(act.id);
        const cost = calcEffectiveStaminaCost(act.baseStaminaCost, endurance);

        const handlePress = () => {
          if (isEnabled) {
            onActivity(act.id);
            return;
          }
          // During the meal quest GardenScreenBase already owns the exact player
          // thought ("I need to cook herb soup for the guest."). Route the tap
          // through that existing handler without enabling the activity itself.
          if (guestMealQuestActive && act.id !== "well") {
            onActivity(act.id);
            return;
          }
          onLockedTap(act.id);
        };

        return (
          <TouchableOpacity
            key={act.id}
            style={[styles.btn, !isEnabled && styles.btnLocked]}
            onPress={handlePress}
            activeOpacity={isEnabled ? 0.75 : 0.95}
          >
            {act.id === "well" || ACTIVITY_ICONS[act.id] ? (
              <Image
                source={ACTIVITY_ICONS[act.id]}
                style={{ width: 26, height: 26, opacity: isEnabled ? 1 : 0.25 }}
                resizeMode="contain"
                resizeMethod="resize"
              />
            ) : null}
            <Text style={[styles.label, !isEnabled && styles.labelLocked]}>
              {act.label}
            </Text>
            <Text style={[styles.cost, !isEnabled && styles.costLocked]}>
              -{cost}⚡
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: "rgba(10,6,2,0.88)",
    borderTopWidth: 1,
    borderTopColor: "rgba(196,148,58,0.25)",
    paddingVertical: 6,
    paddingHorizontal: 4,
    gap: 4,
  },
  btn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(196,148,58,0.42)",
    backgroundColor: "rgba(30,16,4,0.90)",
    gap: 2,
    minHeight: 58,
  },
  btnLocked: {
    borderColor: "rgba(60,40,15,0.35)",
    backgroundColor: "rgba(12,7,2,0.85)",
  },
  label: {
    color: "#F0E8D5",
    fontSize: 9,
    fontFamily: "Oldenburg",
    textAlign: "center",
  },
  labelLocked: { color: "rgba(240,232,213,0.28)" },
  cost: {
    color: "rgba(196,148,58,0.80)",
    fontSize: 9,
    fontFamily: "Oldenburg",
  },
  costLocked: { color: "rgba(196,148,58,0.20)" },
});
