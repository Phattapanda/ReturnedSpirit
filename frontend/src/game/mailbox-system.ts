import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  ITEM_CATALOG,
  PLAYER_BAG_KEY,
  canStack,
  normalizeBagItem,
  normalizePlayerBagData,
  planAddToBag,
  planAddToNextFreeBagSlot,
  type BagItem,
  type PlayerBagData,
} from "@/src/game/item-system";
import {
  COPPER_PER_GOLD,
  COPPER_PER_SILVER,
  CURRENCY_KEY,
  loadCurrencyCopper,
  normalizeCopper,
  notifyCurrencyChanged,
} from "@/src/game/currency-system";
import {
  DEFAULT_PLAYER_STATS,
  PLAYER_STATS_KEY,
  normalizePlayerStats,
} from "@/src/game/player-stats";
import {
  SHARED_RESOURCE_DEFAULTS,
  SHARED_RESOURCES_KEY,
  type ResourceId,
  type SharedResources,
} from "@/src/game/shared-resources";
import { loadGuestState } from "@/src/game/guest-system";
import {
  DEFAULT_PROGRESSION_STATE,
  PROGRESSION_STATE_KEY,
  normalizeProgressionState,
} from "@/src/game/progression";

export const MAILBOX_STATE_KEY = "@game:mailbox";

const CURRENT_STAMINA_KEY = "@game:stamina";
const CURRENT_LIFE_KEY = "@game:life";

export type MailSenderKind = "developer" | "npc" | "guild" | "adventurer" | "system";

export type MailReward =
  | { type: "item"; itemId: string; quantity: number; containedItem?: string; containedQuantity?: number; item?: BagItem }
  | { type: "copper"; amount: number }
  | { type: "silver"; amount: number }
  | { type: "gold"; amount: number }
  | { type: "stamina"; amount: number }
  | { type: "life"; amount: number }
  | { type: "growth_points"; amount: number }
  | { type: "karma_points"; amount: number }
  | { type: "shared_resource"; resourceId: ResourceId; quantity: number };

export type DailyMailboxSchedule = {
  id: string;
  sender: string;
  totalLetters: number;
  deliveredLetters: number;
  silverPerLetter: number;
  lastDeliveredDaySerial: number;
};

export type MailboxMessage = {
  id: string;
  sender: string;
  senderKind: MailSenderKind;
  subject: string;
  body: string;
  deliveredAt: number;
  rewards: MailReward[];
  read: boolean;
  claimed: boolean;
};

export type MailboxState = {
  version: 1;
  messages: MailboxMessage[];
  redeemedCodes: string[];
  dailySchedules: DailyMailboxSchedule[];
};

export const DEFAULT_MAILBOX_STATE: MailboxState = {
  version: 1,
  messages: [],
  redeemedCodes: [],
  dailySchedules: [],
};

export type BonusCodeDefinition = {
  sender: string;
  subject: string;
  body: string;
  rewards: readonly MailReward[];
  dailySilver?: { days: number; amount: number };
};

/** Codes are normalized to uppercase before lookup, so entry is case-insensitive. */
export const BONUS_CODE_CATALOG: Readonly<Record<string, BonusCodeDefinition>> = {
  WELCOMETRAVELLER: {
    sender: "The Developer",
    subject: "Welcome to A Returned Spirit!",
    body: [
      "Thank you so much for giving the game a chance. I hope you enjoy your time here and stick around for what’s to come. The game is still young, and many more updates, features, and improvements are on the way!",
      "As a small welcome gift, I’ve included:",
      "**1 Silver Coin (100 Copper Coins)**\n**3× Low Grade Stamina Potions**",
      "If you ever have questions, feedback, or run into any issues, feel free to reach out through the **Support** button, or contact me on **Patreon** or **Instagram**.",
      "Thank you for being here, and enjoy your adventure!\n**— The Developer**",
    ].join("\n\n"),
    rewards: [
      { type: "copper", amount: 100 },
      { type: "item", itemId: "potion_stamina_low_grade", quantity: 3 },
    ],
  },
  DEVCHEATCODE2026: {
    sender: "The Developer",
    subject: "Developer Package",
    body: "Here is your developer package. Have fun testing A Returned Spirit!",
    rewards: [
      { type: "karma_points", amount: 100 },
      { type: "growth_points", amount: 1000 },
      { type: "gold", amount: 10 },
      { type: "item", itemId: "goldenapple", quantity: 10 },
    ],
  },
  STARTINGPACKAGE7DAYS: {
    sender: "The Developer",
    subject: "7-Day Starting Package",
    body: "Your seven-day starting package has begun.",
    rewards: [],
    dailySilver: { days: 7, amount: 1 },
  },
};

function positiveInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function normalizeReward(raw: unknown): MailReward | null {
  if (!raw || typeof raw !== "object") return null;
  const reward = raw as Partial<MailReward> & { type?: unknown };
  if (reward.type === "item" && typeof reward.itemId === "string") {
    const quantity = positiveInteger(reward.quantity);
    const exactItem = reward.item && typeof reward.item === "object" &&
      typeof reward.item.id === "string" && typeof reward.item.itemType === "string" &&
      typeof reward.item.name === "string"
      ? normalizeBagItem({ ...reward.item, quantity })
      : null;
    return quantity > 0 ? {
      type: "item", itemId: exactItem?.id ?? reward.itemId, quantity,
      containedItem: typeof reward.containedItem === "string" ? reward.containedItem : undefined,
      containedQuantity: positiveInteger(reward.containedQuantity) || undefined,
      item: exactItem ? {
        ...exactItem,
        attributes: exactItem.attributes ? [...exactItem.attributes] : undefined,
        mealTags: exactItem.mealTags ? [...exactItem.mealTags] : undefined,
      } : undefined,
    } : null;
  }
  if (reward.type === "copper" || reward.type === "silver" || reward.type === "gold" || reward.type === "stamina" || reward.type === "life" || reward.type === "growth_points" || reward.type === "karma_points") {
    const amount = positiveInteger(reward.amount);
    return amount > 0 ? { type: reward.type, amount } : null;
  }
  if (reward.type === "shared_resource" &&
      (reward.resourceId === "wood" || reward.resourceId === "nails" || reward.resourceId === "stone" ||
       reward.resourceId === "cloth" || reward.resourceId === "paint")) {
    const quantity = positiveInteger(reward.quantity);
    return quantity > 0 ? { type: "shared_resource", resourceId: reward.resourceId, quantity } : null;
  }
  return null;
}

function normalizeDailySchedule(raw: unknown): DailyMailboxSchedule | null {
  if (!raw || typeof raw !== "object") return null;
  const schedule = raw as Partial<DailyMailboxSchedule>;
  if (typeof schedule.id !== "string" || typeof schedule.sender !== "string") return null;
  const totalLetters = positiveInteger(schedule.totalLetters);
  const deliveredLetters = Math.min(totalLetters, positiveInteger(schedule.deliveredLetters));
  const silverPerLetter = positiveInteger(schedule.silverPerLetter);
  if (!totalLetters || !silverPerLetter) return null;
  return {
    id: schedule.id,
    sender: schedule.sender,
    totalLetters,
    deliveredLetters,
    silverPerLetter,
    lastDeliveredDaySerial: Math.max(0, Math.floor(Number(schedule.lastDeliveredDaySerial) || 0)),
  };
}

