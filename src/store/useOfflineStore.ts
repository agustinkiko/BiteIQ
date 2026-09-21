import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  CreateDiaryEntry,
  DiaryDay,
  createClientId,
  diaryRepository
} from "@/repositories/diaryRepository";

export type OfflineCreate = {
  clientId: string;
  userId: string;
  date: string;
  input: CreateDiaryEntry & { clientId: string };
  createdAt: string;
};

type OfflineState = {
  hasHydrated: boolean;
  cachedDays: Record<string, Record<string, DiaryDay>>;
  createsByUser: Record<string, OfflineCreate[]>;
  setHasHydrated: (value: boolean) => void;
  getCachedDay: (userId: string, date: string) => DiaryDay | undefined;
  cacheDay: (userId: string, day: DiaryDay) => void;
  enqueueCreate: (
    userId: string,
    date: string,
    input: CreateDiaryEntry
  ) => OfflineCreate;
  flushCreates: (
    userId: string,
    send?: (queued: OfflineCreate) => Promise<DiaryDay>
  ) => Promise<DiaryDay[]>;
  clearUser: (userId: string) => void;
  clearAllUsers: () => void;
};

const flushesByUser = new Map<string, Promise<DiaryDay[]>>();
const userEpochs = new Map<string, number>();

/** Captures the current local lifetime of one authenticated user's data. */
export function captureUserSessionEpoch(userId: string): number {
  const epoch = userEpochs.get(userId) ?? 0;
  userEpochs.set(userId, epoch);
  return epoch;
}

/** False once sign-out or an account switch has cleared this user's data. */
export function isUserSessionEpochCurrent(userId: string, epoch: number): boolean {
  return captureUserSessionEpoch(userId) === epoch;
}

export const useOfflineStore = create<OfflineState>()(
  persist(
    (set, get) => ({
      hasHydrated: false,
      cachedDays: {},
      createsByUser: {},

      setHasHydrated: (value) => set({ hasHydrated: value }),

      getCachedDay: (userId, date) => get().cachedDays[userId]?.[date],

      cacheDay: (userId, day) =>
        set((state) => ({
          cachedDays: {
            ...state.cachedDays,
            [userId]: {
              ...state.cachedDays[userId],
              [day.localDate]: day
            }
          }
        })),

      enqueueCreate: (userId, date, input) => {
        const clientId = input.clientId ?? createClientId();
        const queued: OfflineCreate = {
          clientId,
          userId,
          date,
          input: { ...input, clientId },
          createdAt: new Date().toISOString()
        };
        set((state) => ({
          createsByUser: {
            ...state.createsByUser,
            [userId]: [...(state.createsByUser[userId] ?? []), queued]
          }
        }));
        return queued;
      },

      flushCreates: (userId, send = sendQueuedCreate) => {
        const existing = flushesByUser.get(userId);
        if (existing) return existing;

        const inFlight = (async () => {
          const days: DiaryDay[] = [];
          const queue = [...(get().createsByUser[userId] ?? [])];
          const epoch = captureUserSessionEpoch(userId);
          for (const queued of queue) {
            try {
              const day = await send(queued);
              if (!isUserSessionEpochCurrent(userId, epoch)) break;
              days.push(day);
              get().cacheDay(userId, day);
              set((state) => ({
                createsByUser: {
                  ...state.createsByUser,
                  [userId]: (state.createsByUser[userId] ?? []).filter(
                    (item) => item.clientId !== queued.clientId
                  )
                }
              }));
            } catch {
              // Stop at the first failure so later creates never overtake it.
              break;
            }
          }
          return days;
        })();

        flushesByUser.set(userId, inFlight);
        void inFlight.finally(() => {
          if (flushesByUser.get(userId) === inFlight) flushesByUser.delete(userId);
        });
        return inFlight;
      },

      clearUser: (userId) => {
        userEpochs.set(userId, (userEpochs.get(userId) ?? 0) + 1);
        set((state) => {
          const cachedDays = { ...state.cachedDays };
          const createsByUser = { ...state.createsByUser };
          delete cachedDays[userId];
          delete createsByUser[userId];
          return { cachedDays, createsByUser };
        });
      },

      clearAllUsers: () => {
        const userIds = new Set([
          ...Object.keys(get().cachedDays),
          ...Object.keys(get().createsByUser),
          ...userEpochs.keys()
        ]);
        for (const userId of userIds) {
          userEpochs.set(userId, (userEpochs.get(userId) ?? 0) + 1);
        }
        set({ cachedDays: {}, createsByUser: {} });
      }
    }),
    {
      name: "biteiq-offline-v1",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ cachedDays, createsByUser }) => ({ cachedDays, createsByUser }),
      onRehydrateStorage: () => (state) => {
        if (state) state.setHasHydrated(true);
        else useOfflineStore.setState({ hasHydrated: true });
      }
    }
  )
);

function sendQueuedCreate(queued: OfflineCreate): Promise<DiaryDay> {
  return diaryRepository.createEntry(queued.date, queued.input);
}
