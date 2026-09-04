import { OfflineManager } from "@maplibre/maplibre-react-native";

const ESRI_SAT =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

// Offline packs need the style as a string; reuse the same keyless Esri raster.
const OFFLINE_STYLE = JSON.stringify({
  version: 8,
  sources: { esri: { type: "raster", tiles: [ESRI_SAT], tileSize: 256, maxzoom: 19 } },
  layers: [{ id: "esri", type: "raster", source: "esri" }],
});

export const offlineSupported = true;

export async function listOfflineCourseIds(): Promise<string[]> {
  try {
    const packs = await OfflineManager.getPacks();
    return packs
      .map((p) => (p.metadata?.courseId as string) || null)
      .filter((x): x is string => !!x);
  } catch {
    return [];
  }
}

export async function downloadCourseTiles(
  courseId: string,
  name: string,
  lat: number,
  lng: number,
  onProgress?: (pct: number) => void,
): Promise<void> {
  // ~2.2 km box around the course, streets->green zoom range.
  const d = 0.02;
  const bounds: [number, number, number, number] = [lng - d, lat - d, lng + d, lat + d];
  await new Promise<void>((resolve, reject) => {
    OfflineManager.createPack(
      { mapStyle: OFFLINE_STYLE, bounds, minZoom: 12, maxZoom: 17, metadata: { courseId, name } },
      (_pack, status) => {
        const pct = Math.round(status.percentage ?? 0);
        onProgress?.(pct);
        if (status.state === "complete" || pct >= 100) resolve();
      },
      (_pack, err) => reject(new Error(err?.message || "Download failed")),
    ).catch(reject);
  });
}

export async function deleteCourseTiles(courseId: string): Promise<void> {
  const packs = await OfflineManager.getPacks();
  for (const p of packs) {
    if ((p.metadata?.courseId as string) === courseId) await OfflineManager.deletePack(p.id);
  }
}
