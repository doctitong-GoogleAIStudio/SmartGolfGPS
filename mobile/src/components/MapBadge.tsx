import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";

// Shows whether a course layout is auto-generated ("SIMULATED") or refined by a
// mapper in the editor ("MAPPED"). Hidden for the demo course.
export function MapBadge({ course, style, testID }: { course: any; style?: any; testID?: string }) {
  if (!course || course.isDemo) return null;
  const mapped = course.layoutSource === "mapped";
  return (
    <View
      style={[styles.badge, mapped ? styles.mapped : styles.sim, style]}
      testID={testID || `map-badge-${mapped ? "mapped" : "simulated"}`}
    >
      <Ionicons name={mapped ? "checkmark-circle" : "flask"} size={11} color={mapped ? colors.green : "#a16207"} />
      <Text style={[styles.txt, { color: mapped ? colors.green : "#a16207" }]}>{mapped ? "MAPPED" : "SIMULATED"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingHorizontal: 8, height: 22, borderRadius: 999, borderWidth: 1 },
  sim: { backgroundColor: "#FEF9C3", borderColor: "#FDE68A" },
  mapped: { backgroundColor: "rgba(20,83,45,0.08)", borderColor: "rgba(20,83,45,0.3)" },
  txt: { fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
});
