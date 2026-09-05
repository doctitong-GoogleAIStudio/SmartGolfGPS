import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Modal } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, font } from "@/src/theme";
import { api, cachedGet, getActiveRound, setActiveRound, ActiveRound } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { ScreenHeader, Overline } from "@/src/components/ui";
import { MapBadge } from "@/src/components/MapBadge";
import { LayoutAccuracy, accuracyLevel } from "@/src/components/LayoutAccuracy";
import { toast } from "@/src/lib/toast";

const ACC_FILTERS = ["all", "HIGH", "MEDIUM", "LOW"] as const;

export default function StartRound() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [courses, setCourses] = useState<any[]>([]);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [holeCount, setHoleCount] = useState(18);
  const [player, setPlayer] = useState("Golfer");
  const [existing, setExisting] = useState<ActiveRound>(null);
  const [accFilter, setAccFilter] = useState<(typeof ACC_FILTERS)[number]>("all");
  const [lowReminder, setLowReminder] = useState(false);

  useEffect(() => {
    cachedGet<any[]>("/courses", "courses").then((cs) => { setCourses(cs); if (cs[0]) setCourseId(cs[0].id); }).catch(() => {});
    getActiveRound().then(setExisting);
  }, []);

  const visibleCourses = useMemo(
    () => courses.filter((c) => accFilter === "all" || (!c.isDemo && accuracyLevel(c)?.label === accFilter)),
    [courses, accFilter],
  );

  useEffect(() => {
    if (visibleCourses.length && !visibleCourses.some((c) => c.id === courseId)) setCourseId(visibleCourses[0].id);
  }, [visibleCourses]);

  const beginRound = async () => {
    const r = await api.post("/rounds", { courseId, holeCount, player });
    await setActiveRound({ id: r.id, courseId: courseId!, currentHole: 1 });
    await storage.setItem("sg_quick_course", courseId!);
    toast.success("Round started — good luck!");
    router.replace("/course-overview");
  };

  const start = async () => {
    if (!courseId) { toast.error("Select a course"); return; }
    const c = courses.find((x) => x.id === courseId);
    const a = c && !c.isDemo ? accuracyLevel(c) : null;
    if (a && a.level === 1) { setLowReminder(true); return; }  // LOW accuracy → nudge first
    await beginRound();
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accRow} testID="start-acc-filter-row">
            {ACC_FILTERS.map((f) => {
              const on = accFilter === f;
              return (
                <Pressable key={f} testID={`start-acc-filter-${f.toLowerCase()}`} onPress={() => setAccFilter(f)} style={[styles.accChip, on && styles.accChipOn]}>
                  <Text style={[styles.accChipTxt, on && styles.accChipTxtOn]}>{f === "all" ? "ALL" : `${f} ACCURACY`}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={{ gap: 8 }}>
            {visibleCourses.length === 0 && (
              <Text style={styles.accEmpty} testID="start-acc-empty">No {accFilter.toLowerCase()}-accuracy courses yet. Map a course in the editor or confirm its location to raise its trust level.</Text>
            )}
            {visibleCourses.map((c) => (
              <Pressable key={c.id} testID={`start-course-${c.id}`} onPress={() => setCourseId(c.id)} style={[styles.courseCard, courseId === c.id && styles.courseCardActive]}>
                <Text style={styles.courseName}>{c.name}</Text>
                <Text style={styles.courseMeta}>{c.location} · {c.holeCount} holes {c.isDemo ? "· DEMO DATA" : ""}</Text>
                <MapBadge course={c} style={{ marginTop: 8 }} testID={`start-badge-${c.id}`} />
                <LayoutAccuracy course={c} style={{ marginTop: 6 }} testID={`start-accuracy-${c.id}`} />
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

      <Modal visible={lowReminder} transparent animationType="fade" onRequestClose={() => setLowReminder(false)}>
        <View style={styles.trustBackdrop}>
          <View style={styles.trustCard} testID="low-accuracy-reminder">
            <View style={styles.trustIcon}>
              <Ionicons name="location" size={22} color="#a16207" />
            </View>
            <Text style={styles.trustTitle}>Confirm the location?</Text>
            <Text style={styles.trustBody}>This course sits on an approximate pin, so on-course distances may be off. Confirming its location takes a few seconds and makes every yardage more accurate.</Text>
            <Pressable style={styles.trustConfirm} testID="low-reminder-confirm-btn" onPress={() => { setLowReminder(false); if (courseId) router.push(`/courses/${courseId}/locate`); }}>
              <Ionicons name="location" size={16} color="#fff" />
              <Text style={styles.trustConfirmTxt}>CONFIRM LOCATION</Text>
            </Pressable>
            <Pressable style={styles.trustSkip} testID="low-reminder-start-anyway-btn" onPress={() => { setLowReminder(false); beginRound(); }}>
              <Text style={styles.trustSkipTxt}>START ANYWAY</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  accRow: { gap: 8, paddingBottom: 10, paddingRight: 8 },
  accChip: { flexShrink: 0, height: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.zinc100, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.zinc200 },
  accChipOn: { backgroundColor: colors.charcoal, borderColor: colors.charcoal },
  accChipTxt: { fontSize: 11, fontWeight: "900", letterSpacing: 0.5, color: colors.zinc500 },
  accChipTxtOn: { color: "#fff" },
  accEmpty: { fontSize: 13, fontWeight: "600", color: colors.zinc500, lineHeight: 19, paddingVertical: 12 },
  trustBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 28 },
  trustCard: { backgroundColor: "#fff", borderRadius: 24, padding: 24, width: "100%", maxWidth: 380, gap: 10 },
  trustIcon: { height: 46, width: 46, borderRadius: 14, backgroundColor: "#FEF9C3", alignItems: "center", justifyContent: "center" },
  trustTitle: { fontSize: 19, fontWeight: "900", color: colors.charcoal, marginTop: 4 },
  trustBody: { fontSize: 13, fontWeight: "600", color: colors.zinc500, lineHeight: 20 },
  trustConfirm: { height: 54, borderRadius: 16, backgroundColor: colors.green, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 6 },
  trustConfirmTxt: { color: "#fff", fontWeight: "900", letterSpacing: 1 },
  trustSkip: { height: 46, alignItems: "center", justifyContent: "center" },
  trustSkipTxt: { color: colors.zinc500, fontWeight: "900", letterSpacing: 0.5, fontSize: 12 },
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
