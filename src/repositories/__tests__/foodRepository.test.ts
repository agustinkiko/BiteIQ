import { authClient } from "@/auth/authClient";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";
import {
  defaultFoodSourceConfig,
  defaultProviderConfig,
  providerPresets
} from "@/config/defaults";
import { createFeatureFlags, DEVELOPMENT_PREVIEW, featureFlags } from "@/config/features";
import { FoodSourceSettingsCard } from "@/components/FoodSourceSettingsCard";
import { foodRepository } from "@/repositories/foodRepository";
import * as dayLogHook from "@/hooks/useDayLog";
import { FoodDetailScreen } from "@/screens/FoodDetailScreen";
import { FoodSearchScreen } from "@/screens/FoodSearchScreen";
import { SettingsScreen } from "@/screens/SettingsScreen";
import { createModelProvider } from "@/services/ai/providerRegistry";
import { LocalHttpProvider } from "@/services/ai/providers/localHttpProvider";
import { fatSecretSource } from "@/services/food/sources/fatSecret";
import { usdaSource } from "@/services/food/sources/usda";
import { searchFoods } from "@/services/foodSearch";
import { useAppStore } from "@/store/useAppStore";
import { DatabaseFood } from "@/types/domain";

jest.mock("@/auth/authClient", () => ({
  authClient: {
    getCookie: jest.fn(),
    useSession: jest.fn(() => ({ data: null, isPending: false, error: null }))
  }
}));

const mockGetCookie = authClient.getCookie as jest.MockedFunction<typeof authClient.getCookie>;

type StubResponse = {
  ok: boolean;
  status: number;
  json: jest.Mock<Promise<unknown>, []>;
};

function response(status: number, body: unknown): StubResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body)
  };
}

const testQueryClients = new Set<QueryClient>();

function createTestQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 }
    }
  });
  testQueryClients.add(client);
  return client;
}

function renderWithQueryClient(element: React.ReactElement) {
  const client = createTestQueryClient();
  return render(React.createElement(QueryClientProvider, { client }, element));
}

afterEach(() => {
  for (const client of testQueryClients) client.clear();
  testQueryClients.clear();
});

const canonicalFood = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Chicken breast, cooked",
  normalizedName: "chicken breast, cooked",
  brand: "Test Brand",
  description: "Cooked chicken breast",
  category: "Poultry",
  countryCode: null,
  languageCode: null,
  foodType: "generic",
  preparationState: "cooked",
  ingredientsText: null,
  dataQuality: "verified_authoritative",
  verified: true,
  source: {
    provider: "usda",
    externalId: "171077",
    datasetType: "Foundation",
    providerUpdatedAt: "2019-04-01T00:00:00.000Z",
    importedAt: "2026-09-08T00:00:00.000Z",
    verificationState: "verified_authoritative",
    attribution: "USDA FoodData Central",
    licenseCategory: null
  },
  calories: "165.000000",
  nutrients: {
    protein: { amount: "31.000000", unit: "g" },
    carbohydrate: { amount: "0.000000", unit: "g" },
    fat: { amount: "3.600000", unit: "g" },
    sodium: { amount: "74.000000", unit: "mg" }
  },
  basisQuantity: "100.0000",
  basisUnit: "g",
  servings: [
    {
      id: "serving-breast",
      name: "1 breast",
      quantity: "1.0000",
      unit: "serving",
      gramWeight: "172.0000",
      milliliterVolume: null,
      isDefault: true,
      source: "usda",
      sourceServingId: "breast"
    },
    {
      id: "serving-100g",
      name: "100 g",
      quantity: "100.0000",
      unit: "g",
      gramWeight: "100.0000",
      milliliterVolume: null,
      isDefault: false,
      source: "usda",
      sourceServingId: "100g"
    }
  ],
  createdAt: "2026-09-08T00:00:00.000Z",
  updatedAt: "2026-09-08T00:00:00.000Z"
};

