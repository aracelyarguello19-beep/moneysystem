"use server";

import type { Result } from "@repo/domain";
import { restablecerContrasenaSchema } from "@repo/domain/schemas";
import { createClient } from "@/lib/supabase/server";

// No usa `withErrorHandling`: si la sesión de recuperación ya expiró (el
// enlace del email es de un solo uso y vence), la persona necesita el
// mensaje puntual para volver a pedir el enlace, no un genérico "ocurrió un
// error" (mismo criterio que sign-in.ts).
export async function restablecerContrasena(input: unknown): Promise<Result<void>> {
  const requestId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const parsed = restablecerContrasenaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: parsed.error.issues[0]?.message ?? "Datos inválidos.",
        requestId,
        timestamp,
      },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "El enlace de recuperación venció o ya se usó. Pedí uno nuevo.",
        requestId,
        timestamp,
      },
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: "No se pudo actualizar la contraseña. Intentá nuevamente.",
        requestId,
        timestamp,
      },
    };
  }

  return { ok: true, data: undefined };
}
