# MapTiler imagery test — Smart Golf GPS 1.1.2

This increment uses MapTiler Satellite Hybrid v4 through its 256-pixel raster tile API. Its public client key is held in ignored mobile/.env.local and bundled only into the test APK. Do not put an Atlas password, golf-account password, or server credential in imagery configuration. This APK intentionally exposes its public map key to clients and consumes that account's tile quota.

The MapTiler Free account is for testing/prototyping and is not the commercial subscription for a public paid app. No paid plan was purchased. The standard source is configured for online display; offline packs and tracing are disabled. The course editor keeps its independent geometry editing tools but does not show this imagery as a tracing background. Surveyed or separately licensed coordinates are still needed for course boundaries.

All MapTiler map surfaces show the official MapTiler logo and clickable MapTiler/OpenStreetMap attribution. On the play screen credits are part of the bottom controls so the score/club sheet does not hide them. Satellite view is the initial map view when imagery is configured; GOLF switches to the plain geometry view. Existing selected-hole geometry/provenance rules remain in effect. Native runtime layout and tile rendering require phone acceptance.

Validation: 45 mobile production-module tests passed; TypeScript passed. The provider's TileJSON returned HTTP 200; a city-area test tile returned HTTP 200 image/jpeg and decoded as 256x256. This checks service access, not course mapping, coverage freshness, or GPS accuracy. The prior 20 backend tests remain unchanged. No imagery tiles were packaged as offline data.

The unchanged golf API is https://smartgolfgps-production-bxords.laravel.cloud/api . First sign-in and removal of the one-time GOLF_BOOTSTRAP_PASSWORD from Cloud still need owner acceptance. Keep MONGO_URL and DB_NAME private.

Provider references:
- https://docs.maptiler.com/guides/map-design/attribution/add-attribution/
- https://www.maptiler.com/terms/cloud/
- https://www.maptiler.com/cloud/pricing/

Owner build configuration (replace only the public client-key placeholder privately):

```dotenv
EXPO_PUBLIC_IMAGERY_TILE_URL=https://api.maptiler.com/maps/hybrid-v4/256/{z}/{x}/{y}.jpg?key=PUBLIC_CLIENT_KEY
EXPO_PUBLIC_IMAGERY_ATTRIBUTION=<a href="https://www.maptiler.com/copyright/">© MapTiler</a> <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>
EXPO_PUBLIC_IMAGERY_LICENSE_REFERENCE=https://www.maptiler.com/terms/cloud/ — Free plan: testing/prototype only
EXPO_PUBLIC_IMAGERY_OFFLINE_ALLOWED=false
EXPO_PUBLIC_IMAGERY_TRACING_ALLOWED=false
```