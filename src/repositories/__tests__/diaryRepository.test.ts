import { authClient } from "@/auth/authClient";
import { clearSignedOutSessionData, clearUserSessionData } from "@/auth/sessionCleanup";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, renderHook, waitFor } from "@testing-library/react-native";
import * as Network from "expo-network";
import React, { PropsWithChildren } from "react";
import {
  OFFLINE_SYNC_INTERVAL_MS,
  noonInTimeZone,
  useOfflineDiaryLifecycle,
  useServerDayLog
} from "@/hooks/useServerDayLog";
import {
  DiaryDay,
  diaryRepository
} from "@/repositories/diaryRepository";
import { useOfflineStore } from "@/store/useOfflineStore";
import { FoodDetailScreen } from "@/screens/FoodDetailScreen";
import { useAppStore } from "@/store/useAppStore";
import { DatabaseFood } from "@/types/domain";

jest.mock("@/auth/authClient", () => ({
  authClient: { getCookie: jest.fn(), useSession: jest.fn() }
}));
jest.mock("expo-network", () => ({ getNetworkStateAsync: jest.fn() }));

const mockGetCookie = authClient.getCookie as jest.MockedFunction<typeof authClient.getCookie>;
const mockUseSession = authClient.useSession as jest.MockedFunction<typeof authClient.useSession>;
const mockGetNetworkState = Network.getNetworkStateAsync as jest.MockedFunction<
  typeof Network.getNetworkStateAsync
>;

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

const diary: DiaryDay = {
  localDate: "2026-09-08",
  entries: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      clientId: "22222222-2222-4222-8222-222222222222",
      userId: "33333333-3333-4333-8333-333333333333",
      mealType: "lunch",
      foodId: "44444444-4444-4444-8444-444444444444",
      foodNameSnapshot: "Chicken breast, cooked",
      brandSnapshot: null,
      sourceSnapshot: {
        provider: "usda",
        externalId: "171077",
        datasetType: "Foundation",
        providerUpdatedAt: null,
        importedAt: "2026-09-08T00:00:00.000Z",
        verificationState: "verified_authoritative",
        attribution: "USDA FoodData Central",
        licenseCategory: null
      },
      servingSnapshot: {
        id: "55555555-5555-4555-8555-555555555555",
        name: "150 g",
        quantity: "150.0000",
        unit: "g",
        gramWeight: "150.0000",
        milliliterVolume: null,
        isDefault: true,
        source: "usda",
        sourceServingId: "150g"
      },
      quantity: "1.0000",
      consumedGrams: "150.0000",
      consumedMilliliters: null,
      calorieSnapshot: "247.500000",
      nutrientSnapshot: {
        protein: { amount: "46.500000", unit: "g" },
        carbohydrate: { amount: "0.000000", unit: "g" },
        fat: { amount: "5.400000", unit: "g" }
      },
      consumedAt: "2026-09-08T04:00:00.000Z",
      createdAt: "2026-09-08T04:00:00.000Z",
      updatedAt: "2026-09-08T04:00:00.000Z"
    }
  ],
  summary: {
    calorieTotal: "247.500000",
    nutrientTotals: {
      protein: { amount: "46.500000", unit: "g" },
      carbohydrate: { amount: "0.000000", unit: "g" },
      fat: { amount: "5.400000", unit: "g" }
    },
    goalSnapshot: {}
  }
};

