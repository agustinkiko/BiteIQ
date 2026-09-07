import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";

const storageKey = "biteiq-version-proof_cookie";

class MemorySecureStore {
  private readonly values = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("root Better Auth 1.2.12 Expo transport", () => {
  it("persists, replays, signs out, and rejects the revoked session", async () => {
    const rootBetterAuthPackage = jest.requireActual<{ version: string }>(
      "../../../node_modules/better-auth/package.json",
    );
    const rootExpoPackage = jest.requireActual<{ version: string }>(
      "../../../node_modules/@better-auth/expo/package.json",
    );
    expect(rootBetterAuthPackage.version).toBe("1.2.12");
    expect(rootExpoPackage.version).toBe("1.2.12");

    const baseURL = requiredEnvironment("BITEIQ_COMPAT_BASE_URL");
    const email = requiredEnvironment("BITEIQ_COMPAT_EMAIL");
    const password = requiredEnvironment("BITEIQ_COMPAT_PASSWORD");
    const userId = requiredEnvironment("BITEIQ_COMPAT_USER_ID");
    const storage = new MemorySecureStore();
    const client = createAuthClient({
      baseURL,
      plugins: [
        expoClient({
          scheme: "biteiq",
          storagePrefix: "biteiq-version-proof",
          storage,
          disableCache: true,
        }),
      ],
    });

    const signIn = await client.signIn.email({ email, password });
    expect(signIn.error).toBeNull();
    expect(signIn.data?.user).toMatchObject({ id: userId, email });

    const storedCookie = storage.getItem(storageKey);
    expect(storedCookie).toContain("better-auth.session_token");
    expect(client.getCookie()).toContain("better-auth.session_token=");

    const session = await client.getSession();
    expect(session.error).toBeNull();
    expect(session.data).toMatchObject({
      user: { id: userId, email },
      session: { userId },
    });

    const signOut = await client.signOut();
    expect(signOut.error).toBeNull();
    const signedOutCookie = JSON.parse(storage.getItem(storageKey) ?? "{}");
    expect(signedOutCookie["better-auth.session_token"]?.value).toBe("");

    const signedOutSession = await client.getSession();
    expect(signedOutSession.error).toBeNull();
    expect(signedOutSession.data).toBeNull();

    storage.setItem(storageKey, storedCookie ?? "{}");
    const revokedSession = await client.getSession();
    expect(revokedSession.error).toBeNull();
    expect(revokedSession.data).toBeNull();
  });
});

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}