function normalizeMessage(raw: unknown): MailboxMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const message = raw as Partial<MailboxMessage>;
  if (typeof message.id !== "string" || typeof message.sender !== "string" ||
      typeof message.subject !== "string" || typeof message.body !== "string") return null;
  const validKinds = new Set<MailSenderKind>(["developer", "npc", "guild", "adventurer", "system"]);
  return {
    id: message.id,
    sender: message.sender,
    senderKind: validKinds.has(message.senderKind as MailSenderKind) ? message.senderKind as MailSenderKind : "system",
    subject: message.subject,
    body: message.body,
    deliveredAt: Math.max(0, Number(message.deliveredAt) || 0),
    rewards: Array.isArray(message.rewards) ? message.rewards.map(normalizeReward).filter((reward): reward is MailReward => reward !== null) : [],
    read: message.read === true,
    claimed: message.claimed === true,
  };
}

function normalizeMailboxState(raw: unknown): MailboxState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_MAILBOX_STATE };
  const state = raw as Partial<MailboxState>;
  return {
    version: 1,
    messages: Array.isArray(state.messages)
      ? state.messages.map(normalizeMessage).filter((message): message is MailboxMessage => message !== null)
      : [],
    redeemedCodes: Array.isArray(state.redeemedCodes)
      ? [...new Set(state.redeemedCodes
          .filter((code): code is string => typeof code === "string")
          .map((code) => code === "WELCOMETRAVELER" ? "WELCOMETRAVELLER" : code))]
      : [],
    dailySchedules: Array.isArray(state.dailySchedules)
      ? state.dailySchedules.map(normalizeDailySchedule).filter((schedule): schedule is DailyMailboxSchedule => schedule !== null)
      : [],
  };
}

function createDailyCoinLetter(schedule: DailyMailboxSchedule, letterNumber: number): MailboxMessage {
  return {
    id: `${schedule.id}:letter:${letterNumber}`,
    sender: schedule.sender,
    senderKind: "developer",
    subject: `Starting Package — Letter ${letterNumber} of ${schedule.totalLetters}`,
    body: `This is letter ${letterNumber} of ${schedule.totalLetters}. Here is today’s Silver Coin. Have fun playing A Returned Spirit!`,
    deliveredAt: Date.now(),
    rewards: [{ type: "silver", amount: schedule.silverPerLetter }],
    read: false,
    claimed: false,
  };
}

/** Delivers at most one pending daily-package letter for this in-game day. */
export async function deliverDailyBonusLetters(daySerial: number): Promise<MailboxState> {
  const state = await loadMailboxState();
  const normalizedDay = Math.max(0, Math.floor(Number(daySerial) || 0));
  let changed = false;
  const messages = [...state.messages];
  const dailySchedules = state.dailySchedules.map((schedule) => {
    if (schedule.deliveredLetters >= schedule.totalLetters || schedule.lastDeliveredDaySerial >= normalizedDay) return schedule;
    const letterNumber = schedule.deliveredLetters + 1;
    const letter = createDailyCoinLetter(schedule, letterNumber);
    if (!messages.some((message) => message.id === letter.id)) messages.push(letter);
    changed = true;
    return { ...schedule, deliveredLetters: letterNumber, lastDeliveredDaySerial: normalizedDay };
  });
  return changed ? saveMailboxState({ ...state, messages, dailySchedules }) : state;
}

export async function loadMailboxState(): Promise<MailboxState> {
  try {
    const raw = await AsyncStorage.getItem(MAILBOX_STATE_KEY);
    return raw ? normalizeMailboxState(JSON.parse(raw)) : { ...DEFAULT_MAILBOX_STATE };
  } catch {
    return { ...DEFAULT_MAILBOX_STATE };
  }
}

async function saveMailboxState(state: MailboxState): Promise<MailboxState> {
  const normalized = normalizeMailboxState(state);
  await AsyncStorage.setItem(MAILBOX_STATE_KEY, JSON.stringify(normalized));
  return normalized;
}

