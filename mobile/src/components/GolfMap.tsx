import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import MapView, { Marker, Polyline, UrlTile, Region } from "react-native-maps";
import { colors, font } from "@/src/theme";
import { LatLng } from "@/src/lib/geo";

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
  style?: any;
};

const HAZARD_COLORS: Record<string, string> = {
  BUNKER: colors.gold,
  WATER: colors.water,
  TREE: colors.fairway,
  "OUT OF BOUNDS": colors.red,
};

function delta(zoom: number) {
  return 0.0025 * Math.pow(2, 17 - zoom);
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
  style,
}: Props) {
  const mapRef = useRef<MapView>(null);
  const [track, setTrack] = useState(true);
  const androidTiles = Platform.OS === "android";
  const isSat = mapType !== "map";

  const region: Region = useMemo(
    () => ({ latitude: center.lat, longitude: center.lng, latitudeDelta: delta(zoom), longitudeDelta: delta(zoom) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Static marker bitmaps: capture once, then stop tracking for performance.
  useEffect(() => {
    setTrack(true);
    const t = setTimeout(() => setTrack(false), 1200);
    return () => clearTimeout(t);
  }, [tee, greens, hazards]);

  useEffect(() => {
    if (recenterKey > 0 && mapRef.current) {
      mapRef.current.animateToRegion(
        { latitude: center.lat, longitude: center.lng, latitudeDelta: delta(zoom), longitudeDelta: delta(zoom) },
        500
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterKey]);

  useEffect(() => {
    if (followPos && mapRef.current) {
      mapRef.current.animateCamera(
        { center: { latitude: followPos.lat, longitude: followPos.lng }, ...(gpsHeading != null ? { heading: gpsHeading } : {}) },
        { duration: 800 }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followPos?.lat, followPos?.lng]);

  const nativeType = androidTiles ? "none" : mapType === "map" ? "standard" : mapType === "hybrid" ? "hybrid" : "satellite";

  // react-native-maps is native-only. On the web preview render a branded
  // placeholder so the rest of each screen stays testable.
  if (Platform.OS === "web") {
    return (
      <View style={[StyleSheet.absoluteFill, styles.webFallback, style]} testID="golf-map">
        <Text style={styles.webTxt}>Satellite map</Text>
        <Text style={styles.webSub}>Live map renders on the mobile app</Text>
      </View>
    );
  }

  return (
    <MapView
      ref={mapRef}
      style={[StyleSheet.absoluteFill, style]}
      initialRegion={region}
      mapType={nativeType as any}
      showsUserLocation={false}
      showsMyLocationButton={false}
      showsCompass={false}
      rotateEnabled
      pitchEnabled={false}
      toolbarEnabled={false}
      onPress={(e) => onMapPress && onMapPress({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}
      onPanDrag={() => onUserPan && onUserPan()}
      testID="golf-map"
    >
      {androidTiles && isSat && <UrlTile urlTemplate={ESRI_SAT} maximumZ={19} zIndex={-2} />}
      {androidTiles && mapType === "hybrid" && <UrlTile urlTemplate={ESRI_REF} maximumZ={19} zIndex={-1} />}
      {androidTiles && mapType === "map" && <UrlTile urlTemplate={OSM} maximumZ={19} zIndex={-2} />}

      {gpsPath.length > 1 && (
        <Polyline coordinates={gpsPath.map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor="#0EA5E9" strokeWidth={4} />
      )}
      {shotLines.map((s, i) => (
        <Polyline
          key={`sl-${i}`}
          coordinates={[
            { latitude: s.start.lat, longitude: s.start.lng },
            { latitude: s.end.lat, longitude: s.end.lng },
          ]}
          strokeColor={colors.gold}
          strokeWidth={3}
        />
      ))}
      {shotLines.map((s, i) =>
        s.label ? (
          <Marker
            key={`slm-${i}`}
            coordinate={{ latitude: (s.start.lat + s.end.lat) / 2, longitude: (s.start.lng + s.end.lng) / 2 }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={track}
          >
            <View style={[styles.distLabel, { backgroundColor: colors.gold, borderColor: colors.charcoal }]}>
              <Text style={[styles.distLabelTxt, { color: colors.charcoal }]}>{s.label}</Text>
            </View>
          </Marker>
        ) : null
      )}

      {ball && target && (
        <Polyline
          coordinates={[
            { latitude: ball.lat, longitude: ball.lng },
            { latitude: target.lat, longitude: target.lng },
          ]}
          strokeColor="#FFFFFF"
          strokeWidth={2.5}
          lineDashPattern={[6, 8]}
        />
      )}
      {ball && target && distLabel && (
        <Marker
          coordinate={{ latitude: (ball.lat + target.lat) / 2, longitude: (ball.lng + target.lng) / 2 }}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={track}
        >
          <View style={styles.distLabel}>
            <Text style={styles.distLabelTxt}>{distLabel}</Text>
          </View>
        </Marker>
      )}

      {gpsPos && (
        <Marker coordinate={{ latitude: gpsPos.lat, longitude: gpsPos.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={track} zIndex={50}>
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
        <Marker coordinate={{ latitude: ball.lat, longitude: ball.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={track} zIndex={40}>
          <View style={styles.ballMk} />
        </Marker>
      )}

      {tee && (
        <Marker coordinate={{ latitude: tee.lat, longitude: tee.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={track}>
          <View style={styles.tee}>
            <Text style={styles.teeTxt}>T</Text>
          </View>
        </Marker>
      )}
      {greens?.greenFront && <GreenPin coord={greens.greenFront} label="F" track={track} />}
      {greens?.greenCenter && <GreenPin coord={greens.greenCenter} label="C" track={track} />}
      {greens?.greenBack && <GreenPin coord={greens.greenBack} label="B" track={track} />}

      {hazards.map((h) => (
        <Marker
          key={h.id}
          coordinate={{ latitude: h.lat, longitude: h.lng }}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={track}
          onPress={() => onHazardPress && onHazardPress(h)}
        >
          <View style={[styles.hazard, { backgroundColor: HAZARD_COLORS[h.type] || "#fff" }]}>
            <Text style={styles.hazardTxt}>{h.type === "WATER" ? "W" : h.type === "BUNKER" ? "B" : h.type[0]}</Text>
          </View>
        </Marker>
      ))}

      {target && (
        <Marker
          coordinate={{ latitude: target.lat, longitude: target.lng }}
          anchor={{ x: 0.2, y: 1 }}
          draggable
          tracksViewChanges={track}
          onDragEnd={(e) => onTargetDrag && onTargetDrag({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}
          zIndex={60}
        >
          <View style={styles.flag}>
            <View style={styles.flagPole} />
            <View style={styles.flagCloth} />
            <View style={styles.flagBase} />
          </View>
        </Marker>
      )}
    </MapView>
  );
}

function GreenPin({ coord, label, track }: { coord: LatLng; label: string; track: boolean }) {
  return (
    <Marker coordinate={{ latitude: coord.lat, longitude: coord.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={track}>
      <View style={styles.green}>
        <Text style={styles.greenTxt}>{label}</Text>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  webFallback: { backgroundColor: "#0a1f12", alignItems: "center", justifyContent: "center" },
  webTxt: { color: "rgba(255,255,255,0.7)", fontSize: 16, fontWeight: "800" },
  webSub: { color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 4 },
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
