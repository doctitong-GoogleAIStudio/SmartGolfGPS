import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Modal } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";
import { usableHole } from "@/src/lib/navigation";
import { imageryConfigured, imageryTracingAllowed } from "@/src/lib/imagery";
import { GolfMap } from "@/src/components/GolfMap";
import { useGPS } from "@/src/hooks/useGPS";
import { api } from "@/src/lib/api";
import { Overline } from "@/src/components/ui";
import { toast } from "@/src/lib/toast";

const MODES: [string, string][] = [
  ["tee", "SET TEE"],
  ["greenFront", "SET FRONT"],
  ["greenCenter", "SET CENTER"],
  ["greenBack", "SET BACK"],
];
const HAZARD_TYPES = ["BUNKER", "WATER", "TREE", "OUT OF BOUNDS", "DOGLEG", "LAYUP", "OTHER"];
const POI_MODES: [string, string][] = [
  ["clubhouse", "CLUBHOUSE"],
  ["drivingRange", "RANGE"],
  ["practiceGreen", "PRACTICE"],
  ["parking", "PARKING"],
];
const POI_KEYS = POI_MODES.map((m) => m[0]);

export default function CourseEditor() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pos: gpsPos } = useGPS(true);
  const [course, setCourse] = useState<any>(null);
  const [holeIdx, setHoleIdx] = useState(0);
  const [mode, setMode] = useState("tee");
  const [draft, setDraft] = useState<{ type: string; points: { lat: number; lng: number }[] } | null>(null);
  const [hazardType, setHazardType] = useState("BUNKER");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [review, setReview] = useState({ reviewer: "", source: "", license: "" });

  useEffect(() => {
    api.get(`/courses/${id}`).then(setCourse).catch(() => toast.error("Course not found"));
  }, [id]);

  if (!course)
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.green} />
      </View>
    );

  const hole = course.holes[holeIdx];

  const patchHole = (p: any) => {
    const holes = course.holes.map((h: any, i: number) => (i === holeIdx ? { ...h, ...p } : h));
    setCourse({ ...course, holes, mappingReview: null });
  };

  const onMapPress = (p: { lat: number; lng: number }) => {
    if (mode === "hazard") {
      const hz = { id: Crypto.randomUUID(), name: `${hazardType.charAt(0) + hazardType.slice(1).toLowerCase()} ${hole.hazards.length + 1}`, type: hazardType, lat: p.lat, lng: p.lng, carryLat: null, carryLng: null };
      patchHole({ hazards: [...hole.hazards, hz] });
      toast.success(`${hazardType} added`);
    } else if (mode === "delete") {
      toast.info("Tap a hazard marker to delete it");
    } else if (POI_KEYS.includes(mode)) {
      setCourse({ ...course, [mode]: { lat: p.lat, lng: p.lng } });
      toast.success(`${POI_MODES.find((m) => m[0] === mode)?.[1]} placed`);
    } else if (mode.startsWith("draw:")) {
      const type = mode.slice(5);
      setDraft((d) => (d && d.type === type ? { ...d, points: [...d.points, { lat: p.lat, lng: p.lng }] } : { type, points: [{ lat: p.lat, lng: p.lng }] }));
    } else {
      patchHole({ [mode]: { lat: p.lat, lng: p.lng } });
      toast.success(`${MODES.find((m) => m[0] === mode)?.[1] || mode} placed`);
    }
  };

  const onHazardPress = (h: any) => {
    if (mode === "delete") {
      patchHole({ hazards: hole.hazards.filter((x: any) => x.id !== h.id) });
      toast.success("Hazard deleted");
    }
  };

  const saveReview = async () => {
    if (![review.reviewer, review.source, review.license].every((s) => s.trim())) { toast.error("Reviewer, actual mapping source and license are required");return; }
    const next = { ...course, layoutSource: "mapped", mappingReview: { ...review, reviewedAt: new Date().toISOString() } };
    if (!next.holes?.length || !next.holes.every((h: any) => usableHole(next, h))) { toast.error("All hole tees/centers and supplied polygons must be valid before declaring review");return; }
    try { await api.put(`/courses/${id}`, next);setCourse(next);setReviewOpen(false);toast.success("Mapping review declaration saved"); } catch { toast.error("Review could not be saved"); }
  };

  const save = async () => {
    try {
      await api.put(`/courses/${id}`, course);
      toast.success("Course saved");
    } catch {
      toast.error("Save failed");
    }
  };

  const center = hole.tee || hole.greenCenter || gpsPos || { lat: course.latitude, lng: course.longitude };
  const coursePois = POI_MODES.filter(([k]) => course[k]).map(([k, l]) => ({ key: k, label: l, pt: course[k] }));
  const livePolys = draft ? [...(hole.polygons || []), draft] : (hole.polygons || []);
  const finishShape = () => {
    const minPts = draft?.type === "CART_PATH" ? 2 : 3;
    if (!draft || draft.points.length < minPts) { toast.error(`Tap at least ${minPts} points first`); return; }
    patchHole({ polygons: [...(hole.polygons || []), draft] });
    setDraft(null);
    toast.success(`${draft.type} shape saved`);
  };

  return (
    <View style={styles.screen} testID="course-editor-screen">
      <GolfMap center={center} zoom={17} mapType={imageryTracingAllowed ? "satellite" : "golf"} onMapPress={onMapPress} tee={hole.tee} greens={hole} hazards={hole.hazards} onHazardPress={onHazardPress} gpsPos={gpsPos} pois={coursePois} polygons={livePolys} recenterKey={holeIdx + 1} />

      <View style={{ position: "absolute", top: insets.top + 65, left: 12, right: 12, padding: 10, backgroundColor: "#fff", borderRadius: 8 }}>
        <Text style={{ fontSize: 11 }}>{imageryTracingAllowed ? "Editor preview: imagery alone does not verify boundaries." : imageryConfigured ? "This imagery license is for display. Use survey or separately licensed mapping coordinates in the editor." : "Licensed imagery is not configured. Use independently verified mapping coordinates."}</Text>
        <Pressable testID="editor-review-mapping" onPress={() => setReviewOpen(true)}><Text style={{ color: colors.green, fontWeight: "700", paddingTop: 6 }}>SOURCE, LICENSE & MAPPING REVIEW</Text></Pressable>
      </View>
      <Modal visible={reviewOpen} transparent animationType="slide" onRequestClose={() => setReviewOpen(false)}>
        <View style={{ flex: 1, justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)", padding: 20 }}><ScrollView style={{ backgroundColor: "#fff", borderRadius: 12, maxHeight: 500 }} contentContainerStyle={{ padding: 20, gap: 12 }}>
          <Text style={{ fontWeight: "800", fontSize: 18 }}>Declare mapping review</Text>
          <Text>This declaration requires actual reviewed coordinates and permission to use them. Saving an editor pin or seeing satellite imagery does not establish verified green, fairway or hazard boundaries. Do not certify generated legacy geometry.</Text>
          {(["reviewer", "source", "license"] as const).map((key) => <TextInput key={key} testID={`mapping-review-${key}`} placeholder={key === "source" ? "Actual survey/mapping source and version" : key === "license" ? "Geometry license or permission reference" : "Responsible reviewer / organization"} value={review[key]} onChangeText={(value) => setReview((r) => ({ ...r, [key]: value }))} style={{ borderWidth: 1, borderColor: colors.zinc200, borderRadius: 6, padding: 10 }} />)}
          <Pressable testID="confirm-mapping-review" onPress={saveReview}><Text style={{ color: colors.green, fontWeight: "800" }}>I HAVE REVIEWED THE MAPPING · SAVE DECLARATION</Text></Pressable>
          <Pressable onPress={() => setReviewOpen(false)}><Text>Cancel</Text></Pressable>
        </ScrollView></View>
      </Modal>
      <View style={[styles.topBar, { top: insets.top + 6 }]}>
        <Pressable testID="editor-back-btn" onPress={() => router.push("/courses")} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={20} color={colors.charcoal} />
        </Pressable>
        <View style={styles.namePill}>
          <Text style={styles.nameTxt} numberOfLines={1}>{course.name}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={styles.holePill}>
          <Pressable testID="editor-prev-hole" onPress={() => setHoleIdx(Math.max(0, holeIdx - 1))} style={styles.holeArrow}>
            <Ionicons name="chevron-back" size={16} color={colors.charcoal} />
          </Pressable>
          <Text style={styles.holeTxt}>HOLE {hole.holeNumber}</Text>
          <Pressable testID="editor-next-hole" onPress={() => setHoleIdx(Math.min(course.holes.length - 1, holeIdx + 1))} style={styles.holeArrow}>
            <Ionicons name="chevron-forward" size={16} color={colors.charcoal} />
          </Pressable>
        </View>
      </View>

      <View style={[styles.panel, { paddingBottom: insets.bottom + 12 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Overline>PAR</Overline>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
              {[3, 4, 5, 6].map((p) => (
                <Pressable key={p} onPress={() => patchHole({ par: p })} style={[styles.parBtn, hole.par === p && { backgroundColor: colors.green }]}>
                  <Text style={[styles.parTxt, hole.par === p && { color: "#fff" }]}>{p}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Overline>HCP</Overline>
            <TextInput testID="editor-hcp-input" keyboardType="number-pad" value={hole.handicap ? String(hole.handicap) : ""} onChangeText={(t) => patchHole({ handicap: Number(t) || null })} style={styles.hcpInput} />
          </View>
          <Text style={styles.hint}>Tap map to place{"\n"}selected marker</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
          {MODES.map(([k, l]) => (
            <Pressable key={k} testID={`editor-mode-${k}`} onPress={() => setMode(k)} style={[styles.modeBtn, { backgroundColor: mode === k ? colors.green : colors.zinc100 }, hole[k] && styles.modeDone]}>
              <Text style={[styles.modeTxt, { color: mode === k ? "#fff" : colors.zinc600 }]}>{l} {hole[k] ? "✓" : ""}</Text>
            </Pressable>
          ))}
          <Pressable testID="editor-mode-hazard" onPress={() => setMode("hazard")} style={[styles.modeBtn, { backgroundColor: mode === "hazard" ? colors.gold : colors.zinc100 }]}>
            <Text style={[styles.modeTxt, { color: mode === "hazard" ? colors.charcoal : colors.zinc600 }]}>ADD HAZARD</Text>
          </Pressable>
          <Pressable testID="editor-mode-delete" onPress={() => setMode("delete")} style={[styles.modeBtn, { backgroundColor: mode === "delete" ? colors.red : colors.zinc100 }]}>
            <Text style={[styles.modeTxt, { color: mode === "delete" ? "#fff" : colors.zinc600 }]}>DELETE MARKER</Text>
          </Pressable>
          {POI_MODES.map(([k, l]) => (
            <Pressable key={k} testID={`editor-poi-${k}`} onPress={() => setMode(k)} style={[styles.modeBtn, { backgroundColor: mode === k ? colors.water : colors.zinc100 }, course[k] && styles.modeDone]}>
              <Text style={[styles.modeTxt, { color: mode === k ? "#fff" : colors.zinc600 }]}>{l} {course[k] ? "✓" : ""}</Text>
            </Pressable>
          ))}
          {[["FAIRWAY", "DRAW FAIRWAY"], ["GREEN", "DRAW GREEN"], ["BUNKER", "DRAW BUNKER"], ["WATER", "DRAW WATER"], ["OB", "DRAW OB"], ["CART_PATH", "DRAW CART PATH"]].map(([t, l]) => (
            <Pressable key={t} testID={`editor-draw-${t.toLowerCase()}`} onPress={() => { setDraft(null); setMode(`draw:${t}`); }} style={[styles.modeBtn, { backgroundColor: mode === `draw:${t}` ? colors.fairway : colors.zinc100 }]}>
              <Text style={[styles.modeTxt, { color: mode === `draw:${t}` ? "#fff" : colors.zinc600 }]}>{l}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {mode.startsWith("draw:") && (
          <View style={styles.drawRow}>
            <Text style={styles.drawHint}>{draft ? `${draft.points.length} pts` : "Tap map to add points"}</Text>
            <Pressable testID="editor-draw-undo" onPress={() => setDraft((d) => (d && d.points.length ? { ...d, points: d.points.slice(0, -1) } : d))} style={styles.drawBtn}>
              <Text style={styles.drawBtnTxt}>UNDO</Text>
            </Pressable>
            <Pressable testID="editor-draw-finish" onPress={finishShape} style={[styles.drawBtn, { backgroundColor: colors.green }]}>
              <Text style={[styles.drawBtnTxt, { color: "#fff" }]}>FINISH SHAPE</Text>
            </Pressable>
          </View>
        )}

        {mode === "hazard" && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {HAZARD_TYPES.map((t) => (
              <Pressable key={t} testID={`editor-hazard-type-${t.replace(/\s/g, "-").toLowerCase()}`} onPress={() => setHazardType(t)} style={[styles.hazBtn, { backgroundColor: hazardType === t ? colors.charcoal : colors.zinc100 }]}>
                <Text style={[styles.hazTxt, { color: hazardType === t ? "#fff" : colors.zinc500 }]}>{t}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <Pressable style={styles.saveBtn} onPress={save} testID="editor-save-btn">
          <Text style={styles.saveTxt}>SAVE HOLE / COURSE</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.charcoal },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  topBar: { position: "absolute", left: 12, right: 12, flexDirection: "row", alignItems: "center", gap: 8, zIndex: 20 },
  iconBtn: { height: 44, width: 44, borderRadius: 14, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", elevation: 4 },
  namePill: { backgroundColor: "#fff", borderRadius: 14, height: 44, paddingHorizontal: 12, justifyContent: "center", maxWidth: 160, elevation: 4 },
  nameTxt: { fontWeight: "800", fontSize: 12, color: colors.charcoal },
  holePill: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 14, height: 44, elevation: 4 },
  holeArrow: { paddingHorizontal: 8, height: "100%", justifyContent: "center" },
  holeTxt: { fontWeight: "900", fontSize: 12, color: colors.charcoal },
  panel: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 2, borderTopColor: colors.gold, padding: 16, gap: 10 },
  parBtn: { height: 40, width: 40, borderRadius: 10, backgroundColor: colors.zinc100, alignItems: "center", justifyContent: "center" },
  parTxt: { fontWeight: "900", color: colors.charcoal },
  hcpInput: { height: 40, width: 56, borderRadius: 10, borderWidth: 1, borderColor: colors.zinc300, textAlign: "center", fontWeight: "900", color: colors.charcoal },
  hint: { marginLeft: "auto", fontSize: 10, fontWeight: "700", color: colors.zinc400, textAlign: "right" },
  modeBtn: { height: 44, paddingHorizontal: 12, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  modeDone: { borderWidth: 2, borderColor: "rgba(34,197,94,0.5)" },
  drawRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  drawHint: { flex: 1, fontSize: 12, fontWeight: "800", color: colors.zinc500 },
  drawBtn: { paddingHorizontal: 14, height: 36, borderRadius: 10, backgroundColor: colors.zinc100, alignItems: "center", justifyContent: "center" },
  drawBtnTxt: { fontSize: 12, fontWeight: "900", color: colors.charcoal, letterSpacing: 0.5 },
  modeTxt: { fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  hazBtn: { height: 36, paddingHorizontal: 12, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  hazTxt: { fontSize: 10, fontWeight: "900" },
  saveBtn: { height: 56, borderRadius: 18, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  saveTxt: { color: "#fff", fontWeight: "900", letterSpacing: 1.5 },
});
