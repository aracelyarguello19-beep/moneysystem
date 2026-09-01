// [Source: architecture/error-handling-strategy.md#Error Response Format]

export interface ApiError {
  code:
    | "VALIDATION"
    | "UNAUTHENTICATED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "DATABASE_ERROR"
    | "UNKNOWN";
  message: string;
  details?: Record<string, unknown>;
  requestId: string;
  timestamp: string;
}

export type Result<T, E = ApiError> = { ok: true; data: T } | { ok: false; error: E };

export function ok<T>(data: T): Result<T, never> {
  return { ok: true, data };
}

export function err<E = ApiError>(error: E): Result<never, E> {
  return { ok: false, error };
}
