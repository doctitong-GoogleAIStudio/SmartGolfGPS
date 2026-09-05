import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
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
      toast.success("Location confirmed", "Layout re-anchored to this spot.");
      router.replace("/course-overview");
    } catch {
      toast.error("Could not update location");
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen} testID="locate-course-screen">
      <GolfMap center={pin} zoom={16} mapType="hybrid" target={pin} onTargetDrag={setPin} onMapPress={setPin} />

      <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable style={styles.iconBtn} onPress={() => router.back()} testID="locate-back-btn">
          <Ionicons name="chevron-back" size={20} color={colors.charcoal} />
        </Pressable>
        <View style={styles.titleCard}>
          <Text style={styles.title} numberOfLines={1}>{course.name}</Text>
          <Text style={styles.sub}>Drag the pin to the clubhouse, or tap the map</Text>
        </View>
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
  top: { position: "absolute", left: 12, right: 12, flexDirection: "row", alignItems: "center", gap: 8, zIndex: 20 },
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