/** Persistent delivery entry point for Developer, NPC, guild, and adventurer systems. */
export async function deliverMailboxMessage(
  message: Omit<MailboxMessage, "read" | "claimed" | "deliveredAt"> & { deliveredAt?: number },
): Promise<MailboxState> {
  const state = await loadMailboxState();
  if (state.messages.some((entry) => entry.id === message.id)) return state;
  return saveMailboxState({
    ...state,
    messages: [...state.messages, {
      ...message,
      rewards: [...message.rewards],
      deliveredAt: message.deliveredAt ?? Date.now(),
      read: false,
      claimed: false,
    }],
  });
}

export async function markMailboxMessageRead(messageId: string): Promise<MailboxState> {
  const state = await loadMailboxState();
  if (!state.messages.some((message) => message.id === messageId && !message.read)) return state;
  return saveMailboxState({
    ...state,
    messages: state.messages.map((message) => message.id === messageId ? { ...message, read: true } : message),
  });
}

export type DeleteMailResult = { ok: true; state: MailboxState } | { ok: false; reason: "not_found" | "not_ready"; state: MailboxState };

/** Read and fully claimed mail may be removed from the Courier's Chest. */
export async function deleteMailboxMessage(messageId: string): Promise<DeleteMailResult> {
  const state = await loadMailboxState();
  const message = state.messages.find((entry) => entry.id === messageId);
  if (!message) return { ok: false, reason: "not_found", state };
  if (!message.read || (!message.claimed && message.rewards.length > 0)) return { ok: false, reason: "not_ready", state };
  return { ok: true, state: await saveMailboxState({ ...state, messages: state.messages.filter((entry) => entry.id !== messageId) }) };
}

function createRewardItem(itemId: string, quantity: number, containedItem?: string, containedQuantity?: number): BagItem {
  const catalog = ITEM_CATALOG[itemId];
  const maximumDurability = catalog?.maxDurability;
  return {
    id: itemId,
    itemType: itemId,
    name: catalog?.name ?? itemId,
    quantity,
    attributes: catalog?.attributes ? [...catalog.attributes] : undefined,
    mealTags: catalog?.mealTags ? [...catalog.mealTags] : undefined,
    consumableCategory: catalog?.consumableCategory,
    durability: maximumDurability,
    maxDurability: maximumDurability,
    containedItem,
    containedQuantity,
  };
}

type AddRewardResult =
  | { ok: true; bag: PlayerBagData }
  | { ok: false; reason: "bag_locked" | "bag_full" };

function addRewardItem(bag: PlayerBagData, item: BagItem): AddRewardResult {
  if (!bag.unlocked) return { ok: false, reason: "bag_locked" };

  if (canStack(item, item)) {
    const plan = planAddToBag(item, bag);
    if (!plan.canTransfer || plan.remainderQty > 0) return { ok: false, reason: "bag_full" };
    return { ok: true, bag: { ...bag, slots: plan.updatedSlots } };
  }

  let nextBag = { ...bag, slots: bag.slots.map((slot) => slot ? { ...slot } : null) };
  for (let index = 0; index < item.quantity; index += 1) {
    const plan = planAddToNextFreeBagSlot({ ...item, quantity: 1 }, nextBag);
    if (!plan.ok) return { ok: false, reason: plan.reason };
    nextBag = { ...nextBag, slots: plan.updatedSlots };
  }
  return { ok: true, bag: nextBag };
}

export type ClaimMailResult =
  | { ok: true; state: MailboxState; playerBag: PlayerBagData }
  | { ok: false; reason: "not_found" | "already_claimed" | "bag_locked" | "bag_full"; state: MailboxState };

