import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { colors, font } from "@/src/theme";
import { api } from "@/src/lib/api";
import { haversineMeters } from "@/src/lib/geo";
import { useSettings } from "@/src/context/SettingsContext";
import { DirectoryMap } from "@/src/components/DirectoryMap";
import { ScreenHeader } from "@/src/components/ui";
import { toast } from "@/src/lib/toast";
import { storage } from "@/src/utils/storage";

const RECENT_KEY = "sg_recent_courses";

type Entry = { name: string; location: string; region: string; latitude: number; longitude: number; holeCount: number };

const BADGE_COLORS = ["#14532D", "#166534", "#0E7490", "#3F6212", "#115E59", "#1E3A8A", "#7C2D12"];
const PHOTOS = [
  "https://images.unsplash.com/photo-1763917379121-91130139aca0?crop=entropy&cs=srgb&fm=jpg&q=80&w=640&ixlib=rb-4.1.0",
  "https://images.unsplash.com/photo-1785016680819-eb4bf6e0b1c8?crop=entropy&cs=srgb&fm=jpg&q=80&w=640&ixlib=rb-4.1.0",
  "https://images.unsplash.com/photo-1605144156546-91acf5e4cffd?crop=entropy&cs=srgb&fm=jpg&q=80&w=640&ixlib=rb-4.1.0",
  "https://images.unsplash.com/photo-1605144156683-5ebde77feed5?crop=entropy&cs=srgb&fm=jpg&q=80&w=640&ixlib=rb-4.1.0",
  "https://images.unsplash.com/photo-1629596545782-775f0792dbc8?crop=entropy&cs=srgb&fm=jpg&q=80&w=640&ixlib=rb-4.1.0",
  "https://images.unsplash.com/photo-1785638163680-20c2a93fe676?crop=entropy&cs=srgb&fm=jpg&q=80&w=640&ixlib=rb-4.1.0",
];
function nameHash(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}
function photoFor(name: string) {
  return PHOTOS[nameHash(name) % PHOTOS.length];
}
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
  const { settings } = useSettings();
  const imperial = settings.distanceUnit === "yd";
  const [list, setList] = useState<Entry[]>([]);
  const [query, setQuery] = useState("");
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<"region" | "nearest">("region");
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [selected, setSelected] = useState<Entry | null>(null);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [regionFilter, setRegionFilter] = useState<string>("");
  const [recent, setRecent] = useState<Entry[]>([]);

  const fmtDistance = (meters: number) => {
    if (imperial) {
      const mi = meters * 0.000621371;
      return mi < 0.1 ? `${Math.round(meters * 3.28084)} ft` : `${mi.toFixed(mi < 10 ? 1 : 0)} mi`;
    }
    const km = meters / 1000;
    return km < 1 ? `${Math.round(meters)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`;
  };

  useEffect(() => {
    api.get("/courses/directory").then(setList).catch(() => toast.error("Could not load directory"));
    storage.getItem<string>(RECENT_KEY, "").then((raw) => {
      const rr: Entry[] = raw ? JSON.parse(raw) : [];
      setRecent(rr);
      setAdded(Object.fromEntries(rr.map((c) => [c.name, true])));
    });
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

  const regions = useMemo(() => {
    const seen: string[] = [];
    for (const c of list) if (!seen.includes(c.region)) seen.push(c.region);
    return seen;
  }, [list]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const x of list) c[x.region] = (c[x.region] || 0) + 1;
    return c;
  }, [list]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((c) => {
      if (regionFilter && c.region !== regionFilter) return false;
      if (q && !`${c.name} ${c.location} ${c.region}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [list, query, regionFilter]);

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
      setRecent((prev) => {
        const next = [c, ...prev.filter((r) => r.name !== c.name)].slice(0, 12);
        storage.setItem(RECENT_KEY, JSON.stringify(next));
        return next;
      });
      toast.success(`Added "${c.name}"`, "Par-72 layout ready. Map holes in the editor or on-site.");
    } catch {
      toast.error("Could not add course");
    }
    setBusy(null);
  };

  const Row = ({ c }: { c: Entry }) => {
    const id = c.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    const isAdded = added[c.name];
    const distKm = userPos ? (haversineMeters(userPos, { lat: c.latitude, lng: c.longitude }) as number) : null;
    return (
      <View style={styles.card} testID={`ph-course-${id}`}>
        <View style={styles.photoWrap}>
          <Image source={{ uri: photoFor(c.name) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} testID={`ph-photo-${id}`} />
          <View style={styles.photoShade} />
          <View style={styles.holesChip}>
            <Ionicons name="flag" size={10} color={colors.gold} />
            <Text style={styles.holesChipTxt}>{c.holeCount}</Text>
          </View>
          <Text style={styles.photoName} numberOfLines={2}>{c.name}</Text>
        </View>
        <View style={styles.cardBody}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.meta} numberOfLines={1}>
              {c.location}{distKm != null ? `  ·  ${fmtDistance(distKm)}` : ""}
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
        <View style={{ flex: 1 }} />
        <View style={styles.viewToggle}>
          <Pressable testID="ph-view-list" onPress={() => setViewMode("list")} style={[styles.viewBtn, viewMode === "list" && styles.viewBtnOn]}>
            <Ionicons name="list" size={16} color={viewMode === "list" ? "#fff" : colors.zinc500} />
          </Pressable>
          <Pressable testID="ph-view-map" onPress={() => { setViewMode("map"); if (!userPos) getLocation(); }} style={[styles.viewBtn, viewMode === "map" && styles.viewBtnOn]}>
            <Ionicons name="map" size={16} color={viewMode === "map" ? "#fff" : colors.zinc500} />
          </Pressable>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chipsContent} testID="ph-region-chips">
        <Pressable testID="ph-region-all" onPress={() => setRegionFilter("")} style={[styles.regionChip, regionFilter === "" && styles.regionChipOn]}>
          <Text style={[styles.regionChipTxt, regionFilter === "" && { color: "#fff" }]}>All</Text>
          <Text style={[styles.regionChipCount, regionFilter === "" && styles.regionChipCountOn]}>{list.length}</Text>
        </Pressable>
        {regions.map((r) => (
          <Pressable key={r} testID={`ph-region-${r.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`} onPress={() => setRegionFilter(r === regionFilter ? "" : r)} style={[styles.regionChip, regionFilter === r && styles.regionChipOn]}>
            <Text style={[styles.regionChipTxt, regionFilter === r && { color: "#fff" }]}>{r}</Text>
            <Text style={[styles.regionChipCount, regionFilter === r && styles.regionChipCountOn]}>{counts[r] || 0}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {viewMode === "map" ? (
        <View style={{ flex: 1 }} testID="ph-map-view">
          <DirectoryMap courses={filtered} selectedName={selected?.name} onSelect={(c: Entry) => setSelected(c)} />
          {selected && (
            <View style={[styles.selCard, { bottom: insets.bottom + 16 }]} testID="ph-selected-card">
              <View style={[styles.badge, { backgroundColor: badgeColor(selected.name) }]}>
                <Text style={styles.badgeTxt}>{initials(selected.name)}</Text>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 12 }}>
                <Text style={styles.name} numberOfLines={1}>{selected.name}</Text>
                <Text style={styles.meta} numberOfLines={1}>{selected.location} · {selected.holeCount} holes</Text>
              </View>
              <Pressable
                testID="ph-selected-add"
                disabled={!!added[selected.name] || busy === selected.name}
                onPress={() => addCourse(selected)}
                style={[styles.addBtn, added[selected.name] ? styles.addedBtn : null]}
              >
                {busy === selected.name ? <ActivityIndicator size="small" color="#fff" /> : (
                  <>
                    <Ionicons name={added[selected.name] ? "checkmark" : "add"} size={16} color={added[selected.name] ? colors.green : "#fff"} />
                    <Text style={[styles.addTxt, added[selected.name] && { color: colors.green }]}>{added[selected.name] ? "ADDED" : "ADD"}</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}
        </View>
      ) : (
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 8 }}>
        {recent.length > 0 && !query && !regionFilter && (
          <View style={{ gap: 8, marginBottom: 4 }} testID="ph-recent-section">
            <Text style={styles.region}>RECENTLY ADDED</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
              {recent.map((c) => (
                <Pressable key={c.name} testID={`ph-recent-${c.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`} onPress={() => setQuery(c.name)} style={styles.recentCard}>
                  <View style={[styles.recentBadge, { backgroundColor: badgeColor(c.name) }]}>
                    <Text style={styles.badgeTxt}>{initials(c.name)}</Text>
                  </View>
                  <Text style={styles.recentName} numberOfLines={2}>{c.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
        {filtered.length === 0 && <Text style={styles.empty}>{query ? `No courses match "${query}".` : "No courses in this region yet."}</Text>}
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
      )}
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
  chipsScroll: { flexGrow: 0, flexShrink: 0, marginTop: 12 },
  chipsContent: { paddingHorizontal: 16, gap: 8, alignItems: "center", paddingVertical: 2 },
  regionChip: { flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.zinc100, justifyContent: "center", flexShrink: 0 },
  regionChipOn: { backgroundColor: colors.charcoal },
  regionChipTxt: { fontSize: 12, fontWeight: "800", color: colors.zinc500 },
  regionChipCount: { fontSize: 11, fontWeight: "900", color: colors.zinc400, backgroundColor: "rgba(0,0,0,0.06)", minWidth: 20, textAlign: "center", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 7, overflow: "hidden" },
  regionChipCountOn: { color: "#fff", backgroundColor: "rgba(255,255,255,0.18)" },
  recentCard: { width: 116, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.zinc200, borderRadius: 14, padding: 10, alignItems: "center", gap: 6 },
  recentBadge: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  recentName: { fontSize: 11, fontWeight: "800", color: colors.charcoal, textAlign: "center" },
  viewToggle: { flexDirection: "row", backgroundColor: colors.zinc100, borderRadius: 10, padding: 2, gap: 2 },
  viewBtn: { width: 38, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  viewBtnOn: { backgroundColor: colors.green },
  selCard: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 16, padding: 12, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 12, elevation: 8 },
  region: { fontSize: 11, letterSpacing: 1.5, fontWeight: "800", color: colors.gold, marginTop: 10 },
  card: { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.zinc200, borderRadius: 16, overflow: "hidden" },
  photoWrap: { height: 108, backgroundColor: colors.charcoal, justifyContent: "flex-end" },
  photoShade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 64, backgroundColor: "rgba(0,0,0,0.42)" },
  holesChip: { position: "absolute", top: 8, right: 8, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 8, height: 22, borderRadius: 11 },
  holesChipTxt: { color: "#fff", fontWeight: "900", fontSize: 11 },
  photoName: { color: "#fff", fontWeight: "900", fontSize: 15, paddingHorizontal: 12, paddingBottom: 10, textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 4 },
  cardBody: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10 },
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
