import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ImageBackground } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, font } from "@/src/theme";
import { useLicense } from "@/src/context/LicenseContext";

const HERO = "https://images.unsplash.com/photo-1596782680712-caf5530d2b3c?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";

type MenuItem = { label: string; path: string; icon: keyof typeof Ionicons.glyphMap; testID: string; primary?: boolean };

const ITEMS: MenuItem[] = [
  { label: "START ROUND", path: "/start-round", icon: "flag", testID: "home-start-round-btn", primary: true },
  { label: "QUICK RANGEFINDER", path: "/play", icon: "locate", testID: "home-quick-rangefinder-btn", primary: true },
  { label: "COURSES", path: "/courses", icon: "location", testID: "home-courses-btn" },
  { label: "MY BAG", path: "/bag", icon: "briefcase", testID: "home-bag-btn" },
  { label: "ROUND HISTORY", path: "/history", icon: "time", testID: "home-history-btn" },
  { label: "STATISTICS", path: "/stats", icon: "stats-chart", testID: "home-stats-btn" },
  { label: "SETTINGS", path: "/more", icon: "settings", testID: "home-settings-btn" },
];

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activated, remainingMs, ready } = useLicense();
  const days = Math.floor(remainingMs / 86400000);
  const hrs = Math.floor((remainingMs % 86400000) / 3600000);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 40 }} testID="home-screen">
      <ImageBackground source={{ uri: HERO }} style={[styles.hero, { paddingTop: insets.top }]}>
        <View style={styles.heroOverlay} />
        <View style={styles.heroText}>
          <Text style={styles.heroOverline}>GPS RANGEFINDER · AI CADDIE</Text>
          <Text style={[styles.heroTitle, { fontFamily: font.num }]}>SMART GOLF GPS</Text>
        </View>
      </ImageBackground>

      {ready && !activated && (
        <Pressable style={styles.trialCard} onPress={() => router.push("/activate")} testID="home-trial-card">
          <Ionicons name="time-outline" size={20} color={colors.gold} />
          <Text style={styles.trialTxt}>
            Free trial · {days}d {hrs}h left
          </Text>
          <Text style={styles.trialCta}>ACTIVATE ›</Text>
        </Pressable>
      )}
      {ready && activated && (
        <View style={[styles.trialCard, { borderColor: colors.green }]} testID="home-activated-card">
          <Ionicons name="checkmark-circle" size={20} color={colors.green} />
          <Text style={[styles.trialTxt, { color: colors.green }]}>Device activated · Full access</Text>
        </View>
      )}

      <View style={styles.menu}>
        {ITEMS.map((it) => (
          <Pressable
            key={it.testID}
            testID={it.testID}
            onPress={() => router.push(it.path as any)}
            style={({ pressed }) => [
              styles.btn,
              it.primary ? styles.btnPrimary : styles.btnGhost,
              pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
            ]}
          >
            <Ionicons name={it.icon} size={24} color={it.primary ? colors.gold : colors.green} />
            <Text style={[styles.btnTxt, { color: it.primary ? "#fff" : colors.charcoal }]}>{it.label}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  hero: { height: 280, justifyContent: "flex-end" },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,15,16,0.35)" },
  heroText: { padding: 24 },
  heroOverline: { color: colors.gold, fontSize: 11, letterSpacing: 2, fontWeight: "800" },
  heroTitle: { color: "#fff", fontSize: 46, marginTop: 4 },
  trialCard: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  trialTxt: { flex: 1, fontWeight: "800", color: colors.charcoal, fontSize: 13 },
  trialCta: { color: colors.gold, fontWeight: "900", fontSize: 12, letterSpacing: 1 },
  menu: { paddingHorizontal: 20, paddingTop: 20, gap: 12 },
  btn: { height: 64, borderRadius: 18, flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 22 },
  btnPrimary: { backgroundColor: colors.green },
  btnGhost: { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.zinc200 },
  btnTxt: { fontFamily: font.headBold, fontWeight: "800", fontSize: 16, letterSpacing: 1 },
});
