# Phase 1 validation — 18 October 2026

## Passed

- 33 Node tests against compiled production TypeScript policy modules: geodesic distance, units, GPS quality/smoothing/expiry, stationary refresh, out-of-order and simulated fixes, mapping review/topology, green intersections, conservative hole transitions/manual override, API URL policy, nondestructive path retry buffering, and imagery configuration/offline rights.
- Four Python unit tests against the actual legacy backend function source: course reads/backfill do not write or generate geometry; relocation and updates preserve existing hole coordinates and unknown metadata. These are isolated unit tests, not database integration tests.
- Full mobile TypeScript compilation (`tsc --noEmit`). Targeted ESLint on the new navigation/GPS/buffer/config modules and GPS hook.
- Frozen Yarn 1 dependency installation and the existing preinstall guard. Explicit Babel peer dependencies and broken baseline lock entries were repaired.
- Android Expo/Hermes bundle export of the actual mobile source.
- Native Gradle `:app:assemblePhase1` succeeded. The standalone APK contains bundled Hermes bytecode and ARM64 native libraries; `apksigner verify` passed (v2), and `zipalign -c -P 16 4` passed. Package metadata confirms version 1.1.0/code 114, minimum Android 7/API 24, target API 36, and isolated package `com.emergent.smartgolfgps.ix61xw.phase1`.
- Formal validation of the proposed OpenAPI 3.1.1 document: 29 paths, 40 operations. This validates the specification structure, not an implemented server.

## Not established by these checks

No physical-device or outdoor GPS tests were performed. There is no measured GPS accuracy/battery result, verified real course dataset, camera/UI runtime acceptance, account/activation acceptance, upgrade migration acceptance or network-loss round recovery result. An attempted emulator setup did not provide a usable running device in this environment.

The website was read only; `/api/courses` returned 404. No Laravel source, deployed golf route, database credentials or original signing configuration was supplied. No live deployment, user-data migration, purchase verification or owner-signed release was performed.

Phase 1 improves safety and navigation policy, but does not complete every Phase 1 requirement or the eight-phase production platform. The course editor review is a mapper declaration, not independent certification. The existing backend remains a FastAPI reference; the Laravel contract is a separate implementation handoff.

The standalone test variant, if supplied alongside this report, has an isolated `.phase1` package and debug certificate. Refer to the delivery README for the native build/package verification result. It cannot upgrade the installed production package and contains no configured live golf API or licensed satellite provider.
