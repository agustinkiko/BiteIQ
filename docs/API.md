# BiteIQ API

Base URL: `EXPO_PUBLIC_API_URL`, normally `http://127.0.0.1:4000/api` for a
web client on the same machine. The mobile client sends the Better Auth session
cookie from secure storage. All JSON request bodies are limited to 64 KiB.

## Conventions

Protected routes require an authenticated private account. A missing or expired
session returns:

```json
{"error":{"code":"AUTH_REQUIRED","message":"Sign in to continue."}}
```

Validation failures return HTTP `400` with `INVALID_INPUT`; a body over 64 KiB
returns HTTP `413` with the same code. Route handlers return
`{"error":{"code":"…","message":"…"}}` for normalized errors.

Fastify assigns each request a request ID. It is recorded in the structured
`request completed` log with route, status, duration, and authenticated user ID
when present. The current API does not promise a request-ID response header, so
operators correlate an incident with server logs rather than asking clients to
depend on a header.

Stable server error codes are `AUTH_REQUIRED`, `INVALID_INPUT`,
`FOOD_NOT_FOUND`, `DIARY_ENTRY_NOT_FOUND`,
`NUTRITION_PROVIDER_UNAVAILABLE`, `DATABASE_UNAVAILABLE`, `OFFLINE`, and
`INTERNAL_ERROR`. The food search warning uses
`NUTRITION_PROVIDER_UNAVAILABLE` inside a successful response. Clients should
branch on codes, not on message text.

Examples use an operator-created session cookie. Do not put a password, USDA
key, or production cookie in a command history.

## JSON response schemas and examples

All UUIDs are strings. Decimal values are serialized as strings so clients do
not lose precision. Timestamps are ISO-8601 UTC strings. The schemas below use
`null` only where the server can return it.

### Profile

```json
{
  "profile": {
    "userId": "uuid",
    "displayName": "string",
    "dateOfBirth": "YYYY-MM-DD",
    "biologicalSex": "male | female | unspecified",
    "heightCm": "decimal string",
    "countryCode": "two-letter uppercase string",
    "timezone": "IANA timezone string",
    "languageCode": "string",
    "measurementSystem": "metric | imperial",
    "createdAt": "ISO-8601 timestamp",
    "updatedAt": "ISO-8601 timestamp"
  }
}
```

Concrete success example:

```json
{"profile":{"userId":"11111111-1111-4111-8111-111111111111","displayName":"Private User","dateOfBirth":"1996-06-15","biologicalSex":"unspecified","heightCm":"170.00","countryCode":"PH","timezone":"Asia/Manila","languageCode":"en","measurementSystem":"metric","createdAt":"2026-09-08T00:00:00.000Z","updatedAt":"2026-09-08T00:00:00.000Z"}}
```

`GET /api/me` may instead return `{"profile":null}`.

### Goal input, calculation, and stored goal

The request schema for calculate is:

```json
{
  "goalType": "lose | maintain | gain",
  "startingWeightKg": "positive JSON number",
  "currentWeightKg": "positive JSON number",
  "targetWeightKg": "positive JSON number",
  "weeklyRateKg": "JSON number from -5 through 5",
  "activityLevel": "sedentary | lightly_active | moderately_active | very_active | extremely_active",
  "plannedExerciseInActivity": "boolean",
  "targetMode": "percentage | grams",
  "macros": {"protein":"non-negative JSON number","carbohydrate":"non-negative JSON number","fat":"non-negative JSON number"},
  "manualCalorieTargetKcal": "optional positive JSON number"
}
```

For `targetMode: "percentage"`, macro values must total 100. `PUT /api/goals`
adds `confirmedWarnings`, an array of `EXTREME_RATE` and/or
`LOW_CALORIE_TARGET` values returned by the calculation.

`POST /api/goals/calculate` returns this `CalculatedGoal` schema:

```json
{
  "calculation": {
    "equation": "mifflin_st_jeor",
    "equationInputs": {"biologicalSex":"male | female | unspecified","weightKg":"number","heightCm":"number","age":"number","activityLevel":"enum","timezone":"string","calculationDate":"ISO-8601 timestamp"},
    "bmrKcal":"decimal string","activityMultiplier":"decimal string","tdeeKcal":"decimal string","calorieAdjustmentKcal":"decimal string","calorieTargetKcal":"decimal string",
    "proteinTargetG":"decimal string","carbohydrateTargetG":"decimal string","fatTargetG":"decimal string",
    "isManualCalorieTarget":"boolean","warnings":["EXTREME_RATE | LOW_CALORIE_TARGET"]
  }
}
```

