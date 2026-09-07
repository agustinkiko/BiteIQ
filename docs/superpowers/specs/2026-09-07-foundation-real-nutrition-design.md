# BiteIQ Foundation and Real Nutrition Design

## Purpose

This specification defines the first production slice of BiteIQ: a private,
self-hosted nutrition tracker for two people. It preserves the existing Expo
application and adds the minimum server, database, authentication, nutrition,
and diary foundations needed for reliable daily use.

This slice covers Phase 1 and the essential vertical path from Phase 2. Later
features such as recipes, saved meals, barcode scanning, AI input, analytics,
subscriptions, fasting, and meal planning remain separate projects built on the
interfaces defined here.

## Confirmed Product Decisions

- The application has two independent user accounts.
- Each user has private profiles, goals, diary entries, and summaries.
- Access is limited to the homelab LAN or a private VPN such as Tailscale.
- The existing Expo and React Native client remains the user interface.
- A separate TypeScript Fastify service provides the API.
- PostgreSQL is the durable source of truth.
- Docker Compose supports local development.
- Kubernetes manifests support deployment to K3s.
- Authentication is email and password only.
- Public registration, social login, email verification, and email-based
  password reset are excluded.
- Accounts are created or reset through an explicit server-side command.
- USDA FoodData Central is the first remote nutrition source.
- Provider credentials never enter the Expo bundle or persisted client state.
- Existing uncommitted application work must be preserved.

## Existing System

The current repository contains an Expo SDK 51 React Native application using:

- TypeScript;
- React Navigation;
- Zustand persisted through AsyncStorage;
- TanStack Query;
- React Hook Form and Zod;
- a bundled local food database;
- client-side food adapters for Open Food Facts, USDA, and FatSecret;
- client-side diary, goals, water, exercise, and weight state;
- mock and HTTP-backed AI provider adapters.

The current app type-checks. It has no server, PostgreSQL database, migrations,
authentication boundary, or automated test command. AsyncStorage is currently
the source of truth, and provider settings allow secrets to be stored on the
device. These boundaries must change without rewriting working screens.

## Architecture

### Repository layout

The Expo client stays at the repository root. New server code lives in
`server/` and has its own TypeScript configuration, dependencies, tests, and
commands. Shared network contracts live in focused client and server modules;
the project will not be reorganized into a new monorepo during this slice.

```text
BiteIQ/
  src/                         Existing Expo client
    api/                       Authenticated API client and DTOs
    auth/                      Session provider and login flow
    repositories/             Diary, goal, and food data access
  server/
    src/
      app.ts                   Fastify composition
      auth/                    Better Auth setup and route guard
      db/                      Drizzle client and schema
      modules/
        goals/                 Goal calculation and persistence
        foods/                 Canonical food model and search
        diary/                 Entry snapshots and daily totals
      providers/nutrition/     USDA and development adapters
      scripts/                 Account and seed commands
    migrations/               Versioned PostgreSQL migrations
    tests/                     API and database integration tests
  deploy/
    compose.yaml               Local API and PostgreSQL
    k8s/                       K3s manifests
```

### Runtime components

The Expo client communicates only with the BiteIQ API. The API authenticates
the session, validates the request, applies the authenticated user UUID, and
uses PostgreSQL. Only the API calls USDA.

```text
Expo client
  -> private HTTPS ingress
  -> Fastify API
     -> Better Auth session validation
     -> application service
     -> Drizzle transaction
     -> PostgreSQL
     -> USDA FoodData Central when local food results are insufficient
```

PostgreSQL and the API run inside K3s. PostgreSQL is not exposed through an
Ingress or public load balancer. The API is reachable only through private
network routing. TLS terminates at the existing private ingress controller.

## Authentication and Authorization

Better Auth provides password hashing, opaque sessions, expiration, and
session revocation. Only its email/password capability is enabled, with
`disableSignUp: true`. The Expo integration stores session material in Expo
SecureStore rather than AsyncStorage. Better Auth IDs are configured as UUIDs.

The server provides these administrative commands:

```text
npm run account:create -- --email <email> --name <name>
npm run account:reset-password -- --email <email>
```

Both commands prompt for the password without accepting it as a command-line
argument. This avoids placing the password in shell history. Account creation
returns a UUID. The commands use Better Auth's server-side admin operations;
admin HTTP operations still require an authenticated admin role. The client
does not include sign-up or admin controls, and the email sign-up operation is
disabled by server configuration.

