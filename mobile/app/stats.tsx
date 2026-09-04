import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font } from "@/src/theme";
import { api } from "@/src/lib/api";
import { useSettings } from "@/src/context/SettingsContext";
import { mToYd } from "@/src/lib/geo";
import { ScreenHeader, Overline } from "@/src/components/ui";

export default function Stats() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    api.get("/stats").then(setStats).catch(() => {});
  }, []);

  if (!stats)
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.green} />
      </View>
    );

  const drv = stats.avgDriverMeters ? (settings.distanceUnit === "yd" ? `${Math.round(mToYd(stats.avgDriverMeters))} yd` : `${Math.round(stats.avgDriverMeters)} m`) : "--";
  const chart = [...(stats.recentRounds || [])].reverse().map((r: any, i: number) => ({ name: `R${i + 1}`, score: r.score }));
  const maxScore = Math.max(1, ...chart.map((c: any) => c.score));

  const cards: [string, any][] = [
    ["ROUNDS PLAYED", stats.roundsPlayed],
    ["AVG SCORE", stats.avgScore ?? "--"],
    ["BEST SCORE", stats.bestScore ?? "--"],
    ["AVG PUTTS", stats.avgPutts ?? "--"],
    ["FAIRWAY %", stats.avgFairwayPct != null ? `${stats.avgFairwayPct}%` : "--"],
    ["GIR %", stats.avgGirPct != null ? `${stats.avgGirPct}%` : "--"],
    ["AVG DRIVER", drv],
    ["SHOTS TRACKED", stats.totalShots],
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top, backgroundColor: colors.charcoal }} />
      <ScreenHeader overline="STATISTICS" title="My Game" onBack={() => router.back()} testID="stats-screen" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        <Pressable onPress={() => router.push("/trends")} testID="view-trends-btn" style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48, borderRadius: 14, backgroundColor: colors.charcoal }}>
          <Text style={{ color: colors.gold, fontWeight: "900", letterSpacing: 1 }}>VIEW PERFORMANCE TRENDS</Text>
        </Pressable>
        <View style={styles.grid}>
          {cards.map(([l, v]) => (
            <View key={l} style={styles.card} testID={`stat-${l.replace(/[\s%]/g, "-").toLowerCase()}`}>
              <Text style={styles.cardLbl}>{l}</Text>
              <Text style={[styles.cardVal, { fontFamily: font.num }]}>{v}</Text>
            </View>
          ))}
        </View>

        {chart.length > 0 && (
          <View style={styles.chartCard}>
            <Overline style={{ marginBottom: 12 }}>RECENT ROUNDS</Overline>
            <View style={styles.chart}>
              {chart.map((c: any, i: number) => (
                <View key={i} style={styles.barCol}>
                  <Text style={[styles.barVal, { fontFamily: font.num }]}>{c.score}</Text>
                  <View style={[styles.bar, { height: 20 + (c.score / maxScore) * 100 }]} />
                  <Text style={styles.barLbl}>{c.name}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: { width: "47.5%", backgroundColor: "#fff", borderWidth: 1, borderColor: colors.zinc200, borderRadius: 18, paddingVertical: 16, alignItems: "center" },
  cardLbl: { fontSize: 9, letterSpacing: 1.5, fontWeight: "800", color: colors.zinc400 },
  cardVal: { fontSize: 30, color: colors.charcoal, marginTop: 4 },
  chartCard: { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.zinc200, borderRadius: 18, padding: 16 },
  chart: { flexDirection: "row", alignItems: "flex-end", gap: 8, height: 160 },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  barVal: { fontSize: 14, color: colors.charcoal, marginBottom: 4 },
  bar: { width: "70%", backgroundColor: colors.green, borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  barLbl: { fontSize: 10, fontWeight: "700", color: colors.zinc400, marginTop: 4 },
});
