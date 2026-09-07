# BiteIQ Implementation Checklist

## Phase 0: Architecture

- [x] Inspect the existing Expo application and uncommitted work.
- [x] Confirm self-hosted Fastify and PostgreSQL architecture.
- [x] Confirm two separate email/password accounts.
- [x] Confirm private LAN/VPN access.
- [x] Approve the Phase 1 and Phase 2 design specification.
- [ ] Complete the implementation plan review.

## Phase 1: Foundation

- [ ] Add the Fastify server package and test harness.
- [ ] Add PostgreSQL and Drizzle configuration.
- [ ] Create and verify the first database migration.
- [ ] Add private email/password authentication.
- [ ] Add server-only account creation and password reset commands.
- [ ] Prove User A cannot access User B's records.
- [ ] Add profile persistence and onboarding APIs.
- [ ] Add Mifflin-St Jeor BMR and TDEE calculations.
- [ ] Preserve manually entered calorie targets.
- [ ] Add macro percentage and exact-gram targets.
- [ ] Connect login and onboarding screens to the API.

## Phase 2: Real Nutrition

- [ ] Add canonical nutrients, foods, aliases, servings, and provenance.
- [ ] Add the server-side nutrition-provider interface.
- [ ] Add the USDA FoodData Central provider.
- [ ] Add local-first food search and USDA fallback.
- [ ] Keep USDA credentials out of the Expo client.
- [ ] Add deterministic serving and nutrient calculations.
- [ ] Preserve full decimal precision until display.
- [ ] Add persistent diary days and nutrition snapshots.
- [ ] Add, edit, and delete diary entries through the API.
- [ ] Recompute daily summaries transactionally.
- [ ] Connect food search, food detail, diary, and dashboard screens to the API.
- [ ] Add recent-food ranking per user.

## Operations

- [ ] Add `.env.example` without secrets.
- [ ] Add Docker Compose development services.
- [ ] Add K3s API, migration, PostgreSQL, storage, service, and ingress manifests.
- [ ] Add health and readiness checks.
- [ ] Document PostgreSQL backup and restore.
- [ ] Document USDA attribution, caching, storage, and licensing.
- [ ] Update README and API documentation.

## Verification Gates

- [ ] Server unit tests pass.
- [ ] Server integration and authorization tests pass against PostgreSQL.
- [ ] Client tests pass.
- [ ] Type checks pass for the client and server.
- [ ] Lint passes for the client and server.
- [ ] Production builds pass for the client and server.
- [ ] Docker Compose health checks pass.
- [ ] K3s manifests render with no embedded secret values.
- [ ] Two real accounts can sign in and retain separate persisted diaries.
- [ ] A real USDA food can be searched, served, logged, edited, and deleted.
- [ ] Restarting the API and client preserves both users' histories.
