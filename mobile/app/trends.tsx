import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/src/components/ui";
import { colors, font } from "@/src/theme";
import { cachedGet } from "@/src/lib/api";

type Rnd = { id: string; date?: string; course?: string; score: number; par: number; toPar: number; putts: number; girPct: number };

function Bars({ title, data, fmt, color, lowerBetter }: { title: string; data: number[]; fmt: (n: number) => string; color: string; lowerBetter?: boolean }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = Math.max(max - min, 1);
  const first = data[0], last = data[data.length - 1];
  const improving = lowerBetter ? last < first : last > first;
  return (
    <View style={styles.card} testID={`trend-${title.replace(/\s/g, "-").toLowerCase()}`}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{title}</Text>
        {data.length > 1 && (
          <Text style={[styles.trendTag, { color: improving ? colors.green : colors.red }]}>
            {improving ? "▲ IMPROVING" : "▼ WATCH"}
          </Text>
        )}
      </View>
      <View style={styles.barsRow}>
        {data.map((v, i) => {
          const h = 20 + ((v - min) / range) * 70;
          return (
            <View key={i} style={styles.barCol}>
              <Text style={styles.barVal}>{fmt(v)}</Text>
              <View style={[styles.bar, { height: h, backgroundColor: i === data.length - 1 ? color : `${color}80` }]} />
              <Text style={styles.barIdx}>{i + 1}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function Trends() {
  const insets = useSafeAreaInsets();
  const [rounds, setRounds] = useState<Rnd[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    cachedGet<any>("/stats", "stats")
      .then((s) => setRounds([...(s.recentRounds || [])].reverse()))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader overline="ANALYTICS" title="Performance Trends" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 14 }} testID="trends-screen">
        {loaded && rounds.length === 0 && (
          <Text style={styles.empty}>Play and save a few rounds to see your trends here.</Text>
        )}
        {rounds.length > 0 && (
          <>
            <Text style={[styles.sub, { fontFamily: font.headBold }]}>Your last {rounds.length} round{rounds.length === 1 ? "" : "s"}, oldest → newest</Text>
            <Bars title="Score to Par" data={rounds.map((r) => r.toPar)} fmt={(n) => (n > 0 ? `+${n}` : `${n}`)} color={colors.charcoal} lowerBetter />
            <Bars title="Putts" data={rounds.map((r) => r.putts)} fmt={(n) => `${n}`} color={colors.water} lowerBetter />
            <Bars title="GIR %" data={rounds.map((r) => Math.round(r.girPct))} fmt={(n) => `${n}`} color={colors.green} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sub: { fontSize: 13, fontWeight: "700", color: colors.zinc500 },
  empty: { fontSize: 14, color: colors.zinc500, textAlign: "center", marginTop: 40 },
  card: { backgroundColor: "#fff", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.zinc200 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: "900", color: colors.charcoal, letterSpacing: 0.3 },
  trendTag: { fontSize: 11, fontWeight: "900" },
  barsRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 4, minHeight: 110 },
  barCol: { flex: 1, alignItems: "center", gap: 3 },
  barVal: { fontSize: 9, fontWeight: "800", color: colors.zinc500 },
  bar: { width: "72%", borderRadius: 5 },
  barIdx: { fontSize: 9, fontWeight: "700", color: colors.zinc400 },
});