Concrete calculation success:

```json
{"calculation":{"equation":"mifflin_st_jeor","equationInputs":{"biologicalSex":"unspecified","weightKg":70,"heightCm":170,"age":30,"activityLevel":"moderately_active","timezone":"Asia/Manila","calculationDate":"2026-09-08T00:00:00.000Z"},"bmrKcal":"1452.500","activityMultiplier":"1.550","tdeeKcal":"2251.375","calorieAdjustmentKcal":"0.000","calorieTargetKcal":"2251.375","proteinTargetG":"168.853","carbohydrateTargetG":"225.138","fatTargetG":"75.046","isManualCalorieTarget":false,"warnings":[]}}
```

`GET /api/goals` and `PUT /api/goals` use `{"goal": Goal | null}`. Stored
`Goal` has this field-level schema (request-only `confirmedWarnings` is absent):

```json
{
  "goal": {
    "id":"uuid","userId":"uuid","goalType":"lose | maintain | gain",
    "startingWeightKg":"decimal string","currentWeightKg":"decimal string","targetWeightKg":"decimal string","weeklyRateKg":"decimal string | null",
    "activityLevel":"sedentary | lightly_active | moderately_active | very_active | extremely_active","plannedExerciseInActivity":"boolean",
    "equation":"mifflin_st_jeor","equationInputs":"object",
    "bmrKcal":"decimal string","activityMultiplier":"decimal string","tdeeKcal":"decimal string","calorieAdjustmentKcal":"decimal string","calorieTargetKcal":"decimal string",
    "proteinTargetG":"decimal string","carbohydrateTargetG":"decimal string","fatTargetG":"decimal string",
    "targetMode":"percentage | grams","isManualCalorieTarget":"boolean","warnings":["EXTREME_RATE | LOW_CALORIE_TARGET"],
    "createdAt":"ISO-8601 timestamp","updatedAt":"ISO-8601 timestamp"
  }
}
```

Example:

```json
{"goal":{"id":"22222222-2222-4222-8222-222222222222","userId":"11111111-1111-4111-8111-111111111111","goalType":"maintain","startingWeightKg":"70.000","currentWeightKg":"70.000","targetWeightKg":"70.000","weeklyRateKg":"0.000","activityLevel":"moderately_active","plannedExerciseInActivity":false,"equation":"mifflin_st_jeor","equationInputs":{"targetMode":"percentage","macros":{"protein":30,"carbohydrate":40,"fat":30}},"bmrKcal":"1452.500","activityMultiplier":"1.550","tdeeKcal":"2251.375","calorieAdjustmentKcal":"0.000","calorieTargetKcal":"2251.375","proteinTargetG":"168.853","carbohydrateTargetG":"225.138","fatTargetG":"75.046","targetMode":"percentage","isManualCalorieTarget":false,"warnings":[],"createdAt":"2026-09-08T00:00:00.000Z","updatedAt":"2026-09-08T00:00:00.000Z"}}
```

### Canonical food and warnings

`CanonicalFood` is returned by search and detail:

```json
{
  "id":"uuid","name":"string","normalizedName":"string","brand":"string | null","description":"string | null","category":"string | null","countryCode":"string | null","languageCode":"string | null","foodType":"string","preparationState":"string | null","ingredientsText":"string | null","dataQuality":"string","verified":"boolean",
  "source":{"provider":"string","externalId":"string","datasetType":"string | null","providerUpdatedAt":"ISO-8601 timestamp | null","importedAt":"ISO-8601 timestamp","verificationState":"verified_authoritative | verified_manufacturer | community | user_created | unverified","attribution":"string | null","licenseCategory":"string | null"} | null,
  "calories":"decimal string | null","nutrients":{"nutrientName":{"amount":"decimal string","unit":"string"}},"basisQuantity":"decimal string | null","basisUnit":"g | ml | null",
  "servings":[{"id":"uuid","name":"string","quantity":"decimal string","unit":"serving | g | ml","gramWeight":"decimal string | null","milliliterVolume":"decimal string | null","isDefault":"boolean","source":"string","sourceServingId":"string | null"}],
  "createdAt":"ISO-8601 timestamp","updatedAt":"ISO-8601 timestamp"
}
```

