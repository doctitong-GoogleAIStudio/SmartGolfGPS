# Smart Golf GPS & AI Caddie — PRD

## Original Problem Statement
Production-quality, mobile-first PWA: GPS golf rangefinder, satellite course map, movable target flag, front/center/back green distances, hazards, elevation, plays-like distance, club profile & recommendation, shot tracking, scorecard, round history, stats, course editor, AI caddie (guardrailed: AI never calculates distances), tournament mode, offline-friendly. Deterministic Haversine math for all geo calcs.

## User Choices
- No Google Maps key → Leaflet + free Esri World Imagery satellite tiles (+ OSM standard, Esri hybrid labels)
- AI Caddie: GPT-5.4 Mini via EMERGENT_LLM_KEY (emergentintegrations, SSE streaming)
- Wind: manual input only (speed + head/tail/left/right)
- No login — single golfer, per-device/server-shared data
- Demo course: simulated coords near Apo Golf area, Davao City PH — labeled DEMO DATA

## Architecture
- Backend: FastAPI + MongoDB (motor), /api prefix. server.py holds all models/routes/seed.
  - Entities: Course (embedded Holes + Hazards), Bag (16 clubs), Settings, Round (embedded HoleScores), Shot
  - Elevation: proxied Open-Meteo elevation API (free, no key) w/ in-memory cache — GET /api/elevation
  - AI: POST /api/caddie SSE stream, gpt-5.4-mini, receives structured JSON only
  - Server-side Haversine for shot distances; demo course + default bag + settings seeded at startup
- Frontend: React 19, react-leaflet 5, phosphor icons, sonner, recharts, Tailwind
  - Engines separated: lib/geo.js (Haversine/bearing/units), lib/playsLike.js, lib/clubRec.js, hooks/useGPS.js
  - Pages: Home, Rangefinder (/play), Scorecard, Caddie, Bag, More(settings), Courses, CourseEditor, StartRound, History, RoundDetail, Stats
  - Offline: service worker (shell + tile/font cache), localStorage cache for GET APIs (cachedGet), Haversine fully client-side
  - PWA: manifest.json, icons 192/512, portrait standalone
  - Design: light high-contrast outdoor theme, Anton numerals, Cabinet Grotesk/Manrope, dark green #14532D + gold #D4AF37

## Implemented (2026-06)
Phase 1: satellite map, live GPS (accuracy badge GOOD/FAIR/POOR, denied-permission fallback), manual ball placement, tap/drag target, distance line + label, yards/meters, F/C/B green distances, target cards, hazards w/ carry distances, course editor (tap-to-place tee/greens/hazards, par/hcp), PWA, offline caching, demo course.
Phase 2: elevation diff (+ plays-like), plays-like breakdown (elev/wind, toggleable), golf bag editor, smart club recommendation (confidence H/M/L), shot tracking (start/end, fairway/direction), observed club distances w/ update suggestions (trimmed mean), full scorecard (score/putts/FW/GIR/penalty, front9/back9/totals), round lifecycle (start/resume/end), round history + detail.
Phase 3: manual wind, statistics dashboard + chart, AI caddie (streaming, guardrailed), tournament mode, dev/test mode, privacy deletes.

## Not Implemented (backlog)
- P1: automatic hole suggestion by GPS proximity ("You appear to be near Hole 8")
- P1: quick long-press target (currently single tap — works)
- P2: live weather API (auto wind/temp), temperature adjustment UI (engine supports it)
- P2: IndexedDB (uses localStorage), multi-player scorecards, handicap calc
- P3: voice caddie, smartwatch, course library/sharing

## Cross-Platform: Mobile App (added 2026-06)
Expo/React Native app at /app/mobile reusing the SAME FastAPI backend (no backend changes). Full parity — all 12 screens ported:
- Screens (expo-router): index(Home), activate, (tabs)/play|score|caddie|bag|more, start-round, courses/index, courses/[id]/edit, history, rounds/[id], stats.
- Map: react-native-maps + free Esri satellite tiles on Android (mapType=none + UrlTile), Apple satellite on iOS. Web preview shows a placeholder (native-only lib) via GolfMap.web.tsx.
- GPS: expo-location foreground (jitter-filtered) + background/while-walking task (expo-task-manager) — background needs a NATIVE build.
- Shared logic ported to /app/mobile/src/lib (geo, playsLike, clubRec) + contexts (Settings, License) + hooks (useGPS). Toast via /app/mobile/src/lib/toast.ts.

### Device Activation / Licensing (mobile only, NEW)
- 7-day free trial from first launch, countdown to the minute; after expiry a full-screen Activation overlay gates the app.
- Offline device-locked codes: code = SHA-256(normalize(deviceId)+"|"+SECRET) -> first 16 hex, XXXX-XXXX-XXXX-XXXX. Same algo in app (src/lib/license.ts) and the standalone generator (/app/tools/activation-generator.html).
- Flow: show Device ID -> pay via GCash (QR at /app/mobile/assets/images/gcash-qr.png, PLACEHOLDER to replace) -> "Email Device ID" opens mail to docvincent2022@yahoo.com with Device ID + GCash ref -> owner generates code offline -> user enters code -> permanent unlock. SECRET in test_credentials.md.

