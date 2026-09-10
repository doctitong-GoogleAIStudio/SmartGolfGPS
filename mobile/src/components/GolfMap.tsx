import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, PanResponder } from "react-native";
import { Map, Camera, Marker, GeoJSONSource, Layer, type CameraRef, type MapRef } from "@maplibre/maplibre-react-native";
import { colors, font } from "@/src/theme";
import { LatLng, bearingDeg, haversineMeters } from "@/src/lib/geo";

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
  mapType?: "satellite" | "hybrid" | "map" | "golf" | "terrain";
  golfView?: boolean;
  holeUp?: { from: LatLng; to: LatLng } | null;
  holeUpKey?: number;
  onMapPress?: (p: LatLng) => void;
  onMapLongPress?: (p: LatLng) => void;
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
  distanceArcs?: boolean;
  arcUnit?: string;
  focusKey?: number;
  focusTarget?: LatLng | null;
  focusZoom?: number;
  pois?: { key: string; label: string; pt: LatLng }[];
  polygons?: { type: string; points: LatLng[] }[];
  flyover?: { from: LatLng; to: LatLng } | null;
  flyoverKey?: number;
  layups?: { pt: LatLng; label: string }[];
  style?: any;
};

const POLY_COLORS: Record<string, string> = {
  FAIRWAY: "#4ade80",
  GREEN: "#86efac",
  BUNKER: "#fbbf24",
  WATER: "#38bdf8",
  OB: "#ef4444",
};

const HAZARD_COLORS: Record<string, string> = {
  BUNKER: colors.gold,
  WATER: colors.water,
  TREE: colors.fairway,
  "OUT OF BOUNDS": colors.red,
};

