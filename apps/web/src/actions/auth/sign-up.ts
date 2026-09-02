"use server";

import type { Result } from "@repo/domain";
import { signUpSchema } from "@repo/domain/schemas";
import { withRlsContext } from "@repo/database";
import { createClient } from "@/lib/supabase/server";

// El registro espejo en `cuentas` se asegura llamando a la función SQL
// `ensure_cuenta()` (idempotente) — ver migración
// 20260901023000_ensure_cuenta_function. Solo se puede llamar acá si
// signUp() ya dejó una sesión activa (proyecto sin confirmación de email
// obligatoria); si no, se asegura en el primer signIn exitoso (ver
// sign-in.ts) — cubre igual el AC3 ("desde el momento del registro" o,
// como máximo, desde el primer login si el email requiere confirmación).
//
// No usa `withErrorHandling`: "el email ya está registrado" necesita un
// mensaje propio y accionable (decile a la persona que inicie sesión en vez
// de registrarse de nuevo) — el wrapper genérico lo colapsaría en el mismo
// "Ocurrió un error al procesar la operación" que cualquier otra falla,
// dejando a alguien con cuenta ya creada sin forma de entender qué pasa.
export async function signUp(input: unknown): Promise<Result<{ email: string; nombre: string }>> {
  const requestId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const parsed = signUpSchema.parse(input);
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email: parsed.email,
    password: parsed.password,
    options: { data: { nombre: parsed.nombre } },
  });

  if (error) {
    const yaExiste = /already registered|already exists/i.test(error.message);
    return {
      ok: false,
      error: {
        code: yaExiste ? "VALIDATION" : "UNKNOWN",
        message: yaExiste
          ? "Ya existe una cuenta con este email. Iniciá sesión en vez de crear una nueva."
          : "Ocurrió un error al procesar la operación. Intentá nuevamente.",
        requestId,
        timestamp,
      },
    };
  }

  if (data.session && data.user) {
    await withRlsContext(data.user.id, null, async (tx) => {
      await tx.$executeRawUnsafe("select public.ensure_cuenta()");
    });
  }

  return { ok: true, data: { email: parsed.email, nombre: parsed.nombre } };
}
