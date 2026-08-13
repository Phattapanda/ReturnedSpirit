import React, { useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
} from "react-native-reanimated";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GardenPlotStatus = "empty" | "growing" | "ready" | "withered";

export type GardenPlotData = {
  id: string;
  plotType: "small" | "medium" | "large";
  upgradeLevel: number;
  status: GardenPlotStatus;
  cropType: string | null;       // Crop type identifier: "herb", etc.
  cropAsset: string | null;      // Legacy field – kept for save-compat; display uses getCropStageAsset
  seedItemId: string | null;
  totalGrowthDays: number;
  completedGrowthDays: number;
  remainingGrowthDays: number;
  progressPercent: number;
  wateredToday: boolean;
  weedsPulledToday: boolean;
  fertilizedToday: boolean;
  fertilizerTypeUsedToday: string | null;
  consecutiveUnwateredDays: number;
  baseYield: number;
  accumulatedWeedYieldBonus: number;
  accumulatedFertilizerYieldBonus: number;
  readyToHarvest: boolean;
  withered: boolean;
};

export type GardenPlotProps = {
  data: GardenPlotData;
  interactive: boolean;
  onWater: () => void;
  onPullWeeds: () => void;
  onFertilize: () => void;
  onHarvest: () => void;
  onCropTap: () => void;
  /** Called when a locked action button (water/weeds/fertilize) is tapped while readyToHarvest */
  onLockedAction?: () => void;
  /** Effective stamina costs (after endurance reduction) */
  actionCosts?: { water: number; pullWeeds: number; fertilize: number };
};

// ─── Asset map ────────────────────────────────────────────────────────────────

const CROP_ASSETS: Record<string, ReturnType<typeof require>> = {
  herbbed:       require("../../assets/images/herbbed.png"),
  herbbed_young: require("../../assets/images/herbbed_young.png"),
  herbseed:      require("../../assets/images/herbseed.png"),
  herbs:         require("../../assets/images/herbs.png"),
};

const ACTION_IMG = {
  watering:   require("../../assets/images/watering.png"),
  pullweeds:  require("../../assets/images/pullweeds.png"),
  fertilizer: require("../../assets/images/fertilizer.png"),
  harvest:    require("../../assets/images/harvest.png"),
};

// ─── Crop stage configuration ─────────────────────────────────────────────────

type CropStageConfig = {
  seedStageAsset: string;     // progress === 0
  growingStageAsset: string;  // 0 < progress < 100
  readyStageAsset: string;    // progress === 100 / status "ready"
  // witheredStageAsset: not yet provided; falls back to readyStageAsset placeholder
};

const CROP_STAGE_CONFIGS: Record<string, CropStageConfig> = {
  herb: {
    seedStageAsset:    "herbseed",
    growingStageAsset: "herbbed_young",
    readyStageAsset:   "herbbed",
  },
};

/**
 * Central crop → display-asset resolver.
 * Never hardcode asset names in screens; always call this function.
 */
export function getCropStageAsset(
  cropType: string | null,
  progressPercent: number,
  status: GardenPlotStatus,
): ReturnType<typeof require> | null {
  if (!cropType || status === "empty") return null;

  const cfg = CROP_STAGE_CONFIGS[cropType];
  if (!cfg) return null;

  if (status === "withered") {
    // Withered asset not yet available – fall back to growing stage to avoid showing "ready"
    return CROP_ASSETS[cfg.growingStageAsset];
  }
  if (status === "ready" || progressPercent >= 100) {
    return CROP_ASSETS[cfg.readyStageAsset];
  }
  if (progressPercent === 0) {
    return CROP_ASSETS[cfg.seedStageAsset];
  }
  return CROP_ASSETS[cfg.growingStageAsset];
}

// ─── GardenPlot component ─────────────────────────────────────────────────────

