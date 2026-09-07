# BiteIQ implementation checklist

Checked items have focused automated or artifact evidence in the foundation task reports. An unchecked item is not a failed feature; it means the stated acceptance proof has not been recorded.

## Foundation

- [x] Fastify server package, test harness, normalized errors, and liveness route.
- [x] PostgreSQL/Drizzle configuration and checked-in initial migrations.
- [x] Private email/password authentication with disabled public sign-up.
- [x] Interactive account creation and password reset commands.
- [x] Profile persistence, onboarding APIs, Mifflin-St Jeor calculations, manual calorie targets, and macro target modes.
- [x] Server-side canonical food, serving, nutrient, provenance, and diary snapshot model.
- [x] Server-side USDA provider contract, deterministic decimal portion calculation, local-first search, and provider upsert behavior.
- [x] Authenticated food search/detail and diary create, edit, delete, and transactional daily-summary routes.
- [x] Client login/onboarding, server-backed goals, and food search/detail in focused tests.
- [x] Client diary add/edit wiring and limited offline new-entry queue, Task 12 review-approved (93 client tests).
- [x] API liveness/readiness behavior, safe request-completion logging, request-body limit, and production image build.
- [x] Exact-origin credentialed CORS plus targeted per-pod limits for password attempts and food search.
- [x] Client sign-out clears every account-owned local/query/offline value; production hides deferred water, exercise, weight/progress, AI-provider, capture, and planning flows.

## Operations and documentation

- [x] `.env.example` documents server and Expo API URL configuration without a secret value.
- [x] Local Docker Compose harness is defined for PostgreSQL and API development.
- [x] K3s base/example manifests and migration overlay render locally without embedded Secret values.
- [x] Private K3s deployment and PostgreSQL backup/restore procedures are documented.
- [x] API, USDA attribution/cache/storage/update policy, setup, and recovery documentation are present.

## Verification gates

- [x] Fresh verification: 12 client suites/98 tests, 11 server unit files/75 tests, and 8 server integration files/77 tests passed; both typechecks, both lints, the server build, the production image build, and the Expo web export passed.
- [x] A clean `biteiq_acceptance` Compose project with newly named volumes was migrated; liveness and readiness returned `200`; its disposable containers and volumes were then removed and the normal local stack was restored healthy.
- [ ] Complete a two-person client/device walkthrough. API-level acceptance already created two disposable private accounts and proved separate profiles, goals, and diaries; interactive client sign-in remains.
- [ ] Run a real USDA search with an operator-supplied server key; select a serving, log, edit, and delete it.
- [ ] Restart both the API and client and prove both users' histories persist. API-level acceptance already proved a diary survives an API restart; the client restart remains.
- [x] Expo web exported 24 files (6,172 KiB); the bundle had zero secret-name matches, and the structured API log scans had zero password or credential matches.
- [ ] Apply the K3s release sequence to the target private cluster, wait for migrations and rollout, and verify live liveness/readiness.
- [ ] Perform and verify a disposable PostgreSQL restore from an encrypted backup before relying on recovery.
