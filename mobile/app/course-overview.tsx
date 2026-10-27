import { usableHole, reviewedCourse } from "@/src/lib/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, font } from "@/src/theme";
import { cachedGet, getActiveRound, setActiveRound } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { CourseOverviewMap } from "@/src/components/CourseOverviewMap";
import { MapBadge } from "@/src/components/MapBadge";
import { LayoutAccuracy } from "@/src/components/LayoutAccuracy";
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
  const [gridOpen, setGridOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [focus, setFocus] = useState<{ key: number; point: any } | null>(null);

  useEffect(() => {
    (async () => {
      const a = await getActiveRound();
      const quick = await storage.getItem<string>("sg_quick_course", "");
      const cid = a?.courseId || quick;
      if (cid) { try { setCourse(await cachedGet(`/courses/${cid}`, `course_${cid}`)); } catch {} }
    })();
  }, []);

  const holes: any[] = useMemo(() => (course?.holes || []).map((h: any) => usableHole(course, h) ? h : { ...h, tee: null, greenFront: null, greenCenter: null, greenBack: null, hazards: [], polygons: [] }), [course]);
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

  const goHole = async (n: number, focusMode?: string) => {
    if (course) await storage.setItem("sg_quick_course", course.id);
    await storage.setItem("sg_start_hole", String(n));
    if (focusMode) await storage.setItem("sg_focus", focusMode);
    setSel(null); setGridOpen(false);
    router.replace("/play");
  };

  const distDir = (pt: any) => {
    if (!pt || !gpsPos) return null;
    return { d: haversineMeters(gpsPos, pt) as number, dir: COMPASS[Math.round(bearingDeg(gpsPos, pt) / 45) % 8] };
  };

  const pois: any[] = [
    holes[0]?.tee && { key: "tee", label: "Hole 1 Tee", pt: holes[0].tee, icon: "flag" },
    course?.clubhouse && { key: "club", label: "Clubhouse", pt: course.clubhouse, icon: "home" },
    course?.drivingRange && { key: "range", label: "Driving Range", pt: course.drivingRange, icon: "golf" },
    course?.practiceGreen && { key: "pgreen", label: "Practice Green", pt: course.practiceGreen, icon: "ellipse" },
    course?.parking && { key: "park", label: "Parking", pt: course.parking, icon: "car" },
  ].filter((p) => reviewedCourse(course) && p);

  const startRound = async () => {
    const a = await getActiveRound();
    if (a) await setActiveRound({ ...a, currentHole: 1 });
    await storage.setItem("sg_start_hole", "1");
    router.replace("/play");
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.charcoal }} testID="course-overview-screen">
      <CourseOverviewMap holes={holes} gpsPos={gpsPos} pois={pois} focusKey={focus?.key} focusTarget={focus?.point} onHolePress={(i) => setSel(i)} />

      {/* Header card */}
      <View style={[styles.header, { top: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable style={styles.iconBtn} onPress={() => router.back()} testID="overview-back-btn">
          <Ionicons name="chevron-back" size={20} color={colors.charcoal} />
        </Pressable>
        <View style={styles.title}>
          <Text style={styles.courseName} numberOfLines={1}>{course?.name || "Course Overview"}</Text>
          <Text style={styles.courseMeta}>{holes.length} HOLES · {course?.scorecardTemplate ? "PARS NOT VERIFIED" : `PAR ${totals.par}`}{totals.meters ? ` · ${fmtDist(totals.meters, unit)} ${unitLabel(unit)}` : ""}</Text>
          <MapBadge course={course} style={{ marginTop: 6 }} testID="overview-map-badge" />
          <LayoutAccuracy course={course} showWhy style={{ marginTop: 6 }} testID="overview-accuracy" />
        </View>
      </View>

      {/* Start round */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 12 }]} pointerEvents="box-none">
        <View style={styles.actionRow}>
          <Pressable style={styles.secBtn} onPress={() => setGridOpen(true)} testID="overview-holes-btn">
            <Ionicons name="grid" size={16} color={colors.charcoal} />
            <Text style={styles.secTxt}>HOLES</Text>
          </Pressable>
          <Pressable style={styles.secBtn} onPress={() => setNavOpen(true)} testID="overview-navigate-btn">
            <Ionicons name="compass" size={16} color={colors.charcoal} />
            <Text style={styles.secTxt}>NAVIGATE</Text>
          </Pressable>
        </View>
        <Pressable style={styles.startBtn} onPress={startRound} testID="overview-start-round-btn">
          <Ionicons name="flag" size={18} color={colors.gold} />
          <Text style={styles.startTxt}>START ROUND · HOLE 1</Text>
        </Pressable>
      </View>

      {/* Hole selector grid */}
      <Modal visible={gridOpen} transparent animationType="fade" onRequestClose={() => setGridOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setGridOpen(false)}>
          <Pressable style={styles.sheet} testID="overview-hole-grid">
            <Text style={[styles.hName, { fontFamily: font.headBold }]}>JUMP TO HOLE</Text>
            <View style={styles.grid}>
              {holes.map((h) => (
                <Pressable key={h.holeNumber} style={styles.gridCell} onPress={() => goHole(h.holeNumber)} testID={`grid-hole-${h.holeNumber}`}>
                  <Text style={styles.gridNum}>{h.holeNumber}</Text>
                  <Text style={styles.gridPar}>P{h.par}</Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Course navigation */}
      <Modal visible={navOpen} transparent animationType="fade" onRequestClose={() => setNavOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setNavOpen(false)}>
          <Pressable style={styles.sheet} testID="overview-nav-sheet">
            <Text style={[styles.hName, { fontFamily: font.headBold }]}>COURSE NAVIGATION</Text>
            {!gpsPos && <Text style={styles.hMeta}>Waiting for GPS to show distances…</Text>}
            {pois.map((p) => {
              const dd = distDir(p.pt);
              return (
                <View key={p.key} style={styles.navItem} testID={`nav-${p.key}`}>
                  <Ionicons name={p.icon} size={18} color={colors.green} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.navLabel}>{p.label}</Text>
                    <Text style={styles.navSub}>{dd ? `${fmtDist(dd.d, unit)} ${unitLabel(unit).toLowerCase()} · ${dd.dir}` : "—"}</Text>
                  </View>
                  <Pressable style={styles.showBtn} onPress={() => { setFocus({ key: Date.now(), point: p.pt }); setNavOpen(false); }} testID={`nav-show-${p.key}`}>
                    <Text style={styles.showTxt}>SHOW</Text>
                  </Pressable>
                </View>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

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
                  <Pressable style={styles.pBtn2} onPress={() => goHole(selHole.holeNumber, "green")} testID="overview-view-green-btn">
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
  actionRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  secBtn: { flex: 1, height: 46, borderRadius: 14, backgroundColor: "#fff", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 5, elevation: 3 },
  secTxt: { color: colors.charcoal, fontWeight: "900", letterSpacing: 1, fontSize: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  gridCell: { width: 52, height: 52, borderRadius: 12, backgroundColor: colors.zinc100, alignItems: "center", justifyContent: "center" },
  gridNum: { fontSize: 16, fontWeight: "900", color: colors.charcoal },
  gridPar: { fontSize: 9, fontWeight: "800", color: colors.zinc500 },
  navItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.zinc100 },
  navLabel: { fontSize: 14, fontWeight: "800", color: colors.charcoal },
  navSub: { fontSize: 12, fontWeight: "700", color: colors.zinc500, marginTop: 1 },
  showBtn: { paddingHorizontal: 14, height: 34, borderRadius: 10, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  showTxt: { color: "#fff", fontWeight: "900", fontSize: 11, letterSpacing: 0.5 },
});
