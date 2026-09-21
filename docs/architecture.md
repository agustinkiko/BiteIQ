# BiteIQ architecture

## Current foundation slice

```text
Expo client
  -> EXPO_PUBLIC_API_URL (/api)
  -> Fastify API
     -> Better Auth email/password sessions
     -> Drizzle ORM -> PostgreSQL
     -> USDA FoodData Central, server side only when configured
```

BiteIQ is a private, self-hosted system for exactly two independent private people. The Expo client stores Better Auth session material with SecureStore and sends its session cookie to Fastify. Fastify resolves the user from that session; repository methods scope reads and writes to that user, isolating profiles, goals, and diaries. Public registration is disabled, and an operator creates each account with the interactive server command.

The foundation server owns profiles, goals, canonical foods, food provenance, servings, diary entries, immutable nutrition snapshots, and transactional daily summaries. The client may preview a serving calculation, but sends only canonical food/serving IDs and quantity for diary writes. The server is authoritative for persistence and totals.

## Components

### Expo client

`App.tsx` composes query, safe-area, navigation, hydration, and auth gates. `src/auth/authClient.ts` requires `EXPO_PUBLIC_API_URL`, uses the `biteiq` scheme, and stores session material in SecureStore. `src/api/client.ts` attaches that cookie, normalizes API errors, and does not log response bodies.

`src/repositories/profileRepository.ts`, `foodRepository.ts`, and `diaryRepository.ts` are the client-to-server boundaries. Canonical food search and server diary routes do not accept client-supplied calories, nutrients, or user IDs. Client diary add/edit wiring and the limited offline queue are implemented and Task 12 review-approved (93 client tests). The queue is only for new entries; editing/delete remain online operations. This review evidence does not replace device, live API, two-account, real-USDA, restart, K3s, or restore acceptance.

Legacy AsyncStorage data, bundled foods, AI capture, barcode, label, voice, fasting, subscriptions, and planning are not production foundation flows. They must remain visibly development-only until each has a server contract.

### Fastify API

`server/src/app.ts` registers public liveness/readiness endpoints, Better Auth forwarding, session resolution, structured completion logging, and goals, foods, and diary routes. Requests larger than 64 KiB are rejected. Error responses use stable codes in [API.md](API.md).

`server/src/index.ts` creates PostgreSQL, Better Auth, the nutrition provider registry, and the database-readiness callback; it owns listening and graceful shutdown. `server/src/config.ts` validates the environment and rejects a short production `AUTH_SECRET` or Expo wildcard origins in production.

### PostgreSQL and migrations

Drizzle schema lives in `server/src/db/schema`; checked-in SQL migrations live in `server/migrations`. `db:migrate` is the local source-friendly runner; `db:migrate:prod` runs compiled migrations for the K3s Job. The schema uses UUIDs and user-scoped records. Diary updates use transactional snapshots and daily-summary recomputation; `(user_id, client_id)` is the create idempotency key.

### Nutrition provider

`server/src/providers/nutrition/usda.ts` is the production nutrition provider. It holds `USDA_FDC_API_KEY` at the server boundary, validates and normalizes FDC responses, uses an eight-second timeout, and caches successful searches for five minutes. `server/src/modules/foods/repository.ts` persists and updates provider data by `(provider, external ID)` without changing the canonical UUID. See [NUTRITION_DATA.md](NUTRITION_DATA.md).

## Runtime and operations

`deploy/compose.yaml` is the local development harness. PostgreSQL is bound to `127.0.0.1:55432`; the API is bound to `127.0.0.1:4000`. It is not the production image path.

`server/Dockerfile` builds the production API image. `deploy/k8s/base` defines private K3s resources; `deploy/k8s/example` is a private LAN/VPN example that adds `biteiq.home.arpa` and Traefik TLS redirect. PostgreSQL has no Ingress. Secrets are external to the base Kustomization so an overlay cannot replace a live Secret with empty values. Backup, restore, and release instructions are in [OPERATIONS.md](OPERATIONS.md).

## Proven boundaries

Fresh server/client tests, a clean Compose migration and health run, two-account API isolation, diary persistence across an API restart, K3s rendering, the production Docker build, the Expo web export, and bundle/log secret scans are recorded in the implementation checklist. They do not prove a live USDA request, a two-account device walkthrough, a client restart, a verified restore, or a successful K3s deployment. Those remain release gates rather than architecture claims.
