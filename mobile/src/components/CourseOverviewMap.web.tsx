import React from "react";
import { View, Text, StyleSheet } from "react-native";

// Web stub — the full-course satellite overview renders on the mobile app.
export function CourseOverviewMap({ style }: { holes?: any; onHolePress?: any; gpsPos?: any; pois?: any; focusKey?: any; focusTarget?: any; style?: any }) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.wrap, style]} testID="course-overview-map">
      <Text style={styles.t}>Course overview</Text>
      <Text style={styles.s}>The full 18-hole map opens on the mobile app</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: "#0a1f12", alignItems: "center", justifyContent: "center" },
  t: { color: "rgba(255,255,255,0.7)", fontSize: 16, fontWeight: "800" },
  s: { color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 4 },
});
