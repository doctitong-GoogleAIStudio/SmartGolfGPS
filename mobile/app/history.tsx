import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font } from "@/src/theme";
import { api } from "@/src/lib/api";
import { ScreenHeader } from "@/src/components/ui";

export default function History() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rounds, setRounds] = useState<any[]>([]);

  useFocusEffect(
    useCallback(() => {
      api.get("/rounds?status=completed").then(setRounds).catch(() => {});
    }, [])
  );

  const summary = (r: any) => {
    const played = r.scores.filter((s: any) => s.score);
    const total = played.reduce((a: number, s: any) => a + s.score, 0);
    const par = played.reduce((a: number, s: any) => a + s.par, 0);
    return { total, toPar: total - par, holes: played.length };
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top, backgroundColor: colors.charcoal }} />
      <ScreenHeader overline="HISTORY" title="Round History" onBack={() => router.back()} testID="history-screen" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}>
        {rounds.length === 0 && <Text style={styles.empty} testID="history-empty">No completed rounds yet.</Text>}
        {rounds.map((r) => {
          const s = summary(r);
          return (
            <Pressable key={r.id} testID={`history-round-${r.id}`} onPress={() => router.push(`/rounds/${r.id}`)} style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{r.courseName}</Text>
                <Text style={styles.meta}>{new Date(r.startedAt).toLocaleDateString()} · {s.holes} holes · {r.player}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.total, { fontFamily: font.num }]}>{s.total || "-"}</Text>
                <Text style={[styles.toPar, { color: s.toPar > 0 ? colors.red : colors.fairway }]}>{s.toPar > 0 ? `+${s.toPar}` : s.toPar}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { fontSize: 14, color: colors.zinc400, fontWeight: "700", textAlign: "center", marginTop: 48 },
  card: { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.zinc200, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 16, flexDirection: "row", alignItems: "center" },
  name: { fontWeight: "800", fontSize: 14, color: colors.charcoal },
  meta: { fontSize: 10, color: colors.zinc400, fontWeight: "700", marginTop: 2 },
  total: { fontSize: 30, color: colors.charcoal },
  toPar: { fontSize: 10, fontWeight: "900" },
});
