import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";
import { useSettings } from "@/src/context/SettingsContext";
import { useLicense } from "@/src/context/LicenseContext";
import { Overline, ScreenHeader, Toggle, Segment } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { toast } from "@/src/lib/toast";

function LinkRow({ label, icon, onPress, testID }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; testID: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={styles.linkRow}>
      <Ionicons name={icon} size={20} color={colors.green} />
      <Text style={styles.linkTxt}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.zinc400} />
    </Pressable>
  );
}

export default function More() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const { deviceId, activated } = useLicense();

  const wipe = (what: string, fn: () => Promise<any>) => {
    Alert.alert(`Delete ${what}?`, "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await fn();
          toast.success("Deleted");
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top, backgroundColor: colors.charcoal }} />
      <ScreenHeader overline="MORE" title="Settings" testID="more-screen" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}>
        <LinkRow label="Courses & Course Editor" icon="location" onPress={() => router.push("/courses")} testID="more-courses-link" />
        <LinkRow label="Round History" icon="time" onPress={() => router.push("/history")} testID="more-history-link" />
        <LinkRow label="Statistics" icon="stats-chart" onPress={() => router.push("/stats")} testID="more-stats-link" />

        <Overline style={styles.sec}>DEVICE</Overline>
        <View style={styles.licBox}>
          <View style={{ flex: 1 }}>
            <Text style={styles.licLabel}>{activated ? "ACTIVATED" : "TRIAL"}</Text>
            <Text style={styles.licId}>{deviceId}</Text>
          </View>
          {!activated && (
            <Pressable style={styles.activateSm} onPress={() => router.push("/activate")} testID="more-activate-btn">
              <Text style={styles.activateSmTxt}>ACTIVATE</Text>
            </Pressable>
          )}
        </View>

        <Overline style={styles.sec}>UNITS</Overline>
        <Segment label="Distance" options={[["yd", "YARDS"], ["m", "METERS"]]} value={settings.distanceUnit} onChange={(v) => update({ distanceUnit: v })} testID="setting-unit" />
        <Segment label="Wind" options={[["kmh", "KM/H"], ["mph", "MPH"]]} value={settings.windUnit} onChange={(v) => update({ windUnit: v })} testID="setting-wind-unit" />

        <Overline style={styles.sec}>GPS</Overline>
        <Toggle label="GPS Tracking" desc="Live position, navigation & path recording. Disable when not playing." value={settings.gpsTracking !== false} onChange={(v) => update({ gpsTracking: v })} testID="setting-gps-tracking" />

        <Overline style={styles.sec}>PLAYS-LIKE ADJUSTMENTS (ESTIMATES)</Overline>
        <Toggle label="Elevation Adjustment" value={settings.elevationAdj} onChange={(v) => update({ elevationAdj: v })} testID="setting-elevation-adj" />
        <Toggle label="Wind Adjustment" value={settings.windAdj} onChange={(v) => update({ windAdj: v })} testID="setting-wind-adj" />
        <Toggle label="Temperature Adjustment" desc="Applied when Auto Weather is on" value={settings.tempAdj} onChange={(v) => update({ tempAdj: v })} testID="setting-temp-adj" />
        <Toggle label="AI Caddie" value={settings.aiCaddie} onChange={(v) => update({ aiCaddie: v })} testID="setting-ai-caddie" />

        <Overline style={styles.sec}>COMPETITION</Overline>
        <Toggle
          label="Tournament Mode"
          desc="Straight-line distance only. Disables plays-like, wind & AI. Golfer must confirm local rules."
          value={settings.tournamentMode}
          onChange={(v) => update({ tournamentMode: v })}
          testID="setting-tournament-mode"
        />

        <Overline style={styles.sec}>PRIVACY</Overline>
        <Pressable style={styles.dangerBtn} onPress={() => wipe("shot history", () => api.del("/shots"))} testID="delete-shots-btn">
          <Text style={styles.dangerTxt}>DELETE SHOT HISTORY</Text>
        </Pressable>
        <Pressable style={styles.dangerBtn} onPress={() => wipe("all rounds & shots", () => api.del("/data/all"))} testID="delete-all-btn">
          <Text style={styles.dangerTxt}>DELETE ALL ROUNDS & LOCATION HISTORY</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  linkRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.zinc200, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 16 },
  linkTxt: { flex: 1, fontWeight: "700", fontSize: 14, color: colors.charcoal },
  sec: { paddingTop: 12, paddingLeft: 4 },
  licBox: { flexDirection: "row", alignItems: "center", backgroundColor: colors.charcoal, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14 },
  licLabel: { color: colors.gold, fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  licId: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 2, marginTop: 2 },
  activateSm: { backgroundColor: colors.gold, borderRadius: 10, paddingHorizontal: 14, height: 36, alignItems: "center", justifyContent: "center" },
  activateSmTxt: { color: colors.charcoal, fontWeight: "900", fontSize: 11, letterSpacing: 1 },
  dangerBtn: { height: 48, borderRadius: 16, backgroundColor: "#fff", borderWidth: 1, borderColor: "#FECACA", alignItems: "center", justifyContent: "center" },
  dangerTxt: { color: colors.red, fontWeight: "800", fontSize: 13 },
});
