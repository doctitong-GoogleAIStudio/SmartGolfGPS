import React, { useEffect, useMemo, useRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Map, Camera, Marker, GeoJSONSource, Layer, type CameraRef } from "@maplibre/maplibre-react-native";
import { colors, font } from "@/src/theme";
import { LatLng, bearingDeg } from "@/src/lib/geo";

const ESRI_SAT =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_REF =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

type Hole = {
  tee?: LatLng | null;
  greenFront?: LatLng | null;
  greenCenter?: LatLng | null;
  greenBack?: LatLng | null;
};
type Hazard = { id: string; name: string; type: string; lat: number; lng: number };
type ShotLine = { start: LatLng; end: LatLng; label?: string };

type Props = {
  center: LatLng;
  zoom?: number;
  mapType?: "satellite" | "hybrid" | "map";
  onMapPress?: (p: LatLng) => void;
  onUserPan?: () => void;
  ball?: LatLng | null;
  gpsPos?: LatLng | null;
  gpsHeading?: number | null;
  target?: LatLng | null;
  onTargetDrag?: (p: LatLng) => void;
  tee?: LatLng | null;
  greens?: Hole | null;
  hazards?: Hazard[];
  onHazardPress?: (h: Hazard) => void;
  distLabel?: string | null;
  recenterKey?: number;
  followPos?: LatLng | null;
  gpsPath?: { lat: number; lng: number }[];
  shotLines?: ShotLine[];
  flyover?: { from: LatLng; to: LatLng } | null;
  flyoverKey?: number;
  style?: any;
};

const HAZARD_COLORS: Record<string, string> = {
  BUNKER: colors.gold,
  WATER: colors.water,
  TREE: colors.fairway,
  "OUT OF BOUNDS": colors.red,
};

function buildStyle(mapType: "satellite" | "hybrid" | "map") {
  const sources: any = {};
  const layers: any[] = [];
  if (mapType === "map") {
    sources.osm = { type: "raster", tiles: [OSM], tileSize: 256, maxzoom: 19 };
    layers.push({ id: "osm", type: "raster", source: "osm" });
  } else {
    sources.esri = { type: "raster", tiles: [ESRI_SAT], tileSize: 256, maxzoom: 19 };
    layers.push({ id: "esri", type: "raster", source: "esri" });
    if (mapType === "hybrid") {
      sources.esriRef = { type: "raster", tiles: [ESRI_REF], tileSize: 256, maxzoom: 19 };
      layers.push({ id: "esriRef", type: "raster", source: "esriRef" });
    }
  }
  return { version: 8, sources, layers } as any;
}

function line(coords: LatLng[]): GeoJSON.Feature {
  return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords.map((c) => [c.lng, c.lat]) } };
}

