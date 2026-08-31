import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, font } from "@/src/theme";
import { api } from "@/src/lib/api";
import { useSettings } from "@/src/context/SettingsContext";
import { fmtDist, unitLabel } from "@/src/lib/geo";
import { GolfMap } from "@/src/components/GolfMap";
import { ScreenHeader } from "@/src/components/ui";
import { toast } from "@/src/lib/toast";

export default function RoundDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings } = useSettings();
  const [round, setRound] = useState<any>(null);
  const [shots, setShots] = useState<any[]>([]);
  const [replayIdx, setReplayIdx] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.get(`/rounds/${id}`).then(setRound).catch(() => {});
    api.get(`/shots?roundId=${id}`).then(setShots).catch(() => {});
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [id]);

  if (!round)
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.green} />
      </View>
    );

  const played = round.scores.filter((s: any) => s.score);
  const total = played.reduce((a: number, s: any) => a + s.score, 0);
  const par = played.reduce((a: number, s: any) => a + s.par, 0);
  const putts = played.reduce((a: number, s: any) => a + (s.putts || 0), 0);
  const fw = played.filter((s: any) => s.fairway != null);
  const gir = played.filter((s: any) => s.gir != null);

  const path = round.gpsPath || [];
  const shotLines = shots.map((s) => ({
    start: { lat: s.startLat, lng: s.startLng },
    end: { lat: s.endLat, lng: s.endLng },
    label: `${s.club} · ${fmtDist(s.distanceMeters, settings.distanceUnit)} ${unitLabel(settings.distanceUnit).toLowerCase()}`,
  }));
  const hasMap = path.length > 1 || shotLines.length > 0;
  const mapCenter = path[0] || shotLines[0]?.start || null;
  const replaying = replayIdx != null;

  const delRound = () => {
    Alert.alert("Delete this round and its shots?", "", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await api.del(`/rounds/${id}`); toast.success("Round deleted"); router.replace("/history"); } },
    ]);
  };

  const toggleReplay = () => {
    if (replaying) {
      if (timer.current) clearInterval(timer.current);
      setReplayIdx(null);
      return;
    }
    let i = 0;
    setReplayIdx(0);
    timer.current = setInterval(() => {
      i += 1;
      if (i >= path.length) { if (timer.current) clearInterval(timer.current); setReplayIdx(null); }
      else setReplayIdx(i);
    }, 90);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top, backgroundColor: colors.charcoal }} />
      <ScreenHeader
        overline={new Date(round.startedAt).toLocaleDateString()}
        title={round.courseName}
        onBack={() => router.replace("/history")}
        right={
          <Pressable testID="delete-round-btn" onPress={delRound} style={styles.delHeader}>
            <Ionicons name="trash" size={18} color="#FCA5A5" />
          </Pressable>
        }
        testID="round-detail-screen"
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        <View style={styles.statRow}>
          {[
            ["SCORE", total || "-"],
            ["TO PAR", played.length ? `${total - par > 0 ? "+" : ""}${total - par}` : "-"],
            ["PUTTS", putts || "-"],
            ["FW / GIR", `${fw.filter((s: any) => s.fairway).length}/${fw.length || 0} · ${gir.filter((s: any) => s.gir).length}/${gir.length || 0}`],
          ].map(([l, v]) => (
            <View key={l as string} style={styles.statBox}>
              <Text style={styles.statLbl}>{l}</Text>
              <Text style={[styles.statVal, { fontFamily: font.num }]}>{v}</Text>
            </View>
          ))}
        </View>

        {hasMap && mapCenter && (
          <View style={styles.mapCard} testID="path-replay-card">
            <View style={styles.mapWrap}>
              <GolfMap
                center={mapCenter}
                zoom={16}
                gpsPath={path}
                shotLines={shotLines}
                gpsPos={replaying ? path[replayIdx as number] : null}
                followPos={replaying ? path[replayIdx as number] : null}
              />
            </View>
            <View style={styles.mapFooter}>
              <View>
                <Text style={styles.mapLbl}>ROUND MAP</Text>
                <Text style={styles.mapMeta}>
                  {path.length > 1 ? `${path.length} GPS points` : ""}
                  {path.length > 1 && shotLines.length ? " · " : ""}
                  {shotLines.length ? `${shotLines.length} shots` : ""}
                </Text>
              </View>
              {path.length > 1 && (
                <Pressable testID="replay-btn" onPress={toggleReplay} style={[styles.replayBtn, { backgroundColor: replaying ? colors.red : colors.green }]}>
                  <Ionicons name={replaying ? "stop" : "play"} size={16} color="#fff" />
                  <Text style={styles.replayTxt}>{replaying ? "STOP" : "REPLAY"}</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

        <View style={styles.tableCard}>
          <View style={[styles.tr, styles.thead]}>
            {["HOLE", "PAR", "SCORE", "PUTTS", "FW", "GIR", "PEN"].map((h, i) => (
              <Text key={h} style={[styles.th, i === 0 && { flex: 1.2, textAlign: "left" }]}>{h}</Text>
            ))}
          </View>
          {round.scores.map((x: any, i: number) => (
            <View key={i} style={[styles.tr, i % 2 === 1 && styles.trAlt]}>
              <Text style={[styles.td, { flex: 1.2, textAlign: "left", fontWeight: "800" }]}>{x.hole}</Text>
              <Text style={styles.td}>{x.par}</Text>
              <Text style={[styles.td, { fontWeight: "800", color: x.score ? (x.score < x.par ? colors.fairway : x.score > x.par ? colors.red : colors.charcoal) : colors.zinc300 }]}>{x.score || "-"}</Text>
              <Text style={styles.td}>{x.putts ?? "-"}</Text>
              <Text style={styles.td}>{x.fairway === true ? "✓" : x.fairway === false ? "✕" : "-"}</Text>
              <Text style={styles.td}>{x.gir === true ? "✓" : x.gir === false ? "✕" : "-"}</Text>
              <Text style={styles.td}>{x.penalty || "-"}</Text>
            </View>
          ))}
        </View>

        {shots.length > 0 && (
          <View>
            <Text style={styles.shotsHdr}>SHOTS ({shots.length})</Text>
            <View style={{ gap: 6 }}>
              {shots.map((s) => (
                <View key={s.id} style={styles.shotRow} testID={`shot-row-${s.id}`}>
                  <Text style={styles.shotClub}>{s.club} {s.holeNumber ? <Text style={{ color: colors.zinc400 }}>· Hole {s.holeNumber}</Text> : null}</Text>
                  <Text style={[styles.shotDist, { fontFamily: font.num }]}>{fmtDist(s.distanceMeters, settings.distanceUnit)} <Text style={{ fontSize: 10 }}>{unitLabel(settings.distanceUnit)}</Text></Text>
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
  delHeader: { height: 40, width: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  statRow: { flexDirection: "row", gap: 8 },
  statBox: { flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.zinc200, borderRadius: 14, paddingVertical: 10, alignItems: "center" },
  statLbl: { fontSize: 8, letterSpacing: 1.5, fontWeight: "800", color: colors.zinc400 },
  statVal: { fontSize: 18, color: colors.charcoal },
  mapCard: { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.zinc200, borderRadius: 20, overflow: "hidden" },
  mapWrap: { height: 280 },
  mapFooter: { padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  mapLbl: { fontSize: 10, letterSpacing: 1.5, fontWeight: "800", color: colors.zinc400 },
  mapMeta: { fontSize: 11, fontWeight: "700", color: colors.zinc500, marginTop: 2 },
  replayBtn: { height: 44, paddingHorizontal: 16, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 6 },
  replayTxt: { color: "#fff", fontWeight: "900", fontSize: 12, letterSpacing: 1 },
  tableCard: { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.zinc200, borderRadius: 20, overflow: "hidden" },
  tr: { flexDirection: "row", alignItems: "center", paddingVertical: 6, paddingHorizontal: 10 },
  thead: { backgroundColor: colors.charcoal, paddingVertical: 8 },
  trAlt: { backgroundColor: colors.zinc100 },
  th: { flex: 1, color: "#fff", fontSize: 9, fontWeight: "800", textAlign: "center" },
  td: { flex: 1, fontSize: 11, textAlign: "center", color: colors.charcoal },
  shotsHdr: { fontSize: 11, letterSpacing: 1.5, fontWeight: "800", color: colors.zinc400, marginBottom: 8 },
  shotRow: { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.zinc200, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  shotClub: { fontSize: 12, fontWeight: "800", color: colors.charcoal },
  shotDist: { fontSize: 18, color: colors.charcoal },
});