### Mobile enhancements (2026-06, iteration_3 — all 4 PASS)
- GCash QR: real SmartGolf ₱1,500 GCash QR on the Activation screen (/app/mobile/assets/images/gcash-qr.png).
- Weather On Card: live wind arrow + temperature on the Rangefinder distance card when Auto Weather is on.
- Putt Reminder: leaving the green during a round without logged putts shows a prompt to log putts (0-4) -> PUT /api/rounds/{id}. GPS-dependent (needs device/native for live trigger).
- Voice Caddie: speaker button speaks the live shot summary aloud via expo-speech (TTS, hands-free, no mic; works in Expo Go).

## Test Status
iteration_1: backend 13/13 pass, web frontend 100%.
iteration_2 (mobile): 100% pass — all 12 mobile flows + backend regression (13/13). Activation verified end-to-end. Report: /app/test_reports/iteration_2.json.
iteration_3 (mobile enhancements): 4/4 PASS (GCash QR, Weather On Card, Voice Caddie, Putt Reminder). Report: /app/test_reports/iteration_3.json.

### Mobile enhancements v2 (2026-06, iteration_4)
- Course Sharing: POST /api/courses/{id}/share (idempotent 6-char code) + POST /api/courses/import (clones course incl. 18 holes, new ids, name +" (Shared)"). PUT /courses preserves shareCode on edit. Mobile Courses UI: IMPORT button + per-card SHARE (copies to clipboard). Backend 12/12 (/app/backend/tests/test_share_import.py).
- Hole Flyover: GolfMap camera sweeps tee->green on hole change (flyover/flyoverKey; native-only animation).
- Auto Putt Prompt On Hole Change: tapping next/prev hole with a scored-but-putt-less hole prompts to log putts.
- Bug fixed: Play.tsx roundScores was stale vs Score tab -> savePutts clobbered scores. Fixed by re-fetching roundScores on MAP focus + re-reading fresh scores before PUT. Verified score+putts both persist.

### Philippine Courses directory (2026-06)
- Backend: /app/backend/ph_courses.py (54 major PH courses: name, location, region, lat/lng, holeCount) served at GET /api/courses/directory. Import reuses POST /api/courses (auto-generates blank holes from holeCount).
- Mobile: app/ph-courses.tsx — searchable, region-grouped directory with one-tap ADD; entry via Courses screen "BROWSE PHILIPPINE COURSES" button. Coordinates are approximate pins; holes mapped later in the editor / on-site. Verified E2E (add Cebu Country Club).

### PH directory v2 (2026-06)
- Expanded catalog to 72 courses (added ~18 more nationwide).
- Auto par presets: create_course now generates a standard par-72 (par-36 for 9-hole) hole layout so scorecards work before mapping. Verified pars total 72.
- Nearest sort: ph-courses.tsx REGION/NEAREST toggle; NEAREST uses expo-location one-shot GPS + haversine to sort and show distance. Falls back to REGION if location denied.
- Course badges: colored initials avatar + flag mark per course (real per-course photos unavailable, so branded initials used).

### PH directory v3 (2026-06)
- Catalog expanded to 82 courses.
- Auto handicap index: create_course assigns a realistic stroke-index (unique 1..18 permutation; 1..9 for 9-hole) alongside par-72, so net scoring works before mapping. Verified unique permutation.
- Directory Map View: ph-courses LIST/MAP toggle; MAP uses react-native-maps (DirectoryMap.tsx, web stub DirectoryMap.web.tsx) plotting all courses as pins; tap a pin -> selected card with ADD.
- Distance units: directory distances shown in miles/ft when distanceUnit=yd (imperial), km/m when metric.

### PH directory v4 (2026-06)
- Catalog expanded to 98 courses (backend ph_courses.py, 11 regions).
- Region filter chips: ph-courses.tsx single horizontal scroller (All + one chip per detailed region — Metro Manila, Cavite/Laguna, Rizal, Tagaytay, Batangas, Central Luzon, Northern Luzon, Bicol, Visayas, Mindanao, Palawan); selected chip = charcoal. Filters both list & map views.
- Recently Added: courses you import persist across restarts in storage key "sg_recent_courses" (max 12); shown as a horizontal quick-jump strip atop the list (tap = search that course). Seeds the ADDED button state on load.
- Map callouts: DirectoryMap.tsx markers now show a name bubble on tap via react-native-maps <Callout> (native-only; not visible in web preview stub).
- Verified via Expo web preview: region chips render, Visayas filter works, Recently Added strip persists with ADDED state. Callouts unverifiable on web (native maps).

### PH directory v5 (2026-06)
- Region chips now show a course count badge per region (All = total 98; e.g. Mindanao 18, Visayas 15, Metro Manila 10) — counts derived from the directory list.
- Course cards redesigned with a real golf photo header (expo-image) instead of the initials badge: photo banner + dark shade + course name overlay + holes chip; location/distance + ADD in the body. Photos assigned deterministically from a 6-image Unsplash pool via name hash (photoFor). Recently Added strip and map selected-card still use the initials badge (badgeColor/initials retained).
- Verified on Expo web preview: counts render on chips, photo headers load per card.

