import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, font } from "@/src/theme";
import { api } from "@/src/lib/api";
import { ScreenHeader } from "@/src/components/ui";
import { toast } from "@/src/lib/toast";

type Entry = { name: string; location: string; region: string; latitude: number; longitude: number; holeCount: number };

export default function PhCourses() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<Entry[]>([]);
  const [query, setQuery] = useState("");
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.get("/courses/directory").then(setList).catch(() => toast.error("Could not load directory"));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => `${c.name} ${c.location} ${c.region}`.toLowerCase().includes(q));
  }, [list, query]);

  const grouped = useMemo(() => {
    const g: Record<string, Entry[]> = {};
    for (const c of filtered) (g[c.region] = g[c.region] || []).push(c);
    return g;
  }, [filtered]);

  const addCourse = async (c: Entry) => {
    setBusy(c.name);
    try {
      await api.post("/courses", { name: c.name, location: c.location, latitude: c.latitude, longitude: c.longitude, holeCount: c.holeCount, holes: [] });
      setAdded((a) => ({ ...a, [c.name]: true }));
      toast.success(`Added "${c.name}"`, "Map its holes in the Course Editor or on-site.");
    } catch {
      toast.error("Could not add course");
    }
    setBusy(null);
  };

  if (!list.length)
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.green} />
      </View>
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top, backgroundColor: colors.charcoal }} />
      <ScreenHeader overline={`${list.length} COURSES`} title="Philippine Courses" onBack={() => router.back()} testID="ph-courses-screen" />
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.zinc400} />
        <TextInput
          testID="ph-search-input"
          value={query}
          onChangeText={setQuery}
          placeholder="Search course, city or region"
          placeholderTextColor={colors.zinc400}
          style={styles.search}
        />
        {query ? (
          <Pressable onPress={() => setQuery("")} testID="ph-search-clear">
            <Ionicons name="close-circle" size={18} color={colors.zinc400} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 8 }}>
        {Object.keys(grouped).length === 0 && <Text style={styles.empty}>No courses match "{query}".</Text>}
        {Object.entries(grouped).map(([region, items]) => (
          <View key={region} style={{ gap: 8 }}>
            <Text style={styles.region}>{region.toUpperCase()}</Text>
            {items.map((c) => {
              const id = c.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
              const isAdded = added[c.name];
              return (
                <View key={c.name} style={styles.card} testID={`ph-course-${id}`}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={styles.name}>{c.name}</Text>
                    <Text style={styles.meta}>{c.location} · {c.holeCount} holes</Text>
                  </View>
                  <Pressable
                    testID={`ph-add-${id}`}
                    disabled={isAdded || busy === c.name}
                    onPress={() => addCourse(c)}
                    style={[styles.addBtn, isAdded ? styles.addedBtn : null]}
                  >
                    {busy === c.name ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name={isAdded ? "checkmark" : "add"} size={16} color={isAdded ? colors.green : "#fff"} />
                        <Text style={[styles.addTxt, isAdded && { color: colors.green }]}>{isAdded ? "ADDED" : "ADD"}</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              );
            })}
          </View>
        ))}
        <Text style={styles.note}>Locations are approximate pins. After adding, open the Course Editor (or play on-site with GPS) to map each hole's tee and greens.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", marginHorizontal: 16, marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.zinc200, paddingHorizontal: 14, height: 48 },
  search: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.charcoal },
  region: { fontSize: 11, letterSpacing: 1.5, fontWeight: "800", color: colors.gold, marginTop: 10 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderWidth: 1, borderColor: colors.zinc200, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14 },
  name: { fontWeight: "800", fontSize: 14, color: colors.charcoal },
  meta: { fontSize: 11, color: colors.zinc400, fontWeight: "700", marginTop: 2 },
  addBtn: { minWidth: 78, height: 40, borderRadius: 12, backgroundColor: colors.green, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  addedBtn: { backgroundColor: "rgba(20,83,45,0.1)" },
  addTxt: { color: "#fff", fontWeight: "900", fontSize: 12 },
  empty: { textAlign: "center", color: colors.zinc400, fontWeight: "700", marginTop: 40 },
  note: { fontSize: 11, color: colors.zinc400, fontWeight: "600", lineHeight: 16, marginTop: 16 },
});
