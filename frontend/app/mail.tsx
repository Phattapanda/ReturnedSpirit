import React, { useCallback, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import TavernLocationBar from "@/src/components/tavern-location-bar";
import TavernLocationTransition from "@/src/components/tavern-location-transition";
import TravelHeader from "@/src/components/travel-header";
import { useAudioManager } from "@/src/audio/AudioProvider";
import { useHaptics } from "@/src/feedback/haptics-provider";
import { guestTutorialHasReached, loadGuestTutorialIntroStep } from "@/src/game/guest-tutorial";
import {
  DEFAULT_MAILBOX_STATE,
  claimMailboxMessage,
  loadMailboxState,
  mailboxRewardLabel,
  markMailboxMessageRead,
  redeemBonusCode,
  type MailSenderKind,
  type MailboxState,
} from "@/src/game/mailbox-system";
import { loadCityState } from "@/src/game/city-system";

type MailboxView = "inbox" | "send";

type MailTextSegment = {
  text: string;
  bold: boolean;
};

function splitBoldMailText(text: string): MailTextSegment[] {
  const segments: MailTextSegment[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const boldStart = text.indexOf("**", cursor);
    if (boldStart < 0) {
      segments.push({ text: text.slice(cursor), bold: false });
      break;
    }
    const boldEnd = text.indexOf("**", boldStart + 2);
    if (boldEnd < 0) {
      segments.push({ text: text.slice(cursor), bold: false });
      break;
    }
    if (boldStart > cursor) segments.push({ text: text.slice(cursor, boldStart), bold: false });
    segments.push({ text: text.slice(boldStart + 2, boldEnd), bold: true });
    cursor = boldEnd + 2;
  }
  return segments;
}

function senderIcon(kind: MailSenderKind): React.ComponentProps<typeof Ionicons>["name"] {
  if (kind === "developer") return "code-slash-outline";
  if (kind === "npc") return "person-outline";
  if (kind === "guild") return "shield-outline";
  if (kind === "adventurer") return "compass-outline";
  return "mail-outline";
}

export default function MailScreen() {
  const insets = useSafeAreaInsets();
  const audioManager = useAudioManager();
  const { triggerHaptic } = useHaptics();
  const [mailbox, setMailbox] = useState<MailboxState>(DEFAULT_MAILBOX_STATE);
  const [unlocked, setUnlocked] = useState(false);
  const [view, setView] = useState<MailboxView>("inbox");
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [bonusCode, setBonusCode] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [headerRefreshKey, setHeaderRefreshKey] = useState(0);
  const claimLock = useRef(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      await loadCityState();
      return Promise.all([loadGuestTutorialIntroStep(), loadMailboxState()]);
    })().then(([tutorialStep, loadedMailbox]) => {
      if (!active) return;
      setUnlocked(guestTutorialHasReached(tutorialStep, "service_complete"));
      setMailbox(loadedMailbox);
    }).catch(() => setFeedback("The mailbox could not be loaded."));
    return () => { active = false; };
  }, []));

  const messages = useMemo(
    () => [...mailbox.messages].sort((a, b) => b.deliveredAt - a.deliveredAt),
    [mailbox.messages],
  );
  const unreadCount = mailbox.messages.filter((message) => !message.read).length;

  function selectView(nextView: MailboxView) {
    triggerHaptic("choice");
    setView(nextView);
    setFeedback(null);
  }

  function openMessage(messageId: string) {
    triggerHaptic("choice");
    setSelectedMessageId((current) => current === messageId ? null : messageId);
    const message = mailbox.messages.find((entry) => entry.id === messageId);
    if (!message || message.read) return;
    setMailbox((current) => ({
      ...current,
      messages: current.messages.map((entry) => entry.id === messageId ? { ...entry, read: true } : entry),
    }));
    void markMailboxMessageRead(messageId).then(setMailbox).catch(() => {});
  }

  async function claimMessage(messageId: string) {
    if (claimLock.current) return;
    claimLock.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await claimMailboxMessage(messageId);
      if (result.ok) {
        setMailbox(result.state);
        setHeaderRefreshKey((current) => current + 1);
        triggerHaptic("choice");
        audioManager.playSoundEffect("bling", { maxDurationMs: 2500 });
        setFeedback("Rewards claimed.");
      } else {
        setMailbox(result.state);
        setFeedback(
          result.reason === "bag_full" ? "Your bag is full. The package remains claimable." :
          result.reason === "bag_locked" ? "You need your bag before claiming this package." :
          result.reason === "already_claimed" ? "This package has already been claimed." :
          "This message is no longer available.",
        );
      }
    } catch {
      setFeedback("The package could not be claimed. Please try again.");
    } finally {
      setBusy(false);
      claimLock.current = false;
    }
  }

  async function sendBonusCode() {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    triggerHaptic("choice");
    try {
      const result = await redeemBonusCode(bonusCode);
      setMailbox(result.state);
      if (result.ok) {
        setBonusCode("");
        setSelectedMessageId(null);
        setView("inbox");
        audioManager.playSoundEffect("new-recipe-found", { maxDurationMs: 3500 });
        setFeedback("Code accepted. New mail received.");
      } else {
        setFeedback(
          result.reason === "empty" ? "Enter a bonus code first." :
          result.reason === "already_redeemed" ? "This code has already been redeemed." :
          "This bonus code is not valid.",
        );
      }
    } catch {
      setFeedback("The code could not be sent. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <TavernLocationTransition location="mail">
    <View style={styles.root}>
      <View style={styles.backgroundGlow} pointerEvents="none" />
      <TravelHeader
        locationName="Mailbox"
        showPortraitRow
        refreshKey={headerRefreshKey}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!unlocked ? (
          <View style={styles.lockedPanel}>
            <Ionicons name="lock-closed" size={36} color="#C4943A" />
            <Text style={styles.lockedTitle}>Mailbox locked</Text>
            <Text style={styles.lockedText}>The mailbox becomes available after the guest tutorial.</Text>
          </View>
        ) : (
          <>
            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tabButton, view === "inbox" && styles.tabButtonActive]}
                onPress={() => selectView("inbox")}
                activeOpacity={0.8}
              >
                <Ionicons name="mail-outline" size={20} color={view === "inbox" ? "#160B03" : "#E7C77A"} />
                <Text style={[styles.tabText, view === "inbox" && styles.tabTextActive]}>Inbox</Text>
                {unreadCount > 0 && <Text style={styles.unreadBadge}>{unreadCount}</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabButton, view === "send" && styles.tabButtonActive]}
                onPress={() => selectView("send")}
                activeOpacity={0.8}
              >
                <Ionicons name="send-outline" size={20} color={view === "send" ? "#160B03" : "#E7C77A"} />
                <Text style={[styles.tabText, view === "send" && styles.tabTextActive]}>Send Mail</Text>
              </TouchableOpacity>
            </View>

            {view === "inbox" && (
              <View style={styles.panel}>
                <View style={styles.panelHeadingRow}>
                  <Text style={styles.panelTitle}>Inbox</Text>
                  <Text style={styles.messageCount}>{messages.length} messages</Text>
                </View>
                {messages.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="mail-open-outline" size={34} color="rgba(196,148,58,0.52)" />
                    <Text style={styles.emptyTitle}>No mail yet.</Text>
                    <Text style={styles.emptyText}>Messages, quest letters, and commissioned packages will appear here.</Text>
                  </View>
                ) : messages.map((message) => {
                  const selected = selectedMessageId === message.id;
                  return (
                    <View key={message.id} style={[styles.messageCard, !message.read && styles.messageCardUnread]}>
                      <TouchableOpacity style={styles.messageHeader} onPress={() => openMessage(message.id)} activeOpacity={0.8}>
                        <View style={styles.senderIcon}>
                          <Ionicons name={senderIcon(message.senderKind)} size={22} color="#E7C77A" />
                        </View>
                        <View style={styles.messageHeaderText}>
                          <View style={styles.senderRow}>
                            <Text style={styles.sender}>{message.sender}</Text>
                            {!message.read && <View style={styles.unreadDot} />}
                          </View>
                          <Text style={styles.subject}>{message.subject}</Text>
                        </View>
                        <Ionicons name={selected ? "chevron-up" : "chevron-down"} size={20} color="#C4943A" />
                      </TouchableOpacity>
                      {selected && (
                        <View style={styles.messageBody}>
                          <Text selectable style={styles.bodyText}>
                            {splitBoldMailText(message.body).map((segment, index) => (
                              <Text key={`${message.id}-body-${index}`} style={segment.bold ? styles.bodyBold : undefined}>
                                {segment.text}
                              </Text>
                            ))}
                          </Text>
                          {message.rewards.length > 0 && (
                            <View style={styles.rewardsBox}>
                              <Text style={styles.rewardsTitle}>Package contents</Text>
                              {message.rewards.map((reward, index) => (
                                <View key={`${message.id}-reward-${index}`} style={styles.rewardRow}>
                                  <Ionicons name="gift-outline" size={16} color="#D6A33B" />
                                  <Text style={styles.rewardText}>{mailboxRewardLabel(reward)}</Text>
                                </View>
                              ))}
                            </View>
                          )}
                          {message.rewards.length > 0 && (
                            <TouchableOpacity
                              style={[styles.claimButton, (message.claimed || busy) && styles.buttonDisabled]}
                              disabled={message.claimed || busy}
                              onPress={() => { void claimMessage(message.id); }}
                              activeOpacity={0.8}
                            >
                              <Ionicons name={message.claimed ? "checkmark-circle" : "download-outline"} size={19} color="#FFF4D6" />
                              <Text style={styles.claimText}>{message.claimed ? "Claimed" : "Claim Package"}</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {view === "send" && (
              <View style={styles.panel}>
                <View style={styles.sendIconWrap}>
                  <Ionicons name="paper-plane-outline" size={32} color="#E7C77A" />
                </View>
                <Text style={styles.sendTitle}>Send Mail</Text>
                <Text style={styles.sendDescription}>
                  Enter a bonus code. Valid rewards will arrive as a claimable message in your inbox.
                </Text>
                <Text style={styles.inputLabel}>Bonus code</Text>
                <TextInput
                  value={bonusCode}
                  onChangeText={setBonusCode}
                  placeholder="ENTER CODE"
                  placeholderTextColor="rgba(240,232,213,0.35)"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="send"
                  onSubmitEditing={() => { void sendBonusCode(); }}
                  editable={!busy}
                  style={styles.codeInput}
                  accessibilityLabel="Bonus code"
                />
                <TouchableOpacity
                  style={[styles.sendButton, busy && styles.buttonDisabled]}
                  disabled={busy}
                  onPress={() => { void sendBonusCode(); }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="send" size={18} color="#FFF4D6" />
                  <Text style={styles.sendButtonText}>{busy ? "Sending..." : "Send"}</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {feedback && <Text selectable style={styles.feedback}>{feedback}</Text>}
      </ScrollView>

      <View style={{ paddingBottom: insets.bottom, backgroundColor: "rgba(10,5,1,0.98)" }}>
        <TavernLocationBar current="mail" mailboxUnread={unreadCount > 0} />
      </View>
    </View>
    </TavernLocationTransition>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0500" },
  backgroundGlow: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#241306",
    opacity: 0.78,
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 14, paddingBottom: 20, gap: 12 },
  lockedPanel: {
    alignItems: "center", gap: 10, padding: 24, borderRadius: 18, borderCurve: "continuous",
    borderWidth: 1.5, borderColor: "rgba(196,148,58,0.45)", backgroundColor: "rgba(18,9,2,0.94)",
  },
  lockedTitle: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 17 },
  lockedText: { color: "rgba(240,232,213,0.68)", fontSize: 13, lineHeight: 19, textAlign: "center" },
  tabRow: { flexDirection: "row", gap: 8 },
  tabButton: {
    flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
    borderRadius: 13, borderCurve: "continuous", borderWidth: 1, borderColor: "rgba(196,148,58,0.42)",
    backgroundColor: "rgba(34,17,4,0.94)",
  },
  tabButtonActive: { backgroundColor: "#C4943A", borderColor: "#E7C77A" },
  tabText: { color: "#E7C77A", fontFamily: "Oldenburg", fontSize: 13 },
  tabTextActive: { color: "#160B03", fontWeight: "700" },
  unreadBadge: {
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, textAlign: "center", textAlignVertical: "center",
    overflow: "hidden", backgroundColor: "#B9382D", color: "#FFF", fontSize: 10, fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  panel: {
    borderRadius: 18, borderCurve: "continuous", borderWidth: 1.5, borderColor: "rgba(196,148,58,0.52)",
    backgroundColor: "rgba(18,9,2,0.95)", padding: 14, gap: 10,
  },
  panelHeadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  panelTitle: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 17 },
  messageCount: { color: "rgba(231,199,122,0.65)", fontSize: 11, fontVariant: ["tabular-nums"] },
  emptyState: { alignItems: "center", paddingVertical: 28, paddingHorizontal: 18, gap: 8 },
  emptyTitle: { color: "#F0E8D5", fontFamily: "Oldenburg", fontSize: 14 },
  emptyText: { color: "rgba(240,232,213,0.58)", fontSize: 12, lineHeight: 18, textAlign: "center" },
  messageCard: {
    borderRadius: 13, borderCurve: "continuous", borderWidth: 1, borderColor: "rgba(196,148,58,0.25)",
    backgroundColor: "rgba(48,27,7,0.68)", overflow: "hidden",
  },
  messageCardUnread: { borderColor: "rgba(231,199,122,0.72)", backgroundColor: "rgba(68,39,9,0.80)" },
  messageHeader: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 10, padding: 10 },
  senderIcon: {
    width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(196,148,58,0.42)", backgroundColor: "rgba(12,6,1,0.62)",
  },
  messageHeaderText: { flex: 1, gap: 4 },
  senderRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  sender: { color: "#C4943A", fontFamily: "Oldenburg", fontSize: 11 },
  subject: { color: "#F0E8D5", fontFamily: "Oldenburg", fontSize: 13, lineHeight: 18 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#69C56D" },
  messageBody: { paddingHorizontal: 12, paddingBottom: 12, gap: 11 },
  bodyText: { color: "rgba(240,232,213,0.82)", fontSize: 13, lineHeight: 20 },
  bodyBold: { color: "#F5E6C8", fontWeight: "800" },
  rewardsBox: {
    gap: 7, padding: 10, borderRadius: 11, borderWidth: 1, borderColor: "rgba(214,163,59,0.34)",
    backgroundColor: "rgba(11,6,1,0.62)",
  },
  rewardsTitle: { color: "#E7C77A", fontFamily: "Oldenburg", fontSize: 11 },
  rewardRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  rewardText: { flex: 1, color: "#F0E8D5", fontSize: 12, fontVariant: ["tabular-nums"] },
  claimButton: {
    minHeight: 46, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1.5, borderColor: "#D6A33B", backgroundColor: "rgba(112,73,18,0.92)",
  },
  claimText: { color: "#FFF4D6", fontFamily: "Oldenburg", fontSize: 13 },
  buttonDisabled: { opacity: 0.45 },
  sendIconWrap: {
    alignSelf: "center", width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "rgba(196,148,58,0.48)", backgroundColor: "rgba(48,27,7,0.72)",
  },
  sendTitle: { color: "#F5E6C8", fontFamily: "Oldenburg", fontSize: 18, textAlign: "center" },
  sendDescription: { color: "rgba(240,232,213,0.68)", fontSize: 13, lineHeight: 19, textAlign: "center" },
  inputLabel: { color: "#C4943A", fontFamily: "Oldenburg", fontSize: 11, paddingTop: 5 },
  codeInput: {
    minHeight: 50, borderRadius: 12, borderWidth: 1.5, borderColor: "rgba(196,148,58,0.52)",
    backgroundColor: "rgba(7,4,1,0.78)", color: "#F5E6C8", paddingHorizontal: 14,
    fontFamily: "Oldenburg", fontSize: 15, letterSpacing: 1.2,
  },
  sendButton: {
    minHeight: 48, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1.5, borderColor: "#D6A33B", backgroundColor: "rgba(112,73,18,0.92)",
  },
  sendButtonText: { color: "#FFF4D6", fontFamily: "Oldenburg", fontSize: 13 },
  feedback: {
    color: "#F5E6C8", backgroundColor: "rgba(54,28,6,0.96)", borderRadius: 11, padding: 11,
    textAlign: "center", fontSize: 12, lineHeight: 17,
  },
});