Every API request that reads or changes personal data requires a valid session.
Application queries always include the authenticated user UUID. Repository
methods accept `userId` as a required argument and never infer ownership from
email or request payloads. Requests cannot supply a different owner UUID.

The two-account isolation rule applies to profiles, goals, diary days, food
entries, recent-food statistics, and daily summaries. Authorization integration
tests must prove that User A cannot read, update, or delete User B's records.

## Database Design

All public application identifiers use UUIDs. Timestamps use `timestamptz` and
are stored in UTC. User-local diary dates use PostgreSQL `date` and are derived
from the user's IANA timezone.

### Authentication tables

Better Auth owns its generated user, session, account, and verification tables.
The application references the generated user UUID but does not use email as a
foreign key.

### User and goal tables

`user_profiles`

- `user_id uuid primary key`
- `display_name text not null`
- `date_of_birth date not null`
- `biological_sex text not null`
- `height_cm numeric(7,2) not null`
- `country_code text not null`
- `timezone text not null`
- `language_code text not null default 'en'`
- `measurement_system text not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

`user_goals`

- `id uuid primary key`
- `user_id uuid not null unique`
- `goal_type text not null`
- `starting_weight_kg numeric(7,3) not null`
- `current_weight_kg numeric(7,3) not null`
- `target_weight_kg numeric(7,3) not null`
- `weekly_rate_kg numeric(5,3)`
- `activity_level text not null`
- `planned_exercise_in_activity boolean not null default false`
- `equation text not null`
- `equation_inputs jsonb not null`
- `bmr_kcal numeric(9,3) not null`
- `activity_multiplier numeric(5,3) not null`
- `tdee_kcal numeric(9,3) not null`
- `calorie_adjustment_kcal numeric(9,3) not null`
- `calorie_target_kcal numeric(9,3) not null`
- `protein_target_g numeric(9,3) not null`
- `carbohydrate_target_g numeric(9,3) not null`
- `fat_target_g numeric(9,3) not null`
- `target_mode text not null`
- `is_manual_calorie_target boolean not null default false`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

The `equation_inputs` object is a small audit snapshot, not the primary storage
for profile or goal fields. It records the values used for the most recent
calculation.

### Canonical nutrition tables

`nutrient_definitions`

- `id uuid primary key`
- `canonical_name text not null unique`
- `display_name text not null`
- `unit text not null`
- `nutrient_type text not null`
- `usda_nutrient_id integer unique`
- `display_order integer not null`

`foods`

- `id uuid primary key`
- `name text not null`
- `normalized_name text not null`
- `brand text`
- `description text`
- `category text`
- `country_code text`
- `language_code text`
- `food_type text not null`
- `preparation_state text`
- `ingredients_text text`
- `data_quality text not null`
- `verified boolean not null default false`
- `disabled_at timestamptz`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

`food_aliases`

- `id uuid primary key`
- `food_id uuid not null`
- `alias text not null`
- `normalized_alias text not null`
- `language_code text`
- unique constraint on `food_id, normalized_alias`

`food_servings`

- `id uuid primary key`
- `food_id uuid not null`
- `serving_name text not null`
- `quantity numeric(12,4) not null`
- `unit text not null`
- `gram_weight numeric(12,4)`
- `milliliter_volume numeric(12,4)`
- `is_default boolean not null default false`
- `source text not null`
- `source_serving_id text`

Exactly one of `gram_weight` or `milliliter_volume` may be used unless the
source provides both. Volume is never converted to mass without a food-specific
serving relationship.

`food_nutrients`

- `food_id uuid not null`
- `nutrient_id uuid not null`
- `amount numeric(18,6) not null`
- `basis_quantity numeric(12,4) not null default 100`
- `basis_unit text not null`
- primary key on `food_id, nutrient_id`

`food_external_sources`

- `id uuid primary key`
- `food_id uuid not null`
- `provider text not null`
- `external_id text not null`
- `dataset_type text`
- `provider_updated_at timestamptz`
- `imported_at timestamptz not null`
- `verification_state text not null`
- `original_serving_reference jsonb`
- `license_category text`
- unique constraint on `provider, external_id`

The initial verification states are `verified_authoritative`,
`verified_manufacturer`, `community`, `user_created`, and `unverified`. USDA
Foundation and FNDDS records normalize to `verified_authoritative`; branded
records retain their manufacturer-provided status.

### Diary tables

`diary_days`

- `id uuid primary key`
- `user_id uuid not null`
- `local_date date not null`
- `goal_snapshot jsonb not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`
- unique constraint on `user_id, local_date`

`food_entries`

- `id uuid primary key`
- `diary_day_id uuid not null`
- `user_id uuid not null`
- `meal_type text not null`
- `food_id uuid`
- `food_name_snapshot text not null`
- `brand_snapshot text`
- `source_snapshot jsonb not null`
- `serving_snapshot jsonb not null`
- `quantity numeric(12,4) not null`
- `consumed_grams numeric(12,4)`
- `consumed_milliliters numeric(12,4)`
- `calorie_snapshot numeric(18,6) not null`
- `nutrient_snapshot jsonb not null`
- `consumed_at timestamptz not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