describe("foodRepository", () => {
  const fetchMock = jest.fn<Promise<StubResponse>, [RequestInfo | URL, RequestInit?]>();

  beforeEach(() => {
    mockGetCookie.mockReset();
    mockGetCookie.mockReturnValue("better-auth.session_token=session-value");
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("trims the query, forwards cancellation, and maps canonical search results", async () => {
    fetchMock.mockResolvedValue(response(200, { foods: [canonicalFood], warnings: [] }));
    const controller = new AbortController();

    const result = await foodRepository.search("  chicken breast  ", controller.signal);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://biteiq.test/api/foods/search?q=chicken%20breast&limit=40"
    );
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
    expect(result).toEqual({
      foods: [
        expect.objectContaining({
          id: canonicalFood.id,
          name: "Chicken breast, cooked",
          brand: "Test Brand",
          category: "protein",
          source: "usda",
          preparationState: "cooked",
          dataQuality: "verified_authoritative",
          verified: true,
          per100g: expect.objectContaining({
            calories: 165,
            proteinGrams: 31,
            carbGrams: 0,
            fatGrams: 3.6,
            sodiumMg: 74
          }),
          servings: [
            expect.objectContaining({ id: "serving-breast", label: "1 breast", grams: 172 }),
            expect.objectContaining({ id: "serving-100g", label: "100 g", grams: 100 })
          ],
          sourceDetails: expect.objectContaining({
            provider: "usda",
            attribution: "USDA FoodData Central"
          })
        })
      ],
      warnings: []
    });
  });

  it("maps provider warnings while preserving usable local results", async () => {
    fetchMock.mockResolvedValue(
      response(200, {
        foods: [{ ...canonicalFood, source: null, brand: null, dataQuality: "unverified" }],
        warnings: [
          {
            code: "NUTRITION_PROVIDER_UNAVAILABLE",
            provider: "usda",
            message: "The nutrition database is unavailable. Try again."
          }
        ]
      })
    );

    const result = await foodRepository.search("chicken");

    expect(result.foods[0]).toEqual(expect.objectContaining({ source: "local", dataQuality: "unverified" }));
    expect(result.warnings).toEqual([
      {
        code: "NUTRITION_PROVIDER_UNAVAILABLE",
        provider: "usda",
        message: "The nutrition database is unavailable. Try again."
      }
    ]);
  });

  it.each(["community", "user_created"] as const)(
    "preserves %s quality for the food and source verification state",
    async (quality) => {
      fetchMock.mockResolvedValue(
        response(200, {
          foods: [
            {
              ...canonicalFood,
              dataQuality: quality,
              source: { ...canonicalFood.source, verificationState: quality }
            }
          ],
          warnings: []
        })
      );

      const result = await foodRepository.search("chicken");

      expect(result.foods[0]?.dataQuality).toBe(quality);
      expect(result.foods[0]?.sourceDetails?.verificationState).toBe(quality);
    }
  );

  it.each([
    { basisUnit: "g" as const, expectedAmount: 250 },
    { basisUnit: "ml" as const, expectedAmount: 240 }
  ])("uses the serving $basisUnit amount when nutrition is based on $basisUnit", async ({ basisUnit, expectedAmount }) => {
    fetchMock.mockResolvedValue(
      response(200, {
        foods: [
          {
            ...canonicalFood,
            basisUnit,
            servings: [
              {
                ...canonicalFood.servings[0],
                gramWeight: "250.0000",
                milliliterVolume: "240.0000"
              }
            ]
          }
        ],
        warnings: []
      })
    );

    const result = await foodRepository.search("milk");

    expect(result.foods[0]?.nutritionBasisUnit).toBe(basisUnit);
    expect(result.foods[0]?.servings[0]?.grams).toBe(expectedAmount);
  });

  it("returns an empty search result without inventing local food", async () => {
    fetchMock.mockResolvedValue(response(200, { foods: [], warnings: [] }));

    await expect(foodRepository.search("dragonfruit crisps")).resolves.toEqual({ foods: [], warnings: [] });
  });

  it("loads and maps the complete food detail", async () => {
    fetchMock.mockResolvedValue(response(200, { food: canonicalFood }));

    const food = await foodRepository.get(canonicalFood.id);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `https://biteiq.test/api/foods/${canonicalFood.id}`
    );
    expect(food.servings).toHaveLength(2);
    expect(food.preparationState).toBe("cooked");
    expect(food.sourceDetails?.externalId).toBe("171077");
  });

  it("serializes client defaults without provider secret fields", () => {
    const configuration = {
      foodSources: defaultFoodSourceConfig,
      modelProvider: defaultProviderConfig,
      providerPresets
    };
    const serialized = JSON.stringify(configuration);
    const keys = serialized.match(/"[^"]+"(?=:)/g)?.map((key) => key.slice(1, -1)) ?? [];

    expect(keys).not.toEqual(expect.arrayContaining(["apiKey", "clientId", "clientSecret"]));
    expect(serialized).not.toMatch(/USDA_API_KEY|FATSECRET_CLIENT_SECRET|EDAMAM_APP_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY/i);
  });
});

