import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, font } from "@/src/theme";
import { useSettings } from "@/src/context/SettingsContext";
import { API, apiHeaders } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { Overline } from "@/src/components/ui";

type Ctx = any;

export default function Caddie() {
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [advice, setAdvice] = useState("");
  const [loading, setLoading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      storage.getItem<string>("sg_caddie_ctx", "").then((raw) => {
        try {
          setCtx(raw ? JSON.parse(raw) : null);
        } catch {
          setCtx(null);
        }
      });
    }, [])
  );

  const ask = async () => {
    if (!ctx) return;
    setLoading(true);
    setAdvice("");
    try {
      if (!API) throw new Error("Backend is not configured");
      const res = await fetch(`${API}/caddie`, {
        method: "POST",
        headers: await apiHeaders(true),
        redirect: "error",
        body: JSON.stringify(ctx),
      });
      if (!res.ok) throw new Error(`Caddie service returned ${res.status}`);
      // RN fetch buffers the SSE stream; parse all data lines once complete.
      const text = await res.text();
      let out = "";
      for (const line of text.split("\n\n")) {
        const l = line.trim();
        if (!l.startsWith("data: ")) continue;
        const data = l.slice(6);
        if (data === "[DONE]") continue;
        try {
          const ev = JSON.parse(data);
          if (ev.t) out += ev.t;
          if (ev.error) out = ev.error;
        } catch {
          // skip
        }
      }
      setAdvice(out || "AI Caddie unavailable. Your rangefinder distances remain fully functional.");
    } catch {
      setAdvice("AI Caddie unavailable. Your rangefinder distances remain fully functional.");
    }
    setLoading(false);
  };

  if (settings.tournamentMode) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]} testID="caddie-tournament-screen">
        <Text style={[styles.h1, { fontFamily: font.headBold }]}>Tournament Mode</Text>
        <Text style={styles.muted}>
          Only permitted distance information is displayed. The golfer is responsible for confirming the applicable Rules of Golf and local competition rules.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top, backgroundColor: colors.green }} />
      <View style={styles.header}>
        <Overline style={{ color: colors.gold }}>SMART CADDIE</Overline>
        <Text style={[styles.headerTitle, { fontFamily: font.headBold }]}>Shot Strategy</Text>
      </View>

      {!ctx ? (
        <Text style={styles.empty} testID="caddie-empty">
          Open the rangefinder MAP first and set a target — your caddie will pick up the situation from there.
        </Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
          <View style={styles.row3}>
            {[
              ["ACTUAL", ctx.actualDistanceYards, "YD"],
              ["PLAYS LIKE*", ctx.playsLikeYards, "YD"],
              ["ELEVATION", ctx.elevationMeters != null ? `${ctx.elevationMeters > 0 ? "+" : ""}${ctx.elevationMeters}` : "--", "M"],
            ].map(([l, v, u]) => (
              <View key={l as string} style={styles.metric}>
                <Text style={styles.metricLbl}>{l}</Text>
                <Text style={[styles.metricVal, { fontFamily: font.num }]}>{v ?? "--"}</Text>
                <Text style={styles.metricUnit}>{u}</Text>
              </View>
            ))}
          </View>
          <View style={styles.row3}>
            {[["FRONT", ctx.frontGreenYards], ["CENTER", ctx.centerGreenYards], ["BACK", ctx.backGreenYards]].map(([l, v]) => (
              <View key={l as string} style={styles.metric}>
                <Text style={styles.metricLbl}>{l}</Text>
                <Text style={[styles.metricVal, { fontFamily: font.num, fontSize: 20 }]}>
                  {v ?? "--"} <Text style={{ fontSize: 10 }}>YD</Text>
                </Text>
              </View>
            ))}
          </View>

          {ctx.recommendedClub && (
            <View style={styles.recCard} testID="caddie-recommendation">
              <Overline style={{ color: colors.gold }}>RECOMMENDED CLUB</Overline>
              <Text style={[styles.recClub, { fontFamily: font.num }]}>{String(ctx.recommendedClub).toUpperCase()}</Text>
              <Text style={styles.recSub}>Typical carry: {ctx.clubCarryYards} yd</Text>
            </View>
          )}

          {settings.aiCaddie && (
            <View style={styles.aiCard}>
              <Pressable style={[styles.askBtn, loading && { opacity: 0.6 }]} onPress={ask} disabled={loading} testID="ask-ai-caddie-btn">
                <Ionicons name="sparkles" size={20} color={colors.gold} />
                <Text style={styles.askTxt}>{loading ? "THINKING…" : "ASK AI CADDIE"}</Text>
              </Pressable>
              {advice ? (
                <Text style={styles.advice} testID="ai-advice-text">
                  {advice}
                </Text>
              ) : null}
              <Text style={styles.disclaimer}>*Plays-like values are estimated playing distances, not surveyed measurements. AI advice uses only pre-calculated data.</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  h1: { fontSize: 20, fontWeight: "800", color: colors.charcoal },
  muted: { fontSize: 13, color: colors.zinc500, textAlign: "center", marginTop: 8, lineHeight: 20 },
  header: { backgroundColor: colors.green, paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle: { color: "#fff", fontSize: 24, fontWeight: "800", marginTop: 2 },
  empty: { fontSize: 14, color: colors.zinc500, textAlign: "center", marginTop: 60, paddingHorizontal: 32, lineHeight: 20 },
  row3: { flexDirection: "row", gap: 8 },
  metric: { flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.zinc200, borderRadius: 14, paddingVertical: 12, alignItems: "center" },
  metricLbl: { fontSize: 8, letterSpacing: 1.5, fontWeight: "800", color: colors.zinc400 },
  metricVal: { fontSize: 26, color: colors.charcoal },
  metricUnit: { fontSize: 9, fontWeight: "700", color: colors.zinc400 },
  recCard: { backgroundColor: colors.charcoal, borderRadius: 20, padding: 20 },
  recClub: { color: "#fff", fontSize: 40, marginTop: 4 },
  recSub: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "700", marginTop: 2 },
  aiCard: { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.zinc200, borderRadius: 20, padding: 20 },
  askBtn: { height: 56, borderRadius: 18, backgroundColor: colors.green, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  askTxt: { color: "#fff", fontWeight: "900", letterSpacing: 1.5, fontSize: 14 },
  advice: { fontSize: 14, marginTop: 16, lineHeight: 21, color: colors.charcoal },
  disclaimer: { fontSize: 10, color: colors.zinc400, marginTop: 12, lineHeight: 15 },
});
