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
