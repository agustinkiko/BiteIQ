/** Live local acceptance checks. Uses only newly generated QA accounts.
 * Run from repo root: node --env-file=.env --import ./server/node_modules/tsx/dist/loader.mjs server/scripts/e2e-acceptance.ts
 * A 0600 temporary file holds credentials for browser checks. Never commit it.
 * Repeat with --state <path> --verify-persistence after restarting the API/DB.
 * Remove only the generated accounts with --state <path> --cleanup.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Decimal } from "decimal.js";

import { loadConfig } from "../src/config.js";
import { createDb } from "../src/db/client.js";
import { createPrivateAccount } from "../src/scripts/account-create.js";
import type { CanonicalFood } from "../src/modules/foods/repository.js";
import type { DiaryDayDto, DiaryEntryDto } from "../src/modules/diary/contracts.js";

type QaAccount = { id: string; email: string; password: string; name: string };
type State = {
  baseUrl: string;
  accounts: QaAccount[];
  persistence?: { date: string; entryId: string; calories: string; foodName: string };
  checks: string[];
};
const config = loadConfig(process.env);
const baseUrl = process.env.E2E_API_URL ?? "http://127.0.0.1:4000";
assert.equal(new URL(baseUrl).hostname, "127.0.0.1", "Acceptance harness only targets local API");
assert.equal(new URL(config.databaseUrl).hostname, "127.0.0.1", "Acceptance harness only targets local DB");
const db = createDb(config.databaseUrl);
const argv = process.argv.slice(2);
const suppliedState = argv.includes("--state") ? argv[argv.indexOf("--state") + 1] : undefined;
let stateFile = suppliedState;
let state: State = suppliedState
  ? JSON.parse(await readFile(suppliedState, "utf8")) as State
  : { baseUrl, accounts: [], checks: [] };
assert.equal(state.baseUrl, baseUrl);

function check(name: string) { state.checks.push(name); process.stdout.write(`PASS ${name}\n`); }
async function save() {
  assert.ok(stateFile);
  await writeFile(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
  await chmod(stateFile, 0o600);
}
async function request<T>(path: string, cookie = "", method = "GET", body?: unknown, status = 200): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}), origin: config.clientOrigins[0]! },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(45_000),
  });
  const value = await response.json();
  assert.equal(response.status, status, `${method} ${path}: expected ${status}, got ${response.status}; ${JSON.stringify(value)}`);
  return value as T;
}
async function signIn(account: QaAccount) {
  const response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: "POST", headers: { "content-type": "application/json", origin: config.clientOrigins[0]! },
    body: JSON.stringify({ email: account.email, password: account.password }), signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.status, 200, "Generated QA account signs in");
  const cookies = response.headers.getSetCookie().map(value => value.split(";", 1)[0]).join("; ");
  assert.ok(cookies);
  return cookies;
}
async function diary(cookie: string, date: string) {
  return (await request<{ diary: DiaryDayDto }>(`/api/diary/${date}`, cookie)).diary;
}
function assertNutrition(food: CanonicalFood, entry: DiaryEntryDto, grams: number) {
  const factor = new Decimal(grams).div(food.basisQuantity!);
  assert.equal(entry.consumedGrams, new Decimal(grams).toFixed(4));
  assert.equal(entry.calorieSnapshot, new Decimal(food.calories!).times(factor).toFixed(6));
  for (const [name, nutrient] of Object.entries(food.nutrients)) {
    assert.equal(entry.nutrientSnapshot[name]?.amount, new Decimal(nutrient.amount).times(factor).toFixed(6), name);
    assert.equal(entry.nutrientSnapshot[name]?.unit, nutrient.unit, name);
  }
  assert.equal(entry.sourceSnapshot.provider, "usda");
  assert.equal(entry.sourceSnapshot.externalId, food.source!.externalId);
}

try {
  if (argv.includes("--cleanup")) {
    assert.ok(suppliedState, "Cleanup requires the exact generated state file");
    for (const account of state.accounts) {
      assert.match(account.email, /^qa-e2e-[a-f0-9-]+-[ab]@example\.test$/);
      await db.$client.query('DELETE FROM "user" WHERE id = $1 AND email = $2', [account.id, account.email]);
    }
    state.accounts = [];
    await save();
    check("Only this run's generated QA accounts removed; account-owned data cascaded");
  } else if (argv.includes("--verify-persistence")) {
    assert.ok(state.persistence);
    const cookie = await signIn(state.accounts[0]!);
    const persisted = await diary(cookie, state.persistence.date);
    const entry = persisted.entries.find(value => value.id === state.persistence!.entryId);
    assert.ok(entry, "Entry survived process/database restart");
    assert.equal(entry.calorieSnapshot, state.persistence.calories);
    assert.equal(entry.foodNameSnapshot, state.persistence.foodName);
    check("API/database restart preserves exact USDA diary snapshot");
    await save();
  } else {
    if (!suppliedState) {
      stateFile = join(await mkdtemp(join(tmpdir(), "biteiq-e2e-")), "state.json");
      const runId = randomUUID();
      for (const suffix of ["a", "b"]) {
        const account = { id: "", email: `qa-e2e-${runId}-${suffix}@example.test`, password: randomBytes(24).toString("base64url"), name: `QA E2E ${suffix.toUpperCase()}` };
        account.id = (await createPrivateAccount(db, config, account, account.password)).id;
        state.accounts.push(account);
        await save();
      }
      process.stdout.write(`QA_STATE_FILE=${stateFile}\n`);
    }
    if (argv.includes("--setup-only")) {
      check("Two fresh QA accounts created; credentials saved in a 0600 temporary file");
    } else {
      await request("/api/health/ready");
      const cookieA = await signIn(state.accounts[0]!);
      const cookieB = await signIn(state.accounts[1]!);
      await request("/api/me", "", "GET", undefined, 401);
      check("Private profile rejects unauthenticated access; both accounts sign in");
      const secondProfile = await request("/api/me", cookieB);
      const secondGoal = await request("/api/goals", cookieB);
      for (const [index, cookie] of [cookieA].entries()) {
        const profile = { displayName: state.accounts[index]!.name, dateOfBirth: "1990-01-01", biologicalSex: index === 0 ? "male" : "female", heightCm: 170, countryCode: "PH", timezone: "Asia/Manila", languageCode: "en", measurementSystem: "metric" };
        await request("/api/me", cookie, "PATCH", profile);
        const loaded = await request<{profile: {displayName: string}}>("/api/me", cookie);
        assert.equal(loaded.profile.displayName, profile.displayName);
      }
      assert.deepEqual(await request("/api/me", cookieB), secondProfile);
      check("First profile saves without modifying the second account");
      const goalInput = { goalType: "maintain", startingWeightKg: 70, currentWeightKg: 70, targetWeightKg: 70, weeklyRateKg: 0, activityLevel: "sedentary", plannedExerciseInActivity: false, targetMode: "percentage", macros: { protein: 30, carbohydrate: 40, fat: 30 } };
      const calculated = await request<{calculation: { calorieTargetKcal: string; warnings: string[] }}>("/api/goals/calculate", cookieA, "POST", goalInput);
      const savedGoal = await request<{goal: {calorieTargetKcal: string}}>("/api/goals", cookieA, "PUT", { ...goalInput, confirmedWarnings: calculated.calculation.warnings });
      assert.equal(savedGoal.goal.calorieTargetKcal, calculated.calculation.calorieTargetKcal);
      assert.deepEqual(await request("/api/goals", cookieB), secondGoal);
      check("Goal calculation saves consistently and is private to its owner");
      const searchQuery = process.env.E2E_SEARCH_QUERY ?? "rice";
      const search = await request<{foods: CanonicalFood[]; warnings: unknown[]}>(`/api/foods/search?q=${encodeURIComponent(searchQuery)}&limit=10`, cookieA);
      assert.equal(search.warnings.length, 0, "USDA search completes without provider warnings");
      const food = search.foods.find(value => value.source?.provider === "usda" && value.basisUnit === "g" && value.calories !== null && value.servings.some(serving => Number(serving.gramWeight) === 1 || Number(serving.gramWeight) === 100));
      if (!food) process.stderr.write(`Search food diagnostics: ${JSON.stringify(search.foods.map(value => ({ name: value.name, provider: value.source?.provider, basis: value.basisUnit, servings: value.servings }))) }\n`);
      assert.ok(food, "Search returns a real USDA food with measured gram serving");
      const detail = (await request<{food: CanonicalFood}>(`/api/foods/${food.id}`, cookieA)).food;
      assert.equal(detail.source!.externalId, food.source!.externalId);
      const serving = detail.servings.find(value => Number(value.gramWeight) === 1) ?? detail.servings.find(value => Number(value.gramWeight) === 100)!;
      check(`USDA search and details: FDC ${food.source!.externalId}; ${food.name}`);
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const nextDate = new Date(`${date}T12:00:00Z`); nextDate.setUTCDate(nextDate.getUTCDate() + 1);
      const movedDate = nextDate.toISOString().slice(0, 10);
      const values = { foodId: food.id, servingId: serving.id, quantity: new Decimal(150).div(serving.gramWeight!).toFixed(4), mealType: "breakfast", consumedAt: `${date}T08:00:00+08:00` };
      const create = { ...values, clientId: randomUUID() };
      const created = (await request<{diary: DiaryDayDto}>(`/api/diary/${date}/entries`, cookieA, "POST", create)).diary;
      const entry = created.entries.find(value => value.clientId === create.clientId)!;
      assert.ok(entry); assertNutrition(detail, entry, 150);
      assert.equal(created.summary.calorieTotal, entry.calorieSnapshot);
      assert.deepEqual(created.summary.nutrientTotals, entry.nutrientSnapshot);
      const retry = (await request<{diary: DiaryDayDto}>(`/api/diary/${date}/entries`, cookieA, "POST", create)).diary;
      assert.equal(retry.entries.filter(value => value.clientId === create.clientId).length, 1);
      check("150 g produces exact source-proportional calories and every nutrient; retry does not duplicate");
      assert.equal((await diary(cookieB, date)).entries.length, 0);
      await request(`/api/diary/entries/${entry.id}`, cookieB, "PATCH", values, 404);
      await request(`/api/diary/entries/${entry.id}`, cookieB, "DELETE", undefined, 404);
      check("Second account cannot read, modify or delete the first account's meal");
      const updated = (await request<{diary: DiaryDayDto}>(`/api/diary/entries/${entry.id}`, cookieA, "PATCH", { ...values, quantity: new Decimal(225).div(serving.gramWeight!).toFixed(4), mealType: "lunch", consumedAt: `${movedDate}T00:15:00+08:00` })).diary;
      const moved = updated.entries.find(value => value.id === entry.id)!;
      assertNutrition(detail, moved, 225); assert.equal(moved.mealType, "lunch");
      assert.equal(updated.localDate, movedDate); assert.equal((await diary(cookieA, date)).entries.length, 0);
      assert.equal((await diary(cookieA, movedDate)).summary.calorieTotal, moved.calorieSnapshot);
      assert.deepEqual(updated.summary.nutrientTotals, moved.nutrientSnapshot);
      check("Quantity, meal and date edits update both date totals across Manila midnight");
      await request(`/api/diary/entries/${entry.id}`, cookieA, "DELETE");
      const empty = await diary(cookieA, movedDate);
      assert.equal(empty.entries.length, 0); assert.equal(Number(empty.summary.calorieTotal), 0);
      check("Deleted entry stays deleted after fresh API read and totals return to zero");
      const persistent = (await request<{diary: DiaryDayDto}>(`/api/diary/${date}/entries`, cookieA, "POST", { ...create, clientId: randomUUID() })).diary.entries[0]!;
      state.persistence = { date, entryId: persistent.id, calories: persistent.calorieSnapshot, foodName: persistent.foodNameSnapshot };
      await request("/api/auth/sign-out", cookieA, "POST", {});
      await request("/api/me", cookieA, "GET", undefined, 401);
      check("Sign-out revokes the session; one QA meal retained for restart proof");
      await save();
      process.stdout.write(`QA_STATE_FILE=${stateFile}\n`);
    }
  }
} catch (error) {
  if (stateFile) await save();
  process.stderr.write(`${error instanceof Error ? error.message : "Acceptance check failed"}\n`);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