function buildStyle(mapType: string) {
  const sources: any = {};
  const layers: any[] = [];
  if (mapType === "golf") {
    // Clean, satellite-free "Golf View" — a fairway-green canvas the hole draws on.
    layers.push({ id: "golf-bg", type: "background", paint: { "background-color": "#2f7d47" } });
  } else if (mapType === "map" || mapType === "terrain") {
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

function ringCoords(c: LatLng, meters: number): [number, number][] {
  const pts: [number, number][] = [];
  const dLat = meters / 111320;
  const dLng = meters / (111320 * Math.cos((c.lat * Math.PI) / 180));
  for (let a = 0; a <= 360; a += 8) {
    const rad = (a * Math.PI) / 180;
    pts.push([c.lng + dLng * Math.sin(rad), c.lat + dLat * Math.cos(rad)]);
  }
  return pts;
}

export function GolfMap({
  center,
  zoom = 17,
  mapType = "satellite",
  onMapPress,
  onMapLongPress,
  onUserPan,
  ball,
  gpsPos,
  gpsHeading,
  target,
  onTargetDrag,
  tee,
  greens,
  hazards = [],
  onHazardPress,
  distLabel,
  recenterKey = 0,
  followPos,
  gpsPath = [],
  shotLines = [],
  distanceArcs = false,
  arcUnit = "yd",
  focusKey = 0,
  focusTarget = null,
  focusZoom = 18.5,
  pois = [],
  polygons = [],
  flyover = null,
  flyoverKey = 0,
  golfView = false,
  holeUp = null,
  holeUpKey = 0,
  layups = [],
  style,
}: Props) {
  const cameraRef = useRef<CameraRef>(null);
  const mapRef = useRef<MapRef>(null);
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

  useEffect(() => {
    if (focusKey > 0 && focusTarget) cameraRef.current?.easeTo({ center: [focusTarget.lng, focusTarget.lat], zoom: focusZoom, duration: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  // Hole-up orientation: frame the hole with the direction of play pointing up
  // (tee at bottom, green at top) — the Hole19-style rotating fairway view.
  useEffect(() => {
    if (!holeUpKey || !holeUp) return;
    const b = bearingDeg(holeUp.from, holeUp.to);
    const mid = { lat: (holeUp.from.lat + holeUp.to.lat) / 2, lng: (holeUp.from.lng + holeUp.to.lng) / 2 };
    const dM = (haversineMeters(holeUp.from, holeUp.to) as number) || 300;
    const z = dM > 460 ? 15.1 : dM > 320 ? 15.7 : dM > 200 ? 16.3 : 16.9;
    cameraRef.current?.easeTo({ center: [mid.lng, mid.lat], bearing: b, zoom: z, duration: 750 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holeUpKey]);

  const shotFeatures: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: shotLines.map((s) => line([s.start, s.end])),
  };

  const arcCenter = ball || gpsPos;
  const arcs = useMemo(() => {
    if (!distanceArcs || !arcCenter) return null;
    const feats: GeoJSON.Feature[] = [];
    const labels: { r: number; lat: number; lng: number }[] = [];
    [100, 150, 200, 250].forEach((r) => {
      const m = arcUnit === "m" ? r : r / 1.09361;
      const ring = ringCoords(arcCenter, m);
      feats.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: ring } });
      labels.push({ r, lng: ring[0][0], lat: ring[0][1] });
    });
    return { fc: { type: "FeatureCollection", features: feats } as GeoJSON.FeatureCollection, labels };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distanceArcs, arcCenter?.lat, arcCenter?.lng, arcUnit]);

  return (
    <Map
      ref={mapRef}
      style={[StyleSheet.absoluteFill, style]}
      mapStyle={mapStyle}
      compass={false}
      logo={false}
      attribution={false}
      onPress={(e: any) => onMapPress && onMapPress({ lat: e.nativeEvent.lngLat[1], lng: e.nativeEvent.lngLat[0] })}
      onLongPress={(e: any) => onMapLongPress && onMapLongPress({ lat: e.nativeEvent.lngLat[1], lng: e.nativeEvent.lngLat[0] })}
      onRegionWillChange={(e: any) => e.nativeEvent?.userInteraction && onUserPan && onUserPan()}
      testID="golf-map"
    >
      <Camera ref={cameraRef} initialViewState={{ center: [center.lng, center.lat], zoom }} />

      {/* Golf View schematic: fairway corridor tee→green + a clear green pad */}
      {golfView && tee && greens?.greenCenter && (
        <GeoJSONSource id="fairway-corridor" data={line([tee, greens.greenCenter])}>
          <Layer id="fairway-corridor-line" type="line" source="fairway-corridor" layout={{ "line-cap": "round", "line-join": "round" }} paint={{ "line-color": "#5aa86a", "line-width": 22, "line-opacity": 0.55 }} />
        </GeoJSONSource>
      )}
      {golfView && greens?.greenCenter && (
        <GeoJSONSource id="green-pad" data={{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ringCoords(greens.greenCenter, greens.greenFront && greens.greenBack ? Math.max(12, (haversineMeters(greens.greenFront, greens.greenBack) as number) / 2) : 15)] } }}>
          <Layer id="green-pad-fill" type="fill" source="green-pad" paint={{ "fill-color": "#bff0a8", "fill-opacity": 0.9 }} />
          <Layer id="green-pad-line" type="line" source="green-pad" paint={{ "line-color": "#8fd97a", "line-width": 1.5 }} />
        </GeoJSONSource>
      )}

      {polygons.filter((p) => p.type !== "CART_PATH" && p.points.length >= 3).length > 0 && (
        <GeoJSONSource id="hole-polys" data={{ type: "FeatureCollection", features: polygons.filter((p) => p.type !== "CART_PATH" && p.points.length >= 3).map((p) => ({ type: "Feature", properties: { color: POLY_COLORS[p.type] || "#9ca3af" }, geometry: { type: "Polygon", coordinates: [[...p.points.map((pt) => [pt.lng, pt.lat]), [p.points[0].lng, p.points[0].lat]]] } })) }}>
          <Layer id="hole-polys-fill" type="fill" source="hole-polys" paint={{ "fill-color": ["get", "color"], "fill-opacity": 0.35 }} />
          <Layer id="hole-polys-line" type="line" source="hole-polys" paint={{ "line-color": ["get", "color"], "line-width": 1.5 }} />
        </GeoJSONSource>
      )}
      {polygons.filter((p) => p.type === "CART_PATH" && p.points.length >= 2).length > 0 && (
        <GeoJSONSource id="cart-paths" data={{ type: "FeatureCollection", features: polygons.filter((p) => p.type === "CART_PATH" && p.points.length >= 2).map((p) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: p.points.map((pt) => [pt.lng, pt.lat]) } })) }}>
          <Layer id="cart-paths-line" type="line" source="cart-paths" layout={{ "line-cap": "round", "line-join": "round" }} paint={{ "line-color": "#e5e7eb", "line-width": 3, "line-dasharray": [2, 2], "line-opacity": 0.85 }} />
        </GeoJSONSource>
      )}

      {arcs && (
        <GeoJSONSource id="dist-arcs" data={arcs.fc}>
          <Layer id="dist-arcs-line" type="line" source="dist-arcs" paint={{ "line-color": "#FFFFFF", "line-width": 1, "line-opacity": 0.5, "line-dasharray": [1, 2] }} />
        </GeoJSONSource>
      )}
      {arcs?.labels.map((l) => (
        <Marker key={`arc-${l.r}`} lngLat={[l.lng, l.lat]} anchor="center">
          <View style={styles.arcLabel}><Text style={styles.arcLabelTxt}>{l.r}{arcUnit === "m" ? "m" : "y"}</Text></View>
        </Marker>
      ))}

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

      {pois.map((p) => (
        <Marker key={p.key} lngLat={[p.pt.lng, p.pt.lat]} anchor="center">
          <View style={styles.poiMk}><Text style={styles.poiMkTxt}>{p.label}</Text></View>
        </Marker>
      ))}

      {layups.map((l, i) => (
        <Marker key={`lay-${i}`} lngLat={[l.pt.lng, l.pt.lat]} anchor="center">
          <View style={styles.layMk}><Text style={styles.layMkTxt}>{l.label}</Text></View>
        </Marker>
      ))}

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

      {target && <DraggableFlag mapRef={mapRef} target={target} onTargetDrag={onTargetDrag} />}
    </Map>
  );
}

