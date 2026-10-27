import { courseMapStatus } from "@/src/lib/coursePresentation";
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";

// Geometry status is separate from source review and GPS accuracy.
export function MapBadge({ course, style, testID }: { course: any; style?: any; testID?: string }) {
  if (!course || course.isDemo) return null;
  const status = courseMapStatus(course);
  const mapped = status === "MAPPED";
  return (
    <View
      style={[styles.badge, mapped ? styles.mapped : styles.sim, style]}
      testID={testID || `map-badge-${status.toLowerCase().replace(/ /g, "-")}`}
    >
      <Ionicons name={mapped ? "map" : status === "SIMULATED" ? "flask" : "location-outline"} size={11} color={mapped ? colors.green : "#a16207"} />
      <Text style={[styles.txt, { color: mapped ? colors.green : "#a16207" }]}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingHorizontal: 8, minHeight: 22, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  sim: { backgroundColor: "#FEF9C3", borderColor: "#FDE68A" },
  mapped: { backgroundColor: "rgba(20,83,45,0.08)", borderColor: "rgba(20,83,45,0.3)" },
  txt: { fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
});
