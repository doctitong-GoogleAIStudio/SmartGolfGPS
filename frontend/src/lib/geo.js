const R = 6371000;

export function haversineMeters(a, b) {
  if (!a || !b) return null;
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dp = ((b.lat - a.lat) * Math.PI) / 180;
  const dl = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function bearingDeg(a, b) {
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dl = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export const mToYd = (m) => m * 1.0936133;
export const mToFt = (m) => m * 3.28084;

export function fmtDist(meters, unit = "yd") {
  if (meters == null) return "--";
  return unit === "yd" ? Math.round(mToYd(meters)) : Math.round(meters);
}

export const unitLabel = (unit) => (unit === "yd" ? "YD" : "M");

export function movedMoreThan(a, b, meters) {
  if (!a || !b) return true;
  return haversineMeters(a, b) > meters;
}
