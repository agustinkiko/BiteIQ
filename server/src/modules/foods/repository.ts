import {
  and,
  asc,
  desc,
  eq,
  inArray,
  sql,
} from "drizzle-orm";

import type { BiteIqDatabase } from "../../db/client.js";
import {
  foodAliases,
  foodEntries,
  foodExternalSources,
  foodNutrients,
  foodServings,
  foods,
  nutrientDefinitions,
  userProfiles,
} from "../../db/schema/index.js";
import type {
  ProviderFood,
  VerificationState,
} from "../../providers/nutrition/types.js";
import type {
  FoodServing,
  NutrientValues,
  NutritionBasisUnit,
} from "./contracts.js";

export interface CanonicalFoodSource {
  provider: string;
  externalId: string;
  datasetType: string | null;
  providerUpdatedAt: string | null;
  importedAt: string;
  verificationState: VerificationState;
  attribution: string | null;
  licenseCategory: string | null;
}

export interface CanonicalFood {
  id: string;
  name: string;
  normalizedName: string;
  brand: string | null;
  description: string | null;
  category: string | null;
  countryCode: string | null;
  languageCode: string | null;
  foodType: string;
  preparationState: string | null;
  ingredientsText: string | null;
  dataQuality: string;
  verified: boolean;
  source: CanonicalFoodSource | null;
  calories: string | null;
  nutrients: NutrientValues;
  basisQuantity: string | null;
  basisUnit: NutritionBasisUnit | null;
  servings: FoodServing[];
  createdAt: string;
  updatedAt: string;
}

export interface FoodRepository {
  searchLocalFoods(
    userId: string,
    query: string,
    limit: number,
  ): Promise<CanonicalFood[]>;
  upsertProviderFood(providerFood: ProviderFood): Promise<CanonicalFood>;
  getFoodById(id: string): Promise<CanonicalFood | null>;
}

type StoredSourceReference = {
  attribution?: unknown;
  basisQuantity?: unknown;
  basisUnit?: unknown;
};

