import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/src/theme";

// Web-only stub: react-native-maps is native-only and crashes the web bundle
// if imported. Metro auto-selects this file for `platform=web`. The live
// satellite map renders on the mobile app.
export function GolfMap({ style }: any) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.wrap, style]} testID="golf-map">
      <Text style={styles.txt}>Satellite map</Text>
      <Text style={styles.sub}>Live map renders on the mobile app</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: "#0a1f12", alignItems: "center", justifyContent: "center" },
  txt: { color: "rgba(255,255,255,0.7)", fontSize: 16, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 4 },
});