Concrete food-search success, including a recoverable provider warning:

```json
{"foods":[{"id":"33333333-3333-4333-8333-333333333333","name":"Chicken, cooked","normalizedName":"chicken, cooked","brand":null,"description":"Chicken, cooked","category":null,"countryCode":null,"languageCode":null,"foodType":"whole_food","preparationState":"cooked","ingredientsText":null,"dataQuality":"verified_authoritative","verified":true,"source":{"provider":"usda","externalId":"171077","datasetType":"Foundation","providerUpdatedAt":null,"importedAt":"2026-09-08T00:00:00.000Z","verificationState":"verified_authoritative","attribution":"USDA FoodData Central","licenseCategory":null},"calories":"165.000000","nutrients":{"protein":{"amount":"31.000000","unit":"g"}},"basisQuantity":"100.0000","basisUnit":"g","servings":[{"id":"44444444-4444-4444-8444-444444444444","name":"100 g","quantity":"100.0000","unit":"g","gramWeight":"100.0000","milliliterVolume":null,"isDefault":true,"source":"usda","sourceServingId":"100g"}],"createdAt":"2026-09-08T00:00:00.000Z","updatedAt":"2026-09-08T00:00:00.000Z"}],"warnings":[{"code":"NUTRITION_PROVIDER_UNAVAILABLE","provider":"usda","message":"The nutrition database is unavailable. Try again."}]}
```

`warnings` is always an array. A successful local-only search uses `[]`.

### Diary day, entries, and summary

Every diary read or mutation returns `{"diary": DiaryDay}`:

```json
{
  "diary": {
    "localDate":"YYYY-MM-DD",
    "entries":[{
      "id":"uuid","clientId":"uuid","userId":"uuid","mealType":"breakfast | lunch | dinner | snack","foodId":"uuid | null","foodNameSnapshot":"string","brandSnapshot":"string | null",
      "sourceSnapshot":{"provider":"string | null","externalId":"string | null","datasetType":"string | null","providerUpdatedAt":"ISO-8601 timestamp | null","importedAt":"ISO-8601 timestamp | null","verificationState":"string | null","attribution":"string | null","licenseCategory":"string | null"},
      "servingSnapshot":{"id":"uuid","name":"string","quantity":"decimal string","unit":"serving | g | ml","gramWeight":"decimal string | null","milliliterVolume":"decimal string | null","isDefault":"boolean","source":"string","sourceServingId":"string | null"},
      "quantity":"decimal string","consumedGrams":"decimal string | null","consumedMilliliters":"decimal string | null","calorieSnapshot":"decimal string","nutrientSnapshot":{"nutrientName":{"amount":"decimal string","unit":"string"}},"consumedAt":"ISO-8601 timestamp","createdAt":"ISO-8601 timestamp","updatedAt":"ISO-8601 timestamp"
    }],
    "summary":{"calorieTotal":"decimal string","nutrientTotals":{"nutrientName":{"amount":"decimal string","unit":"string"}},"goalSnapshot":"object"}
  }
}
```

Concrete diary success:

```json
{"diary":{"localDate":"2026-09-08","entries":[{"id":"55555555-5555-4555-8555-555555555555","clientId":"66666666-6666-4666-8666-666666666666","userId":"11111111-1111-4111-8111-111111111111","mealType":"lunch","foodId":"33333333-3333-4333-8333-333333333333","foodNameSnapshot":"Chicken, cooked","brandSnapshot":null,"sourceSnapshot":{"provider":"usda","externalId":"171077","datasetType":"Foundation","providerUpdatedAt":null,"importedAt":"2026-09-08T00:00:00.000Z","verificationState":"verified_authoritative","attribution":"USDA FoodData Central","licenseCategory":null},"servingSnapshot":{"id":"44444444-4444-4444-8444-444444444444","name":"100 g","quantity":"100.0000","unit":"g","gramWeight":"100.0000","milliliterVolume":null,"isDefault":true,"source":"usda","sourceServingId":"100g"},"quantity":"1.0000","consumedGrams":"100.0000","consumedMilliliters":null,"calorieSnapshot":"165.000000","nutrientSnapshot":{"protein":{"amount":"31.000000","unit":"g"}},"consumedAt":"2026-09-08T04:00:00.000Z","createdAt":"2026-09-08T04:00:01.000Z","updatedAt":"2026-09-08T04:00:01.000Z"}],"summary":{"calorieTotal":"165.000000","nutrientTotals":{"protein":{"amount":"31.000000","unit":"g"}},"goalSnapshot":{"calorieTargetKcal":"2251.375"}}}}
```

