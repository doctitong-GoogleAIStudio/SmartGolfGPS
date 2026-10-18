/** Configure a provider with rights for this app. Public availability is not a license. */
const tiles = process.env.EXPO_PUBLIC_IMAGERY_TILE_URL || "";
const attribution = process.env.EXPO_PUBLIC_IMAGERY_ATTRIBUTION || "";
const licenseReference = process.env.EXPO_PUBLIC_IMAGERY_LICENSE_REFERENCE || "";
export const imageryConfigured = tiles.startsWith("https://") && ["{z}", "{x}", "{y}"].every((s) => tiles.includes(s)) && !!attribution.trim() && !!licenseReference.trim();
export const imageryOfflineAllowed = imageryConfigured && process.env.EXPO_PUBLIC_IMAGERY_OFFLINE_ALLOWED === "true";
export function imageryStyle(): any {
  return { version: 8, sources: imageryConfigured ? { imagery: { type: "raster", tiles: [tiles], tileSize: 256, maxzoom: 19, attribution } } : {},
    layers: [{ id: "background", type: "background", paint: { "background-color": "#24422E" } }, ...(imageryConfigured ? [{ id: "imagery", type: "raster", source: "imagery" }] : [])] };
}
