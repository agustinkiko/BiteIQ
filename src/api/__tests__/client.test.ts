import { apiRequest } from "@/api/client";
import { ApiError } from "@/api/contracts";
import { authClient } from "@/auth/authClient";

jest.mock("@/auth/authClient", () => ({
  authClient: { getCookie: jest.fn() }
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

describe("apiRequest", () => {
  const fetchMock = jest.fn<Promise<StubResponse>, [RequestInfo | URL, RequestInit?]>();

  beforeEach(() => {
    mockGetCookie.mockReset();
    mockGetCookie.mockReturnValue("better-auth.session_token=session-value");
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("uses the configured API URL and sends the secure session cookie with JSON headers", async () => {
    fetchMock.mockResolvedValue(response(200, { date: "2026-09-08" }));

    await expect(apiRequest<{ date: string }>("/diary/2026-09-08")).resolves.toEqual({
      date: "2026-09-08"
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://biteiq.test/api/diary/2026-09-08");
    const headers = new Headers(options?.headers);
    expect(options?.credentials).toBe("include");
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("cookie")).toBe("better-auth.session_token=session-value");
  });

  it("replaces a lowercase caller cookie in object headers with the secure cookie", async () => {
    fetchMock.mockResolvedValue(response(200, { ok: true }));

    await apiRequest("/profile", {
      headers: { cookie: "caller-cookie=must-not-leak", "X-Request-ID": "request-a" }
    });

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get("cookie")).toBe("better-auth.session_token=session-value");
    expect(headers.get("x-request-id")).toBe("request-a");
  });

  it("replaces a caller cookie in Headers with the secure cookie", async () => {
    fetchMock.mockResolvedValue(response(200, { ok: true }));
    const callerHeaders = new Headers({ COOKIE: "caller-cookie=must-not-leak" });

    await apiRequest("/profile", { headers: callerHeaders });

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get("cookie")).toBe("better-auth.session_token=session-value");
  });

  it("removes every caller cookie when SecureStore has no session cookie", async () => {
    mockGetCookie.mockReturnValue("");
    fetchMock.mockResolvedValue(response(200, { ok: true }));

    await apiRequest("/profile", {
      headers: { Cookie: "caller-cookie=must-not-leak", Accept: "application/problem+json" }
    });

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.has("cookie")).toBe(false);
    expect(headers.get("accept")).toBe("application/problem+json");
  });

  it("maps an unauthorized response to AUTH_REQUIRED", async () => {
    fetchMock.mockResolvedValue(response(401, { message: "private response detail" }));

    await expect(apiRequest("/profile")).rejects.toMatchObject<ApiError>({
      name: "ApiError",
      code: "AUTH_REQUIRED",
      status: 401,
      message: "Sign in to continue.",
      warnings: []
    });
  });

  it("does not log response bodies when a request fails", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    fetchMock.mockResolvedValue(
      response(422, { code: "INVALID_INPUT", message: "private diary response body" })
    );

    await expect(apiRequest("/diary")).rejects.toMatchObject({
      code: "INVALID_INPUT",
      status: 422
    });

    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    log.mockRestore();
    warn.mockRestore();
    error.mockRestore();
  });

  it("preserves structured warning codes from a nested server error", async () => {
    fetchMock.mockResolvedValue(
      response(400, {
        error: {
          code: "INVALID_INPUT",
          message: "Confirm these warnings before saving: LOW_CALORIE_TARGET.",
          warnings: ["LOW_CALORIE_TARGET"]
        }
      })
    );

    await expect(apiRequest("/me", { method: "PATCH", body: "{}" })).rejects.toMatchObject({
      name: "ApiError",
      code: "INVALID_INPUT",
      status: 400,
      message: "Confirm these warnings before saving: LOW_CALORIE_TARGET.",
      warnings: ["LOW_CALORIE_TARGET"]
    });
  });
});
