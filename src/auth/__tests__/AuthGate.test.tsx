import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactElement } from "react";
import { Text } from "react-native";

import { AuthGate, AuthGateSessionState } from "@/auth/AuthGate";
import { authClient } from "@/auth/authClient";
import { clearSignedOutSessionData, clearUserSessionData } from "@/auth/sessionCleanup";
import { LoginScreen } from "@/screens/LoginScreen";
import { useAppStore } from "@/store/useAppStore";
import { useOfflineStore } from "@/store/useOfflineStore";

jest.mock("expo-secure-store", () => ({
  getItem: jest.fn(() => null),
  setItem: jest.fn()
}));

jest.mock("expo-linking", () => ({
  createURL: jest.fn(() => "biteiq://")
}));

const signedOut: AuthGateSessionState = { data: null, isPending: false };
const signedIn: AuthGateSessionState = {
  data: { user: { id: "user-a" } },
  isPending: false
};

function renderGate(state: AuthGateSessionState, hasProfile: boolean) {
  return renderWithQuery(
    <AuthGate
      useSession={() => state}
      hasProfile={hasProfile}
      loadingFallback={<Text>Checking session</Text>}
      signedOutFallback={<Text>Sign in form</Text>}
      profileSetupFallback={<Text>Profile setup</Text>}
    >
      <Text>Private dashboard</Text>
    </AuthGate>
  );
}

function renderWithQuery(element: ReactElement, queryClient = new QueryClient()) {
  return {
    ...render(
      <QueryClientProvider client={queryClient}>{element}</QueryClientProvider>
    ),
    queryClient
  };
}

describe("AuthGate", () => {
  afterEach(() => {
    act(() => {
      useAppStore.setState({ hasCompletedOnboarding: false, serverStateUserId: undefined });
      useOfflineStore.setState({ cachedDays: {}, createsByUser: {} });
    });
  });

  it("shows a loading state while the session is unresolved", () => {
    renderGate({ data: null, isPending: true }, false);

    expect(screen.getByText("Checking session")).toBeTruthy();
    expect(screen.queryByText("Sign in form")).toBeNull();
  });

  it("shows sign in when there is no session", () => {
    renderWithQuery(
      <AuthGate useSession={() => signedOut} hasProfile={false}>
        <Text>Private dashboard</Text>
      </AuthGate>
    );

    expect(screen.getByText("Sign in to continue")).toBeTruthy();
    expect(screen.queryByText("Start tracking")).toBeNull();
  });

  it("shows profile setup for a signed-in user without a profile", () => {
    renderGate(signedIn, false);

    expect(screen.getByText("Profile setup")).toBeTruthy();
    expect(screen.queryByText("Private dashboard")).toBeNull();
  });

  it("shows the app for a signed-in user with a profile", () => {
    renderGate(signedIn, true);

    expect(screen.getByText("Private dashboard")).toBeTruthy();
    expect(screen.queryByText("Profile setup")).toBeNull();
  });

  it("does not treat User A's loaded profile as ready for User B", () => {
    useAppStore.setState({
      hasCompletedOnboarding: true,
      serverStateUserId: "user-a"
    });

    renderWithQuery(
      <AuthGate
        useSession={() => ({ data: { user: { id: "user-b" } }, isPending: false })}
        profileSetupFallback={<Text>Load User B profile</Text>}
      >
        <Text>Private dashboard</Text>
      </AuthGate>
    );

    expect(screen.getByText("Load User B profile")).toBeTruthy();
    expect(screen.queryByText("Private dashboard")).toBeNull();
  });

  it("clears a previous account when the restored session is signed out", async () => {
    const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    useAppStore.setState({
      hasCompletedOnboarding: true,
      serverStateUserId: userA,
      logs: {
        "2026-09-08": { date: "2026-09-08", meals: [], waterMl: 720, exercises: [] }
      },
      chatMessages: [{ id: "chat-a", role: "user", content: "private", createdAt: "2026-09-08T00:00:00.000Z" }]
    });
    useOfflineStore.setState({
      cachedDays: {
        [userA]: {
          "2026-09-08": {
            localDate: "2026-09-08",
            entries: [],
            summary: { calorieTotal: "0.000000", nutrientTotals: {}, goalSnapshot: {} }
          }
        }
      },
      createsByUser: {}
    });
    const queryClient = new QueryClient();
    queryClient.setQueryData(["diary", userA, "2026-09-08"], { private: true });

    renderWithQuery(
      <AuthGate useSession={() => signedOut} signedOutFallback={<Text>Signed out</Text>}>
        <Text>Private dashboard</Text>
      </AuthGate>,
      queryClient
    );

    await waitFor(() => expect(useAppStore.getState().serverStateUserId).toBeUndefined());
    expect(useAppStore.getState().logs).toEqual({});
    expect(useAppStore.getState().chatMessages).toEqual([]);
    expect(useOfflineStore.getState().cachedDays[userA]).toBeUndefined();
    expect(queryClient.getQueryData(["diary", userA, "2026-09-08"])).toBeUndefined();
  });

  it("clears orphaned offline account data when signed out after a cold start", async () => {
    const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    useAppStore.setState({ serverStateUserId: undefined });
    useOfflineStore.setState({
      cachedDays: {
        [userA]: {
          "2026-09-08": {
            localDate: "2026-09-08",
            entries: [],
            summary: { calorieTotal: "0.000000", nutrientTotals: {}, goalSnapshot: {} }
          }
        }
      },
      createsByUser: {}
    });
    const queryClient = new QueryClient();
    queryClient.setQueryData(["diary", userA, "2026-09-08"], { private: true });

    renderWithQuery(
      <AuthGate useSession={() => signedOut} signedOutFallback={<Text>Signed out</Text>}>
        <Text>Private dashboard</Text>
      </AuthGate>,
      queryClient
    );

    await waitFor(() => expect(useOfflineStore.getState().cachedDays).toEqual({}));
    expect(queryClient.getQueryData(["diary", userA, "2026-09-08"])).toBeUndefined();
  });

  it("removes pending mutations when one user's session is cleared", () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { gcTime: Infinity } }
    });
    queryClient.getMutationCache().build(queryClient, {
      mutationKey: ["profile", "user-a"],
      mutationFn: async () => ({ private: true })
    });

    clearUserSessionData(queryClient, "user-a");

    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  });

  it("removes pending mutations when signed-out session data is cleared", () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { gcTime: Infinity } }
    });
    queryClient.getMutationCache().build(queryClient, {
      mutationKey: ["goal", "user-a"],
      mutationFn: async () => ({ private: true })
    });

    clearSignedOutSessionData(queryClient, "user-a");

    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  });

  it("clears the previous live user on a direct account switch without stored profile state", async () => {
    const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    let liveSession: AuthGateSessionState = {
      data: { user: { id: userA } },
      isPending: false
    };
    useAppStore.setState({ serverStateUserId: undefined });
    useOfflineStore.setState({
      cachedDays: {
        [userA]: {
          "2026-09-08": {
            localDate: "2026-09-08",
            entries: [],
            summary: { calorieTotal: "0.000000", nutrientTotals: {}, goalSnapshot: {} }
          }
        }
      },
      createsByUser: {}
    });
    const queryClient = new QueryClient();
    queryClient.setQueryData(["diary", userA, "2026-09-08"], { private: true });
    const rendered = renderWithQuery(
      <AuthGate useSession={() => liveSession} hasProfile>
        <Text>Private dashboard</Text>
      </AuthGate>,
      queryClient
    );

    liveSession = { data: { user: { id: userB } }, isPending: false };
    rendered.rerender(
      <QueryClientProvider client={queryClient}>
        <AuthGate useSession={() => liveSession} hasProfile>
          <Text>Private dashboard</Text>
        </AuthGate>
      </QueryClientProvider>
    );

    await waitFor(() => expect(useOfflineStore.getState().cachedDays[userA]).toBeUndefined());
    expect(queryClient.getQueryData(["diary", userA, "2026-09-08"])).toBeUndefined();
  });
});

