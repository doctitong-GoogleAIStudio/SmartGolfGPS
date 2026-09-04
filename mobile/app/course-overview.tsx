import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, font } from "@/src/theme";
import { cachedGet, getActiveRound, setActiveRound } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { CourseOverviewMap } from "@/src/components/CourseOverviewMap";
import { useGPS } from "@/src/hooks/useGPS";
import { useSettings } from "@/src/context/SettingsContext";
import { haversineMeters, bearingDeg, fmtDist, unitLabel } from "@/src/lib/geo";

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export default function CourseOverview() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const unit = settings.distanceUnit;
  const { pos: gpsPos } = useGPS(true);
  const [course, setCourse] = useState<any>(null);
  const [sel, setSel] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const a = await getActiveRound();
      const quick = await storage.getItem<string>("sg_quick_course", "");
      const cid = a?.courseId || quick;
      if (cid) { try { setCourse(await cachedGet(`/courses/${cid}`, `course_${cid}`)); } catch {} }
    })();
  }, []);

  const holes: any[] = course?.holes || [];
  const totals = useMemo(() => {
    let par = 0, meters = 0;
    holes.forEach((h) => { par += h.par || 0; if (h.tee && h.greenCenter) meters += (haversineMeters(h.tee, h.greenCenter) as number) || 0; });
    return { par, meters };
  }, [holes]);

  const selHole = sel != null ? holes[sel] : null;
  const teeNav = useMemo(() => {
    if (!selHole?.tee || !gpsPos) return null;
    const d = haversineMeters(gpsPos, selHole.tee) as number;
    const b = bearingDeg(gpsPos, selHole.tee);
    return { d, dir: COMPASS[Math.round(b / 45) % 8] };
  }, [selHole, gpsPos]);

  const goHole = async (n: number) => {
    if (course) await storage.setItem("sg_quick_course", course.id);
    await storage.setItem("sg_start_hole", String(n));
    setSel(null);
    router.replace("/play");
  };

  const startRound = async () => {
    const a = await getActiveRound();
    if (a) await setActiveRound({ ...a, currentHole: 1 });
    await storage.setItem("sg_start_hole", "1");
    router.replace("/play");
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.charcoal }} testID="course-overview-screen">
      <CourseOverviewMap holes={holes} gpsPos={gpsPos} onHolePress={(i) => setSel(i)} />

      {/* Header card */}
      <View style={[styles.header, { top: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable style={styles.iconBtn} onPress={() => router.back()} testID="overview-back-btn">
          <Ionicons name="chevron-back" size={20} color={colors.charcoal} />
        </Pressable>
        <View style={styles.title}>
          <Text style={styles.courseName} numberOfLines={1}>{course?.name || "Course Overview"}</Text>
          <Text style={styles.courseMeta}>{holes.length} HOLES · PAR {totals.par}{totals.meters ? ` · ${fmtDist(totals.meters, unit)} ${unitLabel(unit)}` : ""}</Text>
        </View>
      </View>

      {/* Start round */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 12 }]} pointerEvents="box-none">
        <Pressable style={styles.startBtn} onPress={startRound} testID="overview-start-round-btn">
          <Ionicons name="flag" size={18} color={colors.gold} />
          <Text style={styles.startTxt}>START ROUND · HOLE 1</Text>
        </Pressable>
      </View>

      {/* Hole popup */}
      <Modal visible={sel != null} transparent animationType="fade" onRequestClose={() => setSel(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSel(null)}>
          <Pressable style={styles.sheet} testID="overview-hole-popup">
            {selHole && (
              <>
                <Text style={[styles.hName, { fontFamily: font.headBold }]}>HOLE {selHole.holeNumber}</Text>
                <Text style={styles.hMeta}>
                  PAR {selHole.par}
                  {selHole.tee && selHole.greenCenter ? ` · ${fmtDist(haversineMeters(selHole.tee, selHole.greenCenter), unit)} ${unitLabel(unit)}` : ""}
                  {selHole.handicap ? ` · HCP ${selHole.handicap}` : ""}
                </Text>
                {teeNav && (
                  <View style={styles.navRow} testID="overview-tee-nav">
                    <Ionicons name="navigate" size={15} color={colors.water} />
                    <Text style={styles.navTxt}>Tee · {fmtDist(teeNav.d, unit)} {unitLabel(unit).toLowerCase()} · {teeNav.dir}</Text>
                  </View>
                )}
                <Pressable style={styles.pBtn} onPress={() => goHole(selHole.holeNumber)} testID="overview-view-hole-btn">
                  <Ionicons name="locate" size={16} color="#fff" />
                  <Text style={styles.pBtnTxt}>VIEW HOLE</Text>
                </Pressable>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable style={styles.pBtn2} onPress={() => goHole(selHole.holeNumber)} testID="overview-navigate-tee-btn">
                    <Text style={styles.pBtn2Txt}>NAVIGATE TO TEE</Text>
                  </Pressable>
                  <Pressable style={styles.pBtn2} onPress={() => goHole(selHole.holeNumber)} testID="overview-view-green-btn">
                    <Text style={styles.pBtn2Txt}>VIEW GREEN</Text>
                  </Pressable>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { position: "absolute", left: 12, right: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: { height: 44, width: 44, borderRadius: 14, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 },
  title: { flex: 1, backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 },
  courseName: { fontWeight: "900", fontSize: 15, color: colors.charcoal },
  courseMeta: { fontSize: 10, fontWeight: "800", color: colors.green, letterSpacing: 0.5, marginTop: 1 },
  bottom: { position: "absolute", left: 12, right: 12, bottom: 0 },
  startBtn: { height: 58, borderRadius: 18, backgroundColor: colors.charcoal, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderWidth: 1, borderColor: colors.gold },
  startTxt: { color: colors.gold, fontWeight: "900", letterSpacing: 1.5, fontSize: 15 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 28 },
  sheet: { backgroundColor: "#fff", borderRadius: 22, padding: 22, gap: 12 },
  hName: { fontSize: 22, fontWeight: "800", color: colors.charcoal },
  hMeta: { fontSize: 13, fontWeight: "800", color: colors.zinc500, marginTop: -6 },
  navRow: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#F0F9FF", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  navTxt: { fontSize: 12, fontWeight: "800", color: "#0C4A6E" },
  pBtn: { height: 50, borderRadius: 14, backgroundColor: colors.green, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  pBtnTxt: { color: "#fff", fontWeight: "900", letterSpacing: 1 },
  pBtn2: { flex: 1, height: 46, borderRadius: 12, backgroundColor: colors.zinc100, alignItems: "center", justifyContent: "center" },
  pBtn2Txt: { color: colors.charcoal, fontWeight: "900", fontSize: 11, letterSpacing: 0.5 },
});