export default function GardenPlot({
  data,
  interactive,
  onWater,
  onPullWeeds,
  onFertilize,
  onHarvest,
  onCropTap,
  onLockedAction,
  actionCosts = { water: 2, pullWeeds: 8, fertilize: 3 },
}: GardenPlotProps) {
  // Animated color: 0 = red (not watered), 1 = green (watered)
  const progColor = useSharedValue(data.wateredToday ? 1 : 0);

  useEffect(() => {
    progColor.value = withTiming(data.wateredToday ? 1 : 0, { duration: 450 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.wateredToday]);

  const progBarStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progColor.value,
      [0, 1],
      ["#CC2200", "#4E9E2A"],
    ),
  }));

  // ── Derived display values
  const cropImg = getCropStageAsset(data.cropType, data.progressPercent, data.status);

  const progressLabel = data.withered
    ? "Withered"
    : data.readyToHarvest
    ? "Ready to harvest!"
    : data.remainingGrowthDays === 1
    ? "1 day left"
    : data.remainingGrowthDays > 1
    ? `${data.remainingGrowthDays} days left`
    : data.status === "empty"
    ? ""
    : "Growing...";

  const statusLabel = data.withered
    ? "Dead"
    : data.readyToHarvest
    ? "Ready"
    : data.status === "empty"
    ? "Empty"
    : "Growing";

  // ── Empty plot: no actions available except tapping crop area to plant
  const isEmpty = data.status === "empty";

  // ── Button disabled states
  // When readyToHarvest: only harvest is active; water/weeds/fertilize are visually locked
  // but still tappable (to show "That won't achieve anything." bubble via onLockedAction)
  const harvestLocked = data.readyToHarvest;
  // True disabled: no interaction possible at all
  const waterDisabled     = !interactive || data.withered || isEmpty;
  const weedsDisabled     = !interactive || isEmpty;
  const fertilizeDisabled = !interactive || data.withered || isEmpty;
  // Visual locked (greyed out, but still tappable when harvestLocked)
  const waterLocked     = harvestLocked && !isEmpty && !data.withered;
  const weedsLocked     = harvestLocked && !isEmpty;
  const fertilizeLocked = harvestLocked && !isEmpty && !data.withered;
  const harvestDisabled   = !interactive;
  const harvestNotReady   = !data.readyToHarvest;

  return (
    <View style={styles.card}>
      {/* ── Top: crop image + info ── */}
      <View style={styles.topRow}>
        {/* Crop image / empty bed */}
        <TouchableOpacity
          style={styles.cropWrap}
          onPress={interactive ? onCropTap : undefined}
          disabled={!interactive}
          activeOpacity={0.82}
        >
          {cropImg ? (
            <Image source={cropImg} style={styles.cropImg} resizeMode="contain" resizeMethod="resize" />
          ) : (
            <View style={styles.cropEmpty}>
              <Text style={styles.cropEmptyText}>
                {interactive ? "Tap to\nPlant" : "Empty\nBed"}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Info column */}
        <View style={styles.infoCol}>
          <Text style={styles.statusLabel}>{statusLabel}</Text>
          {progressLabel ? <Text style={styles.progressLabel}>{progressLabel}</Text> : null}

          {/* Progress track */}
          {!isEmpty && (
            <>
              <View style={styles.progressTrack}>
                <Animated.View
                  style={[
                    styles.progressFill,
                    progBarStyle,
                    { width: `${data.progressPercent}%` as any },
                  ]}
                />
              </View>
              <Text style={styles.percentText}>{data.progressPercent}%</Text>
            </>
          )}

          {/* Yield preview */}
          {!data.withered && !isEmpty && (
            <Text style={styles.yieldHint}>
              Est. yield: {data.baseYield + data.accumulatedWeedYieldBonus + data.accumulatedFertilizerYieldBonus} herbs
            </Text>
          )}
        </View>
      </View>

      <View style={styles.divider} />

      {/* ── Action buttons ── */}
      <View style={styles.actionsRow}>
        {/* Water – visually locked when readyToHarvest, but still tappable to show message */}
        <ActionBtn
          img={ACTION_IMG.watering}
          label="Water"
          cost={isEmpty ? "" : `-${actionCosts.water}`}
          done={data.wateredToday}
          disabled={waterDisabled}
          locked={!waterDisabled && waterLocked}
          onPress={waterLocked ? (onLockedAction ?? onWater) : onWater}
        />

        {/* Pull Weeds */}
        <ActionBtn
          img={ACTION_IMG.pullweeds}
          label="Weeds"
          cost={isEmpty ? "" : `-${actionCosts.pullWeeds}`}
          done={data.weedsPulledToday && !data.withered}
          disabled={weedsDisabled}
          locked={!weedsDisabled && weedsLocked}
          onPress={weedsLocked ? (onLockedAction ?? onPullWeeds) : onPullWeeds}
        />

        {/* Fertilize */}
        <ActionBtn
          img={ACTION_IMG.fertilizer}
          label="Fertilize"
          cost={isEmpty ? "" : `-${actionCosts.fertilize}`}
          done={data.fertilizedToday}
          disabled={fertilizeDisabled}
          locked={!fertilizeDisabled && fertilizeLocked}
          onPress={fertilizeLocked ? (onLockedAction ?? onFertilize) : onFertilize}
        />

        {/* Harvest – always tappable when interactive, even if not ready */}
        <ActionBtn
          img={ACTION_IMG.harvest}
          label="Harvest"
          cost=""
          done={false}
          disabled={harvestDisabled}
          locked={harvestNotReady && interactive}
          onPress={onHarvest}
          isHarvest
        />
      </View>
    </View>
  );
}

