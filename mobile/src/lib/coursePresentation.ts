import { validPoint } from "./gpsQuality";
import { ServiceError } from "./serviceSessionCore";

/** A directory pin and empty scorecard do not constitute a hole map. */
export function courseMapStatus(course: any): "NOT MAPPED" | "SIMULATED" | "MAPPED" | "UNREVIEWED MAP" {
  const geometry = Array.isArray(course?.holes) && course.holes.some((h: any) => h &&
    ([h.tee, h.greenFront, h.greenCenter, h.greenBack].some(validPoint) || h.polygons?.length || h.hazards?.length));
  if (!geometry) return "NOT MAPPED";
  if (course?.isDemo || course?.layoutSource === "simulated") return "SIMULATED";
  return course?.layoutSource === "mapped" ? "MAPPED" : "UNREVIEWED MAP";
}

export function courseActionFailure(error: unknown) {
  if (error instanceof ServiceError && error.status === 401) return {
    title: "Sign in required", detail: "Sign in to your golf account, then try again. Existing device data is retained.", account: true };
  if (error instanceof ServiceError && error.status === 403) return {
    title: "Editor access required", detail: "Player accounts can browse and play courses. Course changes require an authorized editor.", account: false };
  return { title: "Course action unavailable", detail: error instanceof Error ? error.message : "Check your connection and try again.", account: false };
}
