import {
  OfflineCreate,
  useOfflineStore
} from "@/store/useOfflineStore";
import { DiaryDay } from "@/repositories/diaryRepository";
import { act, render } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

import { AppReadyGate } from "../../../App";
import { useAppStore } from "@/store/useAppStore";

const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const emptyDay = (localDate: string): DiaryDay => ({
  localDate,
  entries: [],
  summary: { calorieTotal: "0.000000", nutrientTotals: {}, goalSnapshot: {} }
});

const createInput = {
  foodId: "11111111-1111-4111-8111-111111111111",
  servingId: "22222222-2222-4222-8222-222222222222",
  quantity: 1,
  mealType: "lunch" as const,
  consumedAt: "2026-09-08T04:00:00.000Z"
};

describe("useOfflineStore", () => {
  beforeEach(() => {
    useOfflineStore.setState({ hasHydrated: false, cachedDays: {}, createsByUser: {} });
  });

  afterEach(async () => {
    await useOfflineStore.persist.clearStorage();
  });

  it("caches diary days independently for each user", () => {
    useOfflineStore.getState().cacheDay(userA, emptyDay("2026-09-08"));
    useOfflineStore.getState().cacheDay(userB, emptyDay("2026-09-09"));

    expect(useOfflineStore.getState().getCachedDay(userA, "2026-09-08")?.localDate).toBe("2026-09-08");
    expect(useOfflineStore.getState().getCachedDay(userB, "2026-09-09")?.localDate).toBe("2026-09-09");
    expect(useOfflineStore.getState().getCachedDay(userA, "2026-09-09")).toBeUndefined();
  });

  it("queues only creates with one stable client UUID", () => {
    const queued = useOfflineStore.getState().enqueueCreate(userA, "2026-09-08", createInput);

    expect(queued.clientId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(useOfflineStore.getState().createsByUser[userA]).toEqual([queued]);
    expect(queued.input).toEqual({ ...createInput, clientId: queued.clientId });
  });

  it("flushes creates in order, reuses client IDs, and removes each success", async () => {
    const first = useOfflineStore.getState().enqueueCreate(userA, "2026-09-08", createInput);
    const second = useOfflineStore.getState().enqueueCreate(userA, "2026-09-08", {
      ...createInput,
      mealType: "dinner"
    });
    const sent: OfflineCreate[] = [];
    const send = jest.fn(async (queued: OfflineCreate) => {
      sent.push(queued);
      return emptyDay(queued.date);
    });

    await useOfflineStore.getState().flushCreates(userA, send);

    expect(sent.map((item) => item.clientId)).toEqual([first.clientId, second.clientId]);
    expect(send.mock.calls[0]?.[0].input.clientId).toBe(first.clientId);
    expect(send.mock.calls[1]?.[0].input.clientId).toBe(second.clientId);
    expect(useOfflineStore.getState().createsByUser[userA]).toEqual([]);
    expect(useOfflineStore.getState().getCachedDay(userA, "2026-09-08")).toEqual(emptyDay("2026-09-08"));
  });

  it("keeps a failed create and does not send later creates out of order", async () => {
    const first = useOfflineStore.getState().enqueueCreate(userA, "2026-09-08", createInput);
    const second = useOfflineStore.getState().enqueueCreate(userA, "2026-09-08", {
      ...createInput,
      mealType: "dinner"
    });
    const send = jest.fn().mockRejectedValue(new Error("offline"));

    await useOfflineStore.getState().flushCreates(userA, send);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].clientId).toBe(first.clientId);
    expect(useOfflineStore.getState().createsByUser[userA]).toEqual([first, second]);
  });

  it("clears only the user who signed out", () => {
    useOfflineStore.getState().cacheDay(userA, emptyDay("2026-09-08"));
    useOfflineStore.getState().cacheDay(userB, emptyDay("2026-09-08"));
    useOfflineStore.getState().enqueueCreate(userA, "2026-09-08", createInput);
    useOfflineStore.getState().enqueueCreate(userB, "2026-09-08", createInput);

    useOfflineStore.getState().clearUser(userA);

    expect(useOfflineStore.getState().cachedDays[userA]).toBeUndefined();
    expect(useOfflineStore.getState().createsByUser[userA]).toBeUndefined();
    expect(useOfflineStore.getState().cachedDays[userB]?.["2026-09-08"]).toBeDefined();
    expect(useOfflineStore.getState().createsByUser[userB]).toHaveLength(1);
  });

  it("marks hydration complete only after persisted cache and outbox rehydrate", () => {
    const options = useOfflineStore.persist.getOptions();
    const finishHydration = options.onRehydrateStorage?.(useOfflineStore.getState());

    expect(useOfflineStore.getState().hasHydrated).toBe(false);
    finishHydration?.(useOfflineStore.getState(), undefined);
    expect(useOfflineStore.getState().hasHydrated).toBe(true);
  });

  it("keeps startup gated until both app and offline stores hydrate", () => {
    useAppStore.setState({ hasHydrated: true });
    const screen = render(
      React.createElement(
        AppReadyGate,
        null,
        React.createElement(Text, null, "Diary ready")
      )
    );

    expect(screen.queryByText("Diary ready")).toBeNull();
    expect(screen.getByLabelText("Loading saved data")).toBeTruthy();

    act(() => useOfflineStore.setState({ hasHydrated: true }));
    expect(screen.getByText("Diary ready")).toBeTruthy();
  });

  it("shares one in-flight flush per user", async () => {
    const queued = useOfflineStore.getState().enqueueCreate(userA, "2026-09-08", createInput);
    let finish!: (day: DiaryDay) => void;
    const send = jest.fn(
      (_queued: OfflineCreate) => new Promise<DiaryDay>((resolve) => {
        finish = resolve;
      })
    );

    const firstFlush = useOfflineStore.getState().flushCreates(userA, send);
    const secondFlush = useOfflineStore.getState().flushCreates(userA, send);
    await Promise.resolve();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].clientId).toBe(queued.clientId);
    finish(emptyDay("2026-09-08"));
    await Promise.all([firstFlush, secondFlush]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not restore a user's cache after logout during an in-flight flush", async () => {
    useOfflineStore.getState().enqueueCreate(userA, "2026-09-08", createInput);
    let finish!: (day: DiaryDay) => void;
    const send = jest.fn(
      (_queued: OfflineCreate) => new Promise<DiaryDay>((resolve) => {
        finish = resolve;
      })
    );
    const flush = useOfflineStore.getState().flushCreates(userA, send);
    await Promise.resolve();

    useOfflineStore.getState().clearUser(userA);
    finish(emptyDay("2026-09-08"));
    await flush;

    expect(useOfflineStore.getState().cachedDays[userA]).toBeUndefined();
    expect(useOfflineStore.getState().createsByUser[userA]).toBeUndefined();
  });
});
