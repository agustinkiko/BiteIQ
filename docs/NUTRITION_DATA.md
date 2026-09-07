# Nutrition data policy

## Purpose and scope

BiteIQ uses USDA FoodData Central (FDC) as the server-side nutrition source for
the foundation slice. It is used to find candidate foods and normalize them into
the application's canonical food model. The Expo client never receives the
USDA API key and must not call USDA directly.

Current support covers FDC Foundation, Survey/FNDDS, SR Legacy, and Branded
records. Foundation, Survey/FNDDS, and SR Legacy are stored as
`verified_authoritative`; Branded records are `verified_manufacturer`; unknown
dataset types remain `unverified`.

This is food-reference data, not medical advice. Values can be incomplete,
updated by USDA or manufacturers, affected by food preparation, or differ from
the exact food consumed. The user must review the food, serving, and nutrition
before logging it. A real USDA acceptance run has not yet been performed.

## Key and attribution

Set `USDA_FDC_API_KEY` only in the server environment or the separately managed
K3s Secret. The server appends it only at the outbound FDC request boundary,
redacts provider-key fields from logs, and excludes it from normalized API
responses and Expo configuration.

Every normalized USDA food carries its source provider (`usda`), FDC external
ID, dataset type, provider-updated date when supplied, import time,
verification state, and the displayed attribution `USDA FoodData Central`.
The provider metadata names the U.S. Department of Agriculture, Agricultural
Research Service. Preserve the FDC ID and attribution with any displayed,
cached, or diary-snapshotted USDA result.

Before expanding storage, publishing a dataset extract, or redistributing FDC
records outside this private tracker, an operator must review the current
official FoodData Central terms, data-license terms, and attribution guidance.
That review is a release gate; this document is not a license grant.

## Stored data and updates

The canonical model stores normalized food identity and search aliases; brand,
description, category, preparation state, ingredients, quality and verified
flags; calories and nutrient amounts; 100 g basis; concrete servings; and
source provenance. USDA imports replace provider-owned nutrient and serving
rows inside one transaction. Re-importing the same `(provider, external ID)`
retains the canonical BiteIQ UUID, updates food/source fields, and replaces
only USDA-owned rows. A conflicting global nutrient unit rolls back the whole
upsert.

Diary entries store immutable food, serving, source, calorie, and nutrient
snapshots. Later FDC updates must not rewrite a past diary entry. To refresh a
canonical item, retrieve the current FDC record through the server provider and
run the existing provider upsert; then review any changed values before use.

## Cache, rate limits, and failures

USDA search results are cached for five minutes by normalized query and limit.
Identical in-flight searches are deduplicated. Timeout, rate-limit,
invalid-payload, and server-error results are never cached. Each outbound USDA
request has an eight-second abort timeout.

The API searches local canonical data first. It contacts USDA only for queries
of at least three normalized characters when local results do not fill the
requested limit. If USDA is unavailable, the API returns local results and a
safe `NUTRITION_PROVIDER_UNAVAILABLE` warning, including an empty local result
set. Do not add retries, scheduled bulk imports, or higher request volume until
an operator has checked the current FDC rate limits and terms.

## Nutrition normalization

Nutrition is normalized per 100 g. Calories are read from kcal when available;
only when kcal is absent, kJ is converted using 4.184 kJ per kcal. Supported
nutrients are protein, carbohydrate, fat, fiber, sugar, sodium, saturated fat,
cholesterol, and potassium, with the USDA nutrient identity and expected unit
validated before persistence.

The label-calorie rule is: use the declared kcal value when both kcal and kJ are
present; use kJ divided by 4.184 only when kcal is absent. Never infer calories
from macros or mix an unvalidated nutrient unit into a canonical record.

Serving calculations use decimal arithmetic. The server retains precision until
serialization, emits nutrient/calorie values to six decimal places, and
normalizes entry quantities to four decimal places. A serving must have a
valid mass or volume basis; volume is never silently converted to mass.
