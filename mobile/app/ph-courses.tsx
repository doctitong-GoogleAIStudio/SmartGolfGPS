import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { colors, font } from "@/src/theme";
import { api } from "@/src/lib/api";
import { haversineMeters } from "@/src/lib/geo";
import { ScreenHeader } from "@/src/components/ui";
import { toast } from "@/src/lib/toast";

type Entry = { name: string; location: string; region: string; latitude: number; longitude: number; holeCount: number };

const BADGE_COLORS = ["#14532D", "#166534", "#0E7490", "#3F6212", "#115E59", "#1E3A8A", "#7C2D12"];
function initials(name: string) {
  const words = name.replace(/[&/().]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !/^(the|de|del|and|golf|club|country)$/i.test(w));
  const pick = words.length ? words : name.split(/\s+/);
  return (pick[0][0] + (pick[1] ? pick[1][0] : "")).toUpperCase();
}
function badgeColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return BADGE_COLORS[h % BADGE_COLORS.length];
}

export default function PhCourses() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<Entry[]>([]);
  const [query, setQuery] = useState("");
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<"region" | "nearest">("region");
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    api.get("/courses/directory").then(setList).catch(() => toast.error("Could not load directory"));
  }, []);

  const getLocation = async () => {
    setLocating(true);
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      let status = perm.status;
      if (status !== "granted") status = (await Location.requestForegroundPermissionsAsync()).status;
      if (status !== "granted") {
        toast.error("Location off", "Enable location to sort by nearest course.");
        setSortMode("region");
        setLocating(false);
        return;
      }
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude });
    } catch {
      toast.error("Could not get your location");
      setSortMode("region");
    }
    setLocating(false);
  };

  const chooseNearest = () => {
    setSortMode("nearest");
    if (!userPos) getLocation();
  };

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

  const nearestSorted = useMemo(() => {
    if (!userPos) return filtered;
    return [...filtered].sort(
      (a, b) => (haversineMeters(userPos, { lat: a.latitude, lng: a.longitude }) as number) - (haversineMeters(userPos, { lat: b.latitude, lng: b.longitude }) as number)
    );
  }, [filtered, userPos]);

  const addCourse = async (c: Entry) => {
    setBusy(c.name);
    try {
      await api.post("/courses", { name: c.name, location: c.location, latitude: c.latitude, longitude: c.longitude, holeCount: c.holeCount, holes: [] });
      setAdded((a) => ({ ...a, [c.name]: true }));
      toast.success(`Added "${c.name}"`, "Par-72 layout ready. Map holes in the editor or on-site.");
    } catch {
      toast.error("Could not add course");
    }
    setBusy(null);
  };

  const Row = ({ c }: { c: Entry }) => {
    const id = c.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    const isAdded = added[c.name];
    const distKm = userPos ? (haversineMeters(userPos, { lat: c.latitude, lng: c.longitude }) as number) / 1000 : null;
    return (
      <View style={styles.card} testID={`ph-course-${id}`}>
        <View style={[styles.badge, { backgroundColor: badgeColor(c.name) }]}>
          <Text style={styles.badgeTxt}>{initials(c.name)}</Text>
          <View style={styles.badgeFlag}>
            <Ionicons name="flag" size={9} color={colors.gold} />
          </View>
        </View>
        <View style={{ flex: 1, paddingHorizontal: 12 }}>
          <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {c.location} · {c.holeCount} holes{distKm != null ? `  ·  ${distKm < 1 ? Math.round(distKm * 1000) + " m" : distKm.toFixed(distKm < 10 ? 1 : 0) + " km"}` : ""}
          </Text>
        </View>
        <Pressable testID={`ph-add-${id}`} disabled={isAdded || busy === c.name} onPress={() => addCourse(c)} style={[styles.addBtn, isAdded ? styles.addedBtn : null]}>
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
        <TextInput testID="ph-search-input" value={query} onChangeText={setQuery} placeholder="Search course, city or region" placeholderTextColor={colors.zinc400} style={styles.search} />
        {query ? (
          <Pressable onPress={() => setQuery("")} testID="ph-search-clear">
            <Ionicons name="close-circle" size={18} color={colors.zinc400} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.sortRow}>
        <Text style={styles.sortLbl}>SORT</Text>
        <Pressable testID="ph-sort-region" onPress={() => setSortMode("region")} style={[styles.sortChip, sortMode === "region" && styles.sortChipOn]}>
          <Text style={[styles.sortChipTxt, sortMode === "region" && { color: "#fff" }]}>REGION</Text>
        </Pressable>
        <Pressable testID="ph-sort-nearest" onPress={chooseNearest} style={[styles.sortChip, sortMode === "nearest" && styles.sortChipOn]}>
          {locating ? <ActivityIndicator size="small" color={sortMode === "nearest" ? "#fff" : colors.green} /> : <Ionicons name="navigate" size={13} color={sortMode === "nearest" ? "#fff" : colors.zinc500} />}
          <Text style={[styles.sortChipTxt, sortMode === "nearest" && { color: "#fff" }]}>NEAREST</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 8 }}>
        {filtered.length === 0 && <Text style={styles.empty}>No courses match "{query}".</Text>}
        {sortMode === "nearest" ? (
          nearestSorted.map((c) => <Row key={c.name} c={c} />)
        ) : (
          Object.entries(grouped).map(([region, items]) => (
            <View key={region} style={{ gap: 8 }}>
              <Text style={styles.region}>{region.toUpperCase()}</Text>
              {items.map((c) => <Row key={c.name} c={c} />)}
            </View>
          ))
        )}
        <Text style={styles.note}>Locations are approximate pins. Added courses start with a par-72 layout — map each hole's tee & greens in the Course Editor or on-site with GPS.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", marginHorizontal: 16, marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.zinc200, paddingHorizontal: 14, height: 48 },
  search: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.charcoal },
  sortRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, marginTop: 12 },
  sortLbl: { fontSize: 10, letterSpacing: 1.5, fontWeight: "800", color: colors.zinc400 },
  sortChip: { flexDirection: "row", alignItems: "center", gap: 5, height: 34, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.zinc100 },
  sortChipOn: { backgroundColor: colors.green },
  sortChipTxt: { fontSize: 11, fontWeight: "900", color: colors.zinc500, letterSpacing: 0.5 },
  region: { fontSize: 11, letterSpacing: 1.5, fontWeight: "800", color: colors.gold, marginTop: 10 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderWidth: 1, borderColor: colors.zinc200, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 12 },
  badge: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  badgeTxt: { color: "#fff", fontWeight: "900", fontSize: 15, letterSpacing: 0.5 },
  badgeFlag: { position: "absolute", right: -3, bottom: -3, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.charcoal, alignItems: "center", justifyContent: "center" },
  name: { fontWeight: "800", fontSize: 14, color: colors.charcoal },
  meta: { fontSize: 11, color: colors.zinc400, fontWeight: "700", marginTop: 2 },
  addBtn: { minWidth: 74, height: 40, borderRadius: 12, backgroundColor: colors.green, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  addedBtn: { backgroundColor: "rgba(20,83,45,0.1)" },
  addTxt: { color: "#fff", fontWeight: "900", fontSize: 12 },
  empty: { textAlign: "center", color: colors.zinc400, fontWeight: "700", marginTop: 40 },
  note: { fontSize: 11, color: colors.zinc400, fontWeight: "600", lineHeight: 16, marginTop: 16 },
});