describe("FoodSourceSettingsCard development copy", () => {
  it("does not claim bundled offline foods are available in production", () => {
    const runtime = globalThis as typeof globalThis & { __DEV__: boolean };
    const previous = runtime.__DEV__;
    runtime.__DEV__ = false;

    try {
      const screen = render(React.createElement(FoodSourceSettingsCard));

      expect(screen.getByText("Canonical food search uses BiteIQ's server database.")).toBeTruthy();
      expect(screen.queryByText("BiteIQ built-in")).toBeNull();
      expect(screen.queryByText("Offline, always on")).toBeNull();
    } finally {
      runtime.__DEV__ = previous;
    }
  });

  it("labels bundled food examples as a development preview", () => {
    const runtime = globalThis as typeof globalThis & { __DEV__: boolean };
    const previous = runtime.__DEV__;
    runtime.__DEV__ = true;

    try {
      const screen = render(React.createElement(FoodSourceSettingsCard));

      expect(screen.getByText("Bundled food examples")).toBeTruthy();
      expect(screen.getByText(DEVELOPMENT_PREVIEW)).toBeTruthy();
    } finally {
      runtime.__DEV__ = previous;
    }
  });
});

const mappedFood: DatabaseFood = {
  id: canonicalFood.id,
  name: canonicalFood.name,
  brand: "Test Brand",
  category: "protein",
  verified: true,
  source: "usda",
  sourceDetails: {
    ...canonicalFood.source,
    verificationState: "verified_authoritative"
  },
  dataQuality: "verified_authoritative",
  preparationState: "cooked",
  nutritionBasisUnit: "g",
  per100g: {
    calories: 165,
    proteinGrams: 31,
    carbGrams: 0,
    fatGrams: 3.6
  },
  servings: [
    { id: "serving-breast", label: "1 breast", grams: 172, isDefault: true },
    { id: "serving-100g", label: "100 g", grams: 100, isDefault: false }
  ]
};

function renderFoodSearch() {
  const navigation = { goBack: jest.fn(), navigate: jest.fn() };
  const route = {
    key: "food-search",
    name: "FoodSearch" as const,
    params: { date: "2026-09-08", mealType: "lunch" as const }
  };
  return render(
    React.createElement(FoodSearchScreen, {
      navigation: navigation as never,
      route
    })
  );
}

