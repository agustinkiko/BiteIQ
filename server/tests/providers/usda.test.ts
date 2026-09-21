import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNutritionRegistry } from "../../src/providers/nutrition/registry.js";
import { createUsdaProvider } from "../../src/providers/nutrition/usda.js";
import { calculateServingNutrition } from "../../src/modules/foods/nutrition.js";

const apiKey = "test-usda-secret-key";
const searchFixture = JSON.parse(
  readFileSync(new URL("../fixtures/usda-search.json", import.meta.url), "utf8"),
) as Record<string, unknown>;
const detailFixture = JSON.parse(
  readFileSync(new URL("../fixtures/usda-detail.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fetchReturning(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () => jsonResponse(body, status)) as unknown as typeof fetch;
}

function copyFixture(): { foods: Array<Record<string, unknown>> } {
  return structuredClone(searchFixture) as { foods: Array<Record<string, unknown>> };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("USDA nutrition provider", () => {
  it("omits a search result with no energy while preserving usable USDA records", async () => {
    const payload = copyFixture();
    payload.foods.splice(1, 0, {
      fdcId: 2759004, dataType: "Foundation", description: "Lunchmeat, chicken breast, sliced",
      foodNutrients: [{ nutrientId: 1087, nutrientNumber: "301", unitName: "MG", value: 12 }],
    });
    const foods = await createUsdaProvider({ apiKey }, fetchReturning(payload))
      .searchFoods({ query: "chicken breast roasted", limit: 10 });
    expect(foods.map((food) => food.externalId)).toEqual(["171077", "2346395", "2644829"]);
  });

  it("reports unusable search data when every result lacks energy, but permits a true empty search", async () => {
    const provider = createUsdaProvider({ apiKey }, fetchReturning({ foods: [{
      fdcId: 2759004, dataType: "Foundation", description: "Incomplete food", foodNutrients: [],
    }] }));
    await expect(provider.searchFoods({ query: "chicken", limit: 10 }))
      .rejects.toThrow("INVALID_NUTRITION_PROVIDER_PAYLOAD");
    await expect(createUsdaProvider({ apiKey }, fetchReturning({ foods: [] }))
      .searchFoods({ query: "no match", limit: 10 })).resolves.toEqual([]);
  });

  it("always offers the exact metric basis alongside household servings", async () => {
    const mass = await createUsdaProvider({ apiKey }, fetchReturning(detailFixture)).getFood("171077");
    const grams = mass?.servings.find((s) => s.name === "100 g");
    expect(grams).toEqual(expect.objectContaining({ gramWeight: "100.0000", milliliterVolume: null }));
    expect(calculateServingNutrition(mass!, grams!, "1.5").calories).toBe("247.500000");
    expect(calculateServingNutrition(mass!, grams!, "2.25").consumedGrams).toBe("225.0000");

    const volume = await createUsdaProvider({ apiKey }, fetchReturning({
      ...detailFixture, dataType: "Branded", servingSize: 236, servingSizeUnit: "ml", foodPortions: [],
    })).getFood("171077");
    const milliliters = volume?.servings.find((s) => s.name === "100 ml");
    expect(milliliters).toEqual(expect.objectContaining({ gramWeight: null, milliliterVolume: "100.0000" }));
    expect(calculateServingNutrition(volume!, milliliters!, "1.5").consumedMilliliters).toBe("150.0000");
    expect(volume?.servings.filter((s) => s.isDefault)).toHaveLength(1);
  });

  it("recovers USDA full detail with missing nutrient identities from matching abridged data", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        ...detailFixture, fdcId: 1909132, dataType: "Branded",
        servingSize: 236, servingSizeUnit: "ml", householdServingFullText: "1 cup", foodPortions: [],
        foodNutrients: [{ id: 23933640, amount: 55 }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        fdcId: 1909132,
        foodNutrients: [
          { number: "208", name: "Energy", amount: 55, unitName: "KCAL" },
          { number: "203", name: "Protein", amount: 3.39, unitName: "G" },
        ],
      }));
    const food = await createUsdaProvider({ apiKey }, fetchImpl).getFood("1909132");

    expect(food?.calories).toBe("55.000000");
    expect(food?.nutrients.protein?.amount).toBe("3.390000");
    expect(food?.servings[0]?.milliliterVolume).toBe("236.0000");
    expect(new URL(fetchImpl.mock.calls[1]?.[0]).searchParams.get("format")).toBe("abridged");
  });

  it("rejects mismatched abridged detail instead of borrowing another food's nutrients", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ...detailFixture, foodNutrients: [{ id: 99, amount: 55 }] }))
      .mockResolvedValueOnce(jsonResponse({
        fdcId: 999, foodNutrients: [{ number: "208", amount: 55, unitName: "KCAL" }],
      }));
    await expect(createUsdaProvider({ apiKey }, fetchImpl).getFood("171077"))
      .rejects.toThrow("INVALID_NUTRITION_PROVIDER_PAYLOAD");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("preserves branded liquid nutrition per 100 ml without assuming gram density", async () => {
    const payload = copyFixture();
    payload.foods = [{
      ...payload.foods[2],
      servingSize: 240,
      servingSizeUnit: "mL",
      householdServingFullText: "1 cup",
    }];
    const provider = createUsdaProvider({ apiKey }, fetchReturning(payload));

    const [food] = await provider.searchFoods({ query: "milk", limit: 5 });

    expect(food?.basisUnit).toBe("ml");
    expect(food?.servings[0]).toEqual(expect.objectContaining({
      name: "1 cup", gramWeight: null, milliliterVolume: "240.0000",
    }));
    const snapshot = calculateServingNutrition(food!, food!.servings[0]!, "1");
    expect(snapshot.calories).toBe("141.600000");
    expect(snapshot.consumedGrams).toBeNull();
    expect(snapshot.consumedMilliliters).toBe("240.0000");
  });

  it("includes SR Legacy portion amounts and Foundation measure units in serving names", async () => {
    const payload = {
      ...detailFixture,
      foodPortions: [
        { id: 1, amount: 4, modifier: "oz", gramWeight: 113,
          measureUnit: { name: "undetermined" } },
        { id: 2, amount: 1, gramWeight: 4,
          measureUnit: { name: "teaspoon", abbreviation: "tsp" } },
        { id: 3, amount: 0.5, modifier: "chopped", gramWeight: 80,
          measureUnit: { name: "cup" } },
      ],
    };
    const provider = createUsdaProvider({ apiKey }, fetchReturning(payload));

    const food = await provider.getFood("171077");

    expect(food?.servings.map(({ name, gramWeight }) => ({ name, gramWeight }))).toEqual([
      { name: "4 oz", gramWeight: "113.0000" },
      { name: "1 teaspoon", gramWeight: "4.0000" },
      { name: "0.5 cup, chopped", gramWeight: "80.0000" },
      { name: "100 g", gramWeight: "100.0000" },
    ]);
  });

  it("preserves absent nutrients as unknown and refuses to invent missing calories", async () => {
    const withEnergyOnly = {
      ...detailFixture,
      foodNutrients: [{ amount: 120, nutrient: { id: 1008, unitName: "kcal" } }],
    };
    const food = await createUsdaProvider({ apiKey }, fetchReturning(withEnergyOnly)).getFood("171077");
    expect(food?.nutrients).toEqual({});
    await expect(createUsdaProvider({ apiKey }, fetchReturning({
      ...detailFixture, foodNutrients: [],
    })).getFood("171077")).rejects.toThrow("INVALID_NUTRITION_PROVIDER_PAYLOAD");
  });

  it("normalizes Foundation, FNDDS, and Branded search records", async () => {
    const provider = createUsdaProvider({ apiKey }, fetchReturning(searchFixture));

    const foods = await provider.searchFoods({ query: "chicken", limit: 10 });

    expect(foods).toHaveLength(3);
    expect(foods[0]).toEqual(
      expect.objectContaining({
        provider: "usda",
        externalId: "171077",
        dataType: "Foundation",
        name: "Chicken, broilers or fryers, breast, meat only, cooked, roasted",
        brand: null,
        category: "Poultry Products",
        preparationState: "cooked",
        calories: "165.000000",
        basisQuantity: "100.0000",
        basisUnit: "g",
        verificationState: "verified_authoritative",
        sourceUpdatedAt: "2019-04-01",
        attribution: "USDA FoodData Central",
        nutrients: {
          protein: { amount: "31.020000", unit: "g" },
          carbohydrate: { amount: "0.000000", unit: "g" },
          fat: { amount: "3.570000", unit: "g" },
        },
      }),
    );
    expect(foods[0]?.servings).toEqual([
      expect.objectContaining({
        name: "1 breast",
        quantity: "1.0000",
        gramWeight: "172.0000",
        milliliterVolume: null,
      }),
      expect.objectContaining({ name: "100 g", gramWeight: "100.0000" }),
    ]);
    expect(foods[1]).toEqual(
      expect.objectContaining({
        externalId: "2346395",
        dataType: "Survey (FNDDS)",
        preparationState: "cooked",
        calories: "100.000000",
        verificationState: "verified_authoritative",
      }),
    );
    expect(foods[2]).toEqual(
      expect.objectContaining({
        externalId: "2644829",
        dataType: "Branded",
        brand: "Example Dairy",
        preparationState: null,
        calories: "59.000000",
        verificationState: "verified_manufacturer",
        sourceUpdatedAt: "2024-01-12",
      }),
    );
    expect(foods[2]?.servings).toEqual([
      expect.objectContaining({
        name: "1 container",
        quantity: "1.0000",
        gramWeight: "170.0000",
      }),
      expect.objectContaining({ name: "100 g", gramWeight: "100.0000" }),
    ]);
    expect(JSON.stringify(foods)).not.toContain(apiKey);
  });

  it("preserves label kcal instead of replacing it with converted kJ", async () => {
    const provider = createUsdaProvider({ apiKey }, fetchReturning(searchFixture));

    const foods = await provider.searchFoods({ query: "yogurt", limit: 10 });

    expect(foods[2]?.calories).toBe("59.000000");
  });

  it("does not trust dataset names that merely contain Foundation", async () => {
    const payload = copyFixture();
    payload.foods[0] = { ...payload.foods[0], dataType: "Not Foundation" };
    const provider = createUsdaProvider({ apiKey }, fetchReturning(payload));

    const foods = await provider.searchFoods({ query: "chicken", limit: 10 });

    expect(foods[0]?.verificationState).toBe("unverified");
  });

  it("retrieves and normalizes USDA detail records", async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(String(input));
      return jsonResponse(detailFixture);
    }) as unknown as typeof fetch;
    const provider = createUsdaProvider({ apiKey }, fetchImpl);

    const food = await provider.getFood("171077");

    expect(food).toEqual(
      expect.objectContaining({
        externalId: "171077",
        dataType: "Foundation",
        calories: "165.000000",
        verificationState: "verified_authoritative",
      }),
    );
    expect(food?.servings).toEqual([
      expect.objectContaining({
        id: "usda-171077-87700",
        name: "1 breast",
        gramWeight: "172.0000",
      }),
      expect.objectContaining({ name: "100 g", gramWeight: "100.0000" }),
    ]);
    expect(new URL(requestedUrls[0] ?? "").pathname).toBe("/fdc/v1/food/171077");
    expect(new URL(requestedUrls[0] ?? "").searchParams.get("api_key")).toBe(apiKey);
    expect(JSON.stringify(food)).not.toContain(apiKey);
  });

  it("sends the API key only at the USDA request boundary", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      return jsonResponse(searchFixture);
    }) as unknown as typeof fetch;
    const provider = createUsdaProvider({ apiKey }, fetchImpl);

    await provider.searchFoods({ query: "  Chicken Breast  ", limit: 2 });

    const request = requests[0];
    expect(request).toBeDefined();
    const url = new URL(request?.url ?? "");
    expect(url.pathname).toBe("/fdc/v1/foods/search");
    expect(url.searchParams.get("api_key")).toBe(apiKey);
    expect(request?.init?.method).toBe("POST");
    expect(JSON.parse(String(request?.init?.body))).toEqual({
      query: "Chicken Breast",
      pageSize: 2,
    });
  });

  it("returns null for missing detail records and unsupported barcode lookup", async () => {
    const provider = createUsdaProvider({ apiKey }, fetchReturning({}, 404));

    await expect(provider.getFood("999999999")).resolves.toBeNull();
    await expect(provider.lookupBarcode("0123456789012")).resolves.toBeNull();
  });

  it.each([
    {
      label: "a negative nutrient",
      mutate: (payload: { foods: Array<Record<string, unknown>> }) => {
        const nutrients = payload.foods[0]?.foodNutrients as Array<Record<string, unknown>>;
        if (nutrients[1]) nutrients[1].value = -1;
      },
    },
    {
      label: "a non-finite nutrient",
      mutate: (payload: { foods: Array<Record<string, unknown>> }) => {
        const nutrients = payload.foods[0]?.foodNutrients as Array<Record<string, unknown>>;
        if (nutrients[1]) nutrients[1].value = "Infinity";
      },
    },
    {
      label: "a missing FDC ID",
      mutate: (payload: { foods: Array<Record<string, unknown>> }) => {
        delete payload.foods[0]?.fdcId;
      },
    },
    {
      label: "a zero-weight serving",
      mutate: (payload: { foods: Array<Record<string, unknown>> }) => {
        const measures = payload.foods[0]?.foodMeasures as Array<Record<string, unknown>>;
        if (measures[0]) measures[0].gramWeight = 0;
      },
    },
  ])("rejects a provider payload containing $label", async ({ mutate }) => {
    const payload = copyFixture();
    mutate(payload);
    const provider = createUsdaProvider({ apiKey }, fetchReturning(payload));

    await expect(provider.searchFoods({ query: "chicken", limit: 10 })).rejects.toThrow(
      "INVALID_NUTRITION_PROVIDER_PAYLOAD",
    );
  });

  it("caches clean search results for five minutes by normalized query and limit", async () => {
    vi.useFakeTimers();
    const fetchImpl = fetchReturning(searchFixture);
    const provider = createUsdaProvider({ apiKey }, fetchImpl);

    const first = await provider.searchFoods({ query: "  CHICKEN   breast ", limit: 5 });
    await vi.advanceTimersByTimeAsync(299_999);
    const cached = await provider.searchFoods({ query: "chicken breast", limit: 5 });
    expect(cached).toEqual(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await provider.searchFoods({ query: "chicken breast", limit: 5 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    await provider.searchFoods({ query: "chicken breast", limit: 6 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("shares one in-flight request for identical normalized searches", async () => {
    let release: ((response: Response) => void) | undefined;
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    ) as unknown as typeof fetch;
    const provider = createUsdaProvider({ apiKey }, fetchImpl);

    const first = provider.searchFoods({ query: "  Chicken  ", limit: 5 });
    const second = provider.searchFoods({ query: "chicken", limit: 5 });
    release?.(jsonResponse(searchFixture));

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.any(Array),
      expect.any(Array),
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([429, 500])("does not cache an HTTP %s failure", async (status) => {
    const fetchImpl = fetchReturning({}, status);
    const provider = createUsdaProvider({ apiKey }, fetchImpl);

    await expect(provider.searchFoods({ query: "chicken", limit: 5 })).rejects.toThrow(
      "NUTRITION_PROVIDER_UNAVAILABLE",
    );
    await expect(provider.searchFoods({ query: "chicken", limit: 5 })).rejects.toThrow(
      "NUTRITION_PROVIDER_UNAVAILABLE",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not cache invalid payload failures", async () => {
    const fetchImpl = fetchReturning({ foods: null });
    const provider = createUsdaProvider({ apiKey }, fetchImpl);

    await expect(provider.searchFoods({ query: "chicken", limit: 5 })).rejects.toThrow(
      "INVALID_NUTRITION_PROVIDER_PAYLOAD",
    );
    await expect(provider.searchFoods({ query: "chicken", limit: 5 })).rejects.toThrow(
      "INVALID_NUTRITION_PROVIDER_PAYLOAD",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("aborts after eight seconds and does not cache the timeout", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("request aborted")));
      });
    }) as unknown as typeof fetch;
    const provider = createUsdaProvider({ apiKey }, fetchImpl);

    const first = expect(
      provider.searchFoods({ query: "chicken", limit: 5 }),
    ).rejects.toThrow("NUTRITION_PROVIDER_TIMEOUT");
    await vi.advanceTimersByTimeAsync(7_999);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await first;

    const second = expect(
      provider.searchFoods({ query: "chicken", limit: 5 }),
    ).rejects.toThrow("NUTRITION_PROVIDER_TIMEOUT");
    await vi.advanceTimersByTimeAsync(8_000);
    await second;
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("never includes the API key in errors", async () => {
    const provider = createUsdaProvider({ apiKey }, fetchReturning({}, 500));

    const error = await provider.searchFoods({ query: "chicken", limit: 5 }).catch((caught) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain(apiKey);
  });

  it("reports USDA metadata", () => {
    const provider = createUsdaProvider({ apiKey }, fetchReturning(searchFixture));

    expect(provider.id).toBe("usda");
    expect(provider.providerMetadata()).toEqual({
      id: "usda",
      displayName: "USDA FoodData Central",
      attribution: "U.S. Department of Agriculture, Agricultural Research Service",
    });
  });
});

describe("nutrition provider registry", () => {
  it("registers USDA and the development provider outside production", () => {
    const registry = createNutritionRegistry({
      nodeEnv: "development",
      usdaApiKey: apiKey,
    });

    expect(registry.list().map((provider) => provider.id)).toEqual(["usda", "development"]);
    expect(registry.get("usda")?.id).toBe("usda");
  });

  it("registers only USDA in production", () => {
    const registry = createNutritionRegistry({
      nodeEnv: "production",
      usdaApiKey: apiKey,
    });

    expect(registry.list().map((provider) => provider.id)).toEqual(["usda"]);
    expect(registry.get("development")).toBeUndefined();
  });

  it("keeps development available when USDA is not configured", () => {
    const registry = createNutritionRegistry({ nodeEnv: "development" });

    expect(registry.list().map((provider) => provider.id)).toEqual(["development"]);
    expect(registry.get("usda")).toBeUndefined();
  });

  it("has no nutrition providers in production when USDA is not configured", () => {
    const registry = createNutritionRegistry({ nodeEnv: "production" });

    expect(registry.list()).toEqual([]);
    expect(registry.get("usda")).toBeUndefined();
  });
});