function DraggableFlag({
  mapRef,
  target,
  onTargetDrag,
}: {
  mapRef: React.RefObject<MapRef | null>;
  target: LatLng;
  onTargetDrag?: (p: LatLng) => void;
}) {
  const [d, setD] = useState({ x: 0, y: 0 });
  const targetRef = useRef(target);
  targetRef.current = target;
  const cbRef = useRef(onTargetDrag);
  cbRef.current = onTargetDrag;
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
      onPanResponderMove: (_e, g) => setD({ x: g.dx, y: g.dy }),
      onPanResponderRelease: async (_e, g) => {
        const t = targetRef.current;
        try {
          const base = await mapRef.current?.project([t.lng, t.lat]);
          if (base) {
            const np = await mapRef.current?.unproject([base[0] + g.dx, base[1] + g.dy]);
            if (np) cbRef.current?.({ lng: np[0], lat: np[1] });
          }
        } catch {
          // ignore projection errors
        }
        setD({ x: 0, y: 0 });
      },
    }),
  ).current;
  return (
    <Marker lngLat={[target.lng, target.lat]} anchor="bottom">
      <View {...pan.panHandlers} style={[styles.flag, { transform: [{ translateX: d.x }, { translateY: d.y }] }]}>
        <View style={styles.flagPole} />
        <View style={styles.flagCloth} />
        <View style={styles.flagBase} />
      </View>
    </Marker>
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
  arcLabel: { backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  arcLabelTxt: { color: "#fff", fontSize: 10, fontWeight: "800" },
  poiMk: { backgroundColor: "rgba(17,24,39,0.8)", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: colors.gold },
  poiMkTxt: { color: colors.gold, fontSize: 9, fontWeight: "900", letterSpacing: 0.3 },
  layMk: { backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1.5, borderColor: colors.charcoal },
  layMkTxt: { color: colors.charcoal, fontSize: 10, fontWeight: "900" },
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