// ─── Sub-component: ActionBtn ─────────────────────────────────────────────────

type ActionBtnProps = {
  img: ReturnType<typeof require>;
  label: string;
  cost: string;
  done: boolean;
  disabled: boolean;
  locked?: boolean;
  isHarvest?: boolean;
  onPress: () => void;
};

function ActionBtn({ img, label, cost, done, disabled, locked, isHarvest, onPress }: ActionBtnProps) {
  return (
    <TouchableOpacity
      style={[
        styles.actionBtn,
        done && styles.actionBtnDone,
        locked && styles.actionBtnLocked,
        isHarvest && !locked && !disabled && styles.actionBtnHarvest,
        disabled && !locked && styles.actionBtnDisabled,
      ]}
      onPress={disabled ? undefined : onPress}
      disabled={disabled && !locked}
      activeOpacity={0.75}
    >
      <Image source={img} style={[styles.actionIcon, (disabled || locked) && styles.iconDimmed]} resizeMode="contain" resizeMethod="resize" />
      <Text style={[styles.actionLabel, (disabled || locked) && styles.labelDimmed]}>{label}</Text>
      {cost ? <Text style={[styles.actionCost, (disabled || locked) && styles.labelDimmed]}>{cost}⚡</Text> : null}
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(14, 8, 2, 0.92)",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(196, 148, 58, 0.38)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 18,
  },

  topRow: {
    flexDirection: "row",
    padding: 14,
    gap: 14,
    alignItems: "center",
  },
  cropWrap: {
    width: 90,
    height: 90,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(196,148,58,0.45)",
    backgroundColor: "rgba(30,18,5,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  cropImg: { width: "100%", height: "100%" },
  cropEmpty: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(20,12,4,0.8)",
  },
  cropEmptyText: {
    color: "rgba(196,148,58,0.55)",
    fontSize: 11,
    fontFamily: "Oldenburg",
    textAlign: "center",
  },

  infoCol: { flex: 1, gap: 5 },
  statusLabel: { color: "#C4943A", fontSize: 13, fontFamily: "Oldenburg", letterSpacing: 0.8 },
  progressLabel: { color: "#F0E8D5", fontSize: 12, fontFamily: "Oldenburg", opacity: 0.85 },
  progressTrack: {
    height: 10, borderRadius: 5,
    backgroundColor: "#2A1800",
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 5 },
  percentText: { color: "rgba(240,232,213,0.6)", fontSize: 11, fontFamily: "Oldenburg" },
  yieldHint: {
    color: "rgba(196,148,58,0.65)",
    fontSize: 10,
    fontFamily: "Oldenburg",
    marginTop: 2,
  },

  divider: { height: 1, backgroundColor: "rgba(196,148,58,0.18)", marginHorizontal: 10 },

  actionsRow: {
    flexDirection: "row",
    gap: 6,
    padding: 10,
  },

  actionBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(90,65,30,0.45)",
    backgroundColor: "rgba(25,14,4,0.90)",
    gap: 3,
    minHeight: 70,
  },
  actionBtnDone: {
    borderColor: "rgba(78,158,42,0.55)",
    backgroundColor: "rgba(78,158,42,0.12)",
  },
  actionBtnLocked: {
    borderColor: "rgba(60,40,20,0.40)",
    backgroundColor: "rgba(15,8,2,0.85)",
    opacity: 0.5,
  },
  actionBtnDisabled: { opacity: 0.35 },
  actionBtnHarvest: {
    borderColor: "rgba(196,148,58,0.65)",
    backgroundColor: "rgba(196,148,58,0.14)",
  },

  actionIcon: { width: 28, height: 28 },
  iconDimmed: { opacity: 0.45 },
  actionLabel: {
    color: "#F0E8D5",
    fontSize: 10,
    fontFamily: "Oldenburg",
    textAlign: "center",
    letterSpacing: 0.3,
  },
  actionCost: {
    color: "rgba(240,232,213,0.55)",
    fontSize: 9,
    fontFamily: "Oldenburg",
    textAlign: "center",
  },
  labelDimmed: { opacity: 0.45 },
});
