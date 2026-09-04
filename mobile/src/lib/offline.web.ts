// Web stub — offline tile packs are a native-only MapLibre feature.
export const offlineSupported = false;

export async function listOfflineCourseIds(): Promise<string[]> {
  return [];
}

export async function downloadCourseTiles(): Promise<void> {
  throw new Error("Offline maps are only available in the mobile app.");
}

export async function deleteCourseTiles(): Promise<void> {
  // no-op on web
}

export async function getOfflineUsage(): Promise<{ bytes: number; count: number }> {
  return { bytes: 0, count: 0 };
}

export async function clearAllOffline(): Promise<void> {
  // no-op on web
}
