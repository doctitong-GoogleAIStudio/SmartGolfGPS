import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, font } from "@/src/theme";
import { api, getActiveRound, setActiveRound } from "@/src/lib/api";
import { Overline } from "@/src/components/ui";
import { toast } from "@/src/lib/toast";

type HoleScore = { hole: number; par: number; score?: number; putts?: number; penalty?: number; fairway?: boolean | null; gir?: boolean | null };
type Round = { id: string; courseName: string; currentHole: number; scores: HoleScore[] };

function Stepper({ value, onChange, min = 0, testId }: { value?: number; onChange: (v: number) => void; min?: number; testId: string }) {
  return (
    <View style={styles.stepper}>
      <Pressable testID={`${testId}-minus`} onPress={() => onChange(Math.max(min, (value || 0) - 1))} style={styles.stepBtn}>
        <Ionicons name="remove" size={16} color={colors.charcoal} />
      </Pressable>
      <Text style={[styles.stepVal, { fontFamily: font.num }]} testID={`${testId}-value`}>
        {value ?? "-"}
      </Text>
      <Pressable testID={`${testId}-plus`} onPress={() => onChange((value || 0) + 1)} style={styles.stepBtn}>
        <Ionicons name="add" size={16} color={colors.charcoal} />
      </Pressable>
    </View>
  );
}

