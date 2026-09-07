import { authClient } from "@/auth/authClient";
import { ApiError, ApiErrorCode, ApiErrorResponse } from "@/api/contracts";

const JSON_HEADERS = {
  Accept: "application/json",
  "Content-Type": "application/json"
};

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const cookie = authClient.getCookie();
  const headers: Record<string, string> = {
    ...JSON_HEADERS,
    ...toHeaderRecord(options.headers)
  };

  if (cookie) {
    headers.Cookie = cookie;
  }

  const response = await fetch(apiUrl(path), {
    ...options,
    credentials: options.credentials ?? "include",
    headers
  });

  if (response.status === 401) {
    throw new ApiError("AUTH_REQUIRED", 401, "Sign in to continue.");
  }

  if (!response.ok) {
    const payload = await readError(response);
    throw new ApiError(
      payload.code ?? "API_ERROR",
      response.status,
      payload.message ?? "BiteIQ could not complete this request."
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function apiUrl(path: string): string {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!baseUrl) {
    throw new ApiError("CONFIGURATION_ERROR", 0, "EXPO_PUBLIC_API_URL is not configured.");
  }

  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function toHeaderRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    const result: Record<string, string> = {};
    headers.forEach((value: string, key: string) => {
      result[key] = value;
    });
    return result;
  }

  return headers as Record<string, string>;
}

async function readError(response: Response): Promise<ApiErrorResponse> {
  try {
    const payload = (await response.json()) as ApiErrorResponse;
    return {
      code: isApiErrorCode(payload.code) ? payload.code : "API_ERROR",
      message: typeof payload.message === "string" ? payload.message : undefined
    };
  } catch {
    return { code: "API_ERROR" };
  }
}

function isApiErrorCode(code: unknown): code is ApiErrorCode {
  return (
    code === "AUTH_REQUIRED" ||
    code === "INVALID_INPUT" ||
    code === "FOOD_NOT_FOUND" ||
    code === "NUTRITION_PROVIDER_UNAVAILABLE" ||
    code === "OFFLINE" ||
    code === "CONFIGURATION_ERROR" ||
    code === "API_ERROR"
  );
}
