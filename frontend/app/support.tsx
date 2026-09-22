import { useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { fetch } from "expo/fetch";

const BG = require("../assets/images/mainpage.png");

const CATEGORIES = [
  { key: "bug", label: "Bug" },
  { key: "idea", label: "Idea" },
  { key: "other", label: "Other" },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["key"];

export default function Support() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<CategoryKey>("other");
  const [replyEmail, setReplyEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [screenshot, setScreenshot] = useState<{ uri: string; base64: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const busy = useRef(false);

  async function chooseScreenshot() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.8, allowsMultipleSelection: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset.base64 || asset.base64.length > 4 * 1024 * 1024 || asset.width * asset.height > 12_000_000) {
        setSendError("Choose a screenshot under 3 MB and 12 megapixels.");
        return;
      }
      setScreenshot({ uri: asset.uri, base64: asset.base64 });
      setSendError(null);
    } catch { setSendError("Could not open the image library. Please try again."); }
  }

  const handleSend = async () => {
    if (!message.trim() || busy.current) return;
    const address = replyEmail.trim();
    if (address && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setEmailError("Enter a valid email address or leave this field empty.");
      return;
    }
    setEmailError(null);
    const baseUrl = process.env.EXPO_PUBLIC_BACKEND_URL?.replace(/\/$/, "");
    if (!baseUrl || !baseUrl.startsWith("https://")) {
      setSendError("Support sending is not configured yet. Your draft has been kept.");
      return;
    }
    busy.current = true;
    setSending(true);
    setSendError(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(`${baseUrl}/api/support`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim(), category, reply_email: address || null, screenshot: screenshot?.base64 ?? null }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok || result.accepted !== true) {
        throw new Error(typeof result.detail === "string" ? result.detail : "The server could not confirm sending. Your draft has been kept.");
      }
      setSent(true);
      setMessage("");
      setReplyEmail("");
      setCategory("other");
      setScreenshot(null);
    } catch (error) {
      setSendError(error instanceof Error && error.name !== "AbortError" && !error.message.toLowerCase().includes("fetch")
        ? error.message : "Could not confirm sending. Check your connection. Your draft has been kept; retrying may send a duplicate.");
    } finally {
      clearTimeout(timer);
      busy.current = false;
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Image source={BG} style={styles.bgImage} contentFit="cover" contentPosition="top center" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity testID="back-button" style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color="#2C1810" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Support</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Privacy notice */}
        <View style={styles.notice}>
          <MaterialCommunityIcons name="shield-lock-outline" size={16} color="#8B7355" />
          <Text style={styles.noticeText}>No name or email required. Only add an email address if you would like a reply.</Text>
        </View>

        {sent ? (
          <View style={styles.successBox} testID="success-message">
            <MaterialCommunityIcons name="check-circle-outline" size={48} color="#6B7C55" />
            <Text style={styles.successTitle}>Message submitted!</Text>
            <Text style={styles.successSub}>Thank you for your feedback!</Text>
            <TouchableOpacity testID="send-another-button" style={styles.sendAnotherBtn} onPress={() => setSent(false)}>
              <Text style={styles.sendAnotherText}>Send another</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.label}>CATEGORY</Text>
            <View style={styles.categoryRow}>
              {CATEGORIES.map((cat) => {
                const active = category === cat.key;
                return (
                  <TouchableOpacity
                    key={cat.key}
                    testID={`support-category-${cat.key}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setCategory(cat.key)}
                    disabled={sending}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{cat.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>MESSAGE</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                testID="support-message-input"
                style={styles.messageInput}
                value={message}
                editable={!sending}
                maxLength={5000}
                onChangeText={setMessage}
                placeholder="Found a bug, have a suggestion, or just want to say hi?"
                placeholderTextColor="#A89880"
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />
            </View>

            <Text style={styles.label}>EMAIL ADDRESS (OPTIONAL)</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                testID="support-email-input"
                accessibilityLabel="Email address, optional, only for a reply"
                style={styles.emailInput}
                value={replyEmail}
                editable={!sending}
                onChangeText={(value) => { setReplyEmail(value); setEmailError(null); }}
                placeholder="Only if you would like a reply"
                placeholderTextColor="#A89880"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={254}
              />
            </View>
            <Text selectable style={styles.privacyNote}>Leave this empty to submit without a contact address. Without an email address, we cannot reply to you.</Text>
            {emailError && <Text accessibilityLiveRegion="polite" style={styles.emailError}>{emailError}</Text>}

            <Text style={styles.label}>SCREENSHOT (OPTIONAL)</Text>
            <TouchableOpacity testID="add-screenshot-button" style={styles.screenshotBtn} onPress={() => { void chooseScreenshot(); }} disabled={sending}>
              <MaterialCommunityIcons name="image-plus" size={18} color="#C4614A" />
              <Text style={styles.screenshotText}>{screenshot ? "Replace screenshot" : "Add a screenshot"}</Text>
            </TouchableOpacity>
            {screenshot && <View style={{ gap: 8 }}>
              <Image source={{ uri: screenshot.uri }} style={{ width: "100%", height: 180 }} contentFit="contain" accessibilityLabel="Selected screenshot" />
              <TouchableOpacity disabled={sending} onPress={() => setScreenshot(null)}><Text style={styles.screenshotText}>Remove screenshot</Text></TouchableOpacity>
            </View>}
            {sendError && <Text selectable accessibilityLiveRegion="polite" style={styles.emailError}>{sendError}</Text>}

            <TouchableOpacity
              testID="send-message-button"
              style={[styles.sendBtn, (!message.trim() || sending) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!message.trim() || sending}
            >
              <MaterialCommunityIcons name="send-outline" size={18} color="#2C1810" />
              <Text style={styles.sendBtnText}>{sending ? "Sending…" : "Send message"}</Text>
            </TouchableOpacity>

            <Text style={styles.privacyNote}>
              Your email address is optional and will only be used to reply to your support request. Avoid including personal information in your message or screenshot if you do not want to share it.
            </Text>
            <Text selectable style={styles.privacyNote}>By sending, you share your message, selected screenshot and optional contact address with arcades.soijanda@gmail.com through our support server and email provider.</Text>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F0EDE4" },
  bgImage: { ...StyleSheet.absoluteFill, opacity: 0.10 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "700",
    color: "#2C1810",
    fontFamily: "Oldenburg",
  },
  headerSpacer: { width: 40 },
  content: { paddingHorizontal: 16, gap: 16 },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.65)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  noticeText: { flex: 1, fontSize: 13, color: "#8B7355" },
  label: { fontSize: 11, fontWeight: "700", color: "#8B7355", letterSpacing: 1.2 },
  categoryRow: { flexDirection: "row", gap: 10 },
  chip: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.12)",
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  chipActive: {
    borderColor: "#C4614A",
    backgroundColor: "rgba(196,97,74,0.14)",
  },
  chipText: { fontSize: 15, fontWeight: "600", color: "#8B7355" },
  chipTextActive: { color: "#C4614A" },
  inputWrapper: {
    backgroundColor: "rgba(255,255,255,0.8)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  messageInput: {
    padding: 14,
    fontSize: 15,
    color: "#2C1810",
    minHeight: 130,
  },
  emailInput: { padding: 14, fontSize: 15, color: "#2C1810" },
  emailError: { color: "#A32A20", fontSize: 13 },
  screenshotBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(196,97,74,0.4)",
    borderStyle: "dashed",
    paddingVertical: 14,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  screenshotText: { color: "#C4614A", fontSize: 15, fontWeight: "600" },
  sendBtn: {
    backgroundColor: "#D8CEBB",
    borderRadius: 24,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { fontSize: 16, fontWeight: "700", color: "#2C1810", fontFamily: "Oldenburg" },
  privacyNote: { textAlign: "center", fontSize: 12, color: "#A89880", lineHeight: 18 },
  successBox: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  successTitle: { fontSize: 22, fontWeight: "700", color: "#2C1810", fontFamily: "Oldenburg" },
  successSub: { fontSize: 14, color: "#8B7355", textAlign: "center", lineHeight: 20 },
  sendAnotherBtn: { marginTop: 8 },
  sendAnotherText: { color: "#C4943A", fontSize: 14, fontWeight: "600" },
});
