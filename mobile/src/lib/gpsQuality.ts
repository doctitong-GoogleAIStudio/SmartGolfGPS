import { haversineMeters, type LatLng } from "./geo";
export const GPS_STALE_MS = 15_000;
export type LocationSample = { point: LatLng; accuracy: number | null; timestamp: number; mocked?: boolean; speed?: number | null; heading?: number | null };
export type NavigationFix = { point: LatLng; accuracy: number; timestamp: number; receivedAt: number; mocked: boolean; speed: number | null; heading: number | null };
export function validPoint(p: any): p is LatLng {
  return !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
}
/** Android accuracy estimates are not guarantees. Monotonic time expires held fixes. */
export class LocationQualityFilter {
  private last: NavigationFix | null = null;
  accept(sample: LocationSample, wallNow: number, monotonicNow: number): NavigationFix | null {
    if (!validPoint(sample.point) || !Number.isFinite(sample.timestamp) || sample.timestamp > wallNow + 1000 || wallNow - sample.timestamp > GPS_STALE_MS) return null;
    if (sample.accuracy == null || !Number.isFinite(sample.accuracy) || sample.accuracy <= 0 || sample.accuracy > 35) return null;
    const old = this.last;
    if (old && sample.timestamp <= old.timestamp) return null;
    let point = sample.point, accuracy = sample.accuracy;
    if (old && monotonicNow - old.receivedAt <= GPS_STALE_MS) {
      const dt = (sample.timestamp - old.timestamp) / 1000;
      const distance = haversineMeters(old.point, point)!;
      if (distance > 12 * dt + old.accuracy + accuracy) return null;
      const alpha = Math.max(0.15, Math.min(0.85, dt / 6)) * Math.min(1, old.accuracy / accuracy);
      const dl = ((point.lng - old.point.lng + 540) % 360) - 180;
      point = { lat: old.point.lat + alpha * (point.lat - old.point.lat), lng: ((old.point.lng + alpha * dl + 540) % 360) - 180 };
      accuracy = Math.max(accuracy, haversineMeters(point, sample.point)!);
    }
    if (accuracy > 35) return null;
    this.last = { point, accuracy, timestamp: sample.timestamp, receivedAt: monotonicNow, mocked: !!sample.mocked,
      speed: sample.speed != null && Number.isFinite(sample.speed) && sample.speed >= 0 ? sample.speed : null,
      heading: sample.heading != null && Number.isFinite(sample.heading) && sample.heading >= 0 && sample.heading < 360 ? sample.heading : null };
    return this.last;
  }
}
export function usableFix(fix: NavigationFix | null, monotonicNow: number): fix is NavigationFix {
  return !!fix && monotonicNow >= fix.receivedAt && monotonicNow - fix.receivedAt <= GPS_STALE_MS && fix.accuracy <= 35;
}
