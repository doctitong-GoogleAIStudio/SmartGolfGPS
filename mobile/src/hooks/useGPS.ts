import { useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import { haversineMeters, bearingDeg, LatLng } from "@/src/lib/geo";
import { useSettings } from "@/src/context/SettingsContext";

const GPS_MODES: Record<string, { accuracy: Location.LocationAccuracy; timeInterval: number; distanceInterval: number }> = {
  high: { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 1 },
  balanced: { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
  saver: { accuracy: Location.Accuracy.Balanced, timeInterval: 8000, distanceInterval: 15 },
};

export type GpsError = "denied" | "unavailable" | null;

export type GpsState = {
  pos: LatLng | null;
  accuracy: number | null;
  quality: "GOOD" | "FAIR" | "POOR" | null;
  error: GpsError;
  speed: number | null; // m/s
  heading: number | null; // degrees
  canAskAgain: boolean;
  requestAgain: () => Promise<void>;
};

export function useGPS(enabled = true): GpsState {
  const { settings } = useSettings();
  const gpsMode = settings.gpsMode || "high";
  const [pos, setPos] = useState<LatLng | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [error, setError] = useState<GpsError>(null);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [permTick, setPermTick] = useState(0);
  const lastRef = useRef<LatLng | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const subRef = useRef<Location.LocationSubscription | null>(null);

  const requestAgain = async () => {
    const res = await Location.requestForegroundPermissionsAsync();
    setCanAskAgain(res.canAskAgain);
    if (res.status === "granted") setError(null);
    setPermTick((t) => t + 1);
  };

  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      setPos(null);
      setSpeed(null);
      setHeading(null);
      return;
    }

    (async () => {
      const existing = await Location.getForegroundPermissionsAsync();
      let status = existing.status;
      let ask = existing.canAskAgain;
      if (status !== "granted") {
        const req = await Location.requestForegroundPermissionsAsync();
        status = req.status;
        ask = req.canAskAgain;
      }
      if (cancelled) return;
      setCanAskAgain(ask);
      if (status !== "granted") {
        setError("denied");
        return;
      }
      setError(null);

      subRef.current = await Location.watchPositionAsync(
        GPS_MODES[gpsMode] || GPS_MODES.high,
        (p) => {
          const acc = p.coords.accuracy ?? 20;
          setAccuracy(acc);
          const np = { lat: p.coords.latitude, lng: p.coords.longitude };
          const last = lastRef.current;
          const dist = last ? (haversineMeters(last, np) as number) : Infinity;
          const minMove = Math.max(1.5, Math.min(acc * 0.4, 6));
          if (dist > minMove) {
            const now = p.timestamp || Date.now();
            const dt = lastTimeRef.current ? (now - lastTimeRef.current) / 1000 : null;
            let spd = p.coords.speed;
            if ((spd == null || isNaN(spd)) && last && dt && dt > 0) spd = dist / dt;
            if (spd != null && !isNaN(spd)) setSpeed(spd);
            let hdg = p.coords.heading;
            if ((hdg == null || isNaN(hdg) || hdg < 0) && last) hdg = bearingDeg(last, np);
            if (hdg != null && !isNaN(hdg) && hdg >= 0) setHeading(hdg);
            lastRef.current = np;
            lastTimeRef.current = now;
            setPos(np);
          } else if (dist < 0.5 && lastTimeRef.current && (p.timestamp || Date.now()) - lastTimeRef.current > 4000) {
            setSpeed(0);
          }
        }
      );
    })().catch(() => setError("unavailable"));

    return () => {
      cancelled = true;
      subRef.current?.remove();
      subRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, permTick, gpsMode]);

  const quality = accuracy == null ? null : accuracy <= 8 ? "GOOD" : accuracy <= 15 ? "FAIR" : "POOR";
  return { pos, accuracy, quality, error, speed, heading, canAskAgain, requestAgain };
}
