# Course screen and geocoding diagnostics — 1.1.6 / code 120

The owner reported “Could not start geocoding” while signed in on 1.1.5. The screenshot does not expose the HTTP status, so an exact production failure cause has not been confirmed. The native screen showed editor-only actions to all players and discarded specific errors. Its single non-wrapping action row could shrink Play to zero width. The map badge labeled every non-mapped course SIMULATED, including courses with no hole geometry.

Changes:
- Authenticated GET /api/auth/me exposes only id, name, email and the current server role. It never grants access or changes an account. Existing backend editor authorization stays enforced.
- The course screen checks that role before offering New, Import, Edit, Share, location updates, delete, and bulk pin searches. Players retain browsing and Play. Permission-check failures and course-load errors are visible, with retry and an account link. No automatic privilege elevation occurs.
- Geocoding requests show distinct sign-in, editor access, timeout and transport errors. Duplicate taps are disabled while the start request runs. The success message describes searches starting; an arbitrary delayed refresh no longer implies completion. This increment does not introduce durable job status or confirm real-provider geocoding success.
- Course pins and empty scorecards are NOT MAPPED. Actual legacy synthetic geometry stays SIMULATED. Existing map geometry, source tags, review declarations and rounds are not rewritten or deleted. UNVERIFIED remains appropriate until a mapper provides the required source/license review and valid playing data.
- Course-card action buttons wrap and Play has a minimum width. Main action buttons and badges can grow vertically for large fonts. Location confirmation text now correctly says only the directory pin changed.

Verification: 56 mobile production-module tests, 21 isolated Mongo-mock backend HTTP tests, and full TypeScript passed. Tests verify current-role changes, private account access, secret-field exclusion and editor-only geocoding request dispatch without real geocoder calls or geometry writes. Native universal build and packaging validation are recorded with the delivered APK. Physical phone/tablet rendering remains owner acceptance; no real geocoding job was started against production by this work.

The test APK retains the existing isolated package and test certificate, supports all four ABIs, and updates the earlier test installs without uninstalling. No owner release-signing configuration is available. This fix does not supply verified course geometry. Geocoding a course name cannot supply verified fairways, tees, green boundaries or hazards.
