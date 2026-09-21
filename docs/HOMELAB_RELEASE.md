# Homelab release evidence — 2026-09-21

## Deployed

- Flux source: `biteiq-release-5`, Git tag at `940a8d1885e0f66242952a393fa654afb1e8b1c0`.
- GitOps registration commit: `86bea1234a1be477215611e72ab22a08bb0cdb25` in `agustinkiko/jericoagustin`.
- Routing-only release 5 retains the tested release 4 images and schema; migration-release-5 completed.
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

## Cloudflare routing verified

- User approved public access with BiteIQ login, then selected manual restart rather than passwordless sudo.
- The authenticated homelab `cloudflared` CLI added the hostname DNS route to the existing tunnel.
- The user restarted cloudflared at 13:48 UTC. Post-restart tests still returned 404. Investigation proved the tunnel is remotely managed (config_src=cloudflare), and remote version 8 overrides the local file. The earlier assumption that the service's --config flag made the local file authoritative was incorrect.
- Backed up remote version 8 privately on the homelab, added only BiteIQ through the Cloudflare API using the existing homelab credential, and verified version 9 preserves all prior routes and settings. The running service picked up the remote update without another restart.
- Flux owns the new HTTP-origin IngressRoute. Cloudflare's `CF-Visitor` HTTPS metadata selects API/web routes; plain HTTP retains the HTTPS redirect. This header is routing metadata, not authentication. Production secure cookies and private signup policy remain unchanged.
- Verified seven live origin checks: plain HTTP redirects; HTTP visitor redirects; HTTPS web HTML; HTTPS API readiness; protected API returns 401; header whitespace accepted; unknown host returns 404.
- Initial Node fetch probe discarded the custom Host header and returned 404. Rechecked with curl and corrected the probe to Node http; no application change was needed.
- No new Traefik route parser errors were observed. The old missing-origin-certificate route was removed; browser TLS is handled by Cloudflare.

- Public HTTPS now returns web HTML (200), API readiness (200), and private API rejection (401). Plain HTTP redirects to HTTPS (301), including when a caller spoofs the CF-Visitor HTTPS header.
- An isolated browser rendered the Email, Password, and Sign in controls with no reported JavaScript errors. This verifies the login page, not successful household authentication.

## Remaining acceptance gates

- Public address is `https://biteiq.jericoagustin.com`. HTTPS routing and login-page rendering are verified; authenticated browser diary acceptance remains pending.
- Await the two new account email addresses. No household accounts or passwords have been created.
- Browser login and full browser diary acceptance remain unverified. Internal HTTP API tests do not prove HTTPS cookie transport or browser behavior.
- Full original product features remain subject to `docs/e2e-feature-matrix.md`; this release does not claim missing features were implemented.
