import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

import { AuthGate, AuthGateSessionState } from "@/auth/AuthGate";
import { authClient } from "@/auth/authClient";
import { LoginScreen } from "@/screens/LoginScreen";

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
  return render(
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

describe("AuthGate", () => {
  it("shows a loading state while the session is unresolved", () => {
    renderGate({ data: null, isPending: true }, false);

    expect(screen.getByText("Checking session")).toBeTruthy();
    expect(screen.queryByText("Sign in form")).toBeNull();
  });

  it("shows sign in when there is no session", () => {
    render(
      <AuthGate useSession={() => signedOut} hasProfile={false}>
        <Text>Private dashboard</Text>
      </AuthGate>
    );

    expect(screen.getByText("Sign in to continue")).toBeTruthy();
    expect(screen.queryByText("Start tracking")).toBeNull();
  });

  it("shows profile setup for a signed-in user without a profile", () => {
    render(
      <AuthGate useSession={() => signedIn} hasProfile={false}>
        <Text>Private dashboard</Text>
      </AuthGate>
    );

    expect(screen.getByText("Start tracking")).toBeTruthy();
    expect(screen.queryByText("Private dashboard")).toBeNull();
  });

  it("shows the app for a signed-in user with a profile", () => {
    renderGate(signedIn, true);

    expect(screen.getByText("Private dashboard")).toBeTruthy();
    expect(screen.queryByText("Profile setup")).toBeNull();
  });
});

describe("LoginScreen", () => {
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