## Health

### `GET /api/health/live`

Authentication: none. Request: none. Success: `200 {"status":"ok"}`.
Validation and authorization responses do not apply.

```sh
curl http://127.0.0.1:4000/api/health/live
```

### `GET /api/health/ready`

Authentication: none. Request: none. Success: `200 {"status":"ready"}` only
after PostgreSQL accepts `SELECT 1`. It does not depend on USDA availability.
On database failure, it returns `503 DATABASE_UNAVAILABLE`. Validation and
authorization responses do not apply.

```sh
curl http://127.0.0.1:4000/api/health/ready
```

## Authentication

The private account commands create accounts; public sign-up is deliberately
disabled. These are the only supported product authentication endpoints:
`POST /api/auth/sign-up/email` (intentionally disabled),
`POST /api/auth/sign-in/email`, `GET /api/auth/session`, and
`POST /api/auth/sign-out`.

### `ALL /api/auth/*` internal passthrough

Fastify forwards every method and path below `/api/auth/*` to Better Auth,
passing method, headers, and JSON body through and relaying status, body, and
cookies. This is an implementation bridge, not a commitment that every Better
Auth endpoint is supported, stable, or safe for product use. Only the four
endpoints listed above are part of the BiteIQ product contract. Upstream
validation, success, and authorization shapes apply only when an operator has
explicitly approved a new endpoint for use.

### `POST /api/auth/sign-up/email`

Authentication: none. Request: Better Auth email/password sign-up shape.
Success is intentionally unavailable: this always returns
`403 {"code":"SIGN_UP_DISABLED","message":"Account creation is private."}`.
Validation is Better Auth validation before this route only where applicable;
there is no authorization response. Do not use it.

```sh
curl -X POST http://127.0.0.1:4000/api/auth/sign-up/email \
  -H 'content-type: application/json' \
  -d '{"email":"operator@example.test","password":"not-used"}'
```

### `POST /api/auth/sign-in/email`

Authentication: none. Request: JSON `{ "email": "…", "password": "…" }`.
Success: Better Auth `200`, session data, and a session `Set-Cookie` header.
Malformed credentials receive Better Auth validation responses; invalid
credentials receive `401 {"code":"INVALID_EMAIL_OR_PASSWORD","message":"Invalid email or password"}`.
There is no authenticated-user authorization response.

```sh
curl -i -X POST http://127.0.0.1:4000/api/auth/sign-in/email \
  -H 'content-type: application/json' \
  -d '{"email":"operator-supplied@example.test","password":"enter-interactively-in-client"}'
```

### `GET /api/auth/session`

Authentication: optional session cookie. Request: none. Success: Better Auth
`200` session/user data when the cookie is valid. Invalid or absent sessions
return Better Auth's unauthenticated session response; validation does not
apply, and protected application routes—not this session lookup—return
`401 AUTH_REQUIRED`.

```sh
curl http://127.0.0.1:4000/api/auth/session \
  -H 'cookie: OPERATOR_SUPPLIED_SESSION_COOKIE'
```

### `POST /api/auth/sign-out`

Authentication: session cookie. Request: no application JSON schema. Success:
Better Auth `200` and an expired session cookie. Invalid inputs use Better Auth
validation; an absent/invalid session follows Better Auth's auth response.

```sh
curl -i -X POST http://127.0.0.1:4000/api/auth/sign-out \
  -H 'cookie: OPERATOR_SUPPLIED_SESSION_COOKIE'
```

The Expo client uses email sign-in, session lookup, and sign-out. It does not
depend on undocumented passthrough endpoints.

## Profile and goals

All routes in this section require a session cookie. In examples, replace the
cookie value with an operator-supplied session cookie.

### `GET /api/me`

Request: none. Success: `200 {"profile": Profile | null}`. Validation: none.
Unauthenticated: `401 AUTH_REQUIRED`.

