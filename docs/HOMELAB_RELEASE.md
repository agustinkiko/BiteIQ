# Homelab release evidence — 2026-09-21

## Deployed

- Flux source: `biteiq-release-4`, Git tag at `e579444f8f9edcb48e8fc0f2953e536992339ed5`.
- GitOps registration commit: `39c11b2540c28df9cdabd7bf0d6bb128677a34ea` in `agustinkiko/jericoagustin`.
- All three Flux stages report Ready: database, migration-release-4, app.
- Two API pods, one web pod, PostgreSQL, and a completed migration Job.
- API/web image tag: `main-589fa8718294735aedc134308206b4aad57d5fe0-4`.
- API digest: `sha256:591280c5ad85d90022be563e5dee39f33f2f7904da4dcf7e93522d5e33ba66ca`.
- Web digest: `sha256:daeaf227419f989683010283114b3b51f64cfb4bf2ccb138bb4496f9811a3ea3`.
- PostgreSQL uses a bound 10Gi local-path volume. No local household database was copied.
- The user selected a fresh database and new accounts.

## Verified

- Client TypeScript and 149 tests passed.
- Server TypeScript and 90 tests passed, including Flux rendering and idle-connection recovery regressions.
- GitHub image build run 35571397082 succeeded; image manifests are pullable without additional registry credentials.
- Live API readiness and web server health pass.
- Internal deployed-API acceptance: two temporary account logins, secure-cookie attribute, unauthenticated rejection, profile and goal persistence, USDA search/detail without provider warnings, source-proportional calories and every returned nutrient at 150g, duplicate prevention, cross-account isolation, quantity editing, deletion, and logout.
- Restarted only BiteIQ PostgreSQL. The saved diary snapshot and session survived. Both fixed API pods retained zero restarts.
- Removed all temporary acceptance accounts and their cascading diary rows; final user count 0 and food-entry count 0.
- A private pre-update backup was restored successfully into a disposable database; required tables were queried, then only the disposable database was removed. Backup retained on the homelab.

## Issues found and fixed

- Added explicit namespace to redirect resources.
- Pinned source and migration identity per release to prevent a mutable-main migration race.
- Database restart initially crashed both API processes via an unhandled idle-pool error. Added a sanitized error handler, reproduced it with a failing regression test, and verified recovery in the deployed release.
- The first acceptance harness incorrectly included create-only clientId in PATCH. The API correctly rejected it; the harness was corrected, not the API contract.
- One image pull encountered transient homelab DNS failure and recovered automatically.

## Remaining acceptance gates

- Requested hostname is `biteiq.jericoagustin.com`. The externally resolved HTTPS endpoint still returns 404; no public tunnel route has been added.
- A private ingress is configured, but `biteiq-tls` has not been provisioned. Browser DNS/TLS/access acceptance is not complete.
- Await LAN/VPN versus public Cloudflare Tunnel access choice.
- Await the two new account email addresses. No household accounts or passwords have been created.
- Browser login and full browser diary acceptance remain unverified. Internal HTTP API tests do not prove HTTPS cookie transport or browser behavior.
- Full original product features remain subject to `docs/e2e-feature-matrix.md`; this release does not claim missing features were implemented.
