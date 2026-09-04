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

### Polygon Drawing + Performance Trends + Turn-by-Turn To Tee (2026-06)
- Polygon Drawing: backend Hole.polygons: List[HolePolygon{type, points:[LatLng]}]. Editor (courses/[id]/edit.tsx) DRAW FAIRWAY/GREEN/BUNKER/WATER modes → tap map appends vertices (draft cleared on mode switch); UNDO + FINISH SHAPE (>=3 pts) saves to hole.polygons; SAVE persists via PUT. GolfMap renders polygons as fill+outline (POLY_COLORS, data-driven fill-color); also shown on /play via polygons={hole.polygons}.
- Performance Trends: /trends screen (bar charts Score-to-Par/Putts/GIR% with IMPROVING/WATCH tag) from /stats recentRounds; reached via VIEW PERFORMANCE TRENDS on /stats.
- Turn-by-Turn To Tee: /play next-tee-banner (GPS-gated: shows within ~55m of current green) → next hole tee distance+compass; tap advances hole (guarded by nextHole existence).
- Verified iteration_12: backend 16/16 (incl 2 polygon round-trip tests), mobile all render + nav, 0 console errors. Native-only visuals (polygon fills, drawing, banner) confirm on device build.
- REMAINING (spec backlog): advanced analytics beyond 3 trend metrics; OB-zone polygon type; turn-by-turn continuous re-routing.

### Admin POI Editor + Hazard Panel + GPS Power Modes (2026-06)
- Admin POI Editor: course editor (courses/[id]/edit.tsx) has POI modes CLUBHOUSE/RANGE/PRACTICE/PARKING (POI_MODES); selecting one + tapping the map sets course.<key>={lat,lng}; shown via GolfMap new `pois` prop (labeled markers); persists on SAVE (PUT /courses/{id}; Course model already has the fields). ✓ shows when placed.
- Hazard Panel: play.tsx hazard-panel-btn (only when hole has hazards) toggles hazard-panel listing each hazard with Front (origin→lat/lng) + Carry (origin→carryLat/carryLng if present), origin = ball||gpsPos; tapping a row targets it.
- GPS Power Modes: settings gpsMode High/Balanced/Saver (more.tsx Segment setting-gps-mode). useGPS reads settings.gpsMode and switches expo-location accuracy + time/distance intervals (GPS_MODES), re-subscribing on change.
- Verified iteration_11 (all pass, 0 console errors). Native-only visuals (POI placement/markers, hazard-from-ball) confirm on device build.
- REMAINING (spec backlog): admin polygon drawing (fairway/green/bunker/water/OB); advanced analytics/performance trends; turn-by-turn navigate-to-tee.

### Green Detail + Course Navigation + Hole Selector Grid (2026-06)
- GREEN DETAIL: overview VIEW GREEN sets sg_focus="green"; play.tsx places a draggable PIN on the green, zooms in (GolfMap focusKey/focusTarget easeTo, focusZoom~18.5), and persists the dragged pin per hole in storage sg_pins_{courseId} (restored on hole/return). onTargetDrag saves when label==="PIN".
- COURSE NAVIGATION: overview NAVIGATE sheet lists Hole 1 Tee + Clubhouse/DrivingRange/PracticeGreen/Parking with live distance + 8-pt compass (from useGPS) and a SHOW button that recenters CourseOverviewMap (focusKey/focusTarget). Backend Course model gained optional clubhouse/drivingRange/practiceGreen/parking LatLng; demo course seeded with them (seed() now upserts the demo course each startup).
- HOLE SELECTOR GRID: overview HOLES button → 1–18 grid → goHole(n).
- Verified: iteration_10 — backend 14/14 pytest (incl. demo POIs), mobile grid/nav/view-green flows + regression, 0 console errors. Native-only visuals (green zoom, draggable pin, POI markers) confirm on device build.
- REMAINING (spec backlog): admin editor to place POIs + draw polygons (fairway/green/bunker/water/OB); GPS power modes; hazard front/carry/back distances panel; performance trends/advanced analytics; distinct NAVIGATE-TO-TEE turn-by-turn.