describe("diaryRepository", () => {
  const fetchMock = jest.fn<Promise<StubResponse>, [RequestInfo | URL, RequestInit?]>();

  beforeEach(() => {
    mockGetCookie.mockReset();
    mockGetCookie.mockReturnValue("better-auth.session_token=session-value");
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("reads only the requested diary date", async () => {
    fetchMock.mockResolvedValue(response(200, { diary }));

    await expect(diaryRepository.getDay("2026-09-08")).resolves.toEqual(diary);

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://biteiq.test/api/diary/2026-09-08");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBeUndefined();
  });

  it("creates with a client UUID and sends no client nutrition", async () => {
    fetchMock.mockResolvedValue(response(200, { diary }));

    const result = await diaryRepository.createEntry("2026-09-08", {
      foodId: "44444444-4444-4444-8444-444444444444",
      servingId: "55555555-5555-4555-8555-555555555555",
      quantity: 1,
      mealType: "lunch",
      consumedAt: "2026-09-08T04:00:00.000Z"
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://biteiq.test/api/diary/2026-09-08/entries");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(body.clientId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(body).toEqual({
      clientId: body.clientId,
      foodId: "44444444-4444-4444-8444-444444444444",
      servingId: "55555555-5555-4555-8555-555555555555",
      quantity: 1,
      mealType: "lunch",
      consumedAt: "2026-09-08T04:00:00.000Z"
    });
    expect(result).toEqual(diary);
  });

  it("uses the supplied client UUID again for a queued retry", async () => {
    fetchMock.mockResolvedValue(response(200, { diary }));
    const clientId = "22222222-2222-4222-8222-222222222222";

    await diaryRepository.createEntry("2026-09-08", {
      clientId,
      foodId: "44444444-4444-4444-8444-444444444444",
      servingId: "55555555-5555-4555-8555-555555555555",
      quantity: 1,
      mealType: "lunch",
      consumedAt: "2026-09-08T04:00:00.000Z"
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).clientId).toBe(clientId);
  });

  it("updates from identifiers and quantity, returning the server replacement day", async () => {
    const replacement = {
      ...diary,
      summary: { ...diary.summary, calorieTotal: "495.000000" }
    };
    fetchMock.mockResolvedValue(response(200, { diary: replacement }));

    const result = await diaryRepository.updateEntry(diary.entries[0].id, {
      foodId: "44444444-4444-4444-8444-444444444444",
      servingId: "55555555-5555-4555-8555-555555555555",
      quantity: 2,
      mealType: "dinner",
      consumedAt: "2026-09-08T10:00:00.000Z",
      calories: 999,
      nutrients: { protein: 999 }
    } as never);

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`https://biteiq.test/api/diary/entries/${diary.entries[0].id}`);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("PATCH");
    expect(body).toEqual({
      foodId: "44444444-4444-4444-8444-444444444444",
      servingId: "55555555-5555-4555-8555-555555555555",
      quantity: 2,
      mealType: "dinner",
      consumedAt: "2026-09-08T10:00:00.000Z"
    });
    expect(result).toEqual(replacement);
  });

  it("returns the replacement day after delete and maps a neutral 404 to null", async () => {
    fetchMock
      .mockResolvedValueOnce(response(200, { diary: { ...diary, entries: [] } }))
      .mockResolvedValueOnce(
        response(404, {
          error: { code: "DIARY_ENTRY_NOT_FOUND", message: "Diary entry not found." }
        })
      );

    await expect(diaryRepository.deleteEntry(diary.entries[0].id)).resolves.toEqual({
      ...diary,
      entries: []
    });
    await expect(diaryRepository.deleteEntry(diary.entries[0].id)).resolves.toBeNull();
  });
});

describe("useServerDayLog", () => {
  const userId = "33333333-3333-4333-8333-333333333333";
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } }
    });
    mockUseSession.mockReturnValue({
      data: { user: { id: userId } },
      isPending: false
    } as ReturnType<typeof authClient.useSession>);
    useAppStore.setState((state) => ({
      ...state,
      user: { ...state.user, timezone: "Asia/Manila" }
    }));
    useOfflineStore.setState({ hasHydrated: true, cachedDays: {}, createsByUser: {} });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    act(() => queryClient.clear());
  });

  function wrapper({ children }: PropsWithChildren) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }

  it("uses the user-and-date query key and caches the synchronized server day", async () => {
    jest.spyOn(diaryRepository, "getDay").mockResolvedValue(diary);

    const hook = renderHook(() => useServerDayLog("2026-09-08"), { wrapper });

    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(["diary", userId, "2026-09-08"])).toEqual(diary);
    expect(useOfflineStore.getState().getCachedDay(userId, "2026-09-08")).toEqual(diary);
  });

  it("does not restore User A's offline cache when a diary read finishes after sign-out", async () => {
    let finishRead!: (day: DiaryDay) => void;
    const getDay = jest.spyOn(diaryRepository, "getDay").mockImplementation(
      () => new Promise<DiaryDay>((resolve) => {
        finishRead = resolve;
      })
    );
    const hook = renderHook(() => useServerDayLog("2026-09-08"), { wrapper });
    await waitFor(() => expect(getDay).toHaveBeenCalledTimes(1));

    act(() => {
      clearUserSessionData(queryClient, userId);
      hook.unmount();
    });
    await act(async () => {
      finishRead(diary);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(queryClient.getQueryData(["diary", userId, "2026-09-08"])).toBeUndefined();
    expect(useOfflineStore.getState().cachedDays[userId]).toBeUndefined();
  });

  it("replaces both query and offline caches with the create response", async () => {
    const replacement = {
      ...diary,
      summary: { ...diary.summary, calorieTotal: "495.000000" }
    };
    jest.spyOn(diaryRepository, "getDay").mockResolvedValue(diary);
    jest.spyOn(diaryRepository, "createEntry").mockResolvedValue(replacement);
    const hook = renderHook(() => useServerDayLog("2026-09-08"), { wrapper });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));

    await act(async () => {
      await hook.result.current.createEntry({
        foodId: "44444444-4444-4444-8444-444444444444",
        servingId: "55555555-5555-4555-8555-555555555555",
        quantity: 2,
        mealType: "lunch"
      });
    });

    expect(queryClient.getQueryData(["diary", userId, "2026-09-08"])).toEqual(replacement);
    expect(useOfflineStore.getState().getCachedDay(userId, "2026-09-08")).toEqual(replacement);
    const sent = (diaryRepository.createEntry as jest.Mock).mock.calls[0]?.[1];
    expect(sent.clientId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(sent).not.toHaveProperty("calories");
    expect(sent).not.toHaveProperty("nutrients");
    expect(sent.consumedAt).toBe("2026-09-08T04:00:00.000Z");
  });

  it("does not restore User A caches when create finishes after sign-out", async () => {
    let finishCreate!: (day: DiaryDay) => void;
    jest.spyOn(diaryRepository, "getDay").mockResolvedValue(diary);
    jest.spyOn(diaryRepository, "createEntry").mockImplementation(
      () => new Promise<DiaryDay>((resolve) => {
        finishCreate = resolve;
      })
    );
    const hook = renderHook(() => useServerDayLog("2026-09-08"), { wrapper });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));

    let create!: ReturnType<typeof hook.result.current.createEntry>;
    act(() => {
      create = hook.result.current.createEntry({
        foodId: diary.entries[0].foodId!,
        servingId: diary.entries[0].servingSnapshot.id,
        quantity: 1,
        mealType: "lunch"
      });
    });
    act(() => {
      clearUserSessionData(queryClient, userId);
      hook.unmount();
    });
    await act(async () => {
      finishCreate(diary);
      await create;
    });

    expect(queryClient.getQueryData(["diary", userId, "2026-09-08"])).toBeUndefined();
    expect(useOfflineStore.getState().cachedDays[userId]).toBeUndefined();
  });

  it("invalidates a late create when sign-out starts with no stored offline data", async () => {
    const uncachedUserId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    mockUseSession.mockReturnValue({
      data: { user: { id: uncachedUserId } },
      isPending: false
    } as ReturnType<typeof authClient.useSession>);
    useOfflineStore.setState({ hasHydrated: false, cachedDays: {}, createsByUser: {} });
    let finishCreate!: (day: DiaryDay) => void;
    jest.spyOn(diaryRepository, "createEntry").mockImplementation(
      () => new Promise<DiaryDay>((resolve) => {
        finishCreate = resolve;
      })
    );
    const hook = renderHook(() => useServerDayLog("2026-09-08"), { wrapper });

    const create = hook.result.current.createEntry({
      foodId: diary.entries[0].foodId!,
      servingId: diary.entries[0].servingSnapshot.id,
      quantity: 1,
      mealType: "lunch"
    });
    act(() => {
      clearSignedOutSessionData(queryClient);
      hook.unmount();
    });
    await act(async () => {
      finishCreate(diary);
      await create;
    });

    expect(queryClient.getQueryData(["diary", uncachedUserId, "2026-09-08"])).toBeUndefined();
    expect(useOfflineStore.getState().cachedDays[uncachedUserId]).toBeUndefined();
  });

  it("does not restore User A caches when update finishes after User B becomes active", async () => {
    const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const userBDay: DiaryDay = {
      ...diary,
      entries: [],
      summary: { calorieTotal: "0.000000", nutrientTotals: {}, goalSnapshot: {} }
    };
    let finishUpdate!: (day: DiaryDay) => void;
    jest.spyOn(diaryRepository, "getDay")
      .mockResolvedValueOnce(diary)
      .mockResolvedValue(userBDay);
    jest.spyOn(diaryRepository, "updateEntry").mockImplementation(
      () => new Promise<DiaryDay>((resolve) => {
        finishUpdate = resolve;
      })
    );
    const hook = renderHook(() => useServerDayLog("2026-09-08"), { wrapper });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));

    let update!: ReturnType<typeof hook.result.current.updateEntry>;
    act(() => {
      update = hook.result.current.updateEntry(diary.entries[0].id, {
        foodId: diary.entries[0].foodId!,
        servingId: diary.entries[0].servingSnapshot.id,
        quantity: 2,
        mealType: "dinner"
      });
    });
    mockUseSession.mockReturnValue({
      data: { user: { id: userB } },
      isPending: false
    } as ReturnType<typeof authClient.useSession>);
    act(() => {
      clearUserSessionData(queryClient, userId);
      hook.rerender(undefined);
    });
    await waitFor(() => expect(queryClient.getQueryData(["diary", userB, "2026-09-08"])).toEqual(userBDay));
    await act(async () => {
      finishUpdate(diary);
      await update;
    });

    expect(queryClient.getQueryData(["diary", userId, "2026-09-08"])).toBeUndefined();
    expect(useOfflineStore.getState().cachedDays[userId]).toBeUndefined();
    expect(queryClient.getQueryData(["diary", userB, "2026-09-08"])).toEqual(userBDay);
    expect(useOfflineStore.getState().getCachedDay(userB, "2026-09-08")).toEqual(userBDay);
  });

  it("does not restore User A caches when delete finishes after sign-out", async () => {
    let finishDelete!: (day: DiaryDay) => void;
    jest.spyOn(diaryRepository, "getDay").mockResolvedValue(diary);
    jest.spyOn(diaryRepository, "deleteEntry").mockImplementation(
      () => new Promise<DiaryDay>((resolve) => {
        finishDelete = resolve;
      })
    );
    const hook = renderHook(() => useServerDayLog("2026-09-08"), { wrapper });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));

    let deletion!: ReturnType<typeof hook.result.current.deleteEntry>;
    act(() => {
      deletion = hook.result.current.deleteEntry(diary.entries[0].id);
    });
    act(() => {
      clearUserSessionData(queryClient, userId);
      hook.unmount();
    });
    await act(async () => {
      finishDelete({ ...diary, entries: [] });
      await deletion;
    });

    expect(queryClient.getQueryData(["diary", userId, "2026-09-08"])).toBeUndefined();
    expect(useOfflineStore.getState().cachedDays[userId]).toBeUndefined();
  });

  it("does not queue a late failed create after sign-out", async () => {
    let failCreate!: (error: Error) => void;
    jest.spyOn(diaryRepository, "getDay").mockResolvedValue(diary);
    jest.spyOn(diaryRepository, "createEntry").mockImplementation(
      () => new Promise<DiaryDay>((_resolve, reject) => {
        failCreate = reject;
      })
    );
    const hook = renderHook(() => useServerDayLog("2026-09-08"), { wrapper });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));

    const create = hook.result.current.createEntry({
      foodId: diary.entries[0].foodId!,
      servingId: diary.entries[0].servingSnapshot.id,
      quantity: 1,
      mealType: "lunch"
    });
    act(() => {
      clearUserSessionData(queryClient, userId);
      hook.unmount();
    });
    failCreate(new TypeError("Network request failed"));

    await expect(create).rejects.toThrow("Network request failed");
    expect(useOfflineStore.getState().createsByUser[userId]).toBeUndefined();
  });

  it("uses User B's reloaded profile timezone for User B's diary mutation", async () => {
    useAppStore.setState((state) => ({
      hasCompletedOnboarding: true,
      serverStateUserId: userId,
      user: { ...state.user, id: userId, timezone: "America/Los_Angeles" }
    }));
    jest.spyOn(diaryRepository, "getDay").mockResolvedValue(diary);
    const create = jest.spyOn(diaryRepository, "createEntry").mockResolvedValue(diary);
    const hook = renderHook(() => useServerDayLog("2026-09-08"), { wrapper });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));

    await act(async () => {
      await hook.result.current.createEntry({
        foodId: diary.entries[0].foodId!,
        servingId: diary.entries[0].servingSnapshot.id,
        quantity: 1,
        mealType: "lunch"
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(create.mock.calls[0]?.[1].consumedAt).toBe("2026-09-08T19:00:00.000Z");
  });

  it("waits for offline hydration and reacts when cached state becomes ready", async () => {
    useOfflineStore.setState({ hasHydrated: false, cachedDays: {}, createsByUser: {} });
    const getDay = jest.spyOn(diaryRepository, "getDay").mockResolvedValue(diary);
    const hook = renderHook(() => useServerDayLog("2026-09-08"), { wrapper });

    expect(getDay).not.toHaveBeenCalled();
    expect(hook.result.current.day).toBeUndefined();

    act(() => {
      useOfflineStore.setState({
        hasHydrated: true,
        cachedDays: { [userId]: { "2026-09-08": diary } }
      });
    });

    expect(hook.result.current.day).toEqual(diary);
    await waitFor(() => expect(getDay).toHaveBeenCalledTimes(1));
  });

  it("blocks offline edit and delete with the required message", async () => {
    jest.spyOn(diaryRepository, "getDay").mockResolvedValue(diary);
    jest.spyOn(diaryRepository, "updateEntry").mockRejectedValue(new TypeError("Network request failed"));
    jest.spyOn(diaryRepository, "deleteEntry").mockRejectedValue(new TypeError("Network request failed"));
    const hook = renderHook(() => useServerDayLog("2026-09-08"), { wrapper });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));

    await expect(
      hook.result.current.updateEntry(diary.entries[0].id, {
        foodId: diary.entries[0].foodId!,
        servingId: diary.entries[0].servingSnapshot.id,
        quantity: 2,
        mealType: "lunch"
      })
    ).rejects.toThrow("Reconnect to edit or delete this entry.");
    await expect(hook.result.current.deleteEntry(diary.entries[0].id)).rejects.toThrow(
      "Reconnect to edit or delete this entry."
    );
  });
});