describe("FoodSearchScreen server states", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    Object.assign(featureFlags, createFeatureFlags(process.env.NODE_ENV));
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("hides deferred capture actions when their production flags are disabled", () => {
    Object.assign(featureFlags, createFeatureFlags("production"));

    const screen = renderFoodSearch();

    expect(screen.queryByText("Photo")).toBeNull();
    expect(screen.queryByText("Barcode")).toBeNull();
    expect(screen.queryByText("Voice")).toBeNull();
    expect(screen.queryByText("Describe")).toBeNull();
    expect(screen.queryByText("Quick add")).toBeNull();
  });

  it("loads authenticated server history for Recent and hides unsupported Frequent in production", async () => {
    Object.assign(featureFlags, createFeatureFlags("production"));
    useAppStore.setState({
      recentFoods: [
        {
          foodId: "chicken-breast",
          useCount: 99,
          lastUsedAt: "2026-09-08T00:00:00.000Z"
        }
      ]
    });
    const search = jest.spyOn(foodRepository, "search").mockResolvedValue({
      foods: [mappedFood],
      warnings: []
    });
    const screen = renderFoodSearch();

    expect(screen.queryByText("Frequent")).toBeNull();
    fireEvent.press(screen.getByText("Recent"));

    expect(screen.queryByText("Chicken Breast")).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(250);
      await Promise.resolve();
    });

    expect(search).toHaveBeenCalledWith("", expect.any(AbortSignal));
    expect(screen.getByText("Chicken breast, cooked")).toBeTruthy();
  });

  it("labels every enabled development capture action exactly Development preview", () => {
    Object.assign(featureFlags, createFeatureFlags("development", true));

    const screen = renderFoodSearch();

    expect(screen.getByText("Photo")).toBeTruthy();
    expect(screen.getByText("Barcode")).toBeTruthy();
    expect(screen.getByText("Voice")).toBeTruthy();
    expect(screen.getByText("Describe")).toBeTruthy();
    expect(screen.getByText("Quick add")).toBeTruthy();
    expect(screen.getAllByText(DEVELOPMENT_PREVIEW)).toHaveLength(5);
  });

  it("labels device-only Recent and Frequent history as a development preview", () => {
    Object.assign(featureFlags, createFeatureFlags("development", true));

    const screen = renderFoodSearch();

    expect(
      screen.getByText("Development preview • Recent and Frequent use this device's history.")
    ).toBeTruthy();
  });

  it("waits 250 ms before searching and shows an empty result", async () => {
    const search = jest.spyOn(foodRepository, "search").mockResolvedValue({ foods: [], warnings: [] });
    const screen = renderFoodSearch();

    fireEvent.changeText(screen.getByPlaceholderText("Search for a food"), "dragonfruit crisps");
    act(() => jest.advanceTimersByTime(249));
    expect(search).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0]?.[0]).toBe("dragonfruit crisps");
    expect(search.mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal);
    expect(screen.getByText('No match for "dragonfruit crisps".')).toBeTruthy();
  });

  it("shows usable foods together with a provider warning", async () => {
    jest.spyOn(foodRepository, "search").mockResolvedValue({
      foods: [mappedFood],
      warnings: [
        {
          code: "NUTRITION_PROVIDER_UNAVAILABLE",
          provider: "usda",
          message: "The nutrition database is unavailable. Try again."
        }
      ]
    });
    const screen = renderFoodSearch();

    fireEvent.changeText(screen.getByPlaceholderText("Search for a food"), "chicken");
    await act(async () => {
      jest.advanceTimersByTime(250);
      await Promise.resolve();
    });

    expect(screen.getByText("Chicken breast, cooked")).toBeTruthy();
    expect(screen.getByText("USDA: The nutrition database is unavailable. Try again.")).toBeTruthy();
    expect(screen.getByText("Authoritative • cooked")).toBeTruthy();
  });

  it("opens food detail with serializable canonical identifiers and diary coordinates", async () => {
    jest.spyOn(foodRepository, "search").mockResolvedValue({ foods: [mappedFood], warnings: [] });
    const navigation = { goBack: jest.fn(), navigate: jest.fn() };
    const route = {
      key: "food-search",
      name: "FoodSearch" as const,
      params: { date: "2026-09-08", mealType: "lunch" as const }
    };
    const screen = render(
      React.createElement(FoodSearchScreen, {
        navigation: navigation as never,
        route: route as never
      })
    );

    fireEvent.changeText(screen.getByPlaceholderText("Search for a food"), "chicken");
    await act(async () => {
      jest.advanceTimersByTime(250);
      await Promise.resolve();
    });
    fireEvent.press(screen.getByText("Chicken breast, cooked"));

    expect(navigation.navigate).toHaveBeenCalledWith("FoodDetail", {
      mode: "add",
      date: "2026-09-08",
      mealType: "lunch",
      foodId: canonicalFood.id
    });
  });

  it("clears stale foods and warnings as soon as the query changes", async () => {
    jest.spyOn(foodRepository, "search").mockResolvedValue({
      foods: [mappedFood],
      warnings: [
        {
          code: "NUTRITION_PROVIDER_UNAVAILABLE",
          provider: "usda",
          message: "The nutrition database is unavailable. Try again."
        }
      ]
    });
    const screen = renderFoodSearch();
    const input = screen.getByPlaceholderText("Search for a food");

    fireEvent.changeText(input, "chicken");
    await act(async () => {
      jest.advanceTimersByTime(250);
      await Promise.resolve();
    });
    expect(screen.getByText("Chicken breast, cooked")).toBeTruthy();

    fireEvent.changeText(input, "dragonfruit");

    expect(screen.queryByText("Chicken breast, cooked")).toBeNull();
    expect(screen.queryByText("USDA: The nutrition database is unavailable. Try again.")).toBeNull();
  });

  it("shows a complete error without exposing internal details", async () => {
    jest.spyOn(foodRepository, "search").mockRejectedValue(new Error("database host 10.0.0.8 timed out"));
    const screen = renderFoodSearch();

    fireEvent.changeText(screen.getByPlaceholderText("Search for a food"), "unavailable food");
    await act(async () => {
      jest.advanceTimersByTime(250);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText("Food search is unavailable. Try again.")).toBeTruthy();
    });
    expect(screen.queryByText(/10\.0\.0\.8/)).toBeNull();
  });
});