/** Plan every reward first. Nothing is claimed or partly granted when an item cannot fit. */
export async function claimMailboxMessage(messageId: string): Promise<ClaimMailResult> {
  const state = await loadMailboxState();
  const message = state.messages.find((entry) => entry.id === messageId);
  if (!message) return { ok: false, reason: "not_found", state };
  if (message.claimed) return { ok: false, reason: "already_claimed", state };

  const [rawBag, currentCopper, rawStats, rawStamina, rawLife, rawResources, rawProgression] = await Promise.all([
    AsyncStorage.getItem(PLAYER_BAG_KEY),
    loadCurrencyCopper(),
    AsyncStorage.getItem(PLAYER_STATS_KEY),
    AsyncStorage.getItem(CURRENT_STAMINA_KEY),
    AsyncStorage.getItem(CURRENT_LIFE_KEY),
    AsyncStorage.getItem(SHARED_RESOURCES_KEY),
    AsyncStorage.getItem(PROGRESSION_STATE_KEY),
  ]);
  let nextBag = normalizePlayerBagData(rawBag ? JSON.parse(rawBag) : {});

  for (const reward of message.rewards) {
    if (reward.type !== "item") continue;
    const item = reward.item
      ? normalizeBagItem({ ...reward.item, quantity: reward.quantity })!
      : createRewardItem(reward.itemId, reward.quantity, reward.containedItem, reward.containedQuantity);
    let result: AddRewardResult;
    if (!nextBag.unlocked) result = { ok: false, reason: "bag_locked" };
    else if (canStack(item, item)) {
      const plan = planAddToBag(item, nextBag);
      result = plan.canTransfer && plan.remainderQty === 0 ? { ok: true, bag: { ...nextBag, slots: plan.updatedSlots } } : { ok: false, reason: "bag_full" };
    } else result = addRewardItem(nextBag, item);
    if (!result.ok) return { ok: false, reason: result.reason, state };
    nextBag = result.bag;
  }

  const stats = normalizePlayerStats(rawStats ? JSON.parse(rawStats) : DEFAULT_PLAYER_STATS);
  const resources: SharedResources = rawResources
    ? { ...SHARED_RESOURCE_DEFAULTS, ...JSON.parse(rawResources) }
    : { ...SHARED_RESOURCE_DEFAULTS };
  let nextCopper = currentCopper;
  let nextStamina = Math.max(0, Number.parseInt(rawStamina ?? "0", 10) || 0);
  let nextLife = Math.max(0, Number.parseInt(rawLife ?? "0", 10) || 0);
  let nextStats = stats;
  let nextResources = resources;
  let nextProgression = normalizeProgressionState(rawProgression ? JSON.parse(rawProgression) : DEFAULT_PROGRESSION_STATE);

  for (const reward of message.rewards) {
    if (reward.type === "copper") nextCopper = normalizeCopper(nextCopper + reward.amount);
    if (reward.type === "silver") nextCopper = normalizeCopper(nextCopper + reward.amount * COPPER_PER_SILVER);
    if (reward.type === "gold") nextCopper = normalizeCopper(nextCopper + reward.amount * COPPER_PER_GOLD);
    if (reward.type === "stamina") nextStamina = Math.min(stats.maximumStamina, nextStamina + reward.amount);
    if (reward.type === "life") nextLife = Math.min(stats.maximumLife, nextLife + reward.amount);
    if (reward.type === "growth_points") nextStats = { ...nextStats, growthPoints: nextStats.growthPoints + reward.amount };
    if (reward.type === "karma_points") nextProgression = { ...nextProgression, karmaPoints: nextProgression.karmaPoints + reward.amount };
    if (reward.type === "shared_resource") {
      nextResources = {
        ...nextResources,
        [reward.resourceId]: Math.min(999, nextResources[reward.resourceId] + reward.quantity),
      };
    }
  }

  const nextState: MailboxState = {
    ...state,
    messages: state.messages.map((entry) => entry.id === messageId ? { ...entry, read: true, claimed: true } : entry),
  };
  await AsyncStorage.multiSet([
    [MAILBOX_STATE_KEY, JSON.stringify(nextState)],
    [PLAYER_BAG_KEY, JSON.stringify(nextBag)],
    [CURRENCY_KEY, String(nextCopper)],
    [PLAYER_STATS_KEY, JSON.stringify(nextStats)],
    [CURRENT_STAMINA_KEY, String(nextStamina)],
    [CURRENT_LIFE_KEY, String(nextLife)],
    [SHARED_RESOURCES_KEY, JSON.stringify(nextResources)],
    [PROGRESSION_STATE_KEY, JSON.stringify(nextProgression)],
  ]);
  if (nextCopper !== currentCopper) notifyCurrencyChanged(nextCopper);
  return { ok: true, state: nextState, playerBag: nextBag };
}

