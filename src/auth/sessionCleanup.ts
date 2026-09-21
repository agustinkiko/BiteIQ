import { QueryClient } from "@tanstack/react-query";

import { useAppStore } from "@/store/useAppStore";
import { useOfflineStore } from "@/store/useOfflineStore";

/** Removes every local value owned by the departing account. */
export function clearUserSessionData(queryClient: QueryClient, userId: string) {
  queryClient.getMutationCache().clear();
  queryClient.removeQueries({
    predicate: (query) => {
      const root = query.queryKey[0];
      if (root === "diary") return query.queryKey[1] === userId;
      if (root === "profile" || root === "goal") {
        return query.queryKey.length === 1 || query.queryKey[1] === userId;
      }
      return false;
    }
  });
  useOfflineStore.getState().clearUser(userId);
  useAppStore.getState().clearServerSession(userId);
}

/** Clears orphaned account data when there is no authenticated owner. */
export function clearSignedOutSessionData(queryClient: QueryClient, storedUserId?: string) {
  queryClient.getMutationCache().clear();
  queryClient.removeQueries({
    predicate: (query) => {
      const root = query.queryKey[0];
      return root === "diary" || root === "profile" || root === "goal";
    }
  });
  useOfflineStore.getState().clearAllUsers();
  useAppStore.getState().clearServerSession(storedUserId ?? "signed-out");
}
