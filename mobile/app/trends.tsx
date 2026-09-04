import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ScreenHeader } from "@/src/components/ui";
import { colors, font } from "@/src/theme";
import { cachedGet } from "@/src/lib/api";

type Rnd = { id: string; date?: string; course?: string; score: number; par: number; toPar: number; putts: number; girPct: number };

function Bars({ title, rounds, value, fmt, color, lowerBetter, onBar }: {
  title: string;
  rounds: Rnd[];
  value: (r: Rnd) => number;
  fmt: (n: number) => string;
  color: string;
  lowerBetter?: boolean;
  onBar: (r: Rnd) => void;
}) {
  const data = rounds.map(value);
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
        {rounds.map((r, i) => {
          const v = data[i];
          const h = 20 + ((v - min) / range) * 70;
          return (
            <Pressable key={r.id || i} style={styles.barCol} testID={`trend-${title.replace(/\s/g, "-").toLowerCase()}-bar-${i}`} onPress={() => onBar(r)}>
              <Text style={styles.barVal}>{fmt(v)}</Text>
              <View style={[styles.bar, { height: h, backgroundColor: i === data.length - 1 ? color : `${color}80` }]} />
              <Text style={styles.barIdx}>{i + 1}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const RANGES: [string, number | "all"][] = [["LAST 5", 5], ["LAST 10", 10], ["ALL", "all"]];

export default function Trends() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [rounds, setRounds] = useState<Rnd[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [range, setRange] = useState<number | "all">("all");

  useEffect(() => {
    cachedGet<any>("/stats", "stats")
      .then((s) => setRounds([...(s.recentRounds || [])].reverse()))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const filtered = useMemo(
    () => (range === "all" ? rounds : rounds.slice(-(range as number))),
    [rounds, range],
  );

  const openRound = (r: Rnd) => {
    if (r.id) router.push(`/rounds/${r.id}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader overline="ANALYTICS" title="Performance Trends" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 14 }} testID="trends-screen">
        {loaded && rounds.length === 0 && (
          <Text style={styles.empty}>Play and save a few rounds to see your trends here.</Text>
        )}
        {rounds.length > 0 && (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {RANGES.map(([label, val]) => {
                const active = range === val;
                return (
                  <Pressable
                    key={label}
                    testID={`trend-range-${String(val).toLowerCase()}`}
                    onPress={() => setRange(val)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={[styles.sub, { fontFamily: font.headBold }]}>
              Showing {filtered.length} round{filtered.length === 1 ? "" : "s"}, oldest → newest · tap a bar to open
            </Text>
            <Bars title="Score to Par" rounds={filtered} value={(r) => r.toPar} fmt={(n) => (n > 0 ? `+${n}` : `${n}`)} color={colors.charcoal} lowerBetter onBar={openRound} />
            <Bars title="Putts" rounds={filtered} value={(r) => r.putts} fmt={(n) => `${n}`} color={colors.water} lowerBetter onBar={openRound} />
            <Bars title="GIR %" rounds={filtered} value={(r) => Math.round(r.girPct)} fmt={(n) => `${n}`} color={colors.green} onBar={openRound} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sub: { fontSize: 13, fontWeight: "700", color: colors.zinc500 },
  empty: { fontSize: 14, color: colors.zinc500, textAlign: "center", marginTop: 40 },
  chipRow: { gap: 8, paddingRight: 8 },
  chip: { flexShrink: 0, height: 36, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.zinc100, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.zinc200 },
  chipActive: { backgroundColor: colors.charcoal, borderColor: colors.charcoal },
  chipTxt: { fontSize: 11, fontWeight: "900", letterSpacing: 0.5, color: colors.zinc500 },
  chipTxtActive: { color: "#fff" },
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