describe("FoodDetailScreen canonical detail", () => {
  beforeEach(() => {
    useAppStore.setState({ cachedFoods: {} });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("loads complete server detail and exposes every serving for local preview", async () => {
    let resolveFood!: (food: DatabaseFood) => void;
    jest.spyOn(foodRepository, "get").mockReturnValue(
      new Promise<DatabaseFood>((resolve) => {
        resolveFood = resolve;
      })
    );
    const navigation = { goBack: jest.fn(), navigate: jest.fn() };
    const route = {
      key: "food-detail",
      name: "FoodDetail" as const,
      params: {
        mode: "add" as const,
        date: "2026-09-08",
        mealType: "lunch" as const,
        foodId: canonicalFood.id
      }
    };
    const screen = renderWithQueryClient(
      React.createElement(FoodDetailScreen, {
        navigation: navigation as never,
        route
      })
    );

    expect(screen.getByText("Loading food details…")).toBeTruthy();

    await act(async () => {
      resolveFood(mappedFood);
      await Promise.resolve();
    });

    expect(foodRepository.get).toHaveBeenCalledWith(canonicalFood.id, expect.any(AbortSignal));
    expect(screen.getByText("1 breast")).toBeTruthy();
    expect(screen.getByText("100 g")).toBeTruthy();
    expect(screen.getByText("USDA • Authoritative • cooked")).toBeTruthy();

    fireEvent.press(screen.getByText("100 g"));
    expect(screen.getAllByText("165").length).toBeGreaterThan(0);
  });

  it("emits only canonical identifiers and quantity when Add is pressed", async () => {
    useAppStore.setState({ cachedFoods: { [mappedFood.id]: mappedFood } });
    jest.spyOn(foodRepository, "get").mockResolvedValue(mappedFood);
    const addMeal = jest.fn();
    useAppStore.setState({ addMeal });
    const createEntry = jest.fn().mockResolvedValue({ queued: false, day: {} });
    jest.spyOn(dayLogHook, "useDayLog").mockReturnValue({
      log: { meals: [] }, isLoading: false, createEntry
    } as unknown as ReturnType<typeof dayLogHook.useDayLog>);
    const navigation = { goBack: jest.fn(), navigate: jest.fn() };
    const route = {
      key: "food-detail",
      name: "FoodDetail" as const,
      params: {
        mode: "add" as const,
        date: "2026-09-08",
        mealType: "lunch" as const,
        foodId: canonicalFood.id
      }
    };
    const screen = renderWithQueryClient(
      React.createElement(FoodDetailScreen, {
        navigation: navigation as never,
        route: route as never
      })
    );

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.press(screen.getByText("100 g"));
    fireEvent.press(screen.getByText("Add to diary"));

    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith("MainTabs", { screen: "Diary" }));
    expect(createEntry).toHaveBeenCalledWith({
      foodId: canonicalFood.id,
      servingId: "serving-100g",
      quantity: 1,
      mealType: "lunch"
    });
    expect(Object.keys(createEntry.mock.calls[0]?.[0] ?? {}).sort()).toEqual([
      "foodId",
      "mealType",
      "quantity",
      "servingId"
    ]);
    expect(addMeal).not.toHaveBeenCalled();
  });

  it("keeps bundled food on the explicitly labeled development path", () => {
    const get = jest.spyOn(foodRepository, "get");
    const addMeal = jest.fn();
    useAppStore.setState({ addMeal, cachedFoods: {} });
    const navigation = { goBack: jest.fn(), navigate: jest.fn() };
    const route = {
      key: "food-detail",
      name: "FoodDetail" as const,
      params: {
        mode: "add" as const,
        date: "2026-09-08",
        mealType: "lunch" as const,
        foodId: "chicken-breast"
      }
    };
    const screen = renderWithQueryClient(
      React.createElement(FoodDetailScreen, {
        navigation: navigation as never,
        route
      })
    );

    expect(screen.getByText("Development example")).toBeTruthy();
    fireEvent.press(screen.getByText("Add to diary"));

    expect(get).not.toHaveBeenCalled();
    expect(addMeal).toHaveBeenCalledTimes(1);
  });

  it("shows a safe error when canonical detail cannot be loaded", async () => {
    jest.spyOn(foodRepository, "get").mockRejectedValue(new Error("database host 10.0.0.8 timed out"));
    const navigation = { goBack: jest.fn(), navigate: jest.fn() };
    const route = {
      key: "food-detail",
      name: "FoodDetail" as const,
      params: {
        mode: "add" as const,
        date: "2026-09-08",
        mealType: "lunch" as const,
        foodId: canonicalFood.id
      }
    };
    const screen = renderWithQueryClient(
      React.createElement(FoodDetailScreen, {
        navigation: navigation as never,
        route
      })
    );

    await waitFor(() => {
      expect(screen.getByText("That food could not be loaded. Search again.")).toBeTruthy();
    });
    expect(screen.queryByText(/10\.0\.0\.8/)).toBeNull();
  });
});

describe("client provider credential boundary", () => {
  const fetchMock = jest.fn<Promise<StubResponse>, [RequestInfo | URL, RequestInit?]>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    useAppStore.setState({ providerConfig: defaultProviderConfig });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("does not render provider credential inputs or direct vendor choices", () => {
    const client = createTestQueryClient();
    const screen = render(
      React.createElement(
        QueryClientProvider,
        { client },
        React.createElement(SettingsScreen, { navigation: { goBack: jest.fn() } })
      )
    );

    expect(screen.queryByText(/^API key$/i)).toBeNull();
    expect(screen.queryByText("Codex API")).toBeNull();
    expect(screen.queryByText("Claude API")).toBeNull();
    expect(screen.getByText("Provider credentials are managed by the BiteIQ server.")).toBeTruthy();
  });

  it("drops a stale secret when Settings saves a provider", async () => {
    const save = jest.fn();
    useAppStore.setState({
      providerConfig: { ...defaultProviderConfig, apiKey: "stale-secret" } as never,
      upsertProviderConfig: save
    });
    const client = createTestQueryClient();
    const screen = render(
      React.createElement(
        QueryClientProvider,
        { client },
        React.createElement(SettingsScreen, { navigation: { goBack: jest.fn() } })
      )
    );

    fireEvent.press(screen.getByText("Save provider"));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]?.[0]).toEqual(defaultProviderConfig);
    expect(save.mock.calls[0]?.[0]).not.toHaveProperty("apiKey");
  });

  it("rejects stale direct-vendor provider types", () => {
    expect(() =>
      createModelProvider({
        ...defaultProviderConfig,
        providerType: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "stale-secret"
      } as never)
    ).toThrow("Direct AI provider credentials are not supported in the client.");
  });

  it("never attaches a stale credential to a self-hosted AI request", async () => {
    fetchMock.mockResolvedValue(
      response(200, {
        taskId: "task-1",
        confidence: 1,
        data: { message: "ok", suggestedActions: [], confidence: 1 },
        clarifyingQuestions: [],
        provenance: ["hosted"]
      })
    );
    const provider = new LocalHttpProvider({
      ...defaultProviderConfig,
      providerType: "hosted",
      apiKey: "stale-secret"
    } as never);

    await provider.chat({ message: "hello" });

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(JSON.stringify(fetchMock.mock.calls[0])).not.toContain("stale-secret");
  });

  it("blocks direct USDA credentials before any network request", async () => {
    await expect(
      usdaSource.search({
        query: "chicken",
        limit: 10,
        settings: { enabled: true, apiKey: "stale-secret" } as never
      })
    ).rejects.toThrow("USDA search is managed by the BiteIQ server.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a server proxy for FatSecret and ignores stale credentials", async () => {
    await expect(
      fatSecretSource.search({
        query: "chicken",
        limit: 10,
        settings: { enabled: true, clientId: "stale-id", clientSecret: "stale-secret" } as never
      })
    ).rejects.toThrow("FatSecret requires a server proxy URL.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("bundled food development boundary", () => {
  it("hides bundled foods and prevents their local Add path in production", async () => {
    const runtime = globalThis as typeof globalThis & { __DEV__: boolean };
    const previous = runtime.__DEV__;
    runtime.__DEV__ = false;
    const addMeal = jest.fn();
    useAppStore.setState({ addMeal, cachedFoods: {} });

    try {
      expect(searchFoods("chicken")).toEqual([]);

      const screen = renderWithQueryClient(
        React.createElement(FoodDetailScreen, {
          navigation: { goBack: jest.fn(), navigate: jest.fn() } as never,
          route: {
            key: "food-detail-production",
            name: "FoodDetail",
            params: {
              mode: "add",
              date: "2026-09-08",
              mealType: "lunch",
              foodId: "chicken-breast"
            }
          }
        })
      );
      await act(async () => fireEvent.press(screen.getByText("Add to diary")));

      expect(addMeal).not.toHaveBeenCalled();
    } finally {
      runtime.__DEV__ = previous;
    }
  });
});
