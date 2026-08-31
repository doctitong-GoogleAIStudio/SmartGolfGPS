import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TextInput, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font } from "@/src/theme";
import { api, cachedGet } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { mToYd } from "@/src/lib/geo";
import { Overline } from "@/src/components/ui";
import { toast } from "@/src/lib/toast";

type Club = { id: string; name: string; carry: number; total: number };
type Bag = { id: string; clubs: Club[] };
type Stat = { club: string; count: number; typicalMeters: number; longestMeters: number };

export default function BagScreen() {
  const insets = useSafeAreaInsets();
  const [bag, setBag] = useState<Bag | null>(null);
  const [stats, setStats] = useState<Stat[]>([]);

  useEffect(() => {
    cachedGet<Bag>("/bag", "bag").then(setBag).catch(() => {});
    api.get("/club-stats").then(setStats).catch(() => {});
  }, []);

  const save = (clubs: Club[]) => {
    if (!bag) return;
    const next = { ...bag, clubs };
    setBag(next);
    api
      .put("/bag", next)
      .then(() => storage.setItem("sgc_bag", JSON.stringify(next)))
      .catch(() => toast.error("Save failed"));
  };

  const patchClub = (id: string, field: "carry" | "total", value: string) => {
    if (!bag) return;
    save(bag.clubs.map((c) => (c.id === id ? { ...c, [field]: Number(value) || 0 } : c)));
  };

  const acceptSuggestion = (name: string, yd: number) => {
    if (!bag) return;
    save(bag.clubs.map((c) => (c.name === name ? { ...c, carry: yd } : c)));
    toast.success(`${name} updated to ${yd} yd`);
  };

  if (!bag)
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.green} />
      </View>
    );

  const statFor = (name: string) => stats.find((s) => s.club === name);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top, backgroundColor: colors.charcoal }} />
      <View style={styles.header}>
        <Overline style={{ color: colors.gold }}>MY BAG</Overline>
        <Text style={[styles.title, { fontFamily: font.headBold }]}>Club Distances</Text>
        <Text style={styles.sub}>Carry distances in yards. Tap a number to edit.</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 40 }}>
        {bag.clubs.map((c) => {
          const st = statFor(c.name);
          const suggested = st && st.count >= 5 ? Math.round(mToYd(st.typicalMeters)) : null;
          const tid = c.name.replace(/\s/g, "-").toLowerCase();
          return (
            <View key={c.id} style={styles.clubCard} testID={`bag-club-${tid}`}>
              <View style={styles.clubTop}>
                <Text style={[styles.clubName, { fontFamily: font.headBold }]}>{c.name}</Text>
                <View style={{ flexDirection: "row", gap: 16 }}>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.fieldLbl}>CARRY</Text>
                    <TextInput
                      testID={`club-carry-input-${tid}`}
                      value={String(c.carry)}
                      onChangeText={(v) => patchClub(c.id, "carry", v)}
                      keyboardType="number-pad"
                      style={[styles.numInput, { fontFamily: font.num }]}
                    />
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.fieldLbl}>TOTAL</Text>
                    <TextInput
                      value={String(c.total)}
                      onChangeText={(v) => patchClub(c.id, "total", v)}
                      keyboardType="number-pad"
                      style={[styles.numInput, { fontFamily: font.num }]}
                    />
                  </View>
                </View>
              </View>
              {st && (
                <Text style={styles.statLine}>
                  {st.count} shots · typical {Math.round(mToYd(st.typicalMeters))} yd · longest {Math.round(mToYd(st.longestMeters))} yd
                </Text>
              )}
              {suggested && Math.abs(suggested - c.carry) >= 4 && (
                <View style={styles.suggest} testID={`club-suggestion-${tid}`}>
                  <Text style={styles.suggestTxt}>
                    Update carry to <Text style={{ color: colors.green }}>{suggested} yd</Text>?
                  </Text>
                  <Pressable style={styles.suggestBtn} onPress={() => acceptSuggestion(c.name, suggested)}>
                    <Text style={styles.suggestBtnTxt}>YES</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  header: { backgroundColor: colors.charcoal, paddingHorizontal: 20, paddingBottom: 20 },
  title: { color: "#fff", fontSize: 24, fontWeight: "800", marginTop: 2 },
  sub: { color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "700", marginTop: 4 },
  clubCard: { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.zinc200, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12 },
  clubTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  clubName: { fontWeight: "800", fontSize: 15, color: colors.charcoal },
  fieldLbl: { fontSize: 8, letterSpacing: 1.5, fontWeight: "800", color: colors.zinc400 },
  numInput: { width: 64, fontSize: 20, textAlign: "right", color: colors.charcoal, borderBottomWidth: 1, borderBottomColor: colors.zinc200, paddingVertical: 2 },
  statLine: { fontSize: 10, fontWeight: "700", color: colors.zinc400, marginTop: 6 },
  suggest: { marginTop: 8, backgroundColor: "rgba(20,83,45,0.05)", borderWidth: 1, borderColor: "rgba(20,83,45,0.2)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  suggestTxt: { fontSize: 11, fontWeight: "700", color: colors.charcoal, flex: 1 },
  suggestBtn: { height: 32, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  suggestBtnTxt: { color: "#fff", fontWeight: "900", fontSize: 10 },
});
