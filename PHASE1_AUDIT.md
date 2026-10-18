# Source audit and implementation roadmap — 18 October 2026

## Baseline inspected before source changes

`SmartGolfGPS` at `67cb466` is the mobile upgrade target. `mobile/app.json` declares `com.emergent.smartgolfgps.ix61xw`, matching the supplied v1.0.5 APK (versionCode 113). It uses Expo 54, React Native 0.81.5, React 19.1, TypeScript, Expo Router and MapLibre React Native 11.3.8. The repository has a Yarn 1 lockfile and no checked-in Android native directory, EAS configuration or owner release signing configuration.

`Caddie-GPS-Pro` at `85814f6` contains an earlier React web/FastAPI application and no Android source tree. It is a reference, not the application to replace or merge wholesale.

Storage in the existing mobile app is AsyncStorage with an existing JSON wrapper, SecureStore for activation, `sgc_*` cache snapshots, `sg_active_round`, background path buffering and pin/settings keys. The server uses MongoDB via Motor. No deployed database was accessed, and no records, cache keys or activation values were migrated/deleted. The new standalone Java/Room foundation from the previous turn is a separate artifact, not this upgrade.

## Existing code paths (runtime status not yet established)

- Foreground GPS modes and Expo background location task, location permission UI.
- MapLibre maps, manual hole controls, point targets/pins, arcs, layup markers and a course editor with polygons.
- Backend rounds, scores, putts, penalties, FIR/GIR, shots, bag, statistics, weather/elevation and streaming caddie routes.
- Local read caching and MapLibre offline packs. Current score/shot writes are server dependent; failed path uploads can be lost.
- Device activation/trial gate. This is not Google Play Billing or verified subscription entitlement handling.

## Priority findings

1. **Fabricated geometry:** create/read/backfill/relocation paths synthesize playing geometry around a course pin. Moving a pin does not map actual holes. Existing generated records must remain stored but must not become verified playing data.
2. **Invented map surfaces:** GolfMap draws a thick tee-to-green corridor as a fairway and a circular green pad, independent of actual boundaries.
3. **Misleading trust labels:** `mapped` is automatically applied on save and displayed as HIGH/surveyed; a geocoded simulated course is displayed as MEDIUM accuracy. Neither establishes survey accuracy or boundary review.
4. **GPS lifetime:** no stale-fix expiry, missing accuracy is replaced with 20 m, jumps are accepted, disabling/restarting leaves filter refs behind, and a watcher resolving after cleanup can leak.
5. **Navigation:** nearest tee/green suggestion has no sustained evidence, corridor/ambiguity check or persistent manual override. The UI falls back to the tee and silently enters manual ball mode when GPS is absent.
6. **Map licensing:** offline packs use a public Esri imagery endpoint without a configured offline-rights agreement, and native maps disable attribution. Provider licensing must gate downloads.
7. **Production services:** authentication/ownership, multi-device conflict handling, Room/SQLite migration, Play Billing verification and release signing need further implementation/configuration.

## Incremental roadmap

1. Preserve the existing app/storage contract. Add pure, tested navigation/location/geometry policy modules. Expire stale GPS, reject bad fixes, smooth conservatively and clean up async watchers. Remove invented surfaces. Add conservative reviewed-hole selection with manual override and native camera fitting. Require documented mapping review for playing distances and automatic navigation.
2. Stop generating new non-demo geometry on the server and stop write-on-read/backfill. Add optional provenance/review metadata without reclassifying legacy data. Keep course editor preview/editing and existing records.
3. Configure licensed satellite/attribution/offline permission, validate imported boundaries, complete course review workflow, field-test adjacent holes and camera behavior.
4. Introduce transactional local round/score/shot storage with an explicit migration of existing AsyncStorage data, then an idempotent outbox and conflict-safe server API. Add Stableford and scorecard PDF without changing existing score meanings.
5. Add Play products/offers and authenticated backend verification, signed bounded offline grants and restoration. Preserve existing purchased activation until an explicit entitlement migration is tested.
6. Validate builds and field behavior. Use a separate debug package for test installs; retain the original production application ID. Signed upgrades require the original signing lineage and a versionCode greater than the installed app.

No real course coordinates, mapping license, backend deployment configuration or original signing keys have been supplied. Test fixtures must be synthetic, labeled and confined to tests; field accuracy and production readiness cannot be claimed from compilation alone.