### PHASE 1 — Full 18-Hole Course Overview + Start-Round workflow (2026-06)
- New route app/course-overview.tsx + src/components/CourseOverviewMap.tsx (native MapLibre) with .web.tsx stub. Shows all holes at once: numbered tee markers (1–18), green flag markers, dashed green→next-tee route, "START HERE" badge on hole 1, auto fitBounds(all tee+green coords) with padding, live GPS dot, and a tap-hole popup (Par/dist/HCP + live tee distance & 8-pt compass via useGPS).
- Workflow: start-round.tsx START ROUND now routes to /course-overview (round already created); overview START ROUND → /play at hole 1; per-hole VIEW HOLE/NAVIGATE TO TEE/VIEW GREEN → /play at that hole via storage key sg_start_hole (play.tsx reads+clears it in the focus effect). play.tsx added COURSE OVERVIEW button (rf-overview-btn) + Distance Arcs toggle (dist-arcs-btn).
- Distance arcs (spec §10): GolfMap.tsx new props distanceArcs + arcUnit; draws 100/150/200/250 rings (ringCoords equirectangular) around ball||gpsPos with labels. Toggle state arcsOn in play.tsx.
- Header now unit-aware (fmtDist). Demo course demo-apo-davao already has 18 holes w/ tee+F/C/B coords → acceptance course.
- KNOWN: popup's VIEW HOLE / NAVIGATE TO TEE / VIEW GREEN all currently open the hole (aliases) — VIEW GREEN green-focus zoom not yet distinct. Native-only map; verified chrome+nav on web (iteration_9, 5/5). Markers/arcs verify on device build.
- REMAINING PHASES (spec): distinct green-detail zoom + movable pin, hazard carry distances, GPS power modes, next-tee "SHOW ON MAP"/course navigation mode (clubhouse/range/parking), admin polygon drawing (fairway/green/bunker/water/OB), advanced analytics/trends, 18-hole quick selector grid on overview.

### EAS build fix — Node engine incompatibility (2026-06)
- Symptom: EAS Android build failed at INSTALL_DEPENDENCIES with `error @mapbox/jsonlint-lines-primitives@2.0.3: The engine "node" is incompatible ... Expected ">= 22". Got "20.19.4"` → `Found incompatible module` (yarn classic hard-errors).
- Cause: transitive dep of @maplibre/maplibre-react-native (via @maplibre/maplibre-gl-style-spec) pins jsonlint-lines-primitives@^2.0.3, which declares engines.node>=22; EAS builder runs Node 20.
- Fix: added /app/mobile/.yarnrc with `ignore-engines true` (downgrades engine mismatch to a warning). Lockfile-safe — does NOT modify yarn.lock, so `yarn install --frozen-lockfile` still passes (verified locally by running the exact EAS install command). No app code changed.
- To confirm: re-run Publish (only an EAS build validates it; testing_agent/preview cannot).

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


### Auto-Advance + OB/Cart Paths + Trend Range (2026-06)
- Auto-Advance Hole (play.tsx): during an active round, when the golfer holes out (within 18m of greenCenter) then walks >45m off the green, a CONFIRM banner (testID auto-advance-banner, GO=auto-advance-yes-btn, close=auto-advance-no-btn) offers the next hole. advNearGreenRef tracks near-green state; advanceOfferedRef dedupes per hole; bounded by course.holes.length and requires nextHole.tee. GO calls goHole() (persists currentHole via PUT /rounds/{id}). GPS-driven — not testable on web preview.
- OB & Cart Paths (courses/[id]/edit.tsx + GolfMap.tsx): editor drawing tools now include DRAW OB (editor-draw-ob, 3+ pts → red fill) and DRAW CART PATH (editor-draw-cart_path, 2+ pts → dashed line). finishShape uses minPts=2 for CART_PATH else 3. GolfMap renders OB via POLY_COLORS #ef4444 fill and CART_PATH as a separate dashed LineString source.
- Trend Range (trends.tsx): LAST 5 / LAST 10 / ALL chips (trend-range-5/10/all), default ALL. Bars refactored to take rounds[] + value extractor; each bar is a Pressable (testID trend-{title}-bar-{i}) that opens /rounds/{id}. Backend /stats now returns recentRounds[:50] (was [:10]) so ALL is meaningful.
- Verified on Expo web preview (iteration_13.json) — all 3 features pass, no critical issues. Auto-advance verified by code review (GPS trigger can't fire on web).
- Backlog carried over: merge nearGreenRef+advNearGreenRef; add nextHole.tee proximity check so advance isn't offered while walking to clubhouse; edit.tsx setMode() should clear active draft when switching modes.
