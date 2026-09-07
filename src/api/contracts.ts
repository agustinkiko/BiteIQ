export type ApiErrorCode =
  | "AUTH_REQUIRED"
  | "INVALID_INPUT"
  | "FOOD_NOT_FOUND"
  | "NUTRITION_PROVIDER_UNAVAILABLE"
  | "OFFLINE"
  | "CONFIGURATION_ERROR"
  | "API_ERROR";

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiErrorResponse = {
  code?: ApiErrorCode;
  message?: string;
};
