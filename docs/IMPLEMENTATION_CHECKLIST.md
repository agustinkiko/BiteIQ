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
- [x] API liveness/readiness behavior, safe request-completion logging, request-body limit, and production image build.

## Operations and documentation

- [x] `.env.example` documents server and Expo API URL configuration without a secret value.
- [x] Local Docker Compose harness is defined for PostgreSQL and API development.
- [x] K3s base/example manifests and migration overlay render locally without embedded Secret values.
- [x] Private K3s deployment and PostgreSQL backup/restore procedures are documented.
- [x] API, USDA attribution/cache/storage/update policy, setup, and recovery documentation are present.

## Verification gates still required

- [ ] Run the complete fresh server unit, integration, client, typecheck, lint, and production-build suites and record their exact counts.
- [ ] Start Compose from a clean explicitly named volume, migrate it, and prove liveness and readiness against that runtime.
- [ ] Create two real private accounts, sign in interactively on the client, and prove separate persisted profiles and diaries.
- [ ] Run a real USDA search with an operator-supplied server key; select a serving, log, edit, and delete it.
- [ ] Verify and accept client diary add/edit wiring and the limited offline new-entry queue (Task 12).
- [ ] Restart the API and client and prove both users' histories persist.
- [ ] Build Expo web output and prove configured/provider secrets are absent from the bundle and passwords are absent from logs.
- [ ] Apply the K3s release sequence to the target private cluster, wait for migrations and rollout, and verify live liveness/readiness.
- [ ] Perform and verify a disposable PostgreSQL restore from an encrypted backup before relying on recovery.
