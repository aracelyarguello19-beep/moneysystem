"use server";

import type { Result } from "@repo/domain";
import { cambiarContrasenaSchema } from "@repo/domain/schemas";
import { getCurrentAccount } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// No usa `withErrorHandling`: "la contraseña actual es incorrecta" necesita
// su propio mensaje accionable — el wrapper genérico lo colapsaría en
// "Ocurrió un error al procesar la operación" (mismo criterio que
// sign-in.ts). Supabase permite `updateUser({ password })` con solo la
// sesión activa, sin pedir la contraseña vigente; se reautentica acá para
// que cambiarla exija conocerla, no solo tener una sesión abierta.
export async function cambiarContrasena(input: unknown): Promise<Result<void>> {
  const requestId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const parsed = cambiarContrasenaSchema.safeParse(input);
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

  const cuenta = await getCurrentAccount();
  if (!cuenta) {
    return {
      ok: false,
      error: { code: "UNAUTHENTICATED", message: "No hay sesión activa.", requestId, timestamp },
    };
  }

  const supabase = await createClient();
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: cuenta.email,
    password: parsed.data.passwordActual,
  });
  if (authError) {
    return {
      ok: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "La contraseña actual es incorrecta.",
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