```sh
curl http://127.0.0.1:4000/api/me -H 'cookie: OPERATOR_SUPPLIED_SESSION_COOKIE'
```

### `PATCH /api/me`

Request: one or more profile fields plus optional `confirmedWarnings`:
`displayName` (1–200 characters), `dateOfBirth` (`YYYY-MM-DD`),
`biologicalSex` (`male`, `female`, or `unspecified`), positive `heightCm`,
two-letter uppercase `countryCode`, IANA `timezone`, `languageCode`, and
`measurementSystem` (`metric` or `imperial`). Success:
`200 {"profile": Profile}`. Invalid or future birth dates and unconfirmed
recalculation warnings return `400 INVALID_INPUT`; warning responses include
`error.warnings`. Unauthenticated: `401 AUTH_REQUIRED`.

```sh
curl -X PATCH http://127.0.0.1:4000/api/me \
  -H 'content-type: application/json' -H 'cookie: OPERATOR_SUPPLIED_SESSION_COOKIE' \
  -d '{"displayName":"Private User","dateOfBirth":"1996-06-15","biologicalSex":"unspecified","heightCm":170,"countryCode":"PH","timezone":"Asia/Manila","languageCode":"en","measurementSystem":"metric","confirmedWarnings":[]}'
```

### `GET /api/goals`

Request: none. Success: `200 {"goal": Goal | null}`. Validation: none.
Unauthenticated: `401 AUTH_REQUIRED`.

```sh
curl http://127.0.0.1:4000/api/goals -H 'cookie: OPERATOR_SUPPLIED_SESSION_COOKIE'
```

### `POST /api/goals/calculate`

Request: Goal input: `goalType` (`lose`, `maintain`, `gain`), positive
`startingWeightKg`, `currentWeightKg`, `targetWeightKg`, `weeklyRateKg` in
`-5..5`, `activityLevel`, `plannedExerciseInActivity`, `targetMode`
(`percentage` or `grams`), macro values, and optional positive
`manualCalorieTargetKcal`. Percentage macros must total 100 and rate direction
must match the goal. Success: `200 {"calculation": CalculatedGoal}`. A profile
is required; bad input or no profile gives `400 INVALID_INPUT`.
Unauthenticated: `401 AUTH_REQUIRED`.

```sh
curl -X POST http://127.0.0.1:4000/api/goals/calculate \
  -H 'content-type: application/json' -H 'cookie: OPERATOR_SUPPLIED_SESSION_COOKIE' \
  -d '{"goalType":"maintain","startingWeightKg":70,"currentWeightKg":70,"targetWeightKg":70,"weeklyRateKg":0,"activityLevel":"moderately_active","plannedExerciseInActivity":false,"targetMode":"percentage","macros":{"protein":30,"carbohydrate":40,"fat":30}}'
```

### `PUT /api/goals`

Request: the calculation input plus `confirmedWarnings`, an array containing
every warning returned for this calculation. Success: `200 {"goal": Goal}`.
Bad input or omitted required warning confirmation gives `400 INVALID_INPUT`;
unauthenticated gives `401 AUTH_REQUIRED`.

```sh
curl -X PUT http://127.0.0.1:4000/api/goals \
  -H 'content-type: application/json' -H 'cookie: OPERATOR_SUPPLIED_SESSION_COOKIE' \
  -d '{"goalType":"maintain","startingWeightKg":70,"currentWeightKg":70,"targetWeightKg":70,"weeklyRateKg":0,"activityLevel":"moderately_active","plannedExerciseInActivity":false,"targetMode":"percentage","macros":{"protein":30,"carbohydrate":40,"fat":30},"confirmedWarnings":[]}'
```

## Foods

### `GET /api/foods/search?q=&limit=`

Authentication: required. Request query: optional `q` up to 200 characters and
optional integer `limit` from 1 to 50 (default 20); unknown fields are rejected.
Success: `200 {"foods":[CanonicalFood],"warnings":[…]}`. A query shorter than
three characters returns only that user's recent foods. Longer queries search
local canonical data first and request USDA only when local results do not fill
the limit. An unavailable provider is a successful response with a safe
warning, not an HTTP failure. Invalid query values return `400 INVALID_INPUT`;
unauthenticated returns `401 AUTH_REQUIRED`.

