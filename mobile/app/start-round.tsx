import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font } from "@/src/theme";
import { api, cachedGet, getActiveRound, setActiveRound, ActiveRound } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { ScreenHeader, Overline } from "@/src/components/ui";
import { MapBadge } from "@/src/components/MapBadge";
import { toast } from "@/src/lib/toast";

export default function StartRound() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [courses, setCourses] = useState<any[]>([]);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [holeCount, setHoleCount] = useState(18);
  const [player, setPlayer] = useState("Golfer");
  const [existing, setExisting] = useState<ActiveRound>(null);

  useEffect(() => {
    cachedGet<any[]>("/courses", "courses").then((cs) => { setCourses(cs); if (cs[0]) setCourseId(cs[0].id); }).catch(() => {});
    getActiveRound().then(setExisting);
  }, []);

  const start = async () => {
    if (!courseId) { toast.error("Select a course"); return; }
    const r = await api.post("/rounds", { courseId, holeCount, player });
    await setActiveRound({ id: r.id, courseId, currentHole: 1 });
    await storage.setItem("sg_quick_course", courseId);
    toast.success("Round started — good luck!");
    router.replace("/course-overview");
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top, backgroundColor: colors.charcoal }} />
      <ScreenHeader overline="NEW ROUND" title="Start Round" onBack={() => router.back()} testID="start-round-screen" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        {existing && (
          <View style={styles.resume} testID="resume-round-card">
            <Text style={styles.resumeTxt}>You have an unfinished round.</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <Pressable style={styles.resumeBtn} onPress={() => router.replace("/play")} testID="resume-round-btn">
                <Text style={styles.resumeBtnTxt}>RESUME ROUND</Text>
              </Pressable>
              <Pressable style={styles.discardBtn} onPress={async () => { await setActiveRound(null); setExisting(null); }} testID="abandon-round-btn">
                <Text style={styles.discardTxt}>Discard</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View>
          <Overline style={{ marginBottom: 8 }}>GOLF COURSE</Overline>
          <View style={{ gap: 8 }}>
            {courses.map((c) => (
              <Pressable key={c.id} testID={`start-course-${c.id}`} onPress={() => setCourseId(c.id)} style={[styles.courseCard, courseId === c.id && styles.courseCardActive]}>
                <Text style={styles.courseName}>{c.name}</Text>
                <Text style={styles.courseMeta}>{c.location} · {c.holeCount} holes {c.isDemo ? "· DEMO DATA" : ""}</Text>
                <MapBadge course={c} style={{ marginTop: 8 }} testID={`start-badge-${c.id}`} />
              </Pressable>
            ))}
          </View>
        </View>

        <View>
          <Overline style={{ marginBottom: 8 }}>HOLES</Overline>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {[9, 18].map((n) => (
              <Pressable key={n} testID={`start-holes-${n}`} onPress={() => setHoleCount(n)} style={[styles.holeBtn, holeCount === n ? styles.holeBtnOn : styles.holeBtnOff]}>
                <Text style={[styles.holeBtnTxt, { color: holeCount === n ? "#fff" : colors.charcoal }]}>{n} HOLES</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View>
          <Overline style={{ marginBottom: 8 }}>PLAYER</Overline>
          <TextInput testID="start-player-input" value={player} onChangeText={setPlayer} style={styles.input} />
        </View>

        <Pressable style={styles.startBtn} onPress={start} testID="start-round-btn">
          <Text style={styles.startTxt}>START ROUND</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  resume: { backgroundColor: "rgba(212,175,55,0.1)", borderWidth: 1, borderColor: colors.gold, borderRadius: 18, padding: 16 },
  resumeTxt: { fontWeight: "700", fontSize: 14, color: colors.charcoal },
  resumeBtn: { flex: 1, height: 48, borderRadius: 12, backgroundColor: colors.charcoal, alignItems: "center", justifyContent: "center" },
  resumeBtnTxt: { color: colors.gold, fontWeight: "900", fontSize: 12, letterSpacing: 1 },
  discardBtn: { height: 48, paddingHorizontal: 16, borderRadius: 12, backgroundColor: colors.zinc100, alignItems: "center", justifyContent: "center" },
  discardTxt: { fontWeight: "700", fontSize: 12, color: colors.charcoal },
  courseCard: { padding: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.zinc200, backgroundColor: "#fff" },
  courseCardActive: { borderColor: colors.green, backgroundColor: "rgba(20,83,45,0.05)" },
  courseName: { fontWeight: "800", fontSize: 14, color: colors.charcoal },
  courseMeta: { fontSize: 10, color: colors.zinc400, fontWeight: "700", marginTop: 2 },
  holeBtn: { flex: 1, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  holeBtnOn: { backgroundColor: colors.green },
  holeBtnOff: { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.zinc200 },
  holeBtnTxt: { fontWeight: "900" },
  input: { height: 56, borderRadius: 18, borderWidth: 1, borderColor: colors.zinc200, paddingHorizontal: 16, fontWeight: "700", backgroundColor: "#fff", color: colors.charcoal },
  startBtn: { height: 60, borderRadius: 18, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  startTxt: { color: "#fff", fontFamily: font.headBold, fontWeight: "800", letterSpacing: 1.5, fontSize: 17 },
});
