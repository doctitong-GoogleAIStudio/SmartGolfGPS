import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, TextInput, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";
import { GolfMap } from "@/src/components/GolfMap";
import { api } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { LatLng } from "@/src/lib/geo";
import { toast } from "@/src/lib/toast";

export default function LocateCourse() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [course, setCourse] = useState<any>(null);
  const [pin, setPin] = useState<LatLng | null>(null);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [recenterKey, setRecenterKey] = useState(0);

  useEffect(() => {
    api.get(`/courses/${id}`)
      .then((c) => { setCourse(c); setPin({ lat: c.latitude, lng: c.longitude }); })
      .catch(() => toast.error("Course not found"));
  }, [id]);

  if (!course || !pin)
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.green} />
      </View>
    );

  const save = async () => {
    setSaving(true);
    try {
      await api.post(`/courses/${id}/relocate`, { latitude: pin.lat, longitude: pin.lng });
      await storage.setItem("sg_quick_course", String(id));
      toast.success("Location confirmed", "Course pin updated. Hole geometry and review status are unchanged.");
      router.replace("/course-overview");
    } catch (error) {
      toast.error("Could not update location", error instanceof Error ? error.message : "Please try again.");
      setSaving(false);
    }
  };

  const doSearch = async () => {
    const term = q.trim();
    if (term.length < 2) { toast.info("Type at least 2 letters"); return; }
    setSearching(true);
    try {
      const r = await api.get(`/geocode/search?q=${encodeURIComponent(term)}&lat=${pin.lat}&lng=${pin.lng}`);
      setResults(r.results || []);
      if (!(r.results || []).length) toast.info("No places found", "Try a different name.");
    } catch {
      toast.error("Search failed");
    }
    setSearching(false);
  };

  const pick = (res: any) => {
    setPin({ lat: res.lat, lng: res.lng });
    setRecenterKey((k) => k + 1);
    setResults([]);
    setQ(res.name.split(",")[0]);
  };

  return (
    <View style={styles.screen} testID="locate-course-screen">
      <GolfMap center={pin} recenterKey={recenterKey} zoom={16} mapType="hybrid" target={pin} onTargetDrag={setPin} onMapPress={setPin} onMapLongPress={(p) => { setPin(p); setRecenterKey((k) => k + 1); }} />

      <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.topRow}>
          <Pressable style={styles.iconBtn} onPress={() => router.back()} testID="locate-back-btn">
            <Ionicons name="chevron-back" size={20} color={colors.charcoal} />
          </Pressable>
          <View style={styles.titleCard}>
            <Text style={styles.title} numberOfLines={1}>{course.name}</Text>
            <Text style={styles.sub}>Long-press or tap the map, drag the pin, or search below</Text>
          </View>
        </View>

        <View style={styles.searchCard}>
          <Ionicons name="search" size={16} color={colors.zinc400} />
          <TextInput
            testID="locate-search-input"
            value={q}
            onChangeText={setQ}
            onSubmitEditing={doSearch}
            returnKeyType="search"
            placeholder="Search a nearby place or landmark"
            placeholderTextColor={colors.zinc400}
            style={styles.searchInput}
          />
          {searching ? (
            <ActivityIndicator size="small" color={colors.green} />
          ) : (
            <Pressable onPress={doSearch} testID="locate-search-btn" hitSlop={8}>
              <Ionicons name="arrow-forward-circle" size={24} color={colors.green} />
            </Pressable>
          )}
        </View>

        {results.length > 0 && (
          <View style={styles.results} testID="locate-results">
            <ScrollView keyboardShouldPersistTaps="handled">
              {results.map((r, i) => (
                <Pressable key={i} onPress={() => pick(r)} style={styles.resultRow} testID={`locate-result-${i}`}>
                  <Ionicons name="location-outline" size={16} color={colors.green} />
                  <Text style={styles.resultTxt} numberOfLines={2}>{r.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 12 }]} pointerEvents="box-none">
        <View style={styles.coordsPill}>
          <Ionicons name="location" size={14} color={colors.gold} />
          <Text style={styles.coords} testID="locate-coords">{pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}</Text>
        </View>
        <Pressable style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={save} disabled={saving} testID="locate-save-btn">
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark" size={18} color="#fff" />
              <Text style={styles.saveTxt}>USE THIS LOCATION</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.charcoal },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  top: { position: "absolute", left: 12, right: 12, gap: 8, zIndex: 20 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  searchCard: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 12, height: 46, elevation: 4 },
  searchInput: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.charcoal },
  results: { backgroundColor: "#fff", borderRadius: 14, maxHeight: 220, overflow: "hidden", elevation: 4 },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.zinc200 },
  resultTxt: { flex: 1, fontSize: 12, fontWeight: "600", color: colors.charcoal },
  iconBtn: { height: 44, width: 44, borderRadius: 14, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", elevation: 4 },
  titleCard: { flex: 1, backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, elevation: 4 },
  title: { fontWeight: "900", fontSize: 14, color: colors.charcoal },
  sub: { fontSize: 10, fontWeight: "700", color: colors.zinc500, marginTop: 1 },
  bottom: { position: "absolute", left: 12, right: 12, bottom: 0, gap: 10, alignItems: "center" },
  coordsPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(15,15,16,0.85)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  coords: { color: "#fff", fontSize: 12, fontWeight: "800" },
  saveBtn: { alignSelf: "stretch", height: 58, borderRadius: 18, backgroundColor: colors.green, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  saveTxt: { color: "#fff", fontWeight: "900", letterSpacing: 1.5 },
});
