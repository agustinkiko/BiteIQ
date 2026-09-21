# BiteIQ feature coverage audit

Audit date: 2026-09-19. This is a code and component-test inventory. See the [live browser/API acceptance report](../dogfood-output/2026-09-19/report.md) for verified paths and limits; implementation here does not mean every acceptance test passed.

## Supported server-backed paths

| Flow | Current implementation and test boundary |
| --- | --- |
| Private accounts, login, logout | Better Auth, private account-create/reset scripts, per-account session and cache cleanup. Public registration is intentionally unavailable for the two-person deployment. |
| Profile and onboarding | Server profile and goal setup with validation. Component tests cover delayed responses during account changes. |
| Calorie/macronutrient goals | Server calculator and saved goals; percentage/gram targets. Estimates depend on supplied profile inputs. Day/meal schedules are not implemented. |
| USDA food search and details | Server provider, canonical records, provenance, servings, nutrient normalization. Live search/detail and 30 raw-source comparisons passed with the configured key; this is sampled, not exhaustive catalog accuracy. |
| Food add, edit, delete | Server diary and summaries. Food detail now saves the selected meal, waits for persistence, prevents duplicate submission, and displays mutation errors. Delete has a visible confirmation on web and native. |
| Diary date selection and history | Selected-day server diary, breakfast/lunch/dinner/snack sections, persistent food snapshots. |
| Recent foods | Server search returns account-owned recent records when searching with an empty query from Recent. Frequent ranking remains a preview. |
| Daily dashboard and nutrition | Server diary calories/macros, meal breakdown, nutrients. Nutrition loading/failure/retry are explicit; unreported nutrients are not presented as measured zero. Partial totals are labeled. |
| Seven-day calories | Nutrition → Calories now reads seven authenticated server diary summaries. Account-scoped cache keys, per-day missing markers, errors/retry, zero-day distinction. |
| Offline reading and new-entry queue | Cached account-owned days and queued creates; edits/deletes require connectivity. Browser offline create, reconnect, exact-once sync to the selected prior day/meal, and explicit offline edit rejection passed. Native-device acceptance remains separate. |

## Preview or missing original requirements

The original pasted specification includes substantially more than the supported paths above. These are not production-complete merely because a screen, type, flag, or provider adapter exists.

| Original requirements | Status / missing work |
| --- | --- |
| Advanced nutrient targets; day-specific and meal-level goals | No complete server/UI workflow. |
| General units engine, energy kJ preference, edible-portion/yield handling | Canonical serving conversion exists; full preference/yield workflow missing. No universal cups-to-grams conversion should be inferred. |
| Bulk USDA import and update jobs | No complete operator workflow verified; live on-demand search is separate. |
| Open Food Facts barcode lookup/cache/scanning | Legacy adapter/capture preview; no supported authenticated barcode-to-canonical-diary API workflow. |
| Authorized PhilFCT, Filipino aliases, FatSecret, Edamam | No complete configured/licensed production integration verified. |
| Frequent foods and search personalization | Local/device history preview; account-owned frequency/ranking missing. |
| Copy meal/day, batch/multi-day logging | No implemented server route and complete UI flow. Single-day navigation is supported. |
| Saved meals | No persisted server workflow. |
| Recipes and recipe versioning | No persisted recipe builder, ingredients, yield/serving/version workflow. |
| Quick Add | Legacy local-only preview; does not feed the canonical server diary. |
| Water | Legacy local-only preview; no server persistence/ownership workflow. |
| Exercise, steps, calorie-addition control | Legacy local-only preview; full server persistence and configurable calorie handling missing. |
| Fitness integrations and duplicate activity detection | Missing. |
| Weight history | Legacy local-only preview; setting a goal weight is separate from recording persisted weigh-ins. |
| Body measurements and progress photos | Missing complete storage, ownership, history workflows. |
| Custom dashboards | Missing configurable dashboard workflow. |
| Advanced trends, nutrient contribution, weekly reports | Daily breakdown and seven-day calories exist; broader reports/contribution/weight trends missing. |
| Nutrition-label scanner and validation | Preview input path only; no complete authenticated, validated server-to-diary workflow. |
| Meal photo recognition | Preview only; no complete verified server workflow. Estimates must not be represented as measured USDA records. |
| Voice and natural-language logging | Preview only; no complete verified server workflow. |
| AI analyst, coach, tools and provider configuration | Development preview/client scaffolding; no supported server-backed production workflow. |
| Fasting | Deferred feature flag; no complete persisted workflow. |
| Meal timestamps and net carbohydrates | Diary timestamps are stored with local dates; full time-editing/net-carb preference workflows missing. |
| Meal plans, constraint validation, regeneration | Deferred; no complete persisted workflow. |
| Grocery lists and meal prep | Missing complete workflow. |
| Subscriptions, entitlements, payments | Deferred and unnecessary for the current two-person use, but not implemented to the original commercial specification. |
| Admin dashboard | Missing. |
| Custom foods, community submissions, reporting/moderation | Missing canonical create/review/report UI and API workflows. |
| Duplicate-food moderation | Provider identity/upsert handling is separate from full moderation/deduplication tools. |
| Data export and account deletion | No complete user-facing workflow. |
| Food/product/progress image storage | No complete upload/storage/attribution/access workflow. |
| Notifications, reminders, streaks | Missing complete configurable/opt-in workflow. |
| Homelab release, backup restore, mobile-device acceptance | Separate operational acceptance; local tests do not prove these. |
| Accessibility and performance requirements | Labels/navigation improvements tested; full keyboard/screen-reader/device/performance audit still required. |

Development previews now require explicit opt-in and remain disabled in production. Enabling preview flags does not implement the missing server contracts.

## Navigation fixes and regression evidence

`src/screens/__tests__/FoodDetailScreen.test.tsx` covers:

- Selected meal and 150 g quantity reach the canonical create operation.
- Save waits for completion; repeated presses submit once.
- Failed saves remain visible and retryable.
- Queued offline creation is visibly distinguished from confirmed persistence.
- Zero quantity is rejected before submission.
- Delete requires confirmation; failed edits remain on screen.

`src/screens/__tests__/NutritionScreen.test.tsx` covers:

- Loading and failure do not masquerade as zero nutrition.
- Retry and Back actions work.
- Unreported nutrients differ from reported zeros and partial totals.
- Seven-day totals come from server summaries and switch with the account.
- Failed historical days display unavailable, not zero.
- More reaches Goals and Nutrition for the selected date.

Baseline before these changes: 13 client suites / 121 tests passed; TypeScript passed. New tests must be included in the root run's final verification count.

## Completion boundary

The original section 120 core-MVP definition includes recipes, saved meals, exercise, water, weight, barcode and custom foods. Those acceptance criteria remain incomplete. Therefore passing the supported food-tracking workflow must not be described as completion of all requested features or the full original MVP.
