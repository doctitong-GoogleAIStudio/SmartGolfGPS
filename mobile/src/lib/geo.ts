const R = 6371000;

export type LatLng = { lat: number; lng: number };

export function haversineMeters(a?: LatLng | null, b?: LatLng | null): number | null {
  if (!a || !b) return null;
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dp = ((b.lat - a.lat) * Math.PI) / 180;
  const dl = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function bearingDeg(a: LatLng, b: LatLng): number {
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dl = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export const mToYd = (m: number) => m * 1.0936133;
export const mToFt = (m: number) => m * 3.28084;

export function fmtDist(meters: number | null | undefined, unit = "yd"): string {
  if (meters == null) return "--";
  return String(unit === "yd" ? Math.round(mToYd(meters)) : Math.round(meters));
}

export const unitLabel = (unit: string) => (unit === "yd" ? "YD" : "M");

export function movedMoreThan(a: LatLng | null | undefined, b: LatLng | null | undefined, meters: number): boolean {
  if (!a || !b) return true;
  return (haversineMeters(a, b) as number) > meters;
}

// Tile-download bounds [west, south, east, north] tight to a course's mapped
// holes (tees, greens, hazards), padded ~15%. Falls back to a ~2.2 km box
// around the centroid when the course has no holes. Pure JS — safe on web.
export function boundsForCourse(course: any, fallbackLat: number, fallbackLng: number): [number, number, number, number] {
  const pts: LatLng[] = [];
  (course?.holes || []).forEach((h: any) => {
    [h.tee, h.greenFront, h.greenCenter, h.greenBack].forEach((p: LatLng) => {
      if (p && p.lat != null && p.lng != null) pts.push(p);
    });
    (h.hazards || []).forEach((hz: any) => {
      if (hz && hz.lat != null && hz.lng != null) pts.push({ lat: hz.lat, lng: hz.lng });
    });
  });
  if (pts.length < 2) {
    const d = 0.02;
    const flat = Number.isFinite(fallbackLat) ? fallbackLat : 12.6;
    const flng = Number.isFinite(fallbackLng) ? fallbackLng : 122.0;
    return [flng - d, flat - d, flng + d, flat + d];
  }
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  pts.forEach((p) => { w = Math.min(w, p.lng); e = Math.max(e, p.lng); s = Math.min(s, p.lat); n = Math.max(n, p.lat); });
  const padLat = (n - s) * 0.15 + 0.002;
  const padLng = (e - w) * 0.15 + 0.002;
  return [w - padLng, s - padLat, e + padLng, n + padLat];
}
