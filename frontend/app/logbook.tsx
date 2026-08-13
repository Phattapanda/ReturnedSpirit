import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { loadLogbook, type LogEntry } from "@/src/game/logbook";

export default function LogbookScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [entries, setEntries] = useState<LogEntry[]>([]);

  useEffect(() => {
    loadLogbook().then(setEntries).catch(() => {});
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
          <Ionicons name="chevron-back" size={22} color="#C4943A" />
        </TouchableOpacity>
        <Text style={styles.title}>Logbook</Text>
        <View style={{ width: 38 }} />
      </View>
      <View style={styles.divider} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {entries.length === 0 ? (
          <Text style={styles.empty}>No entries yet.</Text>
        ) : (
          entries.map((entry) => (
            <View key={entry.id} style={styles.entry}>
              <Text style={styles.entryMeta}>
                {entry.day} · {entry.location.charAt(0).toUpperCase() + entry.location.slice(1)}
              </Text>
              <Text style={styles.entrySpeaker}>{entry.speaker}</Text>
              <Text style={styles.entryText}>{entry.text}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#110900",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(196,148,58,0.12)",
  },
  title: {
    color: "#C4943A",
    fontFamily: "Oldenburg",
    fontSize: 18,
    letterSpacing: 0.6,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(196,148,58,0.22)",
    marginHorizontal: 16,
    marginBottom: 8,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  empty: {
    color: "rgba(240,232,213,0.45)",
    fontFamily: "Oldenburg",
    fontSize: 13,
    textAlign: "center",
    marginTop: 32,
  },
  entry: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(196,148,58,0.12)",
    paddingVertical: 12,
  },
  entryMeta: {
    color: "rgba(196,148,58,0.6)",
    fontFamily: "Oldenburg",
    fontSize: 11,
    marginBottom: 3,
  },
  entrySpeaker: {
    color: "#C4943A",
    fontFamily: "Oldenburg",
    fontSize: 12,
    marginBottom: 4,
  },
  entryText: {
    color: "#F0E8D5",
    fontFamily: "Oldenburg",
    fontSize: 13,
    lineHeight: 20,
    fontStyle: "italic",
  },
});
