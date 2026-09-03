import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Modal, TextInput, Alert } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { colors, font } from "@/src/theme";
import { api, cachedGet } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { ScreenHeader } from "@/src/components/ui";
import { toast } from "@/src/lib/toast";

export default function Courses() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [courses, setCourses] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", location: "", holeCount: 18 });
  const [showImport, setShowImport] = useState(false);
  const [importCode, setImportCode] = useState("");

  const load = () => cachedGet<any[]>("/courses", "courses").then(setCourses).catch(() => {});
  useFocusEffect(useCallback(() => { load(); }, []));

  const share = async (id: string) => {
    try {
      const r = await api.post(`/courses/${id}/share`);
      await Clipboard.setStringAsync(r.shareCode);
      Alert.alert("Share Code", `Share this code with a friend so they can download this course:\n\n${r.shareCode}\n\n(Copied to clipboard)`, [{ text: "Done" }]);
    } catch {
      toast.error("Could not create share code");
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
    } catch {
      toast.error("No course found for that code");
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
    const r = await api.post("/courses", { ...form, latitude: lat, longitude: lng, holes: [] });
    setShowNew(false);
    toast.success("Course created — set tees & greens on the map");
    router.push(`/courses/${r.id}/edit`);
  };

  const remove = (id: string) => {
    Alert.alert("Delete this course?", "", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await api.del(`/courses/${id}`); load(); } },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top, backgroundColor: colors.charcoal }} />
      <ScreenHeader overline="COURSES" title="Golf Courses" onHome={() => router.push("/")} testID="courses-screen" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable style={[styles.newBtn, { flex: 1 }]} onPress={() => setShowNew(true)} testID="new-course-btn">
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.newBtnTxt}>NEW COURSE</Text>
          </Pressable>
          <Pressable style={styles.importBtn} onPress={() => setShowImport(true)} testID="import-course-btn">
            <Ionicons name="download" size={18} color={colors.green} />
            <Text style={styles.importBtnTxt}>IMPORT</Text>
          </Pressable>
        </View>
        <Pressable style={styles.phBtn} onPress={() => router.push("/ph-courses")} testID="browse-ph-courses-btn">
          <Ionicons name="flag" size={18} color={colors.gold} />
          <Text style={styles.phBtnTxt}>BROWSE PHILIPPINE COURSES</Text>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.5)" />
        </Pressable>
        {courses.map((c) => (
          <View key={c.id} style={styles.card} testID={`course-card-${c.id}`}>
            <Text style={[styles.cName, { fontFamily: font.headBold }]}>{c.name}</Text>
            <Text style={styles.cMeta}>{c.location} · {c.holeCount} holes {c.isDemo ? "· DEMO DATA" : ""}</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <Pressable style={styles.playBtn} testID={`course-play-${c.id}`} onPress={async () => { await storage.setItem("sg_quick_course", c.id); router.push("/play"); }}>
                <Ionicons name="locate" size={16} color="#fff" />
                <Text style={styles.playTxt}>PLAY</Text>
              </Pressable>
              <Pressable style={styles.editBtn} testID={`course-edit-${c.id}`} onPress={() => router.push(`/courses/${c.id}/edit`)}>
                <Ionicons name="pencil" size={16} color={colors.charcoal} />
                <Text style={styles.editTxt}>EDIT</Text>
              </Pressable>
              <Pressable style={styles.editBtn} testID={`course-share-${c.id}`} onPress={() => share(c.id)}>
                <Ionicons name="share-social" size={16} color={colors.charcoal} />
                <Text style={styles.editTxt}>SHARE</Text>
              </Pressable>
              <Pressable style={styles.delBtn} testID={`course-delete-${c.id}`} onPress={() => remove(c.id)}>
                <Ionicons name="trash" size={16} color={colors.red} />
              </Pressable>
            </View>
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
  newBtn: { height: 56, borderRadius: 18, backgroundColor: colors.green, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  newBtnTxt: { color: "#fff", fontWeight: "900", letterSpacing: 1.5 },
  importBtn: { height: 56, paddingHorizontal: 18, borderRadius: 18, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.green, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  importBtnTxt: { color: colors.green, fontWeight: "900", letterSpacing: 1.5 },
  phBtn: { height: 52, borderRadius: 16, backgroundColor: colors.charcoal, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 16 },
  phBtnTxt: { color: "#fff", fontWeight: "900", letterSpacing: 1, fontSize: 13 },
  importHint: { fontSize: 13, color: colors.zinc500, fontWeight: "600", lineHeight: 19, marginTop: -4 },
  card: { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.zinc200, borderRadius: 18, padding: 16 },
  cName: { fontWeight: "800", fontSize: 15, color: colors.charcoal },
  cMeta: { fontSize: 11, color: colors.zinc400, fontWeight: "700", marginTop: 2 },
  playBtn: { flex: 1, height: 44, borderRadius: 12, backgroundColor: colors.green, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  playTxt: { color: "#fff", fontSize: 12, fontWeight: "900" },
  editBtn: { height: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: colors.zinc100, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  editTxt: { fontSize: 12, fontWeight: "900", color: colors.charcoal },
  delBtn: { height: 44, width: 44, borderRadius: 12, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 12 },
  sheetTitle: { fontSize: 20, fontWeight: "800", color: colors.charcoal },
  input: { height: 56, borderRadius: 14, borderWidth: 1, borderColor: colors.zinc300, paddingHorizontal: 16, fontWeight: "700", color: colors.charcoal },
  holeBtn: { flex: 1, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  holeBtnTxt: { fontWeight: "900" },
  createBtn: { height: 56, borderRadius: 18, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  createTxt: { color: "#fff", fontWeight: "900", letterSpacing: 1.5 },
});
