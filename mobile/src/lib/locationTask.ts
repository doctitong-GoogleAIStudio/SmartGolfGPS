import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { storage } from "@/src/utils/storage";

export const BG_LOCATION_TASK = "sg-background-location";

// Background task MUST be defined at module scope (native only). It buffers
// points into AsyncStorage; the Rangefinder flushes them to the backend on
// resume. NOTE: background updates only run in a native build (not Expo Go / web).
if (Platform.OS !== "web") {
  TaskManager.defineTask(BG_LOCATION_TASK, async ({ data, error }: any) => {
    if (error || !data) return;
    const locs: Location.LocationObject[] = data.locations || [];
    if (!locs.length) return;
    try {
      const raw = await storage.getItem<string>("sg_bg_path", "");
      const buf: { lat: number; lng: number; t: number }[] = raw ? JSON.parse(raw) : [];
      for (const l of locs) {
        buf.push({ lat: l.coords.latitude, lng: l.coords.longitude, t: l.timestamp });
      }
      await storage.setItem("sg_bg_path", JSON.stringify(buf.slice(-500)));
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

export async function drainBackgroundPath(): Promise<{ lat: number; lng: number; t: number }[]> {
  const raw = await storage.getItem<string>("sg_bg_path", "");
  if (!raw) return [];
  await storage.removeItem("sg_bg_path");
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
