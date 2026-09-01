import type { Result } from "@repo/domain";
import { ZodError } from "zod";

// [Source: architecture/error-handling-strategy.md#Backend Error Handling]
// Nota: la arquitectura documenta `Sentry.captureException` acá — Sentry
// todavía no está provisionado en ninguna story (no hay DSN/cuenta), así
// que por ahora se loguea estructurado a `console.error` (Tech Stack:
// "Logging: console.* estructurado (JSON) capturado por Vercel Log Drains").
// Reemplazar por Sentry en la story que lo provisione.
export function withErrorHandling<Args extends unknown[], T>(
  fn: (...args: Args) => Promise<T>
) {
  return async (...args: Args): Promise<Result<T>> => {
    const requestId = crypto.randomUUID();
    try {
      return { ok: true, data: await fn(...args) };
    } catch (e) {
      console.error(
        JSON.stringify({
          level: "error",
          requestId,
          message: e instanceof Error ? e.message : "Unknown error",
        })
      );
      return {
        ok: false,
        error: {
          code: e instanceof ZodError ? "VALIDATION" : "DATABASE_ERROR",
          message: "Ocurrió un error al procesar la operación. Intentá nuevamente.",
          requestId,
          timestamp: new Date().toISOString(),
        },
      };
    }
  };
}
