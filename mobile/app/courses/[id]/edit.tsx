import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";
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
  const [hazardType, setHazardType] = useState("BUNKER");

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
    setCourse({ ...course, holes });
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

  return (
    <View style={styles.screen} testID="course-editor-screen">
      <GolfMap center={center} zoom={17} mapType="satellite" onMapPress={onMapPress} tee={hole.tee} greens={hole} hazards={hole.hazards} onHazardPress={onHazardPress} gpsPos={gpsPos} pois={coursePois} recenterKey={holeIdx + 1} />

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
        </ScrollView>

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
  modeTxt: { fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  hazBtn: { height: 36, paddingHorizontal: 12, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  hazTxt: { fontSize: 10, fontWeight: "900" },
  saveBtn: { height: 56, borderRadius: 18, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  saveTxt: { color: "#fff", fontWeight: "900", letterSpacing: 1.5 },
});
