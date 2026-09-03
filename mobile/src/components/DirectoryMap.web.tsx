import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/src/theme";

// Web stub — react-native-maps is native-only. Map view works on the mobile app.
export function DirectoryMap({ style }: any) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.wrap, style]} testID="directory-map">
      <Text style={styles.txt}>Course map</Text>
      <Text style={styles.sub}>The pin map opens on the mobile app</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { backgroundColor: "#0a1f12", alignItems: "center", justifyContent: "center" },
  txt: { color: "rgba(255,255,255,0.7)", fontSize: 16, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 4 },
});