export default function Scorecard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [round, setRound] = useState<Round | null>(null);
  const [holeIdx, setHoleIdx] = useState(0);
  const [noRound, setNoRound] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const a = await getActiveRound();
        if (!a) {
          if (active) setNoRound(true);
          return;
        }
        try {
          const r = await api.get(`/rounds/${a.id}`);
          if (!active) return;
          setNoRound(false);
          setRound(r);
          setHoleIdx((r.currentHole || 1) - 1);
        } catch {
          toast.error("Could not load round");
        }
      })();
      return () => {
        active = false;
      };
    }, [])
  );

  if (noRound) {
    return (
      <View style={styles.center} testID="no-round-screen">
        <Text style={[styles.h1, { fontFamily: font.headBold }]}>No active round</Text>
        <Pressable style={styles.startBtn} onPress={() => router.push("/start-round")} testID="score-start-round-btn">
          <Text style={styles.startTxt}>START ROUND</Text>
        </Pressable>
      </View>
    );
  }
  if (!round)
    return (
      <View style={styles.center}>
        <Text style={styles.loading}>Loading…</Text>
      </View>
    );

  const scores = round.scores;
  const s = scores[holeIdx];

  const patch = (p: Partial<HoleScore>) => {
    const next = scores.map((x, i) => (i === holeIdx ? { ...x, ...p } : x));
    setRound({ ...round, scores: next });
    api.put(`/rounds/${round.id}`, { scores: next }).catch(() => toast.error("Save failed (offline?)"));
  };

  const played = scores.filter((x) => x.score);
  const sum = (arr: HoleScore[], f: (x: HoleScore) => number | undefined) => arr.reduce((a, x) => a + (f(x) || 0), 0);
  const front = scores.slice(0, 9).filter((x) => x.score);
  const back = scores.slice(9).filter((x) => x.score);
  const toPar = played.length ? sum(played, (x) => x.score) - sum(played, (x) => x.par) : null;

  const endRound = () => {
    Alert.alert("End round?", "This will mark the round as completed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End Round",
        onPress: async () => {
          await api.put(`/rounds/${round.id}`, { status: "completed" });
          await setActiveRound(null);
          toast.success("Round completed!");
          router.push(`/rounds/${round.id}`);
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top, backgroundColor: colors.charcoal }} />
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Overline style={{ color: colors.gold }}>SCORECARD</Overline>
          <Text style={[styles.headerTitle, { fontFamily: font.headBold }]}>{round.courseName}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        <View style={styles.editor} testID="hole-score-editor">
          <View style={styles.holeSelectRow}>
            <Pressable disabled={holeIdx === 0} onPress={() => setHoleIdx(holeIdx - 1)} style={styles.holeNav} testID="prev-hole-score-btn">
              <Ionicons name="chevron-back" size={18} color={holeIdx === 0 ? colors.zinc300 : colors.charcoal} />
            </Pressable>
            <Text style={[styles.holeLabel, { fontFamily: font.headBold }]}>
              HOLE {s.hole} · PAR {s.par}
            </Text>
            <Pressable disabled={holeIdx === scores.length - 1} onPress={() => setHoleIdx(holeIdx + 1)} style={styles.holeNav} testID="next-hole-score-btn">
              <Ionicons name="chevron-forward" size={18} color={holeIdx === scores.length - 1 ? colors.zinc300 : colors.charcoal} />
            </Pressable>
          </View>
          <View style={styles.grid2}>
            <View style={styles.cell}>
              <Overline>SCORE</Overline>
              <Stepper value={s.score} onChange={(v) => patch({ score: v })} min={1} testId="score" />
            </View>
            <View style={styles.cell}>
              <Overline>PUTTS</Overline>
              <Stepper value={s.putts} onChange={(v) => patch({ putts: v })} testId="putts" />
            </View>
            <View style={styles.cell}>
              <Overline>PENALTY</Overline>
              <Stepper value={s.penalty} onChange={(v) => patch({ penalty: v })} testId="penalty" />
            </View>
            <View style={styles.cell}>
              <Overline>FAIRWAY / GIR</Overline>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                <Pressable
                  testID="fairway-toggle"
                  onPress={() => patch({ fairway: s.fairway === true ? false : true })}
                  style={[styles.fwBtn, s.fairway === true ? styles.fwOn : s.fairway === false ? styles.fwOff : styles.fwNull]}
                >
                  <Text style={[styles.fwTxt, { color: s.fairway === true ? "#fff" : s.fairway === false ? colors.red : colors.zinc500 }]}>
                    FW {s.fairway === true ? "✓" : s.fairway === false ? "✕" : "?"}
                  </Text>
                </Pressable>
                <Pressable
                  testID="gir-toggle"
                  onPress={() => patch({ gir: s.gir === true ? false : true })}
                  style={[styles.fwBtn, s.gir === true ? styles.fwOn : s.gir === false ? styles.fwOff : styles.fwNull]}
                >
                  <Text style={[styles.fwTxt, { color: s.gir === true ? "#fff" : s.gir === false ? colors.red : colors.zinc500 }]}>
                    GIR {s.gir === true ? "✓" : s.gir === false ? "✕" : "?"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.totals} testID="score-totals">
          {[
            ["TOTAL", sum(played, (x) => x.score) || "-"],
            ["TO PAR", toPar == null ? "-" : `${toPar >= 0 ? "+" : ""}${toPar}`],
            ["FRONT 9", sum(front, (x) => x.score) || "-"],
            ["BACK 9", sum(back, (x) => x.score) || "-"],
          ].map(([l, v]) => (
            <View key={l as string} style={styles.totalBox}>
              <Text style={styles.totalLbl}>{l}</Text>
              <Text style={[styles.totalVal, { fontFamily: font.num }]}>{v}</Text>
            </View>
          ))}
        </View>

        <View style={styles.tableCard}>
          <View style={[styles.tr, styles.thead]}>
            {["HOLE", "PAR", "SCORE", "PUTTS", "FW", "GIR"].map((h, i) => (
              <Text key={h} style={[styles.th, i === 0 && { flex: 1.2, textAlign: "left" }]}>
                {h}
              </Text>
            ))}
          </View>
          {scores.map((x, i) => (
            <Pressable key={i} onPress={() => setHoleIdx(i)} style={[styles.tr, i % 2 === 1 && styles.trAlt, i === holeIdx && styles.trActive]} testID={`score-row-${x.hole}`}>
              <Text style={[styles.td, { flex: 1.2, textAlign: "left", fontWeight: "800" }]}>{x.hole}</Text>
              <Text style={styles.td}>{x.par}</Text>
              <Text style={[styles.td, { fontWeight: "800", color: x.score ? (x.score < x.par ? colors.fairway : x.score > x.par ? colors.red : colors.charcoal) : colors.zinc300 }]}>{x.score || "-"}</Text>
              <Text style={styles.td}>{x.putts ?? "-"}</Text>
              <Text style={styles.td}>{x.fairway === true ? "✓" : x.fairway === false ? "✕" : "-"}</Text>
              <Text style={styles.td}>{x.gir === true ? "✓" : x.gir === false ? "✕" : "-"}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.endBtn} onPress={endRound} testID="end-round-btn">
          <Text style={styles.endTxt}>END ROUND</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 },
  loading: { color: colors.zinc400, fontWeight: "700" },
  h1: { fontSize: 20, fontWeight: "800", color: colors.charcoal },
  startBtn: { height: 56, paddingHorizontal: 32, borderRadius: 18, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  startTxt: { color: "#fff", fontWeight: "900", letterSpacing: 1.5 },
  header: { backgroundColor: colors.charcoal, paddingHorizontal: 20, paddingBottom: 16, flexDirection: "row" },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "800" },
  editor: { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.zinc200, borderRadius: 20, padding: 16 },
  holeSelectRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  holeNav: { height: 40, width: 40, borderRadius: 12, backgroundColor: colors.zinc100, alignItems: "center", justifyContent: "center" },
  holeLabel: { fontSize: 17, fontWeight: "800", color: colors.charcoal },
  grid2: { flexDirection: "row", flexWrap: "wrap", marginTop: 16 },
  cell: { width: "50%", paddingVertical: 8, paddingRight: 8 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  stepBtn: { height: 40, width: 40, borderRadius: 10, backgroundColor: colors.zinc100, alignItems: "center", justifyContent: "center" },
  stepVal: { fontSize: 24, width: 32, textAlign: "center", color: colors.charcoal },
  fwBtn: { flex: 1, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  fwOn: { backgroundColor: colors.green },
  fwOff: { backgroundColor: "#FEE2E2" },
  fwNull: { backgroundColor: colors.zinc100 },
  fwTxt: { fontWeight: "800", fontSize: 12 },
  totals: { flexDirection: "row", gap: 8 },
  totalBox: { flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.zinc200, borderRadius: 14, paddingVertical: 8, alignItems: "center" },
  totalLbl: { fontSize: 8, letterSpacing: 1.5, fontWeight: "800", color: colors.zinc400 },
  totalVal: { fontSize: 20, color: colors.charcoal },
  tableCard: { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.zinc200, borderRadius: 20, overflow: "hidden" },
  tr: { flexDirection: "row", alignItems: "center", paddingVertical: 6, paddingHorizontal: 10 },
  thead: { backgroundColor: colors.charcoal, paddingVertical: 8 },
  trAlt: { backgroundColor: colors.zinc100 },
  trActive: { backgroundColor: "rgba(20,83,45,0.1)" },
  th: { flex: 1, color: "#fff", fontSize: 10, fontWeight: "800", textAlign: "center" },
  td: { flex: 1, fontSize: 12, textAlign: "center", color: colors.charcoal },
  endBtn: { height: 56, borderRadius: 18, backgroundColor: colors.charcoal, borderWidth: 1, borderColor: colors.gold, alignItems: "center", justifyContent: "center" },
  endTxt: { color: colors.gold, fontWeight: "900", letterSpacing: 2 },
});