describe("LoginScreen", () => {
  it("shows a connection error instead of blaming the password when the API is unavailable", async () => {
    const signIn = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    render(<LoginScreen signIn={signIn} />);
    fireEvent.changeText(screen.getByPlaceholderText("you@example.com"), "user@example.com");
    fireEvent.changeText(screen.getByPlaceholderText("Password"), "test-password");
    fireEvent(screen.getByPlaceholderText("Password"), "submitEditing");
    await waitFor(() => expect(screen.getByText("Could not reach BiteIQ. Check your connection and try again.")).toBeTruthy());
    expect(screen.queryByText("Email or password is incorrect.")).toBeNull();
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("explains rate limiting without reporting incorrect credentials", async () => {
    const signIn = jest.fn().mockResolvedValue({ error: { status: 429 } });
    render(<LoginScreen signIn={signIn} />);
    fireEvent.changeText(screen.getByPlaceholderText("you@example.com"), "user@example.com");
    fireEvent.changeText(screen.getByPlaceholderText("Password"), "test-password");
    fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(screen.getByText("Too many sign-in attempts. Please wait a minute and try again.")).toBeTruthy());
  });
  it("shows one invalid-credential message after a rejected login", async () => {
    const signIn = jest.fn().mockResolvedValue({ error: { status: 401 } });
    render(<LoginScreen signIn={signIn} />);

    fireEvent.changeText(screen.getByPlaceholderText("you@example.com"), "user@example.com");
    fireEvent.changeText(screen.getByPlaceholderText("Password"), "not-the-password");
    fireEvent.press(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getAllByText("Email or password is incorrect.")).toHaveLength(1);
    });
  });

  it("prevents duplicate login submissions while one is pending", async () => {
    let finish!: (result: { error: null }) => void;
    const signIn = jest.fn(
      () => new Promise<{ error: null }>((resolve) => {
        finish = resolve;
      })
    );
    render(<LoginScreen signIn={signIn} />);

    fireEvent.changeText(screen.getByPlaceholderText("you@example.com"), "  user@example.com  ");
    fireEvent.changeText(screen.getByPlaceholderText("Password"), "not-the-password");
    const button = screen.getByRole("button", { name: "Sign in" });
    fireEvent.press(button);
    fireEvent.press(button);

    expect(signIn).toHaveBeenCalledTimes(1);
    expect(signIn).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "not-the-password"
    });

    await act(async () => {
      finish({ error: null });
    });
  });
});

describe("authClient", () => {
  it("sends real email login requests to the server auth route", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "invalid credentials" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      })
    );
    global.fetch = fetchMock as typeof fetch;

    await authClient.signIn.email({
      email: "user@example.com",
      password: "not-the-password"
    });

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://biteiq.test/api/auth/sign-in/email"
    );
  });
});
