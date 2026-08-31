# Cross-Platform Port Blueprint: Smart Golf GPS & AI Caddie

## 1. Detection
- **Source Platform**: Web (React, `react-router-dom`, `react-leaflet`, PWA) found in `/app/frontend`.
- **Target Platform**: Mobile (Expo, React Native) found in `/app/mobile`.
- **Evidence**: `/app/frontend` has full React application code (`src/pages`, `App.js`, Shadcn UI components). `/app/mobile` is currently a skeleton Expo app with a placeholder `index.tsx`.

## 2. Existing App Map (Web)
### Screens / Routes
- **`/` (Home)**: Dashboard navigation menu and welcome screen.
- **`/play` (Rangefinder)**: Main GPS map view. Displays satellite tile layer, movable target flag, ball placement, shot tracking (distance line/label), wind/elevation overlays.
- **`/play/score` (Scorecard)**: Form with steppers to record hole score, putts, fairways hit, and GIR.
- **`/play/caddie` (Caddie)**: AI Caddie interface using SSE streaming.
- **`/bag` (Bag)**: Club management and distance stats; allows editing club parameters and accepting AI suggestions.
- **`/more` (More)**: Settings (Distance/Wind/Temp units, AI toggle, etc.) and Tournament mode toggle.
- **`/courses` (Courses)**: List of courses and creation form.
- **`/courses/:id/edit` (CourseEditor)**: Map-based editor to plot tees, greens (F/C/B), and hazards.
- **`/start-round` (StartRound)**: Form to select a course and start a new round.
- **`/history` (History)**: List of completed rounds.
- **`/rounds/:id` (RoundDetail)**: Past round summary and map with an animated shot replay.
- **`/stats` (Stats)**: Statistics dashboard with charts (avg score, fairways, gir, avg driver).

### Components & State
- **State Management**: React Context (`SettingsContext.js` for user preferences), local state (`useState`), `localStorage` for caching data (`cachedGet`).
- **Core Hooks/Logic**: `useGPS.js` (wraps `navigator.geolocation` for real-time tracking), `geo.js` (Haversine math, bearing calcs), `playsLike.js`, `clubRec.js`.
- **Key UI Patterns**: `BottomNav` for top-level routes. Modals/Bottom Sheets (Shadcn UI) used for settings and data entry. `MapView.js` wraps `react-leaflet` for map rendering.

## 3. Shared Backend API Surface
The backend (`/app/backend/server.py`) is FastApi + MongoDB. The mobile app must reuse these existing endpoints:

- **Courses**
  - `GET /api/courses` -> List courses
  - `POST /api/courses` -> Create course
  - `GET /api/courses/{course_id}` -> Get course by ID
  - `PUT /api/courses/{course_id}` -> Update course (used by map editor)
  - `DELETE /api/courses/{course_id}` -> Delete course
- **Bag**
  - `GET /api/bag` -> Get the single default bag
  - `PUT /api/bag` -> Update bag
- **Settings**
  - `GET /api/settings` -> Get user settings
  - `PUT /api/settings` -> Update settings
- **Rounds**
  - `POST /api/rounds` -> Start round
  - `GET /api/rounds?status={status}` -> List rounds (active/completed)
  - `GET /api/rounds/{round_id}` -> Get round by ID
  - `PUT /api/rounds/{round_id}` -> Update round (scores, current hole, end round)
  - `POST /api/rounds/{round_id}/track` -> Track GPS path
  - `DELETE /api/rounds/{round_id}` -> Delete round
- **Shots**
  - `POST /api/shots` -> Record a tracked shot (auto-calculates distance)
  - `GET /api/shots?roundId={roundId}&club={club}` -> List shots
  - `DELETE /api/shots` -> Clear shots
- **Stats**
  - `GET /api/club-stats` -> Distances per club (median/trimmed mean)
  - `GET /api/stats` -> Overall dashboard stats (avg score, fairways, gir, etc.)
- **Utilities / AI**
  - `GET /api/elevation?lat1=&lng1=&lat2=&lng2=` -> Proxies Open-Meteo elevation
  - `GET /api/weather?lat=&lng=` -> Proxies Open-Meteo weather
  - `POST /api/caddie` -> SSE stream yielding AI caddie advice JSON payload.
  - `DELETE /api/data/all` -> Clear all privacy data

## 4. Data Models & Integrations
- **Data Models**:
  - `Course` (embeds `Hole` and `Hazard` objects)
  - `Bag` (embeds `Club` objects)
  - `Settings` (unit preferences and toggles)
  - `Round` (embeds `HoleScore` objects and GPS path points)
  - `Shot` (club, start/end coords, result)
- **Integrations**:
  - **Open-Meteo API** (Elevation and Weather) — handled purely via backend proxy.
  - **Emergent LLM (GPT-5.4-mini)** — handled via backend `/api/caddie`.

## 5. Port Requirements (Target: Mobile / Expo)
Translate existing screens into React Native (`expo-router`):

- **Routing Setup**: Create a tabs layout (`app/(tabs)/_layout.tsx`) replacing web `BottomNav`. Map tab screens: `index` (Home), `play` (Rangefinder), `bag` (Bag), `more` (More). Map other screens as stack screens under `app/`.
- **MapView to Native Maps**: Replace `react-leaflet` with `react-native-maps`. Implement the satellite view using `UrlTile` (Esri/OSM) or Google/Apple native satellite layers depending on available configuration. Handle markers, polylines (shot paths, distance lines), and polygons (greens/hazards) natively.
- **GPS Location**: Replace browser `navigator.geolocation` in `useGPS` with `expo-location`. Ensure location permissions (`requestForegroundPermissionsAsync` or `requestBackgroundPermissionsAsync`) are requested explicitly.
- **Local Storage**: Replace browser `localStorage` caching with `@react-native-async-storage/async-storage`.
- **AI SSE Streaming**: `fetch` with SSE chunks doesn't work out of the box natively in React Native exactly like the web's `ReadableStream`. You may need to use `react-native-sse` or parse XMLHttpRequest progress chunks in the `caddie` screen.
- **Charts / Stats**: Recharts is web-only. For `/stats`, use a mobile charting library like `react-native-chart-kit` or simplify the display into raw text/bars if a library is not available.
- **Styling**: Replace Tailwind + Shadcn with standard `StyleSheet` or inline styles. Re-implement the Bottom Sheet for controls (Rangefinder hole switching, Scorecard entry) using native modals or custom animated views.
- **Icons**: Replace `@phosphor-icons/react` with `@expo/vector-icons` (already installed) or similar vector library.

## 6. Open Questions / Risks
- **SSE Parsing on Mobile**: SSE streaming for the AI Caddie can be tricky in React Native `fetch`. The main agent should ensure they select a robust approach for receiving AI streams.
- **React Native Maps Performance**: Plotting multiple overlapping polygons, markers, and polylines can have performance implications compared to Leaflet; ensure the map re-renders are optimized (e.g., memoizing map layers).
- **Charts**: Since `recharts` is strictly for DOM, the agent will need to adapt the Stats screen visualization to mobile bounds.