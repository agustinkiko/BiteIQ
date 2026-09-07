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
    expect(options).toEqual(
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({
          Accept: "application/json",
          "Content-Type": "application/json",
          Cookie: "better-auth.session_token=session-value"
        })
      })
    );
  });

  it("maps an unauthorized response to AUTH_REQUIRED", async () => {
    fetchMock.mockResolvedValue(response(401, { message: "private response detail" }));

    await expect(apiRequest("/profile")).rejects.toMatchObject<ApiError>({
      name: "ApiError",
      code: "AUTH_REQUIRED",
      status: 401,
      message: "Sign in to continue."
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
});
