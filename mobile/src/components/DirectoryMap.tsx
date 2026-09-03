import React, { useRef, useEffect } from "react";
import { StyleSheet } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { colors } from "@/src/theme";

type Entry = { name: string; latitude: number; longitude: number };

export function DirectoryMap({ courses, selectedName, onSelect, style }: { courses: Entry[]; selectedName?: string | null; onSelect: (c: any) => void; style?: any }) {
  const ref = useRef<MapView>(null);
  useEffect(() => {
    if (ref.current && courses.length) {
      ref.current.fitToCoordinates(
        courses.map((c) => ({ latitude: c.latitude, longitude: c.longitude })),
        { edgePadding: { top: 60, right: 60, bottom: 120, left: 60 }, animated: false }
      );
    }
  }, [courses.length]);

  return (
    <MapView
      ref={ref}
      style={[StyleSheet.absoluteFill, style]}
      initialRegion={{ latitude: 12.6, longitude: 122.0, latitudeDelta: 12, longitudeDelta: 12 }}
      testID="directory-map"
    >
      {courses.map((c) => {
        const sel = c.name === selectedName;
        return (
          <Marker key={c.name} coordinate={{ latitude: c.latitude, longitude: c.longitude }} onPress={() => onSelect(c)} pinColor={sel ? colors.gold : colors.green} />
        );
      })}
    </MapView>
  );
}
