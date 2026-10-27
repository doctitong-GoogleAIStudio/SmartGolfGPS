import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Modal, TextInput, Alert } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { colors, font } from "@/src/theme";
import { serviceSession } from "@/src/lib/serviceSession";
import { courseActionFailure } from "@/src/lib/coursePresentation";
import { api, cachedGet } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { ScreenHeader } from "@/src/components/ui";
import { toast } from "@/src/lib/toast";
import { boundsForCourse } from "@/src/lib/geo";
import { MapBadge } from "@/src/components/MapBadge";
import { LayoutAccuracy } from "@/src/components/LayoutAccuracy";
import { offlineSupported, listOfflineCourseIds, downloadCourseTiles, deleteCourseTiles, getOfflineUsage, clearAllOffline } from "@/src/lib/offline";

export default function Courses() {

  function fmtBytes(bytes: number): string {
    if (!bytes) return "0 MB";
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    if (mb >= 10) return `${Math.round(mb)} MB`;
    return `${mb.toFixed(1)} MB`;
  }

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [role, setRole] = useState<"editor" | "player" | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(false), [accessError, setAccessError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const canEdit = role === "editor" && !!serviceSession.token;
  const [courses, setCourses] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", location: "", holeCount: 18 });
  const [showImport, setShowImport] = useState(false);
  const [importCode, setImportCode] = useState("");
  const [offlineIds, setOfflineIds] = useState<Set<string>>(new Set());
  const [dlProgress, setDlProgress] = useState<Record<string, number>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [usage, setUsage] = useState<{ bytes: number; count: number }>({ bytes: 0, count: 0 });
  const mountedRef = React.useRef(true);

  const refreshUsage = () => { if (offlineSupported) getOfflineUsage().then((u) => mountedRef.current && setUsage(u)).catch(() => {}); };

  const reportFailure = (error: unknown) => {
    const failure = courseActionFailure(error);
    Alert.alert(failure.title, failure.detail, failure.account ? [
      { text: "Later", style: "cancel" }, { text: "Golf account", onPress: () => router.push("/account") },
    ] : [{ text: "OK" }]);
  };
  const load = async () => {
    setLoadError("");
    try { const data = await cachedGet<any[]>("/courses", "courses");if (mountedRef.current) setCourses(data); }
    catch (error) { if (mountedRef.current) setLoadError(courseActionFailure(error).detail); }
  };
  const refreshAccess = async () => {
    setCheckingAccess(true);setAccessError("");setRole(null);
    try {
      if (!serviceSession.token) return;
      const user = await api.get("/auth/me");
      if (mountedRef.current) setRole(user.role === "editor" ? "editor" : "player");
    } catch (error) { if (mountedRef.current) setAccessError(courseActionFailure(error).detail); }
    finally { if (mountedRef.current) setCheckingAccess(false); }
  };
  useFocusEffect(useCallback(() => {
    mountedRef.current = true;
    void refreshAccess();
    load();
    if (offlineSupported) { listOfflineCourseIds().then((ids) => setOfflineIds(new Set(ids))).catch(() => {}); refreshUsage(); }
    return () => { mountedRef.current = false; };
  }, []));

  const clearAll = () => {
    Alert.alert("Free up offline maps?", `This removes all downloaded satellite tiles (${fmtBytes(usage.bytes)}). You can re-download anytime.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Free up", style: "destructive", onPress: async () => {
        await clearAllOffline();
        setOfflineIds(new Set());
        setUsage({ bytes: 0, count: 0 });
        toast.success("Offline maps cleared");
      } },
    ]);
  };

  const runDownload = async (c: any) => {
    let course = c;
    try { course = await api.get(`/courses/${c.id}`); } catch { /* fall back to summary */ }
    const bounds = boundsForCourse(course, c.latitude, c.longitude);
    setDlProgress((prev) => ({ ...prev, [c.id]: 0 }));
    await downloadCourseTiles(c.id, c.name, bounds, (pct) => {
      if (mountedRef.current) setDlProgress((prev) => ({ ...prev, [c.id]: pct }));
    });
    if (!mountedRef.current) return;
    setOfflineIds((s) => new Set(s).add(c.id));
    setDlProgress((prev) => { const n = { ...prev }; delete n[c.id]; return n; });
    refreshUsage();
  };

  const toggleOffline = async (c: any) => {
    const p = dlProgress[c.id];
    if (bulkBusy || (p != null && p >= 0 && p < 100)) { toast.info("Download in progress", "Hang tight — tiles are still saving."); return; }
    if (offlineIds.has(c.id)) {
      Alert.alert("Remove offline map?", `Delete the downloaded satellite tiles for "${c.name}"?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: async () => {
          await deleteCourseTiles(c.id);
          setOfflineIds((s) => { const n = new Set(s); n.delete(c.id); return n; });
          refreshUsage();
          toast.success("Offline map removed");
        } },
      ]);
      return;
    }
    try {
      await runDownload(c);
      if (mountedRef.current) toast.success(`"${c.name}" saved for offline play`);
    } catch (e: any) {
      if (!mountedRef.current) return;
      setDlProgress((prev) => { const n = { ...prev }; delete n[c.id]; return n; });
      toast.error(e?.message || "Could not download offline map");
    }
  };

  const downloadAll = async () => {
    if (bulkBusy) return;
    const todo = courses.filter((c) => !offlineIds.has(c.id));
    if (!todo.length) { toast.info("All caught up", "Every course is already saved offline."); return; }
    setBulkBusy(true);
    let done = 0;
    for (const c of todo) {
      if (!mountedRef.current) break;
      try {
        await runDownload(c);
        done++;
      } catch {
        setDlProgress((prev) => { const n = { ...prev }; delete n[c.id]; return n; });
      }
    }
    if (mountedRef.current) {
      setBulkBusy(false);
      refreshUsage();
      toast.success(`Saved ${done} course${done === 1 ? "" : "s"} offline`, done < todo.length ? "Some downloads failed — tap a card to retry." : undefined);
    }
  };

  const share = async (id: string) => {
    try {
      const r = await api.post(`/courses/${id}/share`);
      await Clipboard.setStringAsync(r.shareCode);
      Alert.alert("Share Code", `Share this code with a friend so they can download this course:\n\n${r.shareCode}\n\n(Copied to clipboard)`, [{ text: "Done" }]);
    } catch (error) {
      reportFailure(error);
    }
  };

  const doImport = async () => {
    const code = importCode.trim().toUpperCase();
    if (code.length !== 6) { toast.error("Enter the 6-character share code"); return; }
    try {
      const c = await api.post("/courses/import", { code });
      setShowImport(false);
      setImportCode("");
      load();
      toast.success(`Imported "${c.name}"`);
    } catch (error) {
      reportFailure(error);
    }
  };

  const create = async () => {
    if (!form.name.trim()) { toast.error("Enter a course name"); return; }
    let lat = 7.052, lng = 125.517;
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status === "granted") {
        const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        lat = p.coords.latitude; lng = p.coords.longitude;
      }
    } catch {}
    try {
      const r = await api.post("/courses", { ...form, latitude: lat, longitude: lng, holes: [] });
      setShowNew(false);
      toast.success("Course created — set tees & greens on the map");
      router.push(`/courses/${r.id}/edit`);
    } catch (error) { reportFailure(error); }
  };

  const regeocode = async () => {
    if (geocoding) return;
    if (!canEdit) { reportFailure(new Error("Sign in with an authorized editor account to update course locations.")); return; }
    setGeocoding(true);
    try {
      const r = await api.post("/courses/geocode-all");
      const n = r.courses || 0;
      if (!n) { toast.info("No eligible course pins", "Hand-mapped courses are preserved."); return; }
      Alert.alert("Course pin searches started", `Searching ${n} course location${n === 1 ? "" : "s"}. Refresh the list later to check updates. Geocoding does not map or verify tees, greens or hazards. Hand-mapped holes are preserved.`);
    } catch (error) { reportFailure(error); }
    finally { if (mountedRef.current) setGeocoding(false); }
  };

  const remove = (id: string) => {
    Alert.alert("Delete this course?", "", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { try { await api.del(`/courses/${id}`); load(); } catch (error) { reportFailure(error); } } },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top, backgroundColor: colors.charcoal }} />
      <ScreenHeader overline="COURSES" title="Golf Courses" onHome={() => router.push("/")} testID="courses-screen" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {canEdit && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <Pressable style={[styles.newBtn, { flex: 1 }]} onPress={() => setShowNew(true)} testID="new-course-btn">
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.newBtnTxt}>NEW COURSE</Text>
          </Pressable>
          <Pressable style={styles.importBtn} onPress={() => setShowImport(true)} testID="import-course-btn">
            <Ionicons name="download" size={18} color={colors.green} />
            <Text style={styles.importBtnTxt}>IMPORT</Text>
          </Pressable>
        </View>}
        <Pressable style={styles.phBtn} onPress={() => router.push("/ph-courses")} testID="browse-ph-courses-btn">
          <Ionicons name="flag" size={18} color={colors.gold} />
          <Text style={styles.phBtnTxt}>BROWSE PHILIPPINE COURSES</Text>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.5)" />
        </Pressable>
        {!!loadError && <Text accessibilityLiveRegion="polite" style={styles.notice} testID="courses-load-error">{loadError}</Text>}
        {!canEdit && <View style={styles.noticeBox} testID="courses-access-notice">
          <Text style={styles.notice}>{!serviceSession.token ? "Sign in to load online courses. You can browse the Philippine directory without an account." : role === "player" ? "Player account: browse and play available courses. Mapping and course location changes require an authorized editor." : checkingAccess ? "Checking account permissions..." : accessError || "Editor controls are unavailable until your account permissions can be checked online."}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push("/account")}><Text style={styles.accountLink}>GOLF ACCOUNT</Text></Pressable>
        </View>}
        {canEdit && <Text style={styles.notice} testID="courses-editor-access">Editor account: course mapping tools enabled.</Text>}
        <Text style={styles.notice}>A course pin is not a hole map. Green distances require reviewed playing geometry. Location searches do not create that geometry.</Text>
        <Pressable accessibilityRole="button" testID="courses-refresh" disabled={checkingAccess} onPress={() => { void load();void refreshAccess(); }}><Text style={styles.accountLink}>REFRESH COURSES & ACCESS</Text></Pressable>
        {canEdit && courses.some((c) => !c.isDemo && c.layoutSource !== "mapped") && (
          <Pressable style={[styles.regeoBtn, geocoding && { opacity: 0.5 }]} disabled={geocoding} onPress={regeocode} testID="regeocode-all-btn">
            <Ionicons name="navigate-circle" size={18} color={colors.green} />
            <Text style={styles.regeoTxt}>{geocoding ? "STARTING LOCATION SEARCHES..." : "UPDATE COURSE PINS"}</Text>
          </Pressable>
        )}
        {offlineSupported && courses.length > 0 && courses.some((c) => !offlineIds.has(c.id)) && (
          <Pressable style={styles.saveAllBtn} onPress={downloadAll} disabled={bulkBusy} testID="download-all-offline-btn">
            <Ionicons name={bulkBusy ? "cloud-download" : "cloud-download-outline"} size={18} color={colors.green} />
            <Text style={styles.saveAllTxt}>
              {bulkBusy ? "SAVING ALL COURSES OFFLINE…" : `SAVE ALL COURSES OFFLINE (${courses.filter((c) => !offlineIds.has(c.id)).length})`}
            </Text>
          </Pressable>
        )}
        {offlineSupported && usage.count > 0 && (
          <View style={styles.storageRow} testID="offline-storage-meter">
            <Ionicons name="server" size={16} color={colors.zinc500} />
            <Text style={styles.storageTxt}>OFFLINE MAPS · {fmtBytes(usage.bytes)} · {usage.count} course{usage.count === 1 ? "" : "s"}</Text>
            <Pressable onPress={clearAll} testID="clear-offline-btn" style={styles.clearBtn}>
              <Text style={styles.clearTxt}>FREE UP</Text>
            </Pressable>
          </View>
        )}
        {courses.map((c) => (
          <View key={c.id} style={styles.card} testID={`course-card-${c.id}`}>
            <Text style={[styles.cName, { fontFamily: font.headBold }]}>{c.name}</Text>
            <Text style={styles.cMeta}>{c.location} · {c.holeCount} holes {c.isDemo ? "· DEMO DATA" : ""}</Text>
            <MapBadge course={c} style={{ marginTop: 8 }} testID={`course-badge-${c.id}`} />
            <LayoutAccuracy course={c} style={{ marginTop: 6 }} testID={`course-accuracy-${c.id}`} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              <Pressable style={styles.playBtn} testID={`course-play-${c.id}`} onPress={async () => { await storage.setItem("sg_quick_course", c.id); router.push("/play"); }}>
                <Ionicons name="locate" size={16} color="#fff" />
                <Text style={styles.playTxt}>PLAY</Text>
              </Pressable>
              {canEdit && <><Pressable style={styles.editBtn} testID={`course-edit-${c.id}`} onPress={() => router.push(`/courses/${c.id}/edit`)}>
                <Ionicons name="pencil" size={16} color={colors.charcoal} />
                <Text style={styles.editTxt}>EDIT</Text>
              </Pressable>
              <Pressable style={styles.editBtn} testID={`course-share-${c.id}`} onPress={() => share(c.id)}>
                <Ionicons name="share-social" size={16} color={colors.charcoal} />
                <Text style={styles.editTxt}>SHARE</Text>
              </Pressable>
              </>}
              {canEdit && !c.isDemo && c.layoutSource !== "mapped" && (
                <Pressable accessibilityLabel={`Confirm location of ${c.name}`} style={styles.editBtn} testID={`course-locate-${c.id}`} onPress={() => router.push(`/courses/${c.id}/locate`)}>
                  <Ionicons name="location" size={16} color={colors.charcoal} />
                </Pressable>
              )}
              {canEdit && <Pressable accessibilityLabel={`Delete ${c.name}`} style={styles.delBtn} testID={`course-delete-${c.id}`} onPress={() => remove(c.id)}>
                <Ionicons name="trash" size={16} color={colors.red} />
              </Pressable>}
            </View>
            {offlineSupported && (() => {
              const done = offlineIds.has(c.id);
              const pct = dlProgress[c.id];
              const busy = pct != null && pct >= 0 && pct < 100;
              return (
                <Pressable style={[styles.offlineRow, done && styles.offlineRowDone]} testID={`course-offline-${c.id}`} onPress={() => toggleOffline(c)}>
                  <Ionicons name={done ? "cloud-done" : busy ? "cloud-download" : "cloud-download-outline"} size={16} color={done ? colors.green : busy ? colors.gold : colors.zinc500} />
                  <Text style={[styles.offlineTxt, { color: done ? colors.green : busy ? colors.charcoal : colors.zinc500 }]}>
                    {done ? "OFFLINE MAP READY · TAP TO REMOVE" : busy ? `DOWNLOADING… ${pct}%` : "DOWNLOAD OFFLINE MAP"}
                  </Text>
                </Pressable>
              );
            })()}
          </View>
        ))}
      </ScrollView>

      <Modal visible={showNew} transparent animationType="slide" onRequestClose={() => setShowNew(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowNew(false)}>
          <Pressable style={styles.sheet} testID="new-course-dialog">
            <Text style={[styles.sheetTitle, { fontFamily: font.headBold }]}>New Course</Text>
            <TextInput testID="course-name-input" placeholder="Course name" placeholderTextColor={colors.zinc400} value={form.name} onChangeText={(t) => setForm({ ...form, name: t })} style={styles.input} />
            <TextInput testID="course-location-input" placeholder="Location" placeholderTextColor={colors.zinc400} value={form.location} onChangeText={(t) => setForm({ ...form, location: t })} style={styles.input} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              {[9, 18].map((n) => (
                <Pressable key={n} testID={`course-holes-${n}`} onPress={() => setForm({ ...form, holeCount: n })} style={[styles.holeBtn, { backgroundColor: form.holeCount === n ? colors.green : colors.zinc100 }]}>
                  <Text style={[styles.holeBtnTxt, { color: form.holeCount === n ? "#fff" : colors.charcoal }]}>{n} HOLES</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={styles.createBtn} onPress={create} testID="create-course-btn">
              <Text style={styles.createTxt}>CREATE & OPEN EDITOR</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showImport} transparent animationType="slide" onRequestClose={() => setShowImport(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowImport(false)}>
          <Pressable style={styles.sheet} testID="import-course-dialog">
            <Text style={[styles.sheetTitle, { fontFamily: font.headBold }]}>Import Course</Text>
            <Text style={styles.importHint}>Enter a share code from a friend to instantly download their mapped course.</Text>
            <TextInput
              testID="import-code-input"
              placeholder="e.g. 7KPQ3M"
              placeholderTextColor={colors.zinc400}
              value={importCode}
              onChangeText={setImportCode}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              style={[styles.input, { fontFamily: font.num, letterSpacing: 4, textAlign: "center" }]}
            />
            <Pressable style={styles.createBtn} onPress={doImport} testID="do-import-btn">
              <Text style={styles.createTxt}>DOWNLOAD COURSE</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  newBtn: { minWidth: 160, minHeight: 56, paddingVertical: 12, borderRadius: 18, backgroundColor: colors.green, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  newBtnTxt: { color: "#fff", fontWeight: "900", letterSpacing: 1.5 },
  importBtn: { minHeight: 56, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 18, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.green, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  importBtnTxt: { color: colors.green, fontWeight: "900", letterSpacing: 1.5 },
  phBtn: { minHeight: 52, paddingVertical: 12, borderRadius: 16, backgroundColor: colors.charcoal, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 16 },
  phBtnTxt: { flexShrink: 1, color: "#fff", fontWeight: "900", letterSpacing: 1, fontSize: 13 },
  regeoBtn: { minHeight: 48, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 14, backgroundColor: "rgba(20,83,45,0.08)", borderWidth: 1, borderColor: colors.green, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  regeoTxt: { flexShrink: 1, color: colors.green, fontWeight: "900", letterSpacing: 0.5, fontSize: 12 },
  saveAllBtn: { height: 48, borderRadius: 14, backgroundColor: "rgba(20,83,45,0.08)", borderWidth: 1, borderColor: colors.green, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  saveAllTxt: { color: colors.green, fontWeight: "900", letterSpacing: 0.5, fontSize: 12 },
  storageRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.zinc200, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  storageTxt: { flex: 1, fontSize: 11, fontWeight: "900", letterSpacing: 0.3, color: colors.zinc600 },
  clearBtn: { paddingHorizontal: 12, height: 32, borderRadius: 9, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center" },
  clearTxt: { fontSize: 11, fontWeight: "900", color: colors.red, letterSpacing: 0.5 },
  importHint: { fontSize: 13, color: colors.zinc500, fontWeight: "600", lineHeight: 19, marginTop: -4 },
  card: { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.zinc200, borderRadius: 18, padding: 16 },
  cName: { fontWeight: "800", fontSize: 15, color: colors.charcoal },
  cMeta: { fontSize: 11, color: colors.zinc400, fontWeight: "700", marginTop: 2 },
  noticeBox: { backgroundColor: "#fff", borderRadius: 12, padding: 12, gap: 10 },
  notice: { color: colors.zinc600, fontSize: 13, lineHeight: 20 },
  accountLink: { color: colors.green, fontWeight: "800", paddingVertical: 8 },
  playBtn: { minWidth: 100, minHeight: 48, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.green, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  playTxt: { color: "#fff", fontSize: 12, fontWeight: "900" },
  editBtn: { minHeight: 48, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, backgroundColor: colors.zinc100, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  editTxt: { fontSize: 12, fontWeight: "900", color: colors.charcoal },
  delBtn: { height: 44, width: 44, borderRadius: 12, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center" },
  offlineRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.zinc100 },
  offlineRowDone: {},
  offlineTxt: { fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 12 },
  sheetTitle: { fontSize: 20, fontWeight: "800", color: colors.charcoal },
  input: { height: 56, borderRadius: 14, borderWidth: 1, borderColor: colors.zinc300, paddingHorizontal: 16, fontWeight: "700", color: colors.charcoal },
  holeBtn: { flex: 1, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  holeBtnTxt: { fontWeight: "900" },
  createBtn: { height: 56, borderRadius: 18, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  createTxt: { color: "#fff", fontWeight: "900", letterSpacing: 1.5 },
});
