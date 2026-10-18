# Connection timeout fix — Android test 1.1.3

The connection screen previously cancelled readiness requests after 15 seconds and exposed the native AbortError message as “Aborted.” A phone report confirmed that timing. The live API independently returned HTTP 200 with databaseReady=true in 0.93 seconds during diagnosis; that does not measure the phone's network or prove a hosting cold start caused the report.

The anonymous /health readiness check now permits up to 60 seconds. Sign-in and other account requests retain a 15-second deadline and are not automatically retried. The deadline covers response-body reading as well as initial headers. Timeouts and transport failures show connection guidance without raw diagnostic text. The connection button displays a waiting state and explains that the first check can take up to a minute.

Five new regression cases cover a readiness response arriving after the shorter ordinary-request deadline, native AbortError handling, a stalled response body, redacted network errors, and a sign-in timeout without automatic retry or saved-session mutation. All 50 mobile tests and TypeScript passed. Real-phone acceptance remains required.

This update keeps the same isolated package, debug signing certificate, licensed online MapTiler imagery, disabled imagery downloads/tracing, account binding, and local data. Install over version 1.1.2; do not uninstall to test this fix.

Use the golf API root (not /health) in the connection screen:
https://smartgolfgps-production-bxords.laravel.cloud/api

For network diagnosis, open this on the same phone:
https://smartgolfgps-production-bxords.laravel.cloud/api/health

If the browser also cannot connect, compare Wi-Fi and mobile data and report that result. Do not disable TLS certificate validation or paste passwords into chat.