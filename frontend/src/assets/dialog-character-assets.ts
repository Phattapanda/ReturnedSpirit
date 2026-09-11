import type { ImageSourcePropType } from "react-native";
import type { PlayerAvatarId } from "@/src/game/player-avatar";

export type DialogExpression = "normal" | "laugh" | "sad" | "sick" | "tired";
export const PLAYER_DIALOG_SCALE = 0.8;
export const AVATAR2_DIALOG_SCALE = 0.72;
export const AVATAR3_DIALOG_SCALE = 0.8;
export const INTRO_PLAYER_DIALOG_SCALE = 0.8;
export const RUPERT_DIALOG_SCALE = 0.95;
export const OLD_FARMER_DIALOG_SCALE = 0.72;
export const COACHMAN_DIALOG_SCALE = 0.84;

// Avatar 1's expression images use differently sized source canvases. Keep
// every expression in the same frame as the Kitchen's sad portrait so wider
// screens cannot make taller source files appear larger.
const AVATAR1_KITCHEN_ASPECT_RATIO = 512 / 916;

export const MERCHANT_GUILD_RECEPTIONIST_ASSETS = {
  dialog: require("../../assets/images/dialog/dialogue_receptionist_merchant.png"),
  portrait: require("../../assets/images/receptionist_merchant.png"),
} as const;

export function getPlayerDialogScale(avatarId: PlayerAvatarId): number {
  if (avatarId === 2) return AVATAR2_DIALOG_SCALE;
  if (avatarId === 3) return AVATAR3_DIALOG_SCALE;
  return PLAYER_DIALOG_SCALE;
}

export function getPlayerDialogAspectRatio(avatarId: PlayerAvatarId): number | undefined {
  return avatarId === 1 ? AVATAR1_KITCHEN_ASPECT_RATIO : undefined;
}

export function getDialogExpressionForStamina(stamina: number): DialogExpression {
  if (stamina >= 90) return "laugh";
  if (stamina >= 60) return "normal";
  if (stamina >= 30) return "sad";
  if (stamina >= 10) return "tired";
  return "sick";
}

export const DIALOG_CHARACTER_ASSETS = {
  coachman: require("../../assets/images/dialog/dialogue_coachman.png"),
  oldFarmer: require("../../assets/images/dialog/old_farmer.png"),
  merchant: require("../../assets/images/dialog/dialogue_merchant.png"),
  traveller: require("../../assets/images/dialog/dialogue_traveller.png"),
  cityGuard: require("../../assets/images/dialog/dialogue_city_guard.png"),
  localBoozer: require("../../assets/images/dialog/dialogue_local_boozer.png"),
  merchantGuildReceptionist: MERCHANT_GUILD_RECEPTIONIST_ASSETS.dialog,
  rupert: {
    normal: require("../../assets/images/dialog/dialogue_rupert_normal.png"),
    laugh: require("../../assets/images/dialog/dialogue_rupert_laugh.png"),
    sad: require("../../assets/images/dialog/dialogue_rupert_sad.png"),
  },
  avatar1: {
    normal: require("../../assets/images/dialog/dialogue_avatar1_normal.png"),
    laugh: require("../../assets/images/dialog/dialogue_avatar1_laugh.png"),
    sad: require("../../assets/images/dialog/dialogue_avatar1_sad.png"),
    sick: require("../../assets/images/dialog/dialogue_avatar1_sick.png"),
    tired: require("../../assets/images/dialog/dialogue_avatar1_tired.png"),
  },
  avatar2: {
    normal: require("../../assets/images/dialog/dialogue_avatar2_normal.png"),
    laugh: require("../../assets/images/dialog/dialogue_avatar2_laugh.png"),
    sad: require("../../assets/images/dialog/dialogue_avatar2_sad.png"),
    sick: require("../../assets/images/dialog/dialogue_avatar2_sick.png"),
    tired: require("../../assets/images/dialog/dialogue_avatar2_tired.png"),
  },
  avatar3: {
    normal: require("../../assets/images/dialog/dialogue_avatar3_normal.png"),
    laugh: require("../../assets/images/dialog/dialogue_avatar3_normal_laugh.png"),
    sad: require("../../assets/images/dialog/dialogue_avatar3_sad.png"),
    sick: require("../../assets/images/dialog/dialogue_avatar3_sick.png"),
    tired: require("../../assets/images/dialog/dialogue_avatar3_tired.png"),
  },
} as const;

export function getPlayerDialogCharacter(
  avatarId: PlayerAvatarId,
  expression: DialogExpression,
  fallback: ImageSourcePropType,
): ImageSourcePropType {
  if (avatarId === 1) return DIALOG_CHARACTER_ASSETS.avatar1[expression];
  if (avatarId === 2) return DIALOG_CHARACTER_ASSETS.avatar2[expression];
  if (avatarId === 3) return DIALOG_CHARACTER_ASSETS.avatar3[expression];
  return fallback;
}
