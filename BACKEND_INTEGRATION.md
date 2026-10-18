# Authenticated backend connection increment — 18 October 2026

## Actual deployment target

The supplied Laravel Cloud deployment is configured as **FastAPI** for `doctitong-GoogleAIStudio/SmartGolfGPS`, branch `main`, old commit `67cb466`. Laravel Cloud is the hosting platform; no existing Laravel/PHP golf backend was found. The separate Laravel OpenAPI contract remains a proposed future handoff, not a deployed implementation. This increment retains the existing Python/MongoDB architecture and `/api` route prefix.

The Cloud environment's Python setting was changed and saved from 3.14 to 3.12, matching the dependency checks. A MongoDB Atlas **Free**, 512 MB cluster named `SmartGolfGPS` was created in AWS Singapore without sample data. The owner created a database user with `readWrite` on `smart_golf_gps`, restricted to that cluster. With the owner's explicit approval, six published Laravel Cloud Singapore IPv4 /32 entries were added to Atlas. No public access-from-anywhere rule was added. The workstation itself is not allowlisted.

## Implemented locally

- Public `GET /api/health` identifies the golf service, API version and bearer authentication and reports database readiness (503 until ready). It never reveals database connection strings.
- `POST /api/auth/token` issues a random 30-day bearer token after password verification. Only SHA-256 token digests and PBKDF2-SHA256 password hashes with 600,000 iterations and independent salts are stored. Failed login attempts are limited through shared MongoDB buckets. `DELETE /api/auth/token` revokes the current session. Disabled users and expired/revoked sessions are rejected.
- All existing golf routes require authentication. Rounds, shots, statistics, privacy deletion, bags and settings are scoped by the authenticated account, never the request body's owner field. Course mutations and the activation-generator download require a server-assigned editor role. Course reads remain a shared authenticated library.
- Existing unassigned records and `id: default` bag/settings records are not claimed, deleted or overwritten by new accounts. Partial ownership indexes apply to newly owned records. Duplicate resource IDs return conflict instead of overwriting. An explicit ownership migration is still required to import legacy private records.
- API responses are not cacheable; validation errors omit submitted values. GPS path batches reject invalid coordinates or more than 200 samples rather than silently truncating an upload.
- Native Settings → Golf account & connection checks the deployed API before sign-in. Credentials are sent only over the selected HTTPS API and redirects are rejected. Passwords are not saved. Tokens use a separate secure record; existing device activation keys are unchanged. Connection/account-specific cache namespaces retain legacy snapshots without attaching them to a new account. Background queue keys retain their captured namespace.
- This initial client supports **one account/API binding per installation**. It can sign out and reconnect that account; changing account/server requires a later data migration. Web-preview sign-in is disabled because its existing storage implementation has no native secure credential store.

## Private deployment setup

Use the repository's `backend` directory and Python 3.12. Preserve the dependency-wheel fix. Set Cloud's start command to `python -m uvicorn server:app --host :: --port $PORT --timeout-graceful-shutdown 25` so startup probes can reach the IPv6 listener on the provider's port. The app's production URL must be read from Cloud after a successful deployment; `aivicventures.com` was not reconfigured or assumed to host this API.

Set `MONGO_URL` privately to the Atlas URI with the database user's URL-encoded password, and set `DB_NAME=smart_golf_gps`. Keep credentials in Cloud secrets, not in mobile configuration, source files, build logs or chat.

For the empty new database only, the owner can explicitly enable first-account provisioning with:

```dotenv
GOLF_BOOTSTRAP_ENABLED=true
GOLF_BOOTSTRAP_EMAIL=<your golf-app email>
GOLF_BOOTSTRAP_PASSWORD=<a separate strong password, at least 12 characters>
GOLF_BOOTSTRAP_ROLE=editor
# Optional:
GOLF_BOOTSTRAP_NAME=<your display name>
```

Bootstrap does nothing unless explicitly enabled and the golf-user collection is empty. It never resets a password, changes an existing account's role, or imports legacy history. Remove `GOLF_BOOTSTRAP_PASSWORD` and disable/remove bootstrap settings after verifying the first sign-in. Additional accounts can be created privately using `manage_users.py`, which prompts for the password rather than accepting it on the command line. The app account is separate from the Atlas database user and Laravel Cloud account.

After deployment, check `/api/health`, verify an unauthenticated `/api/rounds` returns 401, then use the native connection screen with the deployed HTTPS base ending in `/api`. Verify token login, real course import/editing permissions and a test round in staging. Do not enter the proposed Laravel `/api/golf/v1` root unless that separate service is actually implemented.

## Validation

In an isolated Python 3.12 environment, install `backend/requirements-test.txt`, then run `python -m unittest discover -s backend/tests -p test_authenticated_api.py -v` and the corresponding `test_geometry_preservation_unit.py` suite. The tests replace the application database with a fresh in-memory async mock and do not connect to Atlas. In `mobile`, use `yarn test:navigation` and `yarn tsc --noEmit`.

44 mobile production-module tests passed, including 11 connection/session/namespace tests in addition to the 33 GPS/navigation tests. Full mobile TypeScript compilation passed. Sixteen HTTP tests against the real FastAPI ASGI application with an isolated async Mongo mock passed, covering authentication, revocation, account isolation, destructive-route ownership, editor roles, duplicate IDs, invalid path batches, redacted validation errors and one-time bootstrap. Four existing geometry-preservation unit tests also passed: **64 automated tests total**.

The Android connection test APK uses version 1.1.1/code 115 and the existing isolated `.phase1` package. It uses the debug certificate, bundles Hermes and installs alongside the original production app. A native build succeeded; see the delivery README for final artifact verification. No usable Android device or outdoor GPS test was available. Synthetic data is confined to tests and is not seeded into Atlas.

The database HTTP tests use a mock, not the real Atlas service. Live deployment, Atlas connectivity, first-account setup and native runtime acceptance must be verified separately. No owner-signed AAB or all-phase completion is claimed. Transactional offline scores/shots, revisions/ETags, idempotent sync, Play Billing, account transfer, full web authentication, real reviewed course geometry and licensed imagery remain further work.

Sources: [Laravel Cloud network/IP documentation](https://laravel.com/cloud/docs/network#ip-addresses), [Atlas Free-cluster documentation](https://www.mongodb.com/docs/atlas/tutorial/deploy-free-tier-cluster/). IP entries were obtained from `https://cloud.laravel.com/api/ip` for `ap-southeast-1`; the provider notes these may change.
