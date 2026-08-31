import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Modal, TextInput } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, font } from "@/src/theme";
import { GolfMap } from "@/src/components/GolfMap";
import { useGPS } from "@/src/hooks/useGPS";
import { useSettings } from "@/src/context/SettingsContext";
import { haversineMeters, bearingDeg, fmtDist, unitLabel, movedMoreThan, LatLng } from "@/src/lib/geo";
import { computePlaysLike } from "@/src/lib/playsLike";
import { recommendClub } from "@/src/lib/clubRec";
import { api, cachedGet, getActiveRound, setActiveRound, ActiveRound } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { startBackgroundTracking, stopBackgroundTracking, drainBackgroundPath } from "@/src/lib/locationTask";
import { toast } from "@/src/lib/toast";

const DEFAULT_CENTER: LatLng = { lat: 7.052, lng: 125.517 };
const WIND_DIRS: [string, string][] = [
  ["head", "HEAD"],
  ["tail", "TAIL"],
  ["left", "L-CROSS"],
  ["right", "R-CROSS"],
  ["none", "NONE"],
];

export default function Rangefinder() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const unit = settings.distanceUnit;
  const { pos: gpsPos, accuracy, quality, error: gpsError, speed, heading, canAskAgain, requestAgain } = useGPS(settings.gpsTracking !== false);

  const [activeRound, setActive] = useState<ActiveRound>(null);
  const [course, setCourse] = useState<any>(null);
  const [holeIdx, setHoleIdx] = useState(0);
  const [ball, setBall] = useState<LatLng | null>(null);
  const [ballSource, setBallSource] = useState<"gps" | "manual">("gps");
  const [target, setTarget] = useState<LatLng | null>(null);
  const [targetLabel, setTargetLabel] = useState("PIN");
  const [setBallMode, setSetBallMode] = useState(false);
  const [mapType, setMapType] = useState<"satellite" | "hybrid" | "map">("satellite");
  const [elev, setElev] = useState<any>(null);
  const [wind, setWind] = useState<{ speed: number; dir: string }>({ speed: 0, dir: "none" });
  const [autoWx, setAutoWx] = useState(false);
  const [wx, setWx] = useState<any>(null);
  const [bag, setBag] = useState<any>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [recenter, setRecenter] = useState(0);
  const [shot, setShot] = useState<any>(null);
  const [shotResult, setShotResult] = useState<any>(null);
  const [showClubPick, setShowClubPick] = useState(false);
  const [walkAnchor, setWalkAnchor] = useState<LatLng | null>(null);
  const [holeSuggestion, setHoleSuggestion] = useState<{ i: number; d: number } | null>(null);
  const [camMode, setCamMode] = useState<"free" | "follow" | "heading">("free");
  const [gpsPath, setGpsPath] = useState<{ lat: number; lng: number; t: number }[]>([]);

  const wxReqRef = useRef<{ pos: LatLng | null; time: number }>({ pos: null, time: 0 });
  const pathBufRef = useRef<{ lat: number; lng: number; t: number }[]>([]);
  const elevReqRef = useRef<{ ball: LatLng | null; target: LatLng | null }>({ ball: null, target: null });
  const dismissedHoleRef = useRef<number | null>(null);

  const hole = course?.holes?.[holeIdx] || null;

  // Load persisted wind/autowx once.
  useEffect(() => {
    storage.getItem<string>("sg_wind", "").then((w) => {
      if (w) try { setWind(JSON.parse(w)); } catch {}
    });
    storage.getItem<string>("sg_autowx", "").then((v) => setAutoWx(v === "1"));
  }, []);

  // Load course + bag + active round on focus.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        cachedGet("/bag", "bag").then((b) => alive && setBag(b)).catch(() => {});
        const a = await getActiveRound();
        if (alive) setActive(a);
        const quick = await storage.getItem<string>("sg_quick_course", "");
        const cid = a?.courseId || quick;
        try {
          if (cid) {
            const c = await cachedGet(`/courses/${cid}`, `course_${cid}`);
            if (alive) { setCourse(c); setHoleIdx((a?.currentHole || 1) - 1); }
          } else {
            const cs = await cachedGet<any[]>("/courses", "courses");
            if (alive && cs[0]) setCourse(cs[0]);
          }
        } catch {}
      })();
      return () => { alive = false; };
    }, [])
  );

  // Ball follows GPS in gps mode.
  useEffect(() => {
    if (ballSource === "gps" && gpsPos) setBall(gpsPos);
  }, [gpsPos, ballSource]);
  useEffect(() => {
    if (!ball && !gpsPos && hole?.tee) { setBall(hole.tee); setBallSource("manual"); }
  }, [hole, ball, gpsPos]);

  // Default target: green center on hole change.
  useEffect(() => {
    if (hole?.greenCenter) { setTarget(hole.greenCenter); setTargetLabel("CENTER"); }
  }, [holeIdx, course]); // eslint-disable-line react-hooks/exhaustive-deps

  // Background tracking lifecycle for an active round.
  useEffect(() => {
    if (activeRound && settings.gpsTracking !== false) startBackgroundTracking();
    return () => { stopBackgroundTracking(); };
  }, [activeRound, settings.gpsTracking]);

  // Auto weather (throttled).
  useEffect(() => {
    if (!autoWx || !ball) return;
    const r = wxReqRef.current;
    if (r.pos && !movedMoreThan(r.pos, ball, 500) && Date.now() - r.time < 600000) return;
    wxReqRef.current = { pos: ball, time: Date.now() };
    api.get(`/weather?lat=${ball.lat}&lng=${ball.lng}`).then(setWx).catch(() => setWx({ available: false }));
  }, [autoWx, ball]);

  const effWind = useMemo(() => {
    if (autoWx && wx?.available && ball && target) {
      const rel = ((wx.windFromDeg - bearingDeg(ball, target) + 540) % 360) - 180;
      const dir = Math.abs(rel) <= 45 ? "head" : Math.abs(rel) >= 135 ? "tail" : rel > 0 ? "right" : "left";
      return { speedKmh: wx.windSpeedKmh, dir, auto: true };
    }
    return { speedKmh: settings.windUnit === "mph" ? wind.speed * 1.609 : wind.speed, dir: wind.dir, auto: false };
  }, [autoWx, wx, ball, target, wind, settings.windUnit]);

  const distM = useMemo(() => haversineMeters(ball, target), [ball, target]);
  const fcb = useMemo(() => {
    if (!ball || !hole) return null;
    return {
      front: haversineMeters(ball, hole.greenFront),
      center: haversineMeters(ball, hole.greenCenter),
      back: haversineMeters(ball, hole.greenBack),
    };
  }, [ball, hole]);

  // Elevation (throttled + debounced).
  useEffect(() => {
    if (!ball || !target) return;
    const r = elevReqRef.current;
    if (!movedMoreThan(r.ball, ball, 5) && !movedMoreThan(r.target, target, 5)) return;
    const t = setTimeout(() => {
      elevReqRef.current = { ball, target };
      api.get(`/elevation?lat1=${ball.lat}&lng1=${ball.lng}&lat2=${target.lat}&lng2=${target.lng}`).then(setElev).catch(() => setElev({ available: false }));
    }, 1200);
    return () => clearTimeout(t);
  }, [ball, target]);

  const pl = useMemo(
    () =>
      computePlaysLike({
        actualMeters: distM,
        elevDiffM: elev?.available ? elev.diff : 0,
        windSpeedKmh: effWind.speedKmh,
        windDir: effWind.dir,
        tempC: autoWx && wx?.available ? wx.tempC : null,
        toggles: settings,
        tournamentMode: settings.tournamentMode,
      }),
    [distM, elev, effWind, autoWx, wx, settings]
  );

  const rec = useMemo(() => (settings.tournamentMode ? null : recommendClub(pl?.playsLikeMeters, bag?.clubs)), [pl, bag, settings.tournamentMode]);

  // Caddie context snapshot.
  useEffect(() => {
    if (distM == null) return;
    const ctx = {
      hole: hole?.holeNumber,
      par: hole?.par,
      actualDistanceYards: fmtDist(distM, "yd"),
      playsLikeYards: pl ? fmtDist(pl.playsLikeMeters, "yd") : null,
      elevationMeters: elev?.available ? elev.diff : null,
      windSpeedKmh: effWind.dir === "none" ? 0 : Math.round(effWind.speedKmh),
      windRelationship: effWind.dir,
      temperatureC: autoWx && wx?.available ? wx.tempC : null,
      frontGreenYards: fcb?.front != null ? fmtDist(fcb.front, "yd") : null,
      centerGreenYards: fcb?.center != null ? fmtDist(fcb.center, "yd") : null,
      backGreenYards: fcb?.back != null ? fmtDist(fcb.back, "yd") : null,
      recommendedClub: rec?.club?.name || null,
      clubCarryYards: rec?.club?.carry || null,
    };
    storage.setItem("sg_caddie_ctx", JSON.stringify(ctx));
  }, [distM, pl, rec, elev, effWind, autoWx, wx, fcb, hole]);

  // GPS path recording during active round.
  useEffect(() => {
    if (!gpsPos || !activeRound || settings.gpsTracking === false) return;
    const pt = { lat: gpsPos.lat, lng: gpsPos.lng, t: Date.now() };
    pathBufRef.current.push(pt);
    setGpsPath((p) => (p.length > 500 ? [...p.slice(-400), pt] : [...p, pt]));
    if (pathBufRef.current.length >= 10) {
      const points = pathBufRef.current.splice(0);
      api.post(`/rounds/${activeRound.id}/track`, { points }).catch(() => {});
    }
  }, [gpsPos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush any background-collected points when returning to the round.
  useEffect(() => {
    if (!activeRound) return;
    drainBackgroundPath().then((pts) => {
      if (pts.length) {
        setGpsPath((p) => [...p, ...pts].slice(-500));
        api.post(`/rounds/${activeRound.id}/track`, { points: pts.slice(0, 200) }).catch(() => {});
      }
    });
  }, [activeRound]);

  const onMapPress = useCallback(
    (p: LatLng) => {
      if (camMode === "heading") { setCamMode("follow"); return; }
      if (setBallMode) {
        setBall(p);
        setBallSource("manual");
        setSetBallMode(false);
        toast.success("Ball position set manually");
      } else {
        setTarget(p);
        setTargetLabel("CUSTOM");
      }
    },
    [setBallMode, camMode]
  );

  const goHole = (next: number) => {
    setHoleIdx(next);
    setHoleSuggestion(null);
    if (activeRound) {
      const upd = { ...activeRound, currentHole: next + 1 };
      setActive(upd);
      setActiveRound(upd);
      api.put(`/rounds/${activeRound.id}`, { currentHole: next + 1 }).catch(() => {});
    }
  };
  const changeHole = (delta: number) => {
    if (!course) return;
    goHole(Math.max(0, Math.min(course.holes.length - 1, holeIdx + delta)));
  };

  // Nearest hole suggestion.
  useEffect(() => {
    if (!gpsPos || !course) { setHoleSuggestion(null); return; }
    let best: { i: number; d: number } | null = null;
    course.holes.forEach((h: any, i: number) => {
      [h.tee, h.greenCenter].filter(Boolean).forEach((p: LatLng) => {
        const d = haversineMeters(gpsPos, p) as number;
        if (!best || d < best.d) best = { i, d };
      });
    });
    if (best && best.i !== holeIdx && best.d < 120 && dismissedHoleRef.current !== best.i) setHoleSuggestion(best);
    else setHoleSuggestion(null);
  }, [gpsPos, course, holeIdx]);

  const walkDistM = useMemo(() => (walkAnchor && gpsPos ? haversineMeters(walkAnchor, gpsPos) : null), [walkAnchor, gpsPos]);

  const cycleCam = () => {
    setCamMode((m) => {
      const next = m === "free" ? "follow" : m === "follow" ? "heading" : "free";
      toast.info(next === "follow" ? "Follow · North Up" : next === "heading" ? "Follow · Direction Up" : "Free camera");
      return next;
    });
  };

  const startShot = (club: string) => {
    if (!ball) { toast.error("No ball position yet"); return; }
    setShot({ start: ball, club, targetDist: distM, playsLike: pl?.playsLikeMeters });
    setWalkAnchor(ballSource === "gps" && gpsPos ? gpsPos : ball);
    setShowClubPick(false);
    toast.success(`Shot started with ${club}`, "Walk to your ball, then tap BALL FOUND.");
  };
  const endShot = () => {
    const end = ballSource === "gps" && gpsPos ? gpsPos : ball;
    const d = haversineMeters(shot.start, end) as number;
    setShotResult({ ...shot, end, distance: d, fairway: null, direction: null });
    setShot(null);
  };
  const saveShot = async () => {
    const s = shotResult;
    try {
      await api.post("/shots", {
        roundId: activeRound?.id || null,
        holeNumber: hole?.holeNumber || null,
        club: s.club,
        startLat: s.start.lat,
        startLng: s.start.lng,
        endLat: s.end.lat,
        endLng: s.end.lng,
        targetDistanceMeters: s.targetDist,
        playsLikeMeters: s.playsLike,
        fairway: s.fairway,
        direction: s.direction,
      });
      toast.success(`Shot recorded: ${s.club} · ${fmtDist(s.distance, unit)} ${unitLabel(unit)}`);
      setWalkAnchor(s.end);
      setBall(s.end);
      setBallSource("gps");
    } catch {
      toast.error("Could not save shot (offline?)");
    }
    setShotResult(null);
  };

  const center = ball || gpsPos || hole?.tee || { lat: course?.latitude || DEFAULT_CENTER.lat, lng: course?.longitude || DEFAULT_CENTER.lng };
  const targetCards: [string, LatLng, string?][] = hole
    ? ([
        ["CENTER", hole.greenCenter],
        ["FRONT", hole.greenFront],
        ["BACK", hole.greenBack],
        ...((hole.hazards || []).map((h: any) => [h.type, { lat: h.lat, lng: h.lng }, h.name])),
      ].filter((t: any) => t[1]) as any)
    : [];

  const gpsLive = ballSource === "gps" && !!gpsPos;

  return (
    <View style={styles.screen} testID="rangefinder-screen">
      <GolfMap
        center={center}
        mapType={mapType}
        onMapPress={onMapPress}
        ball={ball}
        gpsPos={gpsPos}
        gpsHeading={heading}
        target={target}
        onTargetDrag={(p) => { setTarget(p); setTargetLabel("CUSTOM"); }}
        tee={hole?.tee}
        greens={hole}
        hazards={hole?.hazards || []}
        onHazardPress={(h) => { setTarget({ lat: h.lat, lng: h.lng }); setTargetLabel(h.name.toUpperCase()); }}
        distLabel={distM != null ? `${fmtDist(distM, unit)} ${unitLabel(unit).toLowerCase()}` : null}
        recenterKey={recenter}
        followPos={camMode !== "free" ? gpsPos : null}
        onUserPan={() => setCamMode("free")}
        gpsPath={activeRound ? gpsPath : []}
      />

      {/* Top bar */}
      <View style={[styles.topBar, { top: insets.top + 6 }]} pointerEvents="box-none">
        <Pressable testID="rf-home-btn" onPress={() => router.push("/")} style={styles.iconBtn}>
          <Ionicons name="home" size={20} color={colors.charcoal} />
        </Pressable>
        {course && (
          <View style={styles.holePill}>
            <Pressable testID="rf-prev-hole-btn" onPress={() => changeHole(-1)} style={styles.holeArrow}>
              <Ionicons name="chevron-back" size={18} color={colors.charcoal} />
            </Pressable>
            <View style={{ alignItems: "center", minWidth: 82 }}>
              <Text style={styles.holeNum} testID="rf-hole-label">HOLE {hole?.holeNumber}</Text>
              <Text style={styles.holeMeta}>PAR {hole?.par}{hole?.handicap ? ` · HCP ${hole.handicap}` : ""}</Text>
            </View>
            <Pressable testID="rf-next-hole-btn" onPress={() => changeHole(1)} style={styles.holeArrow}>
              <Ionicons name="chevron-forward" size={18} color={colors.charcoal} />
            </Pressable>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <View style={{ alignItems: "flex-end", gap: 6 }}>
          <View
            testID="gps-accuracy-badge"
            style={[
              styles.gpsBadge,
              { backgroundColor: gpsError ? colors.red : quality === "GOOD" ? colors.fairway : quality === "FAIR" ? colors.gold : quality === "POOR" ? colors.red : "#3f3f46" },
            ]}
          >
            <Text style={[styles.gpsBadgeTxt, { color: quality === "GOOD" || quality === "FAIR" ? colors.charcoal : "#fff" }]}>
              {gpsError === "denied" ? "GPS DENIED" : gpsError ? "NO GPS" : accuracy != null ? `GPS ±${accuracy.toFixed(0)}m ${quality}` : "GPS…"}
            </Text>
          </View>
          {settings.tournamentMode && (
            <View style={styles.tourBadge} testID="tournament-badge">
              <Text style={styles.tourTxt}>TOURNAMENT</Text>
            </View>
          )}
          {settings.gpsTracking !== false && gpsPos && (speed != null || heading != null) && (
            <View style={styles.navHud} testID="nav-hud">
              {speed != null && <Text style={styles.navHudTxt}>{(speed * 3.6).toFixed(1)} km/h</Text>}
              {heading != null && <Text style={styles.navHudTxt}>  {["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(heading / 45) % 8]} {Math.round(heading)}°</Text>}
            </View>
          )}
        </View>
      </View>

      {/* Nearest hole suggestion */}
      {holeSuggestion && (
        <View style={[styles.suggestBanner, { top: insets.top + 60 }]} testID="hole-suggestion-banner">
          <Text style={styles.suggestBannerTxt}>Near Hole {course.holes[holeSuggestion.i].holeNumber}?</Text>
          <Pressable testID="switch-hole-btn" onPress={() => goHole(holeSuggestion.i)} style={styles.suggestSwitch}>
            <Text style={styles.suggestSwitchTxt}>SWITCH</Text>
          </Pressable>
          <Pressable testID="dismiss-hole-suggestion-btn" onPress={() => { dismissedHoleRef.current = holeSuggestion.i; setHoleSuggestion(null); }} style={styles.suggestX}>
            <Ionicons name="close" size={14} color="#fff" />
          </Pressable>
        </View>
      )}

      {/* Distance card */}
      <View style={[styles.distCard, { top: insets.top + 60 }]} testID="distance-card">
        <Text style={styles.distLabel}>{targetLabel} · ACTUAL</Text>
        <Text style={[styles.distBig, { fontFamily: font.num }]} testID="target-distance-value">{fmtDist(distM, unit)}</Text>
        <Text style={styles.distUnit}>{unitLabel(unit)}</Text>
        <Text style={[styles.ballSrc, { color: gpsLive ? colors.fairway : colors.zinc400 }]} testID="ball-source-label">
          {gpsLive ? "● BALL: GPS LIVE" : "BALL: MANUAL"}
        </Text>
        {!settings.tournamentMode && pl && distM != null && (
          <View style={styles.plBlock}>
            <Text style={styles.plLabel}>PLAYS LIKE*</Text>
            <Text style={[styles.plVal, { fontFamily: font.num }]} testID="plays-like-value">{fmtDist(pl.playsLikeMeters, unit)}</Text>
          </View>
        )}
        {elev?.available && elev.diff != null && !settings.tournamentMode && (
          <Text style={styles.elevTxt} testID="elevation-value">
            {elev.diff >= 0 ? "+" : ""}{elev.diff} m {elev.diff >= 0 ? "UPHILL" : "DOWNHILL"}
          </Text>
        )}
        {walkDistM != null && (
          <View style={styles.walk} testID="walkoff-meter">
            <Ionicons name="walk" size={14} color={colors.green} />
            <Text style={styles.walkTxt}>WALKED <Text style={[styles.walkNum, { fontFamily: font.num }]}>{fmtDist(walkDistM, unit)}</Text> {unitLabel(unit)}</Text>
          </View>
        )}
      </View>

      {/* Right controls */}
      <View style={[styles.rightCtrls, { top: insets.top + 60 }]}>
        <Pressable testID="map-type-btn" onPress={() => setMapType((m) => (m === "satellite" ? "hybrid" : m === "hybrid" ? "map" : "satellite"))} style={styles.iconBtn}>
          <Ionicons name="layers" size={20} color={colors.charcoal} />
        </Pressable>
        <Pressable testID="recenter-btn" onPress={() => setRecenter((t) => t + 1)} style={styles.iconBtn}>
          <Ionicons name="locate" size={20} color={colors.charcoal} />
        </Pressable>
        <Pressable testID="cam-mode-btn" onPress={cycleCam} style={[styles.iconBtn, camMode !== "free" && { backgroundColor: colors.water }]}>
          <Ionicons name={camMode === "heading" ? "navigate" : "compass"} size={20} color={camMode !== "free" ? "#fff" : colors.charcoal} />
        </Pressable>
      </View>

      {/* GPS denied helper */}
      {gpsError === "denied" && !ball && (
        <View style={styles.gpsErrCard} testID="gps-error-card">
          <Text style={styles.gpsErrTitle}>Location access is needed for Live GPS Rangefinder.</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
            <Pressable testID="gps-retry-btn" onPress={requestAgain} style={[styles.gpsErrBtn, { backgroundColor: colors.green }]}>
              <Text style={{ color: "#fff", fontWeight: "800" }}>{canAskAgain ? "TRY AGAIN" : "OPEN SETTINGS"}</Text>
            </Pressable>
            <Pressable testID="gps-manual-btn" onPress={() => setSetBallMode(true)} style={[styles.gpsErrBtn, { backgroundColor: colors.zinc100 }]}>
              <Text style={{ color: colors.charcoal, fontWeight: "800" }}>SET BALL MANUALLY</Text>
            </Pressable>
          </View>
        </View>
      )}

      {setBallMode && (
        <View style={[styles.hint, { top: "50%" }]} testID="set-ball-hint">
          <Text style={styles.hintTxt}>TAP THE MAP TO PLACE YOUR BALL</Text>
        </View>
      )}

      {/* Bottom stack */}
      <View style={styles.bottom} pointerEvents="box-none">
        {fcb && fcb.center != null && (
          <View style={styles.fcbStrip} testID="fcb-strip">
            {([["FRONT", fcb.front], ["CENTER", fcb.center], ["BACK", fcb.back]] as [string, number | null][]).map(([l, v]) => (
              <View key={l} style={styles.fcbBox}>
                <Text style={styles.fcbLbl}>{l}</Text>
                <Text style={[styles.fcbVal, { fontFamily: font.num }]} testID={`fcb-${l.toLowerCase()}`}>{fmtDist(v, unit)}</Text>
              </View>
            ))}
          </View>
        )}

        {sheetOpen && (
          <ScrollView style={styles.sheet} contentContainerStyle={{ padding: 14 }} testID="bottom-sheet">
            {targetCards.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
                {targetCards.map(([label, p, name], i) => (
                  <Pressable key={i} testID={`target-card-${i}`} onPress={() => { setTarget({ lat: p.lat, lng: p.lng }); setTargetLabel((name || label).toUpperCase()); }} style={styles.tCard}>
                    <Text style={styles.tCardLbl}>{name || label}</Text>
                    <Text style={[styles.tCardVal, { fontFamily: font.num }]}>{ball && p ? fmtDist(haversineMeters(ball, p), unit) : "--"}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            {!settings.tournamentMode && (
              <View style={styles.sheetSection}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={styles.sheetLabel}>WIND ({settings.windUnit === "kmh" ? "km/h" : "mph"})</Text>
                  <Pressable
                    testID="auto-weather-toggle"
                    onPress={() => {
                      const v = !autoWx;
                      setAutoWx(v);
                      storage.setItem("sg_autowx", v ? "1" : "0");
                      if (v) { wxReqRef.current = { pos: null, time: 0 }; toast.success("Auto weather on"); }
                    }}
                    style={[styles.autoWx, { backgroundColor: autoWx ? colors.water : colors.zinc100 }]}
                  >
                    <Text style={[styles.autoWxTxt, { color: autoWx ? "#fff" : colors.zinc500 }]}>AUTO {autoWx ? "ON" : "OFF"}</Text>
                  </Pressable>
                </View>
                {autoWx ? (
                  <View style={styles.wxInfo} testID="live-weather-info">
                    {wx?.available ? (
                      <Text style={styles.wxTxt}>
                        {Math.round(settings.windUnit === "mph" ? wx.windSpeedKmh / 1.609 : wx.windSpeedKmh)} {settings.windUnit === "kmh" ? "km/h" : "mph"} from {Math.round(wx.windFromDeg)}°
                        {effWind.auto ? ` · ${effWind.dir.toUpperCase()}` : ""} · {Math.round(wx.tempC)}°C
                      </Text>
                    ) : (
                      <Text style={styles.wxTxt}>{wx ? "Live weather unavailable — use manual wind." : "Fetching live weather…"}</Text>
                    )}
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
                    <TextInput
                      testID="wind-speed-input"
                      keyboardType="number-pad"
                      value={String(wind.speed)}
                      onChangeText={(t) => { const w = { ...wind, speed: Number(t) || 0 }; setWind(w); storage.setItem("sg_wind", JSON.stringify(w)); }}
                      style={styles.windInput}
                    />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                      {WIND_DIRS.map(([k, l]) => (
                        <Pressable key={k} testID={`wind-dir-${k}`} onPress={() => { const w = { ...wind, dir: k }; setWind(w); storage.setItem("sg_wind", JSON.stringify(w)); }} style={[styles.windDir, { backgroundColor: wind.dir === k ? colors.green : colors.zinc100 }]}>
                          <Text style={[styles.windDirTxt, { color: wind.dir === k ? "#fff" : colors.zinc600 }]}>{l}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}
            {!settings.tournamentMode && pl && distM != null && (
              <View style={[styles.sheetSection, { flexDirection: "row", gap: 6 }]} testID="plays-like-breakdown">
                {([["ACTUAL", pl.actualMeters, false], ["ELEV", pl.elevationAdj, true], ["WIND", pl.windAdj, true], ["EST. PLAYS", pl.playsLikeMeters, false]] as [string, number, boolean][]).map(([l, v, signed]) => (
                  <View key={l} style={styles.breakBox}>
                    <Text style={styles.breakLbl}>{l}</Text>
                    <Text style={[styles.breakVal, { fontFamily: font.num }]}>{signed ? (v >= 0 ? "+" : "") : ""}{fmtDist(v, unit)}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        )}

        {/* Action bar */}
        <View style={styles.actionBar}>
          <Pressable testID="sheet-toggle-btn" onPress={() => setSheetOpen((o) => !o)} style={styles.sheetToggle}>
            <Ionicons name={sheetOpen ? "chevron-down" : "chevron-up"} size={18} color="#fff" />
          </Pressable>
          <Pressable testID="set-ball-here-btn" onPress={() => setSetBallMode((m) => !m)} style={[styles.actBtn, { backgroundColor: setBallMode ? colors.gold : "rgba(255,255,255,0.1)" }]}>
            <Text style={[styles.actTxt, { color: setBallMode ? colors.charcoal : "#fff" }]}>SET BALL ON MAP</Text>
          </Pressable>
          <Pressable
            testID="use-my-location-btn"
            onPress={() => {
              if (ballSource === "gps") return;
              if (gpsPos) { setBall(gpsPos); setBallSource("gps"); setRecenter((t) => t + 1); toast.success("LIVE mode: distance updates in real time"); }
              else toast.error("GPS not available");
            }}
            style={[styles.gpsBtn, { backgroundColor: gpsLive ? colors.fairway : "rgba(255,255,255,0.1)" }]}
          >
            <Ionicons name="locate" size={18} color={gpsLive ? colors.charcoal : "#fff"} />
            <Text style={[styles.gpsBtnTxt, { color: gpsLive ? colors.charcoal : "#fff" }]}>{gpsLive ? "LIVE" : "GPS"}</Text>
          </Pressable>
          {shot ? (
            <Pressable testID="end-shot-btn" onPress={endShot} style={[styles.actBtn, { backgroundColor: colors.gold }]}>
              <Text style={[styles.actTxt, { color: colors.charcoal }]}>BALL FOUND</Text>
            </Pressable>
          ) : (
            <Pressable testID="track-shot-btn" onPress={() => setShowClubPick(true)} style={[styles.actBtn, { backgroundColor: colors.green }]}>
              <Text style={[styles.actTxt, { color: "#fff" }]}>TRACK SHOT</Text>
            </Pressable>
          )}
        </View>

        {!settings.tournamentMode && rec && (
          <View style={styles.recStrip} testID="club-rec-strip">
            <Text style={styles.recStripLbl}>SMART CADDIE</Text>
            <Text style={styles.recStripVal}>{rec.club.name.toUpperCase()} <Text style={{ color: colors.gold }}>· {Math.round(rec.club.carry)} yd · {rec.confidence}</Text></Text>
          </View>
        )}
      </View>

      {/* Club picker */}
      <Modal visible={showClubPick} transparent animationType="slide" onRequestClose={() => setShowClubPick(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowClubPick(false)}>
          <Pressable style={styles.modalSheet} testID="club-picker">
            <Text style={styles.modalTitle}>START SHOT · SELECT CLUB</Text>
            <ScrollView contentContainerStyle={styles.clubGrid}>
              {(bag?.clubs || []).filter((c: any) => c.name !== "Putter").map((c: any) => (
                <Pressable key={c.id} testID={`pick-club-${c.name.replace(/\s/g, "-").toLowerCase()}`} onPress={() => startShot(c.name)} style={[styles.clubBtn, rec?.club?.name === c.name && { borderColor: colors.green, backgroundColor: "rgba(20,83,45,0.08)" }]}>
                  <Text style={styles.clubBtnName}>{c.name}</Text>
                  <Text style={styles.clubBtnYd}>{Math.round(c.carry)} yd</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Shot result */}
      <Modal visible={!!shotResult} transparent animationType="slide" onRequestClose={() => setShotResult(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { padding: 24 }]} testID="shot-result-dialog">
            <Text style={styles.modalTitle}>SHOT RECORDED</Text>
            <Text style={[styles.srClub, { fontFamily: font.headBold }]}>{shotResult?.club}</Text>
            <Text style={[styles.srDist, { fontFamily: font.num }]}>{fmtDist(shotResult?.distance, unit)} <Text style={{ fontSize: 22 }}>{unitLabel(unit)}</Text></Text>
            <Text style={styles.srSection}>FAIRWAY HIT?</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              {([["YES", true], ["NO", false]] as [string, boolean][]).map(([l, v]) => (
                <Pressable key={l} testID={`shot-fairway-${l.toLowerCase()}`} onPress={() => setShotResult((s: any) => ({ ...s, fairway: v }))} style={[styles.srOpt, shotResult?.fairway === v && { backgroundColor: colors.green }]}>
                  <Text style={[styles.srOptTxt, shotResult?.fairway === v && { color: "#fff" }]}>{l}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.srSection}>DIRECTION</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              {["LEFT", "CENTER", "RIGHT"].map((d) => (
                <Pressable key={d} testID={`shot-dir-${d.toLowerCase()}`} onPress={() => setShotResult((s: any) => ({ ...s, direction: d }))} style={[styles.srOpt, shotResult?.direction === d && { backgroundColor: colors.green }]}>
                  <Text style={[styles.srOptTxt, shotResult?.direction === d && { color: "#fff" }]}>{d}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable testID="save-shot-btn" onPress={saveShot} style={styles.srSave}>
              <Text style={styles.srSaveTxt}>SAVE SHOT</Text>
            </Pressable>
            <Pressable testID="discard-shot-btn" onPress={() => setShotResult(null)} style={{ marginTop: 8, alignItems: "center" }}>
              <Text style={{ color: colors.zinc400, fontWeight: "700" }}>Discard</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.charcoal },
  topBar: { position: "absolute", left: 12, right: 12, flexDirection: "row", alignItems: "flex-start", gap: 8, zIndex: 20 },
  iconBtn: { height: 44, width: 44, borderRadius: 14, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.zinc300, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 },
  holePill: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 14, height: 44, borderWidth: 1, borderColor: colors.zinc300, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 },
  holeArrow: { paddingHorizontal: 8, height: "100%", justifyContent: "center" },
  holeNum: { fontSize: 13, fontWeight: "900", color: colors.charcoal },
  holeMeta: { fontSize: 10, color: colors.zinc500, fontWeight: "700" },
  gpsBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  gpsBadgeTxt: { fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  tourBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.charcoal, borderWidth: 1, borderColor: colors.gold },
  tourTxt: { fontSize: 10, fontWeight: "900", color: colors.gold },
  navHud: { flexDirection: "row", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(15,15,16,0.85)" },
  navHudTxt: { color: "#fff", fontSize: 10, fontWeight: "800" },
  suggestBanner: { position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.charcoal, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "rgba(212,175,55,0.6)", zIndex: 25 },
  suggestBannerTxt: { color: "#fff", fontSize: 11, fontWeight: "800" },
  suggestSwitch: { height: 34, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  suggestSwitchTxt: { color: colors.charcoal, fontSize: 10, fontWeight: "900" },
  suggestX: { height: 34, width: 34, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  distCard: { position: "absolute", left: 12, backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: colors.zinc300, paddingHorizontal: 16, paddingVertical: 10, minWidth: 130, zIndex: 15, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, elevation: 5 },
  distLabel: { fontSize: 10, letterSpacing: 1.5, fontWeight: "800", color: colors.zinc500 },
  distBig: { fontSize: 52, lineHeight: 56, color: colors.charcoal },
  distUnit: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: colors.green },
  ballSrc: { fontSize: 9, fontWeight: "900", letterSpacing: 1, marginTop: 4 },
  plBlock: { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.zinc200 },
  plLabel: { fontSize: 9, letterSpacing: 1.5, fontWeight: "800", color: colors.zinc400 },
  plVal: { fontSize: 24, lineHeight: 26, color: colors.green },
  elevTxt: { fontSize: 10, fontWeight: "800", color: colors.zinc500, marginTop: 4 },
  walk: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.zinc200 },
  walkTxt: { fontSize: 10, fontWeight: "900", color: colors.zinc600 },
  walkNum: { fontSize: 14, color: colors.green },
  rightCtrls: { position: "absolute", right: 12, gap: 8, zIndex: 15 },
  gpsErrCard: { position: "absolute", top: "33%", left: 24, right: 24, backgroundColor: "#fff", borderRadius: 18, padding: 20, zIndex: 30, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 10, elevation: 8 },
  gpsErrTitle: { fontWeight: "800", fontSize: 14, color: colors.charcoal, textAlign: "center" },
  gpsErrBtn: { flex: 1, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  hint: { position: "absolute", alignSelf: "center", backgroundColor: colors.charcoal, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, zIndex: 30 },
  hintTxt: { color: "#fff", fontSize: 12, fontWeight: "800" },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 15 },
  fcbStrip: { flexDirection: "row", justifyContent: "center", gap: 6, paddingBottom: 6, paddingHorizontal: 12 },
  fcbBox: { backgroundColor: "rgba(15,15,16,0.85)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4, alignItems: "center" },
  fcbLbl: { fontSize: 8, fontWeight: "900", letterSpacing: 1.5, color: "rgba(255,255,255,0.5)" },
  fcbVal: { fontSize: 18, lineHeight: 20, color: "#fff" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 2, borderTopColor: colors.gold, maxHeight: 300 },
  sheetSection: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.zinc100 },
  sheetLabel: { fontSize: 11, letterSpacing: 1.5, fontWeight: "800", color: colors.zinc400 },
  tCard: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.zinc100, borderWidth: 1, borderColor: colors.zinc200 },
  tCardLbl: { fontSize: 9, fontWeight: "900", letterSpacing: 1, color: colors.zinc500 },
  tCardVal: { fontSize: 18, color: colors.charcoal },
  autoWx: { height: 32, paddingHorizontal: 12, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  autoWxTxt: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  wxInfo: { marginTop: 8, backgroundColor: "#F0F9FF", borderWidth: 1, borderColor: "#BAE6FD", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  wxTxt: { fontSize: 12, fontWeight: "700", color: "#0C4A6E" },
  windInput: { width: 64, height: 40, borderRadius: 10, borderWidth: 1, borderColor: colors.zinc300, textAlign: "center", fontWeight: "800", color: colors.charcoal },
  windDir: { paddingHorizontal: 10, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  windDirTxt: { fontSize: 10, fontWeight: "900" },
  breakBox: { flex: 1, backgroundColor: colors.zinc100, borderRadius: 10, paddingVertical: 6, alignItems: "center" },
  breakLbl: { fontSize: 8, fontWeight: "900", letterSpacing: 1, color: colors.zinc400 },
  breakVal: { fontSize: 15, color: colors.charcoal },
  actionBar: { backgroundColor: colors.charcoal, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  sheetToggle: { height: 48, width: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  actBtn: { flex: 1, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  actTxt: { fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  gpsBtn: { height: 48, paddingHorizontal: 12, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  gpsBtnTxt: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  recStrip: { backgroundColor: colors.green, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 6 },
  recStripLbl: { fontSize: 10, fontWeight: "900", letterSpacing: 1.5, color: "rgba(255,255,255,0.7)" },
  recStripVal: { fontSize: 14, fontWeight: "900", color: "#fff" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, maxHeight: "70%" },
  modalTitle: { fontSize: 11, fontWeight: "900", letterSpacing: 2, color: colors.zinc400, marginBottom: 12 },
  clubGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  clubBtn: { width: "31%", height: 64, borderRadius: 12, borderWidth: 1, borderColor: colors.zinc200, backgroundColor: colors.zinc100, alignItems: "center", justifyContent: "center" },
  clubBtnName: { fontWeight: "800", fontSize: 12, color: colors.charcoal },
  clubBtnYd: { fontSize: 11, color: colors.zinc400 },
  srClub: { fontSize: 24, fontWeight: "800", color: colors.charcoal, marginTop: 4 },
  srDist: { fontSize: 56, color: colors.green },
  srSection: { fontSize: 11, letterSpacing: 1.5, fontWeight: "800", color: colors.zinc400, marginTop: 16 },
  srOpt: { flex: 1, height: 48, borderRadius: 12, backgroundColor: colors.zinc100, alignItems: "center", justifyContent: "center" },
  srOptTxt: { fontWeight: "800", fontSize: 14, color: colors.charcoal },
  srSave: { height: 56, borderRadius: 18, backgroundColor: colors.green, alignItems: "center", justifyContent: "center", marginTop: 20 },
  srSaveTxt: { color: "#fff", fontWeight: "900", letterSpacing: 2 },
});