```sh
curl 'http://127.0.0.1:4000/api/foods/search?q=chicken&limit=20' \
  -H 'cookie: OPERATOR_SUPPLIED_SESSION_COOKIE'
```

### `GET /api/foods/:id`

Authentication: required. Request path: canonical food UUID. Success:
`200 {"food": CanonicalFood}` with servings, nutrients, and source
provenance. Invalid UUID: `400 INVALID_INPUT`. A missing or disabled food:
`404 FOOD_NOT_FOUND`. Unauthenticated: `401 AUTH_REQUIRED`.

```sh
curl http://127.0.0.1:4000/api/foods/OPERATOR_SUPPLIED_FOOD_UUID \
  -H 'cookie: OPERATOR_SUPPLIED_SESSION_COOKIE'
```

## Diary

Diary dates use `YYYY-MM-DD`; the server derives persisted ownership and local
day from the authenticated profile timezone and `consumedAt`, not from a user
ID in the request.

### `GET /api/diary/:date`

Authentication: required. Request path: a valid date from 1900-01-01 through
2100-12-31. Success: `200 {"diary": DiaryDay}`. Invalid dates return
`400 INVALID_INPUT`; unauthenticated returns `401 AUTH_REQUIRED`.

```sh
curl http://127.0.0.1:4000/api/diary/2026-09-08 \
  -H 'cookie: OPERATOR_SUPPLIED_SESSION_COOKIE'
```

### `POST /api/diary/:date/entries`

Authentication: required. Request path: a valid date. Body:
`clientId`, `foodId`, and `servingId` UUIDs; a positive decimal `quantity`;
`mealType` (`breakfast`, `lunch`, `dinner`, `snack`); and ISO-8601 UTC-offset
`consumedAt`. Success: `200 {"diary": DiaryDay}`. `clientId` is idempotent per
authenticated user. Invalid body/date returns `400 INVALID_INPUT`; an unknown
food or serving returns `404 FOOD_NOT_FOUND`; unauthenticated returns
`401 AUTH_REQUIRED`.

```sh
curl -X POST http://127.0.0.1:4000/api/diary/2026-09-08/entries \
  -H 'content-type: application/json' -H 'cookie: OPERATOR_SUPPLIED_SESSION_COOKIE' \
  -d '{"clientId":"OPERATOR_SUPPLIED_UUID","foodId":"OPERATOR_SUPPLIED_FOOD_UUID","servingId":"OPERATOR_SUPPLIED_SERVING_UUID","quantity":"1.0000","mealType":"lunch","consumedAt":"2026-09-08T04:00:00.000Z"}'
```

### `PATCH /api/diary/entries/:id`

Authentication: required. Request path: entry UUID. Body: `foodId`,
`servingId`, `quantity`, `mealType`, and `consumedAt` using the same schema as
create, without `clientId`. Success: `200 {"diary": DiaryDay}`. Invalid input
returns `400 INVALID_INPUT`; unknown food/serving returns `404 FOOD_NOT_FOUND`;
missing or other-user entries return the neutral `404 DIARY_ENTRY_NOT_FOUND`;
unauthenticated returns `401 AUTH_REQUIRED`.

```sh
curl -X PATCH http://127.0.0.1:4000/api/diary/entries/OPERATOR_SUPPLIED_ENTRY_UUID \
  -H 'content-type: application/json' -H 'cookie: OPERATOR_SUPPLIED_SESSION_COOKIE' \
  -d '{"foodId":"OPERATOR_SUPPLIED_FOOD_UUID","servingId":"OPERATOR_SUPPLIED_SERVING_UUID","quantity":"2.0000","mealType":"dinner","consumedAt":"2026-09-08T11:00:00.000Z"}'
```

### `DELETE /api/diary/entries/:id`

Authentication: required. Request path: entry UUID. Request body: none.
Success: `200 {"diary": DiaryDay}`. Invalid UUID returns `400 INVALID_INPUT`;
missing or other-user entries return `404 DIARY_ENTRY_NOT_FOUND`;
unauthenticated returns `401 AUTH_REQUIRED`.

```sh
curl -X DELETE http://127.0.0.1:4000/api/diary/entries/OPERATOR_SUPPLIED_ENTRY_UUID \
  -H 'cookie: OPERATOR_SUPPLIED_SESSION_COOKIE'
```