`daily_nutrition_summaries`

- `user_id uuid not null`
- `local_date date not null`
- `calorie_total numeric(18,6) not null`
- `nutrient_totals jsonb not null`
- `goal_snapshot jsonb not null`
- `updated_at timestamptz not null`
- primary key on `user_id, local_date`

Diary snapshots are the historical source of truth. Editing a canonical food or
refreshing a USDA record never changes an existing food entry.

### Indexes and constraints

The first migration includes:

- trigram extension and GIN indexes for normalized food names and aliases;
- index on `food_external_sources(provider, external_id)`;
- index on `food_servings(food_id)`;
- index on `food_entries(user_id, consumed_at)`;
- index on `diary_days(user_id, local_date)`;
- non-negative checks for nutrient amounts, serving quantities, calories, and
  macro targets;
- constrained values for units, activity levels, goal modes, meal types, food
  types, and verification states;
- ownership consistency checks enforced by application transactions and tested
  repository boundaries.

## Goal Calculation

The server owns deterministic nutrition-goal calculations. The default adult
equation is Mifflin-St Jeor:

```text
male:   10W + 6.25H - 5A + 5
female: 10W + 6.25H - 5A - 161
```

`W` is kilograms, `H` is centimeters, and `A` is age in completed years on the
calculation date. When sex is unspecified, BiteIQ cannot calculate a default
Mifflin-St Jeor target; the user must enter a manual calorie target.

The initial activity multipliers are:

- sedentary: `1.2`;
- lightly active: `1.375`;
- moderately active: `1.55`;
- very active: `1.725`;
- extremely active: `1.9`.

TDEE equals BMR multiplied by the activity multiplier. A weekly weight-change
rate converts to a daily energy adjustment using `7,700 kcal/kg` divided by
seven days. The UI displays the result as an estimate and warns on rates beyond
`1 kg/week` or a calculated target below `1,200 kcal/day`. These conditions do
not silently change user input; they require explicit confirmation.

A manual calorie target sets `is_manual_calorie_target=true`. Later profile or
weight updates recalculate BMR and TDEE for reference but never overwrite the
manual target.

Macro percentage mode validates that protein, carbohydrate, and fat total 100%.
Gram conversion uses 4 kcal/g for protein, 4 kcal/g for carbohydrate, and
9 kcal/g for fat. Exact-gram mode stores the entered targets without changing
the calorie target.

## Nutrition Calculation

One server module calculates all consumed nutrients. Client calculations are
previews only and are never trusted for persistence.

For mass-based food:

```text
factor = consumed grams / basis grams
consumed nutrient = source amount * factor
```

Decimal values remain unrounded through persistence and aggregation. The UI
rounds only at display time. The server rejects negative quantities,
unsupported units, missing serving bases, and values outside configured safety
limits.

The deterministic fixture is:

```text
Chicken Test Food per 100 g
165 kcal, 31 g protein, 0 g carbohydrate, 3.6 g fat

Consumed amount: 150 g
Expected: 247.5 kcal, 46.5 g protein, 0 g carbohydrate, 5.4 g fat
```

## Nutrition Provider Boundary

The server defines this provider contract:

