import { BackgroundPathBuffer, type PathPoint } from "@/src/lib/pathBuffer";
import { validPoint } from "@/src/lib/gpsQuality";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { storage } from "@/src/utils/storage";
import { captureStorageKey } from "./storageScope";
import { serviceSession } from "./serviceSession";

export const BG_LOCATION_TASK = "sg-background-location";
const buffers = new Map<string, BackgroundPathBuffer>();
function backgroundBuffer() {
  const key = captureStorageKey("sg_bg_path");
  if (!buffers.has(key)) buffers.set(key, new BackgroundPathBuffer(storage, key));
  return buffers.get(key)!;
}

// Background task MUST be defined at module scope (native only). It buffers
// points into AsyncStorage; the Rangefinder flushes them to the backend on
// resume. NOTE: background updates only run in a native build (not Expo Go / web).
if (Platform.OS !== "web") {
  TaskManager.defineTask(BG_LOCATION_TASK, async ({ data, error }: any) => {
    if (error || !data) return;
    const locs: Location.LocationObject[] = data.locations || [];
    if (!locs.length) return;
    try {
      await serviceSession.restore();
      if (serviceSession.session && !serviceSession.token) return;
      const buffer = backgroundBuffer();
      const points: PathPoint[] = locs.filter((l) => Number.isFinite(l.timestamp) && l.timestamp <= Date.now() + 1000 && validPoint({ lat: l.coords.latitude, lng: l.coords.longitude }) && l.coords.accuracy != null && l.coords.accuracy > 0 && l.coords.accuracy <= 35)
        .map((l) => ({ lat: l.coords.latitude, lng: l.coords.longitude, t: l.timestamp }));
      if (points.length) await buffer.append(points);
    } catch {
      // silent
    }
  });
}

export async function startBackgroundTracking() {
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => false);
    if (started) return;
    await Location.startLocationUpdatesAsync(BG_LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 3000,
      distanceInterval: 3,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "Smart Golf GPS",
        notificationBody: "Tracking your round in the background.",
        notificationColor: "#14532D",
      },
    });
  } catch {
    // background unsupported (Expo Go / web) — foreground still works
  }
}

export async function stopBackgroundTracking() {
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => false);
    if (started) await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK);
  } catch {
    // ignore
  }
}

// Compatibility name: peek only; remove an acknowledged batch after successful upload.
export async function drainBackgroundPath(): Promise<PathPoint[]> { return backgroundBuffer().peek(); }
export async function acknowledgeBackgroundPath(points: PathPoint[]): Promise<void> { return backgroundBuffer().acknowledge(points); }
