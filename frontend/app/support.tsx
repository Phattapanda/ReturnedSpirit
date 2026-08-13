import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BG = require("../assets/images/bg-tavern.jpg");

export default function Support() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const handleSend = () => {
    if (!message.trim()) return;
    setSent(true);
    setMessage("");
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Image source={BG} style={styles.bgImage} resizeMode="cover" />
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
          <Text style={styles.noticeText}>Anonymous by default — no name or email required.</Text>
        </View>

        {sent ? (
          <View style={styles.successBox} testID="success-message">
            <MaterialCommunityIcons name="check-circle-outline" size={48} color="#6B7C55" />
            <Text style={styles.successTitle}>Message Sent!</Text>
            <Text style={styles.successSub}>Thank you for your feedback. We'll get back to you soon.</Text>
            <TouchableOpacity testID="send-another-button" style={styles.sendAnotherBtn} onPress={() => setSent(false)}>
              <Text style={styles.sendAnotherText}>Send another</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.label}>MESSAGE</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                testID="support-message-input"
                style={styles.messageInput}
                value={message}
                onChangeText={setMessage}
                placeholder="Found a bug, have a suggestion, or just want to say hi?"
                placeholderTextColor="#A89880"
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />
            </View>

            <Text style={styles.label}>SCREENSHOT (OPTIONAL)</Text>
            <TouchableOpacity testID="add-screenshot-button" style={styles.screenshotBtn}>
              <MaterialCommunityIcons name="image-plus" size={18} color="#C4614A" />
              <Text style={styles.screenshotText}>Add a screenshot</Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="send-message-button"
              style={[styles.sendBtn, !message.trim() && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!message.trim()}
            >
              <MaterialCommunityIcons name="send-outline" size={18} color="#2C1810" />
              <Text style={styles.sendBtnText}>Send message</Text>
            </TouchableOpacity>

            <Text style={styles.privacyNote}>
              We only receive your message and (if you add one) the screenshot.
            </Text>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F0EDE4" },
  bgImage: { ...StyleSheet.absoluteFillObject, opacity: 0.10 },
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
