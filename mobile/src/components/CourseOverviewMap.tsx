import { imageryStyle } from "@/src/lib/imagery";
import { ImageryCredit } from "./ImageryCredit";
import React, { useMemo, useRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Map, Camera, Marker, GeoJSONSource, Layer, type CameraRef } from "@maplibre/maplibre-react-native";
import { colors } from "@/src/theme";
import { LatLng } from "@/src/lib/geo";

const MAP_STYLE = imageryStyle();

type Hole = { holeNumber: number; par: number; tee?: LatLng | null; greenCenter?: LatLng | null };
type Poi = { key: string; label: string; pt: LatLng; icon?: string };

export function CourseOverviewMap({ holes, onHolePress, gpsPos, pois = [], focusKey = 0, focusTarget = null, style }: { holes: Hole[]; onHolePress: (i: number) => void; gpsPos?: LatLng | null; pois?: Poi[]; focusKey?: number; focusTarget?: LatLng | null; style?: any }) {
  const cameraRef = useRef<CameraRef>(null);

  const pts = useMemo(() => {
    const p: LatLng[] = [];
    holes.forEach((h) => { if (h.tee) p.push(h.tee); if (h.greenCenter) p.push(h.greenCenter); });
    return p;
  }, [holes]);

  const route = useMemo(() => {
    const coords: [number, number][] = [];
    for (let i = 0; i < holes.length - 1; i++) {
      const g = holes[i].greenCenter, t = holes[i + 1].tee;
      if (g && t) { coords.push([g.lng, g.lat]); coords.push([t.lng, t.lat]); }
    }
    return coords;
  }, [holes]);

  const fit = () => {
    if (!pts.length) return;
    const lngs = pts.map((p) => p.lng), lats = pts.map((p) => p.lat);
    cameraRef.current?.fitBounds(
      [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
      { padding: { top: 90, right: 60, bottom: 140, left: 60 }, duration: 0 },
    );
  };

  React.useEffect(() => {
    if (focusKey > 0 && focusTarget) cameraRef.current?.easeTo({ center: [focusTarget.lng, focusTarget.lat], zoom: 17, duration: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  return (
    <View style={[StyleSheet.absoluteFill, style]}>
    <Map style={StyleSheet.absoluteFill} mapStyle={MAP_STYLE} compass={false} logo={false} attribution={true} onDidFinishLoadingMap={fit} testID="course-overview-map">
      <Camera ref={cameraRef} initialViewState={{ center: pts[0] ? [pts[0].lng, pts[0].lat] : [122, 12.6], zoom: 14 }} />

      {route.length > 1 && (
        <GeoJSONSource id="co-route" data={{ type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: chunkPairs(route) } }}>
          <Layer id="co-route-line" type="line" source="co-route" layout={{ "line-cap": "round" }} paint={{ "line-color": "#FBBF24", "line-width": 2, "line-dasharray": [2, 3], "line-opacity": 0.8 }} />
        </GeoJSONSource>
      )}

      {holes.map((h, i) => (
        <React.Fragment key={h.holeNumber}>
          {h.greenCenter && (
            <Marker lngLat={[h.greenCenter.lng, h.greenCenter.lat]} anchor="bottom">
              <View style={styles.flag}>
                <View style={styles.flagPole} />
                <View style={styles.flagCloth} />
              </View>
            </Marker>
          )}
          {h.tee && (
            <Marker lngLat={[h.tee.lng, h.tee.lat]} anchor="bottom" onPress={() => onHolePress(i)} testID={`overview-hole-${h.holeNumber}`}>
              <View style={styles.teeWrap}>
                {i === 0 && (
                  <View style={styles.startBadge}>
                    <Text style={styles.startTxt}>START HERE</Text>
                  </View>
                )}
                <View style={[styles.numMk, i === 0 && styles.numMkStart]}>
                  <Text style={styles.numTxt}>{h.holeNumber}</Text>
                </View>
                <View style={[styles.numTip, i === 0 && { borderTopColor: colors.gold }]} />
              </View>
            </Marker>
          )}
        </React.Fragment>
      ))}

      {pois.map((p) => (
        <Marker key={p.key} lngLat={[p.pt.lng, p.pt.lat]} anchor="center">
          <View style={styles.poi}>
            <Text style={styles.poiTxt}>{p.label}</Text>
          </View>
        </Marker>
      ))}

      {gpsPos && (
        <Marker lngLat={[gpsPos.lng, gpsPos.lat]} anchor="center">
          <View style={styles.gpsWrap}><View style={styles.gpsDot} /></View>
        </Marker>
      )}
    </Map>
    <ImageryCredit overlay />
    </View>
  );
}

function chunkPairs(flat: [number, number][]): [number, number][][] {
  const out: [number, number][][] = [];
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
}

const styles = StyleSheet.create({
  teeWrap: { alignItems: "center" },
  startBadge: { backgroundColor: colors.gold, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 3 },
  startTxt: { color: colors.charcoal, fontWeight: "900", fontSize: 10, letterSpacing: 0.5 },
  numMk: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.green, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
  numMkStart: { backgroundColor: colors.gold, width: 34, height: 34, borderRadius: 17 },
  numTxt: { color: "#fff", fontWeight: "900", fontSize: 13 },
  numTip: { width: 0, height: 0, borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 7, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: colors.green, marginTop: -1 },
  flag: { width: 20, height: 24, justifyContent: "flex-start" },
  flagPole: { position: "absolute", left: 3, top: 0, width: 2, height: 22, backgroundColor: "#fff" },
  flagCloth: { position: "absolute", left: 5, top: 1, width: 0, height: 0, borderTopWidth: 5, borderBottomWidth: 5, borderLeftWidth: 12, borderTopColor: "transparent", borderBottomColor: "transparent", borderLeftColor: colors.red },
  gpsWrap: { width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(14,165,233,0.25)", alignItems: "center", justifyContent: "center" },
  gpsDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.water, borderWidth: 3, borderColor: "#fff" },
  poi: { backgroundColor: "rgba(17,24,39,0.8)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.gold },
  poiTxt: { color: colors.gold, fontSize: 10, fontWeight: "900", letterSpacing: 0.3 },
});