export type RedeemBonusCodeResult =
  | { ok: true; state: MailboxState; messageId: string }
  | { ok: false; reason: "empty" | "invalid" | "already_redeemed"; state: MailboxState };

export async function redeemBonusCode(rawCode: string): Promise<RedeemBonusCodeResult> {
  const code = rawCode.trim().toLocaleUpperCase();
  const state = await loadMailboxState();
  if (!code) return { ok: false, reason: "empty", state };
  if (state.redeemedCodes.includes(code)) return { ok: false, reason: "already_redeemed", state };
  const definition = BONUS_CODE_CATALOG[code];
  if (!definition) return { ok: false, reason: "invalid", state };

  const scheduleDefinition = definition.dailySilver;
  const currentDaySerial = scheduleDefinition ? (await loadGuestState()).calendarDaySerial : 0;
  const schedule: DailyMailboxSchedule | null = scheduleDefinition ? {
    id: `bonus-code:${code}`,
    sender: definition.sender,
    totalLetters: scheduleDefinition.days,
    deliveredLetters: 1,
    silverPerLetter: scheduleDefinition.amount,
    lastDeliveredDaySerial: currentDaySerial,
  } : null;
  const messageId = schedule ? `${schedule.id}:letter:1` : `bonus-code:${code}`;
  const initialMessage: MailboxMessage = schedule
    ? createDailyCoinLetter(schedule, 1)
    : {
        id: messageId,
        sender: definition.sender,
        senderKind: "developer",
        subject: definition.subject,
        body: definition.body,
        deliveredAt: Date.now(),
        rewards: [...definition.rewards],
        read: false,
        claimed: false,
      };
  const nextState: MailboxState = {
    ...state,
    redeemedCodes: [...state.redeemedCodes, code],
    dailySchedules: schedule ? [...state.dailySchedules, schedule] : state.dailySchedules,
    messages: state.messages.some((message) => message.id === messageId)
      ? state.messages
      : [...state.messages, initialMessage],
  };
  await AsyncStorage.setItem(MAILBOX_STATE_KEY, JSON.stringify(nextState));
  return { ok: true, state: nextState, messageId };
}

export function mailboxRewardLabel(reward: MailReward): string {
  if (reward.type === "item") {
    const label = `${reward.quantity}× ${reward.item?.name ?? ITEM_CATALOG[reward.itemId]?.name ?? reward.itemId}`;
    return reward.containedItem && reward.containedQuantity
      ? `${label} (${reward.containedQuantity} ${ITEM_CATALOG[reward.containedItem]?.name ?? reward.containedItem})`
      : label;
  }
  if (reward.type === "copper") return `${reward.amount} Copper`;
  if (reward.type === "silver") return `${reward.amount} Silver Coin${reward.amount === 1 ? "" : "s"}`;
  if (reward.type === "gold") return `${reward.amount} Gold Coin${reward.amount === 1 ? "" : "s"}`;
  if (reward.type === "stamina") return `+${reward.amount} Stamina`;
  if (reward.type === "life") return `+${reward.amount} Life`;
  if (reward.type === "growth_points") return `+${reward.amount} Growth Points`;
  if (reward.type === "karma_points") return `+${reward.amount} Karma Points`;
  const resourceName = reward.resourceId.charAt(0).toUpperCase() + reward.resourceId.slice(1);
  return `${reward.quantity}× ${resourceName}`;
}
