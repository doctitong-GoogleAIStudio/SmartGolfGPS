import { useEffect, useRef, useState } from "react";
import { haversineMeters, bearingDeg } from "../lib/geo";

export function useGPS(enabled = true) {
  const [pos, setPos] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [speed, setSpeed] = useState(null);
  const [heading, setHeading] = useState(null);
  const [error, setError] = useState(null);
  const lastRef = useRef(null);
  const lastTimeRef = useRef(null);

  useEffect(() => {
    if (!enabled) { setPos(null); setSpeed(null); setHeading(null); return; }
    if (!navigator.geolocation) {
      setError("unsupported");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setError(null);
        setAccuracy(p.coords.accuracy);
        const np = { lat: p.coords.latitude, lng: p.coords.longitude };
        const last = lastRef.current;
        const dist = last ? haversineMeters(last, np) : Infinity;
        // jitter filter: ignore noise smaller than accuracy-scaled threshold
        const minMove = Math.max(1.5, Math.min(p.coords.accuracy * 0.4, 6));
        if (dist > minMove) {
          const now = p.timestamp || Date.now();
          const dt = lastTimeRef.current ? (now - lastTimeRef.current) / 1000 : null;
          let spd = p.coords.speed;
          if ((spd == null || isNaN(spd)) && last && dt > 0) spd = dist / dt;
          if (spd != null && !isNaN(spd)) setSpeed(spd);
          let hdg = p.coords.heading;
          if ((hdg == null || isNaN(hdg)) && last) hdg = bearingDeg(last, np);
          if (hdg != null && !isNaN(hdg)) setHeading(hdg);
          lastRef.current = np;
          lastTimeRef.current = now;
          setPos(np);
        } else if (dist < 0.5 && lastTimeRef.current && (p.timestamp || Date.now()) - lastTimeRef.current > 4000) {
          setSpeed(0);
        }
      },
      (err) => setError(err.code === 1 ? "denied" : "unavailable"),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  const quality = accuracy == null ? null : accuracy <= 8 ? "GOOD" : accuracy <= 15 ? "FAIR" : "POOR";
  return { pos, accuracy, quality, error, speed, heading };
}
