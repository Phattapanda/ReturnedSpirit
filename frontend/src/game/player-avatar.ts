import type { ImageSourcePropType } from "react-native";

export const PLAYER_AVATAR_KEY = "@game:player_avatar_id";

export type PlayerAvatarId = 1 | 2 | 3;
export type PlayerAvatarMood = "normal" | "sad" | "sick" | "tired" | "laugh";

export const DEFAULT_PLAYER_AVATAR_ID: PlayerAvatarId = 1;

export const PLAYER_AVATAR_IDS: PlayerAvatarId[] = [1, 2, 3];

export const PLAYER_AVATARS: Record<PlayerAvatarId, Record<PlayerAvatarMood, ImageSourcePropType>> = {
  1: {
    normal: require("../../assets/images/avatar1_normal.png"),
    sad: require("../../assets/images/avatar1_sad.png"),
    sick: require("../../assets/images/avatar1_sick.png"),
    tired: require("../../assets/images/avatar1_tired.png"),
    laugh: require("../../assets/images/avatar1_laugh.png"),
  },
  2: {
    normal: require("../../assets/images/avatar2_normal.png"),
    sad: require("../../assets/images/avatar2_sad.png"),
    sick: require("../../assets/images/avatar2_sick.png"),
    tired: require("../../assets/images/avatar2_tired.png"),
    laugh: require("../../assets/images/avatar2_laugh.png"),
  },
  3: {
    normal: require("../../assets/images/avatar3_normal.png"),
    sad: require("../../assets/images/avatar3_sad.png"),
    sick: require("../../assets/images/avatar3_sick.png"),
    tired: require("../../assets/images/avatar3_tired.png"),
    laugh: require("../../assets/images/avatar3_laugh.png"),
  },
};

export function normalizePlayerAvatarId(value: unknown): PlayerAvatarId {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return parsed === 2 || parsed === 3 ? parsed : DEFAULT_PLAYER_AVATAR_ID;
}

export function getPlayerAvatarSource(
  avatarId: PlayerAvatarId,
  mood: PlayerAvatarMood,
): ImageSourcePropType {
  return PLAYER_AVATARS[avatarId][mood];
}

export function getPlayerAvatarForStamina(
  avatarId: PlayerAvatarId,
  stamina: number,
): ImageSourcePropType {
  if (stamina >= 90) return PLAYER_AVATARS[avatarId].laugh;
  if (stamina >= 60) return PLAYER_AVATARS[avatarId].normal;
  if (stamina >= 30) return PLAYER_AVATARS[avatarId].sad;
  if (stamina >= 10) return PLAYER_AVATARS[avatarId].tired;
  return PLAYER_AVATARS[avatarId].sick;
}