export function createFoodRepository(db: BiteIqDatabase): FoodRepository {
  return {
    async searchLocalFoods(userId, query, limit) {
      const normalizedQuery = normalizeFoodText(query).toLocaleLowerCase("en-US");
      const ids =
        normalizedQuery.length < 3
          ? await recentFoodIds(db, userId, limit)
          : await matchingFoodIds(db, userId, normalizedQuery, limit);

      return loadFoods(db, ids);
    },

    async upsertProviderFood(providerFood) {
      const foodId = await db.transaction(async (tx) => {
        const providerKey = `${providerFood.provider}:${providerFood.externalId}`;
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${providerKey}))`,
        );

        const existing = await tx
          .select({ foodId: foodExternalSources.foodId })
          .from(foodExternalSources)
          .where(
            and(
              eq(foodExternalSources.provider, providerFood.provider),
              eq(foodExternalSources.externalId, providerFood.externalId),
            ),
          )
          .limit(1);

        const normalizedFood = providerFoodValues(providerFood);
        let id = existing[0]?.foodId;
        if (id) {
          await tx
            .update(foods)
            .set({ ...normalizedFood, updatedAt: new Date() })
            .where(eq(foods.id, id));
        } else {
          const inserted = await tx
            .insert(foods)
            .values(normalizedFood)
            .returning({ id: foods.id });
          id = inserted[0]?.id;
          if (!id) throw new Error("FOOD_UPSERT_FAILED");
        }

        const sourceReference = {
          attribution: normalizeOptionalText(providerFood.attribution),
          basisQuantity: providerFood.basisQuantity,
          basisUnit: providerFood.basisUnit,
        };
        if (existing.length > 0) {
          await tx
            .update(foodExternalSources)
            .set({
              datasetType: normalizeOptionalText(providerFood.dataType),
              providerUpdatedAt: parseProviderDate(providerFood.sourceUpdatedAt),
              importedAt: new Date(),
              verificationState: providerFood.verificationState,
              originalServingReference: sourceReference,
            })
            .where(
              and(
                eq(foodExternalSources.provider, providerFood.provider),
                eq(foodExternalSources.externalId, providerFood.externalId),
              ),
            );
        } else {
          await tx.insert(foodExternalSources).values({
            foodId: id,
            provider: providerFood.provider,
            externalId: providerFood.externalId,
            datasetType: normalizeOptionalText(providerFood.dataType),
            providerUpdatedAt: parseProviderDate(providerFood.sourceUpdatedAt),
            verificationState: providerFood.verificationState,
            originalServingReference: sourceReference,
          });
        }

        const priorServings = await tx
          .select({ id: foodServings.id, sourceServingId: foodServings.sourceServingId })
          .from(foodServings)
          .where(and(eq(foodServings.foodId, id), eq(foodServings.source, providerFood.provider)));
        const servingIds = new Map(priorServings
          .filter((serving) => serving.sourceServingId !== null)
          .map((serving) => [serving.sourceServingId, serving.id]));

        await tx
          .delete(foodServings)
          .where(
            and(
              eq(foodServings.foodId, id),
              eq(foodServings.source, providerFood.provider),
            ),
          );
        if (providerFood.servings.length > 0) {
          await tx.insert(foodServings).values(
            providerFood.servings.map((serving) => ({
              // A second user's search may refresh this food while the first
              // user is choosing a portion. Keep the provider's serving UUID
              // valid across refreshes; diary nutrition is a separate snapshot.
              ...(serving.sourceServingId && servingIds.has(serving.sourceServingId)
                ? { id: servingIds.get(serving.sourceServingId) }
                : {}),
              foodId: id,
              servingName: normalizeFoodText(serving.name),
              quantity: serving.quantity,
              unit: serving.unit,
              gramWeight: serving.gramWeight,
              milliliterVolume: serving.milliliterVolume,
              isDefault: serving.isDefault,
              source: providerFood.provider,
              sourceServingId: serving.sourceServingId,
            })),
          );
        }

        await tx.delete(foodNutrients).where(eq(foodNutrients.foodId, id));
        const nutrientRows = [
          {
            canonicalName: "calories",
            amount: providerFood.calories,
            unit: "kcal",
            nutrientType: "energy",
            displayOrder: 0,
          },
          ...Object.entries(providerFood.nutrients).map(
            ([canonicalName, nutrient], index) => ({
              canonicalName: normalizeFoodText(canonicalName).toLocaleLowerCase(
                "en-US",
              ),
              amount: nutrient.amount,
              unit: nutrient.unit,
              nutrientType: nutrientType(canonicalName),
              displayOrder: index + 1,
            }),
          ),
        ];

        for (const nutrient of nutrientRows) {
          const insertedDefinitions = await tx
            .insert(nutrientDefinitions)
            .values({
              canonicalName: nutrient.canonicalName,
              displayName: displayName(nutrient.canonicalName),
              unit: nutrient.unit,
              nutrientType: nutrient.nutrientType,
              displayOrder: nutrient.displayOrder,
            })
            .onConflictDoNothing({ target: nutrientDefinitions.canonicalName })
            .returning({
              id: nutrientDefinitions.id,
              unit: nutrientDefinitions.unit,
            });
          const definitions =
            insertedDefinitions.length > 0
              ? insertedDefinitions
              : await tx
                  .select({
                    id: nutrientDefinitions.id,
                    unit: nutrientDefinitions.unit,
                  })
                  .from(nutrientDefinitions)
                  .where(
                    eq(
                      nutrientDefinitions.canonicalName,
                      nutrient.canonicalName,
                    ),
                  )
                  .limit(1);
          const definition = definitions[0];
          if (definition && definition.unit !== nutrient.unit) {
            throw new Error("NUTRIENT_DEFINITION_MISMATCH");
          }
          const nutrientId = definition?.id;
          if (!nutrientId) throw new Error("NUTRIENT_UPSERT_FAILED");

          await tx.insert(foodNutrients).values({
            foodId: id,
            nutrientId,
            amount: nutrient.amount,
            basisQuantity: providerFood.basisQuantity,
            basisUnit: providerFood.basisUnit,
          });
        }

        return id;
      });

      const stored = await loadFoods(db, [foodId]);
      if (!stored[0]) throw new Error("FOOD_UPSERT_FAILED");
      return stored[0];
    },

    async getFoodById(id) {
      const stored = await loadFoods(db, [id]);
      return stored[0] ?? null;
    },
  };
}

async function recentFoodIds(
  db: BiteIqDatabase,
  userId: string,
  limit: number,
): Promise<string[]> {
  const rows = await db
    .select({
      id: foods.id,
      lastUsedAt: sql<Date>`max(${foodEntries.consumedAt})`,
      useCount: sql<number>`count(${foodEntries.id})::int`,
    })
    .from(foodEntries)
    .innerJoin(
      foods,
      and(eq(foods.id, foodEntries.foodId), sql`${foods.disabledAt} is null`),
    )
    .where(eq(foodEntries.userId, userId))
    .groupBy(foods.id)
    .orderBy(
      desc(sql`max(${foodEntries.consumedAt})`),
      desc(sql`count(${foodEntries.id})`),
      asc(foods.normalizedName),
      asc(foods.id),
    )
    .limit(limit);

  return rows.map((row) => row.id);
}

async function matchingFoodIds(
  db: BiteIqDatabase,
  userId: string,
  normalizedQuery: string,
  limit: number,
): Promise<string[]> {
  const result = await db.execute<{ id: string }>(sql`
    with user_context as (
      select ${userProfiles.countryCode} as country_code
      from ${userProfiles}
      where ${userProfiles.userId} = ${userId}
    ), user_usage as (
      select
        ${foodEntries.foodId} as food_id,
        max(${foodEntries.consumedAt}) as last_used_at,
        count(*)::int as use_count
      from ${foodEntries}
      where ${foodEntries.userId} = ${userId}
        and ${foodEntries.foodId} is not null
      group by ${foodEntries.foodId}
    ), alias_scores as (
      select
        ${foodAliases.foodId} as food_id,
        max(similarity(${foodAliases.normalizedAlias}, ${normalizedQuery})) as alias_score
      from ${foodAliases}
      where ${foodAliases.normalizedAlias} % ${normalizedQuery}
         or ${foodAliases.normalizedAlias} like ${`%${escapeLike(normalizedQuery)}%`} escape '\\'
      group by ${foodAliases.foodId}
    )
    select ${foods.id} as id
    from ${foods}
    left join user_context on true
    left join user_usage on user_usage.food_id = ${foods.id}
    left join alias_scores on alias_scores.food_id = ${foods.id}
    where ${foods.disabledAt} is null
      and (
        ${foods.normalizedName} % ${normalizedQuery}
        or ${foods.normalizedName} like ${`%${escapeLike(normalizedQuery)}%`} escape '\\'
        or alias_scores.food_id is not null
      )
    order by
      (${foods.normalizedName} = ${normalizedQuery}) desc,
      (${foods.normalizedName} like ${`${escapeLike(normalizedQuery)}%`} escape '\\') desc,
      greatest(
        similarity(${foods.normalizedName}, ${normalizedQuery}),
        coalesce(alias_scores.alias_score, 0)
      ) desc,
      (${foods.countryCode} is not distinct from user_context.country_code
        and user_context.country_code is not null) desc,
      case ${foods.dataQuality}
        when 'verified_authoritative' then 5
        when 'authoritative' then 5
        when 'verified_manufacturer' then 4
        when 'manufacturer' then 4
        when 'community' then 3
        when 'user_created' then 2
        when 'unverified' then 1
        else 0
      end desc,
      user_usage.last_used_at desc nulls last,
      user_usage.use_count desc nulls last,
      ${foods.normalizedName} asc,
      ${foods.id} asc
    limit ${limit}
  `);

  return result.rows.map((row) => row.id);
}

async function loadFoods(
  db: BiteIqDatabase,
  ids: string[],
): Promise<CanonicalFood[]> {
  if (ids.length === 0) return [];

  const [foodRows, sourceRows, nutrientRows, servingRows] = await Promise.all([
    db.select().from(foods).where(inArray(foods.id, ids)),
    db
      .select()
      .from(foodExternalSources)
      .where(inArray(foodExternalSources.foodId, ids))
      .orderBy(desc(foodExternalSources.importedAt), asc(foodExternalSources.id)),
    db
      .select({
        foodId: foodNutrients.foodId,
        canonicalName: nutrientDefinitions.canonicalName,
        unit: nutrientDefinitions.unit,
        amount: foodNutrients.amount,
        basisQuantity: foodNutrients.basisQuantity,
        basisUnit: foodNutrients.basisUnit,
      })
      .from(foodNutrients)
      .innerJoin(
        nutrientDefinitions,
        eq(nutrientDefinitions.id, foodNutrients.nutrientId),
      )
      .where(inArray(foodNutrients.foodId, ids))
      .orderBy(asc(nutrientDefinitions.displayOrder)),
    db
      .select()
      .from(foodServings)
      .where(inArray(foodServings.foodId, ids))
      .orderBy(desc(foodServings.isDefault), asc(foodServings.servingName)),
  ]);

  const foodById = new Map(foodRows.map((row) => [row.id, row]));
  const sourcesByFood = groupBy(sourceRows, (row) => row.foodId);
  const nutrientsByFood = groupBy(nutrientRows, (row) => row.foodId);
  const servingsByFood = groupBy(servingRows, (row) => row.foodId);

  return ids.flatMap((id) => {
    const food = foodById.get(id);
    if (!food || food.disabledAt) return [];

    const source = sourcesByFood.get(id)?.[0];
    const reference = source?.originalServingReference as
      | StoredSourceReference
      | null
      | undefined;
    const nutritionRows = nutrientsByFood.get(id) ?? [];
    const calories = nutritionRows.find(
      (row) => row.canonicalName === "calories",
    );
    const nutrients: NutrientValues = {};
    for (const nutrient of nutritionRows) {
      if (nutrient.canonicalName !== "calories") {
        nutrients[nutrient.canonicalName] = {
          amount: nutrient.amount,
          unit: nutrient.unit,
        };
      }
    }

    return [
      {
        id: food.id,
        name: food.name,
        normalizedName: food.normalizedName,
        brand: food.brand,
        description: food.description,
        category: food.category,
        countryCode: food.countryCode,
        languageCode: food.languageCode,
        foodType: food.foodType,
        preparationState: food.preparationState,
        ingredientsText: food.ingredientsText,
        dataQuality: food.dataQuality,
        verified: food.verified,
        source: source
          ? {
              provider: source.provider,
              externalId: source.externalId,
              datasetType: source.datasetType,
              providerUpdatedAt: dateString(source.providerUpdatedAt),
              importedAt: source.importedAt.toISOString(),
              verificationState:
                source.verificationState as VerificationState,
              attribution:
                typeof reference?.attribution === "string"
                  ? reference.attribution
                  : null,
              licenseCategory: source.licenseCategory,
            }
          : null,
        calories: calories?.amount ?? null,
        nutrients,
        basisQuantity:
          calories?.basisQuantity ??
          (typeof reference?.basisQuantity === "string"
            ? reference.basisQuantity
            : null),
        basisUnit:
          (calories?.basisUnit as NutritionBasisUnit | undefined) ??
          (reference?.basisUnit === "g" || reference?.basisUnit === "ml"
            ? reference.basisUnit
            : null),
        servings: (servingsByFood.get(id) ?? []).map((serving) => ({
          id: serving.id,
          name: serving.servingName,
          quantity: serving.quantity,
          unit: serving.unit as FoodServing["unit"],
          gramWeight: serving.gramWeight,
          milliliterVolume: serving.milliliterVolume,
          isDefault: serving.isDefault,
          source: serving.source,
          sourceServingId: serving.sourceServingId,
        })),
        createdAt: food.createdAt.toISOString(),
        updatedAt: food.updatedAt.toISOString(),
      },
    ];
  });
}

function providerFoodValues(providerFood: ProviderFood) {
  return {
    name: normalizeFoodText(providerFood.name),
    normalizedName: normalizeFoodText(providerFood.name).toLocaleLowerCase(
      "en-US",
    ),
    brand: normalizeOptionalText(providerFood.brand),
    description: normalizeOptionalText(providerFood.description),
    category: normalizeOptionalText(providerFood.category),
    foodType: normalizeFoodText(providerFood.foodType),
    preparationState: normalizeOptionalText(providerFood.preparationState),
    ingredientsText: normalizeOptionalText(providerFood.ingredientsText),
    dataQuality: providerFood.verificationState,
    verified:
      providerFood.verificationState === "verified_authoritative" ||
      providerFood.verificationState === "verified_manufacturer",
  };
}

export function normalizeFoodText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function normalizeOptionalText(value: string | null): string | null {
  if (value === null) return null;
  const normalized = normalizeFoodText(value);
  return normalized.length > 0 ? normalized : null;
}

function parseProviderDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function dateString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function displayName(canonicalName: string): string {
  return canonicalName
    .split(/[_\s]+/u)
    .map((part) => part.charAt(0).toLocaleUpperCase("en-US") + part.slice(1))
    .join(" ");
}

function nutrientType(canonicalName: string): string {
  return ["protein", "carbohydrate", "fat"].includes(
    canonicalName.toLocaleLowerCase("en-US"),
  )
    ? "macro"
    : "other";
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

function groupBy<T>(
  values: T[],
  key: (value: T) => string,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const itemKey = key(value);
    const items = grouped.get(itemKey) ?? [];
    items.push(value);
    grouped.set(itemKey, items);
  }
  return grouped;
}
