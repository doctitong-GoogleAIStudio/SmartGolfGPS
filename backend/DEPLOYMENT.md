# Backend dependency build fix — 18 October 2026

This directory is the existing Python/FastAPI service. It is not a Laravel application or the proposed authenticated Laravel golf API. The latter is described in `../api-contract/`.

## Causes found

1. `emergentintegrations==0.2.0` was not found on the build's default package index. The exact wheel is available on the integration's hosted index. `requirements.txt` now references that wheel directly with its verified SHA-256, without adding a general extra index or upgrading the SDK.
2. That wheel requires a hosted LiteLLM 1.80.0 URL without a hash fragment. The previous explicit LiteLLM URL with a fragment conflicts with it under the tested pip resolver. The requirement is now `litellm==1.80.0`; the integration supplies its exact hosted URL.
3. The pasted log uses CPython 3.14/Linux ARM64. With these existing pins, `google-api-core[grpc]==2.33.0` requires `grpcio-status>=1.75.1` on Python 3.14, whereas the project pins `grpcio-status==1.71.2`. This is an additional resolver failure after the missing package is fixed. Keep the existing SDK stack on **Python 3.12** for this increment; no Google SDK migration was attempted.

## Apply on your deployment service

Replace `backend/requirements.txt` with the corrected file. Set the service root/build context to `backend`, and explicitly choose Python 3.12 in the hosting service's runtime settings. `.python-version` records that choice, but a host may ignore it: confirm the selected version in the next build log. A requirements-only change will not fix the Python 3.14 conflict.

Cloud automatically installs `requirements.txt`. For Laravel Cloud, use `python -m uvicorn server:app --host :: --port $PORT --timeout-graceful-shutdown 25` as the start command: Cloud requires its supplied port and IPv6 binding. Keep Python 3.12 selected. For a generic local/Docker host, `--host 0.0.0.0 --port 8000` is appropriate when that port is explicitly mapped. Configure `MONGO_URL` and `DB_NAME` through the host's secret/environment settings. Existing caddie functionality still uses the existing `EMERGENT_LLM_KEY`; no new provider account or credentials are introduced. See [Cloud's Python server guidance](https://laravel.com/cloud/docs/deploy-guides/python#bind-to-the-right-interface).

If the host supports Docker, the supplied `Dockerfile` explicitly selects Python 3.12. From the repository root:

```sh
docker build -t smart-golf-backend:build-fix ./backend
docker run --rm --env-file /secure/path/golf-backend.env -p 8000:8000 smart-golf-backend:build-fix
```

The Docker build context excludes `.env` files. Supply secrets at runtime. The Docker image/container has not been built or run in this Windows environment. Neither a live service nor a database was modified.

## Validation and limits

The exact integration wheel downloaded successfully using pip and passed its pinned SHA-256 check. Its metadata reports version 0.2.0 and its source contains the four streaming types imported by the current caddie route. The complete requirements graph passed a clean `pip install --dry-run --ignore-installed` using Python 3.12.14 on Windows. An additional cross-target Linux ARM64/Python 3.12 resolution with `--only-binary=:all:` passed without Windows wheels or source distributions. Cross-target resolution still uses the host for some environment markers; it does not execute Linux code. These are dependency checks, not a complete installation, server start, provider call or hosted deployment acceptance test.

The subsequent authenticated-connection increment adds bearer authentication, per-account ownership and editor authorization to the FastAPI service. See `../BACKEND_INTEGRATION.md` for the actual implemented subset, private first-account provisioning and remaining limitations. The complete Laravel contract, conflict-safe synchronization and production acceptance are not established by dependency resolution alone.

Sources checked: [hosted integration index](https://d33sy5i8bnduwe.cloudfront.net/simple/emergentintegrations/) and [Google API Core 2.33.0 dependency metadata](https://pypi.org/pypi/google-api-core/2.33.0/json).
