import React from "react";
import { View, Text, Pressable, Linking, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { imageryIsMapTiler } from "@/src/lib/imagery";

/** Visible provider credits in addition to MapLibre's source-attribution control. */
export function ImageryCredit({ overlay = false }: { overlay?: boolean }) {
  if (!imageryIsMapTiler) return null;
  const open = (url: string) => { void Linking.openURL(url).catch(() => {}); };
  return <View style={[styles.row, overlay && styles.overlay]} testID="imagery-credit">
    <Pressable accessibilityRole="link" accessibilityLabel="MapTiler website" onPress={() => open("https://www.maptiler.com/")}>
      <Image source={require("../../assets/providers/maptiler-logo.svg")} style={styles.logo} contentFit="contain" />
    </Pressable>
    <View style={styles.links}>
      <Text accessibilityRole="link" onPress={() => open("https://www.maptiler.com/copyright/")} style={styles.text}>© MapTiler</Text>
      <Text accessibilityRole="link" onPress={() => open("https://www.openstreetmap.org/copyright")} style={styles.text}>© OpenStreetMap contributors</Text>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  row: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.96)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, margin: 8 },
  overlay: { position: "absolute", bottom: 0, left: 0, zIndex: 50, elevation: 10 },
  logo: { width: 67, height: 20 }, links: { gap: 2 }, text: { color: "#17211b", fontSize: 10 },
});
