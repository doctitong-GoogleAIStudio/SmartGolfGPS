# Building and deploying the Phase 1 increment

This is an incremental upgrade of SmartGolfGPS commit `67cb466`, not a replacement application. The original production package remains `com.emergent.smartgolfgps.ix61xw`; the authenticated-connection increment uses version 1.1.1/code 115 (the earlier Phase 1 build used 1.1.0/code 114). See `BACKEND_INTEGRATION.md` for subsequent Cloud/database setup and the connection screen. No installed production application was modified during development.

## Local development

Use Node 20.19 or newer supported by Expo 54, JDK 17 or a compatible JDK (this build used Temurin 21), the Android SDK, and Yarn 1.22.22. On Windows use a short workspace path, for example `C:\dev\golf`; native dependency paths can exceed Windows path limits. Follow the Android/Expo versions in the lockfile rather than independently updating native packages.

From `mobile`, run `yarn install --frozen-lockfile`, `yarn test:navigation`, and `yarn tsc --noEmit`. From the repository root run `python -m unittest discover -s backend/tests -p test_geometry_preservation_unit.py -v`. The Python unit tests extract the actual source functions without connecting to MongoDB. Do not launch the legacy server against production to run tests.

Copy the blank `mobile/.env.example` to your local environment file. Set `EXPO_PUBLIC_API_URL` only after the Laravel staging API implements the contract and authentication integration is completed. The proposed `https://aivicventures.com/api/golf/v1` is not deployed. Expo public environment variables are embedded in the application: never put passwords or service secrets in them.

Supply a licensed raster URL template, attribution and license reference for satellite imagery. Offline downloads additionally require explicit provider permission and `EXPO_PUBLIC_IMAGERY_OFFLINE_ALLOWED=true`. Without these settings the native map intentionally uses a blank background. Course geometry needs real coordinates and a responsible mapping review before playing distances are displayed. Synthetic geometry exists only in automated tests.

## Standalone Android test variant

Set `SMART_GOLF_TEST_BUILD=1` before `npx expo prebuild --platform android --no-install`, then run `android/gradlew -p android :app:assemblePhase1 -PreactNativeArchitectures=arm64-v8a` (use `gradlew.bat` on Windows). Configure `android/local.properties` with the local SDK path. Set TEMP/TMP to a writable short path if required by the environment.

The `phase1` variant bundles JavaScript/Hermes, uses the debug certificate, and has the separate application ID `com.emergent.smartgolfgps.ix61xw.phase1`. It is an ARM64 test installation, not an update to the installed production app. Existing app data stays in the original package; it is not automatically copied into the test package. Existing activation/account flows still apply. Do not distribute this certificate as an owner release.

## Owner-signed release

Unset `SMART_GOLF_TEST_BUILD` and regenerate Android with `npx expo prebuild --platform android --clean --no-install` when switching from the isolated test configuration. The Android directory is generated and ignored: preserve any private owner configuration outside it before clean regeneration. Confirm the application ID is the original production package. The signing plugin removes Expo's default debug signing from the release build and refuses release packaging when the original owner signing configuration is absent. Do not generate a replacement owner key.

Privately configure ignored `android/owner-signing.properties` using the original keystore location and the standard properties `storeFile`, `storePassword`, `keyAlias`, and `keyPassword`. Keep this file and all keystores outside source control and delivered archives. The store path is resolved relative to the Android directory unless absolute. Use the existing Play App Signing/upload-key lineage and confirm the installed/Play versionCode before choosing the release version. Then build `:app:bundleRelease`. No owner-signed AAB is included because the original signing configuration was not supplied.

## Deployment gates and remaining work

1. Implement and validate the proposed Laravel API contract in staging, including authenticated user ownership and authorized course review. Add the mobile login/token flow; the request layer alone does not complete authentication.
2. Migrate score, editor and shot writes to transactional local storage, revisions and an idempotent outbox before enforcing the production synchronization contract. The current client is not fully offline-first. Background path retries are improved, but the legacy queue is not a transactional, round-scoped database; foreground unsent points remain in memory.
3. Validate real licensed course data and imagery, then test permissions, battery behavior, stale GPS, adjacent-hole transitions, map camera and scoring on devices outdoors. Compilation and synthetic tests do not establish field accuracy.
4. Implement remaining Stableford/PDF/dashboard work, shot correction, reliable provider integrations, Play Billing and backend purchase verification, and the approved data migration/retention policies. Existing activation is preserved, not replaced with a subscription implementation.
5. Exercise upgrades and rollback using copies of representative existing local data, then complete signed release/device and Play testing. No production-ready or eight-phase completion claim is made by this increment.
