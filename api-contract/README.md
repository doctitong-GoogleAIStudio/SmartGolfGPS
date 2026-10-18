# Smart Golf GPS — Laravel API contract

**Status: proposed, not deployed.** Prepared on 18 October 2026 for the existing Laravel site at `aivicventures.com`. The website was reachable; `GET /api/courses` returned 404. No live data was written and no routes were deployed. The suggested API root is `https://aivicventures.com/api/golf/v1`; the Laravel owner must approve/implement that prefix before it is placed in the app's `EXPO_PUBLIC_API_URL`.

The machine-readable specification is [openapi.json](openapi.json), OpenAPI 3.1.1. It retains the mobile app's route suffixes and camelCase JSON field names. `x-client-stage` marks operations requiring additional client work. This contract is a backend handoff, not a claim that billing, synchronization or every endpoint is implemented. The later Cloud inspection confirmed that the supplied deployment runs the repository's **FastAPI** service; its authenticated connection increment is documented separately in [BACKEND_INTEGRATION.md](../BACKEND_INTEGRATION.md).

## Authentication and ownership

Use the existing Laravel account system. For mobile bearer tokens, Laravel Sanctum supports token issuance, authorization abilities, expiry and revocation; follow the site's installed Laravel version and existing account/MFA policies. See the [official mobile authentication documentation](https://laravel.com/framework/docs/13.x/sanctum#mobile-application-authentication).

- `POST /auth/token` accepts email, password and deviceName and returns token, tokenType, expiresAt and user. Never embed service credentials in the application. Rate limit and preserve any existing MFA/account-verification requirements.
- `DELETE /auth/token` revokes the current token. Clear cached account data through an explicit, tested account-switch policy, not a global destructive reset.
- The new native connection screen uses a dedicated SecureStore session record `sg_service_session_v1`, bound to the API and account. It retains the old `sg_api_access_token_v1` and existing activation keys without reinterpreting or deleting them. One account/API binding is supported per installation until account transfer and legacy-data migration are completed. The connection screen is implemented for the authenticated FastAPI increment; the proposed Laravel token implementation still needs staging interoperability checks.
- Scope **all** rounds, settings, bags, shots, stats, exports, sync operations and entitlements to the authenticated user. The legacy display value `id: "default"` must never select a globally shared bag/settings row.
- Course mapping/review/share writes require an authorized course editor/reviewer role and applicable data rights. A player cannot grant themselves review authority or Premium by submitting a JSON flag.

## Routes used by the supplied mobile app

| Area | Routes and behavior |
|---|---|
| Courses | GET/POST `/courses`; GET/PUT/DELETE `/courses/{courseId}`; GET `/courses/directory`; POST `/courses/{courseId}/relocate`; POST `/courses/{courseId}/share`; POST `/courses/import` |
| Directory tools | GET `/geocode/search`; admin POST `/courses/geocode-all`. These change/search directory anchors only, never fabricate or translate playing geometry. |
| Bag/settings | GET/PUT `/bag`; GET/PUT `/settings`. Preserve `gpsMode`, units and existing user-configured club values. |
| Rounds | GET/POST `/rounds`; GET/PUT/DELETE `/rounds/{roundId}`; POST `/rounds/{roundId}/track` |
| Shots/statistics | GET/POST/DELETE `/shots`; GET `/club-stats`; GET `/stats` |
| Providers/caddie | GET `/weather`; GET `/elevation`; POST `/caddie` using the existing SSE message format |
| Privacy | DELETE `/data/all` deletes only the authenticated caller's rounds, shots and location history, after explicit user action. |

Success responses retain **bare objects or arrays**, without an automatic Laravel `{ "data": ... }` wrapper. For example `/courses` returns `Course[]`, `/courses/{id}/share` returns `{ "shareCode": "..." }`, and `/stats` includes `roundsPlayed`, `recentRounds`, `totalShots`, `avgDriverMeters` and the other fields specified in OpenAPI. Use continuation headers/cursors without changing these shapes. Dates are ISO-8601 UTC strings; GPS sample `t` is Unix milliseconds.

Do not connect the Phase 1 app to a partially compatible endpoint merely because it returns HTTP 200. Validate route methods, object shapes, authentication and errors in staging first. The mobile configuration deliberately remains unset until an actual golf API is supplied.

## Geometry and provenance

- Directory latitude/longitude and geocoding locate a course, not its tees, fairways, greens or hazards. Missing geometry stays null/empty. No generation during create, read, relocation or startup.
- Preserve existing `layoutSource`, `isDemo`, original coordinates, IDs, metadata and round history. Legacy generated courses stay stored as unreviewed records; do not convert them to mapped courses based on a save/import.
- `mappingReview` contains reviewer, actual source/version, license/permission reference and reviewedAt. Validate responsible reviewer authorization, nonempty fields, date, topology and physical extents. Any playing-geometry edit invalidates the previous review unless a new authorized review is supplied.
- A mapper declaration is not independent survey certification or a measured GPS accuracy claim. Satellite imagery alone is not boundary verification.
- The Phase 1 native renderer uses only the selected hole's supplied polygons. It no longer creates a fairway or circular green. Automatic detection requires reviewed fairway polygons; point-only reviewed holes remain available for manual selection.
- Green-boundary distances intersect the player-to-center line with the reviewed green ring. Point-only mappings are labeled as mapped points. Hazard points are labeled as points, not verified hazard edges or clearance paths.
- Multipolygons/interior rings are not supported by the current mapping editor. Reject unsupported shapes instead of flattening them.

