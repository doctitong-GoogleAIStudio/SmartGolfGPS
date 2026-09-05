import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/src/theme";

// Distance-trust indicator derived from how a course was mapped:
// HIGH   = hand-mapped in the editor (surveyed points)
// MEDIUM = simulated holes, but snapped to the real location (geocoded/confirmed)
// LOW    = simulated holes on an approximate pin
export function accuracyLevel(course: any) {
  if (!course) return null;
  if (course.layoutSource === "mapped") return { level: 3, label: "HIGH", color: colors.green, why: "Hand-mapped — surveyed points." };
  if (course.geocoded) return { level: 2, label: "MEDIUM", color: "#a16207", why: "Simulated holes at the real location." };
  return { level: 1, label: "LOW", color: colors.zinc400, why: "Approximate pin — distances may vary." };
}

export function LayoutAccuracy({ course, showWhy, style, testID }: { course: any; showWhy?: boolean; style?: any; testID?: string }) {
  const a = accuracyLevel(course);
  if (!a || course?.isDemo) return null;
  return (
    <View style={[styles.wrap, style]} testID={testID || `layout-accuracy-${a.label.toLowerCase()}`}>
      <View style={styles.bars}>
        {[1, 2, 3].map((i) => (
          <View key={i} style={[styles.bar, { height: 5 + i * 3, backgroundColor: i <= a.level ? a.color : colors.zinc200 }]} />
        ))}
      </View>
      <Text style={[styles.label, { color: a.color }]}>{a.label} ACCURACY</Text>
      {showWhy && <Text style={styles.why} numberOfLines={1}>· {a.why}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 2 },
  bar: { width: 4, borderRadius: 1.5 },
  label: { fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  why: { flexShrink: 1, fontSize: 10, fontWeight: "700", color: colors.zinc500 },
});