export function GolfMap({
  center,
  zoom = 17,
  mapType = "satellite",
  onMapPress,
  onUserPan,
  ball,
  gpsPos,
  gpsHeading,
  target,
  tee,
  greens,
  hazards = [],
  onHazardPress,
  distLabel,
  recenterKey = 0,
  followPos,
  gpsPath = [],
  shotLines = [],
  flyover = null,
  flyoverKey = 0,
  style,
}: Props) {
  const cameraRef = useRef<CameraRef>(null);
  const mapStyle = useMemo(() => buildStyle(mapType), [mapType]);

  useEffect(() => {
    if (recenterKey > 0) cameraRef.current?.easeTo({ center: [center.lng, center.lat], zoom, duration: 500 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterKey]);

  useEffect(() => {
    if (followPos) {
      cameraRef.current?.easeTo({
        center: [followPos.lng, followPos.lat],
        ...(gpsHeading != null ? { bearing: gpsHeading } : {}),
        duration: 800,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followPos?.lat, followPos?.lng]);

  // Hole flyover: sweep the camera tee -> green on arrival at a new hole.
  useEffect(() => {
    if (!flyoverKey || !flyover) return;
    const bearing = bearingDeg(flyover.from, flyover.to);
    cameraRef.current?.easeTo({ center: [flyover.from.lng, flyover.from.lat], bearing, zoom, duration: 500 });
    const t = setTimeout(() => {
      cameraRef.current?.easeTo({ center: [flyover.to.lng, flyover.to.lat], bearing, zoom, duration: 2400 });
    }, 650);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyoverKey]);

  const shotFeatures: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: shotLines.map((s) => line([s.start, s.end])),
  };

  return (
    <Map
      style={[StyleSheet.absoluteFill, style]}
      mapStyle={mapStyle}
      compass={false}
      logo={false}
      attribution={false}
      onPress={(e: any) => onMapPress && onMapPress({ lat: e.nativeEvent.lngLat[1], lng: e.nativeEvent.lngLat[0] })}
      onRegionWillChange={(e: any) => e.nativeEvent?.userInteraction && onUserPan && onUserPan()}
      testID="golf-map"
    >
      <Camera ref={cameraRef} initialViewState={{ center: [center.lng, center.lat], zoom }} />

      {gpsPath.length > 1 && (
        <GeoJSONSource id="gps-path" data={line(gpsPath.map((p) => ({ lat: p.lat, lng: p.lng })))}>
          <Layer id="gps-path-line" type="line" source="gps-path" layout={{ "line-cap": "round", "line-join": "round" }} paint={{ "line-color": "#0EA5E9", "line-width": 4 }} />
        </GeoJSONSource>
      )}

      {shotLines.length > 0 && (
        <GeoJSONSource id="shot-lines" data={shotFeatures}>
          <Layer id="shot-lines-line" type="line" source="shot-lines" layout={{ "line-cap": "round", "line-join": "round" }} paint={{ "line-color": colors.gold, "line-width": 3 }} />
        </GeoJSONSource>
      )}

      {ball && target && (
        <GeoJSONSource id="aim-line" data={line([ball, target])}>
          <Layer id="aim-line-line" type="line" source="aim-line" paint={{ "line-color": "#FFFFFF", "line-width": 2.5, "line-dasharray": [2, 3] }} />
        </GeoJSONSource>
      )}

      {shotLines.map((s, i) =>
        s.label ? (
          <Marker key={`slm-${i}`} lngLat={[(s.start.lng + s.end.lng) / 2, (s.start.lat + s.end.lat) / 2]} anchor="center">
            <View style={[styles.distLabel, { backgroundColor: colors.gold, borderColor: colors.charcoal }]}>
              <Text style={[styles.distLabelTxt, { color: colors.charcoal }]}>{s.label}</Text>
            </View>
          </Marker>
        ) : null
      )}

      {ball && target && distLabel && (
        <Marker lngLat={[(ball.lng + target.lng) / 2, (ball.lat + target.lat) / 2]} anchor="center">
          <View style={styles.distLabel}>
            <Text style={styles.distLabelTxt}>{distLabel}</Text>
          </View>
        </Marker>
      )}

      {gpsPos && (
        <Marker lngLat={[gpsPos.lng, gpsPos.lat]} anchor="center">
          <View style={styles.gpsWrap}>
            {gpsHeading != null && (
              <View style={[styles.gpsArrow, { transform: [{ rotate: `${gpsHeading}deg` }] }]}>
                <View style={styles.gpsArrowTri} />
              </View>
            )}
            <View style={styles.gpsDot} />
          </View>
        </Marker>
      )}

      {ball && (
        <Marker lngLat={[ball.lng, ball.lat]} anchor="center">
          <View style={styles.ballMk} />
        </Marker>
      )}

      {tee && (
        <Marker lngLat={[tee.lng, tee.lat]} anchor="center">
          <View style={styles.tee}>
            <Text style={styles.teeTxt}>T</Text>
          </View>
        </Marker>
      )}
      {greens?.greenFront && <GreenPin coord={greens.greenFront} label="F" />}
      {greens?.greenCenter && <GreenPin coord={greens.greenCenter} label="C" />}
      {greens?.greenBack && <GreenPin coord={greens.greenBack} label="B" />}

      {hazards.map((h) => (
        <Marker key={h.id} lngLat={[h.lng, h.lat]} anchor="center" onPress={() => onHazardPress && onHazardPress(h)}>
          <View style={[styles.hazard, { backgroundColor: HAZARD_COLORS[h.type] || "#fff" }]}>
            <Text style={styles.hazardTxt}>{h.type === "WATER" ? "W" : h.type === "BUNKER" ? "B" : h.type[0]}</Text>
          </View>
        </Marker>
      ))}

      {target && (
        <Marker lngLat={[target.lng, target.lat]} anchor="bottom">
          <View style={styles.flag}>
            <View style={styles.flagPole} />
            <View style={styles.flagCloth} />
            <View style={styles.flagBase} />
          </View>
        </Marker>
      )}
    </Map>
  );
}

function GreenPin({ coord, label }: { coord: LatLng; label: string }) {
  return (
    <Marker lngLat={[coord.lng, coord.lat]} anchor="center">
      <View style={styles.green}>
        <Text style={styles.greenTxt}>{label}</Text>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  distLabel: {
    backgroundColor: colors.charcoal,
    borderColor: "#fff",
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  distLabelTxt: { color: "#fff", fontSize: 12, fontWeight: "800" },
  ballMk: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#fff", borderWidth: 3, borderColor: colors.fairway },
  gpsWrap: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  gpsArrow: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center" },
  gpsArrowTri: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 12,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: colors.water,
  },
  gpsDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.water, borderWidth: 3, borderColor: "#fff" },
  tee: { width: 22, height: 22, borderRadius: 5, backgroundColor: colors.green, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#fff" },
  teeTxt: { color: "#fff", fontSize: 12, fontWeight: "900" },
  green: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.green },
  greenTxt: { color: colors.green, fontSize: 11, fontWeight: "900" },
  hazard: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#fff" },
  hazardTxt: { color: colors.charcoal, fontSize: 11, fontWeight: "900" },
  flag: { width: 30, height: 36, justifyContent: "flex-start" },
  flagPole: { position: "absolute", left: 5, top: 0, width: 2.5, height: 34, backgroundColor: "#fff" },
  flagCloth: {
    position: "absolute",
    left: 7,
    top: 3,
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderLeftWidth: 18,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: colors.red,
  },
  flagBase: { position: "absolute", left: 2.5, top: 30, width: 7, height: 7, borderRadius: 4, backgroundColor: "#fff" },
});