## Units and scoring compatibility

API shot distances, elevation and accuracy values are meters; wind is km/h and temperature Celsius. The existing bag's carry/total/minComfort/maxComfort values are **yards**, matching `recommendClub`. Convert at the display boundary; never silently reinterpret existing bag values as meters. GPS shot displacement includes roll and does not establish carry distance.

Scores include penalty strokes. Null means unrecorded, not zero; validate putts + penalties <= strokes when supplied. Preserve FIR/GIR nulls and use recorded denominators. Course par/handicap references must be snapshotted for a round. For Stableford, the input is the round's playing handicap, not a handicap index. Nine-hole rounds in the current client use the first nine holes; relative stroke-index ranking is required.

## Conflict handling and offline writes

The production contract requires strong revision ETags/If-Match for revision-protected updates, idempotency keys for retryable creates and a transactional sync operation log. **The Phase 1 mobile score/editor writes are not yet revision-aware and do not provide full offline-first persistence.** Complete that client migration before enforcing these endpoints for production; otherwise return an explicit error rather than accepting unsafe overwrites.

- Missing precondition: 428. Stale revision: 412 with `currentRevision`; preserve the proposed draft on device. Validation: 422 with field errors; no partial write. Never perform a silent last-write-wins merge of complete score arrays.
- Offline operations carry operationId, resourceId, baseRevision and an allowlisted patch. Uniqueness is `(userId, operationId)`. A repeated ID with the same canonical request returns the committed response; a changed payload returns conflict.
- Acknowledge only committed operations. Merge distinct hole/player fields when safe. Return same-field conflicts with both versions for user resolution. Preserve tombstones and server cursors; device wall-clock timestamps never determine the winner.
- GPS upload batches contain at most 200 points. Deduplicate by owned round/timestamp/coordinate. A client acknowledges only the successfully uploaded batch. The existing bounded AsyncStorage path buffer is retained; this is not a replacement for a durable SQLite outbox, round scoping and process-death tests.

## Later-phase contract routes

`PATCH /shots/{shotId}`, `GET /courses/{courseId}/offline-manifest`, `POST /sync`, `GET /sync/changes`, `GET /rounds/{roundId}/scorecard.pdf`, `POST /billing/google/verify` and `GET /billing/entitlements` specify later features. They are **not wired into the Phase 1 client**.

Offline manifests must encode the actual provider's rights, attribution, area/zoom/storage limits and expiry. Publicly reachable Esri/OSM tiles are not automatic offline-download permission. Mobile downloads remain disabled without explicit licensed-provider configuration.

Billing verification belongs on the backend using Google Play Developer API and the owner's Play configuration. Check package/product/account/state/expiry, bind token ownership, acknowledge valid purchases, and process refunds/revocations and Real-time Developer Notifications. Server-signed short-lived entitlements must be bound to the account and actual expiry, with bounded offline grace and rollback handling. Trials depend on configured eligible Play offers; do not promise seven days for every user. Existing activated devices require an explicit, tested migration; no activation values are deleted or treated as verified Play subscriptions.

## Suggested Laravel persistence

Reuse existing users/auth tables and add namespaced golf tables, without destructive migrations:

- courses plus immutable course_versions with geometry/provenance JSON and revision;
- rounds with owner, legacy string ID, course snapshot, status, timestamps and revision;
- round_hole_scores keyed by round/hole, with revision and explicit nullable statistics;
- shots with original/corrected endpoints, uncertainty/source, audit metadata and recomputed meters;
- per-user bags/settings; deduplicated round_track_points;
- sync_operations, change log and tombstones with unique operation IDs;
- purchase verification records and revocable entitlement grants. Encrypt raw purchase tokens; never log secrets.

Back up/export existing MongoDB and AsyncStorage data before any migration. Preserve source IDs and unknown legacy metadata, round course snapshots, bag units and activation. Run migrations against an isolated copy, reconcile counts/checksums and test rollback before a production upgrade.

## Acceptance before connecting the application

1. Validate this OpenAPI document, implement routes in a Laravel branch and run owner/unauthorized/cross-account tests on every private route.
2. Test bare-array/object compatibility against mobile fixtures, geometry nulls, legacy IDs, all score fields and correct bag units.
3. Test duplicate create, timeout-after-commit, changed-payload idempotency conflict, simultaneous score edits and reconnect without data loss.
4. Verify mapping review cannot be inferred from geocoding/saving and cannot be published by an unauthorized player.
5. Configure the final approved HTTPS API root and licensed imagery in the build. Add/login-test token issuance and complete revision/outbox integration.
6. Run a staging device test, preserve the original Android package/signing lineage for a real update, and use a versionCode above every distributed release. The Phase 1 test package is deliberately separate.

This specification follows [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html). The files are prepared for review; no live Laravel implementation, database migration or production deployment has been performed.
