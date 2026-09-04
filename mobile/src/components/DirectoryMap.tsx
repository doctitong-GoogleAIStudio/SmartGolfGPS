import React, { useEffect, useRef } from "react";
import { StyleSheet, View, Text } from "react-native";
import { Map, Camera, Marker, type CameraRef } from "@maplibre/maplibre-react-native";
import { colors } from "@/src/theme";

const ESRI_SAT =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const MAP_STYLE: any = {
  version: 8,
  sources: { esri: { type: "raster", tiles: [ESRI_SAT], tileSize: 256, maxzoom: 19 } },
  layers: [{ id: "esri", type: "raster", source: "esri" }],
};

type Entry = { name: string; latitude: number; longitude: number };

export function DirectoryMap({ courses, selectedName, onSelect, style }: { courses: Entry[]; selectedName?: string | null; onSelect: (c: any) => void; style?: any }) {
  const cameraRef = useRef<CameraRef>(null);
  const boundsKey = courses.map((c) => `${c.latitude.toFixed(3)},${c.longitude.toFixed(3)}`).join("|");

  useEffect(() => {
    if (!courses.length) return;
    const lats = courses.map((c) => c.latitude);
    const lngs = courses.map((c) => c.longitude);
    const west = Math.min(...lngs), east = Math.max(...lngs);
    const south = Math.min(...lats), north = Math.max(...lats);
    const t = setTimeout(() => {
      cameraRef.current?.fitBounds([west, south, east, north], { padding: { top: 60, right: 60, bottom: 120, left: 60 }, duration: 400 });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey]);

  return (
    <Map
      style={[StyleSheet.absoluteFill, style]}
      mapStyle={MAP_STYLE}
      compass={false}
      logo={false}
      attribution={false}
      testID="directory-map"
    >
      <Camera ref={cameraRef} initialViewState={{ center: [122.0, 12.6], zoom: 4.6 }} />
      {courses.map((c) => {
        const sel = c.name === selectedName;
        return (
          <Marker
            key={c.name}
            lngLat={[c.longitude, c.latitude]}
            anchor="bottom"
            onPress={() => onSelect(c)}
            testID={`directory-pin-${c.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`}
          >
            <View style={styles.markerWrap}>
              {sel && (
                <View style={styles.callout}>
                  <Text style={styles.calloutName} numberOfLines={2}>{c.name}</Text>
                </View>
              )}
              <View style={[styles.pin, { backgroundColor: sel ? colors.gold : colors.green }]} />
              <View style={[styles.pinTip, { borderTopColor: sel ? colors.gold : colors.green }]} />
            </View>
          </Marker>
        );
      })}
    </Map>
  );
}

const styles = StyleSheet.create({
  markerWrap: { alignItems: "center", width: 160 },
  callout: { backgroundColor: "#fff", borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 6, maxWidth: 160, borderWidth: 1, borderColor: colors.zinc200, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  calloutName: { fontWeight: "800", fontSize: 12, color: colors.charcoal, textAlign: "center" },
  pin: { width: 18, height: 18, borderRadius: 9, borderWidth: 2.5, borderColor: "#fff" },
  pinTip: { width: 0, height: 0, borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 8, borderLeftColor: "transparent", borderRightColor: "transparent", marginTop: -2 },
});
