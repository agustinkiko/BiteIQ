import { authClient } from "@/auth/authClient";
import { ApiError, ApiErrorCode, ApiErrorResponse } from "@/api/contracts";

const JSON_HEADERS = {
  Accept: "application/json",
  "Content-Type": "application/json"
};

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const cookie = authClient.getCookie();
  const headers = new Headers(JSON_HEADERS);
  const callerHeaders = new Headers(options.headers);

  callerHeaders.forEach((value: string, key: string) => {
    headers.set(key, value);
  });

  headers.delete("cookie");

  if (cookie) {
    headers.set("cookie", cookie);
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
      payload.message ?? "BiteIQ could not complete this request.",
      payload.warnings
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

async function readError(response: Response): Promise<ApiErrorResponse> {
  try {
    const payload = (await response.json()) as ApiErrorResponse;
    const detail = payload.error ?? payload;
    return {
      code: isApiErrorCode(detail.code) ? detail.code : "API_ERROR",
      message: typeof detail.message === "string" ? detail.message : undefined,
      warnings: Array.isArray(detail.warnings)
        ? detail.warnings.filter((warning): warning is string => typeof warning === "string")
        : []
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