describe("offline diary lifecycle", () => {
  const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.useFakeTimers();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } }
    });
    useOfflineStore.setState({ hasHydrated: true, cachedDays: {}, createsByUser: {} });
    mockGetNetworkState.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    act(() => queryClient.clear());
  });

  function wrapper({ children }: PropsWithChildren) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }

  it("retries queued creates in order when connectivity returns", async () => {
    const queued = useOfflineStore.getState().enqueueCreate(userA, "2026-09-08", {
      foodId: diary.entries[0].foodId!,
      servingId: diary.entries[0].servingSnapshot.id,
      quantity: 1,
      mealType: "lunch",
      consumedAt: "2026-09-08T04:00:00.000Z"
    });
    mockGetNetworkState
      .mockResolvedValueOnce({ isConnected: false, isInternetReachable: false } as Network.NetworkState)
      .mockResolvedValue({ isConnected: true, isInternetReachable: true } as Network.NetworkState);
    const create = jest.spyOn(diaryRepository, "createEntry").mockResolvedValue(diary);

    renderHook(() => useOfflineDiaryLifecycle(userA), { wrapper });
    await act(async () => undefined);
    expect(create).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(OFFLINE_SYNC_INTERVAL_MS);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith("2026-09-08", queued.input);
    expect(useOfflineStore.getState().createsByUser[userA]).toEqual([]);
    expect(queryClient.getQueryData(["diary", userA, "2026-09-08"])).toEqual(diary);
  });

  it("clears User A server state and caches before User B becomes active", () => {
    mockGetNetworkState.mockResolvedValue({
      isConnected: false,
      isInternetReachable: false
    } as Network.NetworkState);
    queryClient.setQueryData(["diary", userA, "2026-09-08"], diary);
    queryClient.setQueryData(["diary", userB, "2026-09-08"], diary);
    queryClient.setQueryData(["profile", userA], { timezone: "Asia/Manila" });
    queryClient.setQueryData(["goal", userA], { calorieTargetKcal: "1800" });
    queryClient.setQueryData(["profile"], { timezone: "Asia/Manila" });
    queryClient.setQueryData(["goal"], { calorieTargetKcal: "1800" });
    queryClient.setQueryData(["profile", userB], { timezone: "America/Los_Angeles" });
    queryClient.setQueryData(["goal", userB], { calorieTargetKcal: "2200" });
    queryClient.setQueryData(["foods", "chicken"], []);
    useOfflineStore.getState().cacheDay(userA, diary);
    useOfflineStore.getState().cacheDay(userB, diary);
    useAppStore.setState((state) => ({
      hasCompletedOnboarding: true,
      serverStateUserId: userA,
      user: { ...state.user, id: userA, name: "Alice", timezone: "Asia/Manila" }
    }));
    const hook = renderHook(
      ({ userId }) => useOfflineDiaryLifecycle(userId),
      { wrapper, initialProps: { userId: userA } }
    );

    hook.rerender({ userId: userB });

    expect(queryClient.getQueryData(["diary", userA, "2026-09-08"])).toBeUndefined();
    expect(queryClient.getQueryData(["diary", userB, "2026-09-08"])).toEqual(diary);
    expect(queryClient.getQueryData(["profile", userA])).toBeUndefined();
    expect(queryClient.getQueryData(["goal", userA])).toBeUndefined();
    expect(queryClient.getQueryData(["profile"])).toBeUndefined();
    expect(queryClient.getQueryData(["goal"])).toBeUndefined();
    expect(queryClient.getQueryData(["profile", userB])).toEqual({ timezone: "America/Los_Angeles" });
    expect(queryClient.getQueryData(["goal", userB])).toEqual({ calorieTargetKcal: "2200" });
    expect(queryClient.getQueryData(["foods", "chicken"])).toEqual([]);
    expect(useOfflineStore.getState().cachedDays[userA]).toBeUndefined();
    expect(useOfflineStore.getState().cachedDays[userB]?.["2026-09-08"]).toEqual(diary);
    expect(useAppStore.getState().hasCompletedOnboarding).toBe(false);
    expect(useAppStore.getState().serverStateUserId).toBeUndefined();
    expect(useAppStore.getState().user.timezone).toBe("local");
  });
});

