# BiteIQ Foundation and Real Nutrition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing Expo prototype into a private two-user nutrition tracker backed by a self-hosted Fastify API, PostgreSQL, server-side USDA search, and persistent diary snapshots.

**Architecture:** Preserve the Expo client at the repository root and add an independent TypeScript service under `server/`. The service owns authentication, validation, nutrition calculations, USDA access, and PostgreSQL transactions; the client uses TanStack Query for server state and keeps only UI state and an offline cache in Zustand.

**Tech Stack:** Expo SDK 51, React Native, TypeScript, TanStack Query, Zustand, Fastify, Better Auth, Drizzle ORM, PostgreSQL, Zod, Vitest, Jest Expo, Docker Compose, and K3s manifests.

**Spec:** `docs/superpowers/specs/2026-09-07-foundation-real-nutrition-design.md`

## Global Constraints

- Preserve all pre-existing uncommitted files and changes.
- The application has exactly two independently owned accounts; never use email as a data foreign key.
- Access is limited to the homelab LAN or private VPN and still requires HTTPS in production.
- Public registration, social login, email verification, and email-based password reset remain disabled.
- PostgreSQL is the durable source of truth; AsyncStorage is only a cache and offline outbox.
- Provider credentials are server-only and must never enter Expo state or bundles.
- Diary entries store immutable food, serving, source, calorie, and nutrient snapshots.
- Store timestamps in UTC and derive diary dates using the user's IANA timezone.
- Use decimal precision through calculation and persistence; round only for display.
- Do not convert volume to mass without a food-specific serving relationship.
- Test every behavior with a failing test before production code.
- Stage and commit only files owned by the current task.

## Planned File Map

- `server/src/app.ts` composes Fastify without binding a port.
- `server/src/auth/` owns Better Auth, the request guard, and account commands.
- `server/src/db/` owns Drizzle schema, migrations, and PostgreSQL connections.
- `server/src/modules/goals/` owns profile, BMR, TDEE, macro, and goal logic.
- `server/src/modules/foods/` owns canonical food storage, search, and serving math.
- `server/src/modules/diary/` owns snapshots and transactional daily totals.
- `server/src/providers/nutrition/` owns the provider interface and USDA adapter.
- `src/api/`, `src/auth/`, and `src/repositories/` isolate client networking.
- `src/store/useOfflineStore.ts` owns the per-user cache and create-entry outbox.
- `deploy/` contains Compose and K3s resources.
- `docs/API.md`, `docs/NUTRITION_DATA.md`, and `docs/OPERATIONS.md` document the operating contract.

---

### Task 1: Fastify Service and Local PostgreSQL Harness

**Files:**

- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/vitest.config.ts`
- Create: `server/vitest.integration.config.ts`
- Create: `server/eslint.config.js`
- Create: `server/src/config.ts`
- Create: `server/src/app.ts`
- Create: `server/src/errors.ts`
- Create: `server/src/index.ts`
- Create: `server/tests/health.test.ts`
- Create: `.env.example`
- Create: `deploy/compose.yaml`
- Modify: `package.json`

**Interfaces:**

- Produces: `buildApp(options?: { logger?: boolean }): Promise<FastifyInstance>`.
- Produces: `loadConfig(env: NodeJS.ProcessEnv): ServerConfig`.
- Produces: `GET /api/health/live -> { status: "ok" }`.
- Consumes: no earlier task interfaces.

- [ ] **Step 1: Create the isolated service package**

Use ESM and add `dev`, `build`, `start`, `typecheck`, `test`, `test:integration`, `db:generate`, `db:migrate`, `account:create`, and `account:reset-password` scripts. Install with:

```bash
npm install --prefix server fastify @fastify/cors @fastify/rate-limit better-auth @better-auth/expo @better-auth/drizzle-adapter drizzle-orm pg zod
npm install --prefix server --save-dev @eslint/js @types/node @types/pg drizzle-kit eslint tsx typescript typescript-eslint vitest
```

The service package must include `lint: "eslint src tests"`.

- [ ] **Step 2: Write the failing health-route test**

```ts
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("health routes", () => {
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;
  afterEach(async () => app?.close());

  it("reports that the API process is alive", async () => {
    app = await buildApp({ logger: false });
    const response = await app.inject({ method: "GET", url: "/api/health/live" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 3: Run RED**

```bash
npm --prefix server test -- tests/health.test.ts
```

Expected: failure because `server/src/app.ts` does not exist.

- [ ] **Step 4: Implement the server composition and config**

`buildApp` creates Fastify and registers routes without calling `listen`. `src/index.ts` binds the configured port and closes on `SIGTERM` or `SIGINT`. `src/errors.ts` defines stable error codes and maps unknown failures to a response that never exposes stack traces. Use this config shape:

```ts
export type ServerConfig = {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  databaseUrl: string;
  authSecret: string;
  appUrl: string;
  clientOrigins: string[];
  usdaApiKey?: string;
};
```

Reject missing `DATABASE_URL`, `AUTH_SECRET`, or `APP_URL`. Require at least 32 characters for production `AUTH_SECRET`.

- [ ] **Step 5: Add local configuration**

Add non-secret `.env.example` values. Define `postgres` and `api` services in Compose, a named database volume, a PostgreSQL health check, and API port `4000` bound only to `127.0.0.1`. Add root scripts `server:dev`, `server:test`, and `server:typecheck` without removing existing scripts.

- [ ] **Step 6: Run GREEN and commit**

```bash
npm --prefix server test -- tests/health.test.ts
npm --prefix server run typecheck
npm --prefix server run lint
docker compose -f deploy/compose.yaml config
git diff --check
git add .env.example package.json server deploy/compose.yaml
git commit -m "feat: add BiteIQ API foundation"
```

---

### Task 2: PostgreSQL Schema and Migrations

**Files:**

- Create: `server/drizzle.config.ts`
- Create: `server/src/db/client.ts`
- Create: `server/src/db/migrate.ts`
- Create: `server/src/db/schema/auth.ts`
- Create: `server/src/db/schema/users.ts`
- Create: `server/src/db/schema/foods.ts`
- Create: `server/src/db/schema/diary.ts`
- Create: `server/src/db/schema/index.ts`
- Create: `server/tests/integration/schema.test.ts`
- Create: `server/tests/integration/setup.ts`
- Create: `server/migrations/*.sql`

**Interfaces:**

- Produces: `createDb(databaseUrl: string): BiteIqDatabase`.
- Produces: auth, profile, goal, nutrient, food, alias, serving, source, diary, entry, and daily-summary tables from the approved spec.
- Consumes: `ServerConfig.databaseUrl` from Task 1.

- [ ] **Step 1: Write failing database constraint tests**

Insert two users and same-date diary rows for each; assert those succeed. Assert duplicate `(provider, external_id)`, a negative nutrient, and an entry whose `user_id` differs from its diary-day owner each fail with a database constraint error. Query `pg_indexes` and assert the normalized food-name trigram index exists.

- [ ] **Step 2: Run RED**

```bash
docker compose -f deploy/compose.yaml up -d postgres
npm --prefix server run test:integration -- tests/integration/schema.test.ts
```

Expected: failure because migrations do not exist.

- [ ] **Step 3: Define schema and ownership constraints**

Use UUID primary keys, `numeric` nutrition values, UTC `timestamptz`, and local `date`. Implement every field and check from the spec. Enforce matching diary ownership with:

```ts
unique("diary_days_id_user_id_unique").on(table.id, table.userId)
```

```ts
foreignKey({
  columns: [table.diaryDayId, table.userId],
  foreignColumns: [diaryDays.id, diaryDays.userId]
}).onDelete("cascade")
```

Enable `pg_trgm`; add GIN indexes on food names and aliases. Add positive-quantity, non-negative-nutrient, supported-enum, and consumed-basis checks.

- [ ] **Step 4: Generate, inspect, and run migrations**

```bash
npm --prefix server run db:generate
npm --prefix server run db:migrate
```

Confirm the generated SQL contains every composite key, foreign key, check, unique provider ID, extension, and index. The runner must close its pool in `finally` and exit non-zero on failure.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm --prefix server run test:integration -- tests/integration/schema.test.ts
npm --prefix server run typecheck
git diff --check
git add server/drizzle.config.ts server/src/db server/migrations server/tests/integration
git commit -m "feat: add normalized nutrition database"
```

---

### Task 3: Private Two-User Authentication

**Files:**

- Create: `server/src/auth/auth.ts`
- Create: `server/src/auth/guard.ts`
- Create: `server/src/auth/types.ts`
- Create: `server/src/auth/password-prompt.ts`
- Create: `server/src/scripts/account-create.ts`
- Create: `server/src/scripts/account-reset-password.ts`
- Create: `server/tests/auth.test.ts`
- Create: `server/tests/integration/auth-isolation.test.ts`
- Modify: `server/src/app.ts`

**Interfaces:**

- Produces: `createAuth(db, config): BetterAuthInstance`.
- Produces: `requireUser(request): Promise<{ id: string; email: string; name: string }>`.
- Produces: prompt-based account create and password reset commands.
- Consumes: Task 2 authentication tables and database client.

- [ ] **Step 1: Write failing auth tests**

```ts
expect((await signIn(validCredentials)).statusCode).toBe(200);
expect((await signIn(wrongPassword)).statusCode).toBe(401);
expect((await publicSignUp()).statusCode).toBe(403);
expect((await getPrivateRouteWithoutSession()).statusCode).toBe(401);
```

Create User A and User B. Authenticate as User A, request User B's resource UUID, and assert `404` with no owner information.

- [ ] **Step 2: Run RED**

```bash
npm --prefix server test -- tests/auth.test.ts
npm --prefix server run test:integration -- tests/integration/auth-isolation.test.ts
```

Expected: failure because auth routes and the guard do not exist.

- [ ] **Step 3: Configure auth and protection**

Use the Drizzle PostgreSQL adapter, UUID IDs, Expo plugin, admin plugin, secure production cookies, and:

```ts
emailAndPassword: {
  enabled: true,
  disableSignUp: true,
  minPasswordLength: 12,
  maxPasswordLength: 128
}
```

Trust configured web origins and `biteiq://`. Permit Expo wildcard origins only in development. Map unknown email and wrong password to the same public error.

- [ ] **Step 4: Implement account commands**

`account:create` requires `--email` and `--name`, prompts twice without echo, rejects mismatches, and uses Better Auth's server-side admin operation. `account:reset-password` prompts twice, updates the credential, and revokes all sessions. Neither accepts or logs a password argument.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm --prefix server test -- tests/auth.test.ts
npm --prefix server run test:integration -- tests/integration/auth-isolation.test.ts
npm --prefix server run typecheck
git diff --check
git add server/src/auth server/src/scripts server/src/app.ts server/tests/auth.test.ts server/tests/integration/auth-isolation.test.ts
git commit -m "feat: add private two-user authentication"
```

---

### Task 4: Profile, BMR, TDEE, and Goal APIs

**Files:**

- Create: `server/src/modules/goals/contracts.ts`
- Create: `server/src/modules/goals/calculator.ts`
- Create: `server/src/modules/goals/repository.ts`
- Create: `server/src/modules/goals/routes.ts`
- Create: `server/tests/goals/calculator.test.ts`
- Create: `server/tests/integration/goals-routes.test.ts`
- Modify: `server/src/app.ts`

**Interfaces:**

- Produces: `calculateGoal(input: GoalCalculationInput): CalculatedGoal`.
- Produces: user-scoped `getProfile`, `upsertProfile`, `getGoal`, and `upsertGoal`.
- Produces: `GET/PATCH /api/me`, `GET/PUT /api/goals`, and `POST /api/goals/calculate`.
- Consumes: `requireUser` and Task 2 user tables.

- [ ] **Step 1: Write failing calculation tests**

For `male, age 30, 80 kg, 180 cm, sedentary`, assert BMR `1780` and TDEE `2136`. For the female equation, assert BMR `1614`. Assert `-0.5 kg/week` produces `-550 kcal/day`. Assert a manual `2100 kcal` target remains `2100` after profile changes. Assert `30/40/30` at `2000 kcal` returns `150.000 g` protein, `200.000 g` carbohydrate, and `66.667 g` fat at the schema's three-decimal target precision.

- [ ] **Step 2: Run RED**

```bash
npm --prefix server test -- tests/goals/calculator.test.ts
```

Expected: failure because `calculateGoal` does not exist.

- [ ] **Step 3: Implement strict calculations and routes**

Use the spec's equations and multipliers. Calculate age in the user's timezone. Return `EXTREME_RATE` and `LOW_CALORIE_TARGET` warnings without clamping. Require a manual target when sex is unspecified. Reject unknown fields, invalid timezones and dates, and macro percentages not totaling 100. Persist the full calculation audit in one transaction using the session UUID.

- [ ] **Step 4: Run API isolation tests**

Assert User A can change only their profile and goal, cannot inject a `userId`, and cannot alter User B's rows.

```bash
npm --prefix server run test:integration -- tests/integration/goals-routes.test.ts
```

- [ ] **Step 5: Run GREEN and commit**

```bash
npm --prefix server test -- tests/goals/calculator.test.ts
npm --prefix server run typecheck
git diff --check
git add server/src/modules/goals server/src/app.ts server/tests/goals server/tests/integration/goals-routes.test.ts
git commit -m "feat: add personalized nutrition goals"
```

---

### Task 5: Precise Nutrition Engine and Provider Contract

**Files:**

- Create: `server/src/modules/foods/contracts.ts`
- Create: `server/src/modules/foods/nutrition.ts`
- Create: `server/src/providers/nutrition/types.ts`
- Create: `server/src/providers/nutrition/development.ts`
- Create: `server/tests/foods/nutrition.test.ts`
- Create: `server/tests/providers/development.test.ts`

**Interfaces:**

- Produces: `calculateServingNutrition(food, serving, quantity): NutrientSnapshot`.
- Produces: `NutritionProvider` with `searchFoods`, `getFood`, `lookupBarcode`, and `providerMetadata`.
- Consumes: Task 2 canonical nutrition vocabulary.

- [ ] **Step 1: Write the failing chicken fixture test**

```ts
expect(calculateServingNutrition(chickenPer100g, serving150g, "1")).toEqual({
  calories: "247.500000",
  nutrients: {
    protein: { amount: "46.500000", unit: "g" },
    carbohydrate: { amount: "0.000000", unit: "g" },
    fat: { amount: "5.400000", unit: "g" }
  },
  consumedGrams: "150.0000",
  consumedMilliliters: null
});
```

Add separate failures for zero or negative quantity, missing gram weight, and volume data without a volume basis.

- [ ] **Step 2: Run RED**

```bash
npm --prefix server test -- tests/foods/nutrition.test.ts
```

Expected: failure because the engine does not exist.

- [ ] **Step 3: Implement decimal calculation**

```bash
npm install --prefix server decimal.js
```

Calculate `sourceAmount * consumedBasis / sourceBasis`, serialize fixed decimal strings, and never call `Math.round` inside the server engine.

- [ ] **Step 4: Test and implement the development provider**

Assert it returns the chicken fixture with provider `development`, state `unverified`, stable external ID, 100 g basis, and 150 g serving. Assert construction throws `DEVELOPMENT_PROVIDER_DISABLED` in production.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm --prefix server test -- tests/foods/nutrition.test.ts tests/providers/development.test.ts
npm --prefix server run typecheck
git diff --check
git add server/package.json server/package-lock.json server/src/modules/foods server/src/providers/nutrition server/tests/foods server/tests/providers/development.test.ts
git commit -m "feat: add canonical nutrition engine"
```

---

### Task 6: USDA FoodData Central Adapter

**Files:**

- Create: `server/src/providers/nutrition/usda.ts`
- Create: `server/src/providers/nutrition/registry.ts`
- Create: `server/tests/fixtures/usda-search.json`
- Create: `server/tests/fixtures/usda-detail.json`
- Create: `server/tests/providers/usda.test.ts`

**Interfaces:**

- Produces: `createUsdaProvider(config, fetchImpl?): NutritionProvider`.
- Produces: `createNutritionRegistry(config): NutritionProviderRegistry`.
- Consumes: Task 5 provider contract and `ServerConfig.usdaApiKey`.

- [ ] **Step 1: Write failing normalization tests**

Use checked-in Foundation, FNDDS, and Branded fixtures. Assert FDC ID, data type, description, brand, preparation state, per-100 g nutrients, servings, source date, and verification state. Include a kJ-only fixture and assert `418.4 kJ` becomes `100 kcal`. Reject negative nutrients, non-finite values, missing FDC IDs, and zero-weight servings. Assert the API key appears in the outgoing request but not the result.

- [ ] **Step 2: Run RED**

```bash
npm --prefix server test -- tests/providers/usda.test.ts
```

Expected: failure because the USDA provider does not exist.

- [ ] **Step 3: Implement USDA search and detail**

Use FoodData Central `/foods/search` and `/food/{fdcId}`. Apply an eight-second timeout. Map Foundation and FNDDS to `verified_authoritative`; map Branded to `verified_manufacturer`. Preserve label kcal and convert kJ only when kcal is absent.

- [ ] **Step 4: Implement caching and request deduplication**

Cache clean normalized results for five minutes by normalized query and limit. Share one promise for identical in-flight calls. Never cache timeouts, rate limits, invalid payloads, or server errors.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm --prefix server test -- tests/providers/usda.test.ts
npm --prefix server run typecheck
git diff --check
git add server/src/providers/nutrition/usda.ts server/src/providers/nutrition/registry.ts server/tests/fixtures server/tests/providers/usda.test.ts
git commit -m "feat: add server-side USDA provider"
```

---

### Task 7: Canonical Food Persistence and Search API

**Files:**

- Create: `server/src/modules/foods/repository.ts`
- Create: `server/src/modules/foods/routes.ts`
- Create: `server/tests/integration/food-repository.test.ts`
- Create: `server/tests/integration/food-routes.test.ts`
- Modify: `server/src/app.ts`

**Interfaces:**

- Produces: `searchLocalFoods(userId, query, limit): Promise<CanonicalFood[]>`.
- Produces: `upsertProviderFood(providerFood): Promise<CanonicalFood>`.
- Produces: `GET /api/foods/search?q=&limit=` and `GET /api/foods/:id`.
- Consumes: Tasks 2, 3, and 6.

- [ ] **Step 1: Write failing persistence tests**

Upsert the same USDA fixture twice. Assert one food, one source, one row per nutrient, and no duplicate servings. Change one provider nutrient and assert the same canonical UUID is updated. Insert alias `chiken breast`; assert it finds `Chicken breast, cooked`. Assert User A's recent use cannot affect User B's rank.

- [ ] **Step 2: Run RED**

```bash
npm --prefix server run test:integration -- tests/integration/food-repository.test.ts
```

Expected: failure because the repository does not exist.

- [ ] **Step 3: Implement transactional upserts and ranking**

Normalize Unicode and whitespace. Upsert by `(provider, external_id)` and replace provider-owned nutrients and servings in the same transaction. Rank exact name, prefix, alias/trigram, country, quality, user recency, and user frequency in that order.

- [ ] **Step 4: Write failing route tests**

Assert short queries return recent suggestions without USDA. Assert sufficient local results skip USDA. Assert insufficient local results fetch and persist USDA. Assert a provider timeout returns local results plus a warning. Assert missing or disabled foods return `404 FOOD_NOT_FOUND`.

- [ ] **Step 5: Implement strict authenticated routes**

Require a session. Limit results from 1 through 50. Reject unknown query fields. Return source, quality, brand, preparation state, nutrients, and all valid servings.

- [ ] **Step 6: Run GREEN and commit**

```bash
npm --prefix server run test:integration -- tests/integration/food-repository.test.ts tests/integration/food-routes.test.ts
npm --prefix server run typecheck
git diff --check
git add server/src/modules/foods/repository.ts server/src/modules/foods/routes.ts server/src/app.ts server/tests/integration/food-repository.test.ts server/tests/integration/food-routes.test.ts
git commit -m "feat: add canonical food search API"
```

---

### Task 8: Persistent Diary Snapshots and Daily Summaries

**Files:**

- Create: `server/src/modules/diary/contracts.ts`
- Create: `server/src/modules/diary/repository.ts`
- Create: `server/src/modules/diary/routes.ts`
- Create: `server/tests/integration/diary-repository.test.ts`
- Create: `server/tests/integration/diary-routes.test.ts`
- Modify: `server/src/app.ts`

**Interfaces:**

- Produces: `getDiary(userId, localDate): Promise<DiaryDayDto>`.
- Produces: user-scoped `createEntry`, `updateEntry`, and `deleteEntry` transactions.
- Produces: diary GET, POST, PATCH, and DELETE routes.
- Consumes: Tasks 3, 4, 5, and 7.

- [ ] **Step 1: Write failing snapshot tests**

Log the 150 g chicken fixture. Assert literal food, serving, USDA source, `247.5` calories, and `46.5` protein snapshots. Change the canonical food and assert history remains unchanged. Assert the daily summary matches the snapshots.

- [ ] **Step 2: Write failing transaction tests**

Double quantity and assert the entry and summary double. Delete it and assert totals become zero. Force summary persistence to fail and assert the entry mutation rolls back.

- [ ] **Step 3: Run RED**

```bash
npm --prefix server run test:integration -- tests/integration/diary-repository.test.ts
```

Expected: failure because diary transactions do not exist.

- [ ] **Step 4: Implement diary transactions**

Accept only `clientId`, `foodId`, `servingId`, `quantity`, `mealType`, and `consumedAt`. Derive owner, local date, and nutrition on the server. Lock the user's diary day, mutate, recompute the summary from snapshots, and commit atomically. Make `(user_id, client_id)` unique for retry safety.

- [ ] **Step 5: Test and implement route authorization**

Assert User A receives `404` for User B's entry UUID. Assert `00:30 Asia/Manila` uses the new Manila date. Reject impossible dates, unknown fields, unsupported meals, and zero quantity. Implement the strict routes only after those tests fail correctly.

- [ ] **Step 6: Run GREEN and commit**

```bash
npm --prefix server run test:integration -- tests/integration/diary-repository.test.ts tests/integration/diary-routes.test.ts
npm --prefix server run typecheck
git diff --check
git add server/src/modules/diary server/src/app.ts server/tests/integration/diary-repository.test.ts server/tests/integration/diary-routes.test.ts
git commit -m "feat: add persistent nutrition diary"
```

---

### Task 9: Expo Authentication and API Client

**Files:**

- Create: `src/api/client.ts`
- Create: `src/api/contracts.ts`
- Create: `src/api/__tests__/client.test.ts`
- Create: `src/auth/authClient.ts`
- Create: `src/auth/AuthGate.tsx`
- Create: `src/auth/__tests__/AuthGate.test.tsx`
- Create: `src/screens/LoginScreen.tsx`
- Create: `eslint.config.js`
- Create: `jest.config.js`
- Create: `jest.setup.js`
- Modify: `App.tsx`
- Modify: `src/navigation/AppNavigator.tsx`
- Modify: `package.json`
- Modify: `app.json`

**Interfaces:**

- Produces: `apiRequest<T>(path, options?): Promise<T>`.
- Produces: `authClient`, `AuthGate`, and `LoginScreen`.
- Consumes: Task 3 auth routes.

- [ ] **Step 1: Install client auth and testing packages**

```bash
npx expo install expo-secure-store expo-network expo-linking expo-web-browser expo-constants
npm install better-auth @better-auth/expo
npm install --save-dev @testing-library/jest-native @testing-library/react-native eslint eslint-config-expo jest-expo
```

Configure Jest with the `jest-expo` preset. Configure ESLint with the Expo rules. Add `test`, `test:client`, and `lint` scripts without deleting existing scripts.

- [ ] **Step 2: Write failing API and routing tests**

Assert requests use `EXPO_PUBLIC_API_URL`, attach the secure session cookie, send JSON headers, map `401` to `AUTH_REQUIRED`, and never log response bodies. Render `AuthGate` in four states: loading, signed out, signed in without profile, and signed in with profile.

- [ ] **Step 3: Run RED**

```bash
npm run test:client -- src/api/__tests__/client.test.ts src/auth/__tests__/AuthGate.test.tsx
```

Expected: failure because the API and auth modules do not exist.

- [ ] **Step 4: Implement secure login**

Configure scheme `biteiq`, SecureStore, and the API URL. Login accepts email and password, shows one invalid-credential message, prevents duplicate submission, and never persists the password. Make `App.tsx` render `AuthGate` inside the existing providers.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm run test:client -- src/api/__tests__/client.test.ts src/auth/__tests__/AuthGate.test.tsx
npm run typecheck
git diff --check
git add App.tsx app.json package.json package-lock.json eslint.config.js jest.config.js jest.setup.js src/api src/auth src/screens/LoginScreen.tsx src/navigation/AppNavigator.tsx
git commit -m "feat: connect Expo authentication"
```

---

### Task 10: Server-Backed Onboarding and Goals

**Files:**

- Create: `src/repositories/profileRepository.ts`
- Create: `src/repositories/__tests__/profileRepository.test.ts`
- Create: `src/services/goalPresentation.ts`
- Create: `src/services/__tests__/goalPresentation.test.ts`
- Modify: `src/screens/OnboardingScreen.tsx`
- Modify: `src/screens/GoalsScreen.tsx`
- Modify: `src/store/useAppStore.ts`
- Modify: `src/types/domain.ts`

**Interfaces:**

- Produces: profile `get`, `update`, `calculateGoal`, and `saveGoal` calls.
- Produces: `formatGoalExplanation(calculatedGoal): string[]`.
- Consumes: Task 4 routes and Task 9 API client.

- [ ] **Step 1: Write failing repository tests**

Assert payloads include required profile and goal fields but no user UUID. Assert `LOW_CALORIE_TARGET` requires an explicit second confirmation. Assert the explanation names equation, BMR, multiplier, TDEE, adjustment, target, and `estimate`.

- [ ] **Step 2: Run RED**

```bash
npm run test:client -- src/repositories/__tests__/profileRepository.test.ts src/services/__tests__/goalPresentation.test.ts
```

Expected: failure because the repository and formatter do not exist.

- [ ] **Step 3: Implement onboarding and goal editing**

Create steps for personal details, goal, activity, calculated target review, and explicit safety confirmation. Default to the device IANA timezone. Keep metric API values and convert imperial input only at the form boundary. Do not use persisted Zustand profile or goal values as authoritative after login.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm run test:client -- src/repositories/__tests__/profileRepository.test.ts src/services/__tests__/goalPresentation.test.ts
npm run typecheck
git diff --check
git add src/repositories/profileRepository.ts src/repositories/__tests__/profileRepository.test.ts src/services/goalPresentation.ts src/services/__tests__/goalPresentation.test.ts src/screens/OnboardingScreen.tsx src/screens/GoalsScreen.tsx src/store/useAppStore.ts src/types/domain.ts
git commit -m "feat: persist onboarding and goals"
```

---

### Task 11: Server-Backed Food Search and Serving Selection

**Files:**

- Create: `src/repositories/foodRepository.ts`
- Create: `src/repositories/__tests__/foodRepository.test.ts`
- Modify: `src/screens/FoodSearchScreen.tsx`
- Modify: `src/screens/FoodDetailScreen.tsx`
- Modify: `src/services/foodSearch.ts`
- Modify: `src/services/food/foodSources.ts`
- Modify: `src/config/defaults.ts`
- Modify: `src/types/domain.ts`

**Interfaces:**

- Produces: `foodRepository.search(query, signal)` and `foodRepository.get(foodId)`.
- Consumes: Task 7 routes and Task 9 API client.

- [ ] **Step 1: Write failing client repository tests**

Assert query trimming, cancellation, provider warnings, source and quality mapping, multiple servings, preparation state, and empty results. Assert serialized client configuration contains no USDA, FatSecret, Edamam, or AI secret fields.

- [ ] **Step 2: Run RED**

```bash
npm run test:client -- src/repositories/__tests__/foodRepository.test.ts
```

Expected: failure because the server-backed repository does not exist.

- [ ] **Step 3: Implement search and food detail**

Debounce search by 250 ms. Show loading, empty, local-plus-warning, and complete-error states. Display source, quality, brand, and preparation state. Keep serving and quantity as local preview state until `Add`; never send preview calories or nutrients.

- [ ] **Step 4: Remove production provider secrets from the client**

Delete client API-key and client-secret fields. Keep bundled foods only as clearly labeled development/offline examples. Route every real USDA request through the API.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm run test:client -- src/repositories/__tests__/foodRepository.test.ts
npm run typecheck
git diff --check
git add src/repositories/foodRepository.ts src/repositories/__tests__/foodRepository.test.ts src/screens/FoodSearchScreen.tsx src/screens/FoodDetailScreen.tsx src/services/foodSearch.ts src/services/food/foodSources.ts src/config/defaults.ts src/types/domain.ts
git commit -m "feat: connect canonical food search"
```

---

### Task 12: Server-Backed Diary and Offline Create Queue

**Files:**

- Create: `src/repositories/diaryRepository.ts`
- Create: `src/repositories/__tests__/diaryRepository.test.ts`
- Create: `src/hooks/useServerDayLog.ts`
- Create: `src/store/useOfflineStore.ts`
- Create: `src/store/__tests__/useOfflineStore.test.ts`
- Create: `src/config/features.ts`
- Create: `src/config/__tests__/features.test.ts`
- Modify: `src/screens/DiaryScreen.tsx`
- Modify: `src/screens/HomeScreen.tsx`
- Modify: `src/screens/MealDetailScreen.tsx`
- Modify: `src/hooks/useDayLog.ts`
- Modify: `src/store/useAppStore.ts`

**Interfaces:**

- Produces: diary `getDay`, `createEntry`, `updateEntry`, and `deleteEntry` calls.
- Produces: `useServerDayLog(date)` plus `enqueueCreate`, `flushCreates`, and `cacheDay`.
- Consumes: Task 8 routes and Task 11 selection state.

- [ ] **Step 1: Write failing diary repository tests**

Assert date-scoped reads, a client UUID on create, replacement with the server snapshot, mutation cache refresh, and `404` mapping. Assert outgoing create and edit payloads contain no calories or nutrients.

- [ ] **Step 2: Write failing offline tests**

Assert cached days are readable offline, retries reuse the client UUID, successful flush removes one item, failed flush keeps it, and logout clears only that user's cached data.

- [ ] **Step 3: Run RED**

```bash
npm run test:client -- src/repositories/__tests__/diaryRepository.test.ts src/store/__tests__/useOfflineStore.test.ts
```

Expected: failure because the repository and offline store do not exist.

- [ ] **Step 4: Implement server-backed screens**

Use query keys `['diary', userId, date]`. Replace cached days with server mutation responses instead of recomputing authoritative totals. Preserve the existing Today, Diary, and Meal Detail layouts. Do not merge or upload legacy seed logs.

- [ ] **Step 5: Implement the limited offline contract**

Cache synchronized days by user UUID. Queue only new entries. Disable offline edit and delete with `Reconnect to edit or delete this entry.` Flush in creation order and rely on server `(user_id, client_id)` uniqueness.

- [ ] **Step 6: Gate deferred functionality**

Write a failing test that asserts meal photo, barcode, label, voice, natural-language AI, fasting, subscriptions, and planning are disabled in production until their server flows exist. Add typed feature flags, hide disabled actions from normal navigation, and show `Development preview` only in development builds.

- [ ] **Step 7: Run GREEN and commit**

```bash
npm run test:client -- src/repositories/__tests__/diaryRepository.test.ts src/store/__tests__/useOfflineStore.test.ts src/config/__tests__/features.test.ts
npm run typecheck
git diff --check
git add src/repositories/diaryRepository.ts src/repositories/__tests__/diaryRepository.test.ts src/hooks/useServerDayLog.ts src/store/useOfflineStore.ts src/store/__tests__/useOfflineStore.test.ts src/config/features.ts src/config/__tests__/features.test.ts src/screens/DiaryScreen.tsx src/screens/HomeScreen.tsx src/screens/MealDetailScreen.tsx src/hooks/useDayLog.ts src/store/useAppStore.ts src/navigation/AppNavigator.tsx
git commit -m "feat: connect persistent nutrition diary"
```

---

### Task 13: K3s Deployment, Health, and Recovery

**Files:**

- Create: `server/Dockerfile`
- Create: `server/tests/readiness.test.ts`
- Create: `server/tests/logging.test.ts`
- Create: `deploy/k8s/base/kustomization.yaml`
- Create: `deploy/k8s/base/api-deployment.yaml`
- Create: `deploy/k8s/base/api-service.yaml`
- Create: `deploy/k8s/base/api-ingress.yaml`
- Create: `deploy/k8s/base/api-config.yaml`
- Create: `deploy/k8s/base/secret.example.yaml`
- Create: `deploy/k8s/base/postgres-statefulset.yaml`
- Create: `deploy/k8s/base/postgres-service.yaml`
- Create: `deploy/k8s/base/migration-job.yaml`
- Create: `deploy/k8s/example/kustomization.yaml`
- Create: `docs/OPERATIONS.md`
- Modify: `server/src/app.ts`

**Interfaces:**

- Produces: `GET /api/health/ready -> { status: "ready" }` when PostgreSQL responds.
- Produces: private K3s manifests with no embedded secret values.
- Consumes: API image, migrations, and config from prior tasks.

- [ ] **Step 1: Write failing readiness tests**

Inject a database health function. Assert `SELECT 1` success returns 200, database failure returns 503 with `DATABASE_UNAVAILABLE`, and USDA failure does not affect readiness.

- [ ] **Step 2: Run RED**

```bash
npm --prefix server test -- tests/readiness.test.ts
```

Expected: failure because readiness injection does not exist.

- [ ] **Step 3: Implement readiness and image**

Add the readiness route. Build a multi-stage server image containing production dependencies, compiled output, and migrations. Run it as a non-root user. Point liveness and readiness probes at their separate endpoints.

Add a failing logging test before changing logging. Assert one structured record contains request ID, route, status, duration, and authenticated user UUID, while passwords, cookies, request bodies, provider keys, and diary content are absent. Configure Fastify redaction and body limits until the test passes.

- [ ] **Step 4: Add private K3s resources**

Use one PostgreSQL StatefulSet with a persistent claim and ClusterIP. Add a migration Job using the exact API image. Add an API Deployment with resource limits, security context, rolling updates, ClusterIP, and private Ingress. Use `biteiq.home.arpa` only in the example overlay. Keep Secret values empty.

- [ ] **Step 5: Document backup and restore**

Document custom-format `pg_dump`, checksum verification, encrypted private storage, a disposable restore validation, and final `pg_restore --clean --if-exists`. Use explicit namespace, pod, database, and output-path variables.

- [ ] **Step 6: Run GREEN and commit**

```bash
npm --prefix server test -- tests/readiness.test.ts
npm --prefix server test -- tests/logging.test.ts
npm --prefix server run build
docker build -f server/Dockerfile -t biteiq-api:verify .
kubectl kustomize deploy/k8s/example > /tmp/biteiq-rendered.yaml
kubectl apply --dry-run=client -f /tmp/biteiq-rendered.yaml
git diff --check
git add server/Dockerfile server/src/app.ts server/tests/readiness.test.ts server/tests/logging.test.ts deploy/k8s docs/OPERATIONS.md
git commit -m "ops: add private K3s deployment"
```

---

### Task 14: API, Nutrition, and Setup Documentation

**Files:**

- Create: `docs/API.md`
- Create: `docs/NUTRITION_DATA.md`
- Modify: `docs/architecture.md`
- Modify: `docs/IMPLEMENTATION_CHECKLIST.md`
- Modify: `README.md`
- Modify: `.env.example`

**Interfaces:**

- Produces: copy-ready setup, test, migration, account, deployment, backup, and restore instructions.
- Consumes: Tasks 1 through 13.

- [ ] **Step 1: Update the evidence checklist**

Mark an item complete only when its test or manual verification has passed. Do not mark deferred master-roadmap work complete.

- [ ] **Step 2: Document routes and errors**

For every route, state method, path, authentication, request schema, success response, validation response, authorization response, and one request example. Document stable error codes and request IDs.

- [ ] **Step 3: Document USDA policy**

State its purpose, datasets, reliability limits, API-key setup, attribution, FDC IDs, stored fields, five-minute cache, upsert policy, update process, rate limits, and label-calorie rule. Require official terms review before expanding storage or redistribution.

- [ ] **Step 4: Update README and architecture**

Document prerequisites, installation, environment, Compose, migrations, account creation, Expo URL, development, tests, builds, K3s, backup, and restore. Replace local-only claims. Label unsupported AI and deferred screens as development-only.

- [ ] **Step 5: Verify and commit**

```bash
rg -n "T[B]D|T[O]DO|implement l[a]ter|Supabase|myfitnesspal-ai" README.md docs .env.example
git diff --check
git add README.md docs/API.md docs/NUTRITION_DATA.md docs/architecture.md docs/IMPLEMENTATION_CHECKLIST.md .env.example
git commit -m "docs: document BiteIQ operations"
```

Expected: no placeholders, Supabase references, or old product identity in user-facing docs.

---

### Task 15: Full Verification and Two-User Acceptance

**Files:**

- Modify: only files required by a newly reproduced failure, with a failing test added before each fix.
- Modify: `docs/IMPLEMENTATION_CHECKLIST.md` after collecting all evidence.

**Interfaces:**

- Produces: fresh evidence for the approved Phase 1 and Phase 2 slice.
- Consumes: every earlier task.

- [ ] **Step 1: Run all automated checks**

```bash
npm run test:client
npm run typecheck
npm run lint
npx expo export --platform web
npm --prefix server test
npm --prefix server run test:integration
npm --prefix server run typecheck
npm --prefix server run lint
npm --prefix server run build
```

Record exact passing counts. Add a failing regression test before changing code for any failure.

- [ ] **Step 2: Verify a clean local installation**

Start Compose from an empty explicitly named test volume, apply migrations, create two test accounts through the prompt command, and check liveness and readiness. Never print passwords or secrets.

- [ ] **Step 3: Run the end-to-end scenario for both users**

For each account: sign in, complete onboarding, save a goal, search real USDA data, select a serving, log it, edit quantity, confirm totals, delete it, restart API and client, and confirm persisted history. Then attempt User A requests against User B UUIDs and require `404` or `403` with no personal content.

- [ ] **Step 4: Verify secret boundaries**

Build Expo web output. Search it for the configured USDA key value, `FATSECRET_CLIENT_SECRET`, `EDAMAM_APP_KEY`, and `AI_API_KEY`; require zero matches. Search logs for test passwords; require zero matches.

- [ ] **Step 5: Verify deployment artifacts**

```bash
docker compose -f deploy/compose.yaml config
docker build -f server/Dockerfile -t biteiq-api:verify .
kubectl kustomize deploy/k8s/example > /tmp/biteiq-rendered.yaml
kubectl apply --dry-run=client -f /tmp/biteiq-rendered.yaml
git diff --check
```

- [ ] **Step 6: Record verified status**

Mark only proven checklist items complete, then commit:

```bash
git add docs/IMPLEMENTATION_CHECKLIST.md
git commit -m "docs: record foundation verification"
```

Do not call the complete core MVP, Premium, or Premium+ product finished. This plan completes only the approved foundation and real-nutrition slice.
