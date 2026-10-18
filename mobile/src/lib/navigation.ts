import { haversineMeters, type LatLng } from "./geo";
import { validPoint } from "./gpsQuality";

export type HolePolygon = { type: string; points: LatLng[] };
export type PlayingHole = { holeNumber: number; tee?: LatLng; greenFront?: LatLng; greenCenter?: LatLng; greenBack?: LatLng; polygons?: HolePolygon[]; hazards?: any[] };
const R = 6371000;
function xy(origin: LatLng, p: LatLng): [number, number] {
  return [(((p.lng - origin.lng + 540) % 360) - 180) * Math.PI / 180 * R * Math.cos(origin.lat * Math.PI / 180), (p.lat - origin.lat) * Math.PI / 180 * R];
}
const cross = (a: number[], b: number[]) => a[0] * b[1] - a[1] * b[0];
const minus = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1]];
function segmentDistance(a: number[], b: number[]) {
  const d = minus(b, a), n = d[0] ** 2 + d[1] ** 2;
  const t = n ? Math.max(0, Math.min(1, -(a[0] * d[0] + a[1] * d[1]) / n)) : 0;
  return Math.hypot(a[0] + t * d[0], a[1] + t * d[1]);
}
export function openRing(points: LatLng[]): LatLng[] {
  return points.length > 1 && points[0].lat === points[points.length - 1].lat && points[0].lng === points[points.length - 1].lng ? points.slice(0, -1) : points;
}
const ringCache = new WeakMap<LatLng[], boolean>();
// Course/editor point arrays are immutable; cache expensive topology checks per array.
export function validRing(points: LatLng[]): boolean {
  if (!Array.isArray(points)) return false;
  const cached = ringCache.get(points);if (cached != null) return cached;
  const valid = validateRing(points);ringCache.set(points, valid);return valid;
}
function validateRing(points: LatLng[]): boolean {
  if (!Array.isArray(points) || points.length < 3 || points.length > 2001 || !points.every(validPoint)) return false;
  const ring = openRing(points);if (ring.length < 3) return false;
  const pts = ring.map((p) => xy(ring[0], p));let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], d = minus(b, a);
    if (Math.hypot(...d) < 0.05 || Math.hypot(...a) > 2500) return false;
    area += cross(a, b);
    for (let j = i + 1; j < pts.length; j++) {
      if (j === i + 1 || (i === 0 && j === pts.length - 1)) continue;
      const c = pts[j], e = pts[(j + 1) % pts.length], v = minus(e, c), denom = cross(d, v), ca = minus(c, a);
      if (Math.abs(denom) < 1e-8) {
        if (Math.abs(cross(ca, d)) < 1e-8 && Math.max(Math.min(a[0], b[0]), Math.min(c[0], e[0])) <= Math.min(Math.max(a[0], b[0]), Math.max(c[0], e[0])) && Math.max(Math.min(a[1], b[1]), Math.min(c[1], e[1])) <= Math.min(Math.max(a[1], b[1]), Math.max(c[1], e[1]))) return false;
      } else {
        const t = cross(ca, v) / denom, u = cross(ca, d) / denom;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return false;
      }
    }
  }
  return Math.abs(area) >= 2;
}
export function containsPoint(points: LatLng[], p: LatLng): boolean {
  const ring = openRing(points);let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = xy(p, ring[i]), b = xy(p, ring[j]);if (segmentDistance(a, b) < 0.01) return true;
    if ((a[1] > 0) !== (b[1] > 0) && (b[0] - a[0]) * -a[1] / (b[1] - a[1]) + a[0] > 0) inside = !inside;
  }
  return inside;
}
export function polygonDistance(p: LatLng, points: LatLng[]): number {
  if (containsPoint(points, p)) return 0;
  const ring = openRing(points);return Math.min(...ring.map((a, i) => segmentDistance(xy(p, a), xy(p, ring[(i + 1) % ring.length]))));
}
export function reviewedCourse(course: any): boolean {
  const r = course?.mappingReview;
  return course?.layoutSource === "mapped" && !course?.isDemo && !!r && [r.reviewer, r.source, r.license].every((s) => typeof s === "string" && s.trim().length > 0) && Number.isFinite(Date.parse(r.reviewedAt)) && Date.parse(r.reviewedAt) <= Date.now() + 300000;
}
export function usableHole(course: any, hole: PlayingHole | null): hole is PlayingHole {
  if (!reviewedCourse(course) || !hole || !validPoint(hole.tee) || !validPoint(hole.greenCenter)) return false;
  const length = haversineMeters(hole.tee, hole.greenCenter)!;
  if (length < 10 || length > 2000) return false;
  if ([hole.greenFront, hole.greenBack].some((p) => p != null && (!validPoint(p) || haversineMeters(hole.tee, p)! > 2500))) return false;
  if ((hole.hazards || []).some((h) => !validPoint({ lat: h.lat, lng: h.lng }) || haversineMeters(hole.tee, h)! > 2500 || h.carryLat != null && !validPoint({ lat: h.carryLat, lng: h.carryLng }))) return false;
  for (const polygon of hole.polygons || []) {
    if (polygon.type === "CART_PATH") continue;
    if (!validRing(polygon.points) || polygon.points.some((p) => haversineMeters(hole.tee, p)! > 2500)) return false;
    if (polygon.type === "GREEN" && !containsPoint(polygon.points, hole.greenCenter)) return false;
  }
  return true;
}
/** Front/back are intersections toward the supplied center; point-only legacy mapping stays explicit. */
export function greenDistances(player: LatLng, hole: PlayingHole) {
  const center = hole.greenCenter;if (!validPoint(center)) return null;
  const polygon = hole.polygons?.find((p) => p.type === "GREEN" && validRing(p.points));
  if (!polygon) return { front: haversineMeters(player, hole.greenFront), center: haversineMeters(player, center), back: haversineMeters(player, hole.greenBack), source: "mapped points" };
  const ring = openRing(polygon.points), c = xy(player, center), length = Math.hypot(...c);
  if (length < 0.05) return { front: 0, center: 0, back: Math.min(...ring.map((p, i) => segmentDistance(xy(player, p), xy(player, ring[(i + 1) % ring.length])))), source: "green boundary" };
  const u = [c[0] / length, c[1] / length], intersections: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = xy(player, ring[i]), b = xy(player, ring[(i + 1) % ring.length]), v = minus(b, a), den = cross(u, v);
    if (Math.abs(den) < 1e-9) continue;
    const t = cross(a, v) / den, s = cross(a, u) / den;
    if (t >= 0 && s >= -1e-9 && s <= 1 + 1e-9) intersections.push(t);
  }
  if (!intersections.length) return null;
  return { front: containsPoint(ring, player) ? 0 : Math.min(...intersections), center: haversineMeters(player, center), back: Math.max(...intersections), source: "green boundary" };
}

