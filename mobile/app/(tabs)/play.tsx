import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Modal, TextInput, Alert } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Speech from "expo-speech";
import { colors, font } from "@/src/theme";
import { HoleDetector, usableHole, greenDistances, containsPoint, validRing } from "@/src/lib/navigation";
import { imageryConfigured } from "@/src/lib/imagery";
import { GolfMap } from "@/src/components/GolfMap";
import { useGPS } from "@/src/hooks/useGPS";
import { useSettings } from "@/src/context/SettingsContext";
import { haversineMeters, bearingDeg, fmtDist, unitLabel, movedMoreThan, boundsForCourse, LatLng } from "@/src/lib/geo";
import { computePlaysLike } from "@/src/lib/playsLike";
import { recommendClub } from "@/src/lib/clubRec";
import { api, cachedGet, getActiveRound, setActiveRound, ActiveRound } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { startBackgroundTracking, stopBackgroundTracking, drainBackgroundPath, acknowledgeBackgroundPath } from "@/src/lib/locationTask";
import { offlineSupported, listOfflineCourseIds, downloadCourseTiles } from "@/src/lib/offline";
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
  const { pos: gpsPos, accuracy, quality, error: gpsError, speed, heading, canAskAgain, requestAgain, mocked } = useGPS(settings.gpsTracking !== false);

  const [activeRound, setActive] = useState<ActiveRound>(null);
  const [course, setCourse] = useState<any>(null);
  const [holeIdx, setHoleIdx] = useState(0);
  const [ball, setBall] = useState<LatLng | null>(null);
  const [ballSource, setBallSource] = useState<"gps" | "manual">("gps");
  const [target, setTarget] = useState<LatLng | null>(null);
  const [targetLabel, setTargetLabel] = useState("PIN");
  const [setBallMode, setSetBallMode] = useState(false);
  const [mapType, setMapType] = useState<"satellite" | "hybrid" | "map" | "golf" | "terrain">("golf");
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
  const [manualHole, setManualHole] = useState(false);
  const detectorRef = useRef(new HoleDetector());
  const navigationReady = useRef(false);
  const [camMode, setCamMode] = useState<"free" | "follow" | "heading">("free");
  const [gpsPath, setGpsPath] = useState<{ lat: number; lng: number; t: number }[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [roundScores, setRoundScores] = useState<any[] | null>(null);
  const [puttReminder, setPuttReminder] = useState<{ holeNumber: number } | null>(null);
  const [puttDraft, setPuttDraft] = useState(2);
  const [flyoverKey, setFlyoverKey] = useState(0);
  const [arcsOn, setArcsOn] = useState(false);
  const [hazOpen, setHazOpen] = useState(false);
  const [pins, setPins] = useState<Record<string, LatLng>>({});
  const pinsRef = useRef<Record<string, LatLng>>({});
  const [pendingGreen, setPendingGreen] = useState(false);
  const [greenFocus, setGreenFocus] = useState<{ key: number; point: LatLng } | null>(null);
  const [advancePrompt, setAdvancePrompt] = useState<{ nextIdx: number; holeNumber: number } | null>(null);
  const [holeUpKey, setHoleUpKey] = useState(0);

  const nearGreenRef = useRef(false);
  const puttDismissedRef = useRef<Set<number>>(new Set());
  const advNearGreenRef = useRef(false);
  const advanceOfferedRef = useRef<Set<number>>(new Set());

  const wxReqRef = useRef<{ pos: LatLng | null; time: number }>({ pos: null, time: 0 });
  const pathBufRef = useRef<{ lat: number; lng: number; t: number }[]>([]);
  const elevReqRef = useRef<{ ball: LatLng | null; target: LatLng | null }>({ ball: null, target: null });


  const hole = course?.holes?.[holeIdx] || null;
  const geometryReady = useMemo(() => usableHole(course, hole), [course, hole]);
  const mappedHole = geometryReady ? hole : null;

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
      navigationReady.current = false;
      (async () => {
        cachedGet("/bag", "bag").then((b) => alive && setBag(b)).catch(() => {});
        const a = await getActiveRound();
        if (alive) setActive(a);
        if (a) {
          api.get(`/rounds/${a.id}`).then((r) => alive && setRoundScores(r.scores)).catch(() => {});
        }
        const quick = await storage.getItem<string>("sg_quick_course", "");
        const cid = a?.courseId || quick;
        try {
          if (cid) {
            const c = await cachedGet(`/courses/${cid}`, `course_${cid}`);
            const sh = await storage.getItem<string>("sg_start_hole", "");
            const focus = await storage.getItem<string>("sg_focus", "");
            if (sh) storage.removeItem("sg_start_hole");
            if (focus) storage.removeItem("sg_focus");
            const pinsRaw = await storage.getItem<string>(`sg_pins_${cid}`, "");
            const loadedPins = pinsRaw ? JSON.parse(pinsRaw) : {};
            const navRaw = await storage.getItem<string>(`sg_navigation_v1_${cid}`, "");
            let nav: any = {};try { nav = navRaw ? JSON.parse(navRaw) : {}; } catch {}
            pinsRef.current = loadedPins;
            if (alive) {
              setPins(loadedPins);
              setCourse(c);
              const desired = sh ? Number(sh) : a?.currentHole || nav.holeNumber || 1;
              setHoleIdx(Math.max(0, Math.min(c.holes.length - 1, desired - 1)));
              setManualHole(!!nav.manual);detectorRef.current.reset();navigationReady.current = true;
              if (focus === "green") setPendingGreen(true);
            }
          } else {
            const cs = await cachedGet<any[]>("/courses", "courses");
            if (alive && cs[0]) { setCourse(cs[0]);setHoleIdx(0);setManualHole(false);detectorRef.current.reset();navigationReady.current = true; }
          }
        } catch {}
      })();
      return () => { alive = false; };
    }, [])
  );

  // Never silently substitute the tee for a missing/stale GPS fix.
  useEffect(() => {
    if (ballSource === "gps") setBall(gpsPos && (!mappedHole?.tee || haversineMeters(gpsPos, mappedHole.tee)! <= 2500) ? gpsPos : null);
  }, [gpsPos, ballSource, mappedHole]);

  // Default target: saved pin or green center on hole change; trigger hole flyover / green focus.
  useEffect(() => {
    if (!hole || !geometryReady) { setTarget(null);return; }
    const hn = String(hole.holeNumber);
    const candidate = pinsRef.current[hn];
    const green = hole.polygons?.find((p: any) => p.type === "GREEN" && validRing(p.points));
    const savedPin = candidate && green && containsPoint(green.points, candidate) ? candidate : null;
    if (savedPin) { setTarget(savedPin); setTargetLabel("PIN"); }
    else if (hole.greenCenter) { setTarget(hole.greenCenter); setTargetLabel("CENTER"); }
    if (pendingGreen) {
      const pt = savedPin || hole.greenCenter;
      if (pt) { setTarget(pt); setTargetLabel("PIN"); setGreenFocus({ key: Date.now(), point: pt }); }
      setPendingGreen(false);
    } else if (hole.tee && hole.greenCenter) {
      if (mapType === "golf") setHoleUpKey((k) => k + 1);
      else setFlyoverKey((k) => k + 1);
    }
  }, [holeIdx, course, pendingGreen, geometryReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const savePin = (pos: LatLng) => {
    if (!hole || !course || !geometryReady) return false;
    const green = hole.polygons?.find((p: any) => p.type === "GREEN" && validRing(p.points));
    if (!green || !containsPoint(green.points, pos)) { toast.error("Pin must be inside a reviewed green boundary");return false; }
    const hn = String(hole.holeNumber);
    const next = { ...pinsRef.current, [hn]: pos };
    pinsRef.current = next;
    setPins(next);
    storage.setItem(`sg_pins_${course.id}`, JSON.stringify(next));
    return true;
  };

  // Background tracking lifecycle for an active round.
  useEffect(() => {
    if (activeRound && settings.gpsTracking !== false) startBackgroundTracking();
    return () => { stopBackgroundTracking(); };
  }, [activeRound, settings.gpsTracking]);

  // Auto Offline: the first time a round starts on a course, offer to save its map offline.
  useEffect(() => {
    if (!offlineSupported || !activeRound || !course?.id) return;
    let alive = true;
    (async () => {
      const raw = await storage.getItem<string>("sg_offline_prompted", "");
      const prompted: string[] = raw ? JSON.parse(raw) : [];
      if (prompted.includes(course.id)) return;
      const ids = await listOfflineCourseIds();
      if (!alive || ids.includes(course.id)) return;
      await storage.setItem("sg_offline_prompted", JSON.stringify([...prompted, course.id]));
      Alert.alert(
        "Save this course offline?",
        `Download ${course.name}'s satellite map so it keeps working with no signal on the course.`,
        [
          { text: "Not now", style: "cancel" },
          { text: "Save offline", onPress: async () => {
            try {
              toast.info("Downloading offline map…", "You can keep playing while it saves.");
              const b = boundsForCourse(course, course.latitude, course.longitude);
              await downloadCourseTiles(course.id, course.name, b);
              toast.success("Offline map saved");
            } catch { toast.error("Could not save offline map"); }
          } },
        ],
      );
    })();
    return () => { alive = false; };
  }, [activeRound?.id, course?.id]);

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
  const fcb = useMemo(() => ball && mappedHole ? greenDistances(ball, mappedHole) : null, [ball, mappedHole]);

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
    if (distM == null) { storage.removeItem("sg_caddie_ctx");return; }
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
      const points = pathBufRef.current.splice(0, 200);
      api.post(`/rounds/${activeRound.id}/track`, { points }).catch(() => { pathBufRef.current.unshift(...points); });
    }
  }, [gpsPos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush any background-collected points when returning to the round.
  useEffect(() => {
    if (!activeRound) return;
    drainBackgroundPath().then((pts) => {
      if (pts.length) {
        setGpsPath((p) => [...p, ...pts].slice(-500));
        const batch = pts.slice(0, 200);
        api.post(`/rounds/${activeRound.id}/track`, { points: batch }).then(() => acknowledgeBackgroundPath(batch)).catch(() => {});
      }
    }).catch(() => toast.error("Location history could not be read; saved data has been kept"));
  }, [activeRound]);

  // Load current round scores (for the putt reminder).
  useEffect(() => {
    if (!activeRound) { setRoundScores(null); return; }
    api.get(`/rounds/${activeRound.id}`).then((r) => setRoundScores(r.scores)).catch(() => {});
  }, [activeRound]);

  // Putt reminder: when the golfer leaves the green without logging putts.
  useEffect(() => {
    if (!gpsPos || !activeRound || !mappedHole?.greenCenter || !roundScores) return;
    const d = haversineMeters(gpsPos, hole.greenCenter) as number;
    if (d < 18) {
      nearGreenRef.current = true;
    } else if (d > 35 && nearGreenRef.current) {
      nearGreenRef.current = false;
      const sc = roundScores.find((s: any) => s.hole === hole.holeNumber);
      if (sc && sc.putts == null && !puttDismissedRef.current.has(hole.holeNumber)) {
        setPuttDraft(2);
        setPuttReminder({ holeNumber: hole.holeNumber });
      }
    }
  }, [gpsPos, activeRound, hole, roundScores]);

  // Auto-advance: after holing out and walking off the green, offer the next hole.
  useEffect(() => {
    if (!gpsPos || !activeRound || !mappedHole?.greenCenter || !course) return;
    const d = haversineMeters(gpsPos, hole.greenCenter) as number;
    if (d < 18) {
      advNearGreenRef.current = true;
    } else if (d > 45 && advNearGreenRef.current) {
      advNearGreenRef.current = false;
      const nextIdx = holeIdx + 1;
      if (nextIdx < course.holes.length && course.holes[nextIdx]?.tee && !advanceOfferedRef.current.has(hole.holeNumber)) {
        advanceOfferedRef.current.add(hole.holeNumber);
        setAdvancePrompt({ nextIdx, holeNumber: course.holes[nextIdx].holeNumber });
      }
    }
  }, [gpsPos, activeRound, hole, course, holeIdx]);

  const savePutts = async () => {
    if (!puttReminder || !activeRound) return;
    const hn = puttReminder.holeNumber;
    setPuttReminder(null);
    try {
      // Re-read the latest scores so we never clobber a score set on the Score tab.
      const fresh = await api.get(`/rounds/${activeRound.id}`);
      const next = fresh.scores.map((s: any) => (s.hole === hn ? { ...s, putts: puttDraft } : s));
      await api.put(`/rounds/${activeRound.id}`, { scores: next });
      setRoundScores(next);
      toast.success(`Logged ${puttDraft} putt${puttDraft === 1 ? "" : "s"} on Hole ${hn}`);
    } catch {
      toast.error("Could not save putts (offline?)");
    }
  };

  // Voice Caddie — speaks the live shot summary aloud (hands-free).
  const voiceAnswer = () => {
    const u = unit === "yd" ? "yards" : "meters";
    if (distM == null) return "No target set. Tap the map to place a target.";
    const plays =
      pl && !settings.tournamentMode && Math.round(pl.playsLikeMeters) !== Math.round(distM)
        ? `, playing approximately ${fmtDist(pl.playsLikeMeters, unit)}`
        : "";
    const clubTxt = rec && !settings.tournamentMode ? ` Recommended club, ${rec.club.name}.` : "";
    return `${fmtDist(distM, unit)} ${u} to the ${targetLabel.toLowerCase()}${plays}.${clubTxt}`;
  };

  const speakCaddie = () => {
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    const text = voiceAnswer();
    toast.info("Voice Caddie", text);
    setSpeaking(true);
    Speech.speak(text, { rate: 1, onDone: () => setSpeaking(false), onStopped: () => setSpeaking(false), onError: () => setSpeaking(false) });
  };

  useEffect(() => () => { Speech.stop(); }, []);

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

  const goHole = (next: number, automatic = false) => {
    if (!course?.holes?.[next]) return;
    if (!automatic) { setManualHole(true);detectorRef.current.reset(); }
    storage.setItem(`sg_navigation_v1_${course.id}`, JSON.stringify({ manual: !automatic, holeNumber: next + 1 }));
    const leaving = hole;
    if (activeRound && roundScores && leaving && next !== holeIdx) {
      const sc = roundScores.find((s: any) => s.hole === leaving.holeNumber);
      if (sc && sc.score != null && sc.putts == null && !puttDismissedRef.current.has(leaving.holeNumber)) {
        setPuttDraft(2);
        setPuttReminder({ holeNumber: leaving.holeNumber });
      }
    }
    setHoleIdx(next);

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

  // Reviewed polygons only; sustained evidence and ambiguity rejection prevent adjacent-hole jumps.
  useEffect(() => {
    if (!navigationReady.current || !gpsPos || accuracy == null || !course || mocked) return;
    const next = detectorRef.current.update(course, holeIdx, gpsPos, accuracy, performance.now(), manualHole);
    if (next !== holeIdx) goHole(next, true);
    // goHole is intentionally read from the current render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpsPos, accuracy, course, holeIdx, manualHole, mocked]);

  const walkDistM = useMemo(() => (walkAnchor && gpsPos ? haversineMeters(walkAnchor, gpsPos) : null), [walkAnchor, gpsPos]);

  const cycleCam = () => {
    setCamMode((m) => {
      const next = m === "free" ? "follow" : m === "follow" ? "heading" : "free";
      toast.info(next === "follow" ? "Follow · North Up" : next === "heading" ? "Follow · Direction Up" : "Free camera");
      return next;
    });
  };

  const cycleMapType = () => {
    setMapType((m) => {
      const next = m === "golf" ? "satellite" : "golf";
      if (next !== "golf" && !imageryConfigured) { toast.info("Imagery not configured", "A licensed tile provider and attribution are required.");return "golf"; }
      toast.info(next === "golf" ? "Golf View" : next === "satellite" ? "Satellite View" : "Terrain View");
      if (next === "golf") setHoleUpKey((k) => k + 1);
      return next;
    });
  };

  const startShot = (club: string) => {
    if (!ball || mocked || ballSource === "gps" && (!gpsPos || accuracy == null || accuracy > 20)) { toast.error("Use a fresh GPS fix with estimated accuracy ≤20m, or an explicit manual position");return; }
    setShot({ start: ball, club, targetDist: distM, playsLike: pl?.playsLikeMeters });
    setWalkAnchor(ballSource === "gps" && gpsPos ? gpsPos : ball);
    setShowClubPick(false);
    toast.success(`Shot started with ${club}`, "Walk to your ball, then tap BALL FOUND.");
  };
  const endShot = () => {
    if (!shot || !ball || mocked || ballSource === "gps" && (!gpsPos || accuracy == null || accuracy > 20)) { toast.error("Wait for a fresh GPS fix or set an explicit manual position");return; }
    const end = ballSource === "gps" ? gpsPos! : ball;
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
  const targetCards: [string, LatLng, string?][] = mappedHole
    ? ([
        ["CENTER", hole.greenCenter],
        ["FRONT", hole.greenFront],
        ["BACK", hole.greenBack],
        ...((hole.hazards || []).map((h: any) => [h.type, { lat: h.lat, lng: h.lng }, h.name])),
      ].filter((t: any) => t[1]) as any)
    : [];

  const gpsLive = ballSource === "gps" && !!gpsPos;

  // Straight-line distance references to the mapped green; never a safe route or inferred fairway.
  const layups = useMemo(() => {
    if (mapType !== "golf" || !mappedHole?.tee || !mappedHole?.greenCenter) return [];
    const tee = hole.tee, g = hole.greenCenter;
    const holeLenM = haversineMeters(tee, g) as number;
    const marks = unit === "m" ? [90, 140, 180] : [100, 150, 200];
    const toM = (v: number) => (unit === "m" ? v : v / 1.09361);
    const out: { pt: LatLng; label: string }[] = [];
    marks.forEach((v) => {
      const dM = toM(v);
      if (holeLenM > dM + 30) {
        const f = (holeLenM - dM) / holeLenM;
        out.push({ pt: { lat: tee.lat + f * (g.lat - tee.lat), lng: tee.lng + f * (g.lng - tee.lng) }, label: String(v) });
      }
    });
    return out;
  }, [mapType, hole, unit, mappedHole]);

  const greenZoom = () => {
    if (!geometryReady) { toast.error("Reviewed green mapping is required");return; }
    const p = pinsRef.current[String(hole?.holeNumber)] || hole?.greenCenter;
    if (!p) { toast.error("No green data for this hole"); return; }
    setTarget(p);
    setTargetLabel("PIN");
    setGreenFocus({ key: Date.now(), point: p });
    toast.info("Green zoom", "Drag the flag to set today's pin.");
  };

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
        onTargetDrag={(p) => { if (targetLabel === "PIN" && !savePin(p)) return;setTarget(p);if (targetLabel !== "PIN") setTargetLabel("CUSTOM"); }}
        tee={mappedHole?.tee}
        greens={mappedHole}
        hazards={mappedHole?.hazards || []}
        onHazardPress={(h) => { setTarget({ lat: h.lat, lng: h.lng }); setTargetLabel(h.name.toUpperCase()); }}
        distLabel={distM != null ? `${fmtDist(distM, unit)} ${unitLabel(unit).toLowerCase()}` : null}
        recenterKey={recenter}
        followPos={camMode !== "free" ? gpsPos : null}
        onUserPan={() => setCamMode("free")}
        gpsPath={activeRound ? gpsPath : []}
        distanceArcs={arcsOn}
        arcUnit={unit}
        polygons={mappedHole?.polygons || []}
        focusKey={greenFocus?.key}
        focusTarget={greenFocus?.point}
        flyover={mappedHole?.tee && mappedHole?.greenCenter ? { from: mappedHole.tee, to: mappedHole.greenCenter } : null}
        flyoverKey={flyoverKey}
        golfView={mapType === "golf"}
        holeUp={mappedHole?.tee && mappedHole?.greenCenter ? { from: mappedHole.tee, to: mappedHole.greenCenter } : null}
        holeUpKey={holeUpKey}
        layups={layups}
      />

      {(() => {
        const nextHole = course?.holes?.[holeIdx + 1];
        const nearGreen = mappedHole?.greenCenter && gpsPos ? (haversineMeters(gpsPos, hole.greenCenter) as number) < 55 : false;
        if (!nearGreen || !nextHole?.tee || !gpsPos) return null;
        const d = haversineMeters(gpsPos, nextHole.tee) as number;
        const dir = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(bearingDeg(gpsPos, nextHole.tee) / 45) % 8];
        return (
          <Pressable style={styles.nextTee} onPress={() => goHole(holeIdx + 1)} testID="next-tee-banner">
            <Ionicons name="walk" size={18} color={colors.charcoal} />
            <Text style={styles.nextTeeTxt}>NEXT TEE · HOLE {nextHole.holeNumber} · {fmtDist(d, unit)} {unitLabel(unit).toLowerCase()} {dir}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.charcoal} />
          </Pressable>
        );
      })()}

      {hazOpen && (mappedHole?.hazards?.length || 0) > 0 && (

        <View style={styles.hazPanel} testID="hazard-panel">
          <Text style={styles.hazPanelTitle}>HAZARDS · from {ball ? "ball" : "you"}</Text>
          <ScrollView style={{ maxHeight: 190 }} showsVerticalScrollIndicator={false}>
            {(hole.hazards || []).map((h: any) => {
              const origin = ball || gpsPos;
              const front = origin ? (haversineMeters(origin, { lat: h.lat, lng: h.lng }) as number) : null;
              const carry = origin && h.carryLat != null && h.carryLng != null ? (haversineMeters(origin, { lat: h.carryLat, lng: h.carryLng }) as number) : null;
              return (
                <Pressable key={h.id} style={styles.hazRow} testID={`hazard-row-${h.id}`} onPress={() => { setTarget({ lat: h.lat, lng: h.lng }); setTargetLabel(h.name.toUpperCase()); }}>
                  <View style={[styles.hazDot, { backgroundColor: h.type === "WATER" ? colors.water : h.type === "BUNKER" ? colors.gold : colors.fairway }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.hazName} numberOfLines={1}>{h.name}</Text>
                    <Text style={styles.hazDist}>
                      {front != null ? `Mapped point ${fmtDist(front, unit)}` : "Mapped point —"}
                      {carry != null ? `  ·  Carry point ${fmtDist(carry, unit)}` : ""} {unitLabel(unit).toLowerCase()}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      <View style={{ position: "absolute", top: insets.top + 70, left: 12, right: 12, backgroundColor: "#fff", borderRadius: 10, padding: 10 }} testID="navigation-status">
        <Pressable testID="auto-hole-toggle" onPress={() => { const manual = !manualHole;setManualHole(manual);detectorRef.current.reset();if (course) storage.setItem(`sg_navigation_v1_${course.id}`, JSON.stringify({ manual, holeNumber: holeIdx + 1 })); }}>
          <Text style={{ color: colors.charcoal, fontSize: 12, fontWeight: "700" }}>{manualHole ? "MANUAL HOLE · tap to enable Auto" : "AUTO HOLE · tap for manual override"}</Text>
        </Pressable>
        <Text style={{ color: colors.zinc600, fontSize: 11 }}>{!geometryReady ? "Playing geometry unverified · review actual course mapping before use" : !gpsPos && ballSource === "gps" ? "Playing distances paused · waiting for fresh GPS" : fcb ? `Green distances: ${fcb.source} · accuracy is an estimate` : "Tap map for a target. Layups are straight-line references, not safe routes."}</Text>
      </View>

      {/* Top bar */}
      <View style={[styles.topBar, { top: insets.top + 6 }]} pointerEvents="box-none">
        <Pressable testID="rf-home-btn" onPress={() => router.push("/")} style={styles.iconBtn}>
          <Ionicons name="home" size={20} color={colors.charcoal} />
        </Pressable>
        <Pressable testID="rf-overview-btn" onPress={() => router.push("/course-overview")} style={styles.iconBtn}>
          <Ionicons name="map" size={20} color={colors.charcoal} />
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
              {gpsError === "denied" ? "GPS DENIED" : gpsError === "stale" ? "GPS STALE" : gpsError ? "NO GPS" : accuracy != null ? `GPS ±${accuracy.toFixed(0)}m EST. ${mocked ? "SIMULATED" : quality}` : "GPS…"}
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


      {/* Putt reminder */}
      {puttReminder && (
        <View style={styles.puttBanner} testID="putt-reminder-banner">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Ionicons name="golf" size={18} color={colors.green} />
            <Text style={styles.puttTitle}>Log your putts · Hole {puttReminder.holeNumber}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={styles.puttStepper}>
              <Pressable testID="putt-minus" onPress={() => setPuttDraft(Math.max(0, puttDraft - 1))} style={styles.puttStepBtn}>
                <Ionicons name="remove" size={18} color="#fff" />
              </Pressable>
              <Text style={[styles.puttNum, { fontFamily: font.num }]} testID="putt-draft-value">{puttDraft}</Text>
              <Pressable testID="putt-plus" onPress={() => setPuttDraft(puttDraft + 1)} style={styles.puttStepBtn}>
                <Ionicons name="add" size={18} color="#fff" />
              </Pressable>
            </View>
            <Pressable testID="putt-save-btn" onPress={savePutts} style={styles.puttSave}>
              <Text style={styles.puttSaveTxt}>SAVE</Text>
            </Pressable>
            <Pressable testID="putt-dismiss-btn" onPress={() => { puttDismissedRef.current.add(puttReminder.holeNumber); setPuttReminder(null); }} style={styles.puttDismiss}>
              <Text style={styles.puttDismissTxt}>Later</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Auto-advance prompt */}
      {advancePrompt && (
        <View style={[styles.advanceBanner, { top: insets.top + 110 }]} testID="auto-advance-banner">
          <Ionicons name="flag" size={18} color={colors.gold} />
          <Text style={styles.advanceTxt}>Next hole {advancePrompt.holeNumber}?</Text>
          <Pressable testID="auto-advance-yes-btn" onPress={() => { goHole(advancePrompt.nextIdx); setAdvancePrompt(null); }} style={styles.advYes}>
            <Text style={styles.advYesTxt}>GO</Text>
          </Pressable>
          <Pressable testID="auto-advance-no-btn" onPress={() => setAdvancePrompt(null)} style={styles.advNo}>
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
        {autoWx && wx?.available && ball && target && !settings.tournamentMode && (
          <View style={styles.wxRow} testID="card-weather">
            <View style={{ transform: [{ rotate: `${((wx.windFromDeg + 180) - bearingDeg(ball, target) + 360) % 360}deg` }] }}>
              <Ionicons name="arrow-up" size={13} color={colors.water} />
            </View>
            <Text style={styles.wxTxt2}>
              {Math.round(settings.windUnit === "mph" ? wx.windSpeedKmh / 1.609 : wx.windSpeedKmh)} {settings.windUnit === "kmh" ? "km/h" : "mph"} · {Math.round(wx.tempC)}°C
            </Text>
          </View>
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
        <Pressable testID="map-type-btn" onPress={cycleMapType} style={styles.mapTypeBtn}>
          <Ionicons name={mapType === "golf" ? "golf" : mapType === "terrain" ? "trail-sign" : "layers"} size={17} color={colors.charcoal} />
          <Text style={styles.mapTypeTxt}>{mapType === "golf" ? "GOLF" : mapType === "satellite" ? "SAT" : mapType === "hybrid" ? "HYB" : mapType === "terrain" ? "TERR" : "MAP"}</Text>
        </Pressable>
        <Pressable testID="hole-up-btn" onPress={() => { setHoleUpKey((k) => k + 1); toast.info("Fairway up", "Tee at the bottom, green at the top."); }} style={styles.iconBtn}>
          <Ionicons name="arrow-up-circle-outline" size={22} color={colors.charcoal} />
        </Pressable>
        <Pressable testID="green-zoom-btn" onPress={greenZoom} style={styles.iconBtn}>
          <Ionicons name="flag" size={20} color={colors.green} />
        </Pressable>
        <Pressable testID="dist-arcs-btn" onPress={() => setArcsOn((v) => !v)} style={[styles.iconBtn, arcsOn && { backgroundColor: colors.charcoal }]}>
          <Ionicons name="radio-outline" size={20} color={arcsOn ? colors.gold : colors.charcoal} />
        </Pressable>
        {(hole?.hazards?.length || 0) > 0 && (
          <Pressable testID="hazard-panel-btn" onPress={() => setHazOpen((v) => !v)} style={[styles.iconBtn, hazOpen && { backgroundColor: colors.gold }]}>
            <Ionicons name="warning" size={20} color={colors.charcoal} />
          </Pressable>
        )}
        <Pressable testID="recenter-btn" onPress={() => setRecenter((t) => t + 1)} style={styles.iconBtn}>
          <Ionicons name="locate" size={20} color={colors.charcoal} />
        </Pressable>
        <Pressable testID="cam-mode-btn" onPress={cycleCam} style={[styles.iconBtn, camMode !== "free" && { backgroundColor: colors.water }]}>
          <Ionicons name={camMode === "heading" ? "navigate" : "compass"} size={20} color={camMode !== "free" ? "#fff" : colors.charcoal} />
        </Pressable>
        <Pressable testID="voice-caddie-btn" onPress={speakCaddie} style={[styles.iconBtn, speaking && { backgroundColor: colors.gold }]}>
          <Ionicons name={speaking ? "stop" : "volume-high"} size={20} color={speaking ? colors.charcoal : colors.green} />
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
  hazPanel: { position: "absolute", left: 12, top: 150, width: 210, backgroundColor: "rgba(255,255,255,0.96)", borderRadius: 16, padding: 12, borderWidth: 1, borderColor: colors.gold, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, elevation: 6 },
  hazPanelTitle: { fontSize: 10, fontWeight: "900", letterSpacing: 0.5, color: colors.zinc500, marginBottom: 6 },
  hazRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.zinc100 },
  hazDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: "#fff" },
  hazName: { fontSize: 12, fontWeight: "800", color: colors.charcoal },
  hazDist: { fontSize: 11, fontWeight: "700", color: colors.green, marginTop: 1 },
  nextTee: { position: "absolute", top: 96, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.gold, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 6, elevation: 5 },
  nextTeeTxt: { fontSize: 12, fontWeight: "900", color: colors.charcoal, letterSpacing: 0.3 },
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
  advanceBanner: { position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.charcoal, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "rgba(212,175,55,0.6)", zIndex: 26 },
  advanceTxt: { color: "#fff", fontSize: 12, fontWeight: "900" },
  advYes: { height: 34, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  advYesTxt: { color: colors.charcoal, fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  advNo: { height: 34, width: 34, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  distCard: { position: "absolute", left: 12, backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: colors.zinc300, paddingHorizontal: 16, paddingVertical: 10, minWidth: 130, zIndex: 15, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, elevation: 5 },
  distLabel: { fontSize: 10, letterSpacing: 1.5, fontWeight: "800", color: colors.zinc500 },
  distBig: { fontSize: 52, lineHeight: 56, color: colors.charcoal },
  distUnit: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: colors.green },
  ballSrc: { fontSize: 9, fontWeight: "900", letterSpacing: 1, marginTop: 4 },
  plBlock: { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.zinc200 },
  plLabel: { fontSize: 9, letterSpacing: 1.5, fontWeight: "800", color: colors.zinc400 },
  plVal: { fontSize: 24, lineHeight: 26, color: colors.green },
  elevTxt: { fontSize: 10, fontWeight: "800", color: colors.zinc500, marginTop: 4 },
  wxRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  wxTxt2: { fontSize: 11, fontWeight: "800", color: colors.water },
  walk: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.zinc200 },
  walkTxt: { fontSize: 10, fontWeight: "900", color: colors.zinc600 },
  walkNum: { fontSize: 14, color: colors.green },
  rightCtrls: { position: "absolute", right: 12, gap: 8, zIndex: 15 },
  mapTypeBtn: { height: 48, width: 48, borderRadius: 14, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", gap: 1, borderWidth: 1, borderColor: colors.zinc300, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 },
  mapTypeTxt: { fontSize: 7, fontWeight: "900", letterSpacing: 0.5, color: colors.zinc500, marginTop: 1 },
  gpsErrCard: { position: "absolute", top: "33%", left: 24, right: 24, backgroundColor: "#fff", borderRadius: 18, padding: 20, zIndex: 30, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 10, elevation: 8 },
  gpsErrTitle: { fontWeight: "800", fontSize: 14, color: colors.charcoal, textAlign: "center" },
  gpsErrBtn: { flex: 1, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  puttBanner: { position: "absolute", top: "40%", left: 24, right: 24, backgroundColor: "#fff", borderRadius: 20, padding: 18, zIndex: 35, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 12, elevation: 9 },
  puttTitle: { fontWeight: "800", fontSize: 15, color: colors.charcoal },
  puttStepper: { flexDirection: "row", alignItems: "center", gap: 10 },
  puttStepBtn: { height: 40, width: 40, borderRadius: 12, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  puttNum: { fontSize: 26, width: 34, textAlign: "center", color: colors.charcoal },
  puttSave: { flex: 1, height: 44, borderRadius: 12, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  puttSaveTxt: { color: "#fff", fontWeight: "900", letterSpacing: 1 },
  puttDismiss: { height: 44, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
  puttDismissTxt: { color: colors.zinc400, fontWeight: "700", fontSize: 12 },
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