```ts
interface NutritionProvider {
  readonly id: string;
  searchFoods(input: FoodSearchInput): Promise<ProviderFood[]>;
  getFood(externalId: string): Promise<ProviderFood | null>;
  lookupBarcode(barcode: string): Promise<ProviderFood | null>;
  providerMetadata(): ProviderMetadata;
}
```

The USDA adapter implements search and detail retrieval. Barcode lookup returns
`null` until a barcode-capable provider is added. A development adapter returns
clearly labeled seed records and is unavailable when `NODE_ENV=production`.

Provider records pass through schema validation and normalization before being
returned or cached. Negative nutrition, non-finite numbers, unsupported units,
missing identifiers, and unusable serving records are rejected. Provider
failure does not corrupt local search results.

The first search flow is:

1. search the authenticated user's recent foods;
2. search canonical PostgreSQL foods and aliases;
3. query USDA when local results are insufficient;
4. validate and normalize USDA results;
5. upsert records by `provider, external_id` inside a transaction;
6. rank and return differentiated results with source and preparation state.

USDA API keys exist only in the server environment. Search caches use a short
server-side TTL and deduplicate concurrent identical requests. Source metadata
retains FDC ID, data type, source timestamp, and attribution.

## API Contract

All responses use JSON. All mutation payloads use Zod validation. Errors use a
stable code plus a safe user message. Internal provider or database details are
logged with a request ID but not sent to the client.

Initial routes:

```text
POST   /api/auth/sign-in/email
POST   /api/auth/sign-out
GET    /api/auth/session
GET    /api/me
PATCH  /api/me
GET    /api/goals
PUT    /api/goals
POST   /api/goals/calculate
GET    /api/foods/search?q=<query>
GET    /api/foods/:id
GET    /api/diary/:date
POST   /api/diary/:date/entries
PATCH  /api/diary/entries/:id
DELETE /api/diary/entries/:id
GET    /api/health/live
GET    /api/health/ready
```

Creating or editing a diary entry sends `foodId`, `servingId`, `quantity`,
`mealType`, and `consumedAt`. The server loads the food and serving, calculates
nutrition, creates immutable snapshots, updates the daily summary in the same
transaction, and returns the updated day.

`GET /api/diary/:date` interprets the path as the user's local calendar date.
Invalid calendar dates and dates outside the supported range return `400`.

## Client Migration

The current screens remain in place. New repository modules separate UI from
storage:

- `AuthRepository` owns session calls;
- `ProfileRepository` owns profiles and goals;
- `FoodRepository` owns search and food details;
- `DiaryRepository` owns diary reads and mutations.

TanStack Query becomes the source for remote server state and cache invalidation.
Zustand retains navigation preferences, selected date, draft capture state, and
an offline outbox. Existing persisted logs are not silently uploaded because
they contain development seed data and lack authenticated ownership. After the
first successful login, the app uses server diary data.

The app presents these states for every server-backed screen:

- loading;
- success;
- empty;
- recoverable error;
- offline with last synchronized data.

The first slice supports reading cached diary data while offline. Offline
mutation synchronization is limited to newly created diary entries with
client-generated UUIDs. Editing and deleting while offline remain disabled with
a clear message, avoiding ambiguous conflict behavior in this slice.

## Error Handling and Observability

The API emits structured JSON logs with request ID, route, status, duration,
authenticated user UUID when present, and normalized error code. It does not log
food descriptions, diary contents, passwords, session cookies, provider keys,
or request bodies.

User-facing errors include:

- `AUTH_REQUIRED`: "Sign in to continue."
- `INVALID_INPUT`: field-specific validation text;
- `FOOD_NOT_FOUND`: "That food is no longer available. Search again."
- `NUTRITION_PROVIDER_UNAVAILABLE`: "The nutrition database is unavailable. Try again."
- `OFFLINE`: "BiteIQ is offline. Your saved days are still available."

Provider requests have timeouts. Readiness fails when PostgreSQL is unavailable
but does not depend on USDA, because a third-party outage must not restart a
healthy API.

## Security

- Only private LAN/VPN ingress is supported.
- Production requires HTTPS even on the private network.
- PostgreSQL is cluster-internal only.
- Passwords are hashed by Better Auth.
- Sessions expire and can be revoked.
- Session data uses SecureStore on devices.
- CORS allows only configured client origins.
- Authentication routes and food-provider routes are rate-limited.
- Request bodies have explicit size limits.
- Secrets are loaded from environment variables or Kubernetes Secrets and are
  never included in `.env.example` values.
