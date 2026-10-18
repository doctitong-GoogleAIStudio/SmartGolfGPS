import { useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import type { LatLng } from "@/src/lib/geo";
import { LocationQualityFilter, usableFix, type NavigationFix } from "@/src/lib/gpsQuality";
import { useSettings } from "@/src/context/SettingsContext";

const GPS_MODES: Record<string, Location.LocationOptions> = {
  high: { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 0 },
  balanced: { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 0 },
  saver: { accuracy: Location.Accuracy.High, timeInterval: 8000, distanceInterval: 0 },
};
export type GpsError = "denied" | "unavailable" | "stale" | "poor" | null;
export type GpsState = {
  pos: LatLng | null; accuracy: number | null; quality: "GOOD" | "FAIR" | "POOR" | null;
  error: GpsError; speed: number | null; heading: number | null; canAskAgain: boolean;
  timestamp: number | null; mocked: boolean; requestAgain: () => Promise<void>;
};
export function useGPS(enabled = true): GpsState {
  const { settings } = useSettings();
  const gpsMode = settings.gpsMode || "high";
  const [fix, setFix] = useState<NavigationFix | null>(null);
  const fixRef = useRef<NavigationFix | null>(null);
  const [error, setError] = useState<GpsError>(null);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [permissionAttempt, setPermissionAttempt] = useState(0);
  const requestAgain = async () => { setPermissionAttempt((n) => n + 1); };
  useEffect(() => {
    let cancelled = false;
    let watcher: Location.LocationSubscription | undefined;
    const filter = new LocationQualityFilter();
    const publish = (next: NavigationFix | null) => { fixRef.current = next;setFix(next); };
    publish(null);setError(null);
    if (!enabled) return;
    const expire = setInterval(() => {
      if (fixRef.current && !usableFix(fixRef.current, performance.now())) { publish(null);setError("stale"); }
    }, 1000);
    (async () => {
      let permission = await Location.getForegroundPermissionsAsync();
      if (cancelled) return;
      if (permission.status !== "granted") permission = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      setCanAskAgain(permission.canAskAgain);
      if (permission.status !== "granted") { setError("denied");return; }
      const created = await Location.watchPositionAsync(GPS_MODES[gpsMode] || GPS_MODES.high, (location) => {
        if (cancelled) return;
        const accepted = filter.accept({ point: { lat: location.coords.latitude, lng: location.coords.longitude }, accuracy: location.coords.accuracy,
          timestamp: location.timestamp, mocked: location.mocked, speed: location.coords.speed, heading: location.coords.heading }, Date.now(), performance.now());
        if (accepted) { publish(accepted);setError(null); }
        else if (!usableFix(fixRef.current, performance.now())) { publish(null);setError("poor"); }
      }, () => { if (!cancelled) { publish(null);setError("unavailable"); } });
      // Native registration may resolve after unmount or a mode change.
      if (cancelled) created.remove();else watcher = created;
    })().catch(() => { if (!cancelled) { publish(null);setError("unavailable"); } });
    return () => { cancelled = true;clearInterval(expire);watcher?.remove(); };
  }, [enabled, permissionAttempt, gpsMode]);
  const accuracy = fix?.accuracy ?? null;
  return { pos: fix?.point ?? null, accuracy, quality: accuracy == null ? null : accuracy <= 8 ? "GOOD" : accuracy <= 15 ? "FAIR" : "POOR",
    error, speed: fix?.speed ?? null, heading: fix?.heading ?? null, timestamp: fix?.timestamp ?? null, mocked: fix?.mocked ?? false, canAskAgain, requestAgain };
}