export class HoleDetector {
  private candidate = -1;private count = 0;private since = 0;private lastTime = -1;
  reset() { this.candidate = -1;this.count = 0;this.lastTime = -1; }
  update(course: any, selected: number, position: LatLng, accuracy: number, monotonicNow: number, manual: boolean): number {
    if (manual || !reviewedCourse(course) || !validPoint(position) || !Number.isFinite(accuracy) || accuracy <= 0 || accuracy > 20 || monotonicNow <= this.lastTime) { this.candidate = -1;this.count = 0;return selected; }
    if (this.lastTime >= 0 && monotonicNow - this.lastTime > 15000) { this.candidate = -1;this.count = 0; }
    this.lastTime = monotonicNow;
    const choices = (course.holes || []).flatMap((h: PlayingHole, index: number) => {
      if (!usableHole(course, h)) return [];
      const fairways = (h.polygons || []).filter((p) => p.type === "FAIRWAY" && validRing(p.points));
      return fairways.length ? [{ index, distance: Math.min(...fairways.map((p) => polygonDistance(position, p.points))) }] : [];
    }).sort((a: any, b: any) => a.distance - b.distance);
    const best = choices[0], second = choices[1], current = choices.find((c: any) => c.index === selected);
    if (!best || !current || best.index === selected || best.distance > 60 || second && second.distance - best.distance < Math.max(12, accuracy) || current.distance - best.distance < Math.max(20, accuracy * 2)) { this.candidate = -1;this.count = 0;return selected; }
    if (this.candidate !== best.index) { this.candidate = best.index;this.count = 1;this.since = monotonicNow; } else this.count++;
    if (this.count >= 3 && monotonicNow - this.since >= 10000) { this.reset();return best.index; }
    return selected;
  }
}