### Map engine migration — react-native-maps → MapLibre (2026-06) [CRASH FIX]
- ROOT CAUSE of "app closed / has a bug" crash on some Android phones at Start Round: react-native-maps uses the Google Maps engine on Android and no Google Maps API key was configured; on newer devices (Samsung/Android 14) the missing key crashed the map screen (/play) at mount.
- FIX (user chose keyless option): migrated both map components to @maplibre/maplibre-react-native v11.3.8 (Expo config plugin auto-added; requires New Arch, already enabled). Renders the SAME free Esri satellite raster tiles (mapStyle raster source) with NO Google dependency and NO API key — works on all Android incl. no-Google Huawei. react-native-maps was UNINSTALLED.
- Files: /app/mobile/src/components/GolfMap.tsx and DirectoryMap.tsx fully rewritten to MapLibre API (Map, Camera easeTo/fitBounds, Marker, GeoJSONSource+Layer for polylines). .web.tsx stubs unchanged (web preview shows placeholder — native maps only render in a device build).
- Behavior change: target flag is no longer drag-to-move (MapLibre Marker has no drag) — target still moves via tap-on-map. Directory map now shows a name-bubble callout above the selected pin. fitBounds keyed on a coord hash so region-filter refits.
- IMPORTANT: this crash fix can ONLY be validated in a real device build (Publish) — the Expo web preview & Expo Go resolve to the .web.tsx stubs and cannot render/verify native MapLibre. Web-preview regression passed 6/6 (iteration_5.json).

## Notes for next agent

### Storage Meter + Auto Offline (2026-06) [native-only]
- Storage Meter: Courses screen shows "OFFLINE MAPS · <size> · <n> courses" with a FREE UP button. offline.ts getOfflineUsage() sums OfflinePack.status().completedTileSize; clearAllOffline() deletes all packs. Usage refreshes on focus + after every download/delete/clear.
- Auto Offline: play.tsx prompts once per course (Alert) the first time a round is active on it, offering to save its map offline; tracked in storage key sg_offline_prompted. Uses boundsForCourse.
- boundsForCourse moved to src/lib/geo.ts (pure, shared by Courses + Play). offline.web.ts stubs getOfflineUsage/clearAllOffline (offlineSupported=false) so all offline UI is inert/hidden on web.
- Native-only. Web regression passed 5/5 (iteration_8.json). Verify on device build.
- Backlog: disk-quota preflight + cancel in-flight download. Open iteration_4 bug: Play.tsx roundScores staleness.

### Smart Offline Area + Download All (2026-06) [native-only]
- Smart Offline Area: offline download now sizes tile bounds to the course's actual mapped holes. courses/index.tsx boundsForCourse(course, lat, lng) unions all tee/green/hazard coords (padded ~15%) from GET /api/courses/{id}; falls back to a ~2.2km box (with NaN guard) when the course has no holes. downloadCourseTiles now takes explicit bounds: (courseId, name, bounds, onProgress).
- Download All: "SAVE ALL COURSES OFFLINE (n)" button on Courses screen downloads every not-yet-offline course sequentially (shared runDownload helper), per-card progress + final summary toast; hidden when all courses already offline. bulkBusy blocks single taps while running.
- Native-only (hidden on web via offline.web.ts). Web regression passed 7/7 (iteration_7.json). Verify tile download on a device build.
- Backlog: disk-quota preflight + cancel in-flight download (still not done). Open iteration_4 bug: Play.tsx roundScores staleness.

### Drag The Pin + Offline Tiles (2026-06) [native-only]
- Drag The Pin: GolfMap.tsx target flag is now draggable (DraggableFlag: PanResponder translates the flag while dragging, then mapRef.project→unproject converts the release pixel to lng/lat and calls onTargetDrag). Tap-on-map still moves the target too.
- Offline Tiles: My Courses cards (app/courses/index.tsx) have a DOWNLOAD OFFLINE MAP row → MapLibre OfflineManager pre-downloads Esri satellite tiles (~2.2km box, zoom 12–17) with live %, a "ready · tap to remove" state, and delete. Native logic in src/lib/offline.ts; src/lib/offline.web.ts stub keeps it a no-op/hidden on web (offlineSupported=false). Download uses a single resolve/reject promise channel (no double-toast); guarded against mid-download re-tap and unmount setState.
- BOTH are native-only — cannot be validated on web/Expo Go. Web-preview regression passed 5/5 (iteration_6.json). Verify on a device build (Publish).
- Backlog (from iteration code review, not yet done): offline bounds from actual hole coords for long links courses; disk-quota preflight; cancel in-flight download. Also still-open iteration_4 bug: Play.tsx roundScores staleness (auto putt prompt can clobber Score-tab edits).
- Frontend GPS testing: grant geolocation + set_geolocation(7.0545, 125.5195) before nav; viewport 390x844
- Settings singleton id="default"; demo course id "demo-apo-davao" — do not delete
