# Smart Golf GPS & AI Caddie — PRD

## Problem Statement
A production-quality, cross-platform (Web React + Mobile Expo/React Native + FastAPI/MongoDB shared backend) app functioning as a GPS golf rangefinder, course map, shot tracker, scorecard, and AI club-selection assistant. Uses keyless Esri satellite maps (MapLibre), live GPS, AI Caddie (Emergent LLM Key), OpenStreetMap Nominatim geocoding, and offline capabilities. Mobile is the primary surface with a Hole19-style Golf View experience.

## Architecture
- `/app/backend`: FastAPI + MongoDB (motor), all routes `/api` prefixed. `_ensure_layout` auto-generates simulated course layouts; Nominatim geocoding endpoints.
- `/app/frontend`: React Web (secondary).
- `/app/mobile`: Expo + expo-router. MapLibre + Esri tiles (with `.web.tsx` stubs for Expo Web preview stability).

## 3rd Party Integrations
- OpenAI GPT-5.4 Mini (AI Caddie) via Emergent LLM Key
- MapLibre + Esri satellite tiles (keyless)
- expo-speech (Voice Caddie, local TTS)
- OpenStreetMap Nominatim (geocoding, keyless; User-Agent + rate-limit handled in backend)

## Implemented (history)
- Hole19-style Golf View: single-hole nav, fairway corridor, auto-rotate hole-up, green zoom, dogleg/layup markers.
- Auto-Advance Hole, OB & Cart Path drawing tools, Trend Range filter.
- Simulated course layout auto-generation (backend self-heals unmapped courses).
- Nominatim geocoding + nearby search; Course Import Preview, Mapper Badges, Confirm Location, Layout Accuracy Meter, Bulk Geocode, Accuracy Filter, Drop-On-Long-Press, Trust Reminder.

## Changelog
- 2026-06 (this session): **Fixed EAS deployment blocker.** Root cause: `/app/mobile/package.json` `resolutions` forced versions yarn flagged incompatible with requested ranges (`@eslint/plugin-kit@0.3.4` vs `^0.2.8`/`^0.4.1`, `postcss@8.5.10` vs `~8.4.32`, `uuid@11.1.1` vs `^7.0.3`), causing yarn to recompute the tree and fail `yarn install --frozen-lockfile` on EAS. Removed those 3 incompatible resolutions (kept compatible undici/tar/js-yaml/shell-quote), regenerated `yarn.lock`. Verified clean-state `--frozen-lockfile` passes (exit 0, no incompatible warnings); app renders fine.

## Backlog / Next
- P1: Smart Caddie enhancements (wind, elevation, player club distances → club/target recommendation)
- P2: Carry Line ring on fairway; live Wind Arrow on Golf View
- P3: Advanced stats, multiplayer scorecards, friends/leaderboards
- Refactor: modularize large `/app/backend/server.py` into routes/models/tests

## Credentials
- Admin Offline Generator: username `admin` / password `SmartGolf2026` (see test_credentials.md)
