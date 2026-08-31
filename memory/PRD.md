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

## Test Status
iteration_1: backend 13/13 pass, frontend 100% (Haversine verified 0.01° lat = 1111.9 m). Backend tests: /app/backend/tests/backend_test.py.

## Notes for next agent
- Frontend GPS testing: grant geolocation + set_geolocation(7.0545, 125.5195) before nav; viewport 390x844
- Settings singleton id="default"; demo course id "demo-apo-davao" — do not delete