describe("profile-time-zone diary timestamps", () => {
  it("represents noon in Asia/Manila independently of device timezone", () => {
    expect(noonInTimeZone("2026-09-08", "Asia/Manila")).toBe("2026-09-08T04:00:00.000Z");
  });

  it("represents noon in America/Los_Angeles independently of device timezone", () => {
    expect(noonInTimeZone("2026-09-08", "America/Los_Angeles")).toBe(
      "2026-09-08T19:00:00.000Z"
    );
  });
});

describe("FoodDetailScreen server edit", () => {
  const userId = "33333333-3333-4333-8333-333333333333";
  const food: DatabaseFood = {
    id: diary.entries[0].foodId!,
    name: diary.entries[0].foodNameSnapshot,
    category: "protein",
    verified: true,
    source: "usda",
    dataQuality: "verified_authoritative",
    nutritionBasisUnit: "g",
    per100g: {
      calories: 165,
      proteinGrams: 31,
      carbGrams: 0,
      fatGrams: 3.6
    },
    servings: [
      {
        id: diary.entries[0].servingSnapshot.id,
        label: diary.entries[0].servingSnapshot.name,
        grams: 150,
        unit: "g",
        quantity: 150,
        isDefault: true,
        source: "usda"
      }
    ]
  };

  let queryClient: QueryClient;
  const navigation = { goBack: jest.fn(), navigate: jest.fn() };
  const route = {
    key: "food-detail-edit",
    name: "FoodDetail" as const,
    params: {
      mode: "edit" as const,
      date: "2026-09-08",
      mealType: "lunch" as const,
      mealId: diary.entries[0].id,
      entryId: diary.entries[0].id,
      foodId: diary.entries[0].foodId!
    }
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false }
      }
    });
    queryClient.setQueryData(["diary", userId, "2026-09-08"], diary);
    mockUseSession.mockReturnValue({
      data: { user: { id: userId } },
      isPending: false
    } as ReturnType<typeof authClient.useSession>);
    useOfflineStore.setState({
      cachedDays: { [userId]: { "2026-09-08": diary } },
      createsByUser: {}
    });
    useAppStore.setState({
      logs: {},
      cachedFoods: { [food.id]: food },
      user: { ...useAppStore.getState().user, timezone: "Asia/Manila" }
    });
    navigation.goBack.mockReset();
    navigation.navigate.mockReset();
    jest.spyOn(diaryRepository, "getDay").mockResolvedValue(diary);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    act(() => queryClient.clear());
  });

  it("sends only server identifiers, quantity, meal, and consumed time on edit", async () => {
    const replacement: DiaryDay = {
      ...diary,
      entries: [
        {
          ...diary.entries[0],
          mealType: "dinner",
          quantity: "2.0000",
          calorieSnapshot: "495.000000",
          updatedAt: "2026-09-08T05:00:00.000Z"
        }
      ],
      summary: { ...diary.summary, calorieTotal: "495.000000" }
    };
    const update = jest.spyOn(diaryRepository, "updateEntry").mockResolvedValue(replacement);
    const screen = render(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(FoodDetailScreen, {
          navigation: navigation as never,
          route
        })
      )
    );

    await waitFor(() => expect(screen.getByText("Save changes")).toBeTruthy());
    fireEvent.press(screen.getByText("2"));
    fireEvent.press(screen.getByText("Dinner"));
    fireEvent.press(screen.getByText("Save changes"));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const [entryId, payload] = update.mock.calls[0];
    expect(entryId).toBe(diary.entries[0].id);
    expect(payload).toEqual({
      foodId: diary.entries[0].foodId,
      servingId: diary.entries[0].servingSnapshot.id,
      quantity: 2,
      mealType: "dinner",
      consumedAt: "2026-09-08T04:00:00.000Z"
    });
    expect(Object.keys(payload).sort()).toEqual([
      "consumedAt",
      "foodId",
      "mealType",
      "quantity",
      "servingId"
    ]);
    await waitFor(() => expect(navigation.goBack).toHaveBeenCalledTimes(1));
    expect(queryClient.getQueryData(["diary", userId, "2026-09-08"])).toEqual(replacement);
    expect(useOfflineStore.getState().getCachedDay(userId, "2026-09-08")).toEqual(replacement);
  });

  it("keeps the editor open and shows the exact reconnect message offline", async () => {
    jest.spyOn(diaryRepository, "updateEntry").mockRejectedValue(new TypeError("Network request failed"));
    const screen = render(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(FoodDetailScreen, {
          navigation: navigation as never,
          route
        })
      )
    );

    await waitFor(() => expect(screen.getByText("Save changes")).toBeTruthy());
    fireEvent.press(screen.getByText("Save changes"));

    await waitFor(() => expect(screen.getByRole("alert").props.children).toBe("Reconnect to edit or delete this entry."));
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});