- SQL uses Drizzle parameters rather than interpolated strings.
- Every personal repository query has a required authenticated `userId`.

## Testing Strategy

Vitest provides unit and API tests. Integration tests run against a disposable
PostgreSQL database through Docker Compose.

Required unit tests:

- Mifflin-St Jeor for male and female inputs;
- manual calorie targets are never overwritten;
- macro percentage validation and gram conversion;
- the 150 g chicken fixture;
- missing and invalid servings;
- USDA normalization, including kcal and kJ handling;
- local diary-date conversion around Asia/Manila midnight.

Required integration tests:

- account session creation and expiration;
- User A cannot read, edit, or delete User B's profile, goal, diary, or summary;
- food search normalizes and persists a controlled USDA response;
- adding an entry creates nutrition snapshots and updates the summary;
- editing and deleting an entry recomputes the summary transactionally;
- repeated provider upserts do not duplicate the same USDA food;
- malformed provider payloads fail safely.

Client tests cover login routing, onboarding submission, food-search states,
serving selection, diary mutation refresh, and offline messaging. Tests use the
real calculation and repository boundaries; only external USDA network calls
are replaced with controlled fixtures.

## Development and Deployment

The project adds `.env.example` with non-secret placeholders for:

```text
DATABASE_URL
AUTH_SECRET
APP_URL
CLIENT_ORIGINS
USDA_FDC_API_KEY
OPENFOODFACTS_USER_AGENT
EXPO_PUBLIC_API_URL
```

Local development uses Docker Compose for PostgreSQL and the API. The Expo app
runs with its existing command and points to the local API through
`EXPO_PUBLIC_API_URL`.

K3s deployment includes:

- API Deployment with readiness and liveness probes;
- API ClusterIP Service;
- private Ingress;
- PostgreSQL StatefulSet and persistent volume claim for a simple two-user
  installation;
- PostgreSQL ClusterIP Service;
- ConfigMap for non-secrets;
- Secret template containing key names but no values;
- migration Job that must succeed before the new API image is accepted;
- documented backup and restore commands for the PostgreSQL volume.

The manifests do not assume a specific storage class, hostname, ingress class,
or certificate issuer. These values are supplied through a checked-in example
overlay and documented before deployment.

## Documentation Deliverables

This slice updates the main README and architecture document and adds:

- `docs/IMPLEMENTATION_CHECKLIST.md` with phase and acceptance checkboxes;
- `docs/NUTRITION_DATA.md` covering USDA purpose, reliability, API use,
  caching, attribution, storage, licensing review, external identifiers, and
  fallback behavior;
- API route documentation with request and response examples;
- local setup, migration, seed, test, Docker Compose, K3s, backup, and restore
  instructions.

## Acceptance Criteria

This slice is complete only when fresh verification proves that:

1. Two accounts can be created with the server command.
2. Each person can sign in and sign out from the Expo app.
3. Sessions survive an app restart using SecureStore.
4. Each person can complete onboarding and receive an explained target.
5. Manual calorie targets survive later profile changes.
6. USDA search runs through the API with no provider secret in the client.
7. A real USDA food can be selected with a serving and quantity.
8. The server calculates and persists the diary nutrition snapshot.
9. Add, edit, and delete operations update daily totals immediately.
10. Data remains after the API and client restart.
11. User A cannot access any personal record owned by User B.
12. Unit, integration, authorization, type-check, lint, and production build
    commands pass.
13. Docker Compose health checks pass.
14. K3s manifests render successfully with no embedded secrets.

## Explicitly Deferred Work

The following features remain in the master roadmap but are not implemented in
this slice:

- public account registration and recovery emails;
- Google and Apple sign-in;
- recipes and saved meals;
- water, exercise, weight, and body data migration to PostgreSQL;
- barcode and Open Food Facts server integration;
- label, meal-photo, voice, and natural-language AI input;
- subscriptions and entitlements;
- weekly analytics and reports;
- fasting;
- meal planning, grocery lists, and meal prep;
- PhilFCT and FatSecret;
- native health integrations;
- administrative UI.

Existing local UI for deferred features may remain visible only when it does
not imply that unsupported server-backed behavior is production-ready. Feature
flags or explicit development labels must prevent misleading claims.
