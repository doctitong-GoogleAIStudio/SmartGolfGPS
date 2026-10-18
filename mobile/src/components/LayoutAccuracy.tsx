import { reviewedCourse } from "@/src/lib/navigation";
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/src/theme";

// Mapping provenance is a declaration, never a measured GPS/survey accuracy claim.
export function accuracyLevel(course: any) {
  if (!course) return null;
  if (reviewedCourse(course)) return { level: 3, label: "REVIEW DECLARED", color: colors.green, why: "Source/license review supplied by the mapper; not independently certified." };
  return { level: 1, label: "UNVERIFIED", color: colors.zinc400, why: "Directory pins, geocoding and editor saves do not verify playing geometry." };
}

export function LayoutAccuracy({ course, showWhy, style, testID }: { course: any; showWhy?: boolean; style?: any; testID?: string }) {
  const a = accuracyLevel(course);
  if (!a || course?.isDemo) return null;
  return (
    <View style={[styles.wrap, style]} testID={testID || `layout-accuracy-${a.label.toLowerCase().replace(/ /g, "-")}`}>
      <View style={styles.bars}>
        {[1, 2, 3].map((i) => (
          <View key={i} style={[styles.bar, { height: 5 + i * 3, backgroundColor: i <= a.level ? a.color : colors.zinc200 }]} />
        ))}
      </View>
      <Text style={[styles.label, { color: a.color }]}>{a.label}</Text>
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
